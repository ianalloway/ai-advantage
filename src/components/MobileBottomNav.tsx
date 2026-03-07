import { useLocation, useNavigate } from "react-router-dom";
import { Home, Star, Trophy, Crown } from "lucide-react";
import { isPremiumUser, redirectToCheckout } from "@/lib/stripe";

const NAV_ITEMS = [
  { path: "/", label: "Home", Icon: Home },
  { path: "/picks", label: "Picks", Icon: Star },
  { path: "/leaderboard", label: "Board", Icon: Trophy },
] as const;

export default function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-800 bg-gray-950/95 backdrop-blur-md md:hidden">
      <div className="grid grid-cols-4 h-14">
        {NAV_ITEMS.map(({ path, label, Icon }) => {
          const active = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active
                  ? "text-brand-400"
                  : "text-gray-500 active:text-gray-300"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}

        {/* Go Pro CTA */}
        <button
          onClick={() => {
            if (isPremiumUser()) return;
            // Scroll to pricing on home page, or navigate there
            if (location.pathname !== "/") {
              navigate("/");
              setTimeout(() => {
                document.querySelector(".bg-card\\/30")?.scrollIntoView({ behavior: "smooth" });
              }, 300);
            } else {
              document.querySelector(".bg-card\\/30")?.scrollIntoView({ behavior: "smooth" });
            }
          }}
          className="flex flex-col items-center justify-center gap-0.5 text-yellow-400 active:text-yellow-300"
        >
          <Crown className="w-5 h-5" />
          <span className="text-[10px] font-bold">
            {isPremiumUser() ? "Pro" : "Go Pro"}
          </span>
        </button>
      </div>
    </nav>
  );
}
