/**
 * Auto-Type Output Module
 *
 * Types text into the focused window via wtype (Wayland).
 * Falls back to clipboard-only when wtype fails.
 *
 * Note: Uses temp file + shell pipe to work around Bun compiled binary issue
 * where spaces are dropped when passing text as spawn() arguments.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  /** Pre-existing file to pipe from (avoids temp file creation) */
  sourceFile?: string;
}

/**
 * Type text into focused window using wtype
 *
 * Uses temp file + shell pipe to work around Bun compiled binary issue
 * where spaces are dropped when passing text as spawn() arguments.
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
  const sourceFile = options?.sourceFile;

  // Use provided file or create temp file
  let textFile: string;
  let shouldCleanup = false;

  if (sourceFile) {
    textFile = sourceFile;
  } else {
    // Write text to temp file to avoid spawn argument issues in compiled Bun binaries
    textFile = join(tmpdir(), `wtype-${process.pid}-${Date.now()}.txt`);
    try {
      writeFileSync(textFile, text, "utf-8");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      throw new TyperError(`Failed to write temp file: ${err.message}`);
    }
    shouldCleanup = true;
  }

  // Build shell command to pipe file to wtype stdin
  const delayArg = delay > 0 ? `-d ${delay} ` : "";
  const cmd = `cat "${textFile}" | wtype ${delayArg}-`;

  return new Promise((resolve, reject) => {
    let proc: ChildProcess;

    try {
      proc = spawn("sh", ["-c", cmd], {
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (error) {
      // Clean up temp file only if we created it
      if (shouldCleanup) {
        try { unlinkSync(textFile); } catch {}
      }

      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(new WtypeNotFoundError());
        return;
      }
      reject(new TyperError(`Failed to start shell: ${err.message}`));
      return;
    }

    let stderrOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      // Clean up temp file only if we created it
      if (shouldCleanup) {
        try { unlinkSync(textFile); } catch {}
      }

      if (error.code === "ENOENT") {
        reject(new WtypeNotFoundError());
      } else {
        reject(new TyperError(`wtype operation failed: ${error.message}`));
      }
    });

    proc.on("exit", (code, signal) => {
      // Clean up temp file only if we created it
      if (shouldCleanup) {
        try { unlinkSync(textFile); } catch {}
      }

      if (code === 0) {
        resolve();
      } else {
        // Check if wtype was not found (shell returns 127 for command not found)
        if (code === 127 && stderrOutput.includes("wtype")) {
          reject(new WtypeNotFoundError());
        } else {
          const errorMsg = stderrOutput.trim() || `wtype exited with code ${code}, signal ${signal}`;
          reject(new TyperError(errorMsg));
        }
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
