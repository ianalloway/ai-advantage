# AGENTS.md - AI Advantage

## Overview

AI-powered sports betting edge platform. Live product at
[aiadvantagesports.com](https://aiadvantagesports.com) — predictions, Kelly sizing,
live odds, and a real Stripe subscription surface (NBA, NFL, MLB).

## Tech Stack

- **Framework:** React 19 + TypeScript
- **Build:** Vite 8
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives)
- **Server:** Netlify Functions (`netlify/functions` + shared `api/` handlers)
- **Package Manager:** npm (`package-lock.json` is the source of truth)

## Commands

```bash
npm install
npm run dev         # Vite → http://localhost:8080
npm run build       # production build + prerender
npm run lint        # ESLint
npm test            # unit tests (vitest; excludes smoke)
npm run test:smoke  # production smoke suite
npm run preview     # preview production build
```

## Project Structure

```
src/                 # React app (pages, components, hooks, lib)
api/                 # shared server-side handlers (Stripe, newsletter, ledger)
netlify/functions/   # thin Netlify wrappers around api/
docs/                # product / ops notes (portfolio risk, Substack, ledger)
tests/               # vitest unit + smoke
scripts/             # prerender, Hermes Substack publish
```

## Key Conventions

- Uses shadcn/ui component library; Tailwind config in `tailwind.config.ts`
- Paid access is **server-truth only** (`/api/entitlements/me`); localStorage is a cache
- Do not edit `.github/workflows` unless CI itself is broken
- Modeling lives in adjacent repos (`nba-ratings`, `kelly-js`, `sports-betting-ml`)

## Owner

Ian Alloway (@ianalloway) — [Portfolio](https://ianalloway.xyz) · ian@allowayllc.com
