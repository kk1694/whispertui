#!/usr/bin/env bun
/**
 * WhisperTUI - Terminal-based voice transcription tool for Linux/Wayland
 * Entry point with CLI command routing
 */

import { ensureAllDirs, paths, getConfigPath, ensureDir, getConfigDir } from "./config/paths.ts";
import { loadConfig, formatConfigError } from "./config/loader.ts";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createDaemonServer, type DaemonServer } from "./daemon/server.ts";
import {
  sendCommand,
  formatResponse,
  DaemonNotRunningError,
  ConnectionTimeoutError,
  DaemonStartError,
  ensureDaemonRunning,
} from "./client/index.ts";
import type { DaemonCommand } from "./daemon/server.ts";
import { launchTui, launchQuickTranscribe } from "./ui/index.tsx";
import { runDoctorChecks, formatDoctorResult } from "./doctor/index.ts";
import {
  playLatestRecording,
  NoRecordingsFoundError,
  PaplayNotFoundError,
  PlaybackError,
} from "./audio/player.ts";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`whispertui v${VERSION} - Voice transcription for Linux/Wayland

Usage: whispertui <command> [options]

Commands:
  start         Start recording
  stop          Stop recording and transcribe
  toggle        Toggle recording state
  status        Show daemon status
  shutdown      Stop the daemon
  daemon        Start daemon in foreground
  config        Print current config
  config --edit Open config file in $EDITOR
  history       List recent transcriptions
  tui           Launch interactive TUI
  quick         Quick transcribe: record, transcribe, paste into previous window
  doctor        Check system dependencies
  replay        Play back the most recent recording

Options:
  --help, -h     Show this help message
  --version, -v  Show version`);
}

function printVersion(): void {
  console.log(`whispertui v${VERSION}`);
}

/** Default config content (same as config.example.toml) */
const DEFAULT_CONFIG_CONTENT = `# WhisperTUI Configuration
# All values shown are defaults - you can omit any section or key to use defaults

[transcription]
# Transcription backend (currently only "groq" is supported)
backend = "groq"
# Environment variable containing the API key
api_key_env = "GROQ_API_KEY"

[audio]
# PulseAudio device name ("default" uses the system default)
device = "default"
# Sample rate in Hz (Whisper expects 16kHz)
sample_rate = 16000
# Audio format (only "wav" is supported)
format = "wav"

[output]
# Automatically paste transcribed text
auto_paste = true
# Paste method: "wtype" (types into focused window) or "clipboard-only"
paste_method = "wtype"

[context]
# Enable context detection (detects code-aware apps)
enabled = true
# Window classes considered "code-aware" (affects transcription mode in v2)
code_aware_apps = ["Alacritty", "kitty", "foot", "nvim", "code", "Code"]

[history]
# Enable transcription history
enabled = true
# Maximum number of history entries to keep
max_entries = 1000

[daemon]
# Idle timeout in seconds (0 = never auto-shutdown)
idle_timeout = 0

[notifications]
# Enable desktop notifications
enabled = true
`;

/**
 * Open config file in $EDITOR, creating default config if it doesn't exist
 */
async function openConfigInEditor(): Promise<void> {
  const configPath = getConfigPath();
  const configDir = getConfigDir();

  // Ensure config directory exists
  ensureDir(configDir);

  // Create default config if it doesn't exist
  if (!existsSync(configPath)) {
    console.log(`Creating default config at ${configPath}`);
    writeFileSync(configPath, DEFAULT_CONFIG_CONTENT, "utf-8");
  }

  // Get editor from $EDITOR or $VISUAL, fallback to common editors
  const editor = process.env.EDITOR || process.env.VISUAL || "nano";

  console.log(`Opening ${configPath} in ${editor}...`);

  return new Promise((resolve, reject) => {
    const proc = spawn(editor, [configPath], {
      stdio: "inherit",
      shell: true,
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        console.error(`Error: Editor '${editor}' not found`);
        console.error("Set $EDITOR environment variable to your preferred editor");
        process.exit(1);
      } else {
        console.error(`Error opening editor: ${error.message}`);
        process.exit(1);
      }
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        console.log("Config saved.");
        resolve();
      } else {
        console.error(`Editor exited with code ${code}`);
        process.exit(code ?? 1);
      }
    });
  });
}

