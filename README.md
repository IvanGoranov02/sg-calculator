# StockGauge

Next.js stock analysis UI with [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) for quotes, historical prices, and annual fundamentals — **no third-party API key**.

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

### Node version

`yahoo-finance2` v3 recommends **Node.js 22+**. Older versions may log a warning but often still work.

## Stack

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts.
