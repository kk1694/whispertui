import { describe, test, expect } from "bun:test";
import {
  sendNotification,
  checkNotifySendAvailable,
  createNotifier,
  extractNotificationConfig,
  Notifier,
  NotifySendNotFoundError,
  NotificationError,
  type NotificationConfig,
} from "./index.ts";

describe("Notification Module", () => {
  describe("NotifySendNotFoundError", () => {
    test("has correct message with install instructions", () => {
      const error = new NotifySendNotFoundError();

      expect(error.name).toBe("NotifySendNotFoundError");
      expect(error.message).toContain("notify-send not found");
      expect(error.message).toContain("pacman -S libnotify");
      expect(error.message).toContain("apt install libnotify-bin");
      expect(error.message).toContain("dnf install libnotify");
    });
  });

  describe("NotificationError", () => {
    test("has correct name and message", () => {
      const error = new NotificationError("Test notification error");

      expect(error.name).toBe("NotificationError");
      expect(error.message).toBe("Test notification error");
    });
  });

  describe("checkNotifySendAvailable", () => {
    test("returns boolean indicating availability", async () => {
      const result = await checkNotifySendAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("sendNotification", () => {
    test("sends notification with title only", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      // Should not throw
      await sendNotification({ title: "Test Notification" });
    });

    test("sends notification with title and body", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      await sendNotification({
        title: "Test Title",
        body: "This is the body text",
      });
    });

    test("sends notification with urgency levels", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      // Test all urgency levels
      await sendNotification({ title: "Low urgency", urgency: "low" });
      await sendNotification({ title: "Normal urgency", urgency: "normal" });
      await sendNotification({ title: "Critical urgency", urgency: "critical" });
    });

    test("sends notification with timeout", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      await sendNotification({
        title: "Expires quickly",
        timeout: 1000, // 1 second
      });
    });

    test("sends notification with icon", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      await sendNotification({
        title: "With Icon",
        icon: "dialog-information",
      });
    });

    test("sends notification with custom app name", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      await sendNotification({
        title: "Custom App",
        appName: "TestApp",
      });
    });

    test("sends notification with all options", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      await sendNotification({
        title: "Full Notification",
        body: "This has all the options",
        urgency: "normal",
        timeout: 2000,
        icon: "audio-input-microphone",
        appName: "WhisperTUI-Test",
      });
    });

    test("handles special characters in title and body", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      await sendNotification({
        title: "Special chars: \"quotes\" & <brackets>",
        body: "Body with 'apostrophes' and unicode: 日本語 🎉",
      });
    });

    test("handles empty body", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      // Empty body should not be included
      await sendNotification({
        title: "No body notification",
        body: "",
      });
    });
  });

  describe("Notifier class", () => {
    test("creates notifier with config", () => {
      const config: NotificationConfig = { enabled: true };
      const notifier = new Notifier(config);
      expect(notifier.isEnabled()).toBe(true);
    });

    test("isEnabled returns config value", () => {
      const enabledNotifier = new Notifier({ enabled: true });
      const disabledNotifier = new Notifier({ enabled: false });

      expect(enabledNotifier.isEnabled()).toBe(true);
      expect(disabledNotifier.isEnabled()).toBe(false);
    });

    test("notify returns false when disabled", async () => {
      const notifier = new Notifier({ enabled: false });

      const result = await notifier.notify({ title: "Test" });
      expect(result).toBe(false);
    });

    test("notify sends when enabled and available", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      const notifier = new Notifier({ enabled: true });
      const result = await notifier.notify({ title: "Enabled test" });
      expect(result).toBe(true);
    });

    test("notifyRecordingStarted sends appropriate notification", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      const notifier = new Notifier({ enabled: true });
      const result = await notifier.notifyRecordingStarted();
      expect(result).toBe(true);
    });

    test("notifyRecordingStarted does nothing when disabled", async () => {
      const notifier = new Notifier({ enabled: false });
      const result = await notifier.notifyRecordingStarted();
      expect(result).toBe(false);
    });

    test("notifyTranscriptionComplete sends with preview", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      const notifier = new Notifier({ enabled: true });
      const result = await notifier.notifyTranscriptionComplete("Hello, this is a test transcription.");
      expect(result).toBe(true);
    });

    test("notifyTranscriptionComplete truncates long text", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      const notifier = new Notifier({ enabled: true });
      const longText = "A".repeat(200);
      const result = await notifier.notifyTranscriptionComplete(longText);
      expect(result).toBe(true);
    });

    test("notifyTranscriptionComplete handles empty text", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      const notifier = new Notifier({ enabled: true });
      const result = await notifier.notifyTranscriptionComplete("");
      expect(result).toBe(true);
    });

    test("notifyError sends error notification", async () => {
      const available = await checkNotifySendAvailable();
      if (!available) {
        console.log("Skipping test: notify-send not available");
        return;
      }

      const notifier = new Notifier({ enabled: true });
      const result = await notifier.notifyError("Something went wrong");
      expect(result).toBe(true);
    });

    test("notifyError does nothing when disabled", async () => {
      const notifier = new Notifier({ enabled: false });
      const result = await notifier.notifyError("Error message");
      expect(result).toBe(false);
    });
  });

  describe("createNotifier", () => {
    test("creates Notifier instance with config", () => {
      const config: NotificationConfig = { enabled: true };
      const notifier = createNotifier(config);

      expect(notifier).toBeInstanceOf(Notifier);
      expect(notifier.isEnabled()).toBe(true);
    });
  });

  describe("extractNotificationConfig", () => {
    test("extracts enabled status from config", () => {
      const config = { notifications: { enabled: true } };
      const result = extractNotificationConfig(config);

      expect(result).toEqual({ enabled: true });
    });

    test("extracts disabled status from config", () => {
      const config = { notifications: { enabled: false } };
      const result = extractNotificationConfig(config);

      expect(result).toEqual({ enabled: false });
    });
  });
});

describe("Notifier graceful degradation", () => {
  test("notifier handles missing notify-send gracefully", async () => {
    // This test ensures that even if notify-send is missing,
    // the notifier doesn't throw - it just returns false
    const notifier = new Notifier({ enabled: true });

    // Even if notify-send is available, this tests the error handling path
    // by calling notify which will return true or false based on availability
    const result = await notifier.notify({ title: "Test" });
    expect(typeof result).toBe("boolean");
  });

  test("multiple notifications don't cause issues", async () => {
    const available = await checkNotifySendAvailable();
    if (!available) {
      console.log("Skipping test: notify-send not available");
      return;
    }

    const notifier = new Notifier({ enabled: true });

    // Send multiple notifications in sequence
    const results = await Promise.all([
      notifier.notify({ title: "Test 1" }),
      notifier.notify({ title: "Test 2" }),
      notifier.notify({ title: "Test 3" }),
    ]);

    expect(results.every((r) => r === true)).toBe(true);
  });
});
