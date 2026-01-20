# Plan: Add ydotool as Keyboard Automation Backend

## Problem
wtype is dropping spaces even with the `-k space` workaround in `src/output/typer.ts`.

## Solution
Add ydotool support as an alternative typing backend. ydotool works at the kernel level via uinput, bypassing compositor-specific issues.

---

## Manual Setup Required (User)

Before testing the implementation, ensure ydotool is set up:

```bash
# 1. Install ydotool
pacman -S ydotool

# 2. Add yourself to the input group
sudo usermod -aG input $USER

# 3. Log out and log back in (required for group membership)

# 4. Enable and start the ydotool daemon
systemctl --user enable --now ydotool

# 5. Verify daemon is running
systemctl --user status ydotool

# 6. Test it works (focus a text field first, e.g., a terminal or text editor)
ydotool type "hello world"
```

---

## Implementation Steps

### Step 1: Update `src/config/schema.ts`

**Changes:**
- Line 21: Add "ydotool" to paste_method enum
- Line 73: Add "ydotool" to Config interface type

**Before:**
```typescript
paste_method: z.enum(["wtype", "clipboard-only"]).optional(),
```

**After:**
```typescript
paste_method: z.enum(["wtype", "ydotool", "clipboard-only"]).optional(),
```

**Verification:**
```bash
bun run typecheck
```
Expected: Type error in `defaults.ts` (fixed in Step 2)

---

### Step 2: Update `src/config/defaults.ts`

**Changes:**
- Line 19: Change default paste_method from "wtype" to "ydotool"

**Before:**
```typescript
paste_method: "wtype",
```

**After:**
```typescript
paste_method: "ydotool",
```

**Verification:**
```bash
bun run typecheck
```
Expected: Pass (schema and defaults now match)

---

### Step 3: Update `src/output/typer.ts`

**Changes:**
1. Add `YdotoolNotFoundError` class (similar to WtypeNotFoundError)
2. Add `typeWithYdotool()` function
3. Modify `typeText()` to accept `method` parameter and dispatch
4. Add `checkYdotoolAvailable()` function
5. Keep existing wtype code for backward compatibility

**New exports:**
- `YdotoolNotFoundError`
- `checkYdotoolAvailable()`
- Updated `typeText(text, options)` where options includes `method?: "wtype" | "ydotool"`

**ydotool command:**
```bash
ydotool type --delay <ms> -- "text with spaces"
```

**Verification:**
```bash
bun test src/output/typer.test.ts
```
Expected: All existing tests pass, new ydotool tests pass

---

### Step 4: Update `src/output/typer.test.ts`

**Changes:**
1. Import new `YdotoolNotFoundError` and `checkYdotoolAvailable`
2. Add tests for `YdotoolNotFoundError` class
3. Add tests for `checkYdotoolAvailable()`
4. Add tests for `typeText()` with ydotool method

**Verification:**
```bash
bun test src/output/typer.test.ts
```
Expected: All tests pass

---

### Step 5: Update `src/doctor/index.ts`

**Changes:**
1. Add `checkYdotool()` function (check `ydotool --version`)
2. Add ydotool to `runDoctorChecks()` parallel checks
3. Add to dependencies array

**checkYdotool pattern:**
```typescript
export async function checkYdotool(): Promise<DependencyCheck> {
  const result = await runCommand("ydotool", ["--version"]);
  // ... similar to checkWtype but ydotool has --version
}
```

**Install hints:**
- Arch: `pacman -S ydotool`
- Ubuntu/Debian: `apt install ydotool`
- Fedora: `dnf install ydotool`

**Verification:**
```bash
bun test src/doctor/index.test.ts
```
Expected: Doctor tests pass

```bash
bun run src/index.ts doctor
```
Expected: Shows ydotool status (ok if installed, missing if not)

---

### Step 6: Update `src/daemon/server.ts`

**Changes:**
1. Line 44-47: Import `YdotoolNotFoundError` from typer
2. Line 96: Update `OutputConfig.pasteMethod` type to include "ydotool"
3. Line 216: Update `DEFAULT_OUTPUT_CONFIG.pasteMethod` to "ydotool"
4. Line 537: Update condition to handle both "wtype" and "ydotool"
5. Line 539: Pass method to `typeText(text, { method: this.outputConfig.pasteMethod })`
6. Line 543-546: Handle `YdotoolNotFoundError`

**Verification:**
```bash
bun test src/daemon/server.test.ts
```
Expected: Daemon tests pass

---

### Step 7: Update `config.example.toml`

**Changes:**
- Line 22-23: Update paste_method comment and default

**Before:**
```toml
# Paste method: "wtype" (types into focused window) or "clipboard-only"
paste_method = "wtype"
```

**After:**
```toml
# Paste method: "ydotool" (types via uinput), "wtype" (Wayland), or "clipboard-only"
paste_method = "ydotool"
```

**Verification:** Manual review

---

## Verification Gameplan

### Phase 1: Type Safety (Autonomous)
```bash
bun run typecheck
```
Expected: No errors

### Phase 2: Unit Tests (Autonomous)
```bash
bun test
```
Expected: All tests pass

### Phase 3: Doctor Check (Autonomous)
```bash
bun run src/index.ts doctor
```
Expected: Shows ydotool in dependency list

### Phase 4: Integration Test (User Required)

After all code changes, the user should:

1. Ensure ydotool daemon is running:
   ```bash
   systemctl --user status ydotool
   ```

2. Start whispertui daemon:
   ```bash
   whispertui daemon
   ```

3. In another terminal, with cursor in a text field:
   ```bash
   whispertui start
   # speak: "hello world with spaces"
   whispertui stop
   ```

4. Verify the typed output has proper spaces.

---

## Files Modified Summary

| File | Lines Changed | Test Command |
|------|---------------|--------------|
| `src/config/schema.ts` | 2 (line 21, 73) | `bun run typecheck` |
| `src/config/defaults.ts` | 1 (line 19) | `bun run typecheck` |
| `src/output/typer.ts` | ~60 new lines | `bun test src/output/typer.test.ts` |
| `src/output/typer.test.ts` | ~40 new lines | `bun test src/output/typer.test.ts` |
| `src/doctor/index.ts` | ~30 new lines | `bun test src/doctor/index.test.ts` |
| `src/daemon/server.ts` | ~10 lines | `bun test src/daemon/server.test.ts` |
| `config.example.toml` | 2 (line 22-23) | Manual |

---

## Rollback

If ydotool doesn't work for the user, they can switch back:

```toml
[output]
paste_method = "wtype"
```

Or disable auto-typing entirely:

```toml
[output]
paste_method = "clipboard-only"
```
