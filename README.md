# WhisperTUI

Terminal-based voice transcription tool for Linux/Wayland using Groq's Whisper
API. Note: completely vibe coded!

## Features

- Push-to-talk voice transcription
- Auto-paste transcribed text via wtype or clipboard
- Desktop notifications for recording state
- Context-aware detection (knows when you're in a terminal/IDE)
- Transcription history with TUI browser
- Hyprland integration

## Requirements

### Required

- [Bun](https://bun.sh/) runtime
- PulseAudio (`parecord` for recording)
- [wl-clipboard](https://github.com/bugaevc/wl-clipboard) (`wl-copy` for
  clipboard)
- Groq API key (get one at https://console.groq.com)

### Optional

- [wtype](https://github.com/atx/wtype) - for auto-typing into focused window
- [libnotify](https://gitlab.gnome.org/GNOME/libnotify) - for desktop
  notifications
- [Hyprland](https://hyprland.org/) - for context detection

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/whispertui.git
cd whispertui

# Install dependencies
bun install

# Set up your Groq API key
echo "GROQ_API_KEY=your_key_here" > .env

# Verify dependencies
bun run src/index.ts doctor
```

## Usage

### Quick Start

```bash
# Start recording
whispertui start

# Stop and transcribe
whispertui stop

# Or use toggle (recommended for keybindings)
whispertui toggle

# Launch interactive TUI
whispertui tui
```

### Available Commands

| Command         | Description                   |
| --------------- | ----------------------------- |
| `start`         | Start recording               |
| `stop`          | Stop recording and transcribe |
| `toggle`        | Toggle recording state        |
| `status`        | Show daemon status            |
| `shutdown`      | Stop the daemon               |
| `daemon`        | Start daemon in foreground    |
| `config`        | Print current configuration   |
| `config --edit` | Open config file in $EDITOR   |
| `history`       | List recent transcriptions    |
| `tui`           | Launch interactive TUI        |
| `doctor`        | Check system dependencies     |

### TUI Keybindings

| Key     | Action                      |
| ------- | --------------------------- |
| `Enter` | Toggle recording            |
| `s`     | Start recording (when idle) |
| `Space` | Stop recording              |
| `h`     | Open history browser        |
| `q`     | Quit                        |

#### History Browser

| Key            | Action                     |
| -------------- | -------------------------- |
| `↑/↓` or `j/k` | Navigate entries           |
| `Enter`        | Copy selected to clipboard |
| `/` or `f`     | Start filtering            |
| `c`            | Clear filter               |
| `q` or `Esc`   | Return to main view        |

## Hyprland Integration

### Auto-start Daemon

Add to your `~/.config/hypr/hyprland.conf`:

```conf
# Start WhisperTUI daemon on login
exec-once = whispertui daemon &
```

Or use the startup script:

```conf
exec-once = ~/.config/whispertui/hyprland-startup.sh
```

### Push-to-Talk Keybinding

Add to your `~/.config/hypr/hyprland.conf`:

```conf
# Push-to-talk with Super+V
bind = $mainMod, V, exec, whispertui toggle
```

For a true push-to-talk experience (record while held):

```conf
# Hold Super+V to record, release to transcribe
bind = $mainMod, V, exec, whispertui start
bindr = $mainMod, V, exec, whispertui stop
```

### Example Keybindings

```conf
# Toggle recording
bind = $mainMod, V, exec, whispertui toggle

# Open TUI
bind = $mainMod SHIFT, V, exec, alacritty -e whispertui tui

# Quick status check (notification)
bind = $mainMod ALT, V, exec, whispertui status
```

## Configuration

Edit your config file:

```bash
whispertui config --edit
```

Config file location: `~/.config/whispertui/config.toml`

### Example Configuration

```toml
[transcription]
backend = "groq"
api_key_env = "GROQ_API_KEY"

[audio]
device = "default"
sample_rate = 16000
format = "wav"

[output]
auto_paste = true
paste_method = "wtype"  # or "clipboard-only"

[context]
enabled = true
code_aware_apps = ["Alacritty", "kitty", "foot", "nvim", "code", "Code"]

[history]
enabled = true
max_entries = 1000

[notifications]
enabled = true
```

## Data Locations

Following XDG Base Directory specification:

| Path                                 | Purpose               |
| ------------------------------------ | --------------------- |
| `~/.config/whispertui/`              | Configuration files   |
| `~/.local/state/whispertui/`         | Socket and PID files  |
| `~/.local/share/whispertui/history/` | Transcription history |
| `~/.cache/whispertui/`               | Temporary audio files |

## Troubleshooting

Run the doctor command to check dependencies:

```bash
whispertui doctor
```

### Common Issues

**"Daemon not running" error**

- The daemon starts automatically, but you can start it manually:
  `whispertui daemon`

**No audio recorded**

- Check PulseAudio is running: `pactl info`
- Verify microphone: `parecord --list-devices`

**wtype not working**

- wtype requires running under Wayland
- Make sure your compositor supports virtual keyboard protocol
- Fall back to clipboard-only: set `paste_method = "clipboard-only"` in config

**Missing API key**

- Create `.env` file in project root with `GROQ_API_KEY=your_key`
- Or export it: `export GROQ_API_KEY=your_key`

## License

MIT
