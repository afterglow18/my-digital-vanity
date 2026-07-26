---
name: Capacitor Swift plugin registration
description: Definitive approach for registering a local Capacitor plugin in a pure-Swift iOS project — and every API that does NOT exist.
---

## The rule
Register via `bridge?.registerPluginInstance(PhotoCleanupPlugin())` called inside
`capacitorDidLoad()` of a `CAPBridgeViewController` subclass (`MyViewController`).
The storyboard's Capacitor scene must use `MyViewController` as its custom class
for `capacitorDidLoad()` to fire.

**Why:** This is the only public Swift API that actually compiles against the
Capacitor version installed by `cap add ios`. Two guesses both failed at compile time:
- `CAPBridge.register(pluginClass:withName:)` — method does not exist
- `CAPBridgeViewController.registerPlugin(_:)` — method does not exist

## What does NOT work
| Attempted call | Result |
|---|---|
| `CAPBridge.register(pluginClass:withName:)` | compile error: no member 'register' |
| `CAPBridgeViewController.registerPlugin(_:)` | compile error: no member 'registerPlugin' |
| ObjC `.m` file + `CAP_PLUGIN` macro (dropped earlier) | was actually working for registration; payload size was the real bug |

## CI implementation (codemagic_scripts/)
The `ios/` folder is `rm -rf`'d and recreated fresh on every build via
`cap add ios && cap sync ios`. The inject step therefore:
1. Copies `native/MyViewController.swift` into `ios/App/App/`
2. Runs `patch_storyboard.py` — replaces `customClass="CAPBridgeViewController"`
   with `customClass="MyViewController" customModule="App"` in `Main.storyboard`
3. Runs `inject_appdelegate.py` — safety net that strips any stale registration
   lines from `AppDelegate.swift` (AppDelegate needs no plugin registration code)
4. Runs `add_to_xcodeproj.rb` — adds both Swift files to the App target build phase

**Why:** No static Swift registration API exists; the storyboard subclass approach
is the documented Capacitor path and survives `cap sync` regeneration.
