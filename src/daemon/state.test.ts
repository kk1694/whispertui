import { describe, test, expect, beforeEach } from "bun:test";
import {
  StateMachine,
  createStateMachine,
  InvalidTransitionError,
  type DaemonState,
  type DaemonEvent,
  type StateChangeListener,
} from "./state.ts";

describe("StateMachine", () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = createStateMachine();
  });

  describe("initial state", () => {
    test("starts in idle state", () => {
      expect(sm.state).toBe("idle");
    });

    test("has empty context initially", () => {
      const ctx = sm.context;
      expect(ctx.currentWindow).toBeNull();
      expect(ctx.lastError).toBeNull();
      expect(ctx.lastTranscription).toBeNull();
    });

    test("getSnapshot returns current state and context", () => {
      const snapshot = sm.getSnapshot();
      expect(snapshot.state).toBe("idle");
      expect(snapshot.context.currentWindow).toBeNull();
    });
  });

  describe("valid transitions", () => {
    test("idle + start → recording", () => {
      const newState = sm.send({ type: "start" });
      expect(newState).toBe("recording");
      expect(sm.state).toBe("recording");
    });

    test("recording + stop → transcribing", () => {
      sm.send({ type: "start" });
      const newState = sm.send({ type: "stop" });
      expect(newState).toBe("transcribing");
      expect(sm.state).toBe("transcribing");
    });

    test("transcribing + transcription_complete → idle", () => {
      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      const newState = sm.send({ type: "transcription_complete", text: "hello world" });
      expect(newState).toBe("idle");
      expect(sm.state).toBe("idle");
    });

    test("full cycle: idle → recording → transcribing → idle", () => {
      expect(sm.state).toBe("idle");
      sm.send({ type: "start" });
      expect(sm.state).toBe("recording");
      sm.send({ type: "stop" });
      expect(sm.state).toBe("transcribing");
      sm.send({ type: "transcription_complete", text: "test" });
      expect(sm.state).toBe("idle");
    });
  });

  describe("invalid transitions", () => {
    test("idle + stop → error (invalid transition)", () => {
      expect(() => sm.send({ type: "stop" })).toThrow(InvalidTransitionError);
      expect(() => sm.send({ type: "stop" })).toThrow(
        "Invalid transition: cannot process 'stop' in state 'idle'"
      );
    });

    test("idle + transcription_complete → error", () => {
      expect(() =>
        sm.send({ type: "transcription_complete", text: "test" })
      ).toThrow(InvalidTransitionError);
    });

    test("recording + start → error (already recording)", () => {
      sm.send({ type: "start" });
      expect(() => sm.send({ type: "start" })).toThrow(InvalidTransitionError);
      expect(() => sm.send({ type: "start" })).toThrow(
        "Invalid transition: cannot process 'start' in state 'recording'"
      );
    });

    test("recording + transcription_complete → error", () => {
      sm.send({ type: "start" });
      expect(() =>
        sm.send({ type: "transcription_complete", text: "test" })
      ).toThrow(InvalidTransitionError);
    });

    test("transcribing + start → error", () => {
      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      expect(() => sm.send({ type: "start" })).toThrow(InvalidTransitionError);
    });

    test("transcribing + stop → error", () => {
      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      expect(() => sm.send({ type: "stop" })).toThrow(InvalidTransitionError);
    });
  });

  describe("error handling", () => {
    test("error in idle state stays in idle", () => {
      const newState = sm.send({ type: "error", message: "something went wrong" });
      expect(newState).toBe("idle");
      expect(sm.context.lastError).toBe("something went wrong");
    });

    test("error in recording state returns to idle", () => {
      sm.send({ type: "start" });
      const newState = sm.send({ type: "error", message: "recording failed" });
      expect(newState).toBe("idle");
      expect(sm.context.lastError).toBe("recording failed");
    });

    test("error in transcribing state returns to idle", () => {
      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      const newState = sm.send({ type: "error", message: "transcription failed" });
      expect(newState).toBe("idle");
      expect(sm.context.lastError).toBe("transcription failed");
    });
  });

  describe("context tracking", () => {
    test("transcription_complete stores text in context", () => {
      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      sm.send({ type: "transcription_complete", text: "hello world" });
      expect(sm.context.lastTranscription).toBe("hello world");
    });

    test("transcription_complete clears lastError", () => {
      // First cause an error
      sm.send({ type: "error", message: "initial error" });
      expect(sm.context.lastError).toBe("initial error");

      // Then complete a successful transcription
      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      sm.send({ type: "transcription_complete", text: "success" });
      expect(sm.context.lastError).toBeNull();
    });

    test("start clears lastError", () => {
      sm.send({ type: "error", message: "previous error" });
      sm.send({ type: "start" });
      expect(sm.context.lastError).toBeNull();
    });

    test("setWindowContext updates current window", () => {
      sm.setWindowContext({
        windowClass: "Alacritty",
        windowTitle: "vim",
        isCodeAware: true,
      });
      expect(sm.context.currentWindow).toEqual({
        windowClass: "Alacritty",
        windowTitle: "vim",
        isCodeAware: true,
      });
    });

    test("setWindowContext can be set to null", () => {
      sm.setWindowContext({ windowClass: "test", windowTitle: "test", isCodeAware: false });
      sm.setWindowContext(null);
      expect(sm.context.currentWindow).toBeNull();
    });

    test("context is immutable (returns copy)", () => {
      const ctx1 = sm.context;
      const ctx2 = sm.context;
      expect(ctx1).not.toBe(ctx2);
      expect(ctx1).toEqual(ctx2);
    });
  });

  describe("canTransition", () => {
    test("canTransition returns true for valid transitions", () => {
      expect(sm.canTransition("start")).toBe(true);
      expect(sm.canTransition("error")).toBe(true);
    });

    test("canTransition returns false for invalid transitions", () => {
      expect(sm.canTransition("stop")).toBe(false);
      expect(sm.canTransition("transcription_complete")).toBe(false);
    });

    test("canTransition updates based on current state", () => {
      sm.send({ type: "start" });
      expect(sm.canTransition("start")).toBe(false);
      expect(sm.canTransition("stop")).toBe(true);
    });
  });

  describe("event emitter (subscribe)", () => {
    test("listener is called on state change", () => {
      const calls: Array<{ old: DaemonState; new: DaemonState; event: DaemonEvent }> = [];
      sm.subscribe((oldState, newState, event) => {
        calls.push({ old: oldState, new: newState, event });
      });

      sm.send({ type: "start" });

      expect(calls).toHaveLength(1);
      expect(calls[0]!.old).toBe("idle");
      expect(calls[0]!.new).toBe("recording");
      expect(calls[0]!.event).toEqual({ type: "start" });
    });

    test("multiple listeners are all called", () => {
      let call1 = 0;
      let call2 = 0;
      sm.subscribe(() => call1++);
      sm.subscribe(() => call2++);

      sm.send({ type: "start" });

      expect(call1).toBe(1);
      expect(call2).toBe(1);
    });

    test("unsubscribe stops notifications", () => {
      let callCount = 0;
      const unsubscribe = sm.subscribe(() => callCount++);

      sm.send({ type: "start" });
      expect(callCount).toBe(1);

      unsubscribe();

      sm.send({ type: "stop" });
      expect(callCount).toBe(1); // Still 1, not incremented
    });

    test("listener is called for each transition", () => {
      const states: DaemonState[] = [];
      sm.subscribe((_, newState) => {
        states.push(newState);
      });

      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      sm.send({ type: "transcription_complete", text: "test" });

      expect(states).toEqual(["recording", "transcribing", "idle"]);
    });

    test("listener receives error events", () => {
      let receivedEvent: DaemonEvent | undefined;
      sm.subscribe((_, __, event) => {
        receivedEvent = event;
      });

      sm.send({ type: "error", message: "test error" });

      expect(receivedEvent).toBeDefined();
      expect(receivedEvent!.type).toBe("error");
      expect((receivedEvent as { type: "error"; message: string }).message).toBe("test error");
    });
  });

  describe("reset", () => {
    test("reset returns to initial state", () => {
      sm.send({ type: "start" });
      sm.send({ type: "stop" });
      sm.send({ type: "transcription_complete", text: "hello" });
      sm.setWindowContext({ windowClass: "test", windowTitle: "test", isCodeAware: true });

      sm.reset();

      expect(sm.state).toBe("idle");
      expect(sm.context.currentWindow).toBeNull();
      expect(sm.context.lastTranscription).toBeNull();
      expect(sm.context.lastError).toBeNull();
    });
  });

  describe("InvalidTransitionError", () => {
    test("has correct name", () => {
      const error = new InvalidTransitionError("idle", "stop");
      expect(error.name).toBe("InvalidTransitionError");
    });

    test("has correct properties", () => {
      const error = new InvalidTransitionError("recording", "start");
      expect(error.currentState).toBe("recording");
      expect(error.event).toBe("start");
    });

    test("has descriptive message", () => {
      const error = new InvalidTransitionError("idle", "stop");
      expect(error.message).toBe("Invalid transition: cannot process 'stop' in state 'idle'");
    });
  });
});
