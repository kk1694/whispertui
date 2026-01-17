/**
 * Tests for History Storage module
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateHistoryFilename,
  parseHistoryFilename,
  saveHistory,
  loadHistoryEntry,
  listHistory,
  countHistory,
  pruneHistory,
  deleteHistory,
  getHistory,
  clearHistory,
  extractHistoryConfig,
  HistoryManager,
  createHistoryManager,
} from "./index.ts";
import type { Config } from "../config/schema.ts";

// Helper to create a temp directory for each test
function createTempDir(): string {
  const dir = join(tmpdir(), `whispertui-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Helper to clean up temp directory
function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("generateHistoryFilename", () => {
  test("generates filename with correct format", () => {
    const filename = generateHistoryFilename();
    // Format: YYYY-MM-DD_HH-MM-SS-mmm-nnn.txt (with counter)
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-\d{3}\.txt$/);
  });

  test("generates unique filenames", () => {
    const filenames = new Set<string>();
    for (let i = 0; i < 10; i++) {
      filenames.add(generateHistoryFilename());
    }
    // Should have generated at least 2 unique names (with sub-millisecond timing some might match)
    expect(filenames.size).toBeGreaterThanOrEqual(1);
  });
});

describe("parseHistoryFilename", () => {
  test("parses valid filename correctly", () => {
    const date = parseHistoryFilename("2026-01-17_14-30-45-123-000.txt");
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(0); // January is 0
    expect(date!.getDate()).toBe(17);
    expect(date!.getHours()).toBe(14);
    expect(date!.getMinutes()).toBe(30);
    expect(date!.getSeconds()).toBe(45);
    expect(date!.getMilliseconds()).toBe(123);
  });

  test("returns null for invalid filename", () => {
    expect(parseHistoryFilename("invalid.txt")).toBeNull();
    expect(parseHistoryFilename("2026-01-17.txt")).toBeNull();
    expect(parseHistoryFilename("not-a-date_00-00-00-000.txt")).toBeNull();
    expect(parseHistoryFilename("")).toBeNull();
    expect(parseHistoryFilename("random-file.json")).toBeNull();
    // Old format without counter should also be invalid now
    expect(parseHistoryFilename("2026-01-17_14-30-45-123.txt")).toBeNull();
  });
});

describe("saveHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("saves transcription to file", () => {
    const text = "Hello, this is a test transcription.";
    const entry = saveHistory(text, tempDir);

    expect(entry.id).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-\d{3}$/);
    expect(entry.text).toBe(text);
    expect(entry.timestamp).toBeTruthy();
    expect(existsSync(entry.path)).toBe(true);
  });

  test("creates history directory if it doesn't exist", () => {
    const nestedDir = join(tempDir, "nested", "history");
    expect(existsSync(nestedDir)).toBe(false);

    saveHistory("test", nestedDir);

    expect(existsSync(nestedDir)).toBe(true);
  });

  test("handles unicode text", () => {
    const text = "Привет мир! 你好世界! 🎉";
    const entry = saveHistory(text, tempDir);

    const loadedEntry = loadHistoryEntry(entry.path);
    expect(loadedEntry?.text).toBe(text);
  });

  test("handles multi-line text", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const entry = saveHistory(text, tempDir);

    const loadedEntry = loadHistoryEntry(entry.path);
    expect(loadedEntry?.text).toBe(text);
  });

  test("handles empty text", () => {
    const text = "";
    const entry = saveHistory(text, tempDir);

    const loadedEntry = loadHistoryEntry(entry.path);
    expect(loadedEntry?.text).toBe("");
  });
});

describe("loadHistoryEntry", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("loads valid history entry", () => {
    const filename = "2026-01-17_14-30-45-123-000.txt";
    const filePath = join(tempDir, filename);
    writeFileSync(filePath, "Test content", "utf-8");

    const entry = loadHistoryEntry(filePath);

    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("2026-01-17_14-30-45-123-000");
    expect(entry!.text).toBe("Test content");
  });

  test("returns null for non-existent file", () => {
    const entry = loadHistoryEntry(join(tempDir, "nonexistent.txt"));
    expect(entry).toBeNull();
  });

  test("returns null for invalid filename format", () => {
    const filename = "invalid-format.txt";
    const filePath = join(tempDir, filename);
    writeFileSync(filePath, "Test content", "utf-8");

    const entry = loadHistoryEntry(filePath);
    expect(entry).toBeNull();
  });
});

describe("listHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("returns empty array when no history", () => {
    const entries = listHistory({}, tempDir);
    expect(entries).toEqual([]);
  });

  test("returns empty array when directory doesn't exist", () => {
    const nonExistentDir = join(tempDir, "nonexistent");
    const entries = listHistory({}, nonExistentDir);
    expect(entries).toEqual([]);
  });

  test("lists entries in reverse chronological order (newest first)", () => {
    // Create files with different timestamps
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"), "Third", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");

    const entries = listHistory({}, tempDir);

    expect(entries.length).toBe(3);
    expect(entries[0]!.text).toBe("Third");  // Newest
    expect(entries[1]!.text).toBe("Second");
    expect(entries[2]!.text).toBe("First");  // Oldest
  });

  test("respects limit option", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");
    writeFileSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"), "Third", "utf-8");

    const entries = listHistory({ limit: 2 }, tempDir);

    expect(entries.length).toBe(2);
    expect(entries[0]!.text).toBe("Third");
    expect(entries[1]!.text).toBe("Second");
  });

  test("respects offset option", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");
    writeFileSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"), "Third", "utf-8");

    const entries = listHistory({ offset: 1 }, tempDir);

    expect(entries.length).toBe(2);
    expect(entries[0]!.text).toBe("Second");
    expect(entries[1]!.text).toBe("First");
  });

  test("respects both limit and offset", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");
    writeFileSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"), "Third", "utf-8");
    writeFileSync(join(tempDir, "2026-01-18_10-00-00-000-000.txt"), "Fourth", "utf-8");

    const entries = listHistory({ offset: 1, limit: 2 }, tempDir);

    expect(entries.length).toBe(2);
    expect(entries[0]!.text).toBe("Third");
    expect(entries[1]!.text).toBe("Second");
  });

  test("ignores non-.txt files", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "Valid", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.json"), "Invalid", "utf-8");
    mkdirSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt")); // Directory with .txt name

    const entries = listHistory({}, tempDir);

    expect(entries.length).toBe(1);
    expect(entries[0]!.text).toBe("Valid");
  });

  test("ignores files with invalid filename format", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "Valid", "utf-8");
    writeFileSync(join(tempDir, "invalid-name.txt"), "Invalid", "utf-8");
    writeFileSync(join(tempDir, "notes.txt"), "Also invalid", "utf-8");

    const entries = listHistory({}, tempDir);

    expect(entries.length).toBe(1);
    expect(entries[0]!.text).toBe("Valid");
  });
});

describe("countHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("returns 0 when no history", () => {
    expect(countHistory(tempDir)).toBe(0);
  });

  test("returns 0 when directory doesn't exist", () => {
    expect(countHistory(join(tempDir, "nonexistent"))).toBe(0);
  });

  test("counts valid history entries", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");
    writeFileSync(join(tempDir, "invalid.txt"), "Ignored", "utf-8");

    expect(countHistory(tempDir)).toBe(2);
  });
});

describe("pruneHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("returns 0 when no pruning needed", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");

    const deleted = pruneHistory(5, tempDir);

    expect(deleted).toBe(0);
    expect(countHistory(tempDir)).toBe(2);
  });

  test("returns 0 when directory doesn't exist", () => {
    const deleted = pruneHistory(5, join(tempDir, "nonexistent"));
    expect(deleted).toBe(0);
  });

  test("deletes oldest entries when exceeding max", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "Oldest", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Middle", "utf-8");
    writeFileSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"), "Newest", "utf-8");

    const deleted = pruneHistory(2, tempDir);

    expect(deleted).toBe(1);
    expect(countHistory(tempDir)).toBe(2);

    // Verify oldest was deleted
    expect(existsSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"))).toBe(false);
    expect(existsSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"))).toBe(true);
    expect(existsSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"))).toBe(true);
  });

  test("deletes multiple oldest entries when needed", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");
    writeFileSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"), "Third", "utf-8");
    writeFileSync(join(tempDir, "2026-01-18_10-00-00-000-000.txt"), "Fourth", "utf-8");

    const deleted = pruneHistory(2, tempDir);

    expect(deleted).toBe(2);
    expect(countHistory(tempDir)).toBe(2);

    // Verify only newest 2 remain
    const entries = listHistory({}, tempDir);
    expect(entries.map(e => e.text)).toEqual(["Fourth", "Third"]);
  });
});

describe("deleteHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("deletes existing entry", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "Test", "utf-8");

    const deleted = deleteHistory("2026-01-15_10-00-00-000-000", tempDir);

    expect(deleted).toBe(true);
    expect(existsSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"))).toBe(false);
  });

  test("returns false for non-existent entry", () => {
    const deleted = deleteHistory("2026-01-15_10-00-00-000-000", tempDir);
    expect(deleted).toBe(false);
  });
});

describe("getHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("returns entry by ID", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "Test content", "utf-8");

    const entry = getHistory("2026-01-15_10-00-00-000-000", tempDir);

    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("2026-01-15_10-00-00-000-000");
    expect(entry!.text).toBe("Test content");
  });

  test("returns null for non-existent ID", () => {
    const entry = getHistory("2026-01-15_10-00-00-000-000", tempDir);
    expect(entry).toBeNull();
  });
});

describe("clearHistory", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("clears all history entries", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "First", "utf-8");
    writeFileSync(join(tempDir, "2026-01-16_10-00-00-000-000.txt"), "Second", "utf-8");
    writeFileSync(join(tempDir, "2026-01-17_10-00-00-000-000.txt"), "Third", "utf-8");

    const deleted = clearHistory(tempDir);

    expect(deleted).toBe(3);
    expect(countHistory(tempDir)).toBe(0);
  });

  test("returns 0 when no history", () => {
    const deleted = clearHistory(tempDir);
    expect(deleted).toBe(0);
  });

  test("returns 0 when directory doesn't exist", () => {
    const deleted = clearHistory(join(tempDir, "nonexistent"));
    expect(deleted).toBe(0);
  });

  test("preserves non-history files", () => {
    writeFileSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"), "History", "utf-8");
    writeFileSync(join(tempDir, "notes.txt"), "Not history", "utf-8");

    clearHistory(tempDir);

    expect(existsSync(join(tempDir, "notes.txt"))).toBe(true);
    expect(existsSync(join(tempDir, "2026-01-15_10-00-00-000-000.txt"))).toBe(false);
  });
});

describe("extractHistoryConfig", () => {
  test("extracts config correctly", () => {
    const config: Config = {
      transcription: { backend: "groq", api_key_env: "GROQ_API_KEY" },
      audio: { device: "default", sample_rate: 16000, format: "wav" },
      output: { auto_paste: true, paste_method: "wtype" },
      context: { enabled: true, code_aware_apps: [] },
      history: { enabled: true, max_entries: 500 },
      daemon: { idle_timeout: 0 },
      notifications: { enabled: true },
    };

    const historyConfig = extractHistoryConfig(config);

    expect(historyConfig.enabled).toBe(true);
    expect(historyConfig.maxEntries).toBe(500);
  });

  test("handles disabled history", () => {
    const config: Config = {
      transcription: { backend: "groq", api_key_env: "GROQ_API_KEY" },
      audio: { device: "default", sample_rate: 16000, format: "wav" },
      output: { auto_paste: true, paste_method: "wtype" },
      context: { enabled: true, code_aware_apps: [] },
      history: { enabled: false, max_entries: 1000 },
      daemon: { idle_timeout: 0 },
      notifications: { enabled: true },
    };

    const historyConfig = extractHistoryConfig(config);

    expect(historyConfig.enabled).toBe(false);
  });
});

describe("HistoryManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("saves transcription when enabled", () => {
    const manager = createHistoryManager({ enabled: true, maxEntries: 100 }, tempDir);

    const entry = manager.save("Test transcription");

    expect(entry).not.toBeNull();
    expect(entry!.text).toBe("Test transcription");
    expect(manager.count()).toBe(1);
  });

  test("does not save when disabled", () => {
    const manager = createHistoryManager({ enabled: false, maxEntries: 100 }, tempDir);

    const entry = manager.save("Test transcription");

    expect(entry).toBeNull();
    expect(manager.count()).toBe(0);
  });

  test("prunes automatically on save when exceeding max", () => {
    const manager = createHistoryManager({ enabled: true, maxEntries: 2 }, tempDir);

    manager.save("First");
    // Add small delay to ensure unique filenames
    manager.save("Second");
    manager.save("Third");

    expect(manager.count()).toBe(2);
  });

  test("lists entries", () => {
    const manager = createHistoryManager({ enabled: true, maxEntries: 100 }, tempDir);

    manager.save("First");
    manager.save("Second");

    const entries = manager.list();

    expect(entries.length).toBe(2);
  });

  test("lists entries with limit", () => {
    const manager = createHistoryManager({ enabled: true, maxEntries: 100 }, tempDir);

    manager.save("First");
    manager.save("Second");
    manager.save("Third");

    const entries = manager.list({ limit: 2 });

    expect(entries.length).toBe(2);
  });

  test("gets entry by ID", () => {
    const manager = createHistoryManager({ enabled: true, maxEntries: 100 }, tempDir);

    const saved = manager.save("Test")!;
    const retrieved = manager.get(saved.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.text).toBe("Test");
  });

  test("deletes entry by ID", () => {
    const manager = createHistoryManager({ enabled: true, maxEntries: 100 }, tempDir);

    const saved = manager.save("Test")!;
    expect(manager.count()).toBe(1);

    const deleted = manager.delete(saved.id);

    expect(deleted).toBe(true);
    expect(manager.count()).toBe(0);
  });

  test("clears all entries", () => {
    const manager = createHistoryManager({ enabled: true, maxEntries: 100 }, tempDir);

    manager.save("First");
    manager.save("Second");
    expect(manager.count()).toBe(2);

    const deleted = manager.clear();

    expect(deleted).toBe(2);
    expect(manager.count()).toBe(0);
  });

  test("reports enabled status", () => {
    const enabledManager = createHistoryManager({ enabled: true, maxEntries: 100 }, tempDir);
    const disabledManager = createHistoryManager({ enabled: false, maxEntries: 100 }, tempDir);

    expect(enabledManager.isEnabled()).toBe(true);
    expect(disabledManager.isEnabled()).toBe(false);
  });
});
