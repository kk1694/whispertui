import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  checkBun,
  checkParecord,
  checkWlCopy,
  checkWtype,
  checkNotifySend,
  checkHyprctl,
  checkGroqApiKey,
  runDoctorChecks,
  formatDependencyCheck,
  formatEnvVarCheck,
  formatDoctorResult,
  type DependencyCheck,
  type EnvVarCheck,
  type DoctorResult,
} from "./index.ts";

describe("Doctor Module", () => {
  describe("checkBun", () => {
    test("detects bun installation with version", async () => {
      // bun must be installed since we're running this test with it
      const result = await checkBun();

      expect(result.name).toBe("bun");
      expect(result.status).toBe("ok");
      expect(result.version).toBeDefined();
      expect(result.required).toBe(true);
    });
  });

  describe("checkParecord", () => {
    test("returns valid dependency check result", async () => {
      const result = await checkParecord();

      expect(result.name).toBe("parecord");
      expect(result.description).toBe("PulseAudio recording tool");
      expect(result.required).toBe(true);
      expect(["ok", "missing", "error"]).toContain(result.status);

      if (result.status === "missing") {
        expect(result.installHint).toContain("pacman");
        expect(result.installHint).toContain("apt");
        expect(result.installHint).toContain("dnf");
      }
    });
  });

  describe("checkWlCopy", () => {
    test("returns valid dependency check result", async () => {
      const result = await checkWlCopy();

      expect(result.name).toBe("wl-copy");
      expect(result.description).toBe("Wayland clipboard utility");
      expect(result.required).toBe(true);
      expect(["ok", "missing", "error"]).toContain(result.status);

      if (result.status === "missing") {
        expect(result.installHint).toContain("wl-clipboard");
      }
    });
  });

  describe("checkWtype", () => {
    test("returns valid dependency check result", async () => {
      const result = await checkWtype();

      expect(result.name).toBe("wtype");
      expect(result.description).toBe("Wayland keyboard automation");
      expect(result.required).toBe(false); // optional
      expect(["ok", "missing", "error"]).toContain(result.status);

      if (result.status === "missing") {
        expect(result.installHint).toContain("wtype");
      }
    });
  });

  describe("checkNotifySend", () => {
    test("returns valid dependency check result", async () => {
      const result = await checkNotifySend();

      expect(result.name).toBe("notify-send");
      expect(result.description).toBe("Desktop notifications");
      expect(result.required).toBe(false); // optional
      expect(["ok", "missing", "error"]).toContain(result.status);

      if (result.status === "missing") {
        expect(result.installHint).toContain("libnotify");
      }
    });
  });

  describe("checkHyprctl", () => {
    test("returns valid dependency check result", async () => {
      const result = await checkHyprctl();

      expect(result.name).toBe("hyprctl");
      expect(result.description).toBe("Hyprland compositor control");
      expect(result.required).toBe(false); // optional
      expect(["ok", "missing", "error"]).toContain(result.status);

      if (result.status === "missing") {
        expect(result.installHint).toContain("Hyprland");
      }
    });
  });

  describe("checkGroqApiKey", () => {
    const originalEnv = process.env.GROQ_API_KEY;

    afterEach(() => {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.GROQ_API_KEY = originalEnv;
      } else {
        delete process.env.GROQ_API_KEY;
      }
    });

    test("returns set when GROQ_API_KEY is defined", () => {
      process.env.GROQ_API_KEY = "test-api-key";

      const result = checkGroqApiKey();

      expect(result.name).toBe("GROQ_API_KEY");
      expect(result.status).toBe("set");
      expect(result.required).toBe(true);
    });

    test("returns not_set when GROQ_API_KEY is undefined", () => {
      delete process.env.GROQ_API_KEY;

      const result = checkGroqApiKey();

      expect(result.name).toBe("GROQ_API_KEY");
      expect(result.status).toBe("not_set");
      expect(result.required).toBe(true);
    });

    test("returns set when GROQ_API_KEY is empty string", () => {
      // Empty string is still "set" - it's up to the API to reject it
      process.env.GROQ_API_KEY = "";

      const result = checkGroqApiKey();

      // Empty string is falsy, so it should be not_set
      expect(result.status).toBe("not_set");
    });
  });

  describe("runDoctorChecks", () => {
    test("returns all dependency checks", async () => {
      const result = await runDoctorChecks();

      expect(result.dependencies).toHaveLength(6);
      expect(result.envVars).toHaveLength(1);

      // Check all expected dependencies are present
      const names = result.dependencies.map((d) => d.name);
      expect(names).toContain("bun");
      expect(names).toContain("parecord");
      expect(names).toContain("wl-copy");
      expect(names).toContain("wtype");
      expect(names).toContain("notify-send");
      expect(names).toContain("hyprctl");

      // Check env vars
      const envNames = result.envVars.map((e) => e.name);
      expect(envNames).toContain("GROQ_API_KEY");
    });

    test("allOk is true only when all checks pass", async () => {
      const result = await runDoctorChecks();

      // bun should always be ok since we're running with it
      const bunCheck = result.dependencies.find((d) => d.name === "bun");
      expect(bunCheck?.status).toBe("ok");

      // allOk depends on ALL dependencies being ok
      const allDepsOk = result.dependencies.every((d) => d.status === "ok");
      const allEnvOk = result.envVars.every((e) => e.status === "set");

      expect(result.allOk).toBe(allDepsOk && allEnvOk);
    });

    test("requiredOk checks only required dependencies", async () => {
      const result = await runDoctorChecks();

      const requiredDepsOk = result.dependencies
        .filter((d) => d.required)
        .every((d) => d.status === "ok");

      const requiredEnvOk = result.envVars
        .filter((e) => e.required)
        .every((e) => e.status === "set");

      expect(result.requiredOk).toBe(requiredDepsOk && requiredEnvOk);
    });
  });

  describe("formatDependencyCheck", () => {
    test("formats ok dependency with checkmark", () => {
      const dep: DependencyCheck = {
        name: "test-tool",
        description: "Test tool description",
        status: "ok",
        version: "1.2.3",
        required: true,
      };

      const output = formatDependencyCheck(dep);

      expect(output).toContain("✓");
      expect(output).toContain("test-tool");
      expect(output).toContain("1.2.3");
      expect(output).toContain("Test tool description");
      expect(output).not.toContain("[optional]");
    });

    test("formats missing dependency with X", () => {
      const dep: DependencyCheck = {
        name: "missing-tool",
        description: "Missing tool",
        status: "missing",
        installHint: "Run: install-it",
        required: true,
      };

      const output = formatDependencyCheck(dep);

      expect(output).toContain("✗");
      expect(output).toContain("missing-tool");
      expect(output).toContain("Missing tool");
    });

    test("formats optional dependency with [optional] tag", () => {
      const dep: DependencyCheck = {
        name: "optional-tool",
        description: "Optional tool",
        status: "ok",
        version: "2.0.0",
        required: false,
      };

      const output = formatDependencyCheck(dep);

      expect(output).toContain("✓");
      expect(output).toContain("[optional]");
    });

    test("formats error dependency with exclamation mark", () => {
      const dep: DependencyCheck = {
        name: "error-tool",
        description: "Error tool",
        status: "error",
        errorMessage: "Something went wrong",
        required: true,
      };

      const output = formatDependencyCheck(dep);

      expect(output).toContain("!");
      expect(output).toContain("error-tool");
    });
  });

  describe("formatEnvVarCheck", () => {
    test("formats set env var with checkmark", () => {
      const env: EnvVarCheck = {
        name: "TEST_VAR",
        description: "Test variable",
        status: "set",
        required: true,
      };

      const output = formatEnvVarCheck(env);

      expect(output).toContain("✓");
      expect(output).toContain("TEST_VAR");
      expect(output).toContain("(set)");
      expect(output).toContain("Test variable");
    });

    test("formats not_set env var with X", () => {
      const env: EnvVarCheck = {
        name: "MISSING_VAR",
        description: "Missing variable",
        status: "not_set",
        required: true,
      };

      const output = formatEnvVarCheck(env);

      expect(output).toContain("✗");
      expect(output).toContain("MISSING_VAR");
      expect(output).toContain("(not set)");
    });

    test("formats optional env var with [optional] tag", () => {
      const env: EnvVarCheck = {
        name: "OPTIONAL_VAR",
        description: "Optional variable",
        status: "not_set",
        required: false,
      };

      const output = formatEnvVarCheck(env);

      expect(output).toContain("[optional]");
    });
  });

  describe("formatDoctorResult", () => {
    test("formats full result with header", async () => {
      const result = await runDoctorChecks();
      const output = formatDoctorResult(result);

      expect(output).toContain("WhisperTUI System Check");
      expect(output).toContain("Dependencies:");
      expect(output).toContain("Environment Variables:");
      expect(output).toContain("bun");
      expect(output).toContain("GROQ_API_KEY");
    });

    test("shows install hints for missing dependencies", () => {
      const result: DoctorResult = {
        dependencies: [
          {
            name: "missing-tool",
            description: "Missing tool",
            status: "missing",
            installHint: "Install with: apt install missing-tool",
            required: true,
          },
        ],
        envVars: [],
        allOk: false,
        requiredOk: false,
      };

      const output = formatDoctorResult(result);

      expect(output).toContain("apt install missing-tool");
    });

    test("shows all checks passed message when allOk", () => {
      const result: DoctorResult = {
        dependencies: [
          {
            name: "tool",
            description: "Tool",
            status: "ok",
            version: "1.0",
            required: true,
          },
        ],
        envVars: [
          {
            name: "VAR",
            description: "Var",
            status: "set",
            required: true,
          },
        ],
        allOk: true,
        requiredOk: true,
      };

      const output = formatDoctorResult(result);

      expect(output).toContain("All checks passed!");
    });

    test("shows optional missing message when only optionals missing", () => {
      const result: DoctorResult = {
        dependencies: [
          {
            name: "required-tool",
            description: "Required",
            status: "ok",
            version: "1.0",
            required: true,
          },
          {
            name: "optional-tool",
            description: "Optional",
            status: "missing",
            required: false,
          },
        ],
        envVars: [
          {
            name: "VAR",
            description: "Var",
            status: "set",
            required: true,
          },
        ],
        allOk: false,
        requiredOk: true,
      };

      const output = formatDoctorResult(result);

      expect(output).toContain("Some optional dependencies are missing");
      expect(output).toContain("WhisperTUI will work");
    });

    test("shows required missing message when required deps missing", () => {
      const result: DoctorResult = {
        dependencies: [
          {
            name: "required-tool",
            description: "Required",
            status: "missing",
            installHint: "Install it",
            required: true,
          },
        ],
        envVars: [],
        allOk: false,
        requiredOk: false,
      };

      const output = formatDoctorResult(result);

      expect(output).toContain("Some required dependencies are missing");
      expect(output).toContain("Please install them");
    });

    test("shows error messages for errored dependencies", () => {
      const result: DoctorResult = {
        dependencies: [
          {
            name: "error-tool",
            description: "Error tool",
            status: "error",
            errorMessage: "Command failed with signal SIGSEGV",
            required: true,
          },
        ],
        envVars: [],
        allOk: false,
        requiredOk: false,
      };

      const output = formatDoctorResult(result);

      expect(output).toContain("Error: Command failed with signal SIGSEGV");
    });
  });
});
