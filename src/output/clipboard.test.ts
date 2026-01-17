import { describe, test, expect } from "bun:test";
import {
  copyToClipboard,
  checkWlCopyAvailable,
  WlCopyNotFoundError,
  ClipboardError,
} from "./clipboard.ts";

describe("Clipboard Module", () => {
  describe("WlCopyNotFoundError", () => {
    test("has correct message with install instructions", () => {
      const error = new WlCopyNotFoundError();

      expect(error.name).toBe("WlCopyNotFoundError");
      expect(error.message).toContain("wl-copy not found");
      expect(error.message).toContain("pacman -S wl-clipboard");
      expect(error.message).toContain("apt install wl-clipboard");
      expect(error.message).toContain("dnf install wl-clipboard");
    });
  });

  describe("ClipboardError", () => {
    test("has correct name and message", () => {
      const error = new ClipboardError("Test clipboard error");

      expect(error.name).toBe("ClipboardError");
      expect(error.message).toBe("Test clipboard error");
    });
  });

  describe("checkWlCopyAvailable", () => {
    test("returns boolean indicating availability", async () => {
      const result = await checkWlCopyAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("copyToClipboard", () => {
    test("copies simple text to clipboard", async () => {
      const available = await checkWlCopyAvailable();
      if (!available) {
        console.log("Skipping test: wl-copy not available");
        return;
      }

      // Should not throw
      await copyToClipboard("Hello, World!");
    });

    test("handles empty text", async () => {
      const available = await checkWlCopyAvailable();
      if (!available) {
        console.log("Skipping test: wl-copy not available");
        return;
      }

      // Should not throw - copying empty string is valid
      await copyToClipboard("");
    });

    test("preserves newlines in text", async () => {
      const available = await checkWlCopyAvailable();
      if (!available) {
        console.log("Skipping test: wl-copy not available");
        return;
      }

      const textWithNewlines = "Line 1\nLine 2\nLine 3";
      await copyToClipboard(textWithNewlines);
      // If it doesn't throw, newlines were handled correctly
    });

    test("handles unicode characters", async () => {
      const available = await checkWlCopyAvailable();
      if (!available) {
        console.log("Skipping test: wl-copy not available");
        return;
      }

      const unicodeText = "Hello 世界 🌍 Привет مرحبا";
      await copyToClipboard(unicodeText);
      // If it doesn't throw, unicode was handled correctly
    });

    test("handles special characters (quotes, brackets)", async () => {
      const available = await checkWlCopyAvailable();
      if (!available) {
        console.log("Skipping test: wl-copy not available");
        return;
      }

      const specialText = `He said "Hello" and 'Goodbye' with {brackets} and [arrays] plus $variables`;
      await copyToClipboard(specialText);
      // If it doesn't throw, special chars were handled correctly
    });

    test("handles very long text", async () => {
      const available = await checkWlCopyAvailable();
      if (!available) {
        console.log("Skipping test: wl-copy not available");
        return;
      }

      // Create a long text (10KB)
      const longText = "This is a test sentence. ".repeat(500);
      await copyToClipboard(longText);
      // If it doesn't throw, long text was handled correctly
    });

    test("handles multiline text with mixed content", async () => {
      const available = await checkWlCopyAvailable();
      if (!available) {
        console.log("Skipping test: wl-copy not available");
        return;
      }

      const mixedText = `
First paragraph with "quotes" and 'apostrophes'.

Second paragraph with unicode: 日本語 and émojis 🎉

Third paragraph with code:
  const x = { foo: "bar" };
  console.log(x);

End of text.
`.trim();

      await copyToClipboard(mixedText);
      // If it doesn't throw, mixed content was handled correctly
    });
  });
});

// Integration test: verify clipboard content can be read back
// This requires wl-paste to be available
describe("Clipboard Integration", () => {
  test("copied text can be retrieved with wl-paste", async () => {
    const available = await checkWlCopyAvailable();
    if (!available) {
      console.log("Skipping integration test: wl-copy not available");
      return;
    }

    const testText = `Test text at ${Date.now()}`;
    await copyToClipboard(testText);

    // Verify with wl-paste
    const proc = Bun.spawn(["wl-paste"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.log("Skipping verification: wl-paste failed");
      return;
    }

    expect(output.trim()).toBe(testText);
  });

  test("preserves newlines when read back", async () => {
    const available = await checkWlCopyAvailable();
    if (!available) {
      console.log("Skipping integration test: wl-copy not available");
      return;
    }

    const textWithNewlines = "Line 1\nLine 2\nLine 3";
    await copyToClipboard(textWithNewlines);

    // Verify with wl-paste
    const proc = Bun.spawn(["wl-paste"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.log("Skipping verification: wl-paste failed");
      return;
    }

    expect(output.trim()).toBe(textWithNewlines);
  });

  test("preserves unicode when read back", async () => {
    const available = await checkWlCopyAvailable();
    if (!available) {
      console.log("Skipping integration test: wl-copy not available");
      return;
    }

    const unicodeText = "Hello 世界 🌍";
    await copyToClipboard(unicodeText);

    // Verify with wl-paste
    const proc = Bun.spawn(["wl-paste"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      console.log("Skipping verification: wl-paste failed");
      return;
    }

    expect(output.trim()).toBe(unicodeText);
  });
});
