/**
 * Groq Whisper API Client
 *
 * Transcribes audio files using Groq's Whisper API.
 * Handles API key management, error handling, and retries.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

/** Groq API base URL */
const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/** Whisper model to use */
const WHISPER_MODEL = "whisper-large-v3";

/** Error when API key is not configured */
export class MissingApiKeyError extends Error {
  constructor(envVar: string) {
    super(
      `Groq API key not found. Please set ${envVar} in your .env file or environment.\n` +
        "Get an API key at: https://console.groq.com/keys"
    );
    this.name = "MissingApiKeyError";
  }
}

/** Error for API request failures */
export class TranscriptionApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = "TranscriptionApiError";
  }
}

/** Error for empty or invalid audio files */
export class InvalidAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAudioError";
  }
}

/** Groq API transcription response */
export interface TranscriptionResponse {
  text: string;
}

/** Configuration for the Groq client */
export interface GroqClientConfig {
  /** Environment variable name for API key (default: GROQ_API_KEY) */
  apiKeyEnv?: string;
  /** API key to use directly (overrides env var) */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Number of retries for retryable errors (default: 2) */
  maxRetries?: number;
}

/** Default configuration values */
const DEFAULT_CONFIG: Required<GroqClientConfig> = {
  apiKeyEnv: "GROQ_API_KEY",
  apiKey: "",
  timeout: 60000,
  maxRetries: 2,
};

/**
 * Get API key from config or environment
 */
function getApiKey(config: Required<GroqClientConfig>): string {
  // Direct API key takes precedence
  if (config.apiKey) {
    return config.apiKey;
  }

  // Check environment variable
  const envKey = process.env[config.apiKeyEnv];
  if (envKey) {
    return envKey;
  }

  throw new MissingApiKeyError(config.apiKeyEnv);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse error response from Groq API
 */
function parseApiError(statusCode: number, body: string): TranscriptionApiError {
  let message = `API request failed with status ${statusCode}`;
  let isRetryable = false;

  try {
    const json = JSON.parse(body);
    if (json.error?.message) {
      message = json.error.message;
    }
  } catch {
    // Body is not JSON, use as-is if not empty
    if (body.trim()) {
      message = body.trim();
    }
  }

  // Determine if error is retryable
  switch (statusCode) {
    case 429: // Rate limited
      message = `Rate limited: ${message}`;
      isRetryable = true;
      break;
    case 500: // Server error
    case 502: // Bad gateway
    case 503: // Service unavailable
    case 504: // Gateway timeout
      isRetryable = true;
      break;
    case 401:
      message = `Authentication failed: ${message}. Check your GROQ_API_KEY.`;
      break;
    case 400:
      message = `Bad request: ${message}`;
      break;
  }

  return new TranscriptionApiError(message, statusCode, isRetryable);
}

/**
 * Groq Whisper API Client
 */
export class GroqClient {
  private config: Required<GroqClientConfig>;

  constructor(config: GroqClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Transcribe an audio file
   * @param audioPath Path to the audio file (WAV format)
   * @returns Transcribed text
   */
  async transcribe(audioPath: string): Promise<string> {
    const apiKey = getApiKey(this.config);

    // Read audio file
    let audioData: Buffer;
    try {
      audioData = await readFile(audioPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new InvalidAudioError(`Audio file not found: ${audioPath}`);
      }
      throw new InvalidAudioError(`Failed to read audio file: ${err.message}`);
    }

    // Check for empty file
    if (audioData.length === 0) {
      throw new InvalidAudioError("Audio file is empty");
    }

    // Minimum WAV header is 44 bytes
    if (audioData.length < 44) {
      throw new InvalidAudioError("Audio file is too small to be a valid WAV file");
    }

    // Build multipart form data
    const filename = basename(audioPath);
    const formData = new FormData();
    formData.append("file", new Blob([audioData], { type: "audio/wav" }), filename);
    formData.append("model", WHISPER_MODEL);
    formData.append("response_format", "json");

    // Make request with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await sleep(delay);
      }

      try {
        const response = await this.makeRequest(apiKey, formData);
        return response.text;
      } catch (error) {
        lastError = error as Error;

        // Only retry on retryable errors
        if (error instanceof TranscriptionApiError && error.isRetryable) {
          continue;
        }
        throw error;
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Make the actual API request
   */
  private async makeRequest(
    apiKey: string,
    formData: FormData
  ): Promise<TranscriptionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      const body = await response.text();

      if (!response.ok) {
        throw parseApiError(response.status, body);
      }

      // Parse successful response
      try {
        const result = JSON.parse(body) as TranscriptionResponse;
        if (typeof result.text !== "string") {
          throw new TranscriptionApiError("Invalid response: missing 'text' field");
        }
        return result;
      } catch (error) {
        if (error instanceof TranscriptionApiError) {
          throw error;
        }
        throw new TranscriptionApiError(`Failed to parse API response: ${body}`);
      }
    } catch (error) {
      if (error instanceof TranscriptionApiError) {
        throw error;
      }
      if (error instanceof InvalidAudioError) {
        throw error;
      }

      const err = error as Error;
      if (err.name === "AbortError") {
        throw new TranscriptionApiError(
          `Request timed out after ${this.config.timeout}ms`,
          undefined,
          true
        );
      }

      // Network errors are retryable
      throw new TranscriptionApiError(
        `Network error: ${err.message}`,
        undefined,
        true
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if API key is configured
   */
  hasApiKey(): boolean {
    try {
      getApiKey(this.config);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the configured API key environment variable name
   */
  getApiKeyEnvVar(): string {
    return this.config.apiKeyEnv;
  }
}

/**
 * Create a Groq client with the given configuration
 */
export function createGroqClient(config?: GroqClientConfig): GroqClient {
  return new GroqClient(config);
}

/**
 * Transcribe audio file using Groq API
 * Convenience function for one-off transcriptions
 */
export async function transcribeAudio(
  audioPath: string,
  config?: GroqClientConfig
): Promise<string> {
  const client = createGroqClient(config);
  return client.transcribe(audioPath);
}
