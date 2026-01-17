#!/usr/bin/env bun
/**
 * WhisperTUI - Terminal-based voice transcription tool for Linux/Wayland
 * Entry point with CLI command routing
 */

import { ensureAllDirs, paths } from "./config/paths.ts";
import { loadConfig, formatConfigError } from "./config/loader.ts";
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
import {
  listHistory,
  type HistoryEntry,
} from "./history/index.ts";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`whispertui v${VERSION} - Voice transcription for Linux/Wayland

Usage: whispertui <command> [options]

Commands:
  start       Start recording
  stop        Stop recording and transcribe
  toggle      Toggle recording state
  status      Show daemon status
  shutdown    Stop the daemon
  daemon      Start daemon in foreground
  config      Print current config
  history     List recent transcriptions
  tui         Launch interactive TUI
  doctor      Check system dependencies

Options:
  --help, -h     Show this help message
  --version, -v  Show version`);
}

function printVersion(): void {
  console.log(`whispertui v${VERSION}`);
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
      // Silently auto-started - no message needed, but could add one if desired
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
    await ensureDaemonRunning();

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
      await runClientCommand("shutdown");
      break;
    case "daemon":
      await runDaemon();
      break;
    case "config":
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
    case "history": {
      // Parse --limit flag
      let limit: number | undefined;
      const limitIdx = args.indexOf("--limit");
      const limitArg = limitIdx !== -1 ? args[limitIdx + 1] : undefined;
      if (limitArg) {
        const parsed = parseInt(limitArg, 10);
        if (!isNaN(parsed) && parsed > 0) {
          limit = parsed;
        }
      }
      // Also check short form -n
      const nIdx = args.indexOf("-n");
      const nArg = nIdx !== -1 ? args[nIdx + 1] : undefined;
      if (nArg) {
        const parsed = parseInt(nArg, 10);
        if (!isNaN(parsed) && parsed > 0) {
          limit = parsed;
        }
      }

      const entries = listHistory({ limit });

      if (entries.length === 0) {
        console.log("No transcription history found.");
      } else {
        console.log("Recent transcriptions:");
        console.log();
        for (const entry of entries) {
          const date = new Date(entry.timestamp);
          const dateStr = date.toLocaleString();
          // Truncate text for display
          const preview =
            entry.text.length > 80
              ? entry.text.substring(0, 80).replace(/\n/g, " ") + "..."
              : entry.text.replace(/\n/g, " ");
          console.log(`[${dateStr}]`);
          console.log(`  ${preview}`);
          console.log();
        }
        console.log(`Total: ${entries.length} entries`);
      }
      break;
    }
    case "tui":
      console.log("tui: not implemented yet");
      break;
    case "doctor":
      console.log("doctor: not implemented yet");
      break;
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
