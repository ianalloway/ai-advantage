# AI Advantage Sports

[![Live Site](https://img.shields.io/badge/Live-aiadvantagesports.com-00D100?style=for-the-badge&logo=google-chrome&logoColor=white)](https://aiadvantagesports.com)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

Sports analytics product for ML-driven picks, bankroll sizing, and live betting workflows.

## Why This Repo Matters

This project shows product-oriented ML work rather than notebook-only experimentation:

- prediction workflows tied to a user-facing app
- live odds and betting-oriented UX
- Kelly-based stake sizing and decision support
- production-style frontend architecture with a real deployed surface

![AI Advantage Sports Screenshot](https://raw.githubusercontent.com/ianalloway/ai-advantage/main/screenshot.png)

## Features

- **AI-Powered Analysis** - Advanced machine learning models analyze thousands of data points in seconds
- **Game Analyzer** - Enter any matchup for instant AI analysis and betting recommendations
- **Real-Time Odds** - Track line movements and find value before the market adjusts
- **High Accuracy** - Models consistently outperform traditional handicapping methods
- **Bankroll Protection** - Smart stake sizing recommendations to protect your investment
- **Kelly Criterion** - Optimal bet sizing based on edge and bankroll management
- **Multi-Sport Support** - NBA, NFL, and MLB predictions
- **Premium Tier** - Advanced features with Stripe subscription integration

## Highlights

- Live product experience at [aiadvantagesports.com](https://aiadvantagesports.com)
- Supports NBA, NFL, and MLB workflows
- Includes odds, picks, leaderboard, and premium/paywall paths
- Useful as a portfolio example of turning modeling ideas into an actual product

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS
- **UI Components:** shadcn/ui
- **Build Tool:** Vite
- **Styling:** Custom dark theme with green accents

## Project Structure

```text
src/
  components/        UI and product features
  lib/               predictions, rosters, Stripe helpers
  pages/             landing page, picks, leaderboard
```

## Getting Started

```bash
git clone https://github.com/ianalloway/ai-advantage.git
cd ai-advantage
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Deployment

The site is configured for static hosting plus preview-ready serverless payments:

- `netlify.toml` keeps the current Netlify SPA deploy working.
- `vercel.json` adds SPA rewrites so Vercel previews can serve `/daily-picks` and `/leaderboard`.
- `api/create-checkout-session.ts` and `api/checkout-session.ts` let Vercel previews create and verify Stripe Checkout Sessions securely on the server.

### Stripe Checkout env vars

For the server-created Stripe flow, set these env vars in your deployment target:

```bash
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_ONE_TIME_PRICE_ID=price_...
PUBLIC_APP_URL=https://your-preview-or-production-domain
```

If those are missing, the app falls back to the static Stripe Payment Links from `VITE_STRIPE_CHECKOUT_URL` and `VITE_STRIPE_ONE_TIME_CHECKOUT_URL`.

## Notes

- This repository is best read as a shipped product and frontend/application example.
- Modeling details live in adjacent public projects such as `sports-betting-ml`, `nba-ratings`, and `nba-clv-dashboard`.

## Author

**Ian Alloway**

- Portfolio: [ianalloway.xyz](https://ianalloway.xyz)
- LinkedIn: [linkedin.com/in/ianit](https://www.linkedin.com/in/ianit)
- GitHub: [github.com/ianalloway](https://github.com/ianalloway)

## License

This project is proprietary. All rights reserved.
