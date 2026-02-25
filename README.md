# AI Advantage Sports

[![Live Site](https://img.shields.io/badge/Live-aiadvantagesports.com-00D100?style=for-the-badge&logo=google-chrome&logoColor=white)](https://aiadvantagesports.com)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)

AI-powered sports betting analytics platform providing data-driven insights and predictions for smarter wagering decisions.

---

## Demo / Screenshot

> **Live demo:** [aiadvantagesports.com](https://aiadvantagesports.com)

![AI Advantage Sports Screenshot](https://raw.githubusercontent.com/ianalloway/ai-advantage/main/screenshot.png)

*Replace the image above with a screenshot or animated GIF of the running app. Tools like [LiceCap](https://www.cockos.com/licecap/) or [Kap](https://getkap.co/) can record a demo GIF in seconds.*

---

## Features

- [x] **Kelly Calculator** — Optimal bet sizing via Kelly Criterion with full / half / quarter fractions
- [x] **Bankroll Tracker** — Log bets, track running P&L, and export to CSV; data persists in LocalStorage
- [x] **Live Odds Ticker** — Real-time line movement across major sportsbooks
- [x] **Daily Picks** — AI-generated game-by-game analysis and recommended plays
- [ ] **Dark Mode** — *(coming soon)*

---

## Built With

| Technology | Role |
|---|---|
| [React 18](https://reactjs.org/) | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | Utility-first styling |
| [Vite](https://vitejs.dev/) | Build tool & dev server |
| [shadcn/ui](https://ui.shadcn.com/) | Accessible component library |
| [Recharts](https://recharts.org/) | Data visualisation |
| [Stripe](https://stripe.com/) | Premium subscription billing |

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm (or pnpm / yarn)
- A modern browser

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ianalloway/ai-advantage.git

# 2. Enter the project directory
cd ai-advantage

# 3. Install dependencies
npm install

# 4. Copy environment variables and fill in your keys
cp .env.example .env

# 5. Start the development server
npm run dev
```

The app will be available at `http://localhost:5173` by default.

### Environment Variables

| Variable | Description |
|---|---|
| `VITE_ODDS_API_KEY` | API key from [The Odds API](https://the-odds-api.com/) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for premium subscriptions |

### Available Scripts

```bash
npm run dev        # Start dev server with hot-reload
npm run build      # Production build → dist/
npm run preview    # Preview the production build locally
npm run lint       # Run ESLint
```

---

## Project Structure

```
src/
├── components/
│   ├── KellyCalculator.tsx   # Kelly Criterion bet sizing calculator
│   ├── BankrollTracker.tsx   # Bet log with P&L chart and CSV export
│   ├── LiveOddsTicker.tsx    # Real-time odds feed
│   └── ui/                   # shadcn/ui primitives
├── lib/
│   ├── predictions.ts        # ML prediction utilities
│   └── stripe.ts             # Stripe integration helpers
└── pages/
    └── Index.tsx             # Main application page
```

---

## Deployment

The site is deployed on **Netlify** with automatic deployments triggered by pushes to the `main` branch. Build command: `npm run build`, publish directory: `dist`.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m "feat: describe your change"`
4. Push and open a pull request

Please open an issue (or join the Discord) before starting large changes so we can discuss the approach first.

---

## Author

**Ian Alloway** — Data Scientist & AI Specialist

- Portfolio: [ianalloway.xyz](https://ianalloway.xyz)
- LinkedIn: [linkedin.com/in/ianit](https://www.linkedin.com/in/ianit)
- Twitter/X: [@ianallowayxyz](https://x.com/ianallowayxyz)

---

## License

This project is proprietary. All rights reserved.
