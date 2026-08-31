#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════
# Threadmap — Firebase Storage CORS Configuration
# ═══════════════════════════════════════════════════════════

echo "🔧 Configuring Firebase Storage CORS..."

STAGING_PROJECT="threadmap-staging-9e0b6"
PRODUCTION_PROJECT="orbit-9e0b6"
STAGING_BUCKET="threadmap-staging-9e0b6.firebasestorage.app"
PRODUCTION_BUCKET="orbit-9e0b6.firebasestorage.app"
PROJECT_ID="${1:-${THREADMAP_FIREBASE_PROJECT:-$STAGING_PROJECT}}"

if [[ "$PROJECT_ID" != "$STAGING_PROJECT" && "$PROJECT_ID" != "$PRODUCTION_PROJECT" ]]; then
    echo "❌ Project must be $STAGING_PROJECT or $PRODUCTION_PROJECT"
    exit 1
fi
if [[ "$PROJECT_ID" == "$PRODUCTION_PROJECT" ]]; then
    BUCKET_NAME="$PRODUCTION_BUCKET"
    CORS_FILE="storage-cors.json"
else
    BUCKET_NAME="$STAGING_BUCKET"
    CORS_FILE="storage-cors.staging.json"
fi
if [[ "$PROJECT_ID" == "$PRODUCTION_PROJECT" && "${THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION:-}" != "$PRODUCTION_PROJECT" ]]; then
    echo "❌ Production change refused. Set THREADMAP_PRODUCTION_DEPLOY_CONFIRMATION=$PRODUCTION_PROJECT"
    exit 1
fi
if [[ "$PROJECT_ID" == "$PRODUCTION_PROJECT" ]]; then
    node scripts/guarded-firebase-deploy.mjs --project "$PROJECT_ID" --check-only
fi

# Check if gcloud CLI is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud SDK (gcloud) is not installed."
    echo ""
    echo "📦 Install it from: https://cloud.google.com/sdk/docs/install"
    echo ""
    echo "Or using Homebrew:"
    echo "  brew install google-cloud-sdk"
    exit 1
fi

echo "📦 Project: $PROJECT_ID"
echo "🗄️  Bucket: $BUCKET_NAME"
echo "📄 CORS policy: $CORS_FILE"
echo ""

ACTUAL_BUCKET="$(gcloud storage buckets describe "gs://$BUCKET_NAME" \
    --project="$PROJECT_ID" \
    --format='value(name)')"
if [[ "$ACTUAL_BUCKET" != "$BUCKET_NAME" && "$ACTUAL_BUCKET" != "gs://$BUCKET_NAME" ]]; then
    echo "❌ Target validation failed: gcloud resolved '${ACTUAL_BUCKET:-nothing}' instead of $BUCKET_NAME"
    exit 1
fi
EXPECTED_PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
ACTUAL_PROJECT_NUMBER="$(gcloud storage buckets describe "gs://$BUCKET_NAME" \
    --project="$PROJECT_ID" \
    --format='value(projectNumber)')"
if [[ -z "$EXPECTED_PROJECT_NUMBER" || "$ACTUAL_PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]]; then
    echo "❌ Bucket ownership validation failed for project $PROJECT_ID."
    exit 1
fi

# Apply CORS configuration
echo "⚙️  Applying CORS configuration..."
if gcloud storage buckets update "gs://$BUCKET_NAME" \
    --project="$PROJECT_ID" \
    --cors-file="$CORS_FILE"; then
    if ! gcloud storage buckets describe "gs://$BUCKET_NAME" \
        --project="$PROJECT_ID" \
        --format=json | node scripts/verify-storage-cors.mjs "$CORS_FILE"; then
        echo "❌ The bucket did not report the expected CORS policy after update."
        exit 1
    fi
    echo ""
    echo "✅ CORS configuration applied and read-back verified."
else
    echo ""
    echo "❌ Failed to apply CORS configuration."
    echo ""
    echo "🔑 Make sure you're authenticated:"
    echo "   gcloud auth login"
    echo ""
    echo "📝 And set the correct project:"
    echo "   gcloud config set project $PROJECT_ID"
    exit 1
fi
