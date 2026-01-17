import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseConfig, loadConfig, ConfigError } from "./loader";
import { defaults } from "./defaults";

describe("parseConfig", () => {
  test("parses valid TOML config", () => {
    const toml = `
[transcription]
backend = "groq"
api_key_env = "MY_API_KEY"

[audio]
device = "my-device"
sample_rate = 44100
`;
    const config = parseConfig(toml);

    expect(config.transcription.backend).toBe("groq");
    expect(config.transcription.api_key_env).toBe("MY_API_KEY");
    expect(config.audio.device).toBe("my-device");
    expect(config.audio.sample_rate).toBe(44100);
  });

  test("uses defaults for missing values", () => {
    const toml = `
[transcription]
api_key_env = "CUSTOM_KEY"
`;
    const config = parseConfig(toml);

    // Specified value
    expect(config.transcription.api_key_env).toBe("CUSTOM_KEY");
    // Default values
    expect(config.transcription.backend).toBe("groq");
    expect(config.audio.device).toBe("default");
    expect(config.audio.sample_rate).toBe(16000);
    expect(config.output.auto_paste).toBe(true);
  });

  test("merges partial config with defaults", () => {
    const toml = `
[audio]
device = "custom-mic"

[output]
paste_method = "clipboard-only"
`;
    const config = parseConfig(toml);

    // Partial values should be set
    expect(config.audio.device).toBe("custom-mic");
    expect(config.output.paste_method).toBe("clipboard-only");
    // Other values in the same sections should use defaults
    expect(config.audio.sample_rate).toBe(16000);
    expect(config.output.auto_paste).toBe(true);
    // Other sections should use defaults
    expect(config.transcription.backend).toBe("groq");
  });

  test("ignores unknown keys (forward compatibility)", () => {
    const toml = `
[transcription]
backend = "groq"
unknown_key = "should be ignored"

[future_section]
new_feature = true
`;
    // Should not throw
    const config = parseConfig(toml);
    expect(config.transcription.backend).toBe("groq");
  });

  test("throws descriptive error for invalid values", () => {
    const toml = `
[audio]
sample_rate = "not a number"
`;
    expect(() => parseConfig(toml)).toThrow(ConfigError);
    try {
      parseConfig(toml);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("audio.sample_rate");
    }
  });

  test("throws error for invalid TOML syntax", () => {
    const toml = `
[invalid toml
missing = closing bracket
`;
    expect(() => parseConfig(toml)).toThrow(ConfigError);
    try {
      parseConfig(toml);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("Failed to parse TOML");
    }
  });

  test("validates enum values", () => {
    const toml = `
[output]
paste_method = "invalid-method"
`;
    expect(() => parseConfig(toml)).toThrow(ConfigError);
    try {
      parseConfig(toml);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("output.paste_method");
    }
  });

  test("validates number constraints", () => {
    const toml = `
[daemon]
idle_timeout = -5
`;
    expect(() => parseConfig(toml)).toThrow(ConfigError);
    try {
      parseConfig(toml);
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("daemon.idle_timeout");
    }
  });

  test("parses arrays correctly", () => {
    const toml = `
[context]
code_aware_apps = ["vim", "emacs", "vscode"]
`;
    const config = parseConfig(toml);
    expect(config.context.code_aware_apps).toEqual(["vim", "emacs", "vscode"]);
  });

  test("parses boolean values correctly", () => {
    const toml = `
[output]
auto_paste = false

[context]
enabled = false

[notifications]
enabled = false
`;
    const config = parseConfig(toml);
    expect(config.output.auto_paste).toBe(false);
    expect(config.context.enabled).toBe(false);
    expect(config.notifications.enabled).toBe(false);
  });
});

describe("loadConfig", () => {
  const testDir = join(tmpdir(), `whispertui-test-${Date.now()}`);
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    process.env.XDG_CONFIG_HOME = testDir;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  test("returns defaults when no config file exists", async () => {
    const config = await loadConfig();
    expect(config).toEqual(defaults);
  });

  test("loads config from TOML file", async () => {
    const configPath = join(testDir, "whispertui", "config.toml");
    mkdirSync(join(testDir, "whispertui"), { recursive: true });
    writeFileSync(
      configPath,
      `
[audio]
device = "test-device"
sample_rate = 22050
`
    );

    const config = await loadConfig();
    expect(config.audio.device).toBe("test-device");
    expect(config.audio.sample_rate).toBe(22050);
    // Other values should be defaults
    expect(config.transcription.backend).toBe("groq");
  });

  test("merges file config with defaults", async () => {
    const configPath = join(testDir, "whispertui", "config.toml");
    mkdirSync(join(testDir, "whispertui"), { recursive: true });
    writeFileSync(
      configPath,
      `
[output]
paste_method = "clipboard-only"
`
    );

    const config = await loadConfig();
    // Overridden value
    expect(config.output.paste_method).toBe("clipboard-only");
    // Default value in same section
    expect(config.output.auto_paste).toBe(true);
    // Default values in other sections
    expect(config.audio.device).toBe("default");
  });
});
