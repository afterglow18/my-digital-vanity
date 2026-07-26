#!/usr/bin/env python3
"""
Patches Main.storyboard to use MyViewController as the custom class
for the Capacitor bridge view controller scene, instead of the default
CAPBridgeViewController. This is required so capacitorDidLoad() fires
and our local plugin instances get registered via bridge?.registerPluginInstance().
"""
import re, sys, os

storyboard = 'artifacts/outfit-generator/ios/App/App/Base.lproj/Main.storyboard'
if not os.path.exists(storyboard):
    print(f'ERROR: {storyboard} not found', file=sys.stderr)
    sys.exit(1)

content = open(storyboard).read()
print('--- Main.storyboard (first 1200 chars) ---')
print(content[:1200])
print('---')

if 'MyViewController' in content:
    print('Storyboard already uses MyViewController — skipping.')
    sys.exit(0)

# Replace customClass="CAPBridgeViewController" customModule="Capacitor"
# with customClass="MyViewController" customModule="App" (same target module)
patched = re.sub(
    r'customClass="CAPBridgeViewController"\s+customModule="Capacitor"\s+customModuleProvider="target"',
    'customClass="MyViewController" customModule="App" customModuleProvider="target"',
    content
)

if patched == content:
    # Fallback: just replace the customClass attribute wherever it appears
    patched = content.replace(
        'customClass="CAPBridgeViewController"',
        'customClass="MyViewController" customModule="App" customModuleProvider="target"'
    )

if patched == content:
    print('ERROR: Could not find CAPBridgeViewController in storyboard', file=sys.stderr)
    print('Full storyboard:', file=sys.stderr)
    print(content, file=sys.stderr)
    sys.exit(1)

open(storyboard, 'w').write(patched)
print('Main.storyboard patched — custom class set to MyViewController ✓')
