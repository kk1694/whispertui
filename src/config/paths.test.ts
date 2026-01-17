import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getConfigDir,
  getStateDir,
  getDataDir,
  getCacheDir,
  getConfigPath,
  getSocketPath,
  getPidPath,
  getHistoryDir,
  ensureDir,
  ensureAllDirs,
  paths,
} from "./paths.ts";

describe("XDG path helpers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars before each test
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_STATE_HOME;
    delete process.env.XDG_DATA_HOME;
    delete process.env.XDG_CACHE_HOME;
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });

  describe("default paths (no XDG env vars set)", () => {
    test("getConfigDir returns ~/.config/whispertui", () => {
      const result = getConfigDir();
      expect(result).toMatch(/\.config\/whispertui$/);
    });

    test("getStateDir returns ~/.local/state/whispertui", () => {
      const result = getStateDir();
      expect(result).toMatch(/\.local\/state\/whispertui$/);
    });

    test("getDataDir returns ~/.local/share/whispertui", () => {
      const result = getDataDir();
      expect(result).toMatch(/\.local\/share\/whispertui$/);
    });

    test("getCacheDir returns ~/.cache/whispertui", () => {
      const result = getCacheDir();
      expect(result).toMatch(/\.cache\/whispertui$/);
    });

    test("getConfigPath returns config.toml path", () => {
      const result = getConfigPath();
      expect(result).toMatch(/\.config\/whispertui\/config\.toml$/);
    });

    test("getSocketPath returns socket path", () => {
      const result = getSocketPath();
      expect(result).toMatch(/\.local\/state\/whispertui\/whispertui\.sock$/);
    });

    test("getPidPath returns pid file path", () => {
      const result = getPidPath();
      expect(result).toMatch(/\.local\/state\/whispertui\/daemon\.pid$/);
    });

    test("getHistoryDir returns history directory path", () => {
      const result = getHistoryDir();
      expect(result).toMatch(/\.local\/share\/whispertui\/history$/);
    });
  });

  describe("custom XDG env vars", () => {
    test("respects XDG_CONFIG_HOME", () => {
      process.env.XDG_CONFIG_HOME = "/custom/config";
      const result = getConfigDir();
      expect(result).toBe("/custom/config/whispertui");
    });

    test("respects XDG_STATE_HOME", () => {
      process.env.XDG_STATE_HOME = "/custom/state";
      const result = getStateDir();
      expect(result).toBe("/custom/state/whispertui");
    });

    test("respects XDG_DATA_HOME", () => {
      process.env.XDG_DATA_HOME = "/custom/data";
      const result = getDataDir();
      expect(result).toBe("/custom/data/whispertui");
    });

    test("respects XDG_CACHE_HOME", () => {
      process.env.XDG_CACHE_HOME = "/custom/cache";
      const result = getCacheDir();
      expect(result).toBe("/custom/cache/whispertui");
    });
  });

  describe("ensureDir", () => {
    const testDir = join(tmpdir(), `whispertui-test-${Date.now()}`);

    afterEach(() => {
      // Cleanup test directory
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    test("creates directory if it does not exist", () => {
      expect(existsSync(testDir)).toBe(false);
      ensureDir(testDir);
      expect(existsSync(testDir)).toBe(true);
    });

    test("does not throw if directory already exists", () => {
      ensureDir(testDir);
      expect(() => ensureDir(testDir)).not.toThrow();
    });

    test("creates nested directories", () => {
      const nestedDir = join(testDir, "nested", "deep", "path");
      expect(existsSync(nestedDir)).toBe(false);
      ensureDir(nestedDir);
      expect(existsSync(nestedDir)).toBe(true);
    });
  });

  describe("ensureAllDirs", () => {
    const testBase = join(tmpdir(), `whispertui-test-all-${Date.now()}`);

    beforeEach(() => {
      process.env.XDG_CONFIG_HOME = join(testBase, "config");
      process.env.XDG_STATE_HOME = join(testBase, "state");
      process.env.XDG_DATA_HOME = join(testBase, "data");
      process.env.XDG_CACHE_HOME = join(testBase, "cache");
    });

    afterEach(() => {
      // Cleanup test directories
      if (existsSync(testBase)) {
        rmSync(testBase, { recursive: true });
      }
    });

    test("creates all required directories", () => {
      ensureAllDirs();

      expect(existsSync(getConfigDir())).toBe(true);
      expect(existsSync(getStateDir())).toBe(true);
      expect(existsSync(getDataDir())).toBe(true);
      expect(existsSync(getCacheDir())).toBe(true);
      expect(existsSync(getHistoryDir())).toBe(true);
    });
  });

  describe("paths object", () => {
    test("exports all path functions", () => {
      expect(typeof paths.config).toBe("function");
      expect(typeof paths.state).toBe("function");
      expect(typeof paths.data).toBe("function");
      expect(typeof paths.cache).toBe("function");
      expect(typeof paths.configFile).toBe("function");
      expect(typeof paths.socket).toBe("function");
      expect(typeof paths.pid).toBe("function");
      expect(typeof paths.history).toBe("function");
    });

    test("path functions return strings", () => {
      expect(typeof paths.config()).toBe("string");
      expect(typeof paths.state()).toBe("string");
      expect(typeof paths.data()).toBe("string");
      expect(typeof paths.cache()).toBe("string");
      expect(typeof paths.configFile()).toBe("string");
      expect(typeof paths.socket()).toBe("string");
      expect(typeof paths.pid()).toBe("string");
      expect(typeof paths.history()).toBe("string");
    });
  });
});
