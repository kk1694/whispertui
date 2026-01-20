/**
 * Audio Player Module
 *
 * Plays back audio recordings using paplay.
 * Used for the replay command to play back recent recordings.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getCacheDir } from "../config/paths.ts";

/** Error when paplay binary is not found */
export class PaplayNotFoundError extends Error {
  constructor() {
    super(
      "paplay not found. Please install pulseaudio-utils:\n" +
        "  Arch Linux: pacman -S pulseaudio\n" +
        "  Ubuntu/Debian: apt install pulseaudio-utils\n" +
        "  Fedora: dnf install pulseaudio-utils"
    );
    this.name = "PaplayNotFoundError";
  }
}

/** Error when no recordings are found in cache */
export class NoRecordingsFoundError extends Error {
  constructor() {
    super(
      "No recordings found in cache.\n" +
        "Record something first with: whispertui start && whispertui stop"
    );
    this.name = "NoRecordingsFoundError";
  }
}

/** Error when playback operation fails */
export class PlaybackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaybackError";
  }
}

/**
 * Get the most recent recording from the cache directory
 * @returns Path to the most recent recording, or null if none found
 */
export function getLatestRecording(): string | null {
  const cacheDir = getCacheDir();

  if (!existsSync(cacheDir)) {
    return null;
  }

  const files = readdirSync(cacheDir);

  // Filter for recording-*.wav files
  const recordings = files.filter(
    (file) => file.startsWith("recording-") && file.endsWith(".wav")
  );

  if (recordings.length === 0) {
    return null;
  }

  // Sort by modification time (most recent first)
  const sorted = recordings
    .map((file) => {
      const filePath = join(cacheDir, file);
      const stats = statSync(filePath);
      return { file, mtime: stats.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const latest = sorted[0];
  if (!latest) {
    return null;
  }

  return join(cacheDir, latest.file);
}

/**
 * Play an audio file using paplay
 * @param audioPath Path to the audio file to play
 * @throws {PaplayNotFoundError} If paplay is not installed
 * @throws {PlaybackError} If playback fails
 */
export async function playAudio(audioPath: string): Promise<void> {
  if (!existsSync(audioPath)) {
    throw new PlaybackError(`Audio file not found: ${audioPath}`);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("paplay", [audioPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new PaplayNotFoundError());
      } else {
        reject(new PlaybackError(`Playback failed: ${error.message}`));
      }
    });

    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg =
          stderrOutput.trim() || `paplay exited with code ${code}`;
        reject(new PlaybackError(errorMsg));
      }
    });
  });
}

/**
 * Play the most recent recording from the cache
 * @returns Path to the recording that was played
 * @throws {NoRecordingsFoundError} If no recordings exist
 * @throws {PaplayNotFoundError} If paplay is not installed
 * @throws {PlaybackError} If playback fails
 */
export async function playLatestRecording(): Promise<string> {
  const audioPath = getLatestRecording();

  if (!audioPath) {
    throw new NoRecordingsFoundError();
  }

  await playAudio(audioPath);
  return audioPath;
}

/**
 * Check if paplay is available on the system
 */
export async function checkPaplayAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("paplay", ["--help"], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", (code) => {
      // paplay --help returns 0 on success
      resolve(code === 0);
    });
  });
}