/**
 * Send a command to the daemon and handle errors gracefully
 * Auto-starts daemon if not running
 */
async function runClientCommand(command: DaemonCommand): Promise<void> {
  try {
    // Ensure daemon is running first (auto-start if needed)
    const wasAutoStarted = await ensureDaemonRunning();
    if (wasAutoStarted) {
      console.log("Starting daemon...");
    }

    const response = await sendCommand(command);
    console.log(formatResponse(response));
    if (!response.success) {
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof DaemonStartError) {
      console.error(`Error: ${error.message}`);
      console.error("Try starting the daemon manually with: whispertui daemon");
      process.exit(1);
    } else if (error instanceof DaemonNotRunningError) {
      console.error("Error: Daemon is not running and could not be started");
      console.error("Start the daemon with: whispertui daemon");
      process.exit(1);
    } else if (error instanceof ConnectionTimeoutError) {
      console.error("Error: Connection to daemon timed out");
      console.error("The daemon may be unresponsive. Try restarting it.");
      process.exit(1);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    } else {
      console.error("Error: Unknown error occurred");
      process.exit(1);
    }
  }
}

/**
 * Handle toggle command - start if idle, stop if recording
 * Auto-starts daemon if not running
 */
async function runToggleCommand(): Promise<void> {
  try {
    // Ensure daemon is running first (auto-start if needed)
    const wasAutoStarted = await ensureDaemonRunning();
    if (wasAutoStarted) {
      console.log("Starting daemon...");
    }

    // First check current status
    const statusResponse = await sendCommand("status");
    if (!statusResponse.success) {
      console.error(formatResponse(statusResponse));
      process.exit(1);
    }

    // Toggle based on current state
    const command: DaemonCommand = statusResponse.state === "recording" ? "stop" : "start";
    const response = await sendCommand(command);
    console.log(formatResponse(response));
    if (!response.success) {
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof DaemonStartError) {
      console.error(`Error: ${error.message}`);
      console.error("Try starting the daemon manually with: whispertui daemon");
      process.exit(1);
    } else if (error instanceof DaemonNotRunningError) {
      console.error("Error: Daemon is not running and could not be started");
      console.error("Start the daemon with: whispertui daemon");
      process.exit(1);
    } else if (error instanceof ConnectionTimeoutError) {
      console.error("Error: Connection to daemon timed out");
      console.error("The daemon may be unresponsive. Try restarting it.");
      process.exit(1);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    } else {
      console.error("Error: Unknown error occurred");
      process.exit(1);
    }
  }
}

/**
 * Shutdown command - does NOT auto-start daemon
 * Returns immediately if daemon is not running
 */
async function runShutdownCommand(): Promise<void> {
  try {
    const response = await sendCommand("shutdown");
    console.log(formatResponse(response));
    if (!response.success) {
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof DaemonNotRunningError) {
      console.log("Daemon is not running");
      return;
    } else if (error instanceof ConnectionTimeoutError) {
      console.error("Error: Connection to daemon timed out");
      console.error("The daemon may be unresponsive. Try restarting it.");
      process.exit(1);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    } else {
      console.error("Error: Unknown error occurred");
      process.exit(1);
    }
  }
}

/**
 * Run the daemon in foreground mode with signal handling
 */
