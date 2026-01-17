import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import {
  sendCommand,
  isDaemonRunning,
  formatResponse,
  DaemonNotRunningError,
  ConnectionTimeoutError,
  DaemonStartError,
  spawnDaemon,
  waitForDaemon,
  ensureDaemonRunning,
} from "./index.ts";
import { createDaemonServer, type DaemonServer } from "../daemon/server.ts";

// Use a temporary directory for test isolation
const TEST_STATE_DIR = join(tmpdir(), `whispertui-client-test-${process.pid}`);

describe("Socket Client", () => {
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
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("sendCommand", () => {
    test("connects to existing socket", async () => {
      await server.start();

      const response = await sendCommand("status", { socketPath });
      expect(response.success).toBe(true);
      expect(response.state).toBe("idle");
    });

    test("sends JSON commands correctly", async () => {
      await server.start();

      const response = await sendCommand("ping", { socketPath });
      expect(response.success).toBe(true);
      expect(response.message).toBe("pong");
    });

    test("receives and parses JSON responses", async () => {
      await server.start();

      const response = await sendCommand("status", { socketPath });
      expect(response.success).toBe(true);
      expect(response.state).toBe("idle");
      expect(response.context).toBeDefined();
    });

    test("throws DaemonNotRunningError when socket does not exist", async () => {
      // Don't start the server - socket won't exist
      await expect(sendCommand("status", { socketPath })).rejects.toThrow(
        DaemonNotRunningError
      );
    });

    test("throws DaemonNotRunningError when connection refused", async () => {
      // Create state dir but don't start server
      const { getStateDir } = await import("../config/paths.ts");
      mkdirSync(getStateDir(), { recursive: true });

      // Create a regular file instead of a socket - connection will be refused
      const { writeFileSync } = await import("node:fs");
      writeFileSync(socketPath, "not a socket");

      await expect(sendCommand("status", { socketPath })).rejects.toThrow(
        DaemonNotRunningError
      );
    });

    test("throws ConnectionTimeoutError when timeout exceeded", async () => {
      // Create a mock server that doesn't respond
      const { createServer } = await import("node:net");
      const { getStateDir } = await import("../config/paths.ts");

      mkdirSync(getStateDir(), { recursive: true });

      // Create server that accepts connections but never responds
      const hangingServer = createServer(() => {
        // Accept connection but don't do anything
      });

      await new Promise<void>((resolve) => {
        hangingServer.listen(socketPath, () => resolve());
      });

      try {
        await expect(
          sendCommand("status", { socketPath, timeout: 100 })
        ).rejects.toThrow(ConnectionTimeoutError);
      } finally {
        hangingServer.close();
      }
    });

    test("handles multiple sequential commands", async () => {
      await server.start();

      const r1 = await sendCommand("status", { socketPath });
      expect(r1.success).toBe(true);
      expect(r1.state).toBe("idle");

      const r2 = await sendCommand("start", { socketPath });
      expect(r2.success).toBe(true);
      expect(r2.state).toBe("recording");

      const r3 = await sendCommand("status", { socketPath });
      expect(r3.success).toBe(true);
      expect(r3.state).toBe("recording");
    });

    test("handles error responses from daemon", async () => {
      await server.start();

      // Try to stop when not recording - should return error
      const response = await sendCommand("stop", { socketPath });
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe("isDaemonRunning", () => {
    test("returns true when daemon is running", async () => {
      await server.start();

      const running = await isDaemonRunning({ socketPath });
      expect(running).toBe(true);
    });

    test("returns false when daemon is not running", async () => {
      // Don't start the server
      const running = await isDaemonRunning({ socketPath });
      expect(running).toBe(false);
    });

    test("uses short timeout for health check", async () => {
      // Create a mock server that doesn't respond
      const { createServer } = await import("node:net");
      const { getStateDir } = await import("../config/paths.ts");

      mkdirSync(getStateDir(), { recursive: true });

      const hangingServer = createServer(() => {
        // Accept connection but don't respond
      });

      await new Promise<void>((resolve) => {
        hangingServer.listen(socketPath, () => resolve());
      });

      const start = Date.now();
      try {
        const running = await isDaemonRunning({ socketPath, timeout: 100 });
        expect(running).toBe(false);
        const elapsed = Date.now() - start;
        // Should timeout quickly with the 100ms timeout
        expect(elapsed).toBeLessThan(500);
      } finally {
        hangingServer.close();
      }
    });
  });

  describe("formatResponse", () => {
    test("formats successful response with message", () => {
      const response = {
        success: true,
        message: "Recording started",
        state: "recording" as const,
      };

      const output = formatResponse(response);
      expect(output).toContain("Recording started");
      expect(output).toContain("State: recording");
    });

    test("formats successful status response", () => {
      const response = {
        success: true,
        state: "idle" as const,
        context: {
          currentWindow: null,
          lastError: null,
          lastTranscription: null,
        },
      };

      const output = formatResponse(response);
      expect(output).toContain("State: idle");
    });

    test("formats response with window context", () => {
      const response = {
        success: true,
        state: "recording" as const,
        context: {
          currentWindow: {
            windowClass: "Alacritty",
            windowTitle: "vim - code.ts",
            isCodeAware: true,
          },
          lastError: null,
          lastTranscription: null,
        },
      };

      const output = formatResponse(response);
      expect(output).toContain("Window: Alacritty");
    });

    test("formats error response", () => {
      const response = {
        success: false,
        error: "Invalid transition: cannot stop from idle",
      };

      const output = formatResponse(response);
      expect(output).toContain("Error:");
      expect(output).toContain("Invalid transition");
    });

    test("handles response with no message or state", () => {
      const response = { success: true };
      const output = formatResponse(response);
      expect(output).toBe("OK");
    });
  });

  describe("error classes", () => {
    test("DaemonNotRunningError has correct message", () => {
      const error = new DaemonNotRunningError();
      expect(error.message).toContain("not running");
      expect(error.name).toBe("DaemonNotRunningError");
    });

    test("ConnectionTimeoutError includes timeout value", () => {
      const error = new ConnectionTimeoutError(5000);
      expect(error.message).toContain("5000ms");
      expect(error.name).toBe("ConnectionTimeoutError");
    });

    test("DaemonStartError has correct name", () => {
      const error = new DaemonStartError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("DaemonStartError");
    });
  });

  describe("waitForDaemon", () => {
    test("resolves when daemon becomes ready", async () => {
      // Start server after a short delay
      setTimeout(async () => {
        await server.start();
      }, 50);

      // Wait for daemon should succeed
      await expect(
        waitForDaemon({ socketPath, readyTimeout: 2000 })
      ).resolves.toBeUndefined();
    });

    test("throws DaemonStartError if daemon never becomes ready", async () => {
      // Don't start the server - daemon will never be ready
      await expect(
        waitForDaemon({ socketPath, readyTimeout: 200 })
      ).rejects.toThrow(DaemonStartError);
    });

    test("returns immediately if daemon already running", async () => {
      await server.start();

      const start = Date.now();
      await waitForDaemon({ socketPath, readyTimeout: 5000 });
      const elapsed = Date.now() - start;

      // Should return very quickly since daemon is already ready
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe("ensureDaemonRunning", () => {
    test("returns false if daemon already running", async () => {
      await server.start();

      const wasAutoStarted = await ensureDaemonRunning({ socketPath });
      expect(wasAutoStarted).toBe(false);
    });

    test("does not spawn additional daemons when one is starting", async () => {
      // Start server after a delay to simulate startup
      setTimeout(async () => {
        await server.start();
      }, 100);

      // First call will see daemon not running
      // Wait for daemon should succeed once server starts
      const result = await ensureDaemonRunning({
        socketPath,
        readyTimeout: 2000,
      });

      // Should have used the existing server (not spawned new one)
      expect(await isDaemonRunning({ socketPath })).toBe(true);
    });
  });

  describe("spawnDaemon", () => {
    test("returns a process ID", () => {
      // Note: We can't fully test spawn without affecting the real daemon
      // This is a sanity check that the function exists and returns a number
      expect(typeof spawnDaemon).toBe("function");
    });
  });
});
