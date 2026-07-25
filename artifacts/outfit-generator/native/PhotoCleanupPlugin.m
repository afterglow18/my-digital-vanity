/**
 * PhotoCleanupPlugin.m
 *
 * Registers PhotoCleanupPlugin with the Capacitor bridge via the CAP_PLUGIN
 * macro.  This file is auto-discovered by Capacitor — no AppDelegate changes
 * are required.
 */
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PhotoCleanupPlugin, "PhotoCleanup",
    CAP_PLUGIN_METHOD(processPhoto, CAPPluginReturnPromise);
)
