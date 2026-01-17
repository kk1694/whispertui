/**
 * RecordingIndicator Component
 *
 * Displays the current recording state with visual feedback.
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

export type RecordingState = "idle" | "recording" | "transcribing";

export interface RecordingIndicatorProps {
  /** Current recording state */
  state: RecordingState;
}

/** State display configuration */
const STATE_CONFIG: Record<
  RecordingState,
  { label: string; color: string; icon: string }
> = {
  idle: {
    label: "Ready",
    color: "gray",
    icon: "○",
  },
  recording: {
    label: "Recording",
    color: "red",
    icon: "●",
  },
  transcribing: {
    label: "Transcribing",
    color: "yellow",
    icon: "◐",
  },
};

/**
 * Recording indicator component with animated feedback
 */
export function RecordingIndicator({
  state,
}: RecordingIndicatorProps): React.ReactElement {
  const config = STATE_CONFIG[state];
  const [blink, setBlink] = useState(true);

  // Blink effect for recording state
  useEffect(() => {
    if (state !== "recording") {
      setBlink(true);
      return;
    }

    const interval = setInterval(() => {
      setBlink((prev) => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [state]);

  // Spin effect for transcribing state
  const [spinIndex, setSpinIndex] = useState(0);
  const spinChars = ["◐", "◓", "◑", "◒"];

  useEffect(() => {
    if (state !== "transcribing") {
      setSpinIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setSpinIndex((prev) => (prev + 1) % spinChars.length);
    }, 150);

    return () => clearInterval(interval);
  }, [state]);

  const displayIcon =
    state === "recording"
      ? blink
        ? config.icon
        : " "
      : state === "transcribing"
        ? spinChars[spinIndex]
        : config.icon;

  return (
    <Box>
      <Text color={config.color} bold>
        {displayIcon}
      </Text>
      <Text> </Text>
      <Text color={config.color} bold>
        {config.label}
      </Text>
    </Box>
  );
}

export default RecordingIndicator;
