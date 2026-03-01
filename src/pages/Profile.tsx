/**
 * Profile — Issue #20
 * User account page: picks history, ROI dashboard, CSV export, GitHub OAuth login
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User as UserIcon, LogIn, LogOut, Download, Trash2,
  TrendingUp, TrendingDown, Trophy, Activity, DollarSign,
  CheckCircle, XCircle, MinusCircle, Clock, Github,
} from "lucide-react";
import {
  getSavedPicks, updatePickOutcome, deletePick,
  exportPicksToCsv, calcRoi, loginWithGitHub, logout,
  type SavedPick, type Outcome,
} from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { formatOdds } from "@/lib/predictions";

const OUTCOME_CONFIG: Record<Outcome, { label: string; color: string; icon: typeof CheckCircle }> = {
  W:       { label: "Win",     color: "text-green-500",  icon: CheckCircle  },
  L:       { label: "Loss",    color: "text-red-500",    icon: XCircle      },
  P:       { label: "Push",    color: "text-gray-400",   icon: MinusCircle  },
  pending: { label: "Pending", color: "text-yellow-500", icon: Clock        },
};

function PickRow({ pick, onUpdate }: { pick: SavedPick; onUpdate: () => void }) {
  const cfg = OUTCOME_CONFIG[pick.outcome];
  const Icon = cfg.icon;

  function settle(outcome: Outcome) {
    const stake = pick.stake ?? 10;
    let profit = 0;
    if (outcome === "W") {
      profit = pick.odds > 0
        ? (pick.odds / 100) * stake
        : (100 / Math.abs(pick.odds)) * stake;
    } else if (outcome === "L") {
      profit = -stake;
    }
    updatePickOutcome(pick.id, outcome, stake, profit);
    onUpdate();
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-border bg-card">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-[10px] font-mono">{pick.sport}</Badge>
          <span className="text-xs text-muted-foreground">{new Date(pick.savedAt).toLocaleDateString()}</span>
        </div>
        <div className="text-sm text-muted-foreground truncate">{pick.game}</div>
        <div className="font-medium text-foreground">{pick.pick}</div>
        <div className="text-xs text-muted-foreground">
          {formatOdds(pick.odds)} · Edge: {pick.edge > 0 ? "+" : ""}{(pick.edge * 100).toFixed(1)}%
        </div>
      </div>

      {/* Outcome */}
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1 ${cfg.color}`}>
          <Icon className="w-4 h-4" />
          <span className="text-sm font-semibold">{cfg.label}</span>
        </div>
        {pick.outcome !== "pending" && pick.profit !== undefined && (
          <span className={`text-sm font-mono ${pick.profit >= 0 ? "text-green-500" : "text-red-500"}`}>
            {pick.profit >= 0 ? "+" : ""}${pick.profit.toFixed(2)}
          </span>
        )}
      </div>

      {/* Actions */}
      {pick.outcome === "pending" && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs text-green-500 border-green-500/30 hover:bg-green-500/10"
            onClick={() => settle("W")}>W</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
            onClick={() => settle("L")}>L</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-gray-400 border-gray-400/30 hover:bg-gray-400/10"
            onClick={() => settle("P")}>P</Button>
        </div>
      )}

      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => { deletePick(pick.id); onUpdate(); }}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function Profile() {
  const { user, loading } = useAuth();
  const [picks, setPicks] = useState<SavedPick[]>(() => getSavedPicks());
  const stats = calcRoi(picks);

  function refresh() { setPicks(getSavedPicks()); }

  if (loading) return null;

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <UserIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Sign in to track your picks</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Create an account to save picks, track W/L/P outcomes, and monitor your ROI across the season.
        </p>
        <Button className="gap-2 bg-foreground text-background hover:bg-foreground/90" onClick={loginWithGitHub}>
          <Github className="w-4 h-4" /> Continue with GitHub
        </Button>
        <p className="text-xs text-muted-foreground mt-4">Demo mode: click to simulate OAuth sign-in</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full border border-border" />
          <div>
            <div className="font-bold text-foreground">{user.name || user.login}</div>
            <div className="text-sm text-muted-foreground">@{user.login}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {picks.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => exportPicksToCsv(picks)}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          )}
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={logout}>
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </Button>
        </div>
      </div>

      {/* ROI Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Win Rate",   value: stats.settled > 0 ? `${(stats.winRate * 100).toFixed(0)}%` : "—", icon: Trophy,       color: "text-green-500" },
          { label: "Season ROI", value: stats.totalStaked > 0 ? `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%` : "—", icon: stats.roi >= 0 ? TrendingUp : TrendingDown, color: stats.roi >= 0 ? "text-green-500" : "text-red-500" },
          { label: "Profit",     value: stats.totalStaked > 0 ? `${stats.totalProfit >= 0 ? "+" : ""}$${stats.totalProfit.toFixed(0)}` : "—", icon: DollarSign, color: stats.totalProfit >= 0 ? "text-green-500" : "text-red-500" },
          { label: "Record",     value: `${stats.wins}-${stats.losses}-${stats.pushes}`, icon: Activity,    color: "text-blue-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 text-center">
            <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
            <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Picks list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">
            Picks History <span className="text-muted-foreground font-normal text-sm">({picks.length})</span>
          </h2>
          {stats.pending > 0 && (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-xs">
              {stats.pending} pending
            </Badge>
          )}
        </div>

        {picks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No picks saved yet.</p>
            <p className="text-xs mt-1">Reveal a pick on the <a href="/picks" className="underline hover:text-foreground">Picks page</a> to save it here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {picks.map((pick) => (
              <PickRow key={pick.id} pick={pick} onUpdate={refresh} />
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-10">
        All data is stored locally in your browser. For informational purposes only.
      </p>
    </div>
  );
}