async function runDaemon(): Promise<void> {
  const server = createDaemonServer();
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\nReceived ${signal}, shutting down...`);
    await server.stop();
    console.log("Daemon stopped");
    process.exit(0);
  };

  // Handle SIGTERM (kill) and SIGINT (Ctrl+C)
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Subscribe to server events for logging
  server.subscribe((event, data) => {
    switch (event) {
      case "started":
        console.log(`Daemon started, listening on ${paths.socket()}`);
        console.log(`PID: ${process.pid}`);
        break;
      case "stopped":
        console.log("Server stopped");
        break;
      case "client_connected":
        // Silent - don't log connection events
        break;
      case "client_disconnected":
        // Silent
        break;
      case "command_received":
        // Could add verbose logging here if needed
        break;
    }
  });

  try {
    await server.start();
    // Keep process alive - server will handle events
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("already running")) {
        console.error(`Error: ${error.message}`);
        console.error("Use 'whispertui shutdown' to stop the running daemon first.");
      } else {
        console.error(`Failed to start daemon: ${error.message}`);
      }
    } else {
      console.error("Failed to start daemon:", error);
    }
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle global flags
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-v") {
    printVersion();
    return;
  }

  // Ensure directories exist before any command
  ensureAllDirs();

  // Command routing
  switch (command) {
    case "start":
      await runClientCommand("start");
      break;
    case "stop":
      await runClientCommand("stop");
      break;
    case "toggle":
      await runToggleCommand();
      break;
    case "status":
      await runClientCommand("status");
      break;
    case "shutdown":
      await runShutdownCommand();
      break;
    case "daemon":
      await runDaemon();
      break;
    case "config": {
      // Check for --edit flag
      if (args.includes("--edit") || args.includes("-e")) {
        await openConfigInEditor();
        break;
      }

      try {
        const config = await loadConfig();
        console.log("WhisperTUI Configuration:");
        console.log();
        console.log("[transcription]");
        console.log(`  backend = "${config.transcription.backend}"`);
        console.log(`  api_key_env = "${config.transcription.api_key_env}"`);
        console.log();
        console.log("[audio]");
        console.log(`  device = "${config.audio.device}"`);
        console.log(`  sample_rate = ${config.audio.sample_rate}`);
        console.log(`  format = "${config.audio.format}"`);
        console.log();
        console.log("[output]");
        console.log(`  auto_paste = ${config.output.auto_paste}`);
        console.log(`  paste_method = "${config.output.paste_method}"`);
        console.log();
        console.log("[context]");
        console.log(`  enabled = ${config.context.enabled}`);
        console.log(
          `  code_aware_apps = ${JSON.stringify(config.context.code_aware_apps)}`
        );
        console.log();
        console.log("[history]");
        console.log(`  enabled = ${config.history.enabled}`);
        console.log(`  max_entries = ${config.history.max_entries}`);
        console.log();
        console.log("[daemon]");
        console.log(`  idle_timeout = ${config.daemon.idle_timeout}`);
        console.log();
        console.log("[notifications]");
        console.log(`  enabled = ${config.notifications.enabled}`);
        console.log();
        console.log("Paths:");
        console.log(`  Config file: ${paths.configFile()}`);
        console.log(`  Config dir:  ${paths.config()}`);
        console.log(`  State dir:   ${paths.state()}`);
        console.log(`  Data dir:    ${paths.data()}`);
        console.log(`  Cache dir:   ${paths.cache()}`);
      } catch (error) {
        console.error(formatConfigError(error));
        process.exit(1);
      }
      break;
    }
    case "history":
      await launchTui({ initialView: "history" });
      break;
    case "tui":
      await launchTui();
      break;
    case "quick": {
      // Parse --return-to argument for window address
      const returnToIdx = args.indexOf("--return-to");
      const returnToAddress = returnToIdx !== -1 ? args[returnToIdx + 1] : undefined;
      await launchQuickTranscribe({ returnToAddress });
      break;
    }
    case "doctor": {
      const doctorResult = await runDoctorChecks();
      console.log(formatDoctorResult(doctorResult));
      // Exit with non-zero if required dependencies are missing
      if (!doctorResult.requiredOk) {
        process.exit(1);
      }
      break;
    }
    case "replay":
    case "play": {
      try {
        const audioPath = await playLatestRecording();
        console.log(`Playing: ${audioPath}`);
      } catch (error) {
        if (error instanceof NoRecordingsFoundError) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        } else if (error instanceof PaplayNotFoundError) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        } else if (error instanceof PlaybackError) {
          console.error(`Playback error: ${error.message}`);
          process.exit(1);
        } else {
          throw error;
        }
      }
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'whispertui --help' for usage information");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
