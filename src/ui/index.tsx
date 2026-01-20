/**
 * TUI Entry Point
 *
 * Renders the main TUI application using Ink.
 */

import React from "react";
import { render } from "ink";
import { App } from "./App.tsx";
import { isDaemonRunning, isDaemonStarting, spawnDaemon } from "../client/index.ts";

export interface TuiOptions {
  /** Skip daemon auto-start (for testing) */
  skipDaemon?: boolean;
  /** Initial view mode */
  initialView?: "main" | "history";
}

/**
 * Launch the TUI application
 */
export async function launchTui(options: TuiOptions = {}): Promise<void> {
  const { skipDaemon = false, initialView } = options;

  // Try to auto-start daemon in background (non-blocking)
  if (!skipDaemon) {
    isDaemonRunning().then((running) => {
      if (!running && !isDaemonStarting()) {
        try {
          spawnDaemon();
        } catch {
          // Ignore - TUI will show disconnected state
        }
      }
    });
  }

  // Render TUI immediately
  const { waitUntilExit } = render(<App skipDaemon={skipDaemon} initialView={initialView} />);
  await waitUntilExit();
}

export { App } from "./App.tsx";
export { RecordingIndicator } from "./components/RecordingIndicator.tsx";
export { QuickApp } from "./QuickApp.tsx";
export { launchQuickTranscribe } from "./quick.tsx";
