/**
 * Hyprland Context Detection Module
 *
 * Detects the focused application using hyprctl for context-aware behavior.
 * Provides graceful fallback when hyprctl is not available (non-Hyprland environments).
 */

import { spawn } from "node:child_process";
import type { WindowContext } from "../daemon/state.ts";

/** Error when hyprctl binary is not found */
export class HyprctlNotFoundError extends Error {
  constructor() {
    super(
      "hyprctl not found. Context detection requires Hyprland.\n" +
        "If you're using a different compositor, context detection will be disabled."
    );
    this.name = "HyprctlNotFoundError";
  }
}

/** Error when hyprctl command fails */
export class HyprctlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HyprctlError";
  }
}

/** Raw hyprctl activewindow JSON response */
interface HyprctlActiveWindow {
  class?: string;
  title?: string;
  initialClass?: string;
  initialTitle?: string;
  address?: string;
  mapped?: boolean;
  hidden?: boolean;
  at?: [number, number];
  size?: [number, number];
  workspace?: {
    id?: number;
    name?: string;
  };
  floating?: boolean;
  monitor?: number;
  pid?: number;
  xwayland?: boolean;
  pinned?: boolean;
  fullscreen?: boolean;
  fullscreenMode?: number;
  fakeFullscreen?: boolean;
  grouped?: string[];
  swallowing?: string;
  focusHistoryID?: number;
}

/**
 * Get the active window information from Hyprland
 *
 * @throws {HyprctlNotFoundError} If hyprctl is not installed
 * @throws {HyprctlError} If hyprctl command fails
 */
export async function getActiveWindow(): Promise<HyprctlActiveWindow | null> {
  return new Promise((resolve, reject) => {
    const proc = spawn("hyprctl", ["activewindow", "-j"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new HyprctlNotFoundError());
      } else {
        reject(new HyprctlError(`hyprctl failed: ${error.message}`));
      }
    });

    proc.on("exit", (code, signal) => {
      if (code === 0) {
        try {
          // hyprctl returns empty or "null" when no window is focused
          const trimmed = stdout.trim();
          if (!trimmed || trimmed === "null" || trimmed === "{}") {
            resolve(null);
            return;
          }
          const parsed = JSON.parse(trimmed) as HyprctlActiveWindow;
          resolve(parsed);
        } catch {
          reject(new HyprctlError(`Failed to parse hyprctl output: ${stdout}`));
        }
      } else {
        const errorMsg = stderr.trim() || `hyprctl exited with code ${code}, signal ${signal}`;
        reject(new HyprctlError(errorMsg));
      }
    });
  });
}

/**
 * Check if hyprctl is available on the system
 */
export async function checkHyprctlAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("hyprctl", ["version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", (code) => {
      // hyprctl version returns 0 on success
      resolve(code === 0);
    });
  });
}

/** Context configuration extracted from Config */
export interface ContextConfig {
  enabled: boolean;
  codeAwareApps: string[];
}

/**
 * Check if a window class matches any of the code-aware apps
 *
 * @param windowClass - The window class to check
 * @param codeAwareApps - List of app names/classes to match
 * @returns true if the window is a code-aware app
 */
export function isCodeAwareApp(windowClass: string, codeAwareApps: string[]): boolean {
  if (!windowClass) {
    return false;
  }
  const lowerClass = windowClass.toLowerCase();
  return codeAwareApps.some((app) => lowerClass.includes(app.toLowerCase()));
}

/**
 * Context detector class that respects configuration and caches availability
 */
export class ContextDetector {
  private config: ContextConfig;
  private hyprctlAvailable: boolean | null = null;

  constructor(config: ContextConfig) {
    this.config = config;
  }

  /**
   * Check and cache hyprctl availability
   */
  private async ensureAvailabilityChecked(): Promise<boolean> {
    if (this.hyprctlAvailable === null) {
      this.hyprctlAvailable = await checkHyprctlAvailable();
    }
    return this.hyprctlAvailable;
  }

  /**
   * Detect the current window context
   *
   * @returns WindowContext if detection succeeds, null if disabled or unavailable
   */
  async detectContext(): Promise<WindowContext | null> {
    // Check if context detection is enabled
    if (!this.config.enabled) {
      return null;
    }

    // Check if hyprctl is available
    const available = await this.ensureAvailabilityChecked();
    if (!available) {
      return null;
    }

    try {
      const activeWindow = await getActiveWindow();

      // No active window
      if (!activeWindow) {
        return null;
      }

      const windowClass = activeWindow.class || activeWindow.initialClass || "";
      const windowTitle = activeWindow.title || activeWindow.initialTitle || "";

      return {
        windowClass,
        windowTitle,
        isCodeAware: isCodeAwareApp(windowClass, this.config.codeAwareApps),
      };
    } catch (error) {
      // On any error, return null - context detection is best-effort
      if (error instanceof HyprctlNotFoundError) {
        this.hyprctlAvailable = false;
      }
      return null;
    }
  }

  /**
   * Check if context detection is enabled in config
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if hyprctl is available (cached after first check)
   */
  async isHyprctlAvailable(): Promise<boolean> {
    return this.ensureAvailabilityChecked();
  }

  /**
   * Get the list of code-aware apps from config
   */
  getCodeAwareApps(): string[] {
    return [...this.config.codeAwareApps];
  }
}

/**
 * Extract context config from application Config
 */
export function extractContextConfig(config: {
  context: { enabled: boolean; code_aware_apps: string[] };
}): ContextConfig {
  return {
    enabled: config.context.enabled,
    codeAwareApps: config.context.code_aware_apps,
  };
}

/**
 * Create a new ContextDetector instance
 */
export function createContextDetector(config: ContextConfig): ContextDetector {
  return new ContextDetector(config);
}

/**
 * Return focus to a specific window by its address
 *
 * @param address - The window address (hex string, with or without 0x prefix)
 * @returns true if focus was successfully returned, false otherwise
 */
export async function returnFocusToWindow(address: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Ensure address has 0x prefix
    const formattedAddress = address.startsWith("0x") ? address : `0x${address}`;

    const proc = spawn("hyprctl", ["dispatch", "focuswindow", `address:${formattedAddress}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("exit", (code) => {
      resolve(code === 0);
    });
  });
}
