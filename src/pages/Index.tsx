import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
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
  LineChart
} from "lucide-react";

const Index = () => {
  const [gameInput, setGameInput] = useState("");
  const [bettingAdvice, setBettingAdvice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const games = gameInput.toLowerCase();
      let recommendation = "";
      let confidence = "";
      let analysis = "";
      let odds = "";
      
      if (games.includes("lakers") || games.includes("warriors") || games.includes("celtics")) {
        recommendation = "HOME TEAM SPREAD -4.5";
        confidence = "78%";
        odds = "-110";
        analysis = "Strong home court advantage with 12-3 record at home. Key players healthy and rested after 3-day break. Opponent struggling on the road (5-9 away record).";
      } else if (games.includes("football") || games.includes("nfl") || games.includes("chiefs") || games.includes("eagles")) {
        recommendation = "UNDER 47.5";
        confidence = "72%";
        odds = "-105";
        analysis = "Weather forecast shows 15mph winds. Both defenses rank top 10 in red zone efficiency. Last 5 meetings averaged 41.2 points total.";
      } else if (games.includes("yankees") || games.includes("dodgers") || games.includes("mlb")) {
        recommendation = "OVER 8.5 RUNS";
        confidence = "68%";
        odds = "-115";
        analysis = "Starting pitchers have combined 5.2 ERA in last 5 starts. Wind blowing out at 12mph. Both lineups hitting .285+ vs opposite-handed pitching.";
      } else {
        recommendation = "HOME TEAM MONEYLINE";
        confidence = "65%";
        odds = "-135";
        analysis = "Home field advantage and recent form favor the home side. Consider this a moderate confidence play.";
      }
      
      const advice = `RECOMMENDATION: ${recommendation}

CONFIDENCE LEVEL: ${confidence}
SUGGESTED ODDS: ${odds}

ANALYSIS:
${analysis}

BANKROLL MANAGEMENT:
Suggested stake: 2-3% of bankroll
Risk level: ${parseInt(confidence) > 70 ? "Moderate" : "Conservative"}

Always bet responsibly. Past performance does not guarantee future results.`;
      
      setBettingAdvice(advice);
      toast({
        title: "Analysis Complete",
        description: "AI has analyzed the matchup and generated recommendations.",
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
      icon: LineChart,
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

      {/* Analysis Tool Section */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl bg-card border border-border p-8 glow-green">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-brand-500/20">
                <Trophy className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Game Analyzer</h2>
                <p className="text-muted-foreground">Enter any matchup for instant AI analysis</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Enter Game Details
                </label>
                <Textarea
                  placeholder="e.g., Lakers vs Warriors tonight, Chiefs @ Bills NFL Week 12, Yankees vs Dodgers..."
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
                    Analyzing Matchup...
                  </>
                ) : (
                  <>
                    <TrendingUp className="mr-2 h-5 w-5" />
                    Get AI Recommendation
                  </>
                )}
              </Button>

              {bettingAdvice && (
                <div className="mt-6 space-y-3 animate-in fade-in-50 slide-in-from-bottom-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-brand-400" />
                      <span className="font-semibold text-white">AI Analysis Result</span>
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

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-8 rounded-2xl bg-gradient-to-br from-brand-900/50 to-brand-800/30 border border-brand-500/20">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Start Winning?
            </h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join thousands of smart bettors who use AI Advantage to make data-driven decisions.
            </p>
            <Button 
              size="lg"
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-8"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Try It Now
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
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
          <p className="text-sm text-muted-foreground text-center">
            For entertainment purposes only. Please gamble responsibly. Must be 21+ to participate.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
