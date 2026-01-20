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
import { History } from "./components/History.tsx";
import {
  sendCommand,
  DaemonNotRunningError,
  ConnectionTimeoutError,
} from "../client/index.ts";
import type { DaemonResponse } from "../daemon/server.ts";
import { listHistory, type HistoryEntry } from "../history/index.ts";
import { copyToClipboard } from "../output/clipboard.ts";

/** Polling interval for status updates in milliseconds */
const STATUS_POLL_INTERVAL = 500;

/** View modes for the TUI */
export type ViewMode = "main" | "history";

export interface AppProps {
  /** Initial daemon state (optional, will poll if not provided) */
  initialState?: RecordingState;
  /** Skip daemon connection (for testing) */
  skipDaemon?: boolean;
  /** Initial view mode (for testing) */
  initialView?: ViewMode;
  /** Mock history entries (for testing) */
  mockHistory?: HistoryEntry[];
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
  initialView = "main",
  mockHistory,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [state, setState] = useState<RecordingState>(initialState ?? "idle");
  const [context, setContext] = useState<StateContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string | null>(
    null
  );
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(
    mockHistory ?? []
  );
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  // Load history entries
  const loadHistory = useCallback(() => {
    if (mockHistory) {
      setHistoryEntries(mockHistory);
      return;
    }
    try {
      const entries = listHistory({ limit: 100 });
      setHistoryEntries(entries);
    } catch {
      // Silently fail - history view will show empty state
      setHistoryEntries([]);
    }
  }, [mockHistory]);

  // Load history on mount if starting in history view
  useEffect(() => {
    if (initialView === "history") {
      loadHistory();
    }
  }, [initialView, loadHistory]);

  // Handle history entry selection (copy to clipboard)
  const handleHistorySelect = useCallback(
    async (entry: HistoryEntry) => {
      if (skipDaemon) {
        // For testing - just show the message
        setCopyMessage("Copied to clipboard!");
        setTimeout(() => setCopyMessage(null), 2000);
        return;
      }

      try {
        await copyToClipboard(entry.text);
        // If launched directly in history mode, exit after copying
        if (initialView === "history") {
          process.exit(0);
        } else {
          setCopyMessage("Copied to clipboard!");
          setTimeout(() => setCopyMessage(null), 2000);
        }
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        }
      }
    },
    [skipDaemon, initialView, exit]
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

  // Handle keyboard input for main view
  useInput(
    (input, key) => {
      // Quit on 'q' or Ctrl+C (only when not in history view)
      if ((input === "q" || (key.ctrl && input === "c")) && viewMode === "main") {
        exit();
        return;
      }

      // Switch to history view on 'h'
      if (input === "h" && viewMode === "main") {
        loadHistory();
        setViewMode("history");
        return;
      }

      // Only handle these inputs when in main view
      if (viewMode !== "main") return;

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
    { isActive: isConnected && viewMode === "main" }
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

  // Render history view
  if (viewMode === "history") {
    return (
      <Box flexDirection="column" padding={1}>
        {/* Copy message notification */}
        {copyMessage && (
          <Box marginBottom={1}>
            <Text color="green">{copyMessage}</Text>
          </Box>
        )}

        {/* Error display */}
        {error && (
          <Box marginBottom={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        <History
          entries={historyEntries}
          isActive={true}
          onSelect={handleHistorySelect}
          onBack={() => {
            // If launched directly in history mode, exit; otherwise go to main view
            if (initialView === "history") {
              process.exit(0);
            } else {
              setViewMode("main");
            }
          }}
          maxVisible={10}
        />
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

      {/* Copy message notification */}
      {copyMessage && (
        <Box marginBottom={1}>
          <Text color="green">{copyMessage}</Text>
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
            <Text color="yellow">h</Text>
            <Text dimColor> - View history</Text>
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
