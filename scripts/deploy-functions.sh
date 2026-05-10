#!/usr/bin/env bash
#
# deploy-functions.sh
#
# Builds and deploys the resolveCombat Cloud Function (Phase 3 PvP loop).
# Other functions in functions/src/index.ts (e.g. refillSpins) are NOT deployed
# by this script — pass --all to include them.
#
# Usage:
#   scripts/deploy-functions.sh             # deploys resolveCombat only
#   scripts/deploy-functions.sh --all       # deploys every function in the file
#   scripts/deploy-functions.sh --project X # overrides .firebaserc default
#
# Requires:
#   - firebase-tools installed and authenticated (firebase login)
#   - Run from the repo root or anywhere — the script resolves its own path
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/functions"

TARGET="functions:resolveCombat"
PROJECT_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      TARGET="functions"
      shift
      ;;
    --project)
      PROJECT_ARGS=(--project "$2")
      shift 2
      ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase CLI not found. Install with: npm install -g firebase-tools" >&2
  exit 1
fi

echo "→ Installing functions dependencies"
npm --prefix "$FUNCTIONS_DIR" install --no-audit --no-fund

echo "→ Type-checking + building"
npm --prefix "$FUNCTIONS_DIR" run build

echo "→ Deploying $TARGET"
cd "$REPO_ROOT"
firebase deploy --only "$TARGET" "${PROJECT_ARGS[@]}"

echo "✓ Deploy complete"
