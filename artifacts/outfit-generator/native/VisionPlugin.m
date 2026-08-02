/**
 * VisionPlugin.m
 *
 * Registers VisionPlugin with the Capacitor ObjC bridge under the
 * JavaScript name "Vision".  Exposes analyzeImage() as a promise.
 *
 * The Swift implementation lives in VisionPlugin.swift.
 */

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(VisionPlugin, "Vision",
    CAP_PLUGIN_METHOD(analyzeImage, CAPPluginReturnPromise);
)
