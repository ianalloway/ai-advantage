import { Link } from "react-router-dom";
import { ShieldCheck, Trophy } from "lucide-react";

/**
 * Cross-links between the desk surfaces.
 *
 * /daily-picks and /leaderboard each rendered exactly one link — "Back" to the
 * homepage — at every viewport. A subscriber reading the Daily Picks board who
 * wanted the Proof Ledger had to go home and hunt for it. This replaces the
 * static centred page title with the same label plus its sibling, so the two
 * paid surfaces reach each other directly.
 *
 * The current page stays visually dominant, so the bar still reads as a title.
 */

const SURFACES = [
  { to: "/daily-picks", label: "Daily Picks", icon: Trophy, activeIcon: "text-yellow-300" },
  { to: "/leaderboard", label: "Proof Ledger", icon: ShieldCheck, activeIcon: "text-brand-300" },
] as const;

export default function DeskNav({ current }: { current: "/daily-picks" | "/leaderboard" }) {
  return (
    <nav aria-label="Desk surfaces" className="flex items-center gap-1 sm:gap-2">
      {SURFACES.map(({ to, label, icon: Icon, activeIcon }) => {
        const isCurrent = to === current;

        if (isCurrent) {
          return (
            <span
              key={to}
              aria-current="page"
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-white"
            >
              <Icon className={`h-5 w-5 ${activeIcon}`} aria-hidden="true" />
              {label}
            </span>
          );
        }

        return (
          <Link
            key={to}
            to={to}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
