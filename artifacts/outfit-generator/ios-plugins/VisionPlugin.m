/**
 * VisionPlugin.m — ObjC bridge registration.
 *
 * After running `npx cap add ios && npx cap sync`, copy this file to:
 *   ios/App/App/VisionPlugin.m
 * and add it to the Xcode target (Build Phases → Compile Sources).
 */

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(VisionPlugin, "VisionPlugin",
    CAP_PLUGIN_METHOD(analyzeImage, CAPPluginReturnPromise);
)
