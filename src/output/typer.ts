/**
 * Auto-Type Output Module
 *
 * Types text into the focused window via wtype (Wayland).
 * Falls back to clipboard-only when wtype fails.
 *
 * Note: Uses explicit -k space for spaces to work around issues
 * where spaces are dropped in non-terminal daemon environments.
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
  /** Delay between keystrokes in milliseconds (default: 12) */
  delay?: number;
}

/**
 * Build wtype arguments that use explicit -k space for spaces
 * This avoids issues with space handling in different environments
 */
function buildWtypeArgs(text: string, delay: number): string[] {
  const args: string[] = [];

  if (delay > 0) {
    args.push("-d", String(delay));
  }

  // Split text by spaces and interleave with -k space
  const parts = text.split(" ");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part && part.length > 0) {
      args.push(part);
    }
    if (i < parts.length - 1) {
      args.push("-k", "space");
    }
  }

  return args;
}

/**
 * Type text into focused window using wtype
 *
 * Uses explicit -k space for spaces to work around space dropping issues
 * when daemon runs from non-terminal environments.
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

  const delay = options?.delay ?? 12;
  const args = buildWtypeArgs(text, delay);

  return new Promise((resolve, reject) => {
    let proc: ChildProcess;

    try {
      proc = spawn("wtype", args, {
        stdio: ["ignore", "ignore", "pipe"],
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
