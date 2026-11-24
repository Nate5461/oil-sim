# Oil Sim: build plan

A blind oil-trading game at nathanbissett.com/oil. Step 1 is a playable sim. Nathan styles it after that, then step 2 adds the LLM eval. This file is the spec: read it before writing code, and ask before choosing anything it doesn't cover.

## Stack

- Next.js 16.4.6, React 19.3, TypeScript, Tailwind CSS v4, App Router, scaffolded with create-next-app 16.4.6. The portfolio app (Nate5461/Portfolio, folder `my-portfolio/`) is on Next 16.2.0, which has open security advisories (including RCEs) that no 16.2.x patch fixes, so it gets bumped to 16.4.6 in the milestone 5 PR and both zones match again.
- Next 16 changed APIs from older versions. Read the guides in `node_modules/next/dist/docs/` before writing Next-specific code (multi-zones, next.config, fonts). Keep the AGENTS.md that create-next-app writes.
- Vitest for tests. Recharts for the chart. No other runtime dependencies without asking.
- Python 3 in `pipeline/` for data scripts and, later, the step 2 eval.
- No backend, no database, no API keys in the browser. Every page is static.

## How it joins the portfolio

Separate repo and separate Vercel project, joined to the portfolio with Next.js multi-zones (see `node_modules/next/dist/docs/01-app/02-guides/multi-zones.md`).

- oil-sim: `basePath: '/oil'` in next.config.ts, plus the `assetPrefix` the multi-zones guide calls for.
- Portfolio (`my-portfolio/next.config.ts`): rewrites for `/oil`, `/oil/:path+` and the asset prefix path to `process.env.OIL_SIM_URL`. Set OIL_SIM_URL in the portfolio's Vercel project to the oil-sim production URL.
- Links between the two apps use a plain `<a>`, because moving between zones is a full page load.
- Local dev: oil-sim on port 3001; portfolio on 3000 with `OIL_SIM_URL=http://localhost:3001`.
- Copy the portfolio's design tokens (the `:root` variables, the dark-mode block and `@theme inline` in `app/globals.css`) and its three fonts (Geist, Geist Mono and Fraunces through next/font in `app/layout.tsx`), so the styling pass starts from the same look.

## Data

Source: EIA's daily WTI spot price at Cushing, Oklahoma (series RWTC), 1986 to now. EIA stopped publishing NYMEX futures prices after April 5, 2024, so the game uses spot.

- `pipeline/fetch_prices.py`: pull RWTC daily from the EIA API v2. Free API key in `.env` as `EIA_API_KEY`, never committed. Page through the results. Check the endpoint and parameters against EIA's API docs before coding them.
- Write `data/wti_daily.json`:
  `{ "series": "RWTC", "source": "U.S. Energy Information Administration", "retrieved": "YYYY-MM-DD", "unit": "USD/bbl", "dates": [...], "prices": [...] }`
  Sorted by date, one entry per trading day.
- Validate and print: row count, first and last date, min and max, duplicate dates, gaps longer than 5 trading days, and every price at or below 0. Expect one: 2020-04-20, about -37.
- Credit on every page: "Price data: U.S. Energy Information Administration (Thomson Reuters), retrieved YYYY-MM-DD."
- Permission: Nathan is asking EIA in writing whether this series can be republished. Keep the data behind this one script, so switching to the World Bank's monthly WTI series (CC BY 4.0) only means a new fetch script and different window lengths.
- Don't use the 2024 Oil repo's `oil_data.sqlite`. That data is licensed and can't be published.

## Game rules

Step 1 defaults. Keep them all in one config object.

- An episode is a window of 120 trading days: 60 days of history shown at the start, then 60 days played.
- Prices are rebased so the last history day is 100. Dates stay hidden until the end.
- Actions: long, short or flat. Fixed 5x leverage.
- Timing: the player decides at day t's close and sees prices up to t only. The position earns the move from t to t+1:
  `equity[t+1] = equity[t] * (1 + position * leverage * (p[t+1] / p[t] - 1))`, floored at 0.
