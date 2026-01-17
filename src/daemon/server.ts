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
import { getSocketPath, getPidPath, ensureDir, getStateDir, getCacheDir } from "../config/paths.ts";
import {
  createStateMachine,
  type StateMachine,
  type DaemonStateSnapshot,
  InvalidTransitionError,
} from "./state.ts";
import {
  AudioRecorder,
  createAudioRecorder,
  extractRecordingConfig,
  ParecordNotFoundError,
  RecordingError,
  type RecordingConfig,
} from "../audio/recorder.ts";
import {
  GroqClient,
  createGroqClient,
  MissingApiKeyError,
  TranscriptionApiError,
  InvalidAudioError,
} from "../transcription/groq.ts";
import {
  copyToClipboard,
  WlCopyNotFoundError,
  ClipboardError,
} from "../output/clipboard.ts";
import {
  typeText,
  WtypeNotFoundError,
  TyperError,
} from "../output/typer.ts";
import {
  Notifier,
  createNotifier,
  extractNotificationConfig,
  type NotificationConfig,
} from "../notify/index.ts";
import type { Config } from "../config/schema.ts";

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
  audioPath?: string;
}

/** Transcription configuration extracted from Config */
export interface TranscriptionConfig {
  apiKeyEnv: string;
}

/** Output configuration extracted from Config */
export interface OutputConfig {
  autoPaste: boolean;
  pasteMethod: "wtype" | "clipboard-only";
}

/** Options for creating a daemon server */
export interface DaemonServerOptions {
  stateMachine?: StateMachine;
  config?: Config;
  recordingConfig?: RecordingConfig;
  transcriptionConfig?: TranscriptionConfig;
  outputConfig?: OutputConfig;
  notificationConfig?: NotificationConfig;
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

/** Default recording config when none provided */
const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  device: "default",
  sampleRate: 16000,
  format: "wav",
};

/** Default transcription config when none provided */
const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfig = {
  apiKeyEnv: "GROQ_API_KEY",
};

/** Default output config when none provided */
const DEFAULT_OUTPUT_CONFIG: OutputConfig = {
  autoPaste: true,
  pasteMethod: "wtype",
};

/** Default notification config when none provided */
const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
};

/**
 * DaemonServer - Unix socket server with JSON protocol
 */
export class DaemonServer {
  private server: Server | null = null;
  private stateMachine: StateMachine;
  private clients: Set<Socket> = new Set();
  private listeners: Set<ServerEventListener> = new Set();
  private isShuttingDown = false;
  private recorder: AudioRecorder;
  private transcriber: GroqClient;
  private outputConfig: OutputConfig;
  private notifier: Notifier;
  private currentAudioPath: string | null = null;

