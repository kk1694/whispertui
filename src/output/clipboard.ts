/**
 * Clipboard Output Module
 *
 * Copies text to clipboard via wl-copy (Wayland clipboard).
 * Handles special characters and provides graceful error handling.
 */

import { spawn, type ChildProcess } from "node:child_process";

/** Error when wl-copy binary is not found */
export class WlCopyNotFoundError extends Error {
  constructor() {
    super(
      "wl-copy not found. Please install wl-clipboard:\n" +
        "  Arch Linux: pacman -S wl-clipboard\n" +
        "  Ubuntu/Debian: apt install wl-clipboard\n" +
        "  Fedora: dnf install wl-clipboard"
    );
    this.name = "WlCopyNotFoundError";
  }
}

/** Error when clipboard operation fails */
export class ClipboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClipboardError";
  }
}

/**
 * Copy text to clipboard using wl-copy
 *
 * @param text - Text to copy to clipboard
 * @throws {WlCopyNotFoundError} If wl-copy is not installed
 * @throws {ClipboardError} If clipboard operation fails
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Handle empty text gracefully - copy empty string to clipboard
  // This clears the clipboard, which is valid behavior

  return new Promise((resolve, reject) => {
    let proc: ChildProcess;

    try {
      // wl-copy reads from stdin
      proc = spawn("wl-copy", [], {
        stdio: ["pipe", "ignore", "pipe"],
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(new WlCopyNotFoundError());
        return;
      }
      reject(new ClipboardError(`Failed to start wl-copy: ${err.message}`));
      return;
    }

    let stderrOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new WlCopyNotFoundError());
      } else {
        reject(new ClipboardError(`Clipboard operation failed: ${error.message}`));
      }
    });

    proc.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderrOutput.trim() || `wl-copy exited with code ${code}, signal ${signal}`;
        reject(new ClipboardError(errorMsg));
      }
    });

    // Write text to stdin and close
    if (proc.stdin) {
      proc.stdin.write(text);
      proc.stdin.end();
    } else {
      reject(new ClipboardError("Failed to write to wl-copy stdin"));
    }
  });
}

/**
 * Check if wl-copy is available on the system
 */
export async function checkWlCopyAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("wl-copy", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", (code) => {
      // wl-copy --version returns 0 on success
      resolve(code === 0);
    });
  });
}
