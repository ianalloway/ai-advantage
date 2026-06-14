import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import LiveOddsTicker from "@/components/LiveOddsTicker";
import {
  Activity,
  BarChart3,
  Bitcoin,
  Brain,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Crown,
  DollarSign,
  Flame,
  GitBranch,
  LineChart as LineChartIcon,
  Loader2,
  LogOut,
  Percent,
  Radio,
  Shield,
  Target,
  TrendingUp,
  Trophy,
  UserCircle2,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  analyzeGame,
  calculateBacktestSummary,
  formatEdge,
  formatMoney,
  formatOdds,
  formatProb,
  generateBacktestData,
  generatePerformanceData,
  parseGameInput,
  SPORT_CONFIG,
  type BacktestSummary,
  type GamePrediction,
  type PerformanceData,
  type Sport,
} from "@/lib/predictions";
import { fetchLiveGamesForSport, type LiveMarketGame } from "@/lib/liveSports";
import {
  getAuthChangeEventName,
  getCurrentSiteUser,
  signOutSiteUser,
  type SiteUser,
} from "@/lib/auth";
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  getBillingStatus,
  getAccessChangeEventName,
  getAccessState,
  getCurrentCryptoAccount,
  redirectToCheckout,
  signOutAccessSession,
  type BillingStatus,
} from "@/lib/stripe";
import CryptoPaymentModal, { type UnlockType } from "@/components/CryptoPaymentModal";
import AccessSessionDialog from "@/components/AccessSessionDialog";
import SubstackEmbed from "@/components/SubstackEmbed";
import { createExecutionBoardEntry } from "@/lib/executionBoard";

const ETH_DONATION_ADDRESS = "0x6f278ce76ba5ed31fd9be646d074863e126836e9";

const productProof = [
  {
    label: "Model probability",
    value: "Win prob minus market implied probability",
  },
  {
    label: "Execution edge",
    value: "Raw edge adjusted for timing, CLV, volatility, and liquidity",
  },
  {
    label: "Kelly sizing",
    value: "Quarter-Kelly stake guidance keeps conviction from turning reckless",
  },
];

const workflowSteps = [
  "Pull the live slate and current market price.",
  "Compare model probability to implied odds.",
  "Discount signals for timing, stale prices, and volatility.",
  "Track outcomes against CLV and proof history.",
];

const LIVE_DESK_SPORTS: Sport[] = ["nba", "nfl", "mlb", "wc"];

function sportShortLabel(sport: Sport): string {
  return sport === "wc" ? "World Cup" : sport.toUpperCase();
}

function getDefaultSport(): Sport {
  const now = new Date();
  // Lead with the World Cup while the 2026 tournament is running.
  if (now >= new Date("2026-06-11T00:00:00Z") && now <= new Date("2026-07-20T00:00:00Z")) {
    return "wc";
  }
  const month = now.getMonth();
  if (month >= 2 && month <= 9) return "mlb";
  if (month >= 8 || month <= 1) return "nfl";
  return "nba";
}

const sportsStackRepos = [
  {
    name: "sports-betting-ml",
    href: "https://github.com/ianalloway/sports-betting-ml",
    role: "Model pipeline",
    status: "Active",
    description: "Training, feature engineering, and model-serving demos for the sports prediction layer.",
  },
  {
    name: "kelly-js",
    href: "https://github.com/ianalloway/kelly-js",
    role: "Sizing library",
    status: "Active",
    description: "TypeScript Kelly, CLV, bankroll, and odds-conversion utilities.",
  },
  {
    name: "nba-ratings",
    href: "https://github.com/ianalloway/nba-ratings",
    role: "Ratings core",
    status: "Active",
    description: "Elo, logistic win probability, and Kelly helpers for NBA-style models.",
  },
  {
    name: "nba-clv-dashboard",
    href: "https://github.com/ianalloway/nba-clv-dashboard",
    role: "Analytics archive",
    status: "Archived",
    description: "Calibration, rolling accuracy, and CLV dashboard reference implementation.",
  },
  {
    name: "backtest-report-gen",
    href: "https://github.com/ianalloway/backtest-report-gen",
    role: "Report archive",
    status: "Archived",
    description: "Static HTML evaluation reports for calibration, Brier score, CLV, and bet ledgers.",
  },
  {
    name: "metric-regression-gate",
    href: "https://github.com/ianalloway/metric-regression-gate",
    role: "CI archive",
    status: "Archived",
    description: "A GitHub Action pattern for blocking metric regressions against a baseline.",
  },
];

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-base leading-7 text-slate-400 md:text-lg">{description}</p>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
  accent = "text-white",
}: {
  label: string;
  value: string;
  detail: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-2 text-sm leading-5 text-slate-500">{detail}</div>
    </div>
  );
}

function MiniChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const values = data.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = data
    .map((item, index) => {
      const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
      const y = 88 - ((item.value - min) / range) * 72;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="h-40 w-full min-w-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="proof-curve-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,211,238,0.24)" />
            <stop offset="100%" stopColor="rgba(34,211,238,0)" />
          </linearGradient>
        </defs>
        <polyline
          points={`0,96 ${points} 100,96`}
          fill="url(#proof-curve-fill)"
          stroke="none"
        />
        <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        {data.map((item, index) => {
          const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100;
          const y = 88 - ((item.value - min) / range) * 72;
          return <circle key={item.name} cx={x} cy={y} r="1.6" fill="#34d399" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-slate-600">
        <span>{data[0]?.name}</span>
        <span>{data[data.length - 1]?.name}</span>
      </div>
    </div>
  );
}

function formatLineDelta(delta?: number) {
  if (delta === undefined || Number.isNaN(delta)) return "Flat";
  if (Math.abs(delta) < 0.01) return "Flat";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function formatMarketAudit(game: LiveMarketGame) {
  const audit = game.marketAudit;
  if (!audit) return game.marketSource === "odds-api" ? "Provider confirmed" : "Fallback line";
  if (audit.source === "odds-api") {
    const age = audit.cacheAgeSeconds !== undefined ? ` · ${Math.round(audit.cacheAgeSeconds / 60)}m cache` : "";
    return `${audit.stale ? "Stale provider" : "Provider confirmed"}${age}`;
  }
  if (audit.source === "espn-fallback") return "ESPN fallback";
  return "No verified line";
}

function Index() {
  const [gameInput, setGameInput] = useState("");
  const [bettingAdvice, setBettingAdvice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [liveGames, setLiveGames] = useState<LiveMarketGame[]>([]);
  const [isSlateLoading, setIsSlateLoading] = useState(true);
  const [liveSlateError, setLiveSlateError] = useState<string | null>(null);
  const [liveSlateUpdatedAt, setLiveSlateUpdatedAt] = useState<Date | null>(null);
  const [bankroll, setBankroll] = useState(1000);
  const [minEdge, setMinEdge] = useState(3);
  const [kellyFraction, setKellyFraction] = useState(0.25);
  const [selectedSport, setSelectedSport] = useState<Sport>(() => getDefaultSport());
  const [backtestSummary, setBacktestSummary] = useState<BacktestSummary | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  // Seeded, deterministic illustrative data (clearly labeled in the UI) — not a
  // fabricated-fresh-on-every-render curve. The real settled record is the ledger.
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(() => generatePerformanceData());
  const [access, setAccess] = useState(getAccessState());
  const [cryptoAccount, setCryptoAccount] = useState(getCurrentCryptoAccount());
  const [siteUser, setSiteUser] = useState<SiteUser | null>(getCurrentSiteUser());
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [cryptoUnlockType, setCryptoUnlockType] = useState<UnlockType>("big-game");
  const { toast } = useToast();

  const hasPaidAccess = access.tier !== "free";
  const hasFullVaultAccess = access.tier === "premium";

  const syncAccessUi = () => {
    setAccess(getAccessState());
    setCryptoAccount(getCurrentCryptoAccount());
    setSiteUser(getCurrentSiteUser());
  };

  useEffect(() => {
    syncAccessUi();

    const handleAccessChange = () => syncAccessUi();
    window.addEventListener(getAuthChangeEventName(), handleAccessChange);
    window.addEventListener(getAccessChangeEventName(), handleAccessChange);
    return () => {
      window.removeEventListener(getAuthChangeEventName(), handleAccessChange);
      window.removeEventListener(getAccessChangeEventName(), handleAccessChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getBillingStatus()
      .then((status) => {
        if (!cancelled) setBillingStatus(status);
      })
      .catch(() => {
        if (!cancelled) setBillingStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadLiveSlate = async () => {
      try {
        setIsSlateLoading(true);
        const games = await fetchLiveGamesForSport(selectedSport);
        if (cancelled) return;
        setLiveGames(games);
        setLiveSlateUpdatedAt(new Date());
        setLiveSlateError(null);
      } catch {
        if (cancelled) return;
        setLiveSlateError("Live market board unavailable right now.");
      } finally {
        if (!cancelled) {
          setIsSlateLoading(false);
        }
      }
    };

    void loadLiveSlate();
    const intervalId = window.setInterval(loadLiveSlate, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedSport]);

  const sportName = SPORT_CONFIG[selectedSport].name;

  const analyzedGames = useMemo<Array<{ game: LiveMarketGame; prediction: GamePrediction | null }>>(
    () =>
      liveGames.map((game) => ({
        game,
        prediction: game.odds
          ? analyzeGame(game.homeTeam, game.awayTeam, selectedSport, bankroll, minEdge, kellyFraction, {
              id: game.id,
              bookmaker: game.bookmaker,
              commenceTime: game.date,
              homeOdds: game.odds.homeMoneyline,
              awayOdds: game.odds.awayMoneyline,
              drawOdds: game.odds.drawMoneyline,
              homeOpenOdds: game.odds.homeMoneylineOpen,
              awayOpenOdds: game.odds.awayMoneylineOpen,
              isLive: game.status.state === "in",
            })
          : null,
      })),
    [bankroll, kellyFraction, liveGames, minEdge, selectedSport],
  );

  const executionBoardEntries = useMemo(() => {
    return analyzedGames
      .flatMap(({ game, prediction }) => {
        if (!prediction) return [];
        const entry = createExecutionBoardEntry(game, prediction);
        return entry ? [entry] : [];
      })
      .sort((a, b) => b.score - a.score);
  }, [analyzedGames]);

  const valueBets = useMemo(
    () => analyzedGames.flatMap(({ prediction }) => (prediction?.valueBet ? [prediction] : [])),
    [analyzedGames],
  );

  const topExecutionEntries = executionBoardEntries.slice(0, 3);
  const boardPreviewRows = useMemo(() => {
    if (topExecutionEntries.length > 0) {
      return topExecutionEntries.map((entry) => ({
        id: entry.id,
        sportLabel: entry.sportLabel,
        eventLabel: entry.eventLabel,
        recommendedSide: entry.recommendedSide,
        line: entry.summary.line,
        model: entry.summary.model,
        edge: entry.summary.execution,
        stake: formatMoney(entry.suggestedStake),
        status: entry.executionWindow,
      }));
    }

    return [];
  }, [topExecutionEntries]);

  const liveCount = liveGames.filter((game) => game.status.state === "in").length;
  const postedLineCount = analyzedGames.filter(({ game }) => game.odds).length;
  const avgEdge = executionBoardEntries.length
    ? executionBoardEntries.reduce((sum, entry) => sum + entry.executionAdjustedEdge, 0) /
      executionBoardEntries.length
    : 0;

  const chartData = useMemo(() => {
    const source = performanceData?.weeklyData?.slice(-8);
    if (source?.length) {
      let cumulativeBankroll = 1000;
      return source.map((row, index) => ({
        name: row.week || `W${index + 1}`,
        value: Number(((cumulativeBankroll += row.profit / 100) / 10).toFixed(2)),
      }));
    }

    // Flat baseline if no series is available — never a fabricated upward curve.
    return Array.from({ length: 6 }, (_, index) => ({ name: `W${index + 1}`, value: 100 }));
  }, [performanceData]);

  const runBacktest = () => {
    setIsBacktesting(true);
    setTimeout(() => {
      const results = generateBacktestData(selectedSport, 6);
      const summary = calculateBacktestSummary(results);
      setBacktestSummary(summary);
      setIsBacktesting(false);
      toast({
        title: "Backtest complete",
        description: `Analyzed ${summary.totalGames} games with ${(summary.accuracy * 100).toFixed(1)}% accuracy.`,
      });
    }, 450);
  };

  const handleUpgrade = async (type: "premium" | "one-time" = "premium") => {
    try {
      await redirectToCheckout(type);
    } catch (error) {
      toast({
        title: "Checkout unavailable",
        description:
          error instanceof Error ? error.message : "We could not start Stripe Checkout right now.",
        variant: "destructive",
      });
    }
  };

  const openCryptoUnlock = (type: UnlockType) => {
    setCryptoUnlockType(type);
    setShowCryptoModal(true);
  };

  const copyEthAddress = async () => {
    try {
      await navigator.clipboard.writeText(ETH_DONATION_ADDRESS);
      toast({
        title: "Address copied",
        description: "ETH donation address copied to clipboard.",
      });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const analyzeBetting = async () => {
    if (!gameInput.trim()) {
      toast({
        title: "Please enter a game",
        description: "Try something like Lakers vs Warriors.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const parsed = parseGameInput(gameInput, selectedSport);

      if (!parsed) {
        toast({
          title: "Could not identify teams",
          description: `Try entering ${sportName} team names like "Lakers vs Warriors".`,
          variant: "destructive",
        });
        return;
      }

      const prediction = analyzeGame(parsed.homeTeam, parsed.awayTeam, selectedSport, bankroll, minEdge, kellyFraction);
      const valueLine = prediction.valueBet
        ? `${prediction.valueBet.team.toUpperCase()} MONEYLINE | ${formatEdge(
            prediction.valueBet.executionAdjustedEdge,
          )} execution-adjusted edge | ${formatMoney(prediction.valueBet.suggestedBet)} stake`
        : `PASS | No edge clears ${minEdge}% after execution filters`;

      setBettingAdvice(`AI ADVANTAGE MATCHUP REPORT

${prediction.awayTeam} @ ${prediction.homeTeam}
Predicted winner: ${prediction.predictedWinner}
Confidence: ${formatProb(prediction.confidence)}
Recommendation: ${valueLine}

Home: ${formatProb(prediction.homeProb)} win probability | ${formatOdds(prediction.homeOdds)} | ${formatEdge(prediction.homeEdge)} raw edge
Away: ${formatProb(prediction.awayProb)} win probability | ${formatOdds(prediction.awayOdds)} | ${formatEdge(prediction.awayEdge)} raw edge

Execution window: ${prediction.executionFactors.executionWindow}
Kelly fraction: ${(kellyFraction * 100).toFixed(0)}%
Bankroll: ${formatMoney(bankroll)}

Bet responsibly. This is model output, not a guarantee.`);

      toast({
        title: "Model run complete",
        description: `Predicted winner: ${prediction.predictedWinner} (${formatProb(prediction.confidence)}).`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyAdvice = async () => {
    try {
      await navigator.clipboard.writeText(bettingAdvice);
      toast({ title: "Copied", description: "Analysis copied to clipboard." });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#05070d] text-slate-100">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <LiveOddsTicker speed={44} pauseOnHover />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070d]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <Link to="/" className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 sm:h-10 sm:w-10">
              <TrendingUp className="h-5 w-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight text-white md:text-base">
                AI Advantage Sports
              </div>
              <div className="hidden text-xs text-slate-500 sm:block">Sports intelligence, sized and tracked</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-slate-400 lg:flex">
            <a href="#live-desk" className="transition-colors hover:text-white">
              Live Desk
            </a>
            <a href="#proof" className="transition-colors hover:text-white">
              Proof
            </a>
            <a href="#model-lab" className="transition-colors hover:text-white">
              Model
            </a>
            <a href="#sports-stack" className="transition-colors hover:text-white">
              Stack
            </a>
            <a href="#pricing" className="transition-colors hover:text-white">
              Pricing
            </a>
            <Link to="/leaderboard" className="transition-colors hover:text-white">
              Ledger
            </Link>
            {siteUser ? (
              <Link to="/profile" className="transition-colors hover:text-white">
                Profile
              </Link>
            ) : null}
          </nav>

          <div className="flex items-center gap-2">
            {hasPaidAccess ? (
              <Badge className="hidden border-emerald-400/30 bg-emerald-400/10 text-emerald-200 md:inline-flex">
                {access.label}
              </Badge>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="hidden border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] sm:inline-flex"
              onClick={() => setShowAccessDialog(true)}
            >
              <Wallet className="mr-2 h-4 w-4" />
              Restore
            </Button>
            {siteUser ? (
              <>
                <Button asChild size="sm" className="bg-white text-slate-950 hover:bg-slate-200">
                  <Link to="/profile">
                    <UserCircle2 className="mr-2 h-4 w-4" />
                    <span className="sm:hidden">Acct</span>
                    <span className="hidden sm:inline">Account</span>
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="hidden border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] sm:inline-flex"
                  onClick={() => {
                    signOutSiteUser();
                    syncAccessUi();
                    toast({ title: "Logged out", description: "Your site account has been logged out." });
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="hidden border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] sm:inline-flex"
                >
                  <Link to="/login">Log in</Link>
                </Button>
                <Button asChild size="sm" className="bg-white text-slate-950 hover:bg-slate-200">
                  <Link to="/signup">
                    <span className="sm:hidden">Join</span>
                    <span className="hidden sm:inline">Create account</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(8,13,24,0.98),rgba(3,7,18,0.98)_46%,rgba(6,18,23,0.96))]" />
          <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

          <div className="relative mx-auto grid min-h-[640px] max-w-7xl min-w-0 gap-8 px-5 py-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:py-12">
            <div className="min-w-0 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
                <Radio className="h-4 w-4" />
                Live edge command center
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white md:text-6xl lg:text-5xl xl:text-6xl">
                Find the edge before the market moves.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 md:text-lg">
                AI-assisted odds analysis, Kelly sizing, and proof-first tracking for NBA, NFL,
                and MLB. Built for decisions that can be defended after the final whistle.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="w-full bg-cyan-300 px-7 font-semibold text-slate-950 hover:bg-cyan-200 sm:w-auto">
                  <a href="#live-desk">
                    Open Live Desk
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-white/15 bg-white/[0.04] px-7 font-semibold text-white hover:bg-white/[0.09] sm:w-auto"
                  asChild
                >
                  <a href="#model-lab">
                    Run Matchup
                    <Target className="ml-2 h-4 w-4 text-emerald-300" />
                  </a>
                </Button>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <StatTile
                  label="Posted lines"
                  value={String(postedLineCount)}
                  detail="Current market rows on desk"
                  accent="text-cyan-200"
                />
                <StatTile
                  label="Live now"
                  value={String(liveCount)}
                  detail="Games moving in real time"
                  accent="text-emerald-300"
                />
                <StatTile
                  label="Avg edge"
                  value={executionBoardEntries.length ? formatEdge(avgEdge) : "Pass"}
                  detail="Execution-adjusted board average"
                  accent="text-amber-200"
                />
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-xl border border-white/12 bg-slate-950/72 shadow-[0_30px_110px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Live desk preview
                  </div>
                  <div className="mt-1 text-xl font-semibold text-white">Market board</div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="rounded-md border border-white/10 px-3 py-1.5">{selectedSport.toUpperCase()}</span>
                  <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-emerald-200">
                    {liveSlateUpdatedAt
                      ? `Updated ${liveSlateUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Syncing"}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Matchup</th>
                      <th className="px-5 py-3 font-semibold">Signal</th>
                      <th className="px-5 py-3 font-semibold">Line</th>
                      <th className="px-5 py-3 font-semibold">Model</th>
                      <th className="px-5 py-3 font-semibold">Edge</th>
                      <th className="px-5 py-3 font-semibold">Stake</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {boardPreviewRows.length ? (
                      boardPreviewRows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-white/[0.035]">
                          <td className="px-5 py-4">
                            <div className="font-medium text-white">{row.eventLabel}</div>
                            <div className="mt-1 text-xs text-slate-500">{row.sportLabel}</div>
                          </td>
                          <td className="px-5 py-4 text-slate-200">{row.recommendedSide}</td>
                          <td className="px-5 py-4 font-mono text-cyan-200">{row.line}</td>
                          <td className="px-5 py-4 text-slate-300">{row.model}</td>
                          <td className="px-5 py-4 font-semibold text-emerald-300">{row.edge}</td>
                          <td className="px-5 py-4 text-slate-300">{row.stake}</td>
                          <td className="px-5 py-4">
                            <span className="rounded-md border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-100">
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-sm leading-6 text-slate-500">
                          No execution-qualified entries on the current {selectedSport.toUpperCase()} board. The desk is passing instead of inventing a signal.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-0 border-t border-white/10 lg:grid-cols-[1fr_0.9fr]">
                <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Bankroll control
                      </div>
                      <div className="mt-1 text-sm text-slate-300">Quarter-Kelly exposure</div>
                    </div>
                    <div className="text-xl font-semibold text-white">{formatMoney(bankroll)}</div>
                  </div>
                  <Slider value={[bankroll]} onValueChange={(v) => setBankroll(v[0])} min={100} max={10000} step={100} />
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                      <div className="text-slate-500">Min edge</div>
                      <div className="mt-1 font-semibold text-cyan-200">{minEdge}%</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                      <div className="text-slate-500">Kelly</div>
                      <div className="mt-1 font-semibold text-emerald-300">
                        {(kellyFraction * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Proof curve
                      </div>
                      <div className="mt-1 text-sm text-slate-300">Bankroll trend · illustrative, not historical results</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-white/10 text-slate-200 hover:bg-white/[0.08]"
                      onClick={() => setPerformanceData(generatePerformanceData())}
                    >
                      Refresh
                    </Button>
                  </div>
                  <MiniChart data={chartData} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="live-desk" className="border-b border-white/10 px-5 py-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <SectionHeader
                eyebrow="Live Desk"
                title="A usable slate, not a wall of hype."
                description="Pick a sport, inspect current games, and only act when the model and the execution filters agree."
              />
              <div className="flex rounded-lg border border-white/10 bg-white/[0.035] p-1">
                {LIVE_DESK_SPORTS.map((sport) => (
                  <Button
                    key={sport}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={
                      selectedSport === sport
                        ? "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                        : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                    }
                    onClick={() => {
                      setSelectedSport(sport);
                      setBacktestSummary(null);
                    }}
                  >
                    {sportShortLabel(sport)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_340px]">
              <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{sportName} market board</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Live slate with scores, prices, model probability, and execution-adjusted edge.
                    </p>
                  </div>
                  <div className="text-sm text-slate-500">
                    {liveSlateUpdatedAt
                      ? `Updated ${liveSlateUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Syncing live board"}
                  </div>
                </div>

                {isSlateLoading ? (
                  <div className="p-10 text-center text-slate-400">Loading the current slate...</div>
                ) : liveSlateError ? (
                  <div className="p-10 text-center text-red-200">{liveSlateError}</div>
                ) : analyzedGames.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">
                    No current {sportShortLabel(selectedSport)} games are on the board right now. The app stays quiet instead of inventing a pick.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="bg-slate-950/50 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Game</th>
                          <th className="px-5 py-3">Market</th>
                          <th className="px-5 py-3">Model pick</th>
                          <th className="px-5 py-3">Raw edge</th>
                          <th className="px-5 py-3">Execution</th>
                          <th className="px-5 py-3">Kelly</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8">
                        {analyzedGames.map(({ game, prediction }) => (
                          <tr key={game.id} className="hover:bg-white/[0.03]">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex -space-x-2">
                                  {game.awayLogo ? (
                                    <img src={game.awayLogo} alt="" className="h-8 w-8 rounded-full bg-white p-1" />
                                  ) : null}
                                  {game.homeLogo ? (
                                    <img src={game.homeLogo} alt="" className="h-8 w-8 rounded-full bg-white p-1" />
                                  ) : null}
                                </div>
                                <div>
                                  <div className="font-medium text-white">
                                    {game.awayAbbr} @ {game.homeAbbr}
                                  </div>
	                                  <div className="mt-1 text-xs text-slate-500">
	                                    {game.status.shortDetail} · {game.displayTime}
	                                  </div>
                                    <div
                                      className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                                        game.marketAudit?.source === "odds-api" && !game.marketAudit.stale
                                          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                                          : "border-amber-400/20 bg-amber-400/10 text-amber-200"
                                      }`}
                                      title={game.marketAudit?.fallbackReason}
                                    >
                                      {formatMarketAudit(game)}
                                    </div>
	                                </div>
	                              </div>
	                            </td>
                            <td className="px-5 py-4">
                              <div className="font-mono text-cyan-200">
                                {game.odds
                                  ? game.odds.drawMoneyline !== undefined
                                    ? `${formatOdds(game.odds.awayMoneyline)} / ${formatOdds(game.odds.drawMoneyline)} / ${formatOdds(game.odds.homeMoneyline)}`
                                    : `${formatOdds(game.odds.awayMoneyline)} / ${formatOdds(game.odds.homeMoneyline)}`
                                  : "Pending"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {game.odds?.drawMoneyline !== undefined
                                  ? "Away / Draw / Home"
                                  : `${game.odds?.spread !== undefined ? `Spread ${game.odds.spread}` : "Moneyline"} · O/U ${game.odds?.overUnder ?? "Pending"}`}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {prediction ? (
                                <>
                                  <div className="font-medium text-white">{prediction.predictedWinner}</div>
                                  <div className="mt-1 text-xs text-slate-500">{formatProb(prediction.confidence)} confidence</div>
                                </>
                              ) : (
                                <span className="text-slate-500">Waiting for line</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {prediction ? (
                                <span className={prediction.executionAdjustedEdge >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>
                                  {formatEdge(prediction.predictedWinnerEdge)}
                                </span>
                              ) : (
                                <span className="text-slate-500">Pending</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {prediction ? (
                                <div>
                                  <div className={prediction.executionAdjustedEdge >= 0 ? "font-semibold text-cyan-200" : "font-semibold text-red-300"}>
                                    {formatEdge(prediction.executionAdjustedEdge)}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {prediction.executionFactors.executionWindow} · {formatLineDelta(prediction.executionFactors.openToCurrentDelta)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500">No signal</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {prediction?.valueBet ? (
                                <div>
                                  <div className="font-semibold text-emerald-300">
                                    {formatMoney(prediction.valueBet.suggestedBet)}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {(prediction.valueBet.kellyPct * 100).toFixed(1)}% bankroll
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500">Pass</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <aside className="space-y-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                    <Target className="h-5 w-5 text-cyan-300" />
                    Signal controls
                  </h3>
                  <div className="mt-5 space-y-6">
                    <div>
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-400">
                          <DollarSign className="h-4 w-4" /> Bankroll
                        </span>
                        <span className="font-semibold text-white">{formatMoney(bankroll)}</span>
                      </div>
                      <Slider value={[bankroll]} onValueChange={(v) => setBankroll(v[0])} min={100} max={10000} step={100} />
                    </div>
                    <div>
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-400">
                          <Percent className="h-4 w-4" /> Min edge
                        </span>
                        <span className="font-semibold text-white">{minEdge}%</span>
                      </div>
                      <Slider value={[minEdge]} onValueChange={(v) => setMinEdge(v[0])} min={0} max={10} step={0.5} />
                    </div>
                    <div>
                      <div className="mb-3 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-400">
                          <Shield className="h-4 w-4" /> Kelly fraction
                        </span>
                        <span className="font-semibold text-white">{(kellyFraction * 100).toFixed(0)}%</span>
                      </div>
                      <Slider value={[kellyFraction]} onValueChange={(v) => setKellyFraction(v[0])} min={0.1} max={1} step={0.05} />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.055] p-5">
                  <h3 className="text-lg font-semibold text-white">Current read</h3>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Value flags</span>
                      <span className="font-semibold text-emerald-300">{valueBets.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Execution rows</span>
                      <span className="font-semibold text-cyan-200">{executionBoardEntries.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Best edge</span>
                      <span className="font-semibold text-amber-200">
                        {topExecutionEntries[0] ? formatEdge(topExecutionEntries[0].executionAdjustedEdge) : "Pass"}
                      </span>
                    </div>
                  </div>
                  <Button asChild className="mt-5 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                    <Link to="/daily-picks">
                      Open full daily picks
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section id="proof" className="border-b border-white/10 bg-slate-950/40 px-5 py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Proof System"
              title="Every recommendation should leave evidence."
              description="The product is built around auditable signals: model probability, execution-adjusted edge, recommended stake, and proof history."
            />

            <div className="mt-8 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6">
                <h3 className="flex items-center gap-2 text-xl font-semibold text-white">
                  <Trophy className="h-5 w-5 text-amber-300" />
                  Proof ledger preview
                </h3>
                <div className="mt-5 space-y-4">
                  {productProof.map((item) => (
                    <div key={item.label} className="rounded-lg border border-white/10 bg-slate-950/50 p-4">
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{item.value}</p>
                    </div>
                  ))}
                </div>
                <Button asChild variant="outline" className="mt-6 border-white/10 text-slate-200 hover:bg-white/[0.08]">
                  <Link to="/leaderboard">
                    See leaderboard and archive
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-xl font-semibold text-white">
                      <BarChart3 className="h-5 w-5 text-cyan-300" />
                      Backtest console
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Deterministic illustrative simulation — not historical results. The real settled record is the execution ledger.
                    </p>
                  </div>
                  <Button onClick={runBacktest} disabled={isBacktesting} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                    {isBacktesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Activity className="mr-2 h-4 w-4" />}
                    {isBacktesting ? "Running..." : "Run illustrative backtest"}
                  </Button>
                </div>

                {backtestSummary ? (
                  <div className="mt-6 space-y-5">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                      <StatTile label="Games" value={String(backtestSummary.totalGames)} detail="Illustrative" />
                      <StatTile label="Accuracy" value={`${(backtestSummary.accuracy * 100).toFixed(1)}%`} detail="Winner calls" accent="text-cyan-200" />
                      <StatTile label="Profit" value={formatMoney(backtestSummary.totalProfit)} detail="Simulated P/L" accent={backtestSummary.totalProfit >= 0 ? "text-emerald-300" : "text-red-300"} />
                      <StatTile label="ROI" value={`${backtestSummary.roi.toFixed(1)}%`} detail="Bet ROI" accent={backtestSummary.roi >= 0 ? "text-emerald-300" : "text-red-300"} />
                      <StatTile label="Sharpe" value={backtestSummary.sharpeRatio.toFixed(2)} detail="Risk-adjusted" accent="text-amber-200" />
                    </div>
                    <div className="h-56 w-full min-w-0 rounded-lg border border-white/10 bg-slate-950/50 p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={backtestSummary.profitByMonth}>
                          <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
                          <XAxis dataKey="month" stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} />
                          <YAxis stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            contentStyle={{
                              background: "rgba(2, 6, 23, 0.96)",
                              border: "1px solid rgba(148, 163, 184, 0.22)",
                              borderRadius: 8,
                            }}
                          />
                          <Bar dataKey="profit" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/50 p-8 text-center">
                    <LineChartIcon className="mx-auto h-10 w-10 text-slate-600" />
                    <h4 className="mt-4 text-lg font-semibold text-white">Run the proof loop</h4>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                      Generate a six-month simulation for the selected sport, then inspect profit, ROI, drawdown, and monthly movement.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section id="sports-stack" className="border-b border-white/10 px-5 py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Sports Stack"
              title="The repo ecosystem is labeled honestly."
              description="The live product points to the active model and Kelly repos first, with older analytics tools marked as archives instead of pretending every support repo is production-live."
            />

            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sportsStackRepos.map((repo) => (
                <a
                  key={repo.name}
                  href={repo.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-xl border border-white/10 bg-white/[0.035] p-5 transition-colors hover:border-cyan-300/30 hover:bg-white/[0.055]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-slate-950/70 text-slate-300 group-hover:text-cyan-200">
                        <GitBranch className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">{repo.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{repo.role}</div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        repo.status === "Active"
                          ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                          : "border-amber-300/25 bg-amber-300/10 text-amber-100"
                      }
                    >
                      {repo.status}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-400">{repo.description}</p>
                  <div className="mt-5 inline-flex items-center text-sm font-semibold text-cyan-200">
                    Open repo
                    <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="model-lab" className="border-b border-white/10 px-5 py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Model Lab"
              title="Pressure-test a matchup in seconds."
              description="Drop in two teams, tune bankroll settings, and get a clear pass-or-play report with the assumptions exposed."
            />

            <div className="mt-8 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6">
                <Tabs defaultValue="analyze">
                  <TabsList className="grid w-full grid-cols-3 border border-white/10 bg-slate-950/70">
                    <TabsTrigger value="analyze" className="data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950">
                      Analyze
                    </TabsTrigger>
                    <TabsTrigger value="value" className="data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950">
                      Value
                    </TabsTrigger>
                    <TabsTrigger value="workflow" className="data-[state=active]:bg-cyan-300 data-[state=active]:text-slate-950">
                      Workflow
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="analyze" className="mt-6 space-y-4">
                    <label className="text-sm font-medium text-slate-300" htmlFor="game-input">
                      Matchup
                    </label>
                    <Textarea
                      id="game-input"
                      value={gameInput}
                      onChange={(event) => setGameInput(event.target.value)}
                      placeholder={`Try "${selectedSport === "nba" ? "Lakers vs Warriors" : selectedSport === "nfl" ? "Bills vs Chiefs" : selectedSport === "wc" ? "Brazil vs Morocco" : "Dodgers vs Padres"}"`}
                      className="min-h-28 border-white/10 bg-slate-950/70 text-white placeholder:text-slate-600"
                    />
                    <Button
                      onClick={analyzeBetting}
                      disabled={isLoading}
                      className="w-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"
                    >
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                      {isLoading ? "Running model..." : "Run matchup model"}
                    </Button>
                  </TabsContent>

                  <TabsContent value="value" className="mt-6 space-y-4">
                    {valueBets.length ? (
                      valueBets.slice(0, 4).map((prediction) =>
                        prediction.valueBet ? (
                          <div key={`${prediction.homeTeam}-${prediction.awayTeam}`} className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-semibold text-white">{prediction.valueBet.team}</div>
                                <div className="mt-1 text-xs text-slate-400">
                                  {prediction.awayTeam} @ {prediction.homeTeam}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-emerald-200">{formatEdge(prediction.valueBet.executionAdjustedEdge)}</div>
                                <div className="mt-1 text-xs text-slate-400">{formatMoney(prediction.valueBet.suggestedBet)}</div>
                              </div>
                            </div>
                          </div>
                        ) : null,
                      )
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-slate-950/60 p-6 text-sm leading-6 text-slate-400">
                        No current value bet clears your threshold. Lower the edge filter or wait for a better number.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="workflow" className="mt-6 space-y-3">
                    {workflowSteps.map((step, index) => (
                      <div key={step} className="flex gap-3 rounded-lg border border-white/10 bg-slate-950/60 p-4">
                        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-cyan-300/10 text-sm font-semibold text-cyan-200">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-6 text-slate-400">{step}</p>
                      </div>
                    ))}
                  </TabsContent>
                </Tabs>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Matchup report
                    </div>
                    <h3 className="mt-1 text-xl font-semibold text-white">Model output</h3>
                  </div>
                  {bettingAdvice ? (
                    <Button variant="outline" className="border-white/10 text-slate-200 hover:bg-white/[0.08]" onClick={copyAdvice}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </Button>
                  ) : null}
                </div>
                <pre className="mt-5 min-h-[360px] whitespace-pre-wrap rounded-lg border border-white/10 bg-[#020617] p-5 text-sm leading-7 text-slate-300">
                  {bettingAdvice ||
                    `AI ADVANTAGE MATCHUP REPORT

Choose a sport, enter a matchup, and run the model.

The report will show:
- Predicted winner and confidence
- Moneyline odds and implied probability
- Raw edge and execution-adjusted edge
- Kelly stake guidance for your bankroll
- A pass/play recommendation`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-b border-white/10 bg-slate-950/40 px-5 py-16">
          <div className="mx-auto max-w-7xl">
            <SectionHeader
              eyebrow="Pricing"
              title="Upgrade only when the product earns the click."
              description="The free surface stays useful. Premium unlocks deeper boards, historical ledgers, workflow tools, and future alerting."
            />

            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-semibold text-white">Free Desk</h3>
                  <Badge className="border-white/10 bg-white/[0.05] text-slate-300">Open</Badge>
                </div>
                <div className="mt-6 text-4xl font-semibold text-white">$0</div>
                <ul className="mt-6 space-y-3">
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-400">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="mt-8 w-full border-white/10 text-slate-200 hover:bg-white/[0.08]">
                  <a href="#model-lab">Run a free matchup</a>
                </Button>
              </div>

              <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/[0.06] p-6 shadow-[0_24px_80px_rgba(34,211,238,0.08)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-semibold text-white">Pro Monthly</h3>
                  <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">Best fit</Badge>
                </div>
                <div className="mt-6 text-4xl font-semibold text-white">$19</div>
                <div className="mt-2 text-sm text-slate-400">Monthly Stripe subscription</div>
                <ul className="mt-6 space-y-3">
                  {PREMIUM_FEATURES.slice(0, 5).map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-300">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button className="mt-8 w-full bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => handleUpgrade("premium")}>
                  <Crown className="mr-2 h-4 w-4" />
                  Upgrade with Stripe
                </Button>
              </div>

              <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.055] p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-semibold text-white">Event Pass</h3>
                  <Badge className="border-amber-300/30 bg-amber-300/10 text-amber-100">72 hours</Badge>
                </div>
                <div className="mt-6 text-4xl font-semibold text-white">$10</div>
                <div className="mt-2 text-sm text-slate-400">One-time card or crypto unlock</div>
                <ul className="mt-6 space-y-3">
                  {PREMIUM_FEATURES.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-300">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-amber-200" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 grid gap-3">
                  <Button className="w-full bg-amber-300 text-slate-950 hover:bg-amber-200" onClick={() => handleUpgrade("one-time")}>
                    <Flame className="mr-2 h-4 w-4" />
                    One-time Stripe pass
                  </Button>
                  <Button variant="outline" className="w-full border-amber-300/20 text-amber-100 hover:bg-amber-300/10" onClick={() => openCryptoUnlock("big-game")}>
                    <Bitcoin className="mr-2 h-4 w-4" />
                    Pay with crypto
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-slate-950/60 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-2 text-cyan-200">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-white">Payment rail status</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {billingStatus
                        ? billingStatus.premiumCheckoutReady && billingStatus.oneTimeCheckoutReady
                          ? billingStatus.stripeWebhookConfigured && billingStatus.entitlementStoreConfigured
                            ? "Stripe Checkout, webhook fulfillment, and server entitlements are ready."
                            : "Stripe Checkout is ready, but webhook fulfillment or entitlements still need production envs."
                          : billingStatus.stripeSecretConfigured
                            ? "Card checkout is waiting on Stripe Price IDs in Netlify. Crypto unlock remains available."
                            : "Card checkout is waiting on the Stripe secret key in Netlify. Crypto unlock remains available."
                        : "Checking Stripe readiness from the backend."}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={
                      billingStatus?.premiumCheckoutReady
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        : "border-amber-300/30 bg-amber-300/10 text-amber-100"
                    }
                  >
                    Pro {billingStatus?.premiumCheckoutReady ? "ready" : "pending"}
                  </Badge>
                  <Badge
                    className={
                      billingStatus?.oneTimeCheckoutReady
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        : "border-amber-300/30 bg-amber-300/10 text-amber-100"
                    }
                  >
                    Event {billingStatus?.oneTimeCheckoutReady ? "ready" : "pending"}
                  </Badge>
                  {billingStatus?.automaticTaxEnabled ? (
                    <Badge className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">Tax enabled</Badge>
                  ) : null}
                  <Badge
                    className={
                      billingStatus?.stripeWebhookConfigured
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        : "border-amber-300/30 bg-amber-300/10 text-amber-100"
                    }
                  >
                    Webhook {billingStatus?.stripeWebhookConfigured ? "ready" : "pending"}
                  </Badge>
                  <Badge
                    className={
                      billingStatus?.entitlementStoreConfigured
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
                        : "border-amber-300/30 bg-amber-300/10 text-amber-100"
                    }
                  >
                    Entitlements {billingStatus?.entitlementStoreConfigured ? "ready" : "pending"}
                  </Badge>
                </div>
              </div>
            </div>

            {hasPaidAccess ? (
              <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-semibold text-white">Access active: {access.label}</div>
                    <div className="mt-1 text-sm text-emerald-100/75">
                      {hasFullVaultAccess ? "Full premium vault unlocked." : "Event-tier premium access is active on this browser."}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-emerald-300/20 text-emerald-100 hover:bg-emerald-300/10"
                    onClick={() => {
                      signOutAccessSession();
                      syncAccessUi();
                      toast({ title: "Premium session cleared" });
                    }}
                  >
                    Clear session
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="px-5 py-16">
          <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <SectionHeader
                eyebrow="Updates"
                title="Get the research notes without leaving the desk."
                description="Join AllowayAI for product updates, betting-model notes, and public proof artifacts as they ship."
              />
              <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.035] p-5">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Bitcoin className="h-5 w-5 text-amber-200" />
                  Support the build
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Prefer crypto support over tip-jar fluff. This goes straight to the AI Advantage wallet.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                    {ETH_DONATION_ADDRESS}
                  </code>
                  <Button variant="outline" className="border-white/10 text-slate-200 hover:bg-white/[0.08]" onClick={copyEthAddress}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy wallet
                  </Button>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
              <SubstackEmbed className="mx-auto max-w-xl" />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold text-slate-300">AI Advantage Sports</div>
            <div className="mt-1">AI-assisted sports intelligence. Bet responsibly.</div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link to="/daily-picks" className="hover:text-white">Daily Picks</Link>
            <Link to="/leaderboard" className="hover:text-white">Proof Ledger</Link>
            <Link to="/profile" className="hover:text-white">Profile</Link>
            <button type="button" className="hover:text-white" onClick={() => setShowAccessDialog(true)}>
              Restore access
            </button>
          </div>
        </div>
      </footer>

      <CryptoPaymentModal
        open={showCryptoModal}
        onOpenChange={setShowCryptoModal}
        unlockType={cryptoUnlockType}
        onSuccess={syncAccessUi}
      />
      <AccessSessionDialog
        open={showAccessDialog}
        onOpenChange={setShowAccessDialog}
        onSessionChange={syncAccessUi}
      />
    </div>
  );
}

export default Index;
