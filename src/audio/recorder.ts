/**
 * Audio Recorder Module
 *
 * Records audio via parecord subprocess, capturing to WAV files.
 * Supports device selection and format configuration.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { getCacheDir, ensureDir } from "../config/paths.ts";
import type { Config } from "../config/schema.ts";

/** Recording configuration extracted from Config */
export interface RecordingConfig {
  device: string;
  sampleRate: number;
  format: "wav";
}

/** Recording state */
export interface RecordingState {
  isRecording: boolean;
  audioPath: string | null;
  startTime: number | null;
  duration: number | null;
}

/** Error when parecord binary is not found */
export class ParecordNotFoundError extends Error {
  constructor() {
    super(
      "parecord not found. Please install pulseaudio-utils:\n" +
        "  Arch Linux: pacman -S pulseaudio\n" +
        "  Ubuntu/Debian: apt install pulseaudio-utils\n" +
        "  Fedora: dnf install pulseaudio-utils"
    );
    this.name = "ParecordNotFoundError";
  }
}

/** Error when recording operation fails */
export class RecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordingError";
  }
}

/** Default max recording duration in seconds (5 minutes) */
const MAX_RECORDING_DURATION = 300;

/**
 * Verify WAV file is complete by checking RIFF header size matches actual file size.
 * RIFF format: 4 bytes 'RIFF' + 4 bytes (fileSize-8) + 4 bytes 'WAVE'
 */
async function verifyWavComplete(path: string): Promise<boolean> {
  try {
    const file = await open(path, "r");
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await file.read(header, 0, 12, 0);
      if (bytesRead < 12) return false;

      if (header.toString("ascii", 0, 4) !== "RIFF") return false;
      if (header.toString("ascii", 8, 12) !== "WAVE") return false;

      const declaredSize = header.readUInt32LE(4) + 8; // RIFF size + 8
      const stat = await file.stat();
      return stat.size >= declaredSize;
    } finally {
      await file.close();
    }
  } catch {
    return false;
  }
}

async function ensureWavComplete(path: string, maxWaitMs = 500): Promise<void> {
  // Force filesystem flush
  const file = await open(path, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }

  // Poll until WAV header indicates completion
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await verifyWavComplete(path)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  // Timeout reached - proceed anyway, transcriber will catch real issues
}

/**
 * Audio Recorder using parecord
 *
 * Records audio to WAV files in the cache directory.
 */
