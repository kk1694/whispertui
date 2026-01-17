import { describe, test, expect } from "bun:test";
import {
  getActiveWindow,
  checkHyprctlAvailable,
  isCodeAwareApp,
  createContextDetector,
  extractContextConfig,
  ContextDetector,
  HyprctlNotFoundError,
  HyprctlError,
  type ContextConfig,
} from "./hyprland.ts";

describe("Context Detection Module", () => {
  describe("HyprctlNotFoundError", () => {
    test("has correct message", () => {
      const error = new HyprctlNotFoundError();

      expect(error.name).toBe("HyprctlNotFoundError");
      expect(error.message).toContain("hyprctl not found");
      expect(error.message).toContain("Hyprland");
    });
  });

  describe("HyprctlError", () => {
    test("has correct name and message", () => {
      const error = new HyprctlError("Test hyprctl error");

      expect(error.name).toBe("HyprctlError");
      expect(error.message).toBe("Test hyprctl error");
    });
  });

  describe("checkHyprctlAvailable", () => {
    test("returns boolean indicating availability", async () => {
      const result = await checkHyprctlAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("getActiveWindow", () => {
    test("returns window info or null when hyprctl is available", async () => {
      const available = await checkHyprctlAvailable();
      if (!available) {
        console.log("Skipping test: hyprctl not available");
        return;
      }

      // Should return either window info or null (if no window focused)
      const result = await getActiveWindow();
      if (result !== null) {
        // If we get a result, check it has expected properties
        expect(typeof result).toBe("object");
        // class may be undefined for some windows
        if (result.class !== undefined) {
          expect(typeof result.class).toBe("string");
        }
        if (result.title !== undefined) {
          expect(typeof result.title).toBe("string");
        }
      }
    });
  });

  describe("isCodeAwareApp", () => {
    test("returns true for exact match", () => {
      const codeAwareApps = ["Alacritty", "kitty", "foot"];
      expect(isCodeAwareApp("Alacritty", codeAwareApps)).toBe(true);
    });

    test("returns true for case-insensitive match", () => {
      const codeAwareApps = ["Alacritty", "kitty", "foot"];
      expect(isCodeAwareApp("alacritty", codeAwareApps)).toBe(true);
      expect(isCodeAwareApp("ALACRITTY", codeAwareApps)).toBe(true);
    });

    test("returns true for partial match (substring)", () => {
      const codeAwareApps = ["Alacritty", "code"];
      expect(isCodeAwareApp("org.Alacritty.Alacritty", codeAwareApps)).toBe(true);
      expect(isCodeAwareApp("Visual Studio Code", codeAwareApps)).toBe(true);
    });

    test("returns false for non-matching app", () => {
      const codeAwareApps = ["Alacritty", "kitty", "foot"];
      expect(isCodeAwareApp("Firefox", codeAwareApps)).toBe(false);
      expect(isCodeAwareApp("chromium", codeAwareApps)).toBe(false);
    });

    test("returns false for empty window class", () => {
      const codeAwareApps = ["Alacritty", "kitty", "foot"];
      expect(isCodeAwareApp("", codeAwareApps)).toBe(false);
    });

    test("returns false for empty code-aware apps list", () => {
      expect(isCodeAwareApp("Alacritty", [])).toBe(false);
    });

    test("handles nvim in terminal window class", () => {
      const codeAwareApps = ["nvim", "Alacritty"];
      expect(isCodeAwareApp("Alacritty", codeAwareApps)).toBe(true);
    });

    test("handles VS Code variants", () => {
      const codeAwareApps = ["code", "Code"];
      expect(isCodeAwareApp("Code", codeAwareApps)).toBe(true);
      expect(isCodeAwareApp("code-oss", codeAwareApps)).toBe(true);
      expect(isCodeAwareApp("Code - OSS", codeAwareApps)).toBe(true);
    });
  });

  describe("extractContextConfig", () => {
    test("extracts enabled and codeAwareApps from config", () => {
      const config = {
        context: {
          enabled: true,
          code_aware_apps: ["Alacritty", "kitty"],
        },
      };

      const result = extractContextConfig(config);

      expect(result.enabled).toBe(true);
      expect(result.codeAwareApps).toEqual(["Alacritty", "kitty"]);
    });

    test("extracts disabled config", () => {
      const config = {
        context: {
          enabled: false,
          code_aware_apps: [],
        },
      };

      const result = extractContextConfig(config);

      expect(result.enabled).toBe(false);
      expect(result.codeAwareApps).toEqual([]);
    });
  });

  describe("ContextDetector", () => {
    describe("constructor and basic properties", () => {
      test("creates detector with config", () => {
        const config: ContextConfig = {
          enabled: true,
          codeAwareApps: ["Alacritty", "kitty"],
        };

        const detector = createContextDetector(config);

        expect(detector.isEnabled()).toBe(true);
        expect(detector.getCodeAwareApps()).toEqual(["Alacritty", "kitty"]);
      });

      test("getCodeAwareApps returns a copy", () => {
        const config: ContextConfig = {
          enabled: true,
          codeAwareApps: ["Alacritty"],
        };

        const detector = createContextDetector(config);
        const apps = detector.getCodeAwareApps();
        apps.push("modified");

        // Original should not be modified
        expect(detector.getCodeAwareApps()).toEqual(["Alacritty"]);
      });
    });

    describe("detectContext when disabled", () => {
      test("returns null when disabled", async () => {
        const config: ContextConfig = {
          enabled: false,
          codeAwareApps: ["Alacritty"],
        };

        const detector = createContextDetector(config);
        const result = await detector.detectContext();

        expect(result).toBeNull();
      });
    });

    describe("detectContext when enabled", () => {
      test("returns context when hyprctl is available", async () => {
        const available = await checkHyprctlAvailable();
        if (!available) {
          console.log("Skipping test: hyprctl not available");
          return;
        }

        const config: ContextConfig = {
          enabled: true,
          codeAwareApps: ["Alacritty", "kitty", "foot"],
        };

        const detector = createContextDetector(config);
        const result = await detector.detectContext();

        // May be null if no window is focused
        if (result !== null) {
          expect(result).toHaveProperty("windowClass");
          expect(result).toHaveProperty("windowTitle");
          expect(result).toHaveProperty("isCodeAware");
          expect(typeof result.windowClass).toBe("string");
          expect(typeof result.windowTitle).toBe("string");
          expect(typeof result.isCodeAware).toBe("boolean");
        }
      });

      test("returns null when hyprctl is not available", async () => {
        const available = await checkHyprctlAvailable();
        if (available) {
          console.log("Skipping test: hyprctl is available");
          return;
        }

        const config: ContextConfig = {
          enabled: true,
          codeAwareApps: ["Alacritty"],
        };

        const detector = createContextDetector(config);
        const result = await detector.detectContext();

        // Should return null gracefully when hyprctl is not available
        expect(result).toBeNull();
      });
    });

    describe("isHyprctlAvailable", () => {
      test("caches availability check", async () => {
        const config: ContextConfig = {
          enabled: true,
          codeAwareApps: [],
        };

        const detector = createContextDetector(config);

        // First call - performs check
        const first = await detector.isHyprctlAvailable();
        // Second call - should be cached
        const second = await detector.isHyprctlAvailable();

        expect(first).toBe(second);
      });
    });
  });

  describe("integration with real hyprctl", () => {
    test("full context detection flow", async () => {
      const available = await checkHyprctlAvailable();
      if (!available) {
        console.log("Skipping test: hyprctl not available");
        return;
      }

      const config: ContextConfig = {
        enabled: true,
        codeAwareApps: ["Alacritty", "kitty", "foot", "nvim", "code", "Code"],
      };

      const detector = createContextDetector(config);

      // Should not throw
      const context = await detector.detectContext();

      // Context may be null if no window is focused
      // but should not error
      console.log("Detected context:", context);
    });
  });
});
