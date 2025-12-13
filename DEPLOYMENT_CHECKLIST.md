# ✅ Deployment Checklist

Use this quick checklist to deploy PlanPM to production.

## Pre-Deployment

- [ ] Code is working locally at `http://localhost:9002`
- [ ] All features tested (add instrument, schedule, upload docs)
- [ ] No console errors in browser
- [ ] `.env.local` exists with correct variables
- [ ] Git repository initialized

---

## Google Cloud Console Setup

- [ ] Go to https://console.cloud.google.com/
- [ ] Create/select project
- [ ] Enable Google+ API
- [ ] Create OAuth 2.0 credentials
- [ ] Add authorized origins: `http://localhost:9002`
- [ ] Add redirect URIs: `http://localhost:9002/auth/callback`
- [ ] Add Supabase callback: `https://krsecnzwutwoduaflqii.supabase.co/auth/v1/callback`
- [ ] Copy Client ID
- [ ] Copy Client Secret

---

## Supabase Setup

- [ ] Go to https://supabase.com/dashboard/project/krsecnzwutwoduaflqii
- [ ] Authentication → Providers → Google → Add Client ID & Secret
- [ ] Authentication → URL Configuration → Add `http://localhost:9002`
- [ ] Storage → Check `maintenance-documents` bucket exists
- [ ] Storage → Policies → Verify upload/read policies exist
- [ ] Verify all tables exist (instruments, maintenance_configurations, etc.)

---

## GitHub Setup

- [ ] Create repository on GitHub
- [ ] Push code to GitHub:
  ```bash
  git add .
  git commit -m "Initial commit"
  git remote add origin https://github.com/YOUR_USERNAME/planpm.git
  git push -u origin main
  ```

---

## Vercel Deployment

- [ ] Sign up at https://vercel.com/signup
- [ ] Click "New Project"
- [ ] Import GitHub repository
- [ ] Add environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- [ ] Click "Deploy"
- [ ] Wait for build (2-3 minutes)
- [ ] Copy your Vercel URL (e.g., `https://planpm.vercel.app`)

---

## Post-Deployment Configuration

- [ ] Go back to Google Cloud Console
- [ ] Add Vercel URL to authorized origins
- [ ] Add Vercel callback URL: `https://YOUR-APP.vercel.app/auth/callback`
- [ ] Save Google OAuth settings
- [ ] Go back to Supabase
- [ ] Update Site URL to your Vercel URL
- [ ] Add Vercel URL to redirect URLs
- [ ] Save Supabase settings

---

## Testing Production

- [ ] Open your Vercel URL
- [ ] Click "Sign in with Google"
- [ ] Successfully logs in
- [ ] Dashboard loads
- [ ] Create test instrument
- [ ] Create test schedule
- [ ] Upload test document
- [ ] View results page
- [ ] Check filters work
- [ ] Test on mobile device

---

## Final Checks

- [ ] No console errors in production
- [ ] All images load correctly
- [ ] Documents upload successfully
- [ ] Schedules calculate correctly
- [ ] No TypeScript errors in Vercel logs
- [ ] HTTPS is working (automatic with Vercel)

---

## Share With Users

- [ ] Create list of 5-10 beta testers
- [ ] Send them the URL
- [ ] Give them simple instructions:
  1. Sign in with Google
  2. Add an instrument
  3. Create a maintenance schedule
  4. Upload a document
  5. Share feedback
- [ ] Create feedback form (Google Forms)
- [ ] Schedule follow-up calls

---

## Monitoring

- [ ] Enable Vercel Analytics (optional)
- [ ] Check Supabase logs daily
- [ ] Monitor user signups
- [ ] Track feature usage
- [ ] Collect feedback

---

## Quick Reference URLs

**Your App:**
- Local: http://localhost:9002
- Production: `https://YOUR-APP.vercel.app`

**Admin Dashboards:**
- Vercel: https://vercel.com/dashboard
- Supabase: https://supabase.com/dashboard/project/krsecnzwutwoduaflqii
- Google Console: https://console.cloud.google.com/

**If Something Breaks:**
1. Check Vercel logs: Dashboard → Your Project → Deployments → View Logs
2. Check Supabase logs: Dashboard → Logs Explorer
3. Check browser console (F12)
4. Check OAuth settings in Google Console
5. Redeploy from Vercel if needed

---

## 🎉 Done!

When all boxes are checked, you're live and ready for users!

**Remember:**
- Don't add payments yet
- Focus on getting feedback
- Fix bugs quickly
- Iterate based on real usage
- Get at least 5 users actively using it before building more features

Good luck! 🚀
