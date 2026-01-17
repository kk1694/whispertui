/**
 * Auto-Type Output Module
 *
 * Types text into the focused window via wtype (Wayland).
 * Falls back to clipboard-only when wtype fails.
 */

import { spawn, type ChildProcess } from "node:child_process";

/** Error when wtype binary is not found */
export class WtypeNotFoundError extends Error {
  constructor() {
    super(
      "wtype not found. Please install wtype:\n" +
        "  Arch Linux: pacman -S wtype\n" +
        "  Ubuntu/Debian: apt install wtype\n" +
        "  Fedora: dnf install wtype"
    );
    this.name = "WtypeNotFoundError";
  }
}

/** Error when wtype operation fails */
export class TyperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TyperError";
  }
}

/** Options for typing text */
export interface TypeOptions {
  /** Delay between keystrokes in milliseconds (default: 0) */
  delay?: number;
}

/**
 * Type text into focused window using wtype
 *
 * @param text - Text to type
 * @param options - Typing options
 * @throws {WtypeNotFoundError} If wtype is not installed
 * @throws {TyperError} If typing operation fails
 */
export async function typeText(text: string, options?: TypeOptions): Promise<void> {
  // Handle empty text gracefully - nothing to type
  if (!text) {
    return;
  }

  const delay = options?.delay ?? 0;

  return new Promise((resolve, reject) => {
    let proc: ChildProcess;

    // wtype arguments
    // -d: delay between keystrokes in milliseconds
    // Text is passed via stdin with - argument
    const args: string[] = [];
    if (delay > 0) {
      args.push("-d", delay.toString());
    }
    // Use stdin mode by passing "-" as the text source
    args.push("-");

    try {
      proc = spawn("wtype", args, {
        stdio: ["pipe", "ignore", "pipe"],
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(new WtypeNotFoundError());
        return;
      }
      reject(new TyperError(`Failed to start wtype: ${err.message}`));
      return;
    }

    let stderrOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new WtypeNotFoundError());
      } else {
        reject(new TyperError(`wtype operation failed: ${error.message}`));
      }
    });

    proc.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderrOutput.trim() || `wtype exited with code ${code}, signal ${signal}`;
        reject(new TyperError(errorMsg));
      }
    });

    // Write text to stdin and close
    if (proc.stdin) {
      proc.stdin.write(text);
      proc.stdin.end();
    } else {
      reject(new TyperError("Failed to write to wtype stdin"));
    }
  });
}

/**
 * Check if wtype is available on the system
 */
export async function checkWtypeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    // wtype doesn't have --version, so we just try to run it with --help
    const proc = spawn("wtype", ["--help"], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", () => {
      // wtype --help returns non-zero but still indicates wtype exists
      // Just check that the process spawned successfully
      resolve(true);
    });
  });
}
