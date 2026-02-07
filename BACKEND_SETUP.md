# 🚀 ORBIT — Backend Setup Guide

## Übersicht

ORBIT läuft **bereits lokal** ohne Backend (Demo-Modus mit localStorage). 
Für **echte Cloud-Synchronisation** über mehrere Geräte brauchst du Firebase.

---

## 1️⃣ Firebase Projekt erstellen (5 Minuten)

### Schritt 1: Firebase Console öffnen
1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com)
2. Klicke **"Add project"** / **"Projekt hinzufügen"**
3. Name: **ORBIT** (oder beliebig)
4. Google Analytics: **Optional** (kannst du überspringen)
5. Warte bis das Projekt erstellt ist

### Schritt 2: Web-App registrieren
1. Im Firebase Dashboard: Klicke auf das **Web-Icon** `</>`
2. App-Nickname: **ORBIT Web**
3. Firebase Hosting: **Nein** (nicht nötig)
4. Klicke **"Register app"**

Du bekommst jetzt ein Code-Snippet mit deinen Firebase-Config-Werten:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "orbit-xyz.firebaseapp.com",
  projectId: "orbit-xyz",
  storageBucket: "orbit-xyz.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

**⚠️ Diese Werte brauchst du gleich!**

---

## 2️⃣ Firebase Services aktivieren

### Authentication (Google Sign-In)
1. In der linken Sidebar: **Build → Authentication**
2. Klicke **"Get started"**
3. Tab **"Sign-in method"**
4. Aktiviere **Google** (Klicke auf "Google" → Toggle auf "Enabled" → Save)

### Firestore Database
1. In der linken Sidebar: **Build → Firestore Database**
2. Klicke **"Create database"**
3. Wähle **"Start in production mode"** (wir setzen gleich eigene Regeln)
4. Location: Wähle die Region am nächsten zu dir (z.B. **europe-west3** für Deutschland)
5. Klicke **"Enable"**

---

## 3️⃣ Umgebungsvariablen setzen

### Erstelle `.env.local` im Projektordner:

```bash
# Im Terminal:
cd /Users/mateomamaladze/OrgaTool
nano .env.local
```

**Füge folgende Zeilen ein** (mit DEINEN Werten aus Schritt 1):

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=orbit-xyz.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=orbit-xyz
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=orbit-xyz.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Speichern:**
- Strg+O → Enter → Strg+X

**⚠️ WICHTIG:** `.env.local` ist bereits in `.gitignore` — wird NICHT zu Git committed!

---

## 4️⃣ Firestore Security Rules

Diese Regeln sorgen dafür, dass **jeder User nur seine eigenen Daten sehen kann**.

### In Firebase Console:
1. **Firestore Database → Rules** Tab
2. Ersetze den Inhalt mit:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Items collection - users can only access their own items
    match /items/{itemId} {
      allow read, write: if request.auth != null && 
                           request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
                      request.auth.uid == request.resource.data.userId;
    }
    
    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Klicke **"Publish"**

**Was machen diese Regeln?**
- ✅ User kann nur Items mit `userId == auth.uid` lesen/schreiben
- ✅ User kann nur Items mit seinem eigenen `userId` erstellen
- ❌ Kein Zugriff auf andere User-Daten
- ❌ Keine Zugriffe ohne Authentication

---

## 5️⃣ Dev Server neu starten

```bash
# Alten Server stoppen (Strg+C im Terminal)
npm run dev
```

**Jetzt läuft Firebase!** 🎉

Die App erkennt automatisch:
- ✅ Wenn Firebase konfiguriert ist → Nutzt Cloud-Sync
- ✅ Wenn nicht → Nutzt localStorage (Demo-Modus)

---

## 6️⃣ Testen

1. Öffne `http://localhost:3000`
2. Klicke **"Continue with Google"**
3. Melde dich mit deinem Google-Account an
4. Erstelle ein paar Items (⌘K)
5. Öffne die App in einem anderen Browser → Daten werden synchronisiert! ✨

### In der Browser Console siehst du:
```
[ORBIT Auth] Firebase available — using cloud mode
[ORBIT] Firestore subscription active
```

---

