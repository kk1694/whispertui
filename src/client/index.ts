/**
 * Socket Client for WhisperTUI CLI
 *
 * Connects to the daemon over Unix socket and sends JSON commands.
 * Handles connection timeouts and graceful error handling.
 */

import { connect, type Socket } from "node:net";
import { existsSync } from "node:fs";
import { getSocketPath } from "../config/paths.ts";
import type { DaemonCommand, DaemonResponse } from "../daemon/server.ts";

/** Default connection timeout in milliseconds */
const DEFAULT_TIMEOUT = 5000;

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
    if (response.context?.currentWindow) {
      const win = response.context.currentWindow;
      parts.push(`Window: ${win.windowClass} - ${win.windowTitle}`);
    }
    return parts.join("\n") || "OK";
  } else {
    return `Error: ${response.error ?? "Unknown error"}`;
  }
}
