#!/usr/bin/env bun
/**
 * WhisperTUI - Terminal-based voice transcription tool for Linux/Wayland
 * Entry point with CLI command routing
 */

import { ensureAllDirs, paths } from "./config/paths.ts";

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

  // Command routing (stubs for now)
  switch (command) {
    case "start":
      console.log("start: not implemented yet");
      break;
    case "stop":
      console.log("stop: not implemented yet");
      break;
    case "toggle":
      console.log("toggle: not implemented yet");
      break;
    case "status":
      console.log("status: not implemented yet");
      break;
    case "shutdown":
      console.log("shutdown: not implemented yet");
      break;
    case "daemon":
      console.log("daemon: not implemented yet");
      break;
    case "config":
      // Print XDG paths for now (will show actual config later)
      console.log("WhisperTUI Configuration Paths:");
      console.log(`  Config:  ${paths.config()}`);
      console.log(`  State:   ${paths.state()}`);
      console.log(`  Data:    ${paths.data()}`);
      console.log(`  Cache:   ${paths.cache()}`);
      console.log(`  Socket:  ${paths.socket()}`);
      console.log(`  History: ${paths.history()}`);
      break;
    case "history":
      console.log("history: not implemented yet");
      break;
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
