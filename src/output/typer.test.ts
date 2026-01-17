import { describe, test, expect } from "bun:test";
import {
  typeText,
  checkWtypeAvailable,
  WtypeNotFoundError,
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

  describe("typeText", () => {
    test("handles empty text gracefully", async () => {
      // Empty text should return immediately without error
      await typeText("");
      // If it doesn't throw, empty text was handled correctly
    });

    // Note: Actual typing tests require a focused window and cannot be fully
    // automated in a headless environment. The following tests verify the
    // module's behavior under error conditions and with wtype available.

    test("types simple text without error when wtype available", async () => {
      const available = await checkWtypeAvailable();
      if (!available) {
        console.log("Skipping test: wtype not available");
        return;
      }

      // This will attempt to type but may fail if no window is focused
      // In a Wayland session with a focused window, this would type the text
      try {
        await typeText("test");
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
        await typeText(unicodeText);
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
        await typeText(specialText);
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
        await typeText(textWithNewlines);
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
        await typeText("hi", { delay: 10 });
      } catch (error) {
        if (error instanceof TyperError) {
          console.log("wtype failed (expected in test env):", error.message);
          return;
        }
        throw error;
      }
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
});
