# Oil Sim

A blind oil-trading game at [nathanbissett.com/oil](https://nathanbissett.com/oil). You trade 60 days of real WTI crude prices without knowing when they're from; the dates are revealed at the end. The full spec and milestones are in [PLAN.md](PLAN.md).

## Stack

Next.js 16.4 (App Router), React 19, TypeScript, Tailwind CSS v4 and Vitest. Python 3 in `pipeline/` for the data scripts. Every page is static: no backend, no database, no API keys in the browser.

## Local development

```sh
npm install
npm run dev          # http://localhost:3001/oil
npm test             # Vitest, single run (npm run test:watch to watch)
npm run lint
npm run build
```

The app lives under the `/oil` base path, so `http://localhost:3001/` on its own returns 404.

## How it joins the portfolio

This is a separate Vercel project, joined to the portfolio (`Nate5461/Portfolio`, folder `my-portfolio/`) with Next.js [multi-zones](node_modules/next/dist/docs/01-app/02-guides/multi-zones.md):

- this app sets `basePath: "/oil"` and `assetPrefix: "/oil-static"` in `next.config.ts`
- the portfolio rewrites `/oil`, `/oil/:path+` and `/oil-static/:path+` to `OIL_SIM_URL`
- links between the two apps are plain `<a>` tags, since crossing zones is a full page load

To run both locally, start this app (port 3001), then start the portfolio on port 3000 with `OIL_SIM_URL=http://localhost:3001` and open http://localhost:3000/oil.

## Game engine

The rules live in `lib/engine/`: pure TypeScript with no React, I/O, clock or `Math.random` (lint enforces this), so the UI, the episode builder and the step 2 scoring all run the same code. The step 1 values (60 history days, 60 played, 5x leverage, a 5 bp fee, liquidation below 50% of starting equity) are in `lib/engine/config.ts`.

## Data

Daily WTI spot price at Cushing, Oklahoma (EIA series RWTC), 1986 to the latest published day, from the U.S. Energy Information Administration's [API v2](https://www.eia.gov/opendata/). A copy is committed at `data/wti_daily.json`. EIA publishes spot prices weekly, so the newest day is usually several days old.

To refresh it, get a free key at <https://www.eia.gov/opendata/register.php>, add `EIA_API_KEY=...` to `.env` (gitignored), and run:

```sh
python3 pipeline/fetch_prices.py   # standard library only; prints a validation report
```
