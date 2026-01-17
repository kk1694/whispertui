import { parse as parseToml } from "@iarna/toml";
import { ZodError } from "zod";
import { getConfigPath } from "./paths";
import { PartialConfigSchema, type Config, type PartialConfig } from "./schema";
import { defaults } from "./defaults";

export class ConfigError extends Error {
  override cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ConfigError";
    this.cause = cause;
  }
}

/**
 * Deep merge two objects, with source values overriding target values.
 * Handles nested objects recursively.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      targetValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Parse a TOML config string and validate it against the schema.
 * Unknown keys are ignored for forward compatibility.
 */
export function parseConfig(tomlContent: string): Config {
  let parsed: unknown;

  try {
    parsed = parseToml(tomlContent);
  } catch (error) {
    throw new ConfigError(
      `Failed to parse TOML config: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  // Validate the partial config first (allows optional fields)
  let partialConfig: PartialConfig;
  try {
    partialConfig = PartialConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new ConfigError(`Invalid config values:\n${issues}`, error);
    }
    throw error;
  }

  // Merge with defaults to get complete config
  const merged = deepMerge(
    defaults as unknown as Record<string, unknown>,
    partialConfig as unknown as Partial<Record<string, unknown>>
  );
  return merged as unknown as Config;
}

/**
 * Load configuration from the config file.
 * Returns defaults if no config file exists.
 * Merges file config with defaults (file values override defaults).
 */
export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath();

  const file = Bun.file(configPath);
  const exists = await file.exists();

  if (!exists) {
    // No config file, use defaults
    return { ...defaults };
  }

  const content = await file.text();
  return parseConfig(content);
}

/**
 * Format a config validation error for display.
 */
export function formatConfigError(error: unknown): string {
  if (error instanceof ConfigError) {
    return error.message;
  }
  if (error instanceof Error) {
    return `Config error: ${error.message}`;
  }
  return `Config error: ${String(error)}`;
}
