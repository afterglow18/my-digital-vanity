#!/usr/bin/env python3
"""
Patches Main.storyboard to use MyViewController (module App) instead of
CAPBridgeViewController (module Capacitor).

Uses a single regex substitution that matches the entire custom-class/module
attribute group and rewrites it atomically — so there is never a moment
where both old and new attributes coexist and ibtool can never see a
duplicate customModule.
"""
import re, sys, os

storyboard = 'artifacts/outfit-generator/ios/App/App/Base.lproj/Main.storyboard'
if not os.path.exists(storyboard):
    print(f'ERROR: {storyboard} not found', file=sys.stderr)
    sys.exit(1)

content = open(storyboard).read()
print('--- Main.storyboard (first 1000 chars) ---')
print(content[:1000])
print('---')

if 'MyViewController' in content:
    print('Storyboard already uses MyViewController — skipping.')
    sys.exit(0)

if 'CAPBridgeViewController' not in content:
    print('ERROR: CAPBridgeViewController not found in storyboard', file=sys.stderr)
    print(content, file=sys.stderr)
    sys.exit(1)

# Match the full custom-class / custom-module attribute group regardless of
# attribute ordering or whitespace between them.  Replace atomically so no
# attribute is ever duplicated.
PATTERN = re.compile(
    r'customClass="CAPBridgeViewController"'
    r'(\s+customModule="Capacitor")?'
    r'(\s+customModuleProvider="target")?'
)
REPLACEMENT = (
    'customClass="MyViewController"'
    ' customModule="App"'
    ' customModuleProvider="target"'
)

patched, n = PATTERN.subn(REPLACEMENT, content)

if n == 0:
    print('ERROR: regex found no match in storyboard', file=sys.stderr)
    print(content, file=sys.stderr)
    sys.exit(1)

open(storyboard, 'w').write(patched)
print(f'Main.storyboard patched ({n} substitution(s)):')
for i, line in enumerate(patched.splitlines(), 1):
    if 'MyViewController' in line or 'customModule' in line or 'customClass' in line:
        print(f'  L{i}: {line.strip()}')
print('Done ✓')
