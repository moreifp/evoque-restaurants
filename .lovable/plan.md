

## Fix: Camera Photo Not Uploading on iOS Native (Despia WebView)

### Root Cause

The app creates a file input via `document.createElement('input')` and immediately calls `.click()` without attaching it to the DOM. On iOS WebView, when the camera opens, the app goes to background. iOS can garbage-collect the detached input element, so when the user returns with the photo, the `onchange` event never fires — the photo is silently lost.

This is a well-known iOS Safari/WebView bug with dynamically created, unattached input elements.

### Fix

In `src/components/UnifiedMediaUpload.tsx`, modify `handleFileSelect` to:

1. **Attach the input to the DOM** before calling `.click()` (hidden with `display: none`)
2. **Remove it from the DOM** after the `onchange` fires or on cancel
3. **Add a `blur`/`focus` fallback** — if the user returns from the camera and `onchange` never fires within a timeout, show a toast suggesting retry
4. **Add diagnostic logging** for iOS camera flow: log file details (name, type, size) when received to help debug future issues

### Files to Change

| File | Change |
|---|---|
| `src/components/UnifiedMediaUpload.tsx` | Append input to `document.body`, remove after use; add focus-based cancel detection; add iOS file logging |

### Technical Detail

```text
Before (broken on iOS):
  createElement('input') → .click() → [iOS camera opens, input GC'd] → onchange never fires

After (fix):
  createElement('input') → body.appendChild(input) → .click() → [iOS camera opens, input persists] → onchange fires → body.removeChild(input)
```

