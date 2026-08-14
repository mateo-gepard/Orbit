#!/bin/bash

# ═══════════════════════════════════════════════════════════
# Threadmap — Firebase Setup Script
# ═══════════════════════════════════════════════════════════

echo "🚀 Threadmap Firebase Setup"
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✅ .env.local bereits vorhanden"
    echo ""
    echo "Möchtest du die Firebase-Config neu setzen? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "❌ Setup abgebrochen"
        exit 0
    fi
fi

echo ""
echo "📋 Gehe zu: https://console.firebase.google.com"
echo ""
echo "1. Erstelle ein neues Projekt (oder wähle ein bestehendes)"
echo "2. Füge eine Web-App hinzu (</> Icon)"
echo "3. Kopiere die Firebase Config Werte"
echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Collect Firebase config
read -p "Firebase API Key: " api_key
read -p "Auth Domain (z.B. threadmap-xyz.firebaseapp.com): " auth_domain
read -p "Project ID: " project_id
read -p "Storage Bucket (z.B. threadmap-xyz.appspot.com): " storage_bucket
read -p "Messaging Sender ID: " sender_id
read -p "App ID: " app_id

# Create .env.local
cat > .env.local << EOF
# ═══════════════════════════════════════════════════════════
# Threadmap — Firebase Configuration
# ═══════════════════════════════════════════════════════════
# Generated: $(date)

NEXT_PUBLIC_FIREBASE_API_KEY=$api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=$project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=$app_id
EOF

echo ""
echo "✅ .env.local erstellt!"
echo ""
echo "─────────────────────────────────────────────────────────"
echo "📝 Nächste Schritte:"
echo ""
echo "1. Firebase Console → Authentication → Google aktivieren"
echo "2. Firebase Console → Firestore → Database erstellen"
echo "3. Firestore Rules setzen (siehe BACKEND_SETUP.md)"
echo "4. Dev Server neu starten: npm run dev"
echo ""
echo "─────────────────────────────────────────────────────────"
echo ""
echo "🎯 Fertig! Viel Erfolg mit Threadmap!"
