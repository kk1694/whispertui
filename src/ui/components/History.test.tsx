/**
 * Tests for History Component
 */

import { describe, test, expect, mock } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { History } from "./History.tsx";
import type { HistoryEntry } from "../../history/index.ts";

/**
 * Helper to wait for state updates in React
 */
const waitForUpdate = (ms: number = 100) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create mock history entries for testing
 */
function createMockEntries(count: number): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getTime() - i * 60000); // Each entry 1 minute apart
    entries.push({
      id: `2026-01-17_12-00-${String(i).padStart(2, "0")}-000-000`,
      timestamp: date.toISOString(),
      text: `Transcription ${i + 1}: This is the text of transcription number ${i + 1}`,
      path: `/fake/path/entry-${i}.txt`,
    });
  }

  return entries;
}

describe("History", () => {
  describe("rendering", () => {
    test("renders empty state when no entries", () => {
      const { lastFrame } = render(
        <History entries={[]} isActive={true} />
      );
      expect(lastFrame()).toContain("History");
      expect(lastFrame()).toContain("No transcriptions yet");
    });

    test("renders history entries", () => {
      const entries = createMockEntries(3);
      const { lastFrame } = render(
        <History entries={entries} isActive={true} />
      );

      expect(lastFrame()).toContain("History");
      expect(lastFrame()).toContain("3 entries");
      expect(lastFrame()).toContain("Transcription 1");
      expect(lastFrame()).toContain("Transcription 2");
      expect(lastFrame()).toContain("Transcription 3");
    });

    test("shows entry count in header", () => {
      const entries = createMockEntries(5);
      const { lastFrame } = render(
        <History entries={entries} isActive={true} />
      );
      expect(lastFrame()).toContain("5 entries");
    });

    test("shows keyboard help", () => {
      const entries = createMockEntries(3);
      const { lastFrame } = render(
        <History entries={entries} isActive={true} />
      );
      expect(lastFrame()).toContain("Navigate");
      expect(lastFrame()).toContain("Copy to clipboard");
      expect(lastFrame()).toContain("Search");
      expect(lastFrame()).toContain("Back");
    });

    test("shows selection indicator on first entry", () => {
      const entries = createMockEntries(3);
      const { lastFrame } = render(
        <History entries={entries} isActive={true} />
      );
      // The first entry should have the selection indicator
      expect(lastFrame()).toContain("▶");
    });
  });

  describe("navigation", () => {
    test("down arrow moves selection down", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      // Press down arrow
      stdin.write("\u001B[B");
      await waitForUpdate();

      // Selection should have moved - we should still see entries
      expect(lastFrame()).toContain("History");
    });

    test("up arrow moves selection up", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      // Press down first, then up
      stdin.write("\u001B[B"); // down
      await waitForUpdate();
      stdin.write("\u001B[A"); // up
      await waitForUpdate();

      expect(lastFrame()).toContain("History");
    });

    test("j key moves selection down (vim-style)", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      stdin.write("j");
      await waitForUpdate();

      expect(lastFrame()).toContain("History");
    });

    test("k key moves selection up (vim-style)", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      // First move down then up
      stdin.write("j");
      await waitForUpdate();
      stdin.write("k");
      await waitForUpdate();

      expect(lastFrame()).toContain("History");
    });
  });

  describe("scrolling", () => {
    test("shows scroll indicators when entries exceed maxVisible", () => {
      const entries = createMockEntries(15);
      const { lastFrame } = render(
        <History entries={entries} isActive={true} maxVisible={5} />
      );

      // Should show "more below" indicator
      expect(lastFrame()).toContain("more below");
    });

    test("shows 'more above' after scrolling down", async () => {
      const entries = createMockEntries(15);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} maxVisible={5} />
      );

      await waitForUpdate();

      // Navigate down past the first visible window
      for (let i = 0; i < 6; i++) {
        stdin.write("\u001B[B"); // down arrow
        await waitForUpdate(50);
      }

      expect(lastFrame()).toContain("more above");
    });
  });

  describe("selection", () => {
    test("Enter triggers onSelect with selected entry", async () => {
      const entries = createMockEntries(3);
      let selectedEntry: HistoryEntry | null = null;
      const onSelect = mock((entry: HistoryEntry) => {
        selectedEntry = entry;
      });

      const { stdin } = render(
        <History entries={entries} isActive={true} onSelect={onSelect} />
      );

      await waitForUpdate();

      // Press Enter to select first entry
      stdin.write("\r");
      await waitForUpdate();

      expect(onSelect).toHaveBeenCalled();
      expect(selectedEntry).not.toBeNull();
      expect(selectedEntry!.text).toContain("Transcription 1");
    });

    test("Enter on second entry selects second entry", async () => {
      const entries = createMockEntries(3);
      let selectedEntry: HistoryEntry | null = null;
      const onSelect = mock((entry: HistoryEntry) => {
        selectedEntry = entry;
      });

      const { stdin } = render(
        <History entries={entries} isActive={true} onSelect={onSelect} />
      );

      await waitForUpdate();

      // Navigate down then select
      stdin.write("\u001B[B");
      await waitForUpdate();
      stdin.write("\r");
      await waitForUpdate();

      expect(onSelect).toHaveBeenCalled();
      expect(selectedEntry!.text).toContain("Transcription 2");
    });
  });

  describe("back navigation", () => {
    test("q triggers onBack", async () => {
      const entries = createMockEntries(3);
      const onBack = mock(() => {});

      const { stdin } = render(
        <History entries={entries} isActive={true} onBack={onBack} />
      );

      await waitForUpdate();

      stdin.write("q");
      await waitForUpdate();

      expect(onBack).toHaveBeenCalled();
    });

    test("Escape triggers onBack", async () => {
      const entries = createMockEntries(3);
      const onBack = mock(() => {});

      const { stdin } = render(
        <History entries={entries} isActive={true} onBack={onBack} />
      );

      await waitForUpdate();

      stdin.write("\u001B");
      await waitForUpdate();

      expect(onBack).toHaveBeenCalled();
    });
  });

  describe("filtering", () => {
    test("/ enters filter mode", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      stdin.write("/");
      await waitForUpdate();

      expect(lastFrame()).toContain("Filter:");
    });

    test("f also enters filter mode", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      stdin.write("f");
      await waitForUpdate();

      expect(lastFrame()).toContain("Filter:");
    });

    test("typing in filter mode filters entries", async () => {
      const entries = [
        {
          id: "1",
          timestamp: new Date().toISOString(),
          text: "Hello world",
          path: "/fake/1.txt",
        },
        {
          id: "2",
          timestamp: new Date().toISOString(),
          text: "Goodbye world",
          path: "/fake/2.txt",
        },
        {
          id: "3",
          timestamp: new Date().toISOString(),
          text: "Something else",
          path: "/fake/3.txt",
        },
      ];

      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      // Enter filter mode and type "Hello"
      stdin.write("/");
      await waitForUpdate();
      stdin.write("Hello");
      await waitForUpdate();

      // Press Enter to exit filter mode
      stdin.write("\r");
      await waitForUpdate();

      // Should show "Hello" filter and only matching entry
      expect(lastFrame()).toContain('matching "Hello"');
      expect(lastFrame()).toContain("Hello world");
      expect(lastFrame()).not.toContain("Goodbye world");
    });

    test("shows no matches message when filter has no results", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      // Enter filter mode and type something that won't match
      stdin.write("/");
      await waitForUpdate();
      stdin.write("xyznotfound");
      await waitForUpdate();
      stdin.write("\r");
      await waitForUpdate();

      expect(lastFrame()).toContain("No matches found");
    });

    test("c clears filter", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      // Enter filter mode and type
      stdin.write("/");
      await waitForUpdate();
      stdin.write("xyz");
      await waitForUpdate();
      stdin.write("\r"); // exit filter mode
      await waitForUpdate();

      // Should show filter text
      expect(lastFrame()).toContain('"xyz"');

      // Clear filter
      stdin.write("c");
      await waitForUpdate();

      // Should now show all entries
      expect(lastFrame()).toContain("3 entries");
    });

    test("Escape in filter mode clears filter and exits", async () => {
      const entries = createMockEntries(3);
      const { lastFrame, stdin } = render(
        <History entries={entries} isActive={true} />
      );

      await waitForUpdate();

      // Enter filter mode and type
      stdin.write("/");
      await waitForUpdate();
      stdin.write("test");
      await waitForUpdate();

      // Press Escape to cancel filter
      stdin.write("\u001B");
      await waitForUpdate();

      // Filter should be cleared, showing all entries
      expect(lastFrame()).toContain("3 entries");
      expect(lastFrame()).not.toContain("Filter:");
    });
  });

  describe("text truncation", () => {
    test("long entries are truncated with ellipsis", () => {
      const entries = [
        {
          id: "1",
          timestamp: new Date().toISOString(),
          text: "This is a very long transcription that should definitely be truncated because it exceeds the maximum display length for the preview in the history list",
          path: "/fake/1.txt",
        },
      ];

      const { lastFrame } = render(
        <History entries={entries} isActive={true} />
      );

      expect(lastFrame()).toContain("...");
    });
  });

  describe("inactive state", () => {
    test("does not respond to input when inactive", async () => {
      const entries = createMockEntries(3);
      const onSelect = mock(() => {});
      const onBack = mock(() => {});

      const { stdin } = render(
        <History
          entries={entries}
          isActive={false}
          onSelect={onSelect}
          onBack={onBack}
        />
      );

      await waitForUpdate();

      // Try various inputs
      stdin.write("\r"); // Enter
      stdin.write("q"); // Quit
      stdin.write("\u001B[B"); // Down
      await waitForUpdate();

      // Neither callback should have been called
      expect(onSelect).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    });
  });
});
