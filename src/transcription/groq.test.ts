/**
 * Tests for Groq Whisper API Client
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  GroqClient,
  createGroqClient,
  transcribeAudio,
  MissingApiKeyError,
  TranscriptionApiError,
  InvalidAudioError,
} from "./groq.ts";

describe("GroqClient", () => {
  let tempDir: string;
  let originalFetch: typeof global.fetch;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = mkdtempSync(join(tmpdir(), "whispertui-groq-test-"));
    // Save original fetch
    originalFetch = global.fetch;
    // Save original env
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore fetch
    global.fetch = originalFetch;
    // Restore env
    process.env = originalEnv;
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Create a minimal valid WAV file for testing
   */
  function createTestWavFile(path: string, contentSize: number = 100): void {
    // Create a minimal WAV header (44 bytes) plus some content
    const header = Buffer.alloc(44);
    // "RIFF" chunk
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + contentSize, 4); // File size - 8
    header.write("WAVE", 8);
    // "fmt " subchunk
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    header.writeUInt16LE(1, 22); // NumChannels (1 = mono)
    header.writeUInt32LE(16000, 24); // SampleRate
    header.writeUInt32LE(32000, 28); // ByteRate
    header.writeUInt16LE(2, 32); // BlockAlign
    header.writeUInt16LE(16, 34); // BitsPerSample
    // "data" subchunk
    header.write("data", 36);
    header.writeUInt32LE(contentSize, 40); // Subchunk2Size

    const content = Buffer.alloc(contentSize, 0);
    const wav = Buffer.concat([header, content]);
    writeFileSync(path, wav);
  }

  /**
   * Create a mock fetch that returns a successful response
   */
  function mockFetchSuccess(text: string): void {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ text })),
      } as Response)
    ) as unknown as typeof fetch;
  }

  /**
   * Create a mock fetch that returns an error
   */
  function mockFetchError(status: number, body: string): void {
    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status,
        text: () => Promise.resolve(body),
      } as Response)
    ) as unknown as typeof fetch;
  }

  /**
   * Create a mock fetch that throws a network error
   */
  function mockFetchNetworkError(message: string): void {
    global.fetch = mock(() => Promise.reject(new Error(message))) as unknown as typeof fetch;
  }

  describe("constructor", () => {
    test("creates client with default config", () => {
      const client = new GroqClient();
      expect(client.getApiKeyEnvVar()).toBe("GROQ_API_KEY");
    });

    test("creates client with custom API key env var", () => {
      const client = new GroqClient({ apiKeyEnv: "CUSTOM_KEY" });
      expect(client.getApiKeyEnvVar()).toBe("CUSTOM_KEY");
    });
  });

  describe("hasApiKey", () => {
    test("returns false when API key not set", () => {
      delete process.env.GROQ_API_KEY;
      const client = new GroqClient();
      expect(client.hasApiKey()).toBe(false);
    });

    test("returns true when API key set in env", () => {
      process.env.GROQ_API_KEY = "test-key";
      const client = new GroqClient();
      expect(client.hasApiKey()).toBe(true);
    });

    test("returns true when API key provided directly", () => {
      delete process.env.GROQ_API_KEY;
      const client = new GroqClient({ apiKey: "direct-key" });
      expect(client.hasApiKey()).toBe(true);
    });
  });

  describe("transcribe", () => {
    test("throws MissingApiKeyError when API key not set", async () => {
      delete process.env.GROQ_API_KEY;
      const client = new GroqClient();
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(MissingApiKeyError);
    });

    test("throws InvalidAudioError for non-existent file", async () => {
      process.env.GROQ_API_KEY = "test-key";
      const client = new GroqClient();

      await expect(client.transcribe("/nonexistent/file.wav")).rejects.toThrow(
        InvalidAudioError
      );
    });

    test("throws InvalidAudioError for empty file", async () => {
      process.env.GROQ_API_KEY = "test-key";
      const client = new GroqClient();
      const audioPath = join(tempDir, "empty.wav");
      writeFileSync(audioPath, "");

      await expect(client.transcribe(audioPath)).rejects.toThrow(InvalidAudioError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("empty");
    });

    test("throws InvalidAudioError for file smaller than WAV header", async () => {
      process.env.GROQ_API_KEY = "test-key";
      const client = new GroqClient();
      const audioPath = join(tempDir, "tiny.wav");
      writeFileSync(audioPath, Buffer.alloc(20)); // Less than 44-byte header

      await expect(client.transcribe(audioPath)).rejects.toThrow(InvalidAudioError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("too small");
    });

    test("succeeds with valid audio and API key", async () => {
      process.env.GROQ_API_KEY = "test-key";
      mockFetchSuccess("Hello world");

      const client = new GroqClient();
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      const result = await client.transcribe(audioPath);
      expect(result).toBe("Hello world");
    });

    test("uses direct API key over env var", async () => {
      process.env.GROQ_API_KEY = "env-key";
      let capturedHeaders: Headers | undefined;

      global.fetch = mock((url: string, options: RequestInit) => {
        capturedHeaders = options.headers as Headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ text: "test" })),
        } as Response);
      }) as unknown as typeof fetch;

      const client = new GroqClient({ apiKey: "direct-key" });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await client.transcribe(audioPath);

      expect((capturedHeaders as any).Authorization).toBe("Bearer direct-key");
    });
  });

  describe("API error handling", () => {
    beforeEach(() => {
      process.env.GROQ_API_KEY = "test-key";
    });

    test("handles 401 authentication error", async () => {
      mockFetchError(401, JSON.stringify({ error: { message: "Invalid API key" } }));

      const client = new GroqClient();
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("Authentication failed");
    });

    test("handles 400 bad request error", async () => {
      mockFetchError(400, JSON.stringify({ error: { message: "Invalid audio format" } }));

      const client = new GroqClient();
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("Bad request");
    });

    test("handles 429 rate limit error", async () => {
      mockFetchError(429, JSON.stringify({ error: { message: "Too many requests" } }));

      const client = new GroqClient({ maxRetries: 0 }); // Disable retries for this test
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("Rate limited");
    });

    test("handles 500 server error", async () => {
      mockFetchError(500, "Internal Server Error");

      const client = new GroqClient({ maxRetries: 0 });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
    });

    test("handles network errors", async () => {
      mockFetchNetworkError("Connection refused");

      const client = new GroqClient({ maxRetries: 0 });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("Network error");
    });

    test("handles invalid JSON response", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("not json"),
        } as Response)
      ) as unknown as typeof fetch;

      const client = new GroqClient();
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("Failed to parse");
    });

    test("handles response missing text field", async () => {
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ result: "no text" })),
        } as Response)
      ) as unknown as typeof fetch;

      const client = new GroqClient();
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      await expect(client.transcribe(audioPath)).rejects.toThrow("missing 'text' field");
    });
  });

  describe("retries", () => {
    beforeEach(() => {
      process.env.GROQ_API_KEY = "test-key";
    });

    test("retries on 429 error and succeeds", async () => {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            text: () => Promise.resolve(JSON.stringify({ error: { message: "Rate limited" } })),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ text: "success after retry" })),
        } as Response);
      }) as unknown as typeof fetch;

      const client = new GroqClient({ maxRetries: 1 });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      const result = await client.transcribe(audioPath);
      expect(result).toBe("success after retry");
      expect(callCount).toBe(2);
    });

    test("retries on 500 error and succeeds", async () => {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve("Server Error"),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ text: "recovered" })),
        } as Response);
      }) as unknown as typeof fetch;

      const client = new GroqClient({ maxRetries: 1 });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      const result = await client.transcribe(audioPath);
      expect(result).toBe("recovered");
      expect(callCount).toBe(2);
    });

    test("retries on network error and succeeds", async () => {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ text: "network recovered" })),
        } as Response);
      }) as unknown as typeof fetch;

      const client = new GroqClient({ maxRetries: 1 });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      const result = await client.transcribe(audioPath);
      expect(result).toBe("network recovered");
      expect(callCount).toBe(2);
    });

    test("does not retry on 401 error", async () => {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve(JSON.stringify({ error: { message: "Invalid key" } })),
        } as Response);
      }) as unknown as typeof fetch;

      const client = new GroqClient({ maxRetries: 2 });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      expect(callCount).toBe(1); // No retries
    });

    test("exhausts retries and fails", async () => {
      let callCount = 0;
      global.fetch = mock(() => {
        callCount++;
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server Error"),
        } as Response);
      }) as unknown as typeof fetch;

      const client = new GroqClient({ maxRetries: 2 });
      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      await expect(client.transcribe(audioPath)).rejects.toThrow(TranscriptionApiError);
      expect(callCount).toBe(3); // Initial + 2 retries
    });
  });

  describe("createGroqClient", () => {
    test("creates client with defaults", () => {
      const client = createGroqClient();
      expect(client).toBeInstanceOf(GroqClient);
    });

    test("creates client with custom config", () => {
      const client = createGroqClient({ apiKeyEnv: "CUSTOM_API_KEY" });
      expect(client.getApiKeyEnvVar()).toBe("CUSTOM_API_KEY");
    });
  });

  describe("transcribeAudio helper", () => {
    test("transcribes audio file", async () => {
      process.env.GROQ_API_KEY = "test-key";
      mockFetchSuccess("Helper result");

      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      const result = await transcribeAudio(audioPath);
      expect(result).toBe("Helper result");
    });

    test("accepts custom config", async () => {
      process.env.CUSTOM_KEY = "custom-api-key";
      delete process.env.GROQ_API_KEY;
      mockFetchSuccess("Custom result");

      const audioPath = join(tempDir, "test.wav");
      createTestWavFile(audioPath);

      const result = await transcribeAudio(audioPath, { apiKeyEnv: "CUSTOM_KEY" });
      expect(result).toBe("Custom result");
    });
  });
});
