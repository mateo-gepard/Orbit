# 🔥 Deploy Firestore Security Rules

Die Analytics-Events können nicht geschrieben werden, weil die Firestore Rules noch nicht deployed sind.

## Option 1: Firebase Console (schnell, empfohlen)

1. Gehe zu: https://console.firebase.google.com/project/orbit-9e0b6/firestore/rules
2. Kopiere den Inhalt von `firestore.rules` 
3. Paste in den Editor
4. Klicke **"Publish"**

## Option 2: Firebase CLI (automatisch)

```bash
# Firebase CLI installieren (falls noch nicht installiert)
npm install -g firebase-tools

# Login
firebase login

# Projekt setzen
firebase use orbit-9e0b6

# Rules deployen
firebase deploy --only firestore:rules
```

## Was die Rules machen:

### Items Collection
- Jeder User kann nur eigene Items lesen/schreiben
- userId wird validiert und kann nicht geändert werden

### Analytics Collection (NEU)
- **CREATE**: User kann Analytics-Events für sich selbst schreiben
- **READ**: User kann nur eigene Events lesen  
- **UPDATE/DELETE**: Nicht erlaubt (immutable logs)
- Validierung: `action`, `timestamp`, `date` müssen vorhanden sein

## Fehler beheben:

Wenn du den Fehler siehst:
```
[Analytics] Firestore flush failed, events safe in localStorage: 
FirebaseError: Missing or insufficient permissions.
```

Bedeutet das, dass die Rules noch nicht deployed sind. Die Events werden trotzdem in localStorage gespeichert und gehen nicht verloren.

Nach dem Deployment der Rules werden neue Events automatisch zu Firestore synced.
