/**
 * PhotoCleanupPlugin.m
 *
 * Registers PhotoCleanupPlugin with the Capacitor ObjC bridge under the
 * JavaScript name "PhotoCleanup".  This is the standard Capacitor approach
 * for local plugins — the CAP_PLUGIN macro wires up the class-to-name
 * mapping and declares each bridged method so the JS bridge can dispatch
 * processPhoto() calls to the Swift implementation.
 *
 * The Swift implementation lives in PhotoCleanupPlugin.swift.
 */

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PhotoCleanupPlugin, "PhotoCleanup",
    CAP_PLUGIN_METHOD(processPhoto, CAPPluginReturnPromise);
)
