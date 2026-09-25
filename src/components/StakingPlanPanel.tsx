import { useMemo } from "react";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  preferredPlan,
  replayBetsFromLedger,
  replayStakingPlans,
  type StakingPlanResult,
} from "@/lib/stakingPlans";

export interface StakingPlanPanelProps {
  entries: Array<{ modelProb: number; entryOdds: number; ledgerOutcome: string; commenceTime?: string }>;
  bankroll?: number;
  /** Settled bets needed before the comparison is presented as meaningful. */
  minSample?: number;
}

function growthClasses(result: StakingPlanResult) {
  if (result.ruined) return "text-red-300";
  return result.growthPct >= 0 ? "text-emerald-300" : "text-red-300";
}

/**
 * The same graded history under five staking disciplines. Picking winners and
 * keeping the money are different problems, and this is where the second one
 * gets answered with evidence rather than a house rule.
 */
export default function StakingPlanPanel({ entries, bankroll = 1000, minSample = 20 }: StakingPlanPanelProps) {
  const { results, best, sample } = useMemo(() => {
    const bets = replayBetsFromLedger(entries);
    const replayed = replayStakingPlans(bets, { bankroll });
    return { results: replayed, best: preferredPlan(replayed), sample: bets.length };
  }, [entries, bankroll]);

  const reliable = sample >= minSample;

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Coins className="h-4 w-4 text-yellow-300" />
          Staking plan replay
        </h2>
        <Badge
          variant="outline"
          className={
            reliable
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"
          }
        >
          {sample} settled {sample === 1 ? "bet" : "bets"}
        </Badge>
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-400">
        {reliable
          ? `Every plan below is run over the same ${sample} graded bets from a $${bankroll.toLocaleString()} start. Same picks, same prices — only the discipline changes.`
          : `Replay needs ${minSample} settled bets before the differences mean anything. Shown for shape, not as a recommendation.`}
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 text-right font-medium">Ending</th>
              <th className="px-3 py-2 text-right font-medium">Growth</th>
              <th className="px-3 py-2 text-right font-medium">ROI</th>
              <th className="px-3 py-2 text-right font-medium">Max DD</th>
              <th className="px-3 py-2 text-right font-medium">Avg stake</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr
                key={result.plan}
                className={`border-b border-white/5 ${
                  reliable && best?.plan === result.plan ? "bg-emerald-400/[0.06]" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{result.label}</span>
                    {reliable && best?.plan === result.plan ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-400/30 bg-emerald-400/10 text-[10px] text-emerald-300"
                      >
                        Best risk-adjusted
                      </Badge>
                    ) : null}
                    {result.ruined ? (
                      <Badge variant="outline" className="border-red-400/30 bg-red-400/10 text-[10px] text-red-300">
                        Ruined
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{result.description}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-200">
                  ${result.endingBankroll.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${growthClasses(result)}`}>
                  {result.growthPct >= 0 ? "+" : ""}
                  {result.growthPct.toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{result.roiPct.toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-right font-mono text-amber-300">
                  {result.maxDrawdownPct.toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">
                  ${result.avgStake.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        Growth alone would crown whatever was most levered on a lucky run, so the highlighted plan has to grow faster
        without deepening the worst drawdown materially. Calibrated Kelly corrects each bet using only what had already
        settled before it — a correction fitted to the whole history would be betting with knowledge it never had, and
        would flatter this plan badly. Until enough bets have settled it is identical to quarter Kelly.
      </p>
    </div>
  );
}
