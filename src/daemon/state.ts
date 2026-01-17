/**
 * Daemon State Machine
 *
 * A pure state machine for the WhisperTUI daemon.
 * States: idle, recording, transcribing
 * Events: start, stop, transcription_complete, error
 */

export type DaemonState = "idle" | "recording" | "transcribing";

export type DaemonEvent =
  | { type: "start" }
  | { type: "stop" }
  | { type: "transcription_complete"; text: string }
  | { type: "error"; message: string };

export type DaemonEventType = DaemonEvent["type"];

export interface WindowContext {
  windowClass: string;
  windowTitle: string;
  isCodeAware: boolean;
}

export interface StateContext {
  currentWindow: WindowContext | null;
  lastError: string | null;
  lastTranscription: string | null;
}

export interface DaemonStateSnapshot {
  state: DaemonState;
  context: StateContext;
}

export type StateChangeListener = (
  oldState: DaemonState,
  newState: DaemonState,
  event: DaemonEvent
) => void;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly currentState: DaemonState,
    public readonly event: DaemonEventType
  ) {
    super(`Invalid transition: cannot process '${event}' in state '${currentState}'`);
    this.name = "InvalidTransitionError";
  }
}

const VALID_TRANSITIONS: Record<DaemonState, DaemonEventType[]> = {
  idle: ["start", "error"],
  recording: ["stop", "error"],
  transcribing: ["transcription_complete", "error"],
};

function getNextState(current: DaemonState, event: DaemonEvent): DaemonState {
  switch (current) {
    case "idle":
      if (event.type === "start") return "recording";
      if (event.type === "error") return "idle";
      break;
    case "recording":
      if (event.type === "stop") return "transcribing";
      if (event.type === "error") return "idle";
      break;
    case "transcribing":
      if (event.type === "transcription_complete") return "idle";
      if (event.type === "error") return "idle";
      break;
  }
  throw new InvalidTransitionError(current, event.type);
}

export class StateMachine {
  private _state: DaemonState = "idle";
  private _context: StateContext = {
    currentWindow: null,
    lastError: null,
    lastTranscription: null,
  };
  private listeners: Set<StateChangeListener> = new Set();

  get state(): DaemonState {
    return this._state;
  }

  get context(): StateContext {
    return { ...this._context };
  }

  getSnapshot(): DaemonStateSnapshot {
    return {
      state: this._state,
      context: this.context,
    };
  }

  canTransition(eventType: DaemonEventType): boolean {
    return VALID_TRANSITIONS[this._state].includes(eventType);
  }

  send(event: DaemonEvent): DaemonState {
    if (!this.canTransition(event.type)) {
      throw new InvalidTransitionError(this._state, event.type);
    }

    const oldState = this._state;
    const newState = getNextState(this._state, event);

    // Update context based on event
    if (event.type === "error") {
      this._context.lastError = event.message;
    } else if (event.type === "transcription_complete") {
      this._context.lastTranscription = event.text;
      this._context.lastError = null;
    } else if (event.type === "start") {
      this._context.lastError = null;
    }

    this._state = newState;

    // Notify listeners
    for (const listener of this.listeners) {
      listener(oldState, newState, event);
    }

    return newState;
  }

  setWindowContext(context: WindowContext | null): void {
    this._context.currentWindow = context;
  }

  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this._state = "idle";
    this._context = {
      currentWindow: null,
      lastError: null,
      lastTranscription: null,
    };
  }
}

export function createStateMachine(): StateMachine {
  return new StateMachine();
}
