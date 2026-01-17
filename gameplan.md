# WhisperTUI Game Plan

<!--
This file contains the stages, steps, and acceptance criteria for the project.
Mark tasks complete by changing [ ] to [x].
-->

**Tech Stack**: Bun, TypeScript, Ink (per tech-spec.md)
**MVP Scope**: Core transcription loop. Text cleanup levels and code-aware mode deferred to v2.

---

## Stage 1: Project Foundation

### Step 1a: Project Init & XDG Paths

**Goal**: Set up the Bun/TypeScript project structure with XDG directory helpers.

**Tasks**:
1. Initialize Bun project with TypeScript
2. Create directory structure per tech spec
3. Create XDG directory helpers (config, state, data, cache paths)
4. Add basic CLI entry point with command routing stub
5. Load environment variables from `.env` file (Bun does this automatically)

**Files to Create**:
- `package.json`, `tsconfig.json`
- `src/index.ts` (entry point with arg parsing stub)
- `src/config/paths.ts` (XDG path helpers)
- `.env` already exists with `GROQ_API_KEY`

**Tests**:
- [x] XDG paths resolve correctly with default env vars
- [x] XDG paths respect custom env vars (XDG_CONFIG_HOME, etc.)
- [x] Directories created on first access

**Acceptance Criteria**:
- [x] `bun run src/index.ts` runs without error
- [x] XDG paths module exports correct paths
- [x] Running creates `~/.config/whispertui/`, `~/.local/state/whispertui/`, etc.

---

### Step 1b: Config Schema & Loader

**Goal**: TOML config loading with Zod validation.

**Tasks**:
1. Define config schema with Zod
2. Create default config values
3. Implement TOML loader (parse file, merge with defaults)
4. Add `config` CLI command to print current config

**Files to Create**:
- `src/config/schema.ts` (Zod schema)
- `src/config/defaults.ts` (default values)
- `src/config/index.ts` (loader)
- `config.example.toml`

**Tests**:
- [x] Config loads from TOML file correctly
- [x] Missing config file uses defaults
- [x] Partial config merges with defaults
- [x] Invalid config values throw descriptive errors
- [x] Unknown keys are ignored (forward compatibility)

**Acceptance Criteria**:
- [x] `bun run src/index.ts config` prints merged config (defaults + file)
- [x] Config validation rejects invalid values with clear messages
- [x] `config.example.toml` documents all options

---

## Stage 2: Daemon Core

### Step 2a: State Machine

**Goal**: Implement the core daemon state machine as a pure module.

**Tasks**:
1. Define state types (idle, recording, transcribing)
2. Define event types (start, stop, transcription_complete, error)
3. Implement state transition logic with validation
4. Add event emitter for state changes
5. Include context tracking (current window info placeholder)

**Files to Create**:
- `src/daemon/state.ts`

**Tests** (unit tests - no external deps):
- [x] `idle` + `start` → `recording`
- [x] `recording` + `stop` → `transcribing`
- [x] `transcribing` + `complete` → `idle`
- [x] `idle` + `stop` → error (invalid transition)
- [x] `recording` + `start` → error (already recording)
- [x] State change events fire correctly

**Acceptance Criteria**:
- [x] State machine is pure (no I/O, easily testable)
- [x] All valid transitions work
- [x] Invalid transitions throw descriptive errors
- [x] 100% test coverage on state module

---

### Step 2b: Unix Socket Server & IPC

**Goal**: Daemon that accepts IPC commands over Unix socket.

**Tasks**:
1. Create Unix socket server with JSON protocol
2. Wire command handlers to state machine
3. Implement commands: start, stop, status, shutdown
4. Add PID file management
5. Add auto-cleanup of stale sockets/PID files
6. Add SIGTERM/SIGINT handlers for graceful shutdown

**Files to Create/Modify**:
- `src/daemon/server.ts` (socket server)
- `src/daemon/handler.ts` (command dispatch)
- `src/index.ts` (add `daemon` command)

**Tests**:
- [x] Socket accepts connections and parses JSON commands
- [x] Status command returns current state
- [x] Shutdown command cleanly exits
- [x] Stale socket files are cleaned up on startup
- [x] SIGTERM triggers graceful shutdown
- [x] Malformed JSON returns error response

**Acceptance Criteria**:
- [x] `whispertui daemon` starts and listens on socket
- [x] Multiple commands can be sent over same socket connection
- [x] Socket has 0600 permissions
- [x] PID file created and removed on clean shutdown
- [x] `kill -TERM <pid>` shuts down gracefully

