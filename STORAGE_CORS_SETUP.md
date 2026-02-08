# 🗄️ Firebase Storage CORS Configuration

## Problem

Firebase Storage blocks file uploads/downloads due to CORS (Cross-Origin Resource Sharing) policy.

**Error:**
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin 'https://orbit-gules-ten.vercel.app' has been blocked by CORS policy
```

## Solution

Configure CORS settings for your Firebase Storage bucket.

---

## Quick Setup (Recommended)

### 1. Install Google Cloud SDK

**macOS (Homebrew):**
```bash
brew install google-cloud-sdk
```

**Other platforms:**
Download from https://cloud.google.com/sdk/docs/install

### 2. Authenticate

```bash
gcloud auth login
```

### 3. Set Project

```bash
gcloud config set project orbit-9e0b6
```

### 4. Run Setup Script

```bash
./scripts/setup-storage-cors.sh
```

✅ Done! CORS is now configured.

---

## Manual Setup (Alternative)

If you prefer to configure manually:

```bash
gcloud storage buckets update gs://orbit-9e0b6.firebasestorage.app --cors-file=storage-cors.json
```

---

## What the Configuration Does

The `storage-cors.json` file configures:

- ✅ **Allowed Origins**: `*` (all domains, including your Vercel deployment)
- ✅ **Allowed Methods**: GET, HEAD, PUT, POST, DELETE
- ✅ **Max Age**: 3600 seconds (browser caches CORS preflight for 1 hour)
- ✅ **Response Headers**: Content-Type, Authorization, etc.

---

## Verify Configuration

After applying, test by:

1. Upload a file from your app
2. Download/preview the file
3. Check browser console - no CORS errors!

---

## Production Note

For production, you may want to restrict origins to specific domains:

```json
[
  {
    "origin": ["https://orbit-gules-ten.vercel.app", "https://yourdomain.com"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
```

Then run the setup script again to apply the updated configuration.
