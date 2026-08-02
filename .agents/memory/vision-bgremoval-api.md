---
name: Vision background removal API quirk + Capacitor plugin registration
description: CVPixelBuffer wrapping required; CAP_PLUGIN macro is the only reliable registration path for Swift pod plugins
---

`VNGenerateForegroundInstanceMaskRequest.generateMaskedImage(ofInstances:from:croppedToInstancesExtent:)` returns **`CVPixelBuffer`**, not `CIImage`.

**Why:** Apple's public docs say "returns a pixel buffer" but the name implies image. Easy to assume wrong type.

**How to apply:** Always bridge through `CIImage(cvPixelBuffer:)` before calling `CIContext.createCGImage`:

```swift
let pixelBuffer = try result.generateMaskedImage(
    ofInstances: result.allInstances,
    from: handler,
    croppedToInstancesExtent: false
)
let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
let context = CIContext()
guard let cgOut = context.createCGImage(ciImage, from: ciImage.extent) else { ... }
```

---

## Plugin registration — only reliable path: CAP_PLUGIN macro in ObjC

**Why:** Swift classes inside dynamic pod frameworks use lazy ObjC registration (Swift 5.7+). Capacitor's auto-discovery (`objc_getClassList` scan) never finds them. This affects BOTH the plugin class AND any custom `CAPBridgeViewController` subclass you put in the pod.

**Do NOT use:**
- xcodeproj gem file injection (class not in ObjC runtime, plugin reported as "not implemented on ios")
- Custom `CAPBridgeViewController` subclass + storyboard patch (the subclass has the same lazy-registration problem — iOS can't find the class, app crashes to black screen on launch)

**Correct fix:** Add a `PluginName.m` ObjC file alongside the Swift file with the `CAP_PLUGIN` macro:

```objc
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(BackgroundRemovalPlugin, "BackgroundRemoval",
    CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(removeBackground, CAPPluginReturnPromise);
)
```

The macro generates a `+load` method which the ObjC runtime calls **eagerly** when the framework loads — before Capacitor scans for plugins. This is how every first-party Capacitor plugin (`@capacitor/camera`, `@capacitor/filesystem`, etc.) works.

**How to apply:** The podspec `source_files` must include both `*.swift` and `*.m`. The pod must be a local CocoaPod declared with `s.dependency 'Capacitor'` and linked via a workspace npm package with `"capacitor": { "ios": { "src": "." } }` in its `package.json` so `cap sync` auto-discovers and Podfile-links it.
