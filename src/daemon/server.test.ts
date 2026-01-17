import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { connect } from "node:net";
import { existsSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DaemonServer,
  createDaemonServer,
  cleanupStaleFiles,
  type DaemonRequest,
  type DaemonResponse,
} from "./server.ts";
import { createStateMachine } from "./state.ts";

// Use a temporary directory for test isolation
const TEST_STATE_DIR = join(tmpdir(), `whispertui-test-${process.pid}`);

// Helper to send a command and get response
async function sendCommand(
  socketPath: string,
  command: DaemonRequest["command"]
): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const client = connect(socketPath, () => {
      client.write(JSON.stringify({ command }) + "\n");
    });

    let responseData = "";

    client.on("data", (data) => {
      responseData += data.toString();
      if (responseData.includes("\n")) {
        client.end();
        try {
          const response = JSON.parse(responseData.trim());
          resolve(response);
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${responseData}`));
        }
      }
    });

    client.on("error", reject);
    client.on("timeout", () => reject(new Error("Connection timeout")));
    client.setTimeout(5000);
  });
}

// Helper to send raw data and get response
async function sendRaw(socketPath: string, data: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = connect(socketPath, () => {
      client.write(data);
    });

    let responseData = "";

    client.on("data", (chunk) => {
      responseData += chunk.toString();
      if (responseData.includes("\n")) {
        client.end();
        resolve(responseData.trim());
      }
    });

    client.on("error", reject);
    client.on("timeout", () => reject(new Error("Connection timeout")));
    client.setTimeout(5000);
  });
}

describe("DaemonServer", () => {
  let server: DaemonServer;
  let socketPath: string;

  beforeEach(async () => {
    // Set environment to use test directory
    process.env.XDG_STATE_HOME = TEST_STATE_DIR;

    // Import paths module to get correct test paths
    const { getSocketPath } = await import("../config/paths.ts");
    socketPath = getSocketPath();

    server = createDaemonServer();
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
    // Clean up test files
    try {
      const { rmSync } = await import("node:fs");
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("socket server basics", () => {
    test("starts and listens on socket", async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
      expect(existsSync(socketPath)).toBe(true);
    });

    test("socket has correct permissions (0600)", async () => {
      await server.start();
      const stats = statSync(socketPath);
      // Check owner read/write only (0600 = 384 in decimal)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    test("stops and removes socket file", async () => {
      await server.start();
      await server.stop();
      expect(server.isRunning()).toBe(false);
      expect(existsSync(socketPath)).toBe(false);
    });

    test("throws error if started twice", async () => {
      await server.start();
      await expect(server.start()).rejects.toThrow("Server already running");
    });
  });

  describe("JSON protocol", () => {
    beforeEach(async () => {
      await server.start();
    });

    test("accepts JSON commands and returns JSON response", async () => {
      const response = await sendCommand(socketPath, "status");
      expect(response.success).toBe(true);
      expect(response.state).toBe("idle");
    });

    test("returns error for malformed JSON", async () => {
      const response = await sendRaw(socketPath, "not valid json\n");
      const parsed = JSON.parse(response);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Invalid JSON");
    });

    test("returns error for missing command field", async () => {
      const response = await sendRaw(socketPath, JSON.stringify({}) + "\n");
      const parsed = JSON.parse(response);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("missing or invalid 'command' field");
    });

    test("returns error for unknown command", async () => {
      const response = await sendRaw(
        socketPath,
        JSON.stringify({ command: "unknown" }) + "\n"
      );
      const parsed = JSON.parse(response);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain("Unknown command");
    });
  });

  describe("command: status", () => {
    beforeEach(async () => {
      await server.start();
    });

    test("returns current state", async () => {
      const response = await sendCommand(socketPath, "status");
      expect(response.success).toBe(true);
      expect(response.state).toBe("idle");
      expect(response.context).toBeDefined();
      expect(response.context?.currentWindow).toBeNull();
      expect(response.context?.lastError).toBeNull();
      expect(response.context?.lastTranscription).toBeNull();
    });
  });

  describe("command: start", () => {
    beforeEach(async () => {
      await server.start();
    });

    test("transitions to recording state", async () => {
      const response = await sendCommand(socketPath, "start");
      expect(response.success).toBe(true);
      expect(response.state).toBe("recording");
      expect(response.message).toBe("Recording started");
    });

    test("returns error if already recording", async () => {
      await sendCommand(socketPath, "start");
      const response = await sendCommand(socketPath, "start");
      expect(response.success).toBe(false);
      expect(response.error).toContain("Invalid transition");
      expect(response.state).toBe("recording");
    });
  });

  describe("command: stop", () => {
    beforeEach(async () => {
      await server.start();
    });

    test("transitions to transcribing state after start", async () => {
      await sendCommand(socketPath, "start");
      const response = await sendCommand(socketPath, "stop");
      expect(response.success).toBe(true);
      expect(response.state).toBe("transcribing");
      expect(response.message).toBe("Recording stopped, transcribing...");
    });

    test("returns error if not recording", async () => {
      const response = await sendCommand(socketPath, "stop");
      expect(response.success).toBe(false);
      expect(response.error).toContain("Invalid transition");
      expect(response.state).toBe("idle");
    });
  });

  describe("command: ping", () => {
    beforeEach(async () => {
      await server.start();
    });

    test("responds with pong", async () => {
      const response = await sendCommand(socketPath, "ping");
      expect(response.success).toBe(true);
      expect(response.message).toBe("pong");
      expect(response.state).toBe("idle");
    });
  });

  describe("command: shutdown", () => {
    test("shuts down the server", async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);

      const response = await sendCommand(socketPath, "shutdown");
      expect(response.success).toBe(true);
      expect(response.message).toBe("Daemon shutting down");

      // Wait a bit for shutdown to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.isRunning()).toBe(false);
    });
  });

  describe("PID file management", () => {
    test("creates PID file on start", async () => {
      const { getPidPath } = await import("../config/paths.ts");
      const pidPath = getPidPath();

      await server.start();
      expect(existsSync(pidPath)).toBe(true);

      const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
      expect(pid).toBe(process.pid);
    });

    test("removes PID file on stop", async () => {
      const { getPidPath } = await import("../config/paths.ts");
      const pidPath = getPidPath();

      await server.start();
      await server.stop();
      expect(existsSync(pidPath)).toBe(false);
    });
  });

  describe("stale file cleanup", () => {
    test("cleans up stale socket file", async () => {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { getStateDir } = await import("../config/paths.ts");

      // Create state dir and stale socket
      mkdirSync(getStateDir(), { recursive: true });
      writeFileSync(socketPath, "stale socket");
      expect(existsSync(socketPath)).toBe(true);

      await server.start();
      // Server should have cleaned up and started successfully
      expect(server.isRunning()).toBe(true);
    });

    test("cleans up stale PID file with dead process", async () => {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { getStateDir, getPidPath } = await import("../config/paths.ts");
      const pidPath = getPidPath();

      // Create state dir and stale PID file with non-existent PID
      mkdirSync(getStateDir(), { recursive: true });
      writeFileSync(pidPath, "999999999"); // Very unlikely to exist
      expect(existsSync(pidPath)).toBe(true);

      await server.start();
      // Server should have cleaned up and started successfully
      expect(server.isRunning()).toBe(true);

      // PID file should now contain our PID
      const pid = parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
      expect(pid).toBe(process.pid);
    });
  });

  describe("multiple connections", () => {
    beforeEach(async () => {
      await server.start();
    });

    test("handles multiple sequential commands", async () => {
      const r1 = await sendCommand(socketPath, "status");
      expect(r1.success).toBe(true);
      expect(r1.state).toBe("idle");

      const r2 = await sendCommand(socketPath, "start");
      expect(r2.success).toBe(true);
      expect(r2.state).toBe("recording");

      const r3 = await sendCommand(socketPath, "status");
      expect(r3.success).toBe(true);
      expect(r3.state).toBe("recording");

      const r4 = await sendCommand(socketPath, "stop");
      expect(r4.success).toBe(true);
      expect(r4.state).toBe("transcribing");
    });
  });

  describe("event emitter", () => {
    test("emits started event", async () => {
      let started = false;
      server.subscribe((event) => {
        if (event === "started") started = true;
      });

      await server.start();
      expect(started).toBe(true);
    });

    test("emits stopped event", async () => {
      let stopped = false;
      server.subscribe((event) => {
        if (event === "stopped") stopped = true;
      });

      await server.start();
      await server.stop();
      expect(stopped).toBe(true);
    });

    test("emits command_received event", async () => {
      const commands: string[] = [];
      server.subscribe((event, data) => {
        if (event === "command_received") {
          commands.push((data as { command: string }).command);
        }
      });

      await server.start();
      await sendCommand(socketPath, "status");
      await sendCommand(socketPath, "ping");

      expect(commands).toContain("status");
      expect(commands).toContain("ping");
    });

    test("unsubscribe works", async () => {
      let count = 0;
      const unsubscribe = server.subscribe(() => {
        count++;
      });

      await server.start();
      expect(count).toBe(1); // started event

      unsubscribe();
      await server.stop();
      expect(count).toBe(1); // should not have increased
    });
  });

  describe("state machine integration", () => {
    test("uses provided state machine", async () => {
      const sm = createStateMachine();
      server = createDaemonServer(sm);

      await server.start();
      await sendCommand(socketPath, "start");

      expect(sm.state).toBe("recording");
    });

    test("getStateMachine returns the instance", () => {
      const sm = createStateMachine();
      server = createDaemonServer(sm);

      expect(server.getStateMachine()).toBe(sm);
    });
  });
});

describe("cleanupStaleFiles", () => {
  beforeEach(async () => {
    process.env.XDG_STATE_HOME = TEST_STATE_DIR;
  });

  afterEach(async () => {
    try {
      const { rmSync } = await import("node:fs");
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("returns false for both when no files exist", async () => {
    const { mkdirSync } = await import("node:fs");
    const { getStateDir } = await import("../config/paths.ts");
    mkdirSync(getStateDir(), { recursive: true });

    const result = cleanupStaleFiles();
    expect(result.socketCleaned).toBe(false);
    expect(result.pidCleaned).toBe(false);
  });

  test("cleans socket file", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { getStateDir, getSocketPath } = await import("../config/paths.ts");

    mkdirSync(getStateDir(), { recursive: true });
    writeFileSync(getSocketPath(), "stale");

    const result = cleanupStaleFiles();
    expect(result.socketCleaned).toBe(true);
    expect(existsSync(getSocketPath())).toBe(false);
  });

  test("cleans stale PID file", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { getStateDir, getPidPath } = await import("../config/paths.ts");

    mkdirSync(getStateDir(), { recursive: true });
    writeFileSync(getPidPath(), "999999999");

    const result = cleanupStaleFiles();
    expect(result.pidCleaned).toBe(true);
    expect(existsSync(getPidPath())).toBe(false);
  });

  test("throws if PID file references running process", async () => {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { getStateDir, getPidPath } = await import("../config/paths.ts");

    mkdirSync(getStateDir(), { recursive: true });
    // Use our own PID - guaranteed to be running
    writeFileSync(getPidPath(), process.pid.toString());

    expect(() => cleanupStaleFiles()).toThrow("already running");
  });
});
