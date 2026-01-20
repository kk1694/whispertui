/**
 * Socket Client for WhisperTUI CLI
 *
 * Connects to the daemon over Unix socket and sends JSON commands.
 * Handles connection timeouts, graceful error handling, and daemon auto-start.
 */

import { connect, type Socket } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { getSocketPath, getPidPath } from "../config/paths.ts";
import type { DaemonCommand, DaemonResponse } from "../daemon/server.ts";

/** Default connection timeout in milliseconds */
const DEFAULT_TIMEOUT = 5000;

/** Default wait-for-ready timeout in milliseconds */
const DEFAULT_READY_TIMEOUT = 10000;

/** Polling interval when waiting for daemon to start */
const READY_POLL_INTERVAL = 100;

/** Error thrown when daemon is not running */
export class DaemonNotRunningError extends Error {
  constructor() {
    super("Daemon is not running. Start it with 'whispertui daemon'");
    this.name = "DaemonNotRunningError";
  }
}

/** Error thrown when connection times out */
export class ConnectionTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Connection timed out after ${timeout}ms`);
    this.name = "ConnectionTimeoutError";
  }
}

/** Error thrown when daemon fails to start */
export class DaemonStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaemonStartError";
  }
}

/** Options for the client */
export interface ClientOptions {
  /** Connection timeout in milliseconds (default: 5000) */
  timeout?: number;
  /** Socket path override (for testing) */
  socketPath?: string;
}

/**
 * Send a command to the daemon and receive a response
 */
export async function sendCommand(
  command: DaemonCommand,
  options: ClientOptions = {}
): Promise<DaemonResponse> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const socketPath = options.socketPath ?? getSocketPath();

  // Quick check if socket exists (fast fail for obvious "not running" case)
  if (!existsSync(socketPath)) {
    throw new DaemonNotRunningError();
  }

  return new Promise((resolve, reject) => {
    let socket: Socket | null = null;
    let timeoutId: Timer | null = null;
    let responseBuffer = "";
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (socket) {
        socket.destroy();
        socket = null;
      }
    };

    const handleError = (error: Error) => {
      if (resolved) return;
      resolved = true;
      cleanup();

      // Translate common socket errors to user-friendly messages
      if ("code" in error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ECONNREFUSED" || code === "ENOENT") {
          reject(new DaemonNotRunningError());
          return;
        }
      }
      reject(error);
    };

    // Set up connection timeout
    timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new ConnectionTimeoutError(timeout));
    }, timeout);

    // Connect to socket
    socket = connect(socketPath);

    socket.on("connect", () => {
      // Send the command as JSON with newline delimiter
      const request = JSON.stringify({ command }) + "\n";
      socket!.write(request);
    });

    socket.on("data", (data: Buffer | string) => {
      responseBuffer += data.toString();

      // Check for complete JSON response (newline-delimited)
      const newlineIndex = responseBuffer.indexOf("\n");
      if (newlineIndex !== -1) {
        const jsonStr = responseBuffer.slice(0, newlineIndex);
        resolved = true;
        cleanup();

        try {
          const response = JSON.parse(jsonStr) as DaemonResponse;
          resolve(response);
        } catch {
          reject(new Error("Invalid JSON response from daemon"));
        }
      }
    });

    socket.on("error", handleError);

    socket.on("close", () => {
      if (resolved) return;
      // Socket closed without response
      resolved = true;
      cleanup();
      reject(new Error("Connection closed without response"));
    });
  });
}

/**
 * Check if daemon is running by sending a ping command
 */
export async function isDaemonRunning(options: ClientOptions = {}): Promise<boolean> {
  try {
    const response = await sendCommand("ping", { ...options, timeout: options.timeout ?? 1000 });
    return response.success;
  } catch {
    return false;
  }
}

/**
 * Format a daemon response for display to the user
 */
export function formatResponse(response: DaemonResponse): string {
  if (response.success) {
    const parts: string[] = [];
    if (response.message) {
      parts.push(response.message);
    }
    if (response.state) {
      parts.push(`State: ${response.state}`);
    }
    if (response.context?.lastTranscription) {
      parts.push("");
      parts.push("Transcription:");
      parts.push(response.context.lastTranscription);
      parts.push("");
      parts.push("(Copied to clipboard)");
    }
    if (response.context?.currentWindow) {
      const win = response.context.currentWindow;
      parts.push(`Window: ${win.windowClass} - ${win.windowTitle}`);
    }
    return parts.join("\n") || "OK";
  } else {
    return `Error: ${response.error ?? "Unknown error"}`;
  }
}

/** Options for auto-start functionality */
export interface AutoStartOptions extends ClientOptions {
  /** Timeout for waiting for daemon to become ready (default: 10000) */
  readyTimeout?: number;
}

/**
 * Check if a PID file refers to a running process
 */
function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if daemon is already starting (PID file exists with running process, but socket not yet ready)
 */
export function isDaemonStarting(): boolean {
  const pidPath = getPidPath();
  if (!existsSync(pidPath)) {
    return false;
  }
  try {
    const pidContent = readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(pidContent, 10);
    if (isNaN(pid)) {
      return false;
    }
    // PID exists and process is running, but socket may not be ready yet
    return isPidRunning(pid);
  } catch {
    return false;
  }
}

/**
 * Spawn the daemon as a background process
 * Returns the child process PID
 */
export function spawnDaemon(): number {
  // Get the path to the current script's entry point
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new DaemonStartError("Cannot determine script path for daemon spawn");
  }

  // Spawn daemon process detached from parent
  const child = spawn("bun", ["run", scriptPath, "daemon"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: process.env,
  });

  // Let the child run independently
  child.unref();

  if (!child.pid) {
    throw new DaemonStartError("Failed to spawn daemon process");
  }

  return child.pid;
}

/**
 * Wait for daemon to become ready (socket exists and responds to ping)
 */
export async function waitForDaemon(options: AutoStartOptions = {}): Promise<void> {
  const readyTimeout = options.readyTimeout ?? DEFAULT_READY_TIMEOUT;
  const startTime = Date.now();

  while (Date.now() - startTime < readyTimeout) {
    if (await isDaemonRunning(options)) {
      return;
    }
    // Wait before next attempt
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL));
  }

  throw new DaemonStartError(
    `Daemon did not become ready within ${readyTimeout}ms`
  );
}

/**
 * Ensure daemon is running, starting it if necessary
 * Returns true if daemon was auto-started, false if already running
 */
export async function ensureDaemonRunning(options: AutoStartOptions = {}): Promise<boolean> {
  // Check if daemon is already running
  if (await isDaemonRunning(options)) {
    return false;
  }

  // Check if daemon is in the process of starting (avoid race condition)
  if (isDaemonStarting()) {
    // Wait for the existing daemon to become ready
    await waitForDaemon(options);
    return false;
  }

  // Spawn the daemon
  spawnDaemon();

  // Wait for it to become ready
  await waitForDaemon(options);

  return true;
}

/**
 * Send a command to the daemon, auto-starting if necessary
 */
export async function sendCommandWithAutoStart(
  command: DaemonCommand,
  options: AutoStartOptions = {}
): Promise<{ response: DaemonResponse; wasAutoStarted: boolean }> {
  const wasAutoStarted = await ensureDaemonRunning(options);
  const response = await sendCommand(command, options);
  return { response, wasAutoStarted };
}
