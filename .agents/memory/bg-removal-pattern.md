---
name: Background removal — authoritative implementation pattern
description: The exact pattern (generation counter, phase order, AnimatePresence config) that makes background removal work correctly across all photos, not just the first one.
---

## The pattern (My Digital Vanity — QuickAddSheet)

```
pick ──(file chosen)──► encoding ──► preview ──► uploading ──► close
```

### Critical rules — all required

**1. Generation counter (bgGenRef)**
```javascript
const bgGenRef = useRef(0);
const myGen = ++bgGenRef.current;  // bump at start of handleFile
// check before every state write after an await:
if (bgGenRef.current !== myGen) return;
// bump when cancelling (close/retake/select):
bgGenRef.current += 1;
setBgProcessing(false);  // MUST also reset or next open has Save disabled
```
Without this, a slow first removal fires `setBgProcessing(false)` on the second photo's state, silently killing the spinner and potentially overwriting the cleaned image.

**2. Switch to "encoding" BEFORE the first await**
```javascript
setPhase("encoding");         // instant feedback
// THEN:
const png = await encodeToPng(file);  // 1-3 s
```
Skipping this leaves the pick screen frozen for 1-3 s — looks like a crash on device.

**3. Switch to "preview" as soon as original is encoded**
```javascript
setOriginalDataUrl(origDataUrl);
setPhase("preview");          // compare screen appears NOW
// background removal starts here, still awaiting:
setBgProcessing(true);
const cleanedUrl = await removeBackground(origDataUrl);
```
The user sees their photo immediately. The Cleaned slot shows a spinner until removal finishes.

**4. AnimatePresence — exact config**
```jsx
<AnimatePresence mode="wait" initial={false}>
  <motion.div key="encoding" ... transition={{ duration: 0.12 }}>
  <motion.div key="preview"  ... transition={{ duration: 0.12 }}>
  <motion.div key="uploading"... transition={{ duration: 0.12 }}>
```
- `mode="wait"` — NOT sync. Sync collapses flex children during simultaneous transitions → blank screen.
- `initial={false}` — prevents the pick screen fading in from opacity 0 on every open.
- `transition={{ duration: 0.12 }}` — default spring takes ~400 ms; three phase gaps × 400 ms = looks like a crash.

**5. Reset bgProcessing in every close/cancel path**
```javascript
bgGenRef.current += 1;
setBgProcessing(false);
// then reset other state and call onOpenChange(false)
```
`useState` persists across open/close when the component returns null instead of unmounting. Forgetting this leaves the next open with Save disabled and no explanation.

## Multi-file path

For batch uploads and retries, skip the compare screen entirely:
```javascript
if (files.length === 1) {
  await handleFile(files[0]);  // compare flow
  return;
}
// multiple files: encode + save directly, no removal
for (...) await handleFileDirect(files[i], i);
```

## PhotoCompareSheet — bgProcessing prop

Three states for the Cleaned card:
1. `cleanedDataUrl && !cleanupError` → selectable image
2. `bgProcessing && !cleanupError` → checkerboard + Loader2 spinner
3. error → Sparkles icon + "Unavailable"

`chosen` state initialises to `"original"`, auto-switches to `"cleaned"` via useEffect when `cleanedDataUrl` arrives.
Save button disabled when `bgProcessing`; label shows "Processing…".

## Why the first photo worked but second didn't (root cause)

First use: model downloads (~15 MB) + WASM initialises → removal takes 30-60 s.
React rendered "cleaning" fully before "comparing" was set.

Second use: cached model + warm WASM worker → removal is near-instant.
React batched `setPhase("cleaning")` + `setPhase("comparing")` into one render.
`AnimatePresence mode="wait"` held the entering element while exiting "pick".
A concurrent re-render from `queryClient.invalidateQueries` mid-exit caused
Framer Motion to drop the queued "comparing" entry entirely.

Fix: the encoding phase now always takes 1-3 s (canvas resize), so `mode="wait"`
always has time to complete the exit before "preview" enters.
