import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/lib/useDocumentMeta";
import { notFoundMeta } from "@/lib/routeSeo";

const SUGGESTIONS = [
  { to: "/", label: "Live desk", detail: "Current slate, model edge, and Kelly sizing" },
  { to: "/daily-picks", label: "Daily picks", detail: "The full execution board" },
  { to: "/leaderboard", label: "Proof ledger", detail: "Settled results and CLV history" },
];

/**
 * Unknown routes used to `<Navigate to="/" replace />`, which hands crawlers a
 * 200-with-homepage-content for every bad URL — a soft 404 — and silently
 * teleports users who mistyped a path. This tells both the truth instead.
 */
export default function NotFound() {
  const location = useLocation();

  // The SPA fallback serves this at a 200, so the status code can't say "gone".
  // The robots tag is what actually keeps mistyped URLs out of the index.
  useDocumentMeta(notFoundMeta);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#05070d] px-5 py-16 text-slate-100">
      <div className="w-full max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-lg border border-[#b9ff55]/25 bg-[#b9ff55]/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b9ff55]">
          <Compass className="h-3.5 w-3.5" aria-hidden="true" />
          404
        </div>

        <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          That page isn&rsquo;t on the desk.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          No route matches{" "}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-slate-300">
            {location.pathname}
          </code>
          . It may have moved, or the link may be stale.
        </p>

        <div className="mt-8 grid gap-2">
          {SUGGESTIONS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors hover:border-[#b9ff55]/30 hover:bg-white/[0.06]"
            >
              <span>
                <span className="block text-sm font-semibold text-white">{item.label}</span>
                <span className="mt-0.5 block text-xs text-slate-400">{item.detail}</span>
              </span>
              <span aria-hidden="true" className="text-slate-400 transition-colors group-hover:text-[#b9ff55]">
                &rarr;
              </span>
            </Link>
          ))}
        </div>

        <Button
          asChild
          variant="outline"
          className="mt-6 border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.06] hover:text-white"
        >
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to the desk
          </Link>
        </Button>
      </div>
    </div>
  );
}
