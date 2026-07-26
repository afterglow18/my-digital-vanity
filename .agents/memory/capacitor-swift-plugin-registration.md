---
name: Capacitor Swift plugin registration — DO NOT USE
description: Why the native Swift plugin approach was abandoned and what to use instead.
---

## Current approach: @imgly/background-removal (JS/WASM)

Background removal now uses `@imgly/background-removal` — a pure JS/WASM library that
works in WKWebView (Capacitor iOS), browsers, and Android with zero native code.

```typescript
// src/lib/backgroundRemoval.ts
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
// model: "isnet_fp16" — valid values: "isnet" | "isnet_fp16" | "isnet_quint8"
// Do NOT use "small" or "medium" — not valid in v1.7
```

Vite config **must** have:
```ts
optimizeDeps: { exclude: ['@imgly/background-removal'] }
```
Without this, Vite crashes pre-bundling the library (dynamic WASM imports).

**Why:** Native Swift/CAP_PLUGIN approach was abandoned after persistent failures:
- Swift classes inside dynamic frameworks use lazy ObjC registration — never found by Capacitor's objc_getClassList
- `registerPluginInstance()` registers under Swift class name "PhotoCleanupPlugin", JS bridge looks for "PhotoCleanup" — names never match, every call threw
- Storyboard patching (MyViewController) caused repeated ibtool "Attribute customModule redefined" errors
- CAP_PLUGIN macro + .m file compiled fine but still had the lazy-registration problem at runtime

## What does NOT work (do not retry)
| Attempted approach | Why it fails |
|---|---|
| `bridge?.registerPluginInstance(PhotoCleanupPlugin())` | Registers under class name, not JS name — permanent mismatch |
| `CAP_PLUGIN` macro + ObjC .m file | Lazy ObjC registration in dynamic frameworks; not found by Capacitor |
| Subclass `CAPBridgeViewController`, patch storyboard | ibtool errors + same lazy-registration problem |
| `CAPBridge.register(pluginClass:withName:)` | Method does not exist |
| `CAPBridgeViewController.registerPlugin(_:)` | Method does not exist |

## Native Swift files
`native/PhotoCleanupPlugin.swift` and `native/PhotoCleanupPlugin.m` remain in the
repo but are NOT used in the active build pipeline. The codemagic inject step
no longer copies them.
