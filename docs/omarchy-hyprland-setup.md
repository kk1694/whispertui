# WhisperTUI Setup with Omarchy + Hyprland

This guide explains how to configure keyboard shortcuts for WhisperTUI in Omarchy with Hyprland.

## Prerequisites

1. WhisperTUI installed and working (`whispertui doctor` to verify)
2. A valid `GROQ_API_KEY` environment variable set
3. Omarchy with Hyprland configured

## Keyboard Shortcuts

Add the following bindings to your `~/.config/hypr/bindings.conf`:

### SUPER + R: Toggle Recording (Press Enter to Stop)

This shortcut starts recording. Press the shortcut again (or use `whispertui stop`) to stop and transcribe.

```conf
# WhisperTUI - Toggle recording (SUPER+R to start, SUPER+R again to stop)
bindd = SUPER, R, WhisperTUI toggle, exec, whispertui toggle
```

**Usage:**
1. Press `SUPER + R` to start recording
2. Speak your text
3. Press `SUPER + R` again to stop and transcribe

The transcribed text will automatically be typed into your currently focused window.

### SUPER + H: Hold-to-Record (Release to Transcribe)

This shortcut records while you hold the key combination and transcribes when you release.

```conf
# WhisperTUI - Hold to record (press to start, release to transcribe)
bind = SUPER, H, exec, whispertui start
bindr = SUPER, H, exec, whispertui stop
```

**Usage:**
1. Press and hold `SUPER + H`
2. Speak your text while holding
3. Release to stop recording and transcribe

## Complete Configuration Example

Add this block to your `~/.config/hypr/bindings.conf`:

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

## Applying Changes

After editing your bindings, reload Hyprland:

- Press `SUPER + Esc` to restart Hyprland, or
- Run `hyprctl reload` in a terminal

## Troubleshooting

### Check if WhisperTUI is working

```bash
whispertui doctor
```

This checks all required dependencies (parecord, wl-copy, wtype, notify-send, curl).

### Check daemon status

```bash
whispertui status
```

### View transcription history

```bash
whispertui history
```

Or launch the interactive TUI:

```bash
whispertui tui
```

### API Key not found

Ensure your `GROQ_API_KEY` is set. Add to `~/.bashrc` or `~/.zshrc`:

```bash
export GROQ_API_KEY="your-api-key-here"
```

Then source it or restart your terminal.

### Binding conflicts

If SUPER + R or SUPER + H conflict with existing bindings, check your current bindings with `SUPER + K` or search `~/.config/hypr/bindings.conf` for existing uses of these keys.

## Configuration

Edit WhisperTUI settings:

```bash
whispertui config --edit
```

Key options:
- `output.auto_paste` - Enable/disable automatic typing of transcription
- `output.paste_method` - Use `"wtype"` (types text) or `"clipboard-only"`
- `notifications.enabled` - Show desktop notifications on transcription
