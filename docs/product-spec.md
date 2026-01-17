# WhisperTUI Product Specification

**Voice-to-text for Linux power users**

## Overview

WhisperTUI is a terminal-based voice transcription tool designed for Linux power users running Wayland compositors, particularly Hyprland. It fills a gap in the Linux ecosystem where no good voice-to-text solutions exist for modern Wayland environments.

### Problem Statement

Linux users on Wayland, especially those using tiling window managers like Hyprland, lack a robust voice-to-text solution. Existing tools are either:
- X11-only and incompatible with Wayland
- Require heavy GUI applications
- Don't integrate well with terminal-centric workflows
- Lack customization for technical users

WhisperTUI solves this by providing a lightweight, terminal-native tool that integrates seamlessly with Wayland and power-user workflows.

## Core Features (v1 MVP)

### Transcription Modes

- **Push-to-talk**: Hold a key to record, release to transcribe and paste
- **Toggle mode**: Press once to start recording, press again to stop and transcribe
- **Floating TUI**: A minimal terminal interface for longer dictation sessions

### Auto-paste

Transcribed text is automatically pasted into the currently focused application using Wayland-native tools (wl-copy/wtype or ydotool).

### Smart Processing

Configurable text cleanup levels:
- **Raw**: Exact transcription output
- **Clean**: Basic punctuation and capitalization fixes
- **Formatted**: Sentence structure, paragraph breaks, and formatting

### Context-Aware Behavior

WhisperTUI detects the currently focused application and adjusts behavior accordingly:
- Regular applications: Standard prose transcription
- Terminals/editors: Code-aware mode with technical vocabulary
- Chat applications: Casual tone, shorter sentences

### Code-Aware Mode

When focused on terminals or code editors:
- Technical vocabulary prioritization
- Proper handling of programming terms
- Snake_case, camelCase, and other naming convention support
- Common programming symbols and operators

### Custom Vocabulary and Snippets

- User-defined vocabulary for domain-specific terms
- Text snippets triggered by voice commands
- Abbreviation expansion

### Searchable Transcription History

- All transcriptions saved locally
- Full-text search across history
- Copy previous transcriptions

### Visual-Only Feedback

- No audio feedback (silent operation)
- Status indicators in the TUI
- Optional desktop notifications via Wayland-native tools

## Technical Approach

### Backend

- **Primary**: Groq API for fast, high-quality transcription
- **Fallback**: Local Whisper CPU inference (optional, for offline use)

### Platform Requirements

- **Display Server**: Wayland-native (no X11 dependency)
- **Clipboard**: wl-copy for clipboard operations
- **Typing**: wtype or ydotool for simulated keyboard input
- **Audio**: PipeWire/PulseAudio for audio capture

### Integration

- **Trigger**: Hyprland keybind (configurable)
- **Configuration**: TOML file (`~/.config/whispertui/config.toml`)

### Technology Stack

- **Language**: Rust (for performance and reliability)
- **TUI Framework**: Ratatui
- **Audio**: cpal or rodio for audio capture

## Configuration

Example `config.toml`:

```toml
[transcription]
backend = "groq"  # or "local"
cleanup_level = "clean"

[keybinds]
push_to_talk = "Super+V"
toggle_mode = "Super+Shift+V"

[context]
code_aware_apps = ["alacritty", "kitty", "foot", "nvim", "code"]

[vocabulary]
custom_words = ["Hyprland", "Wayland", "Neovim"]
```

## Future Enhancements

### Voice Commands
- "Delete last sentence"
- "New paragraph"
- "Select all and replace"

### File Transcription
- Transcribe audio/video files
- Batch processing
- Output to various formats

### TUI Settings
- Configure all options from within the TUI
- Live preview of settings changes

### Multi-Language Support
- Automatic language detection
- Per-context language preferences
- Translation capabilities

## Success Metrics

- Transcription latency under 2 seconds for typical utterances
- Accuracy comparable to commercial solutions
- Minimal resource usage when idle
- Seamless integration with Hyprland workflow
