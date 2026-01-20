# Issue Report: wtype Dropping Spaces

## Problem Summary

When the whispertui daemon uses `wtype` to type transcribed text into the active window, spaces are not being typed. The transcription itself contains spaces, but the resulting typed text has all words concatenated.

**Example:**
- Input transcription: `"Let's see if it's working"`
- Typed output: `Let'sseeifthisisworkingasexpected.`

## Key Finding: Spaces ARE Present in the Text

Debug logging confirmed that the text passed to `typeText()` contains spaces:

```
timestamp: 2026-01-20T13:06:03.077Z
text length: 23
text bytes: 204e6f772069742073686f756c642062652066696e652e
text: " Now it should be fine."
text chars: ' '(32), 'N'(78), 'o'(111), 'w'(119), ' '(32), 'i'(105), 't'(116), ' '(32), ...
```

Character code 32 (space) is clearly present multiple times. The issue is NOT in the transcription or text processing pipeline.

## The Mystery

**Tests pass, daemon fails.** The same wtype invocation that works in the test script fails when run from the daemon.

### Test Results (all preserve spaces correctly)

| Test | Method | Result |
|------|--------|--------|
| 1 | `spawn("wtype", ["--", text])` | WORKS |
| 4 | `exec("wtype -- 'text'")` | WORKS |
| 15 | `Bun.$\`wtype -- ${text}\`` | WORKS |
| 19 | Import actual `typeText()` function | WORKS |

All tests typed `"hello world test"` with spaces preserved.

### Daemon Result

The same code, when run from the compiled daemon binary, drops all spaces.

## What Was Tried

### 1. Direct Argument with spawn() (Original Code)
```typescript
const args = ["--", text];
spawn("wtype", args, { stdio: ["ignore", "ignore", "pipe"] });
```
- Test 1: WORKS
- Daemon: FAILS (no spaces)

### 2. Stdin Mode with `-` Flag
```typescript
const args = ["-"];
const proc = spawn("wtype", args, { stdio: ["pipe", "ignore", "pipe"] });
proc.stdin.write(text);
proc.stdin.end();
```
- Daemon: FAILS (no spaces)

### 3. exec() with Shell Quoting
```typescript
const escaped = text.replace(/'/g, "'\\''");
const cmd = `wtype -- '${escaped}'`;
exec(cmd, callback);
```
- Test 4: WORKS
- Daemon: FAILS (no spaces)

### 4. Various Other Approaches
- `spawnSync()` - not tested in daemon
- Bun's native `Bun.spawn()` - works in test
- Bun's `$` shell template - works in test
- Character-by-character typing - partially works but impractical
- Using `-k space` key names - works but complex

## Hypotheses

### 1. Compiled Binary Behavior Differs from Source
The test script runs with `bun run test-wtype.ts` (interpreting TypeScript source), while the daemon runs from a compiled binary (`bun build --compile`). The Bun compiler might handle `spawn()` or `exec()` differently in compiled mode.

**Evidence:** Test 19 imports and calls the actual `typeText()` function from source and it works. The same function in the compiled binary doesn't.

### 2. Process Context Differences
The daemon runs as a background process. There may be differences in:
- File descriptors
- TTY attachment
- Process groups
- Signal handling

### 3. Environment Variables
While `WAYLAND_DISPLAY` should be inherited, there might be subtle environment differences that affect wtype's behavior.

### 4. Timing/Race Condition
The daemon might be calling wtype in a context where something about the event loop or async handling causes issues.

### 5. wtype Bug with Certain Invocation Patterns
wtype itself might have a bug that manifests only under certain process tree configurations.

## Recommended Investigation

1. **Test the compiled binary directly:**
   ```bash
   ./dist/whispertui --eval "import { typeText } from './src/output/typer'; typeText('hello world');"
   ```
   (If Bun supports this)

2. **Run daemon in foreground with strace:**
   ```bash
   strace -f -e execve whispertui daemon
   ```
   Compare the actual execve() calls between test and daemon.

3. **Test with a simple compiled binary:**
   Create a minimal Bun-compiled binary that just calls wtype and see if it reproduces the issue.

4. **Check wtype source code:**
   Look at how wtype handles its arguments - maybe there's something about how it parses argv that's affected by the process context.

5. **Try alternative typing methods:**
   - `ydotool` (works on Wayland without wtype)
   - `dotool`
   - Direct Wayland protocol via `wl-keyboard`

## Files Involved

- `src/output/typer.ts` - The typeText() function
- `src/daemon/server.ts` - Calls typeText() in handleOutput()
- `src/ui/quick.tsx` - Also calls typeText() directly
- `test-wtype.ts` - Comprehensive test script (21 tests)

## Workaround Ideas

1. **Use clipboard + paste:** Instead of wtype, use `wl-copy` + simulate Ctrl+V
2. **Character-by-character with key codes:** Use `wtype -k space` for spaces
3. **Use ydotool:** Alternative typing daemon that might not have this issue
4. **Shell wrapper:** Write text to temp file and use shell script to call wtype

## Environment

- OS: Arch Linux (Linux 6.18.3-arch1-1)
- Wayland compositor: Hyprland
- wtype version: (check with `wtype --version` if available)
- Bun version: (check with `bun --version`)
