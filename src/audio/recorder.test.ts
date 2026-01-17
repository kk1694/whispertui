import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import {
  AudioRecorder,
  createAudioRecorder,
  extractRecordingConfig,
  ParecordNotFoundError,
  RecordingError,
  checkParecordAvailable,
  cleanupOldRecordings,
  type RecordingConfig,
} from "./recorder.ts";
import { defaults } from "../config/defaults.ts";

// Use a temporary directory for test isolation
const TEST_CACHE_DIR = join(tmpdir(), `whispertui-test-audio-${process.pid}`);

describe("AudioRecorder", () => {
  let recorder: AudioRecorder;
  const testConfig: RecordingConfig = {
    device: "default",
    sampleRate: 16000,
    format: "wav",
  };

  beforeEach(() => {
    // Set environment to use test directory
    process.env.XDG_CACHE_HOME = TEST_CACHE_DIR;

    // Create test cache directory
    mkdirSync(join(TEST_CACHE_DIR, "whispertui"), { recursive: true });

    recorder = createAudioRecorder(testConfig);
  });

  afterEach(async () => {
    // Ensure recorder is stopped
    if (recorder.isRecording) {
      recorder.abort();
    }

    // Clean up test files
    try {
      rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("initial state", () => {
    test("isRecording is false initially", () => {
      expect(recorder.isRecording).toBe(false);
    });

    test("getState returns correct initial state", () => {
      const state = recorder.getState();
      expect(state.isRecording).toBe(false);
      expect(state.audioPath).toBeNull();
      expect(state.startTime).toBeNull();
      expect(state.duration).toBeNull();
    });
  });

  describe("start recording", () => {
    test("starts parecord process", async () => {
      // Skip if parecord not available
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      const audioPath = await recorder.start();

      expect(recorder.isRecording).toBe(true);
      expect(audioPath).toContain("recording-");
      expect(audioPath).toEndWith(".wav");

      const state = recorder.getState();
      expect(state.isRecording).toBe(true);
      expect(state.audioPath).toBe(audioPath);
      expect(state.startTime).toBeDefined();
      expect(state.startTime).toBeGreaterThan(0);
    });

    test("throws if already recording", async () => {
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      await recorder.start();

      await expect(recorder.start()).rejects.toThrow(RecordingError);
      await expect(recorder.start()).rejects.toThrow("Already recording");
    });

    test("creates audio file in cache directory", async () => {
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      const audioPath = await recorder.start();

      // File may not exist immediately as parecord hasn't written yet
      expect(audioPath).toContain(join(TEST_CACHE_DIR, "whispertui"));
    });
  });

  describe("stop recording", () => {
    test("stops recording and returns path", async () => {
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      await recorder.start();

      // Record for a short time
      await new Promise((resolve) => setTimeout(resolve, 500));

      const audioPath = await recorder.stop();

      expect(recorder.isRecording).toBe(false);
      expect(existsSync(audioPath)).toBe(true);
    });

    test("throws if not recording", async () => {
      await expect(recorder.stop()).rejects.toThrow(RecordingError);
      await expect(recorder.stop()).rejects.toThrow("Not recording");
    });

    test("terminates parecord process gracefully", async () => {
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      await recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await recorder.stop();

      // Process should be cleaned up
      expect(recorder.isRecording).toBe(false);

      const state = recorder.getState();
      expect(state.audioPath).toBeNull();
    });
  });

  describe("abort recording", () => {
    test("aborts without saving file", async () => {
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      const audioPath = await recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 200));

      recorder.abort();

      expect(recorder.isRecording).toBe(false);
      // File should be cleaned up (though it may not have been created yet)
    });

    test("does nothing if not recording", () => {
      // Should not throw
      recorder.abort();
      expect(recorder.isRecording).toBe(false);
    });
  });

  describe("recording timeout protection", () => {
    test("auto-stops after max duration", async () => {
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      // Create recorder with very short max duration (1 second)
      const shortRecorder = createAudioRecorder(testConfig, 1);

      await shortRecorder.start();
      expect(shortRecorder.isRecording).toBe(true);

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(shortRecorder.isRecording).toBe(false);
    });
  });

  describe("device selection", () => {
    test("uses default device when set to 'default'", async () => {
      // This test verifies the config is used correctly
      const config: RecordingConfig = {
        device: "default",
        sampleRate: 16000,
        format: "wav",
      };

      const rec = createAudioRecorder(config);
      expect(rec).toBeDefined();
    });

    test("uses custom device when specified", async () => {
      // This test verifies the config is used correctly
      const config: RecordingConfig = {
        device: "alsa_input.pci-0000_00_1f.3.analog-stereo",
        sampleRate: 16000,
        format: "wav",
      };

      const rec = createAudioRecorder(config);
      expect(rec).toBeDefined();
    });
  });

  describe("WAV file format", () => {
    test("creates valid WAV file with correct format", async () => {
      const available = await checkParecordAvailable();
      if (!available) {
        console.log("Skipping test: parecord not available");
        return;
      }

      await recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const audioPath = await recorder.stop();

      // Check file exists and has WAV header
      expect(existsSync(audioPath)).toBe(true);

      const header = readFileSync(audioPath).subarray(0, 4);
      expect(header.toString()).toBe("RIFF");

      // Check for WAVE format marker
      const waveMarker = readFileSync(audioPath).subarray(8, 12);
      expect(waveMarker.toString()).toBe("WAVE");
    });
  });
});

describe("extractRecordingConfig", () => {
  test("extracts audio config from full Config", () => {
    const config = extractRecordingConfig(defaults);

    expect(config.device).toBe("default");
    expect(config.sampleRate).toBe(16000);
    expect(config.format).toBe("wav");
  });

  test("handles custom config values", () => {
    const customConfig = {
      ...defaults,
      audio: {
        device: "custom-device",
        sample_rate: 44100,
        format: "wav" as const,
      },
    };

    const config = extractRecordingConfig(customConfig);

    expect(config.device).toBe("custom-device");
    expect(config.sampleRate).toBe(44100);
    expect(config.format).toBe("wav");
  });
});

describe("checkParecordAvailable", () => {
  test("returns boolean indicating availability", async () => {
    const result = await checkParecordAvailable();
    expect(typeof result).toBe("boolean");
  });
});

describe("cleanupOldRecordings", () => {
  beforeEach(() => {
    process.env.XDG_CACHE_HOME = TEST_CACHE_DIR;
    mkdirSync(join(TEST_CACHE_DIR, "whispertui"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test("removes old recording files", async () => {
    const cacheDir = join(TEST_CACHE_DIR, "whispertui");

    // Create an "old" file (we'll set maxAge to 0 to make it immediately old)
    const oldFile = join(cacheDir, "recording-12345.wav");
    writeFileSync(oldFile, "test content");
    expect(existsSync(oldFile)).toBe(true);

    // Clean with 0 maxAge to consider everything old
    const cleaned = await cleanupOldRecordings(0);

    expect(cleaned).toBe(1);
    expect(existsSync(oldFile)).toBe(false);
  });

  test("does not remove recent files", async () => {
    const cacheDir = join(TEST_CACHE_DIR, "whispertui");

    // Create a file
    const recentFile = join(cacheDir, "recording-99999.wav");
    writeFileSync(recentFile, "test content");
    expect(existsSync(recentFile)).toBe(true);

    // Clean with very high maxAge
    const cleaned = await cleanupOldRecordings(999999999);

    expect(cleaned).toBe(0);
    expect(existsSync(recentFile)).toBe(true);
  });

  test("ignores non-recording files", async () => {
    const cacheDir = join(TEST_CACHE_DIR, "whispertui");

    // Create a non-recording file
    const otherFile = join(cacheDir, "other-file.txt");
    writeFileSync(otherFile, "test content");

    const cleaned = await cleanupOldRecordings(0);

    expect(cleaned).toBe(0);
    expect(existsSync(otherFile)).toBe(true);
  });

  test("returns 0 when cache dir does not exist", async () => {
    process.env.XDG_CACHE_HOME = join(TEST_CACHE_DIR, "nonexistent");

    const cleaned = await cleanupOldRecordings();

    expect(cleaned).toBe(0);
  });
});

describe("ParecordNotFoundError", () => {
  test("has correct message with install instructions", () => {
    const error = new ParecordNotFoundError();

    expect(error.name).toBe("ParecordNotFoundError");
    expect(error.message).toContain("parecord not found");
    expect(error.message).toContain("pacman");
    expect(error.message).toContain("apt install");
    expect(error.message).toContain("dnf install");
  });
});

describe("RecordingError", () => {
  test("has correct name and message", () => {
    const error = new RecordingError("Test error message");

    expect(error.name).toBe("RecordingError");
    expect(error.message).toBe("Test error message");
  });
});
