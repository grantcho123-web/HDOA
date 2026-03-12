# Human Data Ops

**AI trainer opportunity aggregator — 500+ listings across 41 companies with automated freshness monitoring.**

## What It Does

- **📋 500+ Listings** — Programmatically generated from 41 AI training platforms (Outlier, Scale AI, Mercor, DataAnnotation, etc.)
- **📄 Resume Matching** — Upload PDF/paste text → client-side parser extracts skills, education, experience → scores against all listings
- **📊 Applicant Repository** — Saved profiles with filtering by country, school, major, skills + CSV export
- **🔄 Automated Freshness** — GitHub Actions checks every platform URL daily, commits results, Vercel auto-deploys

## Project Structure

```
human-data-ops/
├── public/
│   └── index.html              ← Main app (single-file React)
├── api/
│   └── freshness.js            ← Vercel serverless function (serves freshness data)
├── data/
│   ├── platforms.json           ← Platform registry (URLs to check)
│   └── freshness.json           ← Auto-updated by cron (check results)
├── scripts/
│   └── check-urls.js            ← URL checker (run by GitHub Actions)
├── .github/
│   └── workflows/
│       └── check-freshness.yml  ← Daily cron job
├── vercel.json                  ← Vercel config + rewrites
├── package.json
└── README.md
```

## Setup (15 minutes)

### Step 1: Create GitHub Repository

```bash
cd human-data-ops
git init
git add .
git commit -m "Initial commit — Human Data Ops"
```

Create a new repo on GitHub (e.g., `humandataops`), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/humandataops.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select your `humandataops` repo
4. Vercel auto-detects the config from `vercel.json`
5. Click **Deploy**
6. Your site is live at `humandataops.vercel.app` (or custom domain)

### Step 3: Enable GitHub Actions (Automatic)

The `.github/workflows/check-freshness.yml` file is already in the repo, so GitHub Actions will:

- **Run daily at 6:00 AM UTC** automatically
- Check all 42 platform URLs (HEAD + GET requests)
- Record: status (live/down/changed), HTTP code, response time, content check
- Commit updated `data/freshness.json` back to the repo
- Vercel auto-redeploys on every push → **site always has fresh data**

To run it manually: Go to your repo → **Actions** tab → **"Check Platform Freshness"** → **"Run workflow"**

### Step 4 (Optional): Custom Domain

In Vercel dashboard → your project → **Settings** → **Domains** → Add `humandataops.com` or whatever you want.

## How Freshness Works

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐
│  GitHub Actions  │────▶│ check-urls.js │────▶│ HEAD/GET to  │
│  (daily cron)    │     │              │     │ 42 platforms │
└─────────────────┘     └──────┬───────┘     └──────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │ freshness.json   │
                    │ (committed to    │
                    │  repo via git)   │
                    └────────┬─────────┘
                             │ git push
                             ▼
                    ┌──────────────────┐
                    │  Vercel auto-    │
                    │  deploys         │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Frontend loads  │
                    │  /data/freshness │
                    │  .json on mount  │
                    └──────────────────┘
```

Each listing card shows:
- 🟢 **"Live ✓"** — platform responded 200 OK with expected content in last check
- 🟡 **"3d ago"** — last checked 3 days ago (between checks)
- 🔴 **"Offline"** — platform returned error or timed out
- **⚑ button** — users can flag listings as outdated (stored in their localStorage)

## Local Development

```bash
# Preview the site
npx serve public -l 3000

# Run the freshness checker manually
node scripts/check-urls.js

# Check the results
cat data/freshness.json | python3 -m json.tool
```

## Adding New Platforms

1. Add an entry to `data/platforms.json`:
```json
{
  "id": "newplatform",
  "name": "New Platform",
  "url": "https://newplatform.com/careers",
  "applyUrl": "https://newplatform.com",
  "checkSelector": "career"
}
```

2. Add listings for the new platform in `public/index.html` inside the `gen()` function

3. Add the company-to-ID mapping in the `CO_TO_ID` object

4. Commit and push — the cron will start checking it automatically

## Tech Stack

- **Frontend:** React 18 (via CDN, no build step), pdf.js for PDF parsing
- **Hosting:** Vercel (static site + serverless function)
- **Automation:** GitHub Actions (daily cron)
- **Storage:** Git repo (freshness data), localStorage (user data)
- **Resume Parsing:** Client-side regex engine (no API calls, no data leaves the browser)
- **Zero external dependencies** — no database, no API keys, no paid services

## Cost

**$0/month.** GitHub Actions free tier (2,000 minutes/month) and Vercel free tier (100GB bandwidth) are more than enough.
