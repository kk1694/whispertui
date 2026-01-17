/**
 * History Storage for WhisperTUI
 *
 * Saves and retrieves transcription history as timestamped files.
 * Supports listing, limiting, and pruning old entries.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";
import { getHistoryDir, ensureDir } from "../config/paths.ts";
import type { Config } from "../config/schema.ts";

/** A single history entry */
export interface HistoryEntry {
  /** Unique ID (timestamp-based filename without extension) */
  id: string;
  /** ISO 8601 timestamp when the transcription was created */
  timestamp: string;
  /** The transcribed text */
  text: string;
  /** File path where the entry is stored */
  path: string;
}

/** Options for listing history entries */
export interface ListHistoryOptions {
  /** Maximum number of entries to return (default: all) */
  limit?: number;
  /** Number of entries to skip (for pagination) */
  offset?: number;
}

/** History configuration extracted from Config */
export interface HistoryConfig {
  enabled: boolean;
  maxEntries: number;
}

/** Counter for generating unique filenames within the same millisecond */
let filenameCounter = 0;
let lastTimestamp = "";

/**
 * Generate a unique filename based on current timestamp
 * Format: YYYY-MM-DD_HH-MM-SS-mmm-nnn.txt
 * The trailing -nnn is a counter to ensure uniqueness within the same millisecond.
 */
