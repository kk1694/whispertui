/**
 * Auto-Type Output Module
 *
 * Types text into the focused window via wtype (Wayland) or ydotool (uinput).
 * Falls back to clipboard-only when typing fails.
 *
 * Note: wtype uses explicit -k space for spaces to work around issues
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

/** Error when ydotool binary is not found */
export class YdotoolNotFoundError extends Error {
  constructor() {
    super(
      "ydotool not found. Please install ydotool:\n" +
        "  Arch Linux: pacman -S ydotool\n" +
        "  Ubuntu/Debian: apt install ydotool\n" +
        "  Fedora: dnf install ydotool\n" +
        "\n" +
        "Note: ydotool requires the daemon to be running:\n" +
        "  systemctl --user enable --now ydotool"
    );
    this.name = "YdotoolNotFoundError";
  }
}

/** Error when typing operation fails */
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
  /** Typing method: "wtype", "ydotool" (default: "ydotool") */
  method?: "wtype" | "ydotool";
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
 * Type text using wtype (Wayland compositor)
 */
async function typeWithWtype(text: string, delay: number): Promise<void> {
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
 * Type text using ydotool (kernel uinput)
 * Uses clipboard + Ctrl+V for instant paste instead of character-by-character typing
 */
async function typeWithYdotool(text: string, _delay: number): Promise<void> {
  // First, copy text to clipboard using wl-copy
  await copyToClipboardInternal(text);

  // Then simulate Ctrl+V using ydotool key
  // Key codes: 29 = Left Ctrl, 47 = V
  // Format: keycode:pressed (1=down, 0=up)
  const args = ["key", "29:1", "47:1", "47:0", "29:0"];

  return new Promise((resolve, reject) => {
    let proc: ChildProcess;

    try {
      proc = spawn("ydotool", args, {
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        reject(new YdotoolNotFoundError());
        return;
      }
      reject(new TyperError(`Failed to start ydotool: ${err.message}`));
      return;
    }

    let stderrOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new YdotoolNotFoundError());
      } else {
        reject(new TyperError(`ydotool operation failed: ${error.message}`));
      }
    });

    proc.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderrOutput.trim() || `ydotool exited with code ${code}, signal ${signal}`;
        reject(new TyperError(errorMsg));
      }
    });
  });
}

/**
 * Internal clipboard copy for ydotool paste simulation
 * Spawns wl-copy detached so forked clipboard server doesn't keep Node.js alive
 */
async function copyToClipboardInternal(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("wl-copy", ["--"], {
      stdio: ["pipe", "ignore", "pipe"],
      detached: true,
    });

    // Unref the process so it doesn't keep Node.js alive
    proc.unref();

    let stderrOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new TyperError("wl-copy not found (required for ydotool paste)"));
      } else {
        reject(new TyperError(`Clipboard operation failed: ${error.message}`));
      }
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new TyperError(stderrOutput.trim() || `wl-copy exited with code ${code}`));
      }
    });

    proc.stdin?.write(text);
    proc.stdin?.end();
  });
}

/**
 * Type text into focused window using specified method
 *
 * @param text - Text to type
 * @param options - Typing options (delay, method)
 * @throws {WtypeNotFoundError} If wtype method selected but not installed
 * @throws {YdotoolNotFoundError} If ydotool method selected but not installed
 * @throws {TyperError} If typing operation fails
 */
export async function typeText(text: string, options?: TypeOptions): Promise<void> {
  // Handle empty text gracefully - nothing to type
  if (!text) {
    return;
  }

  const delay = options?.delay ?? 0;
  const method = options?.method ?? "ydotool";

  if (method === "wtype") {
    return typeWithWtype(text, delay);
  } else {
    return typeWithYdotool(text, delay);
  }
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

/**
 * Check if ydotool is available on the system
 */
export async function checkYdotoolAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    // ydotool doesn't have --version, so we check with 'help'
    const proc = spawn("ydotool", ["help"], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", (code) => {
      // ydotool help returns 0 on success
      resolve(code === 0);
    });
  });
}
