import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  useEffect(() => {
    // The SPA fallback serves this at a 200, so the status code can't say
    // "gone". A robots meta tag is what actually keeps bad URLs out of the index.
    //
    // index.html ships a static `robots: index,follow`. Appending a second meta
    // leaves that permissive one first in the document, so retarget the existing
    // tag and restore it on unmount rather than adding a competing one.
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const meta = existing ?? document.createElement("meta");
    const previousContent = existing?.content ?? null;

    meta.name = "robots";
    meta.content = "noindex,follow";
    if (!existing) document.head.appendChild(meta);

    const previousTitle = document.title;
    document.title = "Page not found — AI Advantage Sports";

    return () => {
      if (previousContent === null) meta.remove();
      else meta.content = previousContent;
      document.title = previousTitle;
    };
  }, []);

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
                <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
              </span>
              <span aria-hidden="true" className="text-slate-600 transition-colors group-hover:text-[#b9ff55]">
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
