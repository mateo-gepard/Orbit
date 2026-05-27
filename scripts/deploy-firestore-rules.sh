#!/bin/bash
set -euo pipefail

PROJECT_ARG=()
if [ -n "${FIREBASE_PROJECT_ID:-}" ]; then
  PROJECT_ARG=(--project "$FIREBASE_PROJECT_ID")
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI not found. Install it with: npm install -g firebase-tools"
  exit 1
fi

echo "Deploying Firestore and Storage rules..."
firebase deploy --only firestore:rules,storage "${PROJECT_ARG[@]}"
echo "Rules deployed."
