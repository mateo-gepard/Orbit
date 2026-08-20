#!/bin/bash
set -euo pipefail

echo "scripts/setup-firebase.sh is retired: it previously accepted arbitrary projects and overwrote .env.local."
echo "Copy .env.local.example to .env.local manually, set mode 0600, and fill only the staging project values."
echo "Validate repository deployment configuration with: npm run release:contract && npm run audit:regions"
echo "Use PRODUCTION_READINESS.md for production. The protected workflow is intentionally fail-closed until true staging exists; never place production secrets in .env.local."
exit 1
