#!/usr/bin/env python3
"""
Strips any stale PhotoCleanupPlugin registration lines from AppDelegate.swift.

Plugin registration is now handled entirely by MyViewController.capacitorDidLoad()
via bridge?.registerPluginInstance(). AppDelegate.swift should have no plugin
registration calls — this script is a safety net in case a previous CI run
or manual edit left a stale line behind.
"""
import sys, os

path = 'artifacts/outfit-generator/ios/App/App/AppDelegate.swift'
if not os.path.exists(path):
    print(f'ERROR: {path} not found', file=sys.stderr)
    sys.exit(1)

content = open(path).read()

stale_markers = [
    'CAPBridge.register(',
    'CAPBridgeViewController.registerPlugin(',
    'PhotoCleanupPlugin',
]

lines = content.splitlines(keepends=True)
cleaned = [l for l in lines if not any(m in l for m in stale_markers)]

if len(cleaned) == len(lines):
    print('AppDelegate.swift is clean — no stale registration lines found ✓')
else:
    removed = len(lines) - len(cleaned)
    open(path, 'w').write(''.join(cleaned))
    print(f'AppDelegate.swift: removed {removed} stale registration line(s) ✓')
