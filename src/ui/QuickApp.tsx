/**
 * QuickApp - Minimal TUI for Quick Transcribe & Paste
 *
 * Auto-starts recording on mount, transcribes on Enter, exits with text.
 * User presses Escape to cancel.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  RecordingIndicator,
  type RecordingState,
} from "./components/RecordingIndicator.tsx";
import {
  sendCommand,
  DaemonNotRunningError,
  ConnectionTimeoutError,
} from "../client/index.ts";
import type { DaemonResponse } from "../daemon/server.ts";

/** Polling interval for status updates in milliseconds */
const STATUS_POLL_INTERVAL = 200;

/** Result passed back when exiting */
export interface QuickResult {
  /** Whether transcription was successful */
  success: boolean;
  /** The transcribed text (if successful) */
  text?: string;
  /** Error message (if failed) */
  error?: string;
  /** Whether the user cancelled */
  cancelled?: boolean;
}

export interface QuickAppProps {
  /** Callback when the app should exit with a result */
  onExit: (result: QuickResult) => void;
  /** Skip daemon connection (for testing) */
  skipDaemon?: boolean;
}

/**
 * Minimal TUI for quick transcription
 */
export function QuickApp({
  onExit,
  skipDaemon = false,
}: QuickAppProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const hasStartedRef = useRef(false);
  const isExitingRef = useRef(false);

  // Handle daemon response
  const handleResponse = useCallback((response: DaemonResponse) => {
    if (response.success) {
      if (response.state) {
        setState(response.state as RecordingState);
      }
    } else {
      setError(response.error ?? "Unknown error");
    }
  }, []);

  // Start recording on mount
  useEffect(() => {
    if (skipDaemon) {
      setIsConnected(true);
      setState("recording");
      return;
    }

    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const startRecording = async () => {
      try {
        const response = await sendCommand("start", { timeout: 2000, silent: true });
        setIsConnected(true);
        handleResponse(response);
      } catch (err) {
        setIsConnected(true);
        if (
          err instanceof DaemonNotRunningError ||
          err instanceof ConnectionTimeoutError
        ) {
          setError("Daemon not running");
        } else if (err instanceof Error) {
          setError(err.message);
        }
      }
    };

    startRecording();
  }, [skipDaemon, handleResponse]);

  // Poll for transcription result after stopping
  const pollForResult = useCallback(async (): Promise<QuickResult> => {
    const maxAttempts = 60; // 30 seconds max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await sendCommand("status", { timeout: 2000 });
        if (response.success && response.state === "idle") {
          if (response.context?.lastTranscription) {
            return { success: true, text: response.context.lastTranscription };
          }
          if (response.context?.lastError) {
            return { success: false, error: response.context.lastError };
          }
          // Wait a bit more - transcription might still be setting the result
          if (attempts > 5) {
            return { success: false, error: "No transcription result" };
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          return { success: false, error: err.message };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL));
      attempts++;
    }

    return { success: false, error: "Transcription timed out" };
  }, []);

  // Handle Enter - stop and transcribe (first Enter press)
  const handleTranscribe = useCallback(async () => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    if (skipDaemon) {
      setTranscribedText("Test transcription");
      isExitingRef.current = false;
      return;
    }

    try {
      setState("transcribing");
      const response = await sendCommand("stop");
      handleResponse(response);

      if (!response.success) {
        setError(response.error ?? "Failed to stop recording");
        isExitingRef.current = false;
        return;
      }

      // Poll for the result
      const result = await pollForResult();
      if (result.success && result.text) {
        setTranscribedText(result.text);
      } else {
        setError(result.error ?? "No transcription result");
      }
      isExitingRef.current = false;
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unknown error");
      }
      isExitingRef.current = false;
    }
  }, [skipDaemon, handleResponse, pollForResult]);

  // Handle Enter - confirm and exit (second Enter press)
  const handleConfirm = useCallback(() => {
    if (transcribedText) {
      onExit({ success: true, text: transcribedText });
      exit();
    }
  }, [transcribedText, onExit, exit]);

  // Handle Escape - cancel
  const handleCancel = useCallback(async () => {
    if (isExitingRef.current) return;
    isExitingRef.current = true;

    if (!skipDaemon && state === "recording") {
      // Send stop but ignore result
      try {
        await sendCommand("stop");
      } catch {
        // Ignore errors on cancel
      }
    }

    onExit({ success: false, cancelled: true });
    exit();
  }, [skipDaemon, state, onExit, exit]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (key.escape) {
        handleCancel();
        return;
      }

      if (key.return) {
        if (state === "recording") {
          handleTranscribe();
        } else if (transcribedText) {
          handleConfirm();
        }
        return;
      }
    },
    { isActive: isConnected && !isExitingRef.current }
  );

  // Render error state
  if (error && !isExitingRef.current) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
        <Box>
          <Text dimColor>Press </Text>
          <Text color="yellow">Esc</Text>
          <Text dimColor> to exit</Text>
        </Box>
      </Box>
    );
  }

  // Render transcription preview
  if (transcribedText) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text>{transcribedText}</Text>
        </Box>
        <Box flexDirection="row" gap={2}>
          <Box>
            <Text color="green">Enter</Text>
            <Text dimColor> confirm</Text>
          </Box>
          <Box>
            <Text color="yellow">Esc</Text>
            <Text dimColor> cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Recording indicator */}
      <Box marginBottom={1}>
        <RecordingIndicator state={state} />
      </Box>

      {/* Keybind hints */}
      <Box flexDirection="row" gap={2}>
        {state === "recording" && (
          <>
            <Box>
              <Text color="green">Enter</Text>
              <Text dimColor> transcribe</Text>
            </Box>
            <Box>
              <Text color="yellow">Esc</Text>
              <Text dimColor> cancel</Text>
            </Box>
          </>
        )}
        {state === "transcribing" && (
          <Text dimColor>Processing...</Text>
        )}
      </Box>
    </Box>
  );
}

export default QuickApp;
