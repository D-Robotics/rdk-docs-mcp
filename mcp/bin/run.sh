#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install --no-fund --no-audit
fi

if [[ ! -f dist/index.js ]]; then
  npm run build
fi

exec node dist/index.js
