# StockGauge

Next.js stock analysis UI. Fundamentals come from **SEC EDGAR XBRL** (as-reported filings, free, no API key) for all SEC filers — US companies plus foreign issuers with US listings/ADRs. Quotes, price history, and fundamentals gap-filling come from [yahoo-finance2](https://github.com/gadicc/yahoo-finance2); **Gemini** is only a fallback for symbols not covered by EDGAR (e.g. Europe-only listings).

### Data sources & precedence

1. **SEC EDGAR** (`data.sec.gov` companyfacts) — authoritative when the symbol is an SEC filer; Yahoo only fills what EDGAR lacks (quarterlies for 20-F filers, EBITDA, dividends per share).
2. **Yahoo Finance** — live quotes, OHLCV history, investor metrics; primary fundamentals source for non-SEC symbols.
3. **Gemini** — full fundamentals only when EDGAR has nothing; plus a once-per-24h gap-fill pass.

Set **SEC_EDGAR_USER_AGENT** (e.g. `MyApp (you@example.com)`) — the SEC fair-access policy expects a contact in the User-Agent.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Data is fetched on the **server** (App Router); optional `.env` is only for future features (see `.env.example`).

### Deploy on Vercel

1. Push this repo to GitHub (or GitLab / Bitbucket).
2. In [Vercel](https://vercel.com), **Add New Project** → import the repo. Framework: **Next.js** (auto-detected).
3. Use **Node.js 22.x** (matches `engines` in `package.json` and `yahoo-finance2`). In the project: **Settings → General → Node.js Version**.
4. Deploy. Set **DATABASE_URL**, **DIRECT_URL**, **AUTH_SECRET**, **AUTH_URL**, **AUTH_GOOGLE_ID**, and **AUTH_GOOGLE_SECRET** in the Vercel project (see `.env.example`). With **Supabase**, use the **pooler** URL for `DATABASE_URL` and the **non-pooling** (5432) URL for `DIRECT_URL`. If your host has only one URL, set both to the same value. After the first deploy, apply the DB schema: `npx prisma db push` (or `prisma migrate dev`) against that database.

### Admin panel

Set **ADMIN_EMAILS** (comma-separated Google sign-in emails). Sign in, then open **/admin/cache** to list and edit cached stock fundamentals (`StockAnalysisCache`). Same variable must be set on Vercel for production.

### Node version

`yahoo-finance2` v3 recommends **Node.js 22+**. Older versions may log a warning but often still work.

## Stack

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts.
