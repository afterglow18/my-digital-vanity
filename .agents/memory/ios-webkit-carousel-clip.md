---
name: iOS WebKit carousel clipping
description: How to keep carousel cards inside a mirror-frame boundary on iOS WebKit
---

## Rule
Do NOT rely on `overflow: hidden`, `clip-path`, or `transform: translateZ(0)` to clip CSS-transformed children on iOS WebKit — none of them work reliably on device (they work in the web preview but fail in Capacitor/TestFlight).

## Working solution
Physically inset the carousel container so side cards cannot physically reach the boundary, rather than relying on CSS clipping:

```js
const carInset = pW(ir, 0.055); // 5.5% of image width each side
const carLeft2 = carLeft + carInset;
const carW2    = carW - carInset * 2;
// Use carLeft2/carW2 for the carousel div; keep carLeft/carW for labels and tap zones
```

**Why:** iOS WebKit composites transformed children (translateX strip + scale cards) on separate GPU layers that ignore ancestor overflow/clip boundaries. Physical inset is the only guarantee.

**How to apply:** Any time a carousel sits over a background image with a visible frame on iOS — use inset, not clip.
