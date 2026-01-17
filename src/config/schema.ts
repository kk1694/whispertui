import { z } from "zod";

/**
 * Zod schema for WhisperTUI configuration.
 * Defines all configuration options with validation.
 */

export const TranscriptionConfigSchema = z.object({
  backend: z.enum(["groq"]).optional(),
  api_key_env: z.string().optional(),
});

export const AudioConfigSchema = z.object({
  device: z.string().optional(),
  sample_rate: z.number().int().positive().optional(),
  format: z.enum(["wav"]).optional(),
});

export const OutputConfigSchema = z.object({
  auto_paste: z.boolean().optional(),
  paste_method: z.enum(["wtype", "clipboard-only"]).optional(),
});

export const ContextConfigSchema = z.object({
  enabled: z.boolean().optional(),
  code_aware_apps: z.array(z.string()).optional(),
});

export const HistoryConfigSchema = z.object({
  enabled: z.boolean().optional(),
  max_entries: z.number().int().positive().optional(),
});

export const DaemonConfigSchema = z.object({
  idle_timeout: z.number().int().min(0).optional(),
});

export const NotificationsConfigSchema = z.object({
  enabled: z.boolean().optional(),
});

/**
 * Schema for partial config (as loaded from TOML file).
 * All fields are optional - missing values will be filled from defaults.
 */
export const PartialConfigSchema = z.object({
  transcription: TranscriptionConfigSchema.optional(),
  audio: AudioConfigSchema.optional(),
  output: OutputConfigSchema.optional(),
  context: ContextConfigSchema.optional(),
  history: HistoryConfigSchema.optional(),
  daemon: DaemonConfigSchema.optional(),
  notifications: NotificationsConfigSchema.optional(),
});

export type PartialConfig = z.infer<typeof PartialConfigSchema>;

/**
 * Full config type with all required fields (after merging with defaults).
 */
export interface Config {
  transcription: {
    backend: "groq";
    api_key_env: string;
  };
  audio: {
    device: string;
    sample_rate: number;
    format: "wav";
  };
  output: {
    auto_paste: boolean;
    paste_method: "wtype" | "clipboard-only";
  };
  context: {
    enabled: boolean;
    code_aware_apps: string[];
  };
  history: {
    enabled: boolean;
    max_entries: number;
  };
  daemon: {
    idle_timeout: number;
  };
  notifications: {
    enabled: boolean;
  };
}
