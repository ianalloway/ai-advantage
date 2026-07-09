import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestSummary } from "@/lib/predictions";

// Isolated so recharts stays in its own async chunk, off the homepage first paint.
export default function BacktestChart({ summary }: { summary: BacktestSummary }) {
  return (
    <div className="h-56 w-full min-w-0 rounded-lg border border-white/10 bg-slate-950/50 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={summary.profitByMonth}>
          <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" />
          <XAxis dataKey="month" stroke="#64748b" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis
            stroke="#64748b"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickFormatter={(v: number) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(2, 6, 23, 0.96)",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: 8,
            }}
          />
          <Bar dataKey="profit" fill="#22d3ee" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
