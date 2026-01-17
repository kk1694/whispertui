/**
 * WhisperTUI - Main TUI Application
 *
 * Interactive terminal interface for voice transcription.
 * Connects to the daemon via Unix socket and provides keyboard shortcuts
 * for recording control.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import {
  RecordingIndicator,
  type RecordingState,
} from "./components/RecordingIndicator.tsx";
import {
  sendCommand,
  isDaemonRunning,
  DaemonNotRunningError,
  ConnectionTimeoutError,
} from "../client/index.ts";
import type { DaemonResponse } from "../daemon/server.ts";

/** Polling interval for status updates in milliseconds */
const STATUS_POLL_INTERVAL = 500;

export interface AppProps {
  /** Initial daemon state (optional, will poll if not provided) */
  initialState?: RecordingState;
  /** Skip daemon connection (for testing) */
  skipDaemon?: boolean;
}

interface WindowContext {
  windowClass: string;
  windowTitle: string;
}

interface StateContext {
  currentWindow: WindowContext | null;
  lastError: string | null;
  lastTranscription: string | null;
}

/**
 * Main TUI Application Component
 */
export function App({
  initialState,
  skipDaemon = false,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<RecordingState>(initialState ?? "idle");
  const [context, setContext] = useState<StateContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string | null>(
    null
  );

  // Handle daemon response
  const handleResponse = useCallback((response: DaemonResponse) => {
    if (response.success) {
      if (response.state) {
        setState(response.state as RecordingState);
      }
      if (response.context) {
        setContext(response.context as StateContext);
        if (response.context.lastTranscription) {
          setLastTranscription(response.context.lastTranscription);
        }
      }
      setError(null);
    } else {
      setError(response.error ?? "Unknown error");
    }
  }, []);

  // Poll daemon status
  useEffect(() => {
    if (skipDaemon) {
      setIsConnected(true);
      return;
    }

    let isMounted = true;

    const pollStatus = async () => {
      try {
        const response = await sendCommand("status", { timeout: 2000 });
        if (isMounted) {
          handleResponse(response);
          setIsConnected(true);
        }
      } catch (err) {
        if (isMounted) {
          if (
            err instanceof DaemonNotRunningError ||
            err instanceof ConnectionTimeoutError
          ) {
            setIsConnected(false);
            setError("Daemon not running");
          } else if (err instanceof Error) {
            setError(err.message);
          }
        }
      }
    };

    // Initial poll
    pollStatus();

    // Set up polling interval
    const interval = setInterval(pollStatus, STATUS_POLL_INTERVAL);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [skipDaemon, handleResponse]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      // Quit on 'q' or Ctrl+C
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
        return;
      }

      // Toggle recording on Enter
      if (key.return) {
        toggleRecording();
        return;
      }

      // Start recording on 's' (when idle)
      if (input === "s" && state === "idle") {
        startRecording();
        return;
      }

      // Stop recording on space (when recording)
      if (input === " " && state === "recording") {
        stopRecording();
        return;
      }
    },
    { isActive: isConnected }
  );

  const toggleRecording = async () => {
    if (skipDaemon) {
      // For testing - just toggle state
      setState((prev) => (prev === "idle" ? "recording" : "idle"));
      return;
    }

    try {
      const command = state === "recording" ? "stop" : "start";
      const response = await sendCommand(command);
      handleResponse(response);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  const startRecording = async () => {
    if (skipDaemon) {
      setState("recording");
      return;
    }

    try {
      const response = await sendCommand("start");
      handleResponse(response);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  const stopRecording = async () => {
    if (skipDaemon) {
      setState("transcribing");
      // Simulate transcription completion
      setTimeout(() => {
        setState("idle");
        setLastTranscription("Test transcription");
      }, 1000);
      return;
    }

    try {
      const response = await sendCommand("stop");
      handleResponse(response);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  // Render disconnected state
  if (!isConnected && !skipDaemon) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            WhisperTUI
          </Text>
        </Box>
        <Box>
          <Text color="red">Disconnected from daemon</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Waiting for daemon connection...</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text color="yellow">q</Text>
          <Text dimColor> to quit</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          WhisperTUI
        </Text>
        <Text dimColor> - Voice Transcription</Text>
      </Box>

      {/* Status indicator */}
      <Box marginBottom={1}>
        <RecordingIndicator state={state} />
      </Box>

      {/* Window context (if available) */}
      {context?.currentWindow && (
        <Box marginBottom={1}>
          <Text dimColor>Window: </Text>
          <Text>{context.currentWindow.windowClass}</Text>
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Last transcription preview */}
      {lastTranscription && (
        <Box marginBottom={1} flexDirection="column">
          <Text dimColor>Last transcription:</Text>
          <Box marginLeft={2}>
            <Text>
              {lastTranscription.length > 60
                ? lastTranscription.substring(0, 60) + "..."
                : lastTranscription}
            </Text>
          </Box>
        </Box>
      )}

      {/* Keyboard shortcuts help */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Keyboard shortcuts:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Box>
            <Text color="yellow">Enter</Text>
            <Text dimColor> - Toggle recording</Text>
          </Box>
          <Box>
            <Text color="yellow">s</Text>
            <Text dimColor> - Start recording (when idle)</Text>
          </Box>
          <Box>
            <Text color="yellow">Space</Text>
            <Text dimColor> - Stop recording</Text>
          </Box>
          <Box>
            <Text color="yellow">q</Text>
            <Text dimColor> - Quit</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default App;
