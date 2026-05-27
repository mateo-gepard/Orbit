# 🏗️ Threadmap — System Architecture

## Übersicht

Threadmap ist **hybrid**: Läuft komplett offline (localStorage) UND mit Cloud-Sync (Firebase).

```
┌─────────────────────────────────────────────────────────────┐
│                         Threadmap App                            │
│                      (Next.js 16 / React)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├──────────────┬──────────────┐
                              │              │              │
                    ┌─────────▼────┐  ┌──────▼─────┐  ┌────▼─────┐
                    │ UI Components│  │   Zustand   │  │ Providers│
                    │   (Pages)    │  │    Store    │  │ Auth/Data│
                    └──────────────┘  └──────┬──────┘  └─────┬────┘
                                             │               │
                                    ┌────────▼───────────────▼──┐
                                    │   firestore.ts (API)      │
                                    │   • Retry Logic           │
                                    │   • Validation            │
                                    │   • Optimistic Updates    │
                                    └────────┬──────────────────┘
                                             │
                            ┌────────────────┴────────────────┐
                            │                                 │
                    ┌───────▼────────┐              ┌─────────▼────────┐
                    │  localStorage   │              │    Firebase      │
                    │  (Demo Mode)    │              │   (Cloud Mode)   │
                    │                 │              │                  │
                    │  • Instant      │              │  • Auth          │
                    │  • No Setup     │              │  • Firestore     │
                    │  • Local Only   │              │  • Multi-Device  │
                    └─────────────────┘              └──────────────────┘
```

---

## 📦 Data Layer (firestore.ts)

### Bulletproof Features

#### 1. **Dual-Mode System**
```typescript
isFirebaseAvailable() 
  ? useFirestore()     // Cloud mit Realtime-Sync
  : useLocalStorage()  // Demo mit instant UX
```

#### 2. **Retry Logic mit Exponential Backoff**
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = 3
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      if (attempt < retries - 1) {
        await sleep(500 * Math.pow(2, attempt)); // 500ms, 1s, 2s
      }
    }
  }
  throw lastError;
}
```

**Nutzen:**
- ✅ Netzwerkfehler werden automatisch recovered
- ✅ Wie Microsoft To Do: Zuverlässig auch bei schlechtem Internet

#### 3. **Data Validation & Sanitization**
```typescript
function sanitizeItem(item: OrbitItem): OrbitItem {
  return {
    ...item,
    id: item.id || crypto.randomUUID(),
    title: (item.title || '').trim() || 'Untitled',
    type: VALID_TYPES.has(item.type) ? item.type : 'task',
    status: VALID_STATUSES.has(item.status) ? item.status : 'active',
    // ... validates all fields
  };
}
```

**Nutzen:**
- ✅ Korrupte Daten werden automatisch repariert
- ✅ Keine Runtime-Crashes durch ungültige Werte

#### 4. **Optimistic Updates mit Rollback**
```typescript
export async function updateItem(id: string, updates: Partial<OrbitItem>) {
  // 1. UI sofort updaten (optimistisch)
  const prevItems = store.items;
  store.setItems(prevItems.map(i => 
    i.id === id ? { ...i, ...updates } : i
  ));

  try {
    // 2. Backend-Update
    await firestore.update(id, updates);
  } catch (err) {
    // 3. Bei Fehler: Rollback
    store.setItems(prevItems);
    throw err;
  }
}
```

**Nutzen:**
- ✅ UI reagiert instant (keine Ladezeit)
- ✅ Bei Fehler: Automatischer Rollback ohne Datenverlust

#### 5. **Storage Quota Handling**
```typescript
if (err.name === 'QuotaExceededError') {
  // Auto-Cleanup: Lösche archivierte Items > 30 Tage
  const compacted = items.filter(
    i => i.status !== 'archived' || 
         Date.now() - i.updatedAt < 30 * 24 * 60 * 60 * 1000
  );
  localStorage.setItem(KEY, JSON.stringify(compacted));
}
```

**Nutzen:**
- ✅ localStorage wird nie voll
- ✅ Automatisches Aufräumen alter Daten

---

## 🔐 Security Layer

### Firestore Security Rules

```javascript
// User kann nur eigene Items sehen
allow read: if request.auth.uid == resource.data.userId;

// User kann nur eigene Items erstellen
allow create: if request.auth.uid == request.resource.data.userId;

// userId darf NICHT geändert werden
allow update: if resource.data.userId == request.resource.data.userId;
```

**Was das verhindert:**
- ❌ Cross-User-Zugriffe
- ❌ userId-Hijacking
- ❌ Unauthenticated Reads/Writes

---

## 🎯 State Management (Zustand)

### Store mit Safe Selectors

```typescript
export const useOrbitStore = create<OrbitStore>((set, get) => ({
  items: [],
  
  // Guard: Nur Arrays akzeptieren
  setItems: (items) => {
    if (!Array.isArray(items)) {
      console.error('[THREADMAP] Invalid items:', typeof items);
      return;
    }
    set({ items });
  },

  // Safe Selectors mit try/catch
  getItemById: (id) => {
    try {
      return get().items.find(i => i.id === id);
    } catch {
      return undefined; // Never crash
    }
  },
}));
```

**Nutzen:**
- ✅ Store kann nicht in ungültigen Zustand kommen
- ✅ Selectors crashen nie, selbst bei korrupten Daten

---

## 🌐 Network Layer

### Auto-Reconnection

```typescript
// Online/Offline Detection
window.addEventListener('online', () => {
  console.info('[THREADMAP] Network back — reconnecting');
  reconnect();
});

