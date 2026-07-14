import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import { syncAccessFromUrl, syncEntitlementAccess } from "./lib/stripe";
import { syncSiteUserSession } from "./lib/auth";

const DailyPicks = lazy(() => import("./pages/DailyPicks"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100">
      <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center justify-center">
        <div className="w-full max-w-md rounded-xl border border-cyan-300/20 bg-white/[0.035] p-6 shadow-[0_24px_80px_rgba(34,211,238,0.08)]">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.75)]" />
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Loading desk</div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300" />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Pulling the next view into the terminal.
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    const syncAll = async () => {
      try {
        await syncAccessFromUrl();
        await syncSiteUserSession();
        await syncEntitlementAccess();
      } catch {
        // Keep the last rendered state if the entitlement endpoint is briefly unavailable.
      }
    };

    void syncAll();

    // Re-sync when returning to the tab so webhook cancellations clear stale premium UI.
    const onFocus = () => {
      void syncEntitlementAccess().catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/daily-picks" element={<DailyPicks />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  );
}

export default App;
