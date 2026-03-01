/**
 * Shared Navbar with dark mode toggle for AI Advantage Sports
 * Persists preference via localStorage (handled by next-themes)
 * Defaults to system preference
 */

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Moon, Sun, TrendingUp, Trophy, BarChart3, Layers, UserCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const NAV_LINKS = [
  { path: "/",           label: "Analyze",   icon: TrendingUp },
  { path: "/picks",      label: "Picks",     icon: Trophy      },
  { path: "/parlay",     label: "Parlay",    icon: Layers      },
  { path: "/leaderboard",label: "Leaders",   icon: BarChart3   },
  { path: "/profile",    label: "Profile",   icon: UserCircle  },
];

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Avoid hydration mismatch — only show toggle once mounted
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm transition-colors">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Brand */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-bold text-lg text-foreground hover:opacity-80 transition-opacity"
        >
          <TrendingUp className="w-5 h-5 text-green-500" />
          <span className="hidden sm:inline">AI Advantage</span>
          <span className="sm:hidden">AIA</span>
        </button>

        {/* Nav links */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map(({ path, label, icon: Icon }) => (
            <Button
              key={path}
              variant="ghost"
              size="sm"
              onClick={() => navigate(path)}
              className={`gap-1.5 ${pathname === path ? "bg-accent/20 text-accent-foreground font-semibold" : "text-muted-foreground"}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Button>
          ))}
        </nav>

        {/* Right side: theme toggle + profile */}
        <div className="flex items-center gap-1">
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/profile")}
            aria-label="Profile"
            className="text-muted-foreground hover:text-foreground"
          >
            {user ? (
              <img src={user.avatar_url} alt={user.login} className="w-6 h-6 rounded-full" />
            ) : (
              <UserCircle className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="sm:hidden flex border-t border-border bg-background">
        {NAV_LINKS.map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-medium transition-colors
              ${pathname === path ? "text-green-500" : "text-muted-foreground"}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}
