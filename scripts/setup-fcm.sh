#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ORBIT — FCM Background Notifications Setup
# ═══════════════════════════════════════════════════════════
#
# This script sets up Firebase Cloud Messaging (FCM) for
# background push notifications (briefings when app is closed).
#
# Prerequisites:
# - Firebase CLI: npm install -g firebase-tools
# - Logged in: firebase login
# - Blaze (pay-as-you-go) plan enabled on your Firebase project
#   (required for Cloud Functions — free tier is generous)
#
# ═══════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  ORBIT — FCM Background Notifications Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Step 1: Check Firebase CLI
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi
echo "✅ Firebase CLI found"

# Step 2: Check login
firebase projects:list > /dev/null 2>&1 || {
    echo "❌ Not logged in. Run:"
    echo "   firebase login"
    exit 1
}
echo "✅ Firebase login OK"

# Step 3: Generate VAPID keys
echo ""
echo "── Step 1: VAPID Key ─────────────────────────────────────"
echo ""
echo "Go to Firebase Console → Project Settings → Cloud Messaging"
echo "→ Web configuration → Generate key pair"
echo ""
echo "Then add to your .env.local:"
echo ""
echo '  NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_public_key_here'
echo ""
read -p "Press Enter when done..."

# Step 4: Install Cloud Function dependencies
echo ""
echo "── Step 2: Installing Cloud Function dependencies ────────"
cd functions
npm install
cd ..
echo "✅ Functions dependencies installed"

# Step 5: Build the function
echo ""
echo "── Step 3: Building Cloud Function ───────────────────────"
cd functions
npm run build
cd ..
echo "✅ Cloud Function built"

# Step 6: Deploy
echo ""
echo "── Step 4: Deploy ────────────────────────────────────────"
echo ""
echo "Ready to deploy. This will:"
echo "  1. Deploy the Cloud Function (sendBriefingNotifications)"
echo "  2. Create a Cloud Scheduler job (runs every minute)"
echo "  3. Update Firestore rules (fcmTokens collection)"
echo ""
echo "Note: Cloud Functions require the Blaze (pay-as-you-go) plan."
echo "Free tier includes 2M invocations/month — more than enough."
echo ""
read -p "Deploy now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Deploying..."
    firebase deploy --only functions,firestore:rules
    echo ""
    echo "✅ Deployed! Background briefings are now active."
    echo ""
    echo "To verify, check Firebase Console → Functions"
    echo "You should see: sendBriefingNotifications (scheduled)"
else
    echo ""
    echo "Skipped deploy. You can deploy later with:"
    echo "  firebase deploy --only functions,firestore:rules"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Summary:"
echo "  • VAPID key → .env.local"
echo "  • Cloud Function → functions/src/index.ts"
echo "  • FCM client → src/lib/fcm.ts"
echo "  • Firestore rules → fcmTokens collection"
echo ""
echo "  How it works:"
echo "  1. User enables briefings in Settings"
echo "  2. App registers FCM token + schedule in Firestore"
echo "  3. Cloud Function runs every minute, checks schedules"
echo "  4. Sends push notification via FCM at the right time"
echo "  5. Works even when phone is sleeping / app is closed"
echo "═══════════════════════════════════════════════════════════"
