import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, TrendingUp } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8 overflow-hidden relative">
      {/* Floating background orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-brand-500/5 blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-yellow-500/5 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="text-center space-y-6 relative z-10">
        {/* Animated 404 number */}
        <div className="relative">
          <h1
            className="text-[8rem] sm:text-[12rem] font-black leading-none tracking-tighter"
            style={{
              background: "linear-gradient(135deg, #22c55e 0%, #16a34a 40%, #eab308 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "glow-pulse 3s ease-in-out infinite",
            }}
          >
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center opacity-10">
            <TrendingUp className="w-32 h-32 text-brand-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-white">Fumbled the route</h2>
          <p className="text-gray-400 max-w-sm mx-auto">
            Looks like this page went out of bounds. Let's get you back in the game.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => navigate("/")}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6"
          >
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/picks")}
            className="border-gray-700 text-gray-300 hover:text-white"
          >
            View Today's Picks
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes glow-pulse {
          0%, 100% { filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.3)); }
          50% { filter: drop-shadow(0 0 40px rgba(34, 197, 94, 0.5)); }
        }
      `}</style>
    </div>
  );
}
