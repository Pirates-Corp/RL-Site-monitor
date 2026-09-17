# Site Monitor

Next.js dashboard with JWT login, MongoDB storage, uptime pinging, domain/SSL expiry
tracking, and a daily email report. Built to run entirely on free tiers.

## 1. Local setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:
- `MONGODB_URI` — from a free MongoDB Atlas cluster (atlas.mongodb.com → Create free M0 cluster
  → Database Access: create a user → Network Access: allow 0.0.0.0/0 → Connect → get the
  connection string, add your DB name at the end, e.g. `/site-monitor`)
- `JWT_SECRET` — any long random string (e.g. run `openssl rand -hex 32`)
- `CRON_SECRET` — another random string, protects your check-sites/check-domains/daily-report
  endpoints from being called by strangers
- `RESEND_API_KEY`, `REPORT_FROM_EMAIL`, `REPORT_TO_EMAIL` — from resend.com (free tier: 100
  emails/day). Verify a sending domain, or use their onboarding@resend.dev sender for testing.

Run it:
```bash
npm run dev
```
Visit `http://localhost:3000`, register an account, and add a few sites.

## 2. Deploy to Vercel (free)

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel → set the same environment variables from `.env.local` in
   Project Settings → Environment Variables.
3. Deploy.
4. Edit `vercel.json` and replace `YOUR_CRON_SECRET` in both cron paths with your actual
   `CRON_SECRET` value, then redeploy. These two run once daily on Vercel's free Cron:
   - `check-domains` (06:00 UTC) — refreshes domain/SSL expiry dates
   - `daily-report` (08:00 UTC) — emails your summary

## 3. Frequent uptime pings (every 5–10 min) — free external scheduler

Vercel's free tier only allows daily cron, so pings that run every 5–10 minutes need an
outside trigger hitting your API:

**Option A — cron-job.org (easiest)**
1. Create a free account at cron-job.org
2. New cron job → URL: `https://your-app.vercel.app/api/cron/check-sites?secret=YOUR_CRON_SECRET`
3. Schedule: every 5 or 10 minutes
4. Save

**Option B — GitHub Actions** (works well if your code is already on GitHub)
Add `.github/workflows/ping.yml`:
```yaml
name: Ping sites
on:
  schedule:
    - cron: "*/10 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -s "https://your-app.vercel.app/api/cron/check-sites?secret=${{ secrets.CRON_SECRET }}"
```
Add `CRON_SECRET` as a repo secret under Settings → Secrets and variables → Actions.

## 4. Bulk-import sites

On the dashboard, click **Bulk import sites**. Paste one site per line as `Name, https://url.com`,
or upload a `.csv`/`.txt` file with the same format (a `name,url` header row is fine, it's
skipped automatically). Up to 200 sites per import.

## 5. Public status page (`status.yourdomain.com`)

Every site has a **Public/Private** toggle on its dashboard card (public by default). The
`/status` page lists only the sites marked public — no login required — showing UP/DOWN,
domain days left, and SSL days left. It auto-refreshes every 60 seconds.

To serve it at a subdomain like `status.yourdomain.com` instead of `yourapp.vercel.app/status`:

1. In Vercel: Project → Settings → Domains → add `status.yourdomain.com`
2. Point its DNS (at your registrar) with a `CNAME` record to `cname.vercel-dns.com`
   (Vercel shows the exact value once you add the domain)
3. Add a rewrite in `vercel.json` so that subdomain serves the `/status` page at its root:
   ```json
   {
     "rewrites": [
       { "source": "/", "destination": "/status", "has": [{ "type": "host", "value": "status.yourdomain.com" }] }
     ]
   }
   ```
   (Keep the existing `crons` key alongside `rewrites` in the same file.)
4. Redeploy. `status.yourdomain.com` now shows the status page directly.

If you'd rather skip the subdomain setup for now, `yourapp.vercel.app/status` works immediately
with no extra config.

## How it's organized

- `pages/api/auth/*` — register, login, logout, me (JWT set as httpOnly cookie)
- `pages/api/sites/*` — CRUD for monitored sites, scoped to the logged-in user
- `pages/api/cron/check-sites.js` — pings every site in parallel, logs uptime
- `pages/api/cron/check-domains.js` — WHOIS + TLS handshake for domain/SSL expiry, batched
- `pages/api/cron/daily-report.js` — builds and emails the daily HTML summary via Resend
- `pages/dashboard.js` — the UI: add sites, see status/response time/expiry at a glance
- `models/` — Mongoose schemas (User, Site, CheckLog with a 30-day TTL auto-cleanup)

## Notes for 30 sites

- Uptime checks run with `Promise.allSettled` in parallel, so 30 sites finish in a couple
  seconds — well under Vercel's 10s function timeout on the Hobby plan.
- Domain/SSL checks batch 10 at a time with a short delay between batches, to avoid
  WHOIS rate limits.
- CheckLog documents auto-expire after 30 days (MongoDB TTL index), so the free 512MB
  Atlas tier won't fill up.
