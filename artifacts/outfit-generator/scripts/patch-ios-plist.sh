#!/bin/bash
# patch-ios-plist.sh
# Adds NSFaceIDUsageDescription to the iOS Info.plist after `npx cap sync`.
# Run this script in the Codemagic pre-build step, AFTER `npx cap sync ios`.
#
# Usage: bash scripts/patch-ios-plist.sh

set -e

PLIST="ios/App/App/Info.plist"

if [ ! -f "$PLIST" ]; then
  echo "Info.plist not found at $PLIST — run 'npx cap sync ios' first."
  exit 1
fi

# Only add if not already present
if /usr/libexec/PlistBuddy -c "Print :NSFaceIDUsageDescription" "$PLIST" &>/dev/null; then
  echo "NSFaceIDUsageDescription already present — skipping."
else
  /usr/libexec/PlistBuddy -c \
    "Add :NSFaceIDUsageDescription string 'My Digital Vanity uses Face ID to keep your vanity private.'" \
    "$PLIST"
  echo "NSFaceIDUsageDescription added to $PLIST"
fi
