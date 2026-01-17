# WhisperTUI Technical Specification

**Implementation guide for the WhisperTUI voice-to-text tool**

## Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Bun | Fast startup (~10ms), native TypeScript, good FFI support |
| **TUI Framework** | Ink | React-like component model, familiar patterns |
| **IPC** | Unix socket | Fast, standard, native Bun support |
| **Auto-paste** | wl-copy + wtype | Wayland-native, lightweight |
| **Audio capture** | parecord (PulseAudio) | Simple, reliable, PipeWire compatible |
| **Audio format** | WAV | No encoding overhead, Groq accepts it |
| **Transcription** | Groq API | Fast, high-quality, simple REST API |
| **Config format** | TOML | Human-readable, standard for CLI tools |
| **Notifications** | notify-send | Wayland-native via mako/dunst |

## Architecture

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│  whispertui daemon                                          │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Audio     │  │ Transcribe  │  │      Output         │ │
│  │  Recorder   │──▶│   (Groq)    │──▶│  (wl-copy/wtype)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Config    │  │   History   │  │  Context Detector   │ │
│  │   Loader    │  │   Manager   │  │    (hyprctl)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│                                                             │
│  Socket: ~/.local/state/whispertui/whispertui.sock         │
└──────────────────────────┬──────────────────────────────────┘
                           │ Unix Socket IPC
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     whispertui       whispertui    whispertui
        start            stop         status
```

### Daemon Lifecycle

1. **Auto-start**: First CLI command checks if daemon is running (socket exists and responds). If not, spawns daemon in background.
2. **Hyprland startup**: Optional `exec-once` in Hyprland config for faster first invocation.
3. **Shutdown**: `whispertui shutdown` or daemon exits after configurable idle timeout (default: never).

### IPC Protocol

JSON messages over Unix socket.

**Commands (client → daemon):**

```typescript
// Start recording
{ "cmd": "start" }

// Stop recording, transcribe, paste
{ "cmd": "stop" }

// Query daemon state
{ "cmd": "status" }

// Get recent transcriptions
{ "cmd": "history", "limit": 10 }

// Shutdown daemon
{ "cmd": "shutdown" }
```

**Responses (daemon → client):**

```typescript
// Success responses
{ "ok": true, "state": "recording" }
{ "ok": true, "state": "idle" }
{ "ok": true, "state": "transcribing" }
{ "ok": true, "text": "transcribed text here", "duration": 2.3 }
{ "ok": true, "history": [{ "timestamp": "...", "text": "...", "file": "..." }] }

// Error responses
{ "ok": false, "error": "Already recording" }
{ "ok": false, "error": "Groq API error: ..." }
```

## Directory Structure

### Project Layout

```
whispertui/
├── src/
│   ├── index.ts                 # Entry point, CLI routing
│   ├── daemon/
│   │   ├── server.ts            # Unix socket server
│   │   ├── state.ts             # State machine (idle/recording/transcribing)
│   │   └── handler.ts           # Command handlers
│   ├── audio/
│   │   └── recorder.ts          # parecord wrapper
│   ├── transcription/
│   │   └── groq.ts              # Groq Whisper API client
│   ├── output/
│   │   ├── clipboard.ts         # wl-copy wrapper
│   │   └── typer.ts             # wtype wrapper
│   ├── context/
│   │   └── hyprland.ts          # hyprctl activewindow
│   ├── config/
│   │   ├── index.ts             # Config loader
│   │   ├── schema.ts            # Config types/validation
│   │   └── defaults.ts          # Default values
│   ├── history/
│   │   └── index.ts             # History read/write
│   ├── notify/
│   │   └── index.ts             # notify-send wrapper
│   ├── client/
│   │   └── index.ts             # CLI client (sends commands to daemon)
│   └── ui/
│       ├── App.tsx              # Main Ink app (for TUI mode)
│       └── components/
│           ├── RecordingIndicator.tsx
│           └── History.tsx
├── docs/
│   ├── product-spec.md
│   └── tech-spec.md
├── scripts/
│   └── hyprland-startup.sh      # Startup script for Hyprland
├── config.example.toml
├── package.json
├── tsconfig.json
└── README.md
```

### Runtime Directories

Following XDG Base Directory spec:

| Path | Purpose |
|------|---------|
| `~/.config/whispertui/config.toml` | User configuration |
| `~/.local/state/whispertui/whispertui.sock` | Daemon socket |
| `~/.local/state/whispertui/daemon.pid` | Daemon PID file |
| `~/.local/share/whispertui/history/` | Transcription history |
| `~/.cache/whispertui/` | Temporary audio files |

### History Storage

Each transcription saved as a timestamped text file:

```
~/.local/share/whispertui/history/
├── 2024-01-15T10-30-45.txt
├── 2024-01-15T10-32-12.txt
└── 2024-01-15T11-45-00.txt
```

File contents:
```
This is the transcribed text from the recording.
```

Metadata (duration, app context) can be added as front-matter later if needed.

## Configuration

### Default Config

Location: `~/.config/whispertui/config.toml`

```toml
[transcription]
backend = "groq"
api_key_env = "GROQ_API_KEY"  # Read API key from this env var
cleanup_level = "clean"        # raw | clean | formatted