---

## Stage 3: CLI Client

### Step 3a: Socket Client

**Goal**: CLI client that sends commands to daemon over Unix socket.

**Tasks**:
1. Implement socket client (connect, send JSON, receive response)
2. Add connection timeout handling
3. Wire up CLI commands to socket client (start, stop, toggle, status, shutdown)
4. Display responses and errors to user

**Files to Create/Modify**:
- `src/client/index.ts` (socket client)
- `src/index.ts` (wire up CLI commands)

**Tests**:
- [x] Client connects to existing socket
- [x] Client sends JSON commands correctly
- [x] Client receives and parses JSON responses
- [x] Connection refused handled gracefully
- [x] Connection timeout handled gracefully
- [x] Error responses displayed to user

**Acceptance Criteria**:
- [x] With daemon running: `whispertui status` returns state
- [x] With daemon running: `whispertui start` → `whispertui stop` works
- [x] Without daemon: commands fail with clear "daemon not running" message

---

### Step 3b: Daemon Auto-Start

**Goal**: Automatically start daemon when CLI commands are run.

**Tasks**:
1. Implement daemon spawn (background process)
2. Add daemon health check (socket exists + responds to ping)
3. Implement wait-for-ready with timeout
4. Integrate auto-start into CLI command flow

**Files to Create/Modify**:
- `src/client/index.ts` (add auto-start logic)
- `src/daemon/server.ts` (add ping/health command if needed)

**Tests**:
- [x] Auto-start spawns daemon process
- [x] Wait-for-ready polls until socket responds
- [x] Timeout if daemon fails to start
- [x] Subsequent commands use running daemon
- [x] Multiple rapid commands don't spawn multiple daemons

**Acceptance Criteria**:
- [x] `whispertui status` auto-starts daemon if not running
- [x] First command has slight delay (daemon startup)
- [x] Subsequent commands are instant
- [x] Failed daemon start shows clear error

---

## Stage 4: Core MVP

### Step 4: Audio Recording

**Goal**: Record audio via parecord subprocess.

**Tasks**:
1. Create parecord wrapper (spawn, capture to file)
2. Implement recording start/stop control
3. Handle audio device selection from config
4. Add temp file management in cache directory

**Files to Create/Modify**:
- `src/audio/recorder.ts`
- `src/daemon/handler.ts` (integrate recording)

**Tests**:
- [x] Recording starts parecord process
- [x] Recording stop terminates process gracefully
- [x] WAV file created with correct format (16kHz, mono)
- [x] Recording timeout protection (max duration)
- [x] Missing parecord binary gives clear error

**Acceptance Criteria**:
- [x] `whispertui start` begins recording (verify with `pgrep parecord`)
- [x] `whispertui stop` stops recording
- [x] Audio file exists in `~/.cache/whispertui/`
- [x] Audio is valid WAV (playable with `aplay`)

---

### Step 5: Groq API Integration

**Goal**: Transcribe audio files via Groq Whisper API.

**Tasks**:
1. Implement Groq API client
2. Handle API key from `.env` file (GROQ_API_KEY)
3. Parse transcription response
4. Add error handling (rate limits, network errors, invalid audio)

**Files to Create/Modify**:
- `src/transcription/groq.ts`
- `src/daemon/handler.ts` (integrate transcription)

**Tests**:
- [x] API call succeeds with valid audio
- [x] Missing API key gives clear error
- [x] API errors (401, 429, 500) handled with retry/feedback
- [x] Large files handled correctly
- [x] Empty audio handled gracefully

**Acceptance Criteria**:
- [x] Record audio → transcription returns text
- [x] Transcription printed to stdout on `whispertui stop`
- [x] Clear error message if GROQ_API_KEY not set in `.env` or environment
- [x] API errors reported via notify-send

---

### Step 6a: Clipboard Output

**Goal**: Copy transcribed text to clipboard via wl-copy.

**Tasks**:
1. Implement wl-copy wrapper
2. Integrate clipboard copy into transcription flow
3. Handle missing wl-copy binary
4. Handle special characters (newlines, quotes, unicode)

**Files to Create/Modify**:
- `src/output/clipboard.ts`
- `src/daemon/handler.ts` (integrate clipboard output)

**Tests**:
- [x] wl-copy puts text in clipboard
- [x] Missing wl-copy gives clear error
- [x] Newlines preserved in clipboard
- [x] Unicode characters handled correctly
- [x] Empty text handled gracefully

