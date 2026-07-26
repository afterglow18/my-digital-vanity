#!/usr/bin/env python3
"""
Patches Main.storyboard to use MyViewController as the custom class
for the Capacitor bridge view controller scene, instead of the default
CAPBridgeViewController. This is required so capacitorDidLoad() fires
and our local plugin instances get registered via bridge?.registerPluginInstance().

Strategy: two independent attribute substitutions so we never introduce
duplicate attributes (the earlier fallback path appended customModule="App"
without removing the existing customModule="Capacitor", causing
"Attribute customModule redefined" from ibtool).
"""
import sys, os

storyboard = 'artifacts/outfit-generator/ios/App/App/Base.lproj/Main.storyboard'
if not os.path.exists(storyboard):
    print(f'ERROR: {storyboard} not found', file=sys.stderr)
    sys.exit(1)

content = open(storyboard).read()
print('--- Main.storyboard (first 800 chars) ---')
print(content[:800])
print('---')

if 'MyViewController' in content:
    print('Storyboard already uses MyViewController — skipping.')
    sys.exit(0)

if 'CAPBridgeViewController' not in content:
    print('ERROR: CAPBridgeViewController not found in storyboard', file=sys.stderr)
    print(content, file=sys.stderr)
    sys.exit(1)

# Replace just the class name — keeps the rest of the line intact
patched = content.replace(
    'customClass="CAPBridgeViewController"',
    'customClass="MyViewController"',
)
# Replace the module so the storyboard points at the App target, not Capacitor
patched = patched.replace(
    'customModule="Capacitor"',
    'customModule="App"',
)

if patched == content:
    print('ERROR: substitutions produced no change', file=sys.stderr)
    sys.exit(1)

open(storyboard, 'w').write(patched)
print('Main.storyboard patched:')
for i, line in enumerate(patched.splitlines(), 1):
    if 'MyViewController' in line or 'customModule' in line:
        print(f'  L{i}: {line.strip()}')
print('Done ✓')