[audio]
device = "default"             # PulseAudio device name
sample_rate = 16000            # Whisper expects 16kHz
format = "wav"

[output]
auto_paste = true              # Automatically paste after transcription
paste_method = "wtype"         # wtype | clipboard-only

[context]
enabled = true
code_aware_apps = ["Alacritty", "kitty", "foot", "nvim", "code", "Code"]

[history]
enabled = true
max_entries = 1000             # Prune old entries beyond this

[daemon]
idle_timeout = 0               # Seconds before auto-shutdown (0 = never)
```

## CLI Interface

```bash
# Recording control
whispertui start               # Start recording
whispertui stop                # Stop recording, transcribe, paste
whispertui toggle              # Toggle recording state

# Daemon management
whispertui status              # Show daemon state
whispertui shutdown            # Stop the daemon
whispertui daemon              # Start daemon in foreground (for debugging)

# History
whispertui history             # List recent transcriptions
whispertui history --limit 5   # Limit results
whispertui history --search "keyword"  # Search history (v2)

# TUI mode
whispertui tui                 # Launch interactive TUI

# Utility
whispertui config              # Print current config
whispertui config --edit       # Open config in $EDITOR
```

## Hyprland Integration

### Keybinds

Add to `~/.config/hypr/hyprland.conf`:

```bash
# Push-to-talk (hold Super+V to record)
bind = SUPER, V, exec, whispertui start
bindr = SUPER, V, exec, whispertui stop

# Or toggle mode (press once to start, again to stop)
# bind = SUPER, V, exec, whispertui toggle

# Open TUI for longer sessions
bind = SUPER_SHIFT, V, exec, alacritty -e whispertui tui
```

### Startup Script

File: `scripts/hyprland-startup.sh`

```bash
#!/bin/bash
# Pre-start the daemon for instant response on first keybind
whispertui daemon &
```

Add to Hyprland config:

```bash
exec-once = ~/.config/whispertui/startup.sh
# Or directly:
exec-once = whispertui daemon &
```

## External Dependencies

### Required System Packages

```bash
# Arch Linux
pacman -S wl-clipboard wtype libnotify pulseaudio-utils

# Components:
# - wl-clipboard: provides wl-copy
# - wtype: Wayland typing tool
# - libnotify: provides notify-send
# - pulseaudio-utils: provides parecord (works with PipeWire)
```

### Environment Variables

```bash
# Required
GROQ_API_KEY=gsk_...          # Groq API key

# Optional (XDG defaults used if not set)
XDG_CONFIG_HOME=~/.config
XDG_STATE_HOME=~/.local/state
XDG_DATA_HOME=~/.local/share
XDG_CACHE_HOME=~/.cache
```

## Implementation Phases

### Phase 1: Core Loop (MVP)

- [ ] Daemon with Unix socket server
- [ ] Basic state machine (idle → recording → transcribing → idle)
- [ ] Audio recording via parecord
- [ ] Groq API integration
- [ ] wl-copy + wtype output
- [ ] CLI client (start/stop/status)
- [ ] Basic error handling with notify-send

### Phase 2: Polish

- [ ] Config file loading (TOML)
- [ ] History storage
- [ ] Context detection (hyprctl)
- [ ] Hyprland startup script
- [ ] Auto-start daemon on first command

### Phase 3: TUI & UX

- [ ] Ink-based TUI
- [ ] Recording indicator component
- [ ] History browser
- [ ] Visual feedback during transcription

### Phase 4: Advanced Features

- [ ] Text cleanup levels (raw/clean/formatted)
- [ ] Code-aware mode
- [ ] Custom vocabulary
- [ ] Local Whisper fallback

## API Reference

### Groq Whisper API

Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`

```typescript
const formData = new FormData();
formData.append('file', audioBlob, 'recording.wav');
formData.append('model', 'whisper-large-v3');
formData.append('response_format', 'text');

const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
  },
  body: formData,
});

const text = await response.text();
```

## Error Handling

| Error | User Feedback | Recovery |
|-------|---------------|----------|
| Daemon not running | Auto-start daemon | Retry command |
| Already recording | notify-send warning | Ignore command |
| parecord fails | notify-send error | Return to idle |
| Groq API error | notify-send with message | Return to idle, audio preserved in cache |
| wtype fails | notify-send, text in clipboard | User can paste manually |
| No GROQ_API_KEY | notify-send error | Exit with instructions |

## Security Considerations

- API key read from environment variable, never stored in config file
- Socket permissions: user-only (0600)
- Audio files in cache are temporary, cleaned after successful transcription
- History stored locally, not synced anywhere
