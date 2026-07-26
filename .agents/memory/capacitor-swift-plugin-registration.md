---
name: Capacitor Swift plugin registration
description: Correct Swift API for registering a local Capacitor plugin without ObjC — and what does NOT work.
---

## The rule
Use `CAPBridgeViewController.registerPlugin(PhotoCleanupPlugin.self)` — call it inside `application(_:didFinishLaunchingWithOptions:)` in AppDelegate.swift, before `return true`.

`CAPBridge.register(pluginClass:withName:)` does **not** exist and causes a compile error ("type 'CAPBridge' has no member 'register'").

**Why:** We tried `CAPBridge.register(pluginClass:withName:)` based on incorrect assumptions about the API surface; the build confirmed it doesn't exist. `CAPBridgeViewController.registerPlugin(_:)` is the actual static method exposed by Capacitor 5+ for Swift-side plugin registration.

**How to apply:** The injection is done by `codemagic_scripts/inject_appdelegate.py`, which patches AppDelegate.swift at build time (the ios/ folder is regenerated from scratch each CI run via `cap add ios && cap sync ios`). The script is idempotent — it skips patching if 'PhotoCleanupPlugin' is already present.

## What we dropped and why
- ObjC `.m` file with `CAP_PLUGIN` macro: requires ObjC `+load`, which is unavailable in a pure-Swift Capacitor target — plugin was silently never registered.
- Bash heredoc in codemagic.yaml for the Python/Ruby scripts: Codemagic's YAML parser read heredoc body lines starting at column 1 as bare YAML keys and threw a parse error. Fixed by moving scripts to `codemagic_scripts/` files called with `python3 ...` / `ruby ...`.
