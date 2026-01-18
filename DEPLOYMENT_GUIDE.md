# 🚀 Deployment Guide for PlanPM

## Prerequisites
- GitHub account
- Vercel account (free)
- Supabase project (you already have this)
- Google Cloud Console access

---

## 📦 STEP 1: Push to GitHub

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - PlanPM MVP"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/planpm.git
git branch -M main
git push -u origin main
```

---

## 🔐 STEP 2: Configure Google OAuth for Production

### 2.1 Go to Google Cloud Console
https://console.cloud.google.com/

### 2.2 Select Your Project (or create new one)
- Click project dropdown at top
- Create new project or select existing

### 2.3 Enable Google+ API
- Go to "APIs & Services" → "Library"
- Search for "Google+ API"
- Click Enable

### 2.4 Create OAuth Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Web application"
4. Name it: "PlanPM Production"

### 2.5 Add Authorized URLs

**Important:** You'll need to add BOTH localhost (for testing) and production URLs

**Authorized JavaScript origins:**
```
http://localhost:9002
https://your-app-name.vercel.app
https://yourdomain.com (if you have custom domain)
```

**Authorized redirect URIs:**
```
http://localhost:9002/auth/callback
https://your-app-name.vercel.app/auth/callback
https://krsecnzwutwoduaflqii.supabase.co/auth/v1/callback
```

### 2.6 Save Credentials
- Copy the **Client ID**
- Copy the **Client Secret**
- Keep these safe! You'll need them for Vercel

---

## 🗄️ STEP 3: Configure Supabase

### 3.1 Update Authentication Settings

Go to your Supabase Dashboard:
https://supabase.com/dashboard/project/krsecnzwutwoduaflqii

1. Navigate to **Authentication** → **Providers**
2. Find **Google** provider
3. Click **Edit**
4. Enter:
   - **Client ID**: (from Google Cloud Console)
   - **Client Secret**: (from Google Cloud Console)
5. Click **Save**

### 3.2 Add Site URL (Production URL)

1. Go to **Authentication** → **URL Configuration**
2. Add your production URLs:

```
Site URL: https://your-app-name.vercel.app
Redirect URLs:
  - https://your-app-name.vercel.app/**
  - http://localhost:9002/**
```

### 3.3 Configure Storage Bucket (for document uploads)

1. Go to **Storage** → **Buckets**
2. Find your `maintenance-documents` bucket
3. Click **Policies**
4. Ensure you have these policies:

**Policy: Allow authenticated users to upload**
```sql
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'maintenance-documents');
```

**Policy: Allow public read access**
```sql
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'maintenance-documents');
```

### 3.4 Verify Database Tables

Make sure all your tables exist and have correct RLS policies:

Required tables:
- ✅ `instruments`
- ✅ `maintenance_configurations`
- ✅ `maintenanceSchedules`
- ✅ `maintenanceResults`
- ✅ `maintenance_documents`
- ✅ `test_templates`

---

## ☁️ STEP 4: Deploy to Vercel

### 4.1 Sign Up / Login to Vercel
https://vercel.com/signup

### 4.2 Import Project
1. Click "New Project"
2. Import your GitHub repository
3. Vercel will auto-detect Next.js

### 4.3 Configure Environment Variables

Click "Environment Variables" and add these:

```
NEXT_PUBLIC_SUPABASE_URL=https://krsecnzwutwoduaflqii.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_O5KLpaFMAx1Ri31EJu35rA_BV8XTtJR
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<from Google Console>
GOOGLE_CLIENT_SECRET=<from Google Console>
```

**Important:**
- Set these for all environments (Production, Preview, Development)
- Use the **Publishable key** (starts with `sb_publishable_`) NOT the Secret key
- The Publishable key is safe to use in the browser and is protected by RLS

### 4.4 Deploy
1. Click "Deploy"
2. Wait 2-3 minutes for build
3. Your app will be live at: `https://your-app-name.vercel.app`

---

## 🔄 STEP 5: Update Google OAuth with Production URL

**Now that you have your Vercel URL, go back to Google Cloud Console:**

1. Go to "Credentials" → Your OAuth client
2. Add the Vercel URL to:

