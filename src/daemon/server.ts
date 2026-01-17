/**
 * Unix Socket Server for WhisperTUI Daemon
 *
 * Provides IPC communication over a Unix socket with JSON protocol.
 * Handles command routing to the state machine and lifecycle management.
 */

import { createServer, type Server, type Socket } from "node:net";
import {
  existsSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { getSocketPath, getPidPath, ensureDir, getStateDir } from "../config/paths.ts";
import {
  createStateMachine,
  type StateMachine,
  type DaemonStateSnapshot,
  InvalidTransitionError,
} from "./state.ts";

/** Commands that can be sent to the daemon */
export type DaemonCommand = "start" | "stop" | "status" | "shutdown" | "ping";

/** Request format from client */
export interface DaemonRequest {
  command: DaemonCommand;
}

/** Response format to client */
export interface DaemonResponse {
  success: boolean;
  state?: DaemonStateSnapshot["state"];
  context?: DaemonStateSnapshot["context"];
  error?: string;
  message?: string;
}

/** Server lifecycle events */
export type ServerEventType = "started" | "stopped" | "client_connected" | "client_disconnected" | "command_received";

export type ServerEventListener = (event: ServerEventType, data?: unknown) => void;

/**
 * Checks if a PID file refers to a running process
 */
function isPidRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without killing it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up stale socket and PID files from previous runs
 */
export function cleanupStaleFiles(): { socketCleaned: boolean; pidCleaned: boolean } {
  const socketPath = getSocketPath();
  const pidPath = getPidPath();
  let socketCleaned = false;
  let pidCleaned = false;

  // Check PID file first
  if (existsSync(pidPath)) {
    try {
      const pidContent = readFileSync(pidPath, "utf-8").trim();
      const pid = parseInt(pidContent, 10);

      if (isNaN(pid) || !isPidRunning(pid)) {
        // PID file is stale - remove it
        unlinkSync(pidPath);
        pidCleaned = true;
      } else {
        // Another daemon is running
        throw new Error(`Daemon already running with PID ${pid}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("already running")) {
        throw error;
      }
      // Error reading PID file - assume stale
      try {
        unlinkSync(pidPath);
        pidCleaned = true;
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Clean up stale socket
  if (existsSync(socketPath)) {
    try {
      unlinkSync(socketPath);
      socketCleaned = true;
    } catch {
      // Ignore cleanup errors
    }
  }

  return { socketCleaned, pidCleaned };
}

/**
 * Write the current process PID to the PID file
 */
export function writePidFile(): void {
  const pidPath = getPidPath();
  writeFileSync(pidPath, process.pid.toString(), "utf-8");
}

/**
 * Remove the PID file on shutdown
 */
export function removePidFile(): void {
  const pidPath = getPidPath();
  if (existsSync(pidPath)) {
    try {
      unlinkSync(pidPath);
    } catch {
      // Ignore errors during cleanup
    }
  }
}

/**
 * DaemonServer - Unix socket server with JSON protocol
 */
export class DaemonServer {
  private server: Server | null = null;
  private stateMachine: StateMachine;
  private clients: Set<Socket> = new Set();
  private listeners: Set<ServerEventListener> = new Set();
  private isShuttingDown = false;

  constructor(stateMachine?: StateMachine) {
    this.stateMachine = stateMachine ?? createStateMachine();
  }

  /** Get the state machine instance */
  getStateMachine(): StateMachine {
    return this.stateMachine;
  }

  /** Subscribe to server events */
  subscribe(listener: ServerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ServerEventType, data?: unknown): void {
    for (const listener of this.listeners) {
      listener(event, data);
    }
  }

  /**
   * Handle incoming command and return response
   */
  handleCommand(request: DaemonRequest): DaemonResponse {
    this.emit("command_received", request);

    switch (request.command) {
      case "ping":
        return {
          success: true,
          state: this.stateMachine.state,
          message: "pong",
        };

      case "status": {
        const snapshot = this.stateMachine.getSnapshot();
        return {
          success: true,
          state: snapshot.state,
          context: snapshot.context,
        };
      }

      case "start":
        try {
          this.stateMachine.send({ type: "start" });
          const snapshot = this.stateMachine.getSnapshot();
          return {
            success: true,
            state: snapshot.state,
            context: snapshot.context,
            message: "Recording started",
          };
        } catch (error) {
          if (error instanceof InvalidTransitionError) {
            return {
              success: false,
              state: this.stateMachine.state,
              error: error.message,
            };
          }
          throw error;
        }

      case "stop":
        try {
          this.stateMachine.send({ type: "stop" });
          const snapshot = this.stateMachine.getSnapshot();
          return {
            success: true,
            state: snapshot.state,
            context: snapshot.context,
            message: "Recording stopped, transcribing...",
          };
        } catch (error) {
          if (error instanceof InvalidTransitionError) {
            return {
              success: false,
              state: this.stateMachine.state,
              error: error.message,
            };
          }
          throw error;
        }

      case "shutdown":
        // Mark as shutting down - actual shutdown happens after response is sent
        this.isShuttingDown = true;
        return {
          success: true,
          state: this.stateMachine.state,
          message: "Daemon shutting down",
        };

      default:
        return {
          success: false,
          error: `Unknown command: ${request.command}`,
        };
    }
  }

  /**
   * Parse JSON data from socket and handle commands
   */
  private handleData(socket: Socket, data: Buffer | string): void {
    const rawMessage = data.toString().trim();

    // Handle multiple JSON messages in one packet (newline-delimited)
    const messages = rawMessage.split("\n").filter((m) => m.trim());

    for (const message of messages) {
      let response: DaemonResponse;

      try {
        const request = JSON.parse(message) as DaemonRequest;

        if (!request.command || typeof request.command !== "string") {
          response = {
            success: false,
            error: "Invalid request: missing or invalid 'command' field",
          };
        } else {
          response = this.handleCommand(request);
        }
      } catch {
        response = {
          success: false,
          error: "Invalid JSON",
        };
      }

      // Send response
      socket.write(JSON.stringify(response) + "\n");

      // Handle shutdown after sending response
      if (this.isShuttingDown) {
        setImmediate(() => this.stop());
      }
    }
  }

  /**
   * Start the daemon server
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error("Server already running");
    }

    // Ensure state directory exists
    ensureDir(getStateDir());

    // Clean up any stale files
    cleanupStaleFiles();

    const socketPath = getSocketPath();

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.clients.add(socket);
        this.emit("client_connected", { count: this.clients.size });

        socket.on("data", (data) => this.handleData(socket, data));

        socket.on("close", () => {
          this.clients.delete(socket);
          this.emit("client_disconnected", { count: this.clients.size });
        });

        socket.on("error", () => {
          this.clients.delete(socket);
        });
      });

      this.server.on("error", (error) => {
        reject(error);
      });

      this.server.listen(socketPath, () => {
        // Set socket permissions to 0600 (owner read/write only)
        try {
          chmodSync(socketPath, 0o600);
        } catch {
          // Ignore chmod errors
        }

        // Write PID file
        writePidFile();

        this.emit("started");
        resolve();
      });
    });
  }

  /**
   * Stop the daemon server gracefully
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Close all client connections
      for (const client of this.clients) {
        client.destroy();
      }
      this.clients.clear();

      this.server!.close(() => {
        // Clean up socket file
        const socketPath = getSocketPath();
        if (existsSync(socketPath)) {
          try {
            unlinkSync(socketPath);
          } catch {
            // Ignore cleanup errors
          }
        }

        // Remove PID file
        removePidFile();

        this.server = null;
        this.emit("stopped");
        resolve();
      });
    });
  }

  /** Check if server is currently running */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }
}

/**
 * Create and return a new DaemonServer instance
 */
export function createDaemonServer(stateMachine?: StateMachine): DaemonServer {
  return new DaemonServer(stateMachine);
}
