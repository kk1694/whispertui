/**
 * History Component
 *
 * Displays a scrollable list of transcription history entries.
 * Supports navigation with arrow keys, selection, and filtering.
 */

import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { HistoryEntry } from "../../history/index.ts";

export interface HistoryProps {
  /** History entries to display */
  entries: HistoryEntry[];
  /** Whether the component is active/focused */
  isActive: boolean;
  /** Callback when an entry is selected (Enter pressed) */
  onSelect?: (entry: HistoryEntry) => void;
  /** Callback when user wants to go back (Escape/q) */
  onBack?: () => void;
  /** Maximum visible entries (for scrolling) */
  maxVisible?: number;
}

/** Format a timestamp for display */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (isToday) {
    return time;
  }

  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${dateStr} ${time}`;
}

/** Truncate text to a given length */
function truncateText(text: string, maxLength: number): string {
  // Replace newlines with spaces for preview
  const singleLine = text.replace(/\n/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return singleLine.substring(0, maxLength - 3) + "...";
}

/**
 * History browser component
 */
export function History({
  entries,
  isActive,
  onSelect,
  onBack,
  maxVisible = 10,
}: HistoryProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [filterText, setFilterText] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);

  // Filter entries based on search text
  const filteredEntries = useMemo(() => {
    if (!filterText) {
      return entries;
    }
    const lower = filterText.toLowerCase();
    return entries.filter((entry) => entry.text.toLowerCase().includes(lower));
  }, [entries, filterText]);

  // Reset selection when entries change or filter changes
  useEffect(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, [entries.length, filterText]);

  // Handle keyboard input
  useInput(
    (input, key) => {
      if (!isActive) return;

      // Handle filter mode
      if (isFiltering) {
        if (key.escape) {
          setIsFiltering(false);
          setFilterText("");
          return;
        }
        if (key.return) {
          setIsFiltering(false);
          return;
        }
        if (key.backspace || key.delete) {
          setFilterText((prev) => prev.slice(0, -1));
          return;
        }
        // Add printable characters to filter
        if (input && !key.ctrl && !key.meta) {
          setFilterText((prev) => prev + input);
          return;
        }
        return;
      }

      // Normal mode keyboard handling
      if (key.escape || input === "q") {
        onBack?.();
        return;
      }

      // Enter filter mode
      if (input === "/" || input === "f") {
        setIsFiltering(true);
        return;
      }

      // Clear filter
      if (input === "c" && filterText) {
        setFilterText("");
        return;
      }

      // Select entry
      if (key.return && filteredEntries.length > 0) {
        const entry = filteredEntries[selectedIndex];
        if (entry) {
          onSelect?.(entry);
        }
        return;
      }

      // Navigation
      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => {
          const newIndex = Math.max(0, prev - 1);
          // Adjust scroll if selection goes above visible area
          if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
          return newIndex;
        });
        return;
      }

      if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => {
          const newIndex = Math.min(filteredEntries.length - 1, prev + 1);
          // Adjust scroll if selection goes below visible area
          if (newIndex >= scrollOffset + maxVisible) {
            setScrollOffset(newIndex - maxVisible + 1);
          }
          return newIndex;
        });
        return;
      }

      // Page navigation
      if (key.pageUp) {
        setSelectedIndex((prev) => {
          const newIndex = Math.max(0, prev - maxVisible);
          setScrollOffset(Math.max(0, scrollOffset - maxVisible));
          return newIndex;
        });
        return;
      }

      if (key.pageDown) {
        setSelectedIndex((prev) => {
          const newIndex = Math.min(
            filteredEntries.length - 1,
            prev + maxVisible
          );
          setScrollOffset(
            Math.min(
              Math.max(0, filteredEntries.length - maxVisible),
              scrollOffset + maxVisible
            )
          );
          return newIndex;
        });
        return;
      }

      // Home/End
      if (key.home || input === "g") {
        setSelectedIndex(0);
        setScrollOffset(0);
        return;
      }

      if (key.end || input === "G") {
        setSelectedIndex(filteredEntries.length - 1);
        setScrollOffset(Math.max(0, filteredEntries.length - maxVisible));
        return;
      }
    },
    { isActive }
  );

  // Compute visible entries
  const visibleEntries = filteredEntries.slice(
    scrollOffset,
    scrollOffset + maxVisible
  );

  // Empty state
  if (entries.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            History
          </Text>
        </Box>
        <Box>
          <Text dimColor>No transcriptions yet.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text color="yellow">q</Text>
          <Text dimColor> to go back</Text>
        </Box>
      </Box>
    );
  }

  // No matches for filter
  if (filteredEntries.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            History
          </Text>
          {filterText && (
            <Text dimColor> - filter: "{filterText}"</Text>
          )}
        </Box>
        <Box>
          <Text dimColor>No matches found.</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text color="yellow">c</Text>
          <Text dimColor> to clear filter, </Text>
          <Text color="yellow">q</Text>
          <Text dimColor> to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          History
        </Text>
        <Text dimColor>
          {" "}
          ({filteredEntries.length}
          {filterText ? ` matching "${filterText}"` : " entries"})
        </Text>
      </Box>

      {/* Filter input */}
      {isFiltering && (
        <Box marginBottom={1}>
          <Text color="yellow">Filter: </Text>
          <Text>{filterText}</Text>
          <Text color="gray">█</Text>
        </Box>
      )}

      {/* Scroll indicator (top) */}
      {scrollOffset > 0 && (
        <Box>
          <Text dimColor>  ↑ {scrollOffset} more above</Text>
        </Box>
      )}

      {/* Entry list */}
      {visibleEntries.map((entry, idx) => {
        const actualIndex = scrollOffset + idx;
        const isSelected = actualIndex === selectedIndex;

        return (
          <Box key={entry.id}>
            {/* Selection indicator */}
            <Text color={isSelected ? "cyan" : undefined}>
              {isSelected ? "▶ " : "  "}
            </Text>

            {/* Timestamp */}
            <Text dimColor>{formatTimestamp(entry.timestamp)} </Text>

            {/* Preview text */}
            <Text color={isSelected ? "white" : undefined}>
              {truncateText(entry.text, 50)}
            </Text>
          </Box>
        );
      })}

      {/* Scroll indicator (bottom) */}
      {scrollOffset + maxVisible < filteredEntries.length && (
        <Box>
          <Text dimColor>
            {"  "}↓ {filteredEntries.length - scrollOffset - maxVisible} more
            below
          </Text>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Keyboard:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Box>
            <Text color="yellow">↑/↓</Text>
            <Text dimColor> Navigate  </Text>
            <Text color="yellow">Enter</Text>
            <Text dimColor> Copy to clipboard</Text>
          </Box>
          <Box>
            <Text color="yellow">/</Text>
            <Text dimColor> Search  </Text>
            <Text color="yellow">c</Text>
            <Text dimColor> Clear filter  </Text>
            <Text color="yellow">q</Text>
            <Text dimColor> Back</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default History;