export class AudioRecorder {
  private process: ChildProcess | null = null;
  private currentPath: string | null = null;
  private startTime: number | null = null;
  private config: RecordingConfig;
  private maxDuration: number;
  private durationTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: RecordingConfig, maxDuration: number = MAX_RECORDING_DURATION) {
    this.config = config;
    this.maxDuration = maxDuration;
  }

  /** Check if currently recording */
  get isRecording(): boolean {
    return this.process !== null;
  }

  /** Get current recording state */
  getState(): RecordingState {
    return {
      isRecording: this.isRecording,
      audioPath: this.currentPath,
      startTime: this.startTime,
      duration: this.startTime ? (Date.now() - this.startTime) / 1000 : null,
    };
  }

  /**
   * Start recording audio
   * @returns Path to the audio file being recorded
   * @throws {ParecordNotFoundError} If parecord is not installed
   * @throws {RecordingError} If already recording or spawn fails
   */
  async start(): Promise<string> {
    if (this.isRecording) {
      throw new RecordingError("Already recording");
    }

    // Ensure cache directory exists
    const cacheDir = getCacheDir();
    ensureDir(cacheDir);

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const audioPath = join(cacheDir, `recording-${timestamp}.wav`);

    // Build parecord arguments
    // Format: 16-bit signed little-endian PCM, mono, specified sample rate
    const args = [
      "--file-format=wav",
      `--rate=${this.config.sampleRate}`,
      "--channels=1",
      "--format=s16le",
      audioPath,
    ];

    // Add device if not default
    if (this.config.device && this.config.device !== "default") {
      args.unshift(`--device=${this.config.device}`);
    }

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn("parecord", args, {
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        // Check if this is a spawn error (command not found)
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
          reject(new ParecordNotFoundError());
          return;
        }
        reject(new RecordingError(`Failed to start recording: ${err.message}`));
        return;
      }

      let stderrOutput = "";

      this.process.stderr?.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });

      this.process.on("error", (error: NodeJS.ErrnoException) => {
        this.cleanup();
        if (error.code === "ENOENT") {
          reject(new ParecordNotFoundError());
        } else {
          reject(new RecordingError(`Recording failed: ${error.message}`));
        }
      });

      this.process.on("spawn", () => {
        this.currentPath = audioPath;
        this.startTime = Date.now();

        // Set up max duration timeout
        this.durationTimeout = setTimeout(() => {
          if (this.isRecording) {
            this.stop().catch(() => {
              // Ignore stop errors from timeout
            });
          }
        }, this.maxDuration * 1000);

        resolve(audioPath);
      });

      // Handle early exit (shouldn't happen normally)
      this.process.on("exit", (code, signal) => {
        // If we haven't resolved yet (spawn didn't fire), this is an error
        if (!this.currentPath) {
          this.cleanup();
          const errorMsg = stderrOutput.trim() || `parecord exited with code ${code}, signal ${signal}`;
          reject(new RecordingError(errorMsg));
        }
      });
    });
  }

  /**
   * Stop recording and return path to recorded audio file
   * @returns Path to the recorded audio file
   * @throws {RecordingError} If not recording or stop fails
   */
  async stop(): Promise<string> {
    if (!this.isRecording || !this.process || !this.currentPath) {
      throw new RecordingError("Not recording");
    }

    const audioPath = this.currentPath;

    return new Promise((resolve, reject) => {
      // Clear duration timeout
      if (this.durationTimeout) {
        clearTimeout(this.durationTimeout);
        this.durationTimeout = null;
      }

      const proc = this.process!;

      // Set up exit handler before sending signal
      proc.on("exit", async () => {
        this.cleanup();

        await ensureWavComplete(audioPath);

        // Verify the file exists and has content
        if (!existsSync(audioPath)) {
          reject(new RecordingError("Recording file not created"));
          return;
        }

        const stats = statSync(audioPath);
        if (stats.size === 0) {
          // Clean up empty file
          try {
            unlinkSync(audioPath);
          } catch {
            // Ignore cleanup errors
          }
          reject(new RecordingError("Recording file is empty"));
          return;
        }

        resolve(audioPath);
      });

      // Send SIGTERM for graceful shutdown (allows parecord to finalize the file)
      proc.kill("SIGTERM");

      // Fallback: force kill after timeout if process doesn't exit
      setTimeout(() => {
        if (this.process === proc) {
          proc.kill("SIGKILL");
        }
      }, 2000);
    });
  }

  /**
   * Abort recording without saving
   */
  abort(): void {
    if (!this.isRecording || !this.process) {
      return;
    }

    const audioPath = this.currentPath;

    // Kill the process immediately
    this.process.kill("SIGKILL");
    this.cleanup();

    // Clean up the incomplete file
    if (audioPath && existsSync(audioPath)) {
      try {
        unlinkSync(audioPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Clean up internal state
   */
  private cleanup(): void {
    if (this.durationTimeout) {
      clearTimeout(this.durationTimeout);
      this.durationTimeout = null;
    }
    this.process = null;
    this.currentPath = null;
    this.startTime = null;
  }
}

/**
 * Extract recording config from application Config
 */
export function extractRecordingConfig(config: Config): RecordingConfig {
  return {
    device: config.audio.device,
    sampleRate: config.audio.sample_rate,
    format: config.audio.format,
  };
}

/**
 * Create an AudioRecorder with config
 */
export function createAudioRecorder(
  config: RecordingConfig,
  maxDuration?: number
): AudioRecorder {
  return new AudioRecorder(config, maxDuration);
}

/**
 * Check if parecord is available on the system
 */
export async function checkParecordAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("parecord", ["--help"], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", (code) => {
      // parecord --help returns 0 on success
      resolve(code === 0);
    });
  });
}

/**
 * Clean up old recording files from cache directory
 * @param maxAgeMs Maximum age in milliseconds (default: 1 hour)
 */
export async function cleanupOldRecordings(maxAgeMs: number = 3600000): Promise<number> {
  const cacheDir = getCacheDir();

  if (!existsSync(cacheDir)) {
    return 0;
  }

  const { readdirSync } = await import("node:fs");
  const files = readdirSync(cacheDir);
  const now = Date.now();
  let cleaned = 0;

  for (const file of files) {
    if (!file.startsWith("recording-") || !file.endsWith(".wav")) {
      continue;
    }

    const filePath = join(cacheDir, file);
    try {
      const stats = statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        unlinkSync(filePath);
        cleaned++;
      }
    } catch {
      // Ignore errors for individual files
    }
  }

  return cleaned;
}
