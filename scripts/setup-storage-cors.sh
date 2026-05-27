#!/bin/bash

# ═══════════════════════════════════════════════════════════
# Threadmap — Firebase Storage CORS Configuration
# ═══════════════════════════════════════════════════════════

echo "🔧 Configuring Firebase Storage CORS..."

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

# Get Firebase project ID
PROJECT_ID="orbit-9e0b6"
BUCKET_NAME="${PROJECT_ID}.firebasestorage.app"

echo "📦 Project: $PROJECT_ID"
echo "🗄️  Bucket: $BUCKET_NAME"
echo ""

# Apply CORS configuration
echo "⚙️  Applying CORS configuration..."
gcloud storage buckets update gs://$BUCKET_NAME --cors-file=storage-cors.json

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ CORS configuration applied successfully!"
    echo ""
    echo "📋 Configuration:"
    echo "   - Allowed origins: * (all domains)"
    echo "   - Allowed methods: GET, HEAD, PUT, POST, DELETE"
    echo "   - Max age: 3600 seconds (1 hour)"
    echo ""
    echo "🎉 File uploads and downloads should now work!"
else
    echo ""
    echo "❌ Failed to apply CORS configuration."
    echo ""
    echo "🔑 Make sure you're authenticated:"
    echo "   gcloud auth login"
    echo ""
    echo "📝 And set the correct project:"
    echo "   gcloud config set project $PROJECT_ID"
fi
