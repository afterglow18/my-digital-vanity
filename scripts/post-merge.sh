#!/bin/bash
set -e
# --no-frozen-lockfile so workspace/dependency changes from task merges
# don't fail when the lockfile is stale (e.g. after adding/removing packages).
pnpm install --no-frozen-lockfile
pnpm --filter db push 2>/dev/null || true