  constructor(options?: DaemonServerOptions) {
    this.stateMachine = options?.stateMachine ?? createStateMachine();

    const recordingConfig = options?.recordingConfig ??
      (options?.config ? extractRecordingConfig(options.config) : DEFAULT_RECORDING_CONFIG);
    this.recorder = createAudioRecorder(recordingConfig);

    const transcriptionConfig = options?.transcriptionConfig ??
      (options?.config ? extractTranscriptionConfig(options.config) : DEFAULT_TRANSCRIPTION_CONFIG);
    this.transcriber = createGroqClient({ apiKeyEnv: transcriptionConfig.apiKeyEnv });

    this.outputConfig = options?.outputConfig ??
      (options?.config ? extractOutputConfig(options.config) : DEFAULT_OUTPUT_CONFIG);

    const notificationConfig = options?.notificationConfig ??
      (options?.config ? extractNotificationConfig(options.config) : DEFAULT_NOTIFICATION_CONFIG);
    this.notifier = createNotifier(notificationConfig);
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
   * Note: start and stop are async but we handle them synchronously for the protocol.
   * The actual recording operations happen in the background.
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
          audioPath: this.currentAudioPath ?? undefined,
        };
      }

      case "start":
        return this.handleStart();

      case "stop":
        return this.handleStop();

      case "shutdown":
        // Abort any ongoing recording before shutdown
        if (this.recorder.isRecording) {
          this.recorder.abort();
          this.currentAudioPath = null;
        }
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
   * Handle start command - begin recording
   */
  private handleStart(): DaemonResponse {
    try {
      // Validate state transition first
      this.stateMachine.send({ type: "start" });
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

    // Send recording started notification
    this.notifier.notifyRecordingStarted();

    // Start recording in background
    this.recorder.start()
      .then((audioPath) => {
        this.currentAudioPath = audioPath;
      })
      .catch((error) => {
        // Recording failed - transition to error state
        let message = "Recording failed";
        if (error instanceof ParecordNotFoundError) {
          message = error.message;
        } else if (error instanceof RecordingError) {
          message = error.message;
        } else if (error instanceof Error) {
          message = error.message;
        }
        this.stateMachine.send({ type: "error", message });
        this.notifier.notifyError(message);
        this.currentAudioPath = null;
      });

    const snapshot = this.stateMachine.getSnapshot();
    return {
      success: true,
      state: snapshot.state,
      context: snapshot.context,
      message: "Recording started",
    };
  }

  /**
   * Handle stop command - stop recording
   */
  private handleStop(): DaemonResponse {
    try {
      // Validate state transition first
      this.stateMachine.send({ type: "stop" });
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

    const audioPath = this.currentAudioPath;

    // Stop recording and transcribe in background
    this.recorder.stop()
      .then(async (finalPath) => {
        // Recording stopped successfully - now transcribe
        this.currentAudioPath = finalPath;

        try {
          const text = await this.transcriber.transcribe(finalPath);

          // Output handling based on config
          await this.handleOutput(text);

          this.stateMachine.send({ type: "transcription_complete", text });

          // Send transcription complete notification
          this.notifier.notifyTranscriptionComplete(text);
        } catch (error) {
          // Transcription failed
          let message = "Transcription failed";
          if (error instanceof MissingApiKeyError) {
            message = error.message;
          } else if (error instanceof TranscriptionApiError) {
            message = error.message;
          } else if (error instanceof InvalidAudioError) {
            message = error.message;
          } else if (error instanceof Error) {
            message = error.message;
          }
          this.stateMachine.send({ type: "error", message });
          this.notifier.notifyError(message);
        }
      })
      .catch((error) => {
        // Recording stop failed
        let message = "Failed to stop recording";
        if (error instanceof RecordingError) {
          message = error.message;
        } else if (error instanceof Error) {
          message = error.message;
        }
        this.stateMachine.send({ type: "error", message });
        this.notifier.notifyError(message);
        this.currentAudioPath = null;
      });

    const snapshot = this.stateMachine.getSnapshot();
    return {
      success: true,
      state: snapshot.state,
      context: snapshot.context,
      message: "Recording stopped, transcribing...",
      audioPath: audioPath ?? undefined,
    };
  }

  /**
   * Handle output after transcription (typing or clipboard)
   * Uses wtype for auto_paste with paste_method=wtype, otherwise clipboard-only.
   * Falls back to clipboard if wtype fails.
   */
  private async handleOutput(text: string): Promise<void> {
    // Always copy to clipboard first (as fallback/primary depending on config)
    let clipboardSuccess = false;
    try {
      await copyToClipboard(text);
      clipboardSuccess = true;
    } catch (clipboardError) {
      let clipboardMessage = "Failed to copy to clipboard";
      if (clipboardError instanceof WlCopyNotFoundError) {
        clipboardMessage = clipboardError.message;
      } else if (clipboardError instanceof ClipboardError) {
        clipboardMessage = clipboardError.message;
      }
      this.notifier.notifyError(clipboardMessage);
      console.error(clipboardMessage);
    }

    // If auto_paste is enabled and paste_method is wtype, try to type the text
    if (this.outputConfig.autoPaste && this.outputConfig.pasteMethod === "wtype") {
      try {
        await typeText(text);
      } catch (typeError) {
        // wtype failed - text is already in clipboard as fallback
        let typeMessage = "Failed to type text";
        if (typeError instanceof WtypeNotFoundError) {
          typeMessage = typeError.message;
        } else if (typeError instanceof TyperError) {
          typeMessage = typeError.message;
        }
        if (clipboardSuccess) {
          typeMessage += " (text available in clipboard)";
        }
        this.notifier.notifyError(typeMessage);
        console.error(typeMessage);
      }
    }
    // If paste_method is clipboard-only or auto_paste is false,
    // we've already copied to clipboard above
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

  /** Get the audio recorder instance (for testing) */
  getRecorder(): AudioRecorder {
    return this.recorder;
  }

  /** Get current audio path (for testing/debugging) */
  getCurrentAudioPath(): string | null {
    return this.currentAudioPath;
  }

  /** Get output config (for testing) */
  getOutputConfig(): OutputConfig {
    return this.outputConfig;
  }

  /** Get notifier instance (for testing) */
  getNotifier(): Notifier {
    return this.notifier;
  }
}

/**
 * Extract transcription config from application Config
 */
export function extractTranscriptionConfig(config: Config): TranscriptionConfig {
  return {
    apiKeyEnv: config.transcription.api_key_env,
  };
}

/**
 * Extract output config from application Config
 */
export function extractOutputConfig(config: Config): OutputConfig {
  return {
    autoPaste: config.output.auto_paste,
    pasteMethod: config.output.paste_method,
  };
}

/**
 * Create and return a new DaemonServer instance
 */
export function createDaemonServer(options?: DaemonServerOptions): DaemonServer;
export function createDaemonServer(stateMachine?: StateMachine): DaemonServer;
export function createDaemonServer(optionsOrStateMachine?: DaemonServerOptions | StateMachine): DaemonServer {
  // Handle legacy single-argument StateMachine form
  // Check if it's a StateMachine by duck-typing (has 'state' getter and 'send' method)
  if (
    optionsOrStateMachine &&
    typeof (optionsOrStateMachine as StateMachine).state === "string" &&
    typeof (optionsOrStateMachine as StateMachine).send === "function"
  ) {
    return new DaemonServer({ stateMachine: optionsOrStateMachine as StateMachine });
  }
  return new DaemonServer(optionsOrStateMachine as DaemonServerOptions | undefined);
}