## 🔒 Sicherheit & Best Practices

### ✅ Was ist bereits gesichert:
- **Retry-Logik**: Bei Netzwerkfehlern werden Operationen automatisch wiederholt (max 3x)
- **Optimistische Updates**: UI reagiert sofort, Rollback bei Fehler
- **Data Validation**: Alle Items werden vor dem Speichern validiert
- **Offline-Modus**: localStorage als Fallback
- **Error Boundaries**: App stürzt nicht ab bei Fehlern
- **Quota-Handling**: Automatisches Aufräumen bei vollem localStorage

### ✅ Firebase Security:
- Firestore Rules sichern Daten pro User
- Google Auth ist offiziell und sicher
- API-Keys sind public-safe (nur für Client-Auth)

---

## 📊 Firebase Kostenlose Limits (Spark Plan)

Komplett kostenlos für den Start:

- **Firestore**: 1 GB Speicher, 50.000 reads/Tag, 20.000 writes/Tag
- **Authentication**: Unbegrenzte Logins
- **Hosting** (optional): 10 GB Transfer/Monat

**Für ORBIT mehr als genug!** 

Bei 100 Items/User und 10 aktiven Usern brauchst du nur ~0.1 GB und ~500 reads/Tag.

---

## 🔮 Optional: Google Calendar API (später)

Für Event-Sync mit Google Calendar:

### Schritt 1: API aktivieren
1. [console.cloud.google.com](https://console.cloud.google.com)
2. Wähle dein Firebase-Projekt
3. **APIs & Services → Enable APIs**
4. Suche **Google Calendar API** → Enable

### Schritt 2: OAuth Consent Screen
1. **APIs & Services → OAuth consent screen**
2. User Type: **External**
3. App name: **ORBIT**
4. User support email: deine Email
5. Developer contact: deine Email
6. Scopes: Füge `calendar.events` hinzu
7. Test users: Füge deine Email hinzu

### Schritt 3: Credentials
1. **APIs & Services → Credentials**
2. **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: **ORBIT Web Client**
5. Authorized redirect URIs:
   - `http://localhost:3000`
   - `https://deine-domain.com` (später)
6. Kopiere **Client ID**

### Schritt 4: Env Variable
In `.env.local`:
```env
NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID=123456-abc.apps.googleusercontent.com
```

**ORBIT kann dann:**
- Events zu Google Calendar pushen
- Google Calendar Events in ORBIT anzeigen
- Bidirektionale Sync

---

## 🐛 Troubleshooting

### "Firebase not initialized"
- ✅ Check: `.env.local` existiert?
- ✅ Check: Alle `NEXT_PUBLIC_FIREBASE_*` gesetzt?
- ✅ Server neu gestartet? (nach `.env.local` Änderung)

### "Permission denied" bei Firestore
- ✅ Check: Firestore Rules richtig gesetzt?
- ✅ Check: User ist eingeloggt? (nicht Demo-Modus)

### Items synchronisieren nicht
- ✅ Check: Browser Console auf Fehler
- ✅ Check: Firestore Dashboard → "Data" Tab → Siehst du `items` collection?

### localStorage Quota exceeded
- App räumt automatisch alte archivierte Items auf (> 30 Tage)
- Oder: Browser Cache leeren

---

## ✅ Checkliste

- [ ] Firebase Projekt erstellt
- [ ] Web App registriert
- [ ] Authentication (Google) aktiviert
- [ ] Firestore Database aktiviert
- [ ] `.env.local` mit Firebase Config erstellt
- [ ] Firestore Security Rules gesetzt
- [ ] Dev Server neu gestartet
- [ ] Google Login getestet
- [ ] Items erstellt und Sync verifiziert

---

## 🎯 Nächste Schritte (optional)

1. **Deployment**: Vercel/Netlify für Production
2. **Custom Domain**: deine-app.com
3. **Google Calendar Sync**: Events synchronisieren
4. **PWA**: Als App auf Handy installieren
5. **Notifications**: Push-Benachrichtigungen für Habits

---

**Bei Fragen oder Problemen:**
Einfach in der Browser Console nachschauen (F12) — alle Logs sind mit `[ORBIT]` prefixed!
