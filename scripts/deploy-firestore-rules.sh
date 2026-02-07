#!/bin/bash

# ORBIT — Deploy Firestore Security Rules
# Run: npm run deploy:rules

echo "🔥 Deploying Firestore Rules to orbit-9e0b6..."

# Check if firebase-tools is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Login check
if ! firebase projects:list &> /dev/null; then
    echo "🔐 Please login to Firebase..."
    firebase login
fi

# Deploy rules
echo "📤 Deploying rules..."
firebase deploy --only firestore:rules --project orbit-9e0b6

echo "✅ Firestore Rules deployed!"
echo "📊 Analytics events will now sync to Firestore."
