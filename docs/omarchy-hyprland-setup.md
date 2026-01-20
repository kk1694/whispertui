# WhisperTUI Setup with Omarchy + Hyprland

Complete guide to install and configure WhisperTUI with keyboard shortcuts in Omarchy/Hyprland.

## 1. Install Dependencies

WhisperTUI requires these system packages:

```bash
# Arch Linux / Omarchy
sudo pacman -S pulseaudio wl-clipboard wtype libnotify curl
```

Verify dependencies are installed:

```bash
which parecord wl-copy wtype notify-send curl
```

## 2. Install Bun

WhisperTUI is built with [Bun](https://bun.sh). Install it if you don't have it:

```bash
curl -fsSL https://bun.sh/install | bash
```

Restart your terminal or run:

```bash
source ~/.bashrc  # or ~/.zshrc
```

Verify with `bun --version`.

## 3. Clone and Build WhisperTUI

```bash
# Clone the repository
git clone https://github.com/your-username/whispertui.git
cd whispertui

# Install dependencies
bun install

# Link globally to make 'whispertui' available in PATH
bun link
```

The `bun link` command creates a global symlink so you can run `whispertui` from anywhere.

### Alternative: Add to PATH manually

If `bun link` doesn't work, add an alias to your shell config (`~/.bashrc` or `~/.zshrc`):

```bash
alias whispertui="bun run /path/to/whispertui/src/index.ts"
```

Or create a wrapper script in `~/.local/bin/` (make sure `~/.local/bin` is in your PATH):

```bash
#!/bin/bash
cd /path/to/whispertui && bun run src/index.ts "$@"
```

Make it executable: `chmod +x ~/.local/bin/whispertui`

## 4. Configure API Key

WhisperTUI uses Groq's Whisper API for transcription. Get a free API key from [console.groq.com](https://console.groq.com).

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
export GROQ_API_KEY="your-api-key-here"
```

Source it or restart your terminal:

```bash
source ~/.bashrc
```

## 5. Verify Installation

Run the doctor command to check everything is set up:

```bash
whispertui doctor
```

You should see all checks passing. Test a recording:

```bash
whispertui start
# speak something
whispertui stop
```

## 6. Start Daemon on Login

WhisperTUI uses a background daemon to handle recording and transcription. Start it automatically when Hyprland launches by adding to `~/.config/hypr/autostart.conf` (or `hyprland.conf`):

```conf
exec-once = /home/your-username/.local/bin/whispertui daemon
```

Use the full path since Hyprland's startup environment may not include `~/.local/bin` in PATH.

This ensures the daemon is always running and ready for keyboard shortcuts.

To start it manually for the current session:

```bash
whispertui daemon &
```

## 7. Configure Hyprland Keybindings

Add the following to `~/.config/hypr/bindings.conf`:

```conf
# ===================
# WhisperTUI Bindings
# ===================

# Toggle recording - press once to start, again to stop
bindd = SUPER, R, WhisperTUI toggle, exec, whispertui toggle

# Hold-to-record - hold to record, release to transcribe
bind = SUPER, H, exec, whispertui start
bindr = SUPER, H, exec, whispertui stop
```

### Keybinding Explanation

| Shortcut | Action | Description |
|----------|--------|-------------|
| `SUPER + R` | Toggle | Press to start recording, press again to stop and transcribe |
| `SUPER + H` (hold) | Hold-to-record | Hold to record, release to transcribe |

### Check for Conflicts

Before adding these bindings, check if SUPER+R or SUPER+H are already in use:

```bash
grep -E "SUPER.*,\s*[RH]," ~/.config/hypr/bindings.conf
```

If there are conflicts, either remove the existing binding or choose different keys for WhisperTUI.

## 8. Apply Changes

Reload Hyprland to apply the new bindings:

```bash
hyprctl reload
```

Or press `SUPER + Esc` to restart Hyprland.

## Usage

### SUPER + R (Toggle Mode)

1. Press `SUPER + R` to start recording (you'll see a notification)
2. Speak your text
3. Press `SUPER + R` again to stop
4. The transcribed text is automatically typed into your focused window

### SUPER + H (Hold Mode)

1. Press and hold `SUPER + H`
2. Speak while holding
3. Release to stop and transcribe
4. Text is typed into your focused window

### Other Commands

```bash
whispertui status      # Check daemon and recording status
whispertui history     # View recent transcriptions
whispertui tui         # Interactive TUI with history browser
whispertui config      # Show current configuration
whispertui config -e   # Edit configuration in $EDITOR
```

## Configuration

WhisperTUI stores its config at `~/.config/whispertui/config.toml`. Edit with:

```bash
whispertui config --edit
```

### Key Options

```toml
[output]
auto_paste = true          # Automatically type transcribed text
paste_method = "wtype"     # "wtype" (types text) or "clipboard-only"

[notifications]
enabled = true             # Show desktop notifications

[history]
max_entries = 1000         # Maximum history entries to keep
```

## Troubleshooting

### `whispertui: command not found`

The command isn't in your PATH. Try:

1. Re-run `bun link` in the whispertui directory
2. Check if `~/.bun/bin` is in your PATH: `echo $PATH | grep bun`
3. Add to your shell config if missing: `export PATH="$HOME/.bun/bin:$PATH"`

### No audio recording

- Check PulseAudio is running: `pactl info`
- List audio sources: `pactl list sources short`
- Test recording manually: `parecord --channels=1 --rate=16000 test.wav`

### Transcription fails

- Verify API key: `echo $GROQ_API_KEY`
- Test API connectivity: `curl -I https://api.groq.com`
- Check whispertui logs in the terminal output

### Keybindings not working

- Verify bindings loaded: `hyprctl binds | grep -i whisper`
- Check for typos in bindings.conf
- Ensure whispertui is in PATH for Hyprland (not just your terminal)

### Text not typing into window

- Ensure `wtype` is installed: `which wtype`
- Some applications (especially Electron apps) may need clipboard mode instead:

  ```bash
  whispertui config --edit
  # Change paste_method to "clipboard-only"
  ```

  Then use `CTRL+V` to paste after transcription.

## Quick Reference

| Command | Description |
|---------|-------------|
| `whispertui daemon` | Start daemon in foreground |
| `whispertui start` | Start recording |
| `whispertui stop` | Stop and transcribe |
| `whispertui toggle` | Toggle recording state |
| `whispertui status` | Show current status |
| `whispertui shutdown` | Stop the daemon |
| `whispertui history` | List recent transcriptions |
| `whispertui tui` | Interactive history browser |
| `whispertui doctor` | Check dependencies |
| `whispertui config` | Show configuration |
| `whispertui config -e` | Edit configuration |
