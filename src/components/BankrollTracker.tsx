import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart3, Plus, Trash2, Download, TrendingUp, TrendingDown, Trophy } from "lucide-react";

type BetResult = "win" | "loss" | "push" | "pending";

interface BetEntry {
  id: string;
  date: string;
  game: string;
  betType: string;
  odds: string;
  stake: number;
  result: BetResult;
}

const STORAGE_KEY = "ai_advantage_bankroll_tracker";

function americanToDecimal(american: number): number {
  if (american >= 100) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

function calcPnl(entry: BetEntry): number {
  const oddsNum = parseFloat(entry.odds);
  if (isNaN(oddsNum) || entry.result === "pending") return 0;
  if (entry.result === "push") return 0;
  if (entry.result === "loss") return -entry.stake;
  const decimal = americanToDecimal(oddsNum);
  return entry.stake * (decimal - 1);
}

const RESULT_STYLES: Record<BetResult, string> = {
  win: "bg-[#00ff41]/10 border-[#00ff41]/40 text-[#00ff41]",
  loss: "bg-red-900/10 border-red-500/30 text-red-400",
  push: "bg-yellow-900/10 border-yellow-500/30 text-yellow-400",
  pending: "bg-gray-800 border-gray-600 text-gray-400",
};

function exportToCSV(entries: BetEntry[]) {
  const headers = ["Date", "Game", "Bet Type", "Odds", "Stake ($)", "Result", "P&L ($)"];
  const rows = entries.map((e) => [
    e.date,
    e.game,
    e.betType,
    e.odds,
    e.stake.toFixed(2),
    e.result,
    calcPnl(e).toFixed(2),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bankroll_tracker_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_FORM: Omit<BetEntry, "id"> = {
  date: new Date().toISOString().split("T")[0],
  game: "",
  betType: "",
  odds: "-110",
  stake: 0,
  result: "pending",
};

export default function BankrollTracker() {
  const [entries, setEntries] = useState<BetEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [form, setForm] = useState<Omit<BetEntry, "id">>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // storage may be unavailable
    }
  }, [entries]);

  const stats = useMemo(() => {
    const settled = entries.filter((e) => e.result !== "pending");
    const wins = settled.filter((e) => e.result === "win");
    const totalPnl = entries.reduce((sum, e) => sum + calcPnl(e), 0);
    const totalStaked = settled.reduce((sum, e) => sum + e.stake, 0);
    const roi = totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0;
    const winRate = settled.length > 0 ? (wins.length / settled.length) * 100 : 0;
    const avgOdds =
      settled.length > 0
        ? settled.reduce((sum, e) => sum + parseFloat(e.odds || "0"), 0) / settled.length
        : 0;
    return { totalPnl, roi, winRate, avgOdds, settled, wins };
  }, [entries]);

  // Build running P&L data for bar chart
  const chartData = useMemo(() => {
    let running = 0;
    return entries
      .filter((e) => e.result !== "pending")
      .map((e, i) => {
        running += calcPnl(e);
        return { label: `#${i + 1}`, pnl: calcPnl(e), running };
      });
  }, [entries]);

  const maxAbs = useMemo(
    () => Math.max(1, ...chartData.map((d) => Math.abs(d.running))),
    [chartData]
  );

  function addEntry() {
    if (!form.game.trim() || form.stake <= 0) return;
    const newEntry: BetEntry = { ...form, id: crypto.randomUUID() };
    setEntries((prev) => [newEntry, ...prev]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function updateResult(id: string, result: BetResult) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, result } : e)));
  }

  return (
    <Card className="bg-black border border-[#00ff41]/20 shadow-[0_0_30px_rgba(0,255,65,0.08)]">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-[#00ff41] font-mono text-lg">
            <BarChart3 className="h-5 w-5" />
            Bankroll Tracker
          </CardTitle>
          <div className="flex gap-2">
            {entries.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportToCSV(entries)}
                className="border-[#00ff41]/30 text-[#00ff41] hover:bg-[#00ff41]/10 font-mono text-xs h-8"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                CSV
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              className="bg-[#00ff41]/10 border border-[#00ff41]/40 text-[#00ff41] hover:bg-[#00ff41]/20 font-mono text-xs h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Bet
            </Button>
          </div>
        </div>
        <p className="text-gray-400 text-sm font-mono">
          Track your bets with LocalStorage persistence and CSV export
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: stats.totalPnl >= 0 ? TrendingUp : TrendingDown,
              label: "Total P&L",
              value: `${stats.totalPnl >= 0 ? "+" : ""}$${stats.totalPnl.toFixed(2)}`,
              color: stats.totalPnl >= 0 ? "text-[#00ff41]" : "text-red-400",
            },
            {
              icon: Percent as React.ElementType,
              label: "ROI",
              value: `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`,
              color: stats.roi >= 0 ? "text-[#00ff41]" : "text-red-400",
            },
            {
              icon: Trophy,
              label: "Win Rate",
              value: `${stats.winRate.toFixed(1)}%`,
              color: "text-yellow-400",
            },
            {
              icon: BarChart3,
              label: "Avg Odds",
              value:
                stats.avgOdds !== 0
                  ? `${stats.avgOdds > 0 ? "+" : ""}${stats.avgOdds.toFixed(0)}`
                  : "—",
              color: "text-blue-400",
            },
          ].map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              className="bg-gray-900/60 border border-[#00ff41]/10 rounded-lg p-3 space-y-1"
            >
              <div className="flex items-center gap-1.5 text-gray-500">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs font-mono">{label}</span>
              </div>
              <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Add Bet Form */}
        {showForm && (
          <div className="bg-gray-900/50 border border-[#00ff41]/20 rounded-lg p-4 space-y-4">
            <p className="text-[#00ff41] font-mono text-sm font-semibold">New Bet Entry</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-gray-400 font-mono text-xs">Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-gray-200 font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 font-mono text-xs">Game / Event</Label>
                <Input
                  value={form.game}
                  onChange={(e) => setForm((f) => ({ ...f, game: e.target.value }))}
                  placeholder="Lakers vs Celtics"
                  className="bg-gray-800 border-gray-700 text-gray-200 font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 font-mono text-xs">Bet Type</Label>
                <Input
                  value={form.betType}
                  onChange={(e) => setForm((f) => ({ ...f, betType: e.target.value }))}
                  placeholder="Moneyline / Spread / Total"
                  className="bg-gray-800 border-gray-700 text-gray-200 font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 font-mono text-xs">American Odds</Label>
                <Input
                  value={form.odds}
                  onChange={(e) => setForm((f) => ({ ...f, odds: e.target.value }))}
                  placeholder="-110"
                  className="bg-gray-800 border-gray-700 text-gray-200 font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 font-mono text-xs">Stake ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.stake || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, stake: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="50"
                  className="bg-gray-800 border-gray-700 text-gray-200 font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 font-mono text-xs">Result</Label>
                <select
                  value={form.result}
                  onChange={(e) => setForm((f) => ({ ...f, result: e.target.value as BetResult }))}
                  className="w-full h-8 bg-gray-800 border border-gray-700 text-gray-200 font-mono text-sm rounded-md px-2"
                >
                  <option value="pending">Pending</option>
                  <option value="win">Win</option>
                  <option value="loss">Loss</option>
                  <option value="push">Push</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowForm(false)}
                className="border-gray-700 text-gray-400 hover:bg-gray-800 font-mono text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={addEntry}
                disabled={!form.game.trim() || form.stake <= 0}
                className="bg-[#00ff41]/10 border border-[#00ff41]/40 text-[#00ff41] hover:bg-[#00ff41]/20 font-mono text-xs h-8 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Entry
              </Button>
            </div>
          </div>
        )}

        {/* P&L Bar Chart */}
        {chartData.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">
              Running P&amp;L
            </p>
            <div className="bg-gray-900/40 border border-[#00ff41]/10 rounded-lg p-4">
              <div className="flex items-end gap-1 h-24">
                {chartData.map((d, i) => {
                  const heightPct = Math.abs(d.running) / maxAbs;
                  const isPos = d.running >= 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center justify-end h-full relative group"
                      title={`Bet #${i + 1}: $${d.running.toFixed(2)}`}
                    >
                      <div
                        className={`w-full rounded-sm transition-all ${
                          isPos ? "bg-[#00ff41]/70" : "bg-red-500/70"
                        }`}
                        style={{ height: `${Math.max(2, heightPct * 100)}%` }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-gray-900 border border-[#00ff41]/20 text-[#00ff41] font-mono text-xs rounded px-2 py-1 whitespace-nowrap">
                        #{i + 1}: {isPos ? "+" : ""}${d.running.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1 text-xs text-gray-600 font-mono">
                <span>Bet #1</span>
                <span>Bet #{chartData.length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Bet History Table */}
        {entries.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">
              Bet History ({entries.length})
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {entries.map((entry) => {
                const pnl = calcPnl(entry);
                return (
                  <div
                    key={entry.id}
                    className="bg-gray-900/50 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-gray-200 font-mono text-sm font-medium truncate">
                          {entry.game}
                        </span>
                        <span className="text-gray-500 font-mono text-xs">{entry.betType}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 font-mono">
                        <span>{entry.date}</span>
                        <span>{entry.odds}</span>
                        <span>${entry.stake.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Result selector */}
                    <select
                      value={entry.result}
                      onChange={(e) => updateResult(entry.id, e.target.value as BetResult)}
                      className={`text-xs font-mono rounded border px-2 py-1 bg-transparent cursor-pointer ${RESULT_STYLES[entry.result]}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="win">Win</option>
                      <option value="loss">Loss</option>
                      <option value="push">Push</option>
                    </select>

                    {/* P&L */}
                    {entry.result !== "pending" && (
                      <span
                        className={`font-mono text-sm font-bold w-20 text-right ${
                          pnl > 0
                            ? "text-[#00ff41]"
                            : pnl < 0
                            ? "text-red-400"
                            : "text-yellow-400"
                        }`}
                      >
                        {pnl > 0 ? "+" : ""}${pnl.toFixed(2)}
                      </span>
                    )}

                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors ml-1"
                      title="Remove entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600 font-mono text-sm">
            No bets tracked yet. Click &quot;Add Bet&quot; to get started.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Needed for stats row icon type
const Percent = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);
