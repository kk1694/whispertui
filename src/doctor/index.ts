/**
 * Doctor Module
 *
 * Checks system dependencies and reports their status.
 * Helps users troubleshoot missing or misconfigured dependencies.
 */

import { spawn } from "node:child_process";

/** Result of checking a single dependency */
export interface DependencyCheck {
  name: string;
  description: string;
  status: "ok" | "missing" | "error";
  version?: string;
  installHint?: string;
  errorMessage?: string;
  required: boolean;
}

/** Result of checking all dependencies */
export interface DoctorResult {
  dependencies: DependencyCheck[];
  envVars: EnvVarCheck[];
  allOk: boolean;
  requiredOk: boolean;
}

/** Result of checking an environment variable */
export interface EnvVarCheck {
  name: string;
  description: string;
  status: "set" | "not_set";
  required: boolean;
}

/**
 * Run a command and capture its output
 */
async function runCommand(
  command: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
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

    proc.on("error", () => {
      resolve({ code: null, stdout: "", stderr: "Command not found" });
    });

    proc.on("exit", (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

/**
 * Check if bun is available and get its version
 */
export async function checkBun(): Promise<DependencyCheck> {
  const result = await runCommand("bun", ["--version"]);

  if (result.code === null) {
    return {
      name: "bun",
      description: "JavaScript/TypeScript runtime",
      status: "missing",
      installHint: "Visit https://bun.sh for installation instructions",
      required: true,
    };
  }

  if (result.code === 0) {
    return {
      name: "bun",
      description: "JavaScript/TypeScript runtime",
      status: "ok",
      version: result.stdout,
      required: true,
    };
  }

  return {
    name: "bun",
    description: "JavaScript/TypeScript runtime",
    status: "error",
    errorMessage: result.stderr || `Exit code ${result.code}`,
    required: true,
  };
}

/**
 * Check if parecord is available and get its version
 */
export async function checkParecord(): Promise<DependencyCheck> {
  const result = await runCommand("parecord", ["--version"]);

  if (result.code === null) {
    return {
      name: "parecord",
      description: "PulseAudio recording tool",
      status: "missing",
      installHint:
        "Arch: pacman -S pulseaudio\n" +
        "Ubuntu/Debian: apt install pulseaudio-utils\n" +
        "Fedora: dnf install pulseaudio-utils",
      required: true,
    };
  }

  if (result.code === 0) {
    // parecord --version outputs "pacat X.Y.Z" on first line
    const firstLine = result.stdout.split("\n")[0] ?? "";
    const version = firstLine.replace(/^pacat\s+/, "");
    return {
      name: "parecord",
      description: "PulseAudio recording tool",
      status: "ok",
      version,
      required: true,
    };
  }

  return {
    name: "parecord",
    description: "PulseAudio recording tool",
    status: "error",
    errorMessage: result.stderr || `Exit code ${result.code}`,
    required: true,
  };
}

/**
 * Check if wl-copy is available and get its version
 */
export async function checkWlCopy(): Promise<DependencyCheck> {
  const result = await runCommand("wl-copy", ["--version"]);

  if (result.code === null) {
    return {
      name: "wl-copy",
      description: "Wayland clipboard utility",
      status: "missing",
      installHint:
        "Arch: pacman -S wl-clipboard\n" +
        "Ubuntu/Debian: apt install wl-clipboard\n" +
        "Fedora: dnf install wl-clipboard",
      required: true,
    };
  }

  if (result.code === 0) {
    // wl-copy --version outputs "wl-copy X.Y.Z"
    const version = result.stdout.replace(/^wl-copy\s+/, "").split("\n")[0];
    return {
      name: "wl-copy",
      description: "Wayland clipboard utility",
      status: "ok",
      version,
      required: true,
    };
  }

  return {
    name: "wl-copy",
    description: "Wayland clipboard utility",
    status: "error",
    errorMessage: result.stderr || `Exit code ${result.code}`,
    required: true,
  };
}

/**
 * Check if wtype is available
 */
export async function checkWtype(): Promise<DependencyCheck> {
  // wtype doesn't have --version, so we check with --help
  // which returns non-zero but still indicates wtype is installed
  const result = await runCommand("wtype", ["--help"]);

  if (result.code === null) {
    return {
      name: "wtype",
      description: "Wayland keyboard automation",
      status: "missing",
      installHint:
        "Arch: pacman -S wtype\n" +
        "Ubuntu/Debian: apt install wtype\n" +
        "Fedora: dnf install wtype",
      required: false,
    };
  }

  // wtype --help returns non-zero but still means it's installed
  return {
    name: "wtype",
    description: "Wayland keyboard automation",
    status: "ok",
    version: "(version not available)",
    required: false,
  };
}

/**
 * Check if notify-send is available and get its version
 */
export async function checkNotifySend(): Promise<DependencyCheck> {
  const result = await runCommand("notify-send", ["--version"]);

  if (result.code === null) {
    return {
      name: "notify-send",
      description: "Desktop notifications",
      status: "missing",
      installHint:
        "Arch: pacman -S libnotify\n" +
        "Ubuntu/Debian: apt install libnotify-bin\n" +
        "Fedora: dnf install libnotify",
      required: false,
    };
  }

  if (result.code === 0) {
    // notify-send --version outputs "notify-send X.Y.Z"
    const version = result.stdout.replace(/^notify-send\s+/, "").split("\n")[0];
    return {
      name: "notify-send",
      description: "Desktop notifications",
      status: "ok",
      version,
      required: false,
    };
  }

  return {
    name: "notify-send",
    description: "Desktop notifications",
    status: "error",
    errorMessage: result.stderr || `Exit code ${result.code}`,
    required: false,
  };
}

/**
 * Check if hyprctl is available and get Hyprland version
 */
export async function checkHyprctl(): Promise<DependencyCheck> {
  const result = await runCommand("hyprctl", ["version"]);

  if (result.code === null) {
    return {
      name: "hyprctl",
      description: "Hyprland compositor control",
      status: "missing",
      installHint: "hyprctl is part of Hyprland. Context detection disabled without it.",
      required: false,
    };
  }

  if (result.code === 0) {
    // Extract version from hyprctl version output
    // Format: "Hyprland, built from branch ... at commit ..."
    // or "Hyprland X.Y.Z..."
    const lines = result.stdout.split("\n");
    const versionLine = lines.find(
      (line) => line.includes("Hyprland") || line.includes("Tag:")
    );
    let version = "(version detected)";
    if (versionLine) {
      // Try to extract version number or tag
      const tagMatch = versionLine.match(/Tag:\s*([^\s,]+)/);
      const versionMatch = versionLine.match(/Hyprland\s+([0-9.]+)/);
      if (tagMatch && tagMatch[1]) {
        version = tagMatch[1];
      } else if (versionMatch && versionMatch[1]) {
        version = versionMatch[1];
      }
    }
    return {
      name: "hyprctl",
      description: "Hyprland compositor control",
      status: "ok",
      version,
      required: false,
    };
  }

  return {
    name: "hyprctl",
    description: "Hyprland compositor control",
    status: "error",
    errorMessage: result.stderr || `Exit code ${result.code}`,
    required: false,
  };
}

/**
 * Check if GROQ_API_KEY environment variable is set
 */
export function checkGroqApiKey(): EnvVarCheck {
  const apiKey = process.env.GROQ_API_KEY;

  return {
    name: "GROQ_API_KEY",
    description: "Groq API key for transcription",
    status: apiKey ? "set" : "not_set",
    required: true,
  };
}

/**
 * Run all dependency checks
 */
export async function runDoctorChecks(): Promise<DoctorResult> {
  // Run all dependency checks in parallel
  const [bun, parecord, wlCopy, wtype, notifySend, hyprctl] = await Promise.all([
    checkBun(),
    checkParecord(),
    checkWlCopy(),
    checkWtype(),
    checkNotifySend(),
    checkHyprctl(),
  ]);

  const dependencies = [bun, parecord, wlCopy, wtype, notifySend, hyprctl];
  const envVars = [checkGroqApiKey()];

  const allOk =
    dependencies.every((dep) => dep.status === "ok") &&
    envVars.every((env) => env.status === "set");

  const requiredOk =
    dependencies.filter((dep) => dep.required).every((dep) => dep.status === "ok") &&
    envVars.filter((env) => env.required).every((env) => env.status === "set");

  return {
    dependencies,
    envVars,
    allOk,
    requiredOk,
  };
}

/**
 * Format dependency check result as a string
 */
export function formatDependencyCheck(dep: DependencyCheck): string {
  const icon = dep.status === "ok" ? "✓" : dep.status === "missing" ? "✗" : "!";
  const statusColor =
    dep.status === "ok" ? "\x1b[32m" : dep.status === "missing" ? "\x1b[31m" : "\x1b[33m";
  const reset = "\x1b[0m";

  let line = `${statusColor}${icon}${reset} ${dep.name}`;

  if (dep.version) {
    line += ` (${dep.version})`;
  }

  line += ` - ${dep.description}`;

  if (!dep.required) {
    line += " [optional]";
  }

  return line;
}

/**
 * Format environment variable check result as a string
 */
export function formatEnvVarCheck(env: EnvVarCheck): string {
  const icon = env.status === "set" ? "✓" : "✗";
  const statusColor = env.status === "set" ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";

  let line = `${statusColor}${icon}${reset} ${env.name}`;

  if (env.status === "set") {
    line += " (set)";
  } else {
    line += " (not set)";
  }

  line += ` - ${env.description}`;

  if (!env.required) {
    line += " [optional]";
  }

  return line;
}

/**
 * Format full doctor result as a string
 */
export function formatDoctorResult(result: DoctorResult): string {
  const lines: string[] = [];

  lines.push("WhisperTUI System Check");
  lines.push("=======================");
  lines.push("");

  lines.push("Dependencies:");
  for (const dep of result.dependencies) {
    lines.push("  " + formatDependencyCheck(dep));

    // Show install hint for missing dependencies
    if (dep.status === "missing" && dep.installHint) {
      for (const hintLine of dep.installHint.split("\n")) {
        lines.push("    " + hintLine);
      }
    }

    // Show error message for errored dependencies
    if (dep.status === "error" && dep.errorMessage) {
      lines.push("    Error: " + dep.errorMessage);
    }
  }

  lines.push("");
  lines.push("Environment Variables:");
  for (const env of result.envVars) {
    lines.push("  " + formatEnvVarCheck(env));
  }

  lines.push("");

  if (result.allOk) {
    lines.push("\x1b[32m✓ All checks passed!\x1b[0m");
  } else if (result.requiredOk) {
    lines.push("\x1b[33m! Some optional dependencies are missing.\x1b[0m");
    lines.push("  WhisperTUI will work, but some features may be unavailable.");
  } else {
    lines.push("\x1b[31m✗ Some required dependencies are missing.\x1b[0m");
    lines.push("  Please install them before using WhisperTUI.");
  }

  return lines.join("\n");
}
