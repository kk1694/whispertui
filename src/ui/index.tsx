/**
 * TUI Entry Point
 *
 * Renders the main TUI application using Ink.
 */

import React from "react";
import { render } from "ink";
import { App } from "./App.tsx";
import { ensureDaemonRunning, DaemonStartError } from "../client/index.ts";

export interface TuiOptions {
  /** Skip daemon auto-start (for testing) */
  skipDaemon?: boolean;
}

/**
 * Launch the TUI application
 */
export async function launchTui(options: TuiOptions = {}): Promise<void> {
  const { skipDaemon = false } = options;

  // Ensure daemon is running before launching TUI
  if (!skipDaemon) {
    try {
      const wasAutoStarted = await ensureDaemonRunning();
      if (wasAutoStarted) {
        // Brief pause to let daemon stabilize
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      if (error instanceof DaemonStartError) {
        console.error(`Error: ${error.message}`);
        console.error("Try starting the daemon manually with: whispertui daemon");
        process.exit(1);
      }
      throw error;
    }
  }

  // Render the Ink app
  const { waitUntilExit } = render(
    <App skipDaemon={skipDaemon} />
  );

  // Wait for the app to exit
  await waitUntilExit();
}

export { App } from "./App.tsx";
export { RecordingIndicator } from "./components/RecordingIndicator.tsx";
