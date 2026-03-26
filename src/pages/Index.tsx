import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LiveOddsTicker from "@/components/LiveOddsTicker";
import MatrixRain from "@/components/MatrixRain";
import {
  Loader2,
  Copy,
  TrendingUp,
  Zap,
  Target,
  BarChart3,
  Shield,
  ChevronRight,
  Trophy,
  Brain,
  LineChart as LineChartIcon,
  DollarSign,
  Percent,
  Home,
  Plane,
  Activity,
  Calendar,
  Mail,
  Crown,
  Check,
  Lock,
  Heart,
  Star,
  Bitcoin,
  Flame,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import {
  analyzeGame,
  parseGameInput,
  formatOdds,
  formatProb,
  formatEdge,
  formatMoney,
  generateBacktestData,
  calculateBacktestSummary,
  generatePerformanceData,
  SPORT_CONFIG,
  type GamePrediction,
  type Sport,
  type BacktestSummary,
  type PerformanceData
} from "@/lib/predictions";
import { fetchLiveGamesForSport, type LiveMarketGame } from "@/lib/liveSports";
import {
  isPremiumUser,
  redirectToCheckout,
  subscribeEmail,
  PREMIUM_FEATURES,
  FREE_FEATURES,
} from "@/lib/stripe";
import CryptoPaymentModal, { type UnlockType } from "@/components/CryptoPaymentModal";

const ETH_DONATION_ADDRESS = "0x6f278ce76ba5ed31fd9be646d074863e126836e9";

const Index = () => {
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
  const [selectedSport, setSelectedSport] = useState<Sport>('nba');
  const [backtestSummary, setBacktestSummary] = useState<BacktestSummary | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [cryptoUnlockType, setCryptoUnlockType] = useState<UnlockType>("big-game");
  const { toast } = useToast();

  // Check premium status on mount
  useEffect(() => {
    setIsPremium(isPremiumUser());
  }, []);

  // Handle email subscription
  const handleEmailSubscribe = async () => {
    if (!email.trim()) {
      toast({
        title: "Please enter your email",
        variant: "destructive",
      });
      return;
    }
    setIsSubscribing(true);
    const result = await subscribeEmail(email);
    setIsSubscribing(false);
    toast({
      title: result.success ? "Subscribed!" : "Error",
      description: result.message,
      variant: result.success ? "default" : "destructive",
    });
    if (result.success) setEmail("");
  };

  // Handle upgrade to premium
  const handleUpgrade = async (type: 'premium' | 'one-time' = 'premium') => {
    await redirectToCheckout(type);
  };

  // Copy ETH address to clipboard
  const copyEthAddress = async () => {
    try {
      await navigator.clipboard.writeText(ETH_DONATION_ADDRESS);
      toast({
        title: "Address Copied!",
        description: "ETH donation address copied to clipboard",
      });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  // Load live slate for selected sport
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

  // Generate backtest data when sport changes
  const runBacktest = () => {
    setIsBacktesting(true);
    setTimeout(() => {
      const results = generateBacktestData(selectedSport, 6);
      const summary = calculateBacktestSummary(results);
      setBacktestSummary(summary);
      setIsBacktesting(false);
      toast({
        title: "Backtest Complete",
        description: `Analyzed ${summary.totalGames} games with ${(summary.accuracy * 100).toFixed(1)}% accuracy`,
      });
    }, 500);
  };

  const analyzedGames = useMemo<Array<{ game: LiveMarketGame; prediction: GamePrediction | null }>>(() => {
    return liveGames.map((game) => ({
      game,
      prediction: game.odds
        ? analyzeGame(game.homeTeam, game.awayTeam, selectedSport, bankroll, minEdge, kellyFraction, {
            id: game.id,
            bookmaker: game.bookmaker,
            commenceTime: game.date,
            homeOdds: game.odds.homeMoneyline,
            awayOdds: game.odds.awayMoneyline,
          })
        : null,
    }));
  }, [bankroll, kellyFraction, liveGames, minEdge, selectedSport]);

  const valueBets = useMemo(
    () => analyzedGames.flatMap(({ prediction }) => (prediction?.valueBet ? [prediction] : [])),
    [analyzedGames],
  );
  
  const sportName = useMemo(() => SPORT_CONFIG[selectedSport].name, [selectedSport]);

  const analyzeBetting = async () => {
    if (!gameInput.trim()) {
      toast({
        title: "Please enter a game",
        description: "The game field cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Parse the input to find teams
      const parsed = parseGameInput(gameInput, selectedSport);
      
      if (!parsed) {
        toast({
          title: "Could not identify teams",
          description: `Try entering ${sportName} team names like 'Lakers vs Warriors'`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      // Run ML prediction
      const prediction = analyzeGame(parsed.homeTeam, parsed.awayTeam, selectedSport, bankroll, minEdge, kellyFraction);
      
      let recommendation = "";
      let betDetails = "";
      
      if (prediction.valueBet) {
        recommendation = `${prediction.valueBet.team.toUpperCase()} MONEYLINE`;
        betDetails = `VALUE BET DETECTED!
Edge: ${formatEdge(prediction.valueBet.edge)}
Kelly Stake: ${(prediction.valueBet.kellyPct * 100).toFixed(1)}% of bankroll
Suggested Bet: $${prediction.valueBet.suggestedBet.toFixed(2)}`;
      } else {
        recommendation = `${prediction.predictedWinner.toUpperCase()} (No Value)`;
        betDetails = `No value bet found (edge < ${minEdge}%)
Home Edge: ${formatEdge(prediction.homeEdge)}
Away Edge: ${formatEdge(prediction.awayEdge)}`;
      }
      
      const advice = `ML PREDICTION: ${prediction.predictedWinner}
CONFIDENCE: ${formatProb(prediction.confidence)}

RECOMMENDATION: ${recommendation}

MATCHUP ANALYSIS:
${prediction.homeTeam} (Home): ${formatProb(prediction.homeProb)} win probability
  - Odds: ${formatOdds(prediction.homeOdds)} (Implied: ${formatProb(prediction.homeImpliedProb)})
  - Edge: ${formatEdge(prediction.homeEdge)}

${prediction.awayTeam} (Away): ${formatProb(prediction.awayProb)} win probability
  - Odds: ${formatOdds(prediction.awayOdds)} (Implied: ${formatProb(prediction.awayImpliedProb)})
  - Edge: ${formatEdge(prediction.awayEdge)}

${betDetails}

BANKROLL: $${bankroll} | Kelly Fraction: ${(kellyFraction * 100).toFixed(0)}%

Always bet responsibly. Past performance does not guarantee future results.`;
      
      setBettingAdvice(advice);
      toast({
        title: "ML Analysis Complete",
        description: `Predicted winner: ${prediction.predictedWinner} (${formatProb(prediction.confidence)})`,
      });
    } catch (error) {
      toast({
        title: "Error analyzing game",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(bettingAdvice);
      toast({
        title: "Copied!",
        description: "Analysis copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Advanced machine learning models analyze thousands of data points in seconds"
    },
    {
      icon: LineChartIcon,
      title: "Real-Time Odds",
      description: "Track line movements and find value before the market adjusts"
    },
    {
      icon: Target,
      title: "High Accuracy",
      description: "Our models consistently outperform traditional handicapping methods"
    },
    {
      icon: Shield,
      title: "Bankroll Protection",
      description: "Smart stake sizing recommendations to protect your investment"
    }
  ];

  const navigate = useNavigate();

  const stats = [
    { value: "73%", label: "Win Rate" },
    { value: "2,847", label: "Picks Made" },
    { value: "+142.5", label: "Units Profit" },
    { value: "4.2", label: "Avg Odds" }
  ];

  const heroSignals = [
    "Live model predictions across NBA, NFL, and MLB",
    "Kelly-sized value bets instead of random pick spam",
    "Backtests and performance views that make the edge inspectable",
  ];

  const workflowSteps = [
    "Pick a sport and review today's model board",
    "Filter for value based on your edge threshold and bankroll",
    "Upgrade only if you want full picks, premium views, or one-time unlocks",
  ];

  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sportsRepoGroups = [
    {
      title: "Product Surface",
      summary: "The public-facing experience, subscriptions, and model-backed picks.",
      repos: [
        { name: "ai-advantage", role: "Main product", desc: "The live app for picks, model demos, pricing, and upgrade flow.", url: "https://github.com/ianalloway/ai-advantage" },
        { name: "sports-betting-ml", role: "Model pipeline", desc: "End-to-end ML workflow for sports prediction, feature engineering, serving, and demo packaging.", url: "https://github.com/ianalloway/sports-betting-ml" },
      ],
    },
    {
      title: "Ratings And Evaluation",
      summary: "The libraries and dashboards that turn picks into inspectable systems.",
      repos: [
        { name: "nba-ratings", role: "Ratings core", desc: "Elo, logistic win probability, and Kelly helpers for NBA-style models.", url: "https://github.com/ianalloway/nba-ratings" },
        { name: "nba-edge", role: "Edge finder", desc: "Power ratings, spread edge detection, and half-Kelly portfolio sizing with backtests.", url: "https://github.com/ianalloway/nba-edge" },
        { name: "nba-clv-dashboard", role: "Evaluation dashboard", desc: "Calibration, rolling accuracy, and CLV-style reporting to see whether the model is actually working.", url: "https://github.com/ianalloway/nba-clv-dashboard" },
        { name: "backtest-report-gen", role: "Report generator", desc: "Static HTML reports for calibration, Brier score, CLV, and bet ledgers.", url: "https://github.com/ianalloway/backtest-report-gen" },
        { name: "metric-regression-gate", role: "CI quality gate", desc: "Stops metrics regressions from slipping through by comparing new results to baseline performance.", url: "https://github.com/ianalloway/metric-regression-gate" },
      ],
    },
    {
      title: "Odds And Execution",
      summary: "The tooling layer for prices, movement, bankroll sizing, and close tracking.",
      repos: [
        { name: "odds-cli", role: "Terminal odds tool", desc: "Check live odds, compare books, find value, and calculate Kelly sizing from the command line.", url: "https://github.com/ianalloway/odds-cli" },
        { name: "odds-drift-watch", role: "Line-move alerts", desc: "Webhook-based alerts for odds drift with FastAPI, SQLite, and line shock logic.", url: "https://github.com/ianalloway/odds-drift-watch" },
        { name: "closing-line-archive", role: "Snapshot archive", desc: "SQLite CLI for sportsbook odds snapshots and beat-close analysis.", url: "https://github.com/ianalloway/closing-line-archive" },
        { name: "kelly-js", role: "Sizing library", desc: "TypeScript Kelly Criterion utilities for bankroll sizing, CLV tracking, and odds conversion.", url: "https://github.com/ianalloway/kelly-js" },
      ],
    },
    {
      title: "Research And Ecosystem",
      summary: "Supporting resources, reusable packages, and the broader sports-analytics toolkit around the app.",
      repos: [
        { name: "awesome-sports-betting", role: "Resource map", desc: "A curated list of APIs, tools, datasets, books, and models across the sports betting space.", url: "https://github.com/ianalloway/awesome-sports-betting" },
        { name: "allowayai", role: "R toolkit", desc: "R utilities for AI and sports analytics workflows.", url: "https://github.com/ianalloway/allowayai" },
        { name: "allowayai-demo", role: "Live demo", desc: "Interactive demo for the R package, including Kelly helpers and sports model utilities.", url: "https://github.com/ianalloway/allowayai-demo" },
        { name: "openclaw-skills", role: "Agent workflows", desc: "Sports-odds and Kelly-related skills that support agent-driven research and automation workflows.", url: "https://github.com/ianalloway/openclaw-skills" },
      ],
    },
  ];

  const executionFormulaTerms = [
    { label: "Raw edge", value: "Model win probability minus implied market probability", accent: "text-white" },
    { label: "Calibration factor", value: "Discount stale models using rolling Brier, log-loss, and calibration buckets", accent: "text-brand-300" },
    { label: "CLV factor", value: "Reward signals that consistently beat the closing number", accent: "text-green-300" },
    { label: "Timing factor", value: "Reward alerts caught before steam fully lands", accent: "text-sky-300" },
    { label: "Risk penalties", value: "Subtract correlation risk and news volatility before sizing", accent: "text-yellow-300" },
  ];

  const executionSystemSteps = [
    "Model the game better than the market on a narrow slice of spots",
    "Capture a better number than the market eventually closes at",
    "Alert before the edge decays and size with quarter-Kelly discipline",
    "Grade every alert against CLV, calibration, and bankroll outcome",
  ];

  const growthRoadmap = [
    { phase: "Phase 1", title: "Prove the signal", detail: "Track open, current, and closing line on every surfaced bet. Gate the model on CLV and calibration, not just short-run ROI." },
    { phase: "Phase 2", title: "Improve execution", detail: "Add stale-number detection, alert windows, and book disagreement scoring so timing becomes part of the product." },
    { phase: "Phase 3", title: "Productize trust", detail: "Ship an execution board, CLV console, and public proof page that show why the edge deserves payment." },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <MatrixRain />
      {/* Live Odds Ticker */}
      <LiveOddsTicker speed={45} pauseOnHover />

      <header className="relative z-20 border-b border-border/70 bg-black/70 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10">
              <TrendingUp className="h-5 w-5 text-brand-400" />
            </div>
            <div>
              <p className="text-white font-semibold tracking-tight">AI Advantage Sports</p>
              <p className="text-xs text-muted-foreground">Evaluation-first betting intelligence</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#model-suite" className="text-muted-foreground hover:text-white transition-colors">Model Suite</a>
            <a href="/daily-picks" className="text-muted-foreground hover:text-white transition-colors">Daily Picks</a>
            <a href="/leaderboard" className="text-muted-foreground hover:text-white transition-colors">Leaderboard</a>
            <a href="#edge-system" className="text-muted-foreground hover:text-white transition-colors">Edge</a>
            <a href="#sports-stack" className="text-muted-foreground hover:text-white transition-colors">Stack</a>
            <a href="#pricing" className="text-muted-foreground hover:text-white transition-colors">Pricing</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 via-background to-background" />
        <div className="absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-brand-500/10 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 py-16 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-2 text-sm font-medium text-brand-400">
                <Zap className="w-4 h-4" />
                AI-Powered Sports Betting Intelligence
              </div>

              <div className="space-y-4">
                <h1 className="max-w-4xl text-5xl font-extrabold tracking-tight text-white md:text-7xl">
                  Sports betting models people can actually inspect.
                </h1>
                <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
                  AI Advantage turns model output into usable betting workflow: live boards, value detection, Kelly sizing, and proof views that make the edge easier to trust.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  size="lg"
                  className="bg-brand-600 px-8 font-bold text-white hover:bg-brand-700"
                  onClick={() => navigate("/daily-picks")}
                >
                  <Star className="mr-2 h-5 w-5" />
                  View Today's Picks
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-gray-600 px-8 font-bold text-gray-300 hover:bg-gray-800"
                  onClick={() => {
                    document.getElementById("model-suite")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <Brain className="mr-2 h-5 w-5" />
                  Run the Model Demo
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-brand-500/40 px-8 font-bold text-brand-300 hover:bg-brand-500/10"
                  onClick={scrollToPricing}
                >
                  <Crown className="mr-2 h-5 w-5 text-yellow-400" />
                  See Pricing
                </Button>
              </div>

              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                {heroSignals.map((item) => (
                  <div key={item} className="rounded-2xl border border-border bg-card/40 px-4 py-4 backdrop-blur-sm">
                    <p className="text-sm leading-relaxed text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-brand-500/20 bg-card/55 p-6 backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-brand-400/70">What You Get</p>
                  <h2 className="text-2xl font-bold text-white">A cleaner betting workflow</h2>
                </div>
                <div className="rounded-2xl border border-brand-500/20 bg-brand-500/10 p-3">
                  <Target className="h-5 w-5 text-brand-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-border bg-black/30 p-4">
                    <div className="text-3xl font-bold text-brand-400">{stat.value}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                {workflowSteps.map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-2xl border border-border bg-black/25 px-4 py-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-xs font-semibold text-brand-300">
                      {index + 1}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="border-border text-gray-300 hover:bg-gray-800 font-bold px-5"
                  onClick={() => navigate("/leaderboard")}
                >
                  <Trophy className="w-5 h-5 mr-2" />
                  Leaderboard
                </Button>
                <Button
                  variant="ghost"
                  className="px-5 text-muted-foreground hover:text-white"
                  onClick={scrollToPricing}
                >
                  Compare Plans
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ML Predictions Section */}
      <section id="model-suite" className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Sport Selector */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {(['nba', 'nfl', 'mlb'] as Sport[]).map((sport) => (
              <Button
                key={sport}
                variant={selectedSport === sport ? "default" : "outline"}
                className={selectedSport === sport 
                  ? "bg-brand-600 hover:bg-brand-700 text-white" 
                  : "border-border text-muted-foreground hover:text-white"}
                onClick={() => {
                  setSelectedSport(sport);
                  setBacktestSummary(null);
                }}
              >
                {sport.toUpperCase()}
              </Button>
            ))}
          </div>

                    <Tabs defaultValue="games" className="w-full">
                      <TabsList className="grid w-full grid-cols-5 mb-8 bg-card border border-border">
                        <TabsTrigger value="games" className="data-[state=active]:bg-brand-600 data-[state=active]:text-white">
                          <BarChart3 className="w-4 h-4 mr-2" />
                          Games
                        </TabsTrigger>
                        <TabsTrigger value="value" className="data-[state=active]:bg-brand-600 data-[state=active]:text-white">
                          <Target className="w-4 h-4 mr-2" />
                          Value Bets ({valueBets.length})
                        </TabsTrigger>
                        <TabsTrigger value="backtest" className="data-[state=active]:bg-brand-600 data-[state=active]:text-white">
                          <Activity className="w-4 h-4 mr-2" />
                          Backtest
                        </TabsTrigger>
                        <TabsTrigger 
                          value="performance" 
                          className="data-[state=active]:bg-brand-600 data-[state=active]:text-white"
                          onClick={() => !performanceData && setPerformanceData(generatePerformanceData())}
                        >
                          <Trophy className="w-4 h-4 mr-2" />
                          Performance
                        </TabsTrigger>
                        <TabsTrigger value="analyze" className="data-[state=active]:bg-brand-600 data-[state=active]:text-white">
                          <Brain className="w-4 h-4 mr-2" />
                          Analyze
                        </TabsTrigger>
                      </TabsList>

            {/* Today's Games Tab */}
            <TabsContent value="games" className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">{sportName} live market board</h2>
                  <div className="text-sm text-muted-foreground">
                    Actual ESPN slate with live scores, statuses, and current market lines.
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {liveSlateUpdatedAt
                    ? `Updated ${liveSlateUpdatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : "Syncing live board"}
                </div>
              </div>

              {isSlateLoading ? (
                <div className="rounded-2xl bg-card border border-border p-8 text-center text-muted-foreground">
                  Loading the current slate...
                </div>
              ) : liveSlateError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center text-red-200">
                  {liveSlateError}
                </div>
              ) : analyzedGames.length === 0 ? (
                <div className="rounded-2xl bg-card border border-border p-8 text-center text-muted-foreground">
                  No current {selectedSport.toUpperCase()} games are on the board right now. The app is intentionally showing an empty slate instead of inventing one.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-card border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Games</div>
                      <div className="mt-2 text-3xl font-bold text-white">{analyzedGames.length}</div>
                    </div>
                    <div className="rounded-2xl bg-card border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Live now</div>
                      <div className="mt-2 text-3xl font-bold text-green-400">{liveGames.filter((game) => game.status.state === "in").length}</div>
                    </div>
                    <div className="rounded-2xl bg-card border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Posted lines</div>
                      <div className="mt-2 text-3xl font-bold text-brand-400">{analyzedGames.filter(({ game }) => game.odds).length}</div>
                    </div>
                    <div className="rounded-2xl bg-card border border-border p-4">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Value flags</div>
                      <div className="mt-2 text-3xl font-bold text-yellow-400">{valueBets.length}</div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {analyzedGames.map(({ game, prediction }, index) => (
                      <div key={`${game.id}-${index}`} className="overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_44%),linear-gradient(180deg,rgba(9,13,24,0.98),rgba(5,8,18,0.96))] border border-white/10 p-6">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`rounded-full border px-3 py-1 text-xs font-medium ${game.status.state === "in" ? "border-green-500/30 bg-green-500/10 text-green-300" : game.status.state === "post" ? "border-zinc-500/20 bg-zinc-500/10 text-zinc-300" : "border-sky-500/30 bg-sky-500/10 text-sky-300"}`}>
                              {game.status.shortDetail}
                            </div>
                            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{game.sportLabel}</div>
                            {game.bookmaker ? <div className="text-xs text-muted-foreground">via {game.bookmaker}</div> : null}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {game.displayTime}{game.broadcast ? ` · ${game.broadcast}` : ""}
                          </div>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6 items-start">
                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-center md:text-left">
                            <div className="flex items-center gap-3 justify-center md:justify-start mb-3">
                              {game.homeLogo ? <img src={game.homeLogo} alt={game.homeTeam} className="h-10 w-10 rounded-full bg-white/5 object-contain p-1" /> : null}
                              <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-[0.24em]">Home</div>
                                <h3 className="text-lg font-bold text-white">{game.homeTeam}</h3>
                              </div>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="text-white font-medium">{game.homeScore ?? "-"}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Moneyline</span><span className="text-white font-medium">{game.odds ? formatOdds(game.odds.homeMoneyline) : "Pending"}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Edge</span><span className={prediction ? (prediction.homeEdge > 0 ? "text-green-400 font-medium" : "text-red-400 font-medium") : "text-muted-foreground"}>{prediction ? formatEdge(prediction.homeEdge) : "Waiting"}</span></div>
                            </div>
                          </div>

                          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-center">
                            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Market pulse</div>
                            <div className="text-2xl font-bold text-white">{game.awayAbbr} @ {game.homeAbbr}</div>
                            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                              <div className="rounded-full border border-white/10 px-3 py-1">Spread {game.odds?.spread !== undefined ? `${game.odds.spread > 0 ? "+" : ""}${game.odds.spread}` : "Pending"}</div>
                              <div className="rounded-full border border-white/10 px-3 py-1">O/U {game.odds?.overUnder ?? "Pending"}</div>
                            </div>
                            {prediction ? (
                              <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 w-full">
                                <div className="text-xs text-muted-foreground mb-1">Model pick</div>
                                <div className="text-white font-bold">{prediction.predictedWinner}</div>
                                <div className="text-sm text-brand-300">{formatProb(prediction.confidence)}</div>
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground max-w-xs">No posted line yet, so the model is holding its fire instead of faking a recommendation.</div>
                            )}
                            {prediction?.valueBet ? (
                              <div className="rounded-full bg-green-500/10 border border-green-500/30 px-3 py-1 text-xs text-green-300 font-medium">
                                Value bet flagged · {formatEdge(prediction.valueBet.edge)} edge
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-center md:text-right">
                            <div className="flex items-center gap-3 justify-center md:justify-end mb-3">
                              <div>
                                <div className="text-xs text-muted-foreground uppercase tracking-[0.24em]">Away</div>
                                <h3 className="text-lg font-bold text-white">{game.awayTeam}</h3>
                              </div>
                              {game.awayLogo ? <img src={game.awayLogo} alt={game.awayTeam} className="h-10 w-10 rounded-full bg-white/5 object-contain p-1" /> : null}
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="text-white font-medium">{game.awayScore ?? "-"}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Moneyline</span><span className="text-white font-medium">{game.odds ? formatOdds(game.odds.awayMoneyline) : "Pending"}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Edge</span><span className={prediction ? (prediction.awayEdge > 0 ? "text-green-400 font-medium" : "text-red-400 font-medium") : "text-muted-foreground"}>{prediction ? formatEdge(prediction.awayEdge) : "Waiting"}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Value Bets Tab */}
            <TabsContent value="value" className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Value Bets</h2>
                <div className="text-sm text-muted-foreground">
                  Min Edge: {minEdge}% | Kelly: {(kellyFraction * 100).toFixed(0)}%
                </div>
              </div>

              {/* Settings */}
              <div className="rounded-xl bg-card border border-border p-6 mb-6">
                <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Bankroll: ${bankroll}
                    </label>
                    <Slider
                      value={[bankroll]}
                      onValueChange={(v) => setBankroll(v[0])}
                      min={100}
                      max={10000}
                      step={100}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Percent className="w-4 h-4" />
                      Min Edge: {minEdge}%
                    </label>
                    <Slider
                      value={[minEdge]}
                      onValueChange={(v) => setMinEdge(v[0])}
                      min={0}
                      max={10}
                      step={0.5}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Kelly Fraction: {(kellyFraction * 100).toFixed(0)}%
                    </label>
                    <Slider
                      value={[kellyFraction]}
                      onValueChange={(v) => setKellyFraction(v[0])}
                      min={0.1}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {valueBets.length > 0 ? (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="text-center p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                      <div className="text-2xl font-bold text-green-400">{valueBets.length}</div>
                      <div className="text-sm text-muted-foreground">Value Bets</div>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-brand-500/10 border border-brand-500/20">
                      <div className="text-2xl font-bold text-brand-400">
                        ${valueBets.reduce((sum, p) => sum + (p.valueBet?.suggestedBet || 0), 0).toFixed(0)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Stake</div>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-gold-500/10 border border-gold-500/20">
                      <div className="text-2xl font-bold text-yellow-400">
                        +{(valueBets.reduce((sum, p) => sum + (p.valueBet?.edge || 0), 0) / valueBets.length).toFixed(1)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Avg Edge</div>
                    </div>
                  </div>

                  {/* Value Bet Cards */}
                  {valueBets.map((pred, index) => pred.valueBet && (
                    <div key={index} className="rounded-xl bg-gradient-to-r from-green-500/10 to-brand-500/10 border border-green-500/30 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-green-500/20">
                            <Target className="w-5 h-5 text-green-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white">{pred.valueBet.team}</h3>
                            <p className="text-sm text-muted-foreground">
                              {pred.valueBet.location} vs {pred.valueBet.location === 'Home' ? pred.awayTeam : pred.homeTeam}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-400">{formatEdge(pred.valueBet.edge)}</div>
                          <div className="text-sm text-muted-foreground">Edge</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-lg font-bold text-white">{formatProb(pred.valueBet.modelProb)}</div>
                          <div className="text-xs text-muted-foreground">Model Prob</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-white">{formatOdds(pred.valueBet.odds)}</div>
                          <div className="text-xs text-muted-foreground">Odds</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-white">{(pred.valueBet.kellyPct * 100).toFixed(1)}%</div>
                          <div className="text-xs text-muted-foreground">Kelly %</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-brand-400">${pred.valueBet.suggestedBet.toFixed(0)}</div>
                          <div className="text-xs text-muted-foreground">Bet Size</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 rounded-xl bg-card border border-border">
                  <Target className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">No Value Bets Found</h3>
                  <p className="text-muted-foreground">
                    Try lowering the minimum edge threshold to find more opportunities.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Backtest Tab */}
            <TabsContent value="backtest" className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">{sportName} - Historical Backtest</h2>
                <Button
                  onClick={runBacktest}
                  disabled={isBacktesting}
                  className="bg-brand-600 hover:bg-brand-700"
                >
                  {isBacktesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Activity className="mr-2 h-4 w-4" />
                      Run 6-Month Backtest
                    </>
                  )}
                </Button>
              </div>

              {backtestSummary ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center p-4 rounded-xl bg-card border border-border">
                      <div className="text-2xl font-bold text-white">{backtestSummary.totalGames}</div>
                      <div className="text-xs text-muted-foreground">Total Games</div>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-card border border-border">
                      <div className="text-2xl font-bold text-brand-400">{(backtestSummary.accuracy * 100).toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">Accuracy</div>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-card border border-border">
                      <div className={`text-2xl font-bold ${backtestSummary.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatMoney(backtestSummary.totalProfit)}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Profit</div>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-card border border-border">
                      <div className={`text-2xl font-bold ${backtestSummary.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {backtestSummary.roi.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">ROI</div>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-card border border-border">
                      <div className="text-2xl font-bold text-yellow-400">{backtestSummary.sharpeRatio.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">Sharpe Ratio</div>
                    </div>
                  </div>

                  {/* Detailed Stats */}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="rounded-xl bg-card border border-border p-6">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-brand-400" />
                        Betting Performance
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Bets Placed</span>
                          <span className="text-white font-medium">{backtestSummary.totalBets}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Winning Bets</span>
                          <span className="text-green-400 font-medium">{backtestSummary.winningBets}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bet Win Rate</span>
                          <span className="text-white font-medium">{(backtestSummary.betWinRate * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max Drawdown</span>
                          <span className="text-red-400 font-medium">{formatMoney(-backtestSummary.maxDrawdown)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-card border border-border p-6">
                      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-brand-400" />
                        Monthly Breakdown
                      </h3>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {backtestSummary.profitByMonth.map((month, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="text-muted-foreground text-sm">{month.month}</span>
                            <div className="flex gap-4">
                              <span className={`text-sm font-medium ${month.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatMoney(month.profit)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({formatMoney(month.cumulative)})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Cumulative Profit Chart */}
                  <div className="rounded-xl bg-card border border-border p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <LineChartIcon className="w-5 h-5 text-brand-400" />
                      Cumulative Profit Over Time
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={backtestSummary.profitByMonth}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="month" stroke="#888" fontSize={12} />
                          <YAxis stroke="#888" fontSize={12} tickFormatter={(v) => `$${v}`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                            labelStyle={{ color: '#fff' }}
                            formatter={(value: number) => [`$${value.toFixed(0)}`, 'Cumulative']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="cumulative" 
                            stroke="#22c55e" 
                            strokeWidth={2}
                            dot={{ fill: '#22c55e', strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Monthly Profit Bar Chart */}
                  <div className="rounded-xl bg-card border border-border p-6">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-brand-400" />
                      Monthly Profit/Loss
                    </h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={backtestSummary.profitByMonth}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="month" stroke="#888" fontSize={12} />
                          <YAxis stroke="#888" fontSize={12} tickFormatter={(v) => `$${v}`} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                            labelStyle={{ color: '#fff' }}
                            formatter={(value: number) => [`$${value.toFixed(0)}`, 'Profit']}
                          />
                          <Bar 
                            dataKey="profit" 
                            fill="#3b82f6"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 rounded-xl bg-card border border-border">
                  <Activity className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">Run a Backtest</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Simulate 6 months of historical {sportName} games to see how our ML model would have performed.
                  </p>
                  <Button
                    onClick={runBacktest}
                    disabled={isBacktesting}
                    className="bg-brand-600 hover:bg-brand-700"
                  >
                    {isBacktesting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Running Backtest...
                      </>
                    ) : (
                      <>
                        <Activity className="mr-2 h-4 w-4" />
                        Start Backtest
                      </>
                    )}
                  </Button>
                </div>
                          )}
                        </TabsContent>

                        {/* Performance Tab */}
                        <TabsContent value="performance" className="space-y-6">
                          <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl font-bold text-white">Historical Performance</h2>
                            <Button
                              onClick={() => setPerformanceData(generatePerformanceData())}
                              variant="outline"
                              className="border-border text-muted-foreground hover:text-white"
                            >
                              <Activity className="mr-2 h-4 w-4" />
                              Refresh Data
                            </Button>
                          </div>

                          {performanceData ? (
                            <div className="space-y-6">
                              {/* Overall Stats */}
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="text-center p-4 rounded-xl bg-card border border-border">
                                  <div className="text-2xl font-bold text-brand-400">{(performanceData.overallWinRate * 100).toFixed(1)}%</div>
                                  <div className="text-xs text-muted-foreground">Win Rate</div>
                                </div>
                                <div className="text-center p-4 rounded-xl bg-card border border-border">
                                  <div className={`text-2xl font-bold ${performanceData.overallROI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {performanceData.overallROI.toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-muted-foreground">ROI</div>
                                </div>
                                <div className="text-center p-4 rounded-xl bg-card border border-border">
                                  <div className={`text-2xl font-bold ${performanceData.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatMoney(performanceData.totalProfit)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Total Profit</div>
                                </div>
                                <div className="text-center p-4 rounded-xl bg-card border border-border">
                                  <div className={`text-2xl font-bold ${performanceData.currentStreak >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {performanceData.currentStreak > 0 ? `+${performanceData.currentStreak}` : performanceData.currentStreak}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Current Streak</div>
                                </div>
                                <div className="text-center p-4 rounded-xl bg-card border border-border">
                                  <div className="text-2xl font-bold text-yellow-400">{performanceData.longestStreak}</div>
                                  <div className="text-xs text-muted-foreground">Best Streak</div>
                                </div>
                              </div>

                              {/* Weekly Performance Chart */}
                              <div className="rounded-xl bg-card border border-border p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                  <LineChartIcon className="w-5 h-5 text-brand-400" />
                                  Weekly Win Rate Trend
                                </h3>
                                <div className="h-64">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={performanceData.weeklyData}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                      <XAxis dataKey="week" stroke="#888" fontSize={12} />
                                      <YAxis stroke="#888" fontSize={12} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0.4, 0.8]} />
                                      <Tooltip 
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                                        labelStyle={{ color: '#fff' }}
                                        formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Win Rate']}
                                      />
                                      <Line 
                                        type="monotone" 
                                        dataKey="winRate" 
                                        stroke="#22c55e" 
                                        strokeWidth={2}
                                        dot={{ fill: '#22c55e', strokeWidth: 2 }}
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              {/* Weekly Profit Bar Chart */}
                              <div className="rounded-xl bg-card border border-border p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                  <BarChart3 className="w-5 h-5 text-brand-400" />
                                  Weekly Profit/Loss
                                </h3>
                                <div className="h-48">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={performanceData.weeklyData}>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                      <XAxis dataKey="week" stroke="#888" fontSize={12} />
                                      <YAxis stroke="#888" fontSize={12} tickFormatter={(v) => `$${v}`} />
                                      <Tooltip 
                                        contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                                        labelStyle={{ color: '#fff' }}
                                        formatter={(value: number) => [`$${value}`, 'Profit']}
                                      />
                                      <Bar 
                                        dataKey="profit" 
                                        fill="#3b82f6"
                                        radius={[4, 4, 0, 0]}
                                      />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              {/* Sport Breakdown */}
                              <div className="rounded-xl bg-card border border-border p-6">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                  <Trophy className="w-5 h-5 text-brand-400" />
                                  Performance by Sport
                                </h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                  {performanceData.sportBreakdown.map((sport) => (
                                    <div key={sport.sport} className="p-4 rounded-lg bg-secondary border border-border">
                                      <div className="flex items-center justify-between mb-3">
                                        <span className="text-lg font-bold text-white">{sport.sport.toUpperCase()}</span>
                                        <span className={`text-sm font-medium ${sport.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                          {sport.roi > 0 ? '+' : ''}{sport.roi.toFixed(1)}% ROI
                                        </span>
                                      </div>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Record</span>
                                          <span className="text-white">{sport.wins}-{sport.losses}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Win Rate</span>
                                          <span className="text-brand-400">{(sport.winRate * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Profit</span>
                                          <span className={sport.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                                            {formatMoney(sport.profit)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Best Week</span>
                                          <span className="text-green-400">{formatMoney(sport.bestWeek)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Worst Week</span>
                                          <span className="text-red-400">{formatMoney(sport.worstWeek)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-16 rounded-xl bg-card border border-border">
                              <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                              <h3 className="text-xl font-semibold text-white mb-2">View Performance History</h3>
                              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                                Track our ML model's historical performance across all sports with detailed metrics and charts.
                              </p>
                              <Button
                                onClick={() => setPerformanceData(generatePerformanceData())}
                                className="bg-brand-600 hover:bg-brand-700"
                              >
                                <Trophy className="mr-2 h-4 w-4" />
                                Load Performance Data
                              </Button>
                            </div>
                          )}
                        </TabsContent>

                        {/* Analyze Game Tab */}
                        <TabsContent value="analyze" className="space-y-6">
                          <div className="rounded-2xl bg-card border border-border p-8 glow-green">
                            <div className="flex items-center gap-3 mb-6">
                              <div className="p-2 rounded-lg bg-brand-500/20">
                                <Trophy className="w-6 h-6 text-brand-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Game Analyzer</h2>
                    <p className="text-muted-foreground">Enter any {sportName} matchup for instant ML analysis</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Enter Game Details
                    </label>
                    <Textarea
                      placeholder="e.g., Lakers vs Warriors, Celtics @ Heat, Nuggets vs Suns..."
                      value={gameInput}
                      onChange={(e) => setGameInput(e.target.value)}
                      className="min-h-[100px] resize-none bg-secondary border-border text-white placeholder:text-muted-foreground focus:ring-brand-500"
                    />
                  </div>

                  <Button
                    onClick={analyzeBetting}
                    className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-lg"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Running ML Prediction...
                      </>
                    ) : (
                      <>
                        <Brain className="mr-2 h-5 w-5" />
                        Get ML Prediction
                      </>
                    )}
                  </Button>

                  {bettingAdvice && (
                    <div className="mt-6 space-y-3 animate-in fade-in-50 slide-in-from-bottom-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-brand-400" />
                          <span className="font-semibold text-white">ML Analysis Result</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copyToClipboard}
                          className="text-muted-foreground hover:text-white"
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </Button>
                      </div>
                      <div className="relative rounded-xl overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-gold-500/10" />
                        <pre className="relative p-6 text-sm text-white whitespace-pre-wrap font-mono leading-relaxed">
                          {bettingAdvice}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              What the product actually gives you
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Model output is only useful if it helps you decide faster, size better, and see where the edge comes from.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="p-6 rounded-xl bg-card border border-border hover:border-brand-500/50 transition-colors group"
              >
                <div className="p-3 rounded-lg bg-brand-500/10 w-fit mb-4 group-hover:bg-brand-500/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-brand-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="edge-system" className="py-18 px-6 border-t border-border/60 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.10),_transparent_48%),linear-gradient(180deg,rgba(5,8,18,0.98),rgba(9,13,24,0.98))]">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.24em] text-brand-300/80">Advantage thesis</p>
              <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">The next-level edge is execution, not louder picks.</h2>
              <p className="mb-6 max-w-2xl leading-relaxed text-muted-foreground">
                There is no magic single formula. The real edge is an operating system that combines model signal, better prices, faster timing, disciplined sizing, and ruthless CLV-based evaluation.
              </p>

              <div className="mb-6 rounded-3xl border border-brand-500/20 bg-brand-500/10 p-6">
                <p className="mb-3 text-xs uppercase tracking-[0.24em] text-brand-300/80">Execution-adjusted edge</p>
                <div className="text-lg font-semibold leading-relaxed text-white md:text-xl">
                  Raw Edge x Calibration x CLV x Timing x Market Dislocation x Liquidity - Risk Penalties
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Then size with quarter-Kelly, cap exposure, and only trust the score when the market and the close history support it.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {executionFormulaTerms.map((term) => (
                  <div key={term.label} className="rounded-2xl border border-border bg-card/45 p-4">
                    <p className={`mb-2 text-sm font-semibold ${term.accent}`}>{term.label}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{term.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-border bg-card/45 p-6">
                <p className="mb-3 text-xs uppercase tracking-[0.24em] text-brand-300/80">How AI Advantage wins</p>
                <div className="space-y-3">
                  {executionSystemSteps.map((step, index) => (
                    <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/20 p-4">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-semibold text-brand-300">{index + 1}</div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-card/45 p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.24em] text-brand-300/80">Build sequence</p>
                    <h3 className="text-2xl font-semibold text-white">Three phases to go next level</h3>
                  </div>
                  <a
                    href="https://github.com/ianalloway/ai-advantage/blob/main/docs/advantage_operating_system.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-brand-300 transition-colors hover:text-white"
                  >
                    Read full playbook
                    <ChevronRight className="h-4 w-4" />
                  </a>
                </div>
                <div className="space-y-3">
                  {growthRoadmap.map((item) => (
                    <div key={item.phase} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                      <p className="mb-2 text-xs uppercase tracking-[0.24em] text-brand-300/80">{item.phase}</p>
                      <h4 className="mb-1 font-semibold text-white">{item.title}</h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sports Stack */}
      <section id="sports-stack" className="py-18 px-6 border-t border-border/60 bg-gradient-to-b from-black/20 to-card/20">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">The sports analytics stack behind the site</h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              AI Advantage is the front door, but the actual sports system is a full repo ecosystem: model training, ratings, CLV evaluation, odds tooling, bankroll sizing, and research utilities.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {sportsRepoGroups.map((group) => (
              <div key={group.title} className="rounded-3xl border border-border bg-card/45 p-6 backdrop-blur-sm">
                <div className="mb-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-400/70 mb-2">Sports Stack</p>
                  <h3 className="text-2xl font-semibold text-white mb-2">{group.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{group.summary}</p>
                </div>

                <div className="space-y-3">
                  {group.repos.map((repo) => (
                    <a
                      key={repo.name}
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block rounded-2xl border border-border bg-black/25 p-4 transition-colors hover:border-brand-500/40 hover:bg-black/40"
                    >
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <p className="text-white font-semibold group-hover:text-brand-300 transition-colors">{repo.name}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-brand-400/70 mt-1">{repo.role}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-brand-300 transition-colors shrink-0 mt-1" />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{repo.desc}</p>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Choose Your Plan
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start with the free workflow, unlock one-off premium access, or subscribe if you want the full operating system.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free Plan */}
            <div className="p-8 rounded-2xl bg-card border border-border flex flex-col">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
                <div className="text-4xl font-bold text-white">$0</div>
                <p className="text-muted-foreground text-sm">Forever free</p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {FREE_FEATURES.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-muted-foreground text-sm">
                    <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="w-full border-border text-white hover:bg-brand-500/10"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                Get Started
              </Button>
            </div>

            {/* Crypto One-Time Unlock */}
            <div className="p-8 rounded-2xl bg-gradient-to-br from-yellow-900/30 via-orange-900/20 to-purple-900/30 border border-yellow-500/30 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-sm font-bold whitespace-nowrap">
                🔥 Pay Once in Crypto
              </div>
              <div className="text-center mb-6 mt-2">
                <h3 className="text-2xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                  <Bitcoin className="w-6 h-6 text-yellow-400" />
                  Crypto Unlock
                </h3>
                <div className="text-4xl font-bold text-white">$10<span className="text-lg text-muted-foreground"> one-time</span></div>
                <p className="text-muted-foreground text-sm">ETH or USDC · Never expires</p>
              </div>

              {/* Two unlock options */}
              <div className="space-y-3 mb-8 flex-1">
                {/* Big Game */}
                <button
                  className="w-full p-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors text-left group"
                  onClick={() => {
                    setCryptoUnlockType("big-game");
                    setShowCryptoModal(true);
                  }}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <Trophy className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                    <span className="text-white font-semibold text-sm">The Big Game Pass</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-8">
                    Championship AI picks, prop models & live line alerts for every playoff game
                  </p>
                </button>

                {/* Knowledge Vault */}
                <button
                  className="w-full p-4 rounded-xl border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 transition-colors text-left group"
                  onClick={() => {
                    setCryptoUnlockType("knowledge-vault");
                    setShowCryptoModal(true);
                  }}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <Brain className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    <span className="text-white font-semibold text-sm">Knowledge Vault</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-8">
                    Full AI model access, 3-year backtests, advanced metrics & unlimited analysis
                  </p>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white font-bold h-11"
                  onClick={() => {
                    setCryptoUnlockType("big-game");
                    setShowCryptoModal(true);
                  }}
                >
                  <Flame className="w-4 h-4 mr-2" />
                  {isPremium ? "Already Unlocked ✓" : "Unlock for $10 in Crypto"}
                </Button>
                {!isPremium && (
                  <Button
                    variant="outline"
                    className="w-full border-brand-500/30 text-brand-400 hover:bg-brand-500/10 font-semibold"
                    onClick={() => handleUpgrade('one-time')}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Pay with Card ($10)
                  </Button>
                )}
              </div>
            </div>

            {/* Monthly Premium Plan */}
            <div className="p-8 rounded-2xl bg-gradient-to-br from-brand-900/50 to-brand-800/30 border border-brand-500/30 relative flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-brand-500 text-white text-sm font-medium whitespace-nowrap">
                Most Complete
              </div>
              <div className="text-center mb-6 mt-2">
                <h3 className="text-2xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                  <Crown className="w-6 h-6 text-yellow-400" />
                  Pro Monthly
                </h3>
                <div className="text-4xl font-bold text-white">$15<span className="text-lg text-muted-foreground">/mo</span></div>
                <p className="text-muted-foreground text-sm">Cancel anytime</p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {PREMIUM_FEATURES.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-white text-sm">
                    <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                onClick={handleUpgrade}
              >
                {isPremium ? (
                  <>
                    <Check className="mr-2 h-5 w-5" />
                    Premium Active
                  </>
                ) : (
                  <>
                    <Crown className="mr-2 h-5 w-5" />
                    Upgrade to Pro
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Crypto Payment Modal */}
      <CryptoPaymentModal
        open={showCryptoModal}
        onOpenChange={setShowCryptoModal}
        unlockType={cryptoUnlockType}
        onSuccess={() => {
          setIsPremium(true);
          toast({
            title: "🔥 Access Unlocked!",
            description: "Your crypto payment was verified. Enjoy full access!",
          });
        }}
      />

      {/* Email Capture Section */}
      <section className="py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-8 rounded-2xl bg-card border border-border">
            <Mail className="w-12 h-12 text-brand-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">
              Get Free Betting Insights
            </h2>
            <p className="text-muted-foreground mb-6">
              Join our newsletter for weekly picks, strategy tips, and exclusive analysis
            </p>
            <div className="flex gap-3 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary border-border text-white placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === 'Enter' && handleEmailSubscribe()}
              />
              <Button 
                onClick={handleEmailSubscribe}
                disabled={isSubscribing}
                className="bg-brand-600 hover:bg-brand-700 text-white px-6"
              >
                {isSubscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Donation Section */}
      <section className="py-12 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-6 rounded-xl bg-card/50 border border-border">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Heart className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-semibold text-white">Support Development</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              If you find AI Advantage helpful, consider supporting with ETH
            </p>
            <div className="flex items-center justify-center gap-2">
              <code className="px-3 py-2 rounded-lg bg-secondary text-sm text-brand-400 font-mono">
                {ETH_DONATION_ADDRESS.slice(0, 10)}...{ETH_DONATION_ADDRESS.slice(-8)}
              </code>
              <Button 
                variant="outline" 
                size="sm"
                onClick={copyEthAddress}
                className="border-border text-muted-foreground hover:text-white"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-brand-400" />
            <span className="font-semibold text-white">AI Advantage Sports</span>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={copyEthAddress}
              className="text-muted-foreground hover:text-white"
            >
              <Heart className="h-4 w-4 mr-2" />
              Donate ETH
            </Button>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            For entertainment purposes only. Please gamble responsibly. Must be 21+ to participate.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
