import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Copy, TrendingUp } from "lucide-react";

const PromptImprover = () => {
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
      // Simulate AI betting analysis
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const games = gameInput.toLowerCase();
      let analysis = "";
      let recommendation = "";
      let confidence = "";
      
      // Simple demo logic for betting recommendations
      if (games.includes("lakers") || games.includes("warriors") || games.includes("celtics")) {
        recommendation = "HOME TEAM";
        confidence = "78%";
        analysis = "Strong home court advantage and recent performance metrics favor the home team.";
      } else if (games.includes("football") || games.includes("nfl")) {
        recommendation = "UNDER";
        confidence = "65%";
        analysis = "Weather conditions and defensive matchups suggest a lower-scoring game.";
      } else if (games.includes("vs") || games.includes("@")) {
        recommendation = "AWAY TEAM";
        confidence = "72%";
        analysis = "Away team has superior recent form and key players are healthy.";
      } else {
        recommendation = "HOME TEAM";
        confidence = "68%";
        analysis = "Home field advantage and recent statistical trends favor the home side.";
      }
      
      const advice = `🎯 RECOMMENDATION: ${recommendation}\n\n📊 CONFIDENCE: ${confidence}\n\n📈 ANALYSIS:\n${analysis}\n\n⚠️ RISK FACTORS:\n• Always bet responsibly\n• Past performance doesn't guarantee future results\n• Consider your bankroll management\n\n💡 SUGGESTED STAKE: 2-3% of bankroll`;
      
      setBettingAdvice(advice);
      toast({
        title: "Analysis complete!",
        description: "AI has analyzed the game and provided betting recommendations.",
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
        title: "Copied to clipboard!",
        description: "You can now paste the betting analysis anywhere",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-brand-600 to-brand-800 bg-clip-text text-transparent">
          AI Advantage Betting
        </h1>
        <p className="text-muted-foreground">
          Enter game details and get AI-powered betting recommendations
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Game Details</label>
          <Textarea
            placeholder="e.g., Lakers vs Warriors, NFL Patriots @ Bills, etc..."
            value={gameInput}
            onChange={(e) => setGameInput(e.target.value)}
            className="min-h-[100px] resize-none"
          />
        </div>

        <Button
          onClick={analyzeBetting}
          className="w-full bg-brand-600 hover:bg-brand-700"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <TrendingUp className="mr-2 h-4 w-4" />
              Analyze Game
            </>
          )}
        </Button>

        {bettingAdvice && (
          <div className="space-y-2 animate-in fade-in-50">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Betting Analysis</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
                className="h-8"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-brand-100/50 to-brand-200/50 rounded-lg" />
              <Textarea
                value={bettingAdvice}
                readOnly
                className="min-h-[150px] resize-none bg-transparent relative z-10 whitespace-pre-line"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptImprover;