---
name: Capacitor Swift plugin registration
description: Definitive approach for registering a local Capacitor plugin in a pure-Swift iOS project — and every API that does NOT exist.
---

## The rule
Register via the ObjC `.m` file containing the `CAP_PLUGIN` macro.  This is
the only approach confirmed to work end-to-end on a real device.

```objc
// PhotoCleanupPlugin.m
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PhotoCleanupPlugin, "PhotoCleanup",
    CAP_PLUGIN_METHOD(processPhoto, CAPPluginReturnPromise);
)
```

**Why:** The JS bridge dispatches calls keyed on the JS plugin name `"PhotoCleanup"`
(set by `registerPlugin("PhotoCleanup", ...)`).  `registerPluginInstance()` registers
the plugin under the Swift/ObjC *class* name `"PhotoCleanupPlugin"` — the names
never match, so every call throws and the UNAVAILABLE error state appears.
The `CAP_PLUGIN` macro explicitly maps class → JS name and declares each bridged
method, which is what the bridge actually uses.

**How to apply:** Copy both `PhotoCleanupPlugin.swift` and `PhotoCleanupPlugin.m`
into `ios/App/App/` in CI, then add both to the Xcode compile build phase via
`add_to_xcodeproj.rb`.  No storyboard patching or custom view controller needed.

## What does NOT work
| Attempted call | Result |
|---|---|
| `CAPBridge.register(pluginClass:withName:)` | compile error: no member 'register' |
| `CAPBridgeViewController.registerPlugin(_:)` | compile error: no member 'registerPlugin' |
| `bridge?.registerPluginInstance(PhotoCleanupPlugin())` in `MyViewController.capacitorDidLoad()` | compiles and runs but JS name mismatch → bridge throws on every call |

## CI implementation (codemagic_scripts/)
The `ios/` folder is `rm -rf`'d and recreated fresh on every build via
`cap add ios && cap sync ios`. The inject step:
1. Copies `native/PhotoCleanupPlugin.swift` into `ios/App/App/`
2. Copies `native/PhotoCleanupPlugin.m` into `ios/App/App/`
3. Runs `add_to_xcodeproj.rb` — adds both files to the App target compile phase

No storyboard patching, no custom view controller, no AppDelegate injection needed.
