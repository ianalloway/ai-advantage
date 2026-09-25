import { useMemo } from "react";
import { Download, NotebookPen, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { betLogRows, betProfit, summarizeBetLog, type BetLogEntry, type BetLogOutcome } from "@/lib/betLog";
import { downloadCsv, toCsv } from "@/lib/exportDesk";
import { formatOdds } from "@/lib/predictions";

function outcomeClasses(outcome: BetLogOutcome) {
  if (outcome === "won") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (outcome === "lost") return "border-red-400/30 bg-red-400/10 text-red-300";
  if (outcome === "pending") return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

function money(value: number) {
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export interface BetLogPanelProps {
  entries: BetLogEntry[];
  onSettle: (id: string, outcome: BetLogOutcome) => void;
  onRemove: (id: string) => void;
  /** Correct a ticket to the price and stake actually taken. */
  onUpdate: (id: string, changes: { americanOdds?: number; stake?: number }) => void;
  /** Shown when the log is empty, to explain where entries come from. */
  emptyHint?: string;
}

/**
 * What the user actually bet, as opposed to what the desk recommended: realised
 * P&L, execution against the board's quote, and close-line value on the real
 * tickets.
 */
export default function BetLogPanel({ entries, onSettle, onRemove, onUpdate, emptyHint }: BetLogPanelProps) {
  const summary = useMemo(() => summarizeBetLog(entries), [entries]);

  const exportLog = () => {
    const csv = toCsv(betLogRows(entries));
    if (!csv) return;
    downloadCsv(`ai-advantage-bet-log-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-emerald-300" />
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-white">My bets</span>
        </span>
        {entries.length > 0 ? (
          <Badge
            variant="outline"
            className={summary.netProfit >= 0 ? outcomeClasses("won") : outcomeClasses("lost")}
          >
            {money(summary.netProfit)}
          </Badge>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          {emptyHint ??
            "Log a bet from the board to track what you actually took. The desk ledger proves the picks; this tracks your tickets."}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Record</div>
              <div className="mt-1 font-mono text-sm font-semibold text-white">
                {summary.wins}-{summary.losses}
                {summary.pending > 0 ? ` · ${summary.pending} open` : ""}
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">ROI</div>
              <div
                className={`mt-1 font-mono text-sm font-semibold ${
                  summary.roiPct >= 0 ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {summary.roiPct >= 0 ? "+" : ""}
                {summary.roiPct.toFixed(1)}%
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Open risk</div>
              <div className="mt-1 font-mono text-sm font-semibold text-sky-300">
                ${summary.openRisk.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-white/8 bg-black/25 p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Beat close</div>
              <div className="mt-1 font-mono text-sm font-semibold text-cyan-200">
                {summary.beatCloseRatePct !== undefined
                  ? `${summary.beatCloseRatePct.toFixed(0)}%`
                  : "Pending"}
              </div>
            </div>
          </div>

          {summary.avgExecutionPts !== undefined && Math.abs(summary.avgExecutionPts) >= 0.01 ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px] leading-5 text-zinc-400">
              Your prices have averaged{" "}
              <span className={summary.avgExecutionPts >= 0 ? "text-emerald-300" : "text-red-300"}>
                {summary.avgExecutionPts >= 0 ? "+" : ""}
                {summary.avgExecutionPts.toFixed(2)} pts
              </span>{" "}
              against the number the board was quoting.
            </div>
          ) : null}

          <div className="space-y-2">
            {entries.slice(0, 8).map((entry) => {
              const profit = betProfit(entry);
              return (
                <div key={entry.id} className="rounded-xl border border-white/8 bg-black/25 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{entry.side}</div>
                      {/* The board's quote is a starting point, not the price you got.
                          Correct it here and the execution and CLV numbers mean something. */}
                      <div className="mt-1 flex items-center gap-1.5">
                        <Input
                          type="number"
                          aria-label={`Price taken on ${entry.side}`}
                          className="h-7 w-20 border-white/10 bg-black/40 px-2 font-mono text-[11px] text-white"
                          value={entry.americanOdds}
                          onChange={(event) => onUpdate(entry.id, { americanOdds: Number(event.target.value) })}
                        />
                        <span className="text-[11px] text-zinc-600">$</span>
                        <Input
                          type="number"
                          min={0}
                          aria-label={`Stake on ${entry.side}`}
                          className="h-7 w-20 border-white/10 bg-black/40 px-2 font-mono text-[11px] text-white"
                          value={entry.stake}
                          onChange={(event) => onUpdate(entry.id, { stake: Number(event.target.value) })}
                        />
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-zinc-600">
                        {entry.sportLabel}
                        {entry.deskOdds !== undefined ? ` · board ${formatOdds(entry.deskOdds)}` : ""}
                      </div>
                      <div className="truncate text-[11px] text-zinc-600">{entry.eventLabel}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge variant="outline" className={`${outcomeClasses(entry.outcome)} text-[10px]`}>
                        {entry.outcome}
                      </Badge>
                      {entry.outcome !== "pending" ? (
                        <span
                          className={`font-mono text-[11px] ${profit >= 0 ? "text-emerald-300" : "text-red-300"}`}
                        >
                          {money(profit)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {entry.outcome === "pending" ? (
                      <>
                        {(["won", "lost", "push"] as const).map((outcome) => (
                          <button
                            key={outcome}
                            type="button"
                            onClick={() => onSettle(entry.id, outcome)}
                            className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            {outcome}
                          </button>
                        ))}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSettle(entry.id, "pending")}
                        className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove the ${entry.side} bet from the log`}
                      onClick={() => onRemove(entry.id)}
                      className="ml-auto rounded-full p-1 text-zinc-600 transition-colors hover:bg-white/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {entries.length > 8 ? (
            <div className="text-[11px] text-zinc-500">
              Showing the 8 most recent of {entries.length}. Export for the full log.
            </div>
          ) : null}

          <Button
            size="sm"
            variant="outline"
            className="w-full border-white/10 text-zinc-300 hover:bg-white/[0.06]"
            onClick={exportLog}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export bet log CSV
          </Button>
        </div>
      )}
    </div>
  );
}
