# fbUploadPro — Setup Guide

## 1. Environment Variables
Copy `.env.example` → `.env` and fill:
- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE
- FB_APP_ID, FB_APP_SECRET
- FB_SESSION_ENCRYPTION_KEY (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
- CRON_SECRET (any random string)

## 2. Supabase Setup
SQL Editor → Run:
1. `supabase/admin-setup.sql` — replace YOUR_USER_ID_HERE
2. `supabase/cron-setup.sql` — replace YOUR_DOMAIN_HERE & YOUR_CRON_SECRET_HERE

## 3. Meta App Settings
Valid OAuth Redirect URIs:
- https://your-domain/api/public/fb/callback
- https://dev-domain/api/public/fb/callback

App Domains:
- your-domain.lovable.app
- dev-domain.lovable.app

## 4. Install & Run
```bash
bun install
bun dev