#!/bin/bash
set -euo pipefail

STAGING_PROJECT="threadmap-staging-9e0b6"
PRODUCTION_PROJECT="orbit-9e0b6"
PROJECT_ID="${1:-${FIREBASE_PROJECT_ID:-}}"

if [[ "$PROJECT_ID" != "$STAGING_PROJECT" && "$PROJECT_ID" != "$PRODUCTION_PROJECT" ]]; then
  echo "Usage: $0 {$STAGING_PROJECT|$PRODUCTION_PROJECT}"
  exit 1
fi

if [[ "$PROJECT_ID" == "$PRODUCTION_PROJECT" && "${THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION:-}" != "$PRODUCTION_PROJECT" ]]; then
  echo "Production deployment refused. Set THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=$PRODUCTION_PROJECT."
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI not found. Run npm ci and invoke this script through npm."
  exit 1
fi

if [[ "$PROJECT_ID" == "$PRODUCTION_PROJECT" ]]; then
  exec node scripts/guarded-firebase-deploy.mjs \
    --project "$PROJECT_ID" \
    --only firestore:rules,firestore:indexes,storage
fi

echo "Deploying Firestore indexes/rules and Storage rules to $PROJECT_ID..."
firebase deploy \
  --project "$PROJECT_ID" \
  --only firestore:rules,firestore:indexes,storage
echo "Rules and indexes deployed to $PROJECT_ID."