- Fee: 5 basis points of exposure (equity times leverage) each time the position changes.
- Liquidation: if equity falls below 50% of the starting equity, force flat and end the game.
- Starting equity: 10,000.
- At the end: reveal the real date range and dollar prices, and show the player's return, max drawdown, and buy-and-hold (5x long the whole time) on the same episode.

## Episodes

A fixed, seeded set, so every player and, in step 2, every model plays the same windows.

- `scripts/build-episodes.ts`, run with tsx: seeded RNG (mulberry32), 300 episodes with random start dates at least 20 trading days apart. Skip any window that contains a price at or below 0.
- Output:
  - `public/episodes/index.json`: ids and split
  - `public/episodes/<id>.json`: rebased prices only, no dates
  - `public/episodes/reveal/<id>.json`: start and end dates, raw prices
- Tag each episode `split: "standard" | "holdout"`. Holdout means the window starts on or after `HOLDOUT_START` in the config. The date gets set in step 2; leave it null for now.
- The same seed must produce identical files. Test that.

## Engine

`lib/engine/`: pure TypeScript, no React.

- `types.ts`, `rng.ts`, `engine.ts` (`initState(episode, config)` and `step(state, action, config)`), `metrics.ts` (return, max drawdown, buy-and-hold).
- No I/O, `Date.now` or `Math.random` inside the engine. The UI, the episode builder and step 2's scoring all use this one module.
- Write the tests first. At least:
  - flat keeps equity unchanged when there is no fee
  - long gains on an up day and loses on a down day; short does the reverse
  - leverage multiplies the move
  - the fee is charged only when the position changes
  - liquidation ends the game and forces flat
  - equity never goes below 0
  - no look-ahead: a step at t never reads a price past t+1
  - the episode builder is deterministic

## UI

Step 1 is function over looks.

- `app/page.tsx`, served at /oil. Loads a random episode, or the one in `?e=<id>`.
- A client component with `useReducer`, using the engine's `step` as the reducer.
- Chart (Recharts): rebased price up to the current day, a vertical line where play starts, and markers where the position changed.
- Controls: Long, Short and Flat (current one highlighted), Next day, Next 5 days. Keys: L, S, F, and Space or the right arrow for the next day.
- Readout: day x of 60, position, equity, return, and distance to liquidation.
- End screen: the reveal, results against buy-and-hold, Play again, and a button that copies a link to this episode.
- Data credit in the footer. Plain Tailwind with the copied tokens; Nathan does the styling later.

## Milestones

One commit each, with tests passing. Stop and report after each one.

0. Scaffold: create-next-app matching the portfolio's versions, Vitest, basePath, tokens and fonts, README stub.
1. Data: `fetch_prices.py` and a committed `data/wti_daily.json`, with the validation output in the commit message.
2. Engine and tests.
3. Episode builder and the generated files.
4. Playable UI.
5. Deploy: an oil-sim Vercel project, then a separate small PR on the portfolio for the Next 16.4.6 bump, the rewrites and a project card linking to /oil. Check that nathanbissett.com/oil loads with all its assets and that links work both ways.

## Step 2 preview (don't build yet)

This is an LLM eval, not model training. PyTorch is for training your own model, for example a price forecaster, and on one price series that mostly learns noise. Step 2 measures how LLMs make decisions under the same rules a person plays by, which matches the applied AI work on Nathan's resume.

- `pipeline/eval/` in Python. For each eval episode and each play day, send the model the rebased prices up to t, its current position and equity, and no dates. Structured output with a Pydantic schema: `action` and a one-line `reason`. Claude and Gemini get the same prompt.
- Roughly 50 episodes, 60 days each and 2 models: about 6,000 calls. Use the providers' batch APIs, and cache every response in JSONL keyed by model, episode and day so reruns cost nothing.
- Output `public/ai/<model>/<episodeId>.json` with actions and reasons. Never commit API keys.
- `scripts/score.ts` replays those actions through the same TypeScript engine, along with baselines (buy-and-hold, seeded random, moving-average crossover), and writes `public/results.json`. One implementation of the rules.
- Memorization checks: ask each model to guess the year range of a blinded window, and compare results on standard and holdout episodes. Holdout means after the model's training cutoff. It will be small at first, so report it as a check, not the headline.
- UI: after a game, show how each model and baseline did on the same episode, plus a results page that doubles as the write-up.
