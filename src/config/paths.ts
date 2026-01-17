import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const APP_NAME = "whispertui";

/**
 * XDG Base Directory paths for whispertui
 * @see https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
 */

function getXdgPath(envVar: string, defaultPath: string): string {
  const envValue = process.env[envVar];
  if (envValue) {
    return envValue;
  }
  return join(homedir(), defaultPath);
}

/** XDG_CONFIG_HOME - User configuration files */
export function getConfigDir(): string {
  return join(getXdgPath("XDG_CONFIG_HOME", ".config"), APP_NAME);
}

/** XDG_STATE_HOME - User state files (socket, pid) */
export function getStateDir(): string {
  return join(getXdgPath("XDG_STATE_HOME", ".local/state"), APP_NAME);
}

/** XDG_DATA_HOME - User data files (history) */
export function getDataDir(): string {
  return join(getXdgPath("XDG_DATA_HOME", ".local/share"), APP_NAME);
}

/** XDG_CACHE_HOME - Temporary files (audio recordings) */
export function getCacheDir(): string {
  return join(getXdgPath("XDG_CACHE_HOME", ".cache"), APP_NAME);
}

/** Path to config.toml */
export function getConfigPath(): string {
  return join(getConfigDir(), "config.toml");
}

/** Path to daemon socket */
export function getSocketPath(): string {
  return join(getStateDir(), "whispertui.sock");
}

/** Path to daemon PID file */
export function getPidPath(): string {
  return join(getStateDir(), "daemon.pid");
}

/** Path to history directory */
export function getHistoryDir(): string {
  return join(getDataDir(), "history");
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure all whispertui directories exist
 */
export function ensureAllDirs(): void {
  ensureDir(getConfigDir());
  ensureDir(getStateDir());
  ensureDir(getDataDir());
  ensureDir(getCacheDir());
  ensureDir(getHistoryDir());
}

/** All paths exported for convenience */
export const paths = {
  config: getConfigDir,
  state: getStateDir,
  data: getDataDir,
  cache: getCacheDir,
  configFile: getConfigPath,
  socket: getSocketPath,
  pid: getPidPath,
  history: getHistoryDir,
} as const;
