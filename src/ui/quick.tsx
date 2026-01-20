/**
 * Quick Transcribe Entry Point
 *
 * Captures the current focused window, launches minimal TUI,
 * and after transcription restores focus and types the text.
 */

import React from "react";
import { render } from "ink";
import { QuickApp, type QuickResult } from "./QuickApp.tsx";
import { ensureDaemonRunning, DaemonStartError } from "../client/index.ts";
import { getActiveWindow, returnFocusToWindow } from "../context/hyprland.ts";
import { typeText } from "../output/typer.ts";

export interface QuickTranscribeOptions {
  /** Skip daemon auto-start (for testing) */
  skipDaemon?: boolean;
  /** Window address to return focus to after transcription */
  returnToAddress?: string;
}

/**
 * Launch the quick transcribe TUI
 *
 * Flow:
 * 1. Use provided window address (or try to detect current)
 * 2. Ensure daemon is running
 * 3. Launch minimal TUI (auto-starts recording)
 * 4. On completion: restore focus and type text
 */
export async function launchQuickTranscribe(
  options: QuickTranscribeOptions = {}
): Promise<void> {
  const { skipDaemon = false, returnToAddress } = options;

  // Use provided address or try to detect (detection won't work when launched in a terminal)
  let originalWindowAddress: string | null = returnToAddress ?? null;
  if (!originalWindowAddress) {
    try {
      const activeWindow = await getActiveWindow();
      if (activeWindow?.address) {
        originalWindowAddress = activeWindow.address;
      }
    } catch {
      // Hyprctl not available - we'll still work, just can't restore focus
    }
  }

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

  // Store result from QuickApp
  let result: QuickResult | null = null;

  // Render the quick TUI
  const { waitUntilExit } = render(
    <QuickApp
      skipDaemon={skipDaemon}
      onExit={(r) => {
        result = r;
      }}
    />
  );

  // Wait for the app to exit
  await waitUntilExit();

  // Handle the result
  if (result?.cancelled) {
    // User cancelled - just exit silently
    return;
  }

  if (!result?.success || !result.text) {
    // Transcription failed
    if (result?.error) {
      console.error(`Transcription failed: ${result.error}`);
    }
    process.exit(1);
  }

  // Success! Restore focus and type text
  // Wait for the terminal to fully close
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Restore focus to original window
  if (originalWindowAddress) {
    await returnFocusToWindow(originalWindowAddress);
    // Wait for focus to settle
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  // Type the transcribed text
  try {
    await typeText(result.text);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to type text: ${error.message}`);
    }
    process.exit(1);
  }
}
