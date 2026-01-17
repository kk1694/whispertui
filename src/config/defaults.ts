import type { Config } from "./schema";

/**
 * Default configuration values for WhisperTUI.
 * These are used when no config file exists or for missing values.
 */
export const defaults: Config = {
  transcription: {
    backend: "groq",
    api_key_env: "GROQ_API_KEY",
  },
  audio: {
    device: "default",
    sample_rate: 16000,
    format: "wav",
  },
  output: {
    auto_paste: true,
    paste_method: "wtype",
  },
  context: {
    enabled: true,
    code_aware_apps: ["Alacritty", "kitty", "foot", "nvim", "code", "Code"],
  },
  history: {
    enabled: true,
    max_entries: 1000,
  },
  daemon: {
    idle_timeout: 0,
  },
  notifications: {
    enabled: true,
  },
};