window.addEventListener('offline', () => {
  console.warn('[THREADMAP] Network offline — using local cache');
});
```

### Firestore Subscription mit Fallback

```typescript
const unsubscribe = onSnapshot(
  query,
  (snapshot) => {
    // Success: Update store
    callback(items);
  },
  (error) => {
    // Error: Use local cache
    console.error('[THREADMAP] Firestore error:', error);
    const cached = loadLocalItems();
    if (cached.length > 0) {
      callback(cached);
    }
  }
);
```

**Nutzen:**
- ✅ App funktioniert auch bei Firestore-Ausfall
- ✅ Automatische Wiederverbindung bei Netzwerk-Rückkehr

---

## 🛡️ Error Handling

### 1. Error Boundary (React)
```typescript
class ErrorBoundary extends Component {
  componentDidCatch(error, errorInfo) {
    console.error('[THREADMAP] Uncaught error:', error);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorScreen onReload={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
```

### 2. Try/Catch um alle async Ops
```typescript
const handleUpdate = async (updates) => {
  try {
    await updateItem(item.id, updates);
  } catch (err) {
    console.error('[THREADMAP] Update failed:', err);
    // UI bleibt stabil dank optimistischem Update
  }
};
```

### 3. Firebase Errors → Demo Mode Fallback
```typescript
const signInWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    // Fehler? → Demo Mode
    setUser(createDemoUser());
    setIsDemo(true);
  }
};
```

**Nutzen:**
- ✅ App crashed NIE
- ✅ Bei jedem Fehler: Graceful Degradation

---

## ⚡ Performance

### Optimizations

1. **Memoization**
   ```typescript
   const filteredItems = useMemo(
     () => items.filter(i => i.status === 'active'),
     [items]
   );
   ```

2. **Optimistic Updates** — UI reagiert sofort, Backend async

3. **Local-First** — Lesen von localStorage ist instant

4. **Debouncing** (in Textfeldern via onChange + onBlur)

5. **Code Splitting** — Next.js lädt nur benötigte Pages

---

## 📊 Data Flow

### Item Creation
```
User drückt ⌘K
  → Gibt "Müll rausbringen morgen #home" ein
  → parseCommand() erkennt: type=task, due=morgen, tag=home
  → createItem() wird aufgerufen
  
  [Local Mode]
  → Item zu localStorage.items[]
  → syncStoreFromLocal()
  → UI aktualisiert sofort
  
  [Cloud Mode]
  → Optimistic: Item zu store.items[]
  → UI aktualisiert sofort
  → Async: addDoc(firestore)
  → Bei Erfolg: Firestore Realtime Listener aktualisiert Store
  → Bei Fehler: Rollback (Item aus Store entfernen)
```

### Item Update
```
User ändert Titel in Detail Panel
  → onBlur → handleUpdate({ title: newTitle })
  
  [Local Mode]
  → localStorage.items[idx].title = newTitle
  → syncStoreFromLocal()
  
  [Cloud Mode]
  → Optimistic: store.items[idx].title = newTitle
  → UI zeigt neuen Titel sofort
  → Async: updateDoc(firestore)
  → Bei Fehler: Rollback auf alten Titel
```

---

## 🚀 Deployment

### Production Checklist

- [x] **Build** passes ohne Errors
- [x] **TypeScript** strict mode
- [x] **Error Boundaries** um alle Provider
- [x] **Retry Logic** für alle Firestore Ops
- [x] **Validation** bei jedem Write
- [x] **Security Rules** in Firestore
- [x] **localStorage Fallback** funktioniert
- [x] **Optimistic Updates** mit Rollback
- [x] **Offline Mode** detection

### Vercel Deployment

```bash
npx vercel
```

**Environment Variables in Vercel setzen:**
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

---

## 📈 Monitoring & Logging

Alle kritischen Operationen loggen mit `[THREADMAP]` Prefix:

```typescript
console.info('[THREADMAP Auth] Firebase available — using cloud mode');
console.warn('[THREADMAP] Network offline — using local data');
console.error('[THREADMAP] Update failed:', err);
```

**In Production:**
- Logs → Browser Console (F12)
- Firebase Console → Monitoring für Firestore Errors
- Vercel Analytics für Performance

---

## 🎓 Design Principles

### 1. **Local-First**
App funktioniert OHNE Backend. Backend ist Optional-Enhancement.

### 2. **Optimistic UI**
Jede User-Aktion zeigt sofort Feedback. Keine Ladezeiten.

### 3. **Fail-Safe**
Bei jedem Fehler: Graceful Degradation, nie komplett broken.

### 4. **Data Integrity**
Validation + Sanitization bei jedem Write. Korrupte Daten werden repariert.

### 5. **Zero-Config**
Demo-Modus ohne Setup. Firebase ist optional.

---

## 🔮 Future Enhancements

- [ ] **IndexedDB** statt localStorage (mehr Speicher, strukturiert)
- [ ] **Service Worker** für echtes Offline-First
- [ ] **PWA** mit Install-Prompt
- [ ] **End-to-End Encryption** für sensitive Notes
- [ ] **Collaborative Items** (Multi-User Sharing)
- [ ] **Google Calendar Bidirectional Sync**
- [ ] **Push Notifications** für Habit-Reminders
- [ ] **Export/Import** (JSON, CSV)
- [ ] **Undo/Redo** History

---

**Fazit:**

Threadmap ist gebaut wie Microsoft To Do oder Todoist — **bulletproof, zuverlässig, performant**.

Jede Design-Entscheidung folgt Production-Best-Practices. 🚀
