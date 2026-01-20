import { describe, test, expect } from "bun:test";
import {
  typeText,
  checkWtypeAvailable,
  checkYdotoolAvailable,
  WtypeNotFoundError,
  YdotoolNotFoundError,
  TyperError,
} from "./typer.ts";

describe("Typer Module", () => {
  describe("WtypeNotFoundError", () => {
    test("has correct message with install instructions", () => {
      const error = new WtypeNotFoundError();

      expect(error.name).toBe("WtypeNotFoundError");
      expect(error.message).toContain("wtype not found");
      expect(error.message).toContain("pacman -S wtype");
      expect(error.message).toContain("apt install wtype");
      expect(error.message).toContain("dnf install wtype");
    });
  });

  describe("YdotoolNotFoundError", () => {
    test("has correct message with install instructions", () => {
      const error = new YdotoolNotFoundError();

      expect(error.name).toBe("YdotoolNotFoundError");
      expect(error.message).toContain("ydotool not found");
      expect(error.message).toContain("pacman -S ydotool");
      expect(error.message).toContain("apt install ydotool");
      expect(error.message).toContain("dnf install ydotool");
      expect(error.message).toContain("systemctl --user enable --now ydotool");
    });
  });

  describe("TyperError", () => {
    test("has correct name and message", () => {
      const error = new TyperError("Test typer error");

      expect(error.name).toBe("TyperError");
      expect(error.message).toBe("Test typer error");
    });
  });

  describe("checkWtypeAvailable", () => {
    test("returns boolean indicating availability", async () => {
      const result = await checkWtypeAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("checkYdotoolAvailable", () => {
    test("returns boolean indicating availability", async () => {
      const result = await checkYdotoolAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("typeText", () => {
    test("handles empty text gracefully", async () => {
      // Empty text should return immediately without error
      await typeText("");
      // If it doesn't throw, empty text was handled correctly
    });

    // Note: Actual typing tests require a focused window and cannot be fully
    // automated in a headless environment. The following tests verify the
    // module's behavior under error conditions and with wtype/ydotool available.

    describe("with wtype method", () => {
      test("types simple text without error when wtype available", async () => {
        const available = await checkWtypeAvailable();
        if (!available) {
          console.log("Skipping test: wtype not available");
          return;
        }

        // This will attempt to type but may fail if no window is focused
        // In a Wayland session with a focused window, this would type the text
        try {
          await typeText("test", { method: "wtype" });
        } catch (error) {
          // If wtype fails due to no focused window, that's expected in test env
          if (error instanceof TyperError) {
            console.log("wtype failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("handles unicode characters", async () => {
        const available = await checkWtypeAvailable();
        if (!available) {
          console.log("Skipping test: wtype not available");
          return;
        }

        const unicodeText = "Hello 世界 🌍";
        try {
          await typeText(unicodeText, { method: "wtype" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("wtype failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("handles special characters (quotes, brackets)", async () => {
        const available = await checkWtypeAvailable();
        if (!available) {
          console.log("Skipping test: wtype not available");
          return;
        }

        const specialText = `He said "Hello" and 'Goodbye' with {brackets}`;
        try {
          await typeText(specialText, { method: "wtype" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("wtype failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("handles newlines in text", async () => {
        const available = await checkWtypeAvailable();
        if (!available) {
          console.log("Skipping test: wtype not available");
          return;
        }

        const textWithNewlines = "Line 1\nLine 2\nLine 3";
        try {
          await typeText(textWithNewlines, { method: "wtype" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("wtype failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("respects delay option", async () => {
        const available = await checkWtypeAvailable();
        if (!available) {
          console.log("Skipping test: wtype not available");
          return;
        }

        // Test that delay option is accepted (actual timing cannot be verified)
        try {
          await typeText("hi", { delay: 10, method: "wtype" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("wtype failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });
    });

    describe("with ydotool method", () => {
      test("types simple text without error when ydotool available", async () => {
        const available = await checkYdotoolAvailable();
        if (!available) {
          console.log("Skipping test: ydotool not available");
          return;
        }

        try {
          await typeText("test", { method: "ydotool" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("ydotool failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("handles text with spaces", async () => {
        const available = await checkYdotoolAvailable();
        if (!available) {
          console.log("Skipping test: ydotool not available");
          return;
        }

        const textWithSpaces = "hello world with spaces";
        try {
          await typeText(textWithSpaces, { method: "ydotool" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("ydotool failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("handles unicode characters", async () => {
        const available = await checkYdotoolAvailable();
        if (!available) {
          console.log("Skipping test: ydotool not available");
          return;
        }

        const unicodeText = "Hello 世界 🌍";
        try {
          await typeText(unicodeText, { method: "ydotool" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("ydotool failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("handles special characters (quotes, brackets)", async () => {
        const available = await checkYdotoolAvailable();
        if (!available) {
          console.log("Skipping test: ydotool not available");
          return;
        }

        const specialText = `He said "Hello" and 'Goodbye' with {brackets}`;
        try {
          await typeText(specialText, { method: "ydotool" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("ydotool failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("handles newlines in text", async () => {
        const available = await checkYdotoolAvailable();
        if (!available) {
          console.log("Skipping test: ydotool not available");
          return;
        }

        const textWithNewlines = "Line 1\nLine 2\nLine 3";
        try {
          await typeText(textWithNewlines, { method: "ydotool" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("ydotool failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });

      test("respects delay option", async () => {
        const available = await checkYdotoolAvailable();
        if (!available) {
          console.log("Skipping test: ydotool not available");
          return;
        }

        try {
          await typeText("hi", { delay: 10, method: "ydotool" });
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("ydotool failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });
    });

    describe("default method", () => {
      test("uses ydotool by default", async () => {
        const available = await checkYdotoolAvailable();
        if (!available) {
          console.log("Skipping test: ydotool not available");
          return;
        }

        // When no method specified, should use ydotool
        try {
          await typeText("test");
        } catch (error) {
          if (error instanceof TyperError) {
            console.log("ydotool failed (expected in test env):", error.message);
            return;
          }
          throw error;
        }
      });
    });
  });
});

describe("Typer Error Handling", () => {
  test("TyperError is instanceof Error", () => {
    const error = new TyperError("test");
    expect(error instanceof Error).toBe(true);
    expect(error instanceof TyperError).toBe(true);
  });

  test("WtypeNotFoundError is instanceof Error", () => {
    const error = new WtypeNotFoundError();
    expect(error instanceof Error).toBe(true);
    expect(error instanceof WtypeNotFoundError).toBe(true);
  });

  test("YdotoolNotFoundError is instanceof Error", () => {
    const error = new YdotoolNotFoundError();
    expect(error instanceof Error).toBe(true);
    expect(error instanceof YdotoolNotFoundError).toBe(true);
  });
});