export function generateHistoryFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const millis = String(now.getMilliseconds()).padStart(3, "0");

  const timestamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${millis}`;

  // Ensure uniqueness with a counter if multiple files created in same millisecond
  if (timestamp === lastTimestamp) {
    filenameCounter++;
  } else {
    filenameCounter = 0;
    lastTimestamp = timestamp;
  }

  const counter = String(filenameCounter).padStart(3, "0");
  return `${timestamp}-${counter}.txt`;
}

/**
 * Parse a history filename to extract the timestamp
 */
export function parseHistoryFilename(filename: string): Date | null {
  // Format: YYYY-MM-DD_HH-MM-SS-mmm-nnn.txt (with counter)
  const match = filename.match(
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})-(\d{3})\.txt$/
  );
  if (!match) {
    return null;
  }

  const year = match[1]!;
  const month = match[2]!;
  const day = match[3]!;
  const hours = match[4]!;
  const minutes = match[5]!;
  const seconds = match[6]!;
  const millis = match[7]!;
  // match[8] is the counter, not used for date parsing

  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hours),
    parseInt(minutes),
    parseInt(seconds),
    parseInt(millis)
  );
}

/**
 * Save a transcription to history
 *
 * @param text The transcribed text to save
 * @param historyDir Optional custom history directory (for testing)
 * @returns The saved history entry
 */
export function saveHistory(text: string, historyDir?: string): HistoryEntry {
  const dir = historyDir ?? getHistoryDir();
  ensureDir(dir);

  const filename = generateHistoryFilename();
  const filePath = join(dir, filename);
  const timestamp = new Date().toISOString();

  // Write the text content
  writeFileSync(filePath, text, "utf-8");

  return {
    id: basename(filename, ".txt"),
    timestamp,
    text,
    path: filePath,
  };
}

/**
 * Load a single history entry from a file
 *
 * @param filePath Path to the history file
 * @returns The history entry or null if file is invalid
 */
export function loadHistoryEntry(filePath: string): HistoryEntry | null {
  if (!existsSync(filePath)) {
    return null;
  }

  const filename = basename(filePath);
  const parsedDate = parseHistoryFilename(filename);

  if (!parsedDate) {
    // Invalid filename format - skip
    return null;
  }

  try {
    const text = readFileSync(filePath, "utf-8");
    return {
      id: basename(filename, ".txt"),
      timestamp: parsedDate.toISOString(),
      text,
      path: filePath,
    };
  } catch {
    // Error reading file - skip
    return null;
  }
}

/**
 * List history entries in reverse chronological order (newest first)
 *
 * @param options Listing options (limit, offset)
 * @param historyDir Optional custom history directory (for testing)
 * @returns Array of history entries
 */
export function listHistory(
  options?: ListHistoryOptions,
  historyDir?: string
): HistoryEntry[] {
  const dir = historyDir ?? getHistoryDir();

  if (!existsSync(dir)) {
    return [];
  }

  // Get all .txt files
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".txt") && parseHistoryFilename(f) !== null)
    .map((f) => ({
      filename: f,
      path: join(dir, f),
      date: parseHistoryFilename(f)!,
    }))
    // Sort by date descending (newest first)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Apply offset and limit
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? files.length;
  const sliced = files.slice(offset, offset + limit);

  // Load entries
  const entries: HistoryEntry[] = [];
  for (const file of sliced) {
    const entry = loadHistoryEntry(file.path);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * Get the total count of history entries
 *
 * @param historyDir Optional custom history directory (for testing)
 * @returns Number of history entries
 */
export function countHistory(historyDir?: string): number {
  const dir = historyDir ?? getHistoryDir();

  if (!existsSync(dir)) {
    return 0;
  }

  return readdirSync(dir).filter(
    (f) => f.endsWith(".txt") && parseHistoryFilename(f) !== null
  ).length;
}

/**
 * Prune old history entries to stay within max_entries limit
 *
 * @param maxEntries Maximum number of entries to keep
 * @param historyDir Optional custom history directory (for testing)
 * @returns Number of entries deleted
 */
export function pruneHistory(maxEntries: number, historyDir?: string): number {
  const dir = historyDir ?? getHistoryDir();

  if (!existsSync(dir)) {
    return 0;
  }

  // Get all valid history files sorted by date (oldest first for deletion)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".txt") && parseHistoryFilename(f) !== null)
    .map((f) => ({
      filename: f,
      path: join(dir, f),
      date: parseHistoryFilename(f)!,
    }))
    // Sort by date ascending (oldest first)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalCount = files.length;
  if (totalCount <= maxEntries) {
    return 0;
  }

  // Calculate how many to delete
  const deleteCount = totalCount - maxEntries;
  const toDelete = files.slice(0, deleteCount);

  let deleted = 0;
  for (const file of toDelete) {
    try {
      unlinkSync(file.path);
      deleted++;
    } catch {
      // Ignore deletion errors
    }
  }

  return deleted;
}

/**
 * Delete a specific history entry by ID
 *
 * @param id The history entry ID (filename without .txt extension)
 * @param historyDir Optional custom history directory (for testing)
 * @returns true if deleted, false if not found
 */
export function deleteHistory(id: string, historyDir?: string): boolean {
  const dir = historyDir ?? getHistoryDir();
  const filePath = join(dir, `${id}.txt`);

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a single history entry by ID
 *
 * @param id The history entry ID (filename without .txt extension)
 * @param historyDir Optional custom history directory (for testing)
 * @returns The history entry or null if not found
 */
export function getHistory(id: string, historyDir?: string): HistoryEntry | null {
  const dir = historyDir ?? getHistoryDir();
  const filePath = join(dir, `${id}.txt`);
  return loadHistoryEntry(filePath);
}

/**
 * Clear all history entries
 *
 * @param historyDir Optional custom history directory (for testing)
 * @returns Number of entries deleted
 */
export function clearHistory(historyDir?: string): number {
  const dir = historyDir ?? getHistoryDir();

  if (!existsSync(dir)) {
    return 0;
  }

  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".txt") && parseHistoryFilename(f) !== null
  );

  let deleted = 0;
  for (const filename of files) {
    try {
      unlinkSync(join(dir, filename));
      deleted++;
    } catch {
      // Ignore deletion errors
    }
  }

  return deleted;
}

/**
 * Extract history config from application Config
 */
export function extractHistoryConfig(config: Config): HistoryConfig {
  return {
    enabled: config.history.enabled,
    maxEntries: config.history.max_entries,
  };
}

/**
 * History manager class that respects configuration
 */
export class HistoryManager {
  private config: HistoryConfig;
  private historyDir?: string;

  constructor(config: HistoryConfig, historyDir?: string) {
    this.config = config;
    this.historyDir = historyDir;
  }

  /**
   * Save a transcription to history (if enabled)
   * Also prunes old entries if max_entries is exceeded.
   */
  save(text: string): HistoryEntry | null {
    if (!this.config.enabled) {
      return null;
    }

    const entry = saveHistory(text, this.historyDir);

    // Prune if we exceeded max entries
    if (this.config.maxEntries > 0) {
      pruneHistory(this.config.maxEntries, this.historyDir);
    }

    return entry;
  }

  /**
   * List history entries
   */
  list(options?: ListHistoryOptions): HistoryEntry[] {
    return listHistory(options, this.historyDir);
  }

  /**
   * Get history entry count
   */
  count(): number {
    return countHistory(this.historyDir);
  }

  /**
   * Get a single entry by ID
   */
  get(id: string): HistoryEntry | null {
    return getHistory(id, this.historyDir);
  }

  /**
   * Delete an entry by ID
   */
  delete(id: string): boolean {
    return deleteHistory(id, this.historyDir);
  }

  /**
   * Clear all history
   */
  clear(): number {
    return clearHistory(this.historyDir);
  }

  /**
   * Check if history is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create a new HistoryManager instance
 */
export function createHistoryManager(
  config: HistoryConfig,
  historyDir?: string
): HistoryManager {
  return new HistoryManager(config, historyDir);
}
