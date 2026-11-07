# StockGauge

Next.js stock analysis UI. Fundamentals come from **SEC EDGAR XBRL** (as-reported filings, free, no API key) for all SEC filers — US companies plus foreign issuers with US listings/ADRs. Quotes, price history, and fundamentals gap-filling come from [yahoo-finance2](https://github.com/gadicc/yahoo-finance2); **Gemini** is only a fallback for symbols not covered by EDGAR (e.g. Europe-only listings).

### Data sources & precedence

1. **Financial Modeling Prep** (optional, recommended) — professionally normalized statements built from official filings. Enabled when **FMP_API_KEY** is set (free tier at financialmodelingprep.com). Removes the raw-XBRL edge cases (tag switches, YTD differencing, multi-class EPS, debt derivation).
2. **SEC EDGAR** (`data.sec.gov` companyfacts) — as-reported fallback when FMP is not configured or doesn't cover the symbol.
3. **Yahoo Finance** — live quotes, OHLCV history, investor metrics; fills whatever the curated source lacks.
4. **Gemini** — full fundamentals only as a last resort; plus a once-per-24h validated gap-fill pass.

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

   Preview and CI run `build:skip-db` (`prisma generate && next build`) so they never `db push`. Production (`VERCEL_ENV=production`) still runs `prisma db push` and `prisma/lock-supabase-api.sql` when `DATABASE_URL` is set.

### Admin panel

Set **ADMIN_EMAILS** (comma-separated Google sign-in emails). Sign in, then open **/admin/cache** to list and edit cached stock fundamentals (`StockAnalysisCache`). Same variable must be set on Vercel for production.

### Node version

`yahoo-finance2` v3 recommends **Node.js 22+**. Older versions may log a warning but often still work.

## Stack

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts.

## Articles and page editing

`/articles` lists published reads. Signed-in administrators (configured through the existing `ADMIN_EMAILS`) also see drafts and can create a read at `/articles/new`, or use **Edit article** on a read. The editor supports long text, headings, reordered blocks, images with drag/slider framing, and HTTPS video links (including YouTube/Vimeo embeds). Uploaded PNG/JPEG/WebP/GIF images are stored with the document; each upload is limited to 2 MB and the whole document to 4 MB. Use hosted HTTPS media URLs for larger documents and videos.

**Edit page**, at the bottom of application pages for administrators, previews and saves EN/BG interface copy and image overrides. Labels can be selected from the page or found by text/key; dynamic financial values remain source data. Translation placeholders must be preserved. Cancel restores the previously saved content. Both editors reject stale writes from another tab and enforce administrator access on the server.

The additive `Article` and `SiteContent` schema is included in Prisma and in a migration. The existing Vercel production build applies the schema and runs `prisma/lock-supabase-api.sql`; preview builds still skip schema application. Draft reads and their cover images are unavailable to public/non-admin requests. Uploaded covers are served separately to avoid sending image payloads in the article listing.

Portfolio history now preserves the signs of stock-split removal/replacement legs and identified fills on cancelled orders. A mismatched order cache older than the position snapshot is refreshed automatically. The chart exposes reconstruction counts and provides **Rebuild history** to restart the order-history cache walk. This does not delete holdings, credentials or manual monthly values. Historical-price failures remain visible rather than being described as a successfully rebuilt history.