**Acceptance Criteria**:
- [x] After transcription, text appears in clipboard (`wl-paste`)
- [x] `whispertui stop` outputs text and copies to clipboard
- [x] Clear error if wl-copy not installed

---

### Step 6b: Auto-Type Output

**Goal**: Optionally type transcribed text into focused window via wtype.

**Tasks**:
1. Implement wtype wrapper
2. Add output mode selection from config (wtype vs clipboard-only)
3. Implement fallback (wtype fails → clipboard only + notification)
4. Handle typing delays and special characters

**Files to Create/Modify**:
- `src/output/typer.ts`
- `src/daemon/handler.ts` (integrate typer with fallback)

**Tests**:
- [x] wtype types text into focused window
- [x] Missing wtype falls back to clipboard
- [x] wtype failure falls back to clipboard
- [x] Config switches between paste methods
- [x] Special characters (quotes, brackets) typed correctly

**Acceptance Criteria**:
- [x] With auto_paste=true and paste_method=wtype, text is typed
- [x] With paste_method=clipboard-only, only clipboard is used
- [x] wtype failure notifies user but text is still in clipboard
- [x] Config option respected

---

## Stage 5: Polish

### Step 7: Notifications

**Goal**: User feedback via desktop notifications.

**Tasks**:
1. Implement notify-send wrapper
2. Add notifications for: recording started, transcription complete, errors
3. Make notifications configurable (on/off)

**Files to Create/Modify**:
- `src/notify/index.ts`
- Integrate throughout daemon handlers

**Tests**:
- [x] Notifications appear for key events
- [x] Missing notify-send handled gracefully
- [x] Notifications can be disabled via config

**Acceptance Criteria**:
- [x] "Recording started" notification on start
- [x] "Transcription complete" notification with preview
- [x] Error notifications show actionable messages

---

### Step 8: History Storage

**Goal**: Save and retrieve transcription history.

**Tasks**:
1. Implement history writer (timestamped files)
2. Implement history reader (list, limit)
3. Add history CLI command
4. Implement history pruning (max_entries)

**Files to Create/Modify**:
- `src/history/index.ts`
- `src/index.ts` (add history command)
- `src/daemon/handler.ts` (save after transcription)

**Tests**:
- [x] Transcriptions saved to history directory
- [x] History list returns entries in reverse chronological order
- [x] Limit parameter works
- [x] Pruning removes oldest entries beyond max

**Acceptance Criteria**:
- [x] Each transcription creates file in `~/.local/share/whispertui/history/`
- [x] `whispertui history` lists recent transcriptions
- [x] `whispertui history --limit 5` limits output
- [x] Old entries pruned when exceeding max_entries

---

### Step 9: Context Detection

**Goal**: Detect focused application for context-aware behavior.

**Tasks**:
1. Implement hyprctl wrapper (get active window)
2. Parse window class/title
3. Detect code-aware apps from config list
4. Expose context info in daemon state

**Files to Create/Modify**:
- `src/context/hyprland.ts`
- `src/daemon/state.ts` (add context field)
- `src/daemon/handler.ts` (detect context on start)

**Tests**:
- [x] hyprctl output parsed correctly
- [x] Code-aware apps detected by window class
- [x] Missing hyprctl handled (non-Hyprland fallback)
- [x] Context included in status response

**Acceptance Criteria**:
- [x] `whispertui status` shows current window context
- [x] Terminal apps detected as code-aware
- [x] Context detection doesn't block recording start

---

## Stage 6: TUI

### Step 10: TUI Foundation (Ink Setup)

**Goal**: Basic Ink TUI with recording indicator.

**Tasks**:
1. Set up Ink with React/TypeScript
2. Create main App component
3. Implement RecordingIndicator component
4. Wire TUI to daemon via socket client
5. Add keyboard shortcuts (Enter to toggle, q to quit)

**Files to Create/Modify**:
- `src/ui/App.tsx`
- `src/ui/components/RecordingIndicator.tsx`
- `src/index.ts` (add tui command)

**Tests**:
- [x] TUI launches and connects to daemon
- [x] Recording indicator updates with state changes
- [x] Keyboard shortcuts work
- [x] Clean exit on quit

**Acceptance Criteria**:
- [x] `whispertui tui` launches interactive interface
- [x] Shows current recording state (idle/recording/transcribing)
- [x] Press Enter toggles recording
- [x] Press q quits cleanly

