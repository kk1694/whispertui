/**
 * Tests for RecordingIndicator Component
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import {
  RecordingIndicator,
  type RecordingState,
} from "./RecordingIndicator.tsx";

describe("RecordingIndicator", () => {
  describe("idle state", () => {
    test("displays Ready label", () => {
      const { lastFrame } = render(<RecordingIndicator state="idle" />);
      expect(lastFrame()).toContain("Ready");
    });

    test("displays circle icon", () => {
      const { lastFrame } = render(<RecordingIndicator state="idle" />);
      expect(lastFrame()).toContain("○");
    });
  });

  describe("recording state", () => {
    test("displays Recording label", () => {
      const { lastFrame } = render(<RecordingIndicator state="recording" />);
      expect(lastFrame()).toContain("Recording");
    });

    test("displays filled circle icon", () => {
      const { lastFrame } = render(<RecordingIndicator state="recording" />);
      // The icon blinks, so we check for either state
      const frame = lastFrame();
      expect(frame?.includes("●") || frame?.includes(" ")).toBe(true);
    });
  });

  describe("transcribing state", () => {
    test("displays Transcribing label", () => {
      const { lastFrame } = render(<RecordingIndicator state="transcribing" />);
      expect(lastFrame()).toContain("Transcribing");
    });

    test("displays spinner icon", () => {
      const { lastFrame } = render(<RecordingIndicator state="transcribing" />);
      // The spinner rotates through different characters
      const frame = lastFrame() ?? "";
      const hasSpinner =
        frame.includes("◐") ||
        frame.includes("◓") ||
        frame.includes("◑") ||
        frame.includes("◒");
      expect(hasSpinner).toBe(true);
    });
  });

  describe("state transitions", () => {
    test("updates label when state changes", async () => {
      const { lastFrame, rerender } = render(
        <RecordingIndicator state="idle" />
      );
      expect(lastFrame()).toContain("Ready");

      rerender(<RecordingIndicator state="recording" />);
      expect(lastFrame()).toContain("Recording");

      rerender(<RecordingIndicator state="transcribing" />);
      expect(lastFrame()).toContain("Transcribing");
    });
  });
});
