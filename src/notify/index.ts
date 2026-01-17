/**
 * Desktop Notification Module
 *
 * Sends desktop notifications via notify-send (libnotify).
 * Provides graceful error handling for missing dependencies.
 */

import { spawn } from "node:child_process";

/** Error when notify-send binary is not found */
export class NotifySendNotFoundError extends Error {
  constructor() {
    super(
      "notify-send not found. Please install libnotify:\n" +
        "  Arch Linux: pacman -S libnotify\n" +
        "  Ubuntu/Debian: apt install libnotify-bin\n" +
        "  Fedora: dnf install libnotify"
    );
    this.name = "NotifySendNotFoundError";
  }
}

/** Error when notification operation fails */
export class NotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationError";
  }
}

/** Notification urgency levels */
export type NotificationUrgency = "low" | "normal" | "critical";

/** Options for sending a notification */
export interface NotificationOptions {
  /** The notification title (summary) */
  title: string;
  /** The notification body text */
  body?: string;
  /** Urgency level: low, normal, or critical */
  urgency?: NotificationUrgency;
  /** Timeout in milliseconds (0 = never expires) */
  timeout?: number;
  /** Icon name or path */
  icon?: string;
  /** Application name */
  appName?: string;
}

/**
 * Send a desktop notification using notify-send
 *
 * @param options - Notification options
 * @throws {NotifySendNotFoundError} If notify-send is not installed
 * @throws {NotificationError} If notification fails
 */
export async function sendNotification(options: NotificationOptions): Promise<void> {
  const args: string[] = [];

  // App name
  if (options.appName) {
    args.push("--app-name", options.appName);
  } else {
    args.push("--app-name", "WhisperTUI");
  }

  // Urgency
  if (options.urgency) {
    args.push("--urgency", options.urgency);
  }

  // Timeout (notify-send uses milliseconds)
  if (options.timeout !== undefined) {
    args.push("--expire-time", options.timeout.toString());
  }

  // Icon
  if (options.icon) {
    args.push("--icon", options.icon);
  }

  // Title is required
  args.push(options.title);

  // Body is optional
  if (options.body) {
    args.push(options.body);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("notify-send", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderrOutput = "";

    proc.stderr?.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new NotifySendNotFoundError());
      } else {
        reject(new NotificationError(`Notification failed: ${error.message}`));
      }
    });

    proc.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = stderrOutput.trim() || `notify-send exited with code ${code}, signal ${signal}`;
        reject(new NotificationError(errorMsg));
      }
    });
  });
}

/**
 * Check if notify-send is available on the system
 */
export async function checkNotifySendAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("notify-send", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", (code) => {
      // notify-send --version returns 0 on success
      resolve(code === 0);
    });
  });
}

/** Notification configuration extracted from Config */
export interface NotificationConfig {
  enabled: boolean;
}

/**
 * Notifier class that respects configuration and handles errors gracefully
 */
export class Notifier {
  private config: NotificationConfig;
  private notifySendAvailable: boolean | null = null;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  /**
   * Check and cache notify-send availability
   */
  private async ensureAvailabilityChecked(): Promise<boolean> {
    if (this.notifySendAvailable === null) {
      this.notifySendAvailable = await checkNotifySendAvailable();
    }
    return this.notifySendAvailable;
  }

  /**
   * Send a notification if enabled and notify-send is available.
   * Errors are logged but not thrown - notifications are best-effort.
   *
   * @param options - Notification options
   * @returns true if notification was sent, false otherwise
   */
  async notify(options: NotificationOptions): Promise<boolean> {
    // Check if notifications are enabled
    if (!this.config.enabled) {
      return false;
    }

    // Check if notify-send is available
    const available = await this.ensureAvailabilityChecked();
    if (!available) {
      return false;
    }

    try {
      await sendNotification(options);
      return true;
    } catch (error) {
      // Log error but don't throw - notifications are best-effort
      if (error instanceof NotifySendNotFoundError) {
        this.notifySendAvailable = false;
      }
      // Silently fail for notifications
      return false;
    }
  }

  /**
   * Send a "recording started" notification
   */
  async notifyRecordingStarted(): Promise<boolean> {
    return this.notify({
      title: "Recording Started",
      body: "Speak now...",
      icon: "audio-input-microphone",
      urgency: "low",
      timeout: 2000,
    });
  }

  /**
   * Send a "transcription complete" notification
   *
   * @param text - The transcribed text (will be truncated for preview)
   */
  async notifyTranscriptionComplete(text: string): Promise<boolean> {
    // Truncate text for preview (max 100 chars)
    const preview = text.length > 100 ? text.substring(0, 97) + "..." : text;

    return this.notify({
      title: "Transcription Complete",
      body: preview || "(empty)",
      icon: "dialog-information",
      urgency: "normal",
      timeout: 3000,
    });
  }

  /**
   * Send an error notification
   *
   * @param message - Error message to display
   */
  async notifyError(message: string): Promise<boolean> {
    return this.notify({
      title: "WhisperTUI Error",
      body: message,
      icon: "dialog-error",
      urgency: "critical",
      timeout: 5000,
    });
  }

  /**
   * Check if notifications are enabled in config
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Extract notification config from application Config
 */
export function extractNotificationConfig(config: { notifications: { enabled: boolean } }): NotificationConfig {
  return {
    enabled: config.notifications.enabled,
  };
}

/**
 * Create a new Notifier instance
 */
export function createNotifier(config: NotificationConfig): Notifier {
  return new Notifier(config);
}