---

### Step 11: TUI History Browser

**Goal**: Browse and select from transcription history in TUI.

**Tasks**:
1. Create History component (scrollable list)
2. Implement selection and copy-to-clipboard
3. Add search/filter functionality
4. Integrate with main TUI app

**Files to Create/Modify**:
- `src/ui/components/History.tsx`
- `src/ui/App.tsx` (add history view)

**Tests**:
- [ ] History entries displayed
- [ ] Arrow keys navigate list
- [ ] Enter copies selected entry to clipboard
- [ ] Search filters results

**Acceptance Criteria**:
- [ ] TUI shows recent transcriptions
- [ ] Navigate with arrow keys
- [ ] Enter copies selected to clipboard
- [ ] Type to search/filter

---

## Stage 7: Final Integration

### Step 12a: Doctor Command

**Goal**: Dependency checker utility for troubleshooting.

**Tasks**:
1. Create doctor module that checks all external dependencies
2. Check for: bun, parecord, wl-copy, wtype, notify-send, hyprctl
3. Report version info for found tools
4. Report installation instructions for missing tools
5. Check for GROQ_API_KEY in `.env` file or environment

**Files to Create/Modify**:
- `src/doctor/index.ts`
- `src/index.ts` (add doctor command)

**Tests**:
- [ ] Doctor detects present dependencies with checkmark
- [ ] Doctor detects missing dependencies with X
- [ ] Doctor shows version for each tool
- [ ] Doctor shows install command for missing tools
- [ ] Doctor checks GROQ_API_KEY presence

**Acceptance Criteria**:
- [ ] `whispertui doctor` lists all dependencies
- [ ] Each dependency shows: name, status, version or install hint
- [ ] Exit code 0 if all OK, non-zero if missing dependencies
- [ ] GROQ_API_KEY shown as set/not set (not the actual value)

---

### Step 12b: Hyprland Integration & Polish

**Goal**: Startup script, keybind docs, and final polish.

**Tasks**:
1. Create Hyprland startup script
2. Document keybind configuration in README
3. Add `config --edit` command (opens config in $EDITOR)
4. Final error handling review
5. Add graceful degradation for missing optional dependencies

**Files to Create/Modify**:
- `scripts/hyprland-startup.sh`
- `README.md`
- `src/index.ts` (add config --edit)

**Tests**:
- [ ] Startup script launches daemon correctly
- [ ] Config edit opens $EDITOR
- [ ] Config edit creates default config if missing
- [ ] Missing optional deps (notify-send, hyprctl) don't crash

**Acceptance Criteria**:
- [ ] `exec-once = whispertui daemon &` works in Hyprland
- [ ] README documents push-to-talk keybind setup
- [ ] `whispertui config --edit` opens config in editor
- [ ] Missing hyprctl doesn't crash (context detection disabled)
- [ ] Missing notify-send doesn't crash (notifications disabled)

---

## Dependency Checklist

| Step | Dependencies |
|------|--------------|
| 1a | bun |
| 1b | @iarna/toml, zod (npm packages) |
| 2a | (none - pure TypeScript) |
| 2b | (none) |
| 3a | (none) |
| 3b | (none) |
| 4 | parecord (pulseaudio-utils) |
| 5 | GROQ_API_KEY in `.env` file |
| 6a | wl-copy (wl-clipboard) |
| 6b | wtype |
| 7 | notify-send (libnotify) |
| 8 | (none) |
| 9 | hyprctl (Hyprland) |
| 10 | ink (npm package) |
| 11 | (none) |
| 12a | (none) |
| 12b | (none) |

---

## Testing Strategy

Each step should include:
1. **Unit tests**: Pure function logic (Bun test runner: `bun test`)
2. **Integration tests**: Component interactions with mocks
3. **Manual verification**: Actual system behavior

### Mocking External Processes

For tests that interact with external tools (parecord, wl-copy, hyprctl, Groq API):

- **Unit tests**: Mock the spawn/fetch calls, test the wrapper logic
- **Integration tests**: Use mock executables or environment stubs
- **Manual tests**: Run against real system tools

---

## Deferred to v2

The following features from the product spec are not in this plan:

- Text cleanup levels (raw/clean/formatted)
- Code-aware mode with technical vocabulary
- Custom vocabulary and snippets
- Local Whisper fallback
- Voice commands ("delete last sentence", etc.)
- Multi-language support
