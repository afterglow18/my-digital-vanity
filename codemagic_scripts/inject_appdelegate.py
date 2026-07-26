#!/usr/bin/env python3
"""
Patches AppDelegate.swift to register PhotoCleanupPlugin via
CAPBridgeViewController.registerPlugin(_:) — the correct public Swift API
in Capacitor 5+. CAPBridge.register(pluginClass:withName:) does not exist;
CAPBridgeViewController.registerPlugin(_:) is the static method that does.
"""
import re, sys

path = 'artifacts/outfit-generator/ios/App/App/AppDelegate.swift'
try:
    content = open(path).read()
except FileNotFoundError:
    print(f'ERROR: {path} not found', file=sys.stderr)
    sys.exit(1)

print('--- AppDelegate.swift (first 800 chars) ---')
print(content[:800])
print('---')

# Skip if already patched (idempotent re-runs)
if 'PhotoCleanupPlugin' in content:
    print('AppDelegate.swift already contains PhotoCleanupPlugin registration — skipping.')
    sys.exit(0)

registration = '        CAPBridgeViewController.registerPlugin(PhotoCleanupPlugin.self)\n'

# Match the body of didFinishLaunchingWithOptions up to its "return true"
patched, n = re.subn(
    r'(func application\(_ application: UIApplication, didFinishLaunchingWithOptions'
    r'[^{]*\{[^}]*)return true',
    r'\g<1>' + registration + '        return true',
    content,
    count=1
)

if n == 0:
    print('WARNING: primary pattern did not match — trying simpler pattern')
    patched, n = re.subn(
        r'(// Override point for customization after application launch\.\n\s+)return true',
        r'\g<1>' + registration.lstrip() + '        return true',
        content,
        count=1
    )

if n == 0:
    print('ERROR: Could not find insertion point in AppDelegate.swift', file=sys.stderr)
    print('Full file:', file=sys.stderr)
    print(content, file=sys.stderr)
    sys.exit(1)

open(path, 'w').write(patched)
print('AppDelegate.swift patched — registration line added:')
for i, line in enumerate(patched.split('\n'), 1):
    if 'PhotoCleanup' in line or 'didFinishLaunch' in line:
        print(f'  L{i}: {line}')
print('Done ✓')