**Authorized JavaScript origins:**
```
https://your-actual-vercel-url.vercel.app
```

**Authorized redirect URIs:**
```
https://your-actual-vercel-url.vercel.app/auth/callback
```

3. Click **Save**

---

## 🔄 STEP 6: Update Supabase with Production URL

**Go back to Supabase Dashboard:**

1. Authentication → URL Configuration
2. Update **Site URL** to your actual Vercel URL
3. Add Vercel URL to **Redirect URLs**

---

## ✅ STEP 7: Test Your Deployment

### 7.1 Open Your Production URL
`https://your-app-name.vercel.app`

### 7.2 Test Authentication
- Click "Sign in with Google"
- Should redirect to Google login
- Should redirect back to your app
- Should show your dashboard

### 7.3 Test Core Features
- ✅ Create an instrument
- ✅ Create a maintenance schedule
- ✅ Upload a document
- ✅ View dashboard
- ✅ Filter maintenance list

---

## 🐛 Common Issues & Solutions

### Issue 1: "Missing environment variables"
**Solution:**
- Go to Vercel Dashboard → Settings → Environment Variables
- Make sure all variables are set
- Redeploy

### Issue 2: Google OAuth fails with "redirect_uri_mismatch"
**Solution:**
- Check Google Cloud Console → Credentials
- Make sure your Vercel URL is in Authorized redirect URIs
- Include `/auth/callback` at the end
- Also add Supabase callback URL

### Issue 3: Images/documents not uploading
**Solution:**
- Check Supabase Storage policies
- Make sure bucket is public or has correct RLS
- Check CORS settings in Supabase Storage

### Issue 4: "Unauthorized" errors
**Solution:**
- Check Supabase RLS policies on all tables
- Make sure `user_id` or `userId` columns exist
- Verify policies allow authenticated users

### Issue 5: Build fails on Vercel
**Solution:**
- Check build logs
- Run `npm run build` locally first
- Fix TypeScript errors
- Check if all dependencies are in package.json

---

## 🎨 STEP 8: Custom Domain (Optional)

### 8.1 Buy Domain
- Namecheap, GoDaddy, or Google Domains

### 8.2 Add to Vercel
1. Go to Vercel project → Settings → Domains
2. Add your domain
3. Vercel will give you DNS records

### 8.3 Update DNS
- Add A record or CNAME as Vercel instructs
- Wait 24-48 hours for propagation

### 8.4 Update OAuth URLs
- Add custom domain to Google OAuth
- Add custom domain to Supabase URLs

---

## 🔐 Security Checklist

Before going live:

- ✅ All environment variables are set in Vercel
- ✅ `.env.local` is in `.gitignore` (already done)
- ✅ Supabase RLS policies are enabled
- ✅ Google OAuth only allows your domains
- ✅ Storage bucket has proper policies
- ✅ No hardcoded secrets in code
- ✅ HTTPS enabled (automatic with Vercel)

---

## 📊 Monitoring (Optional but Recommended)

### Vercel Analytics (Free)
1. Go to Vercel project → Analytics
2. Enable Analytics
3. See page views, performance

### Supabase Logs
1. Go to Supabase → Logs
2. Monitor database queries
3. Check for errors

---

## 🚀 Continuous Deployment

**Now you have CI/CD!**

Every time you push to GitHub:
```bash
git add .
git commit -m "Fix bug in scheduling"
git push
```

Vercel automatically:
1. Builds your code
2. Runs tests (if you add them)
3. Deploys to production
4. Gives you a preview URL

---

## 📱 Share With Beta Users

Once deployed, share:
```
Your app: https://your-app-name.vercel.app

Tell them:
1. Sign in with Google
2. Add their instruments
3. Create maintenance schedules
4. Give you feedback!
```

---

## 🎉 You're Live!

Your MVP is now deployed and ready for beta users!

**Next Steps:**
1. Share with 5-10 beta users
2. Get feedback
3. Fix bugs
4. Iterate based on real usage
5. Don't add payments until users love it!

**Good luck with your launch! 🚀**

** On Windows, run:
git clone https://github.com/planp1125-pixel/planpm_local.git
cd planpm_local
copy env.docker.example .env
docker-compose -f docker-compose.dev.yml up --build