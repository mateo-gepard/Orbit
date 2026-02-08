# Deploy Firebase Storage Security Rules

Firebase Storage security rules provide an additional layer of protection beyond CORS configuration. These rules enforce:

- ✅ Authentication requirement
- ✅ File size limits (10MB max)
- ✅ Allowed file types only
- ✅ Project-specific access

---

## Method 1: Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **orbit-9e0b6**
3. Navigate to: **Storage** → **Rules**
4. Copy the contents of `storage.rules` file
5. Paste into the editor
6. Click **Publish**

---

## Method 2: Firebase CLI

### Prerequisites

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Storage (if not done already)
firebase init storage
```

### Deploy

```bash
# Deploy storage rules only
firebase deploy --only storage

# Or deploy all Firebase resources
firebase deploy
```

### Verify

```bash
# Check deployment status
firebase projects:list
firebase storage:rules:get
```

---

## Testing After Deployment

1. Try uploading a file in your ORBIT app
2. Check browser console for errors
3. Verify file appears in Firebase Storage console
4. Test downloading the file

---

## Security Notes

### Current Implementation

- **Authentication**: Only signed-in users can access files
- **File Size**: Max 10MB per file
- **File Types**: Images, PDFs, Word, Excel, PowerPoint, text, ZIP
- **Access Control**: Any authenticated user can read/write (basic)

### Production Enhancement (Optional)

To restrict files to only the project owner, you'd need to:

1. Add custom metadata to storage files:
   ```typescript
   metadata: {
     customMetadata: {
       projectId: project.id,
       userId: user.uid
     }
   }
   ```

2. Update storage.rules to check ownership via Firestore:
   ```javascript
   match /projects/{projectId}/{fileName} {
     allow read: if isSignedIn() 
              && firestore.get(/databases/(default)/documents/items/$(projectId)).data.userId == request.auth.uid;
   }
   ```

This requires enabling Firestore access in Storage rules, which may have performance implications.

---

## Troubleshooting

### "Insufficient permissions" error

- Check that user is signed in
- Verify authentication token is valid
- Check Firebase Console for rule syntax errors

### Files still not uploading after deploying rules

- Ensure CORS is also configured (see `STORAGE_CORS_SETUP.md`)
- Check browser console for specific error messages
- Verify file size is under 10MB
- Confirm file type is in allowed list

### Rule changes not taking effect

- Wait 1-2 minutes for propagation
- Clear browser cache
- Try incognito/private browsing mode

---

## Related Documentation

- [Firebase Storage Security Rules Guide](https://firebase.google.com/docs/storage/security)
- [Storage Rules Reference](https://firebase.google.com/docs/reference/security/storage)
- CORS Setup: See `STORAGE_CORS_SETUP.md`
