import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Heart
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import {
  analyzeGame,
  parseGameInput,
  getDemoGames,
  formatOdds,
  formatProb,
  formatEdge,
  formatMoney,
  generateBacktestData,
  calculateBacktestSummary,
  SPORT_CONFIG,
  type GamePrediction,
  type Sport,
  type BacktestSummary
} from "@/lib/predictions";
import {
  isPremiumUser,
  redirectToCheckout,
  subscribeEmail,
  PREMIUM_FEATURES,
  FREE_FEATURES,
} from "@/lib/stripe";

const ETH_DONATION_ADDRESS = "0xAc7C093B312700614C80Ba3e0509f8dEde03515b";

const Index = () => {
  const [gameInput, setGameInput] = useState("");
  const [bettingAdvice, setBettingAdvice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [predictions, setPredictions] = useState<GamePrediction[]>([]);
  const [bankroll, setBankroll] = useState(1000);
  const [minEdge, setMinEdge] = useState(3);
  const [kellyFraction, setKellyFraction] = useState(0.25);
  const [selectedSport, setSelectedSport] = useState<Sport>('nba');
  const [backtestSummary, setBacktestSummary] = useState<BacktestSummary | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
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
  const handleUpgrade = async () => {
    await redirectToCheckout();
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

  // Load games for selected sport
  useEffect(() => {
    const games = getDemoGames(selectedSport);
    const preds = games.map(game => 
      analyzeGame(game.homeTeam, game.awayTeam, selectedSport, bankroll, minEdge, kellyFraction)
    );
    setPredictions(preds);
  }, [bankroll, minEdge, kellyFraction, selectedSport]);

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

  const valueBets = predictions.filter(p => p.valueBet !== null);
  
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

  const stats = [
    { value: "73%", label: "Win Rate" },
    { value: "2,847", label: "Picks Made" },
    { value: "+142.5", label: "Units Profit" },
    { value: "4.2", label: "Avg Odds" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/20 via-background to-background" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-brand-500/10 rounded-full blur-3xl" />
        
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium">
              <Zap className="w-4 h-4" />
              AI-Powered Sports Betting Intelligence
            </div>
            
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
              <span className="text-white">Bet Smarter with</span>
              <br />
              <span className="text-gradient">AI Advantage</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Get data-driven betting recommendations powered by advanced AI. 
              Analyze any matchup and receive instant insights to make informed decisions.
            </p>
          </div>

          {/* Stats Bar */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat, index) => (
              <div 
                key={index}
                className="text-center p-4 rounded-xl bg-card/50 border border-border backdrop-blur-sm"
              >
                <div className="text-3xl font-bold text-brand-400">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ML Predictions Section */}
      <section className="py-16 px-6">
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
            <TabsList className="grid w-full grid-cols-4 mb-8 bg-card border border-border">
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
              <TabsTrigger value="analyze" className="data-[state=active]:bg-brand-600 data-[state=active]:text-white">
                <Brain className="w-4 h-4 mr-2" />
                Analyze
              </TabsTrigger>
            </TabsList>

            {/* Today's Games Tab */}
            <TabsContent value="games" className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">{sportName} - ML Predictions</h2>
                <div className="text-sm text-muted-foreground">
                  Powered by XGBoost ML Model
                </div>
              </div>
              
              <div className="grid gap-4">
                {predictions.map((pred, index) => (
                  <div key={index} className="rounded-xl bg-card border border-border p-6 hover:border-brand-500/50 transition-colors">
                    <div className="grid md:grid-cols-3 gap-6">
                      {/* Home Team */}
                      <div className="text-center md:text-left">
                        <div className="flex items-center gap-2 mb-2 justify-center md:justify-start">
                          <Home className="w-4 h-4 text-brand-400" />
                          <span className="text-xs text-muted-foreground">HOME</span>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-3">{pred.homeTeam}</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Win Prob:</span>
                            <span className="text-white font-medium">{formatProb(pred.homeProb)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Odds:</span>
                            <span className="text-white font-medium">{formatOdds(pred.homeOdds)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Edge:</span>
                            <span className={pred.homeEdge > 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                              {formatEdge(pred.homeEdge)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* VS / Prediction */}
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-2xl font-bold text-muted-foreground mb-2">VS</div>
                        <div className="px-4 py-2 rounded-lg bg-brand-500/20 border border-brand-500/30">
                          <div className="text-xs text-muted-foreground mb-1">ML PICK</div>
                          <div className="text-white font-bold">{pred.predictedWinner.split(' ').pop()}</div>
                          <div className="text-xs text-brand-400">{formatProb(pred.confidence)}</div>
                        </div>
                        {pred.valueBet && (
                          <div className="mt-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                            <span className="text-xs text-green-400 font-medium">VALUE BET</span>
                          </div>
                        )}
                      </div>

                      {/* Away Team */}
                      <div className="text-center md:text-right">
                        <div className="flex items-center gap-2 mb-2 justify-center md:justify-end">
                          <Plane className="w-4 h-4 text-brand-400" />
                          <span className="text-xs text-muted-foreground">AWAY</span>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-3">{pred.awayTeam}</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Win Prob:</span>
                            <span className="text-white font-medium">{formatProb(pred.awayProb)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Odds:</span>
                            <span className="text-white font-medium">{formatOdds(pred.awayOdds)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Edge:</span>
                            <span className={pred.awayEdge > 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                              {formatEdge(pred.awayEdge)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              Why Choose AI Advantage?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our cutting-edge AI technology gives you the edge you need to make smarter betting decisions.
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

      {/* Pricing Section */}
      <section className="py-20 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Choose Your Plan
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start free or unlock premium features for serious bettors
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="p-8 rounded-2xl bg-card border border-border">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">Free</h3>
                <div className="text-4xl font-bold text-white">$0</div>
                <p className="text-muted-foreground">Forever free</p>
              </div>
              <ul className="space-y-3 mb-8">
                {FREE_FEATURES.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-muted-foreground">
                    <Check className="w-5 h-5 text-brand-400 flex-shrink-0" />
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

            {/* Premium Plan */}
            <div className="p-8 rounded-2xl bg-gradient-to-br from-brand-900/50 to-brand-800/30 border border-brand-500/30 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-brand-500 text-white text-sm font-medium">
                Most Popular
              </div>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-white mb-2 flex items-center justify-center gap-2">
                  <Crown className="w-6 h-6 text-yellow-400" />
                  Premium
                </h3>
                <div className="text-4xl font-bold text-white">$15<span className="text-lg text-muted-foreground">/mo</span></div>
                <p className="text-muted-foreground">Cancel anytime</p>
              </div>
              <ul className="space-y-3 mb-8">
                {PREMIUM_FEATURES.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-white">
                    <Check className="w-5 h-5 text-brand-400 flex-shrink-0" />
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
                    Upgrade to Premium
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

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
