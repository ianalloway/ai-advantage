/**
 * ApiDocs — Issue #23
 * Documents the prediction API endpoints.
 */

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, BookOpen, ChevronDown, ChevronRight } from "lucide-react";

// ---------- Types ----------

interface Param {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface Endpoint {
  method: "GET" | "POST" | "DELETE";
  path: string;
  summary: string;
  description: string;
  params?: Param[];
  bodyExample?: string;
  responseExample: string;
}

// ---------- Data ----------

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/api/predict",
    summary: "Run a game prediction",
    description:
      "Accepts a game matchup and returns model probabilities, implied odds, and edge calculations for all available bet types.",
    params: [
      { name: "game",   type: "string",  required: true,  description: 'Matchup string, e.g. "Celtics vs Bucks" or "Bills @ Chiefs"' },
      { name: "sport",  type: "string",  required: false, description: 'Sport key: "nba" | "nfl" | "mlb". Auto-detected when omitted.' },
      { name: "stake",  type: "number",  required: false, description: "Dollar amount to calculate Kelly bet size (default: 100)" },
    ],
    bodyExample: `{
  "game": "Celtics vs Bucks",
  "sport": "nba",
  "stake": 100
}`,
    responseExample: `{
  "predictions": [
    {
      "pick": "Celtics ML",
      "odds": -205,
      "model_prob": 0.68,
      "implied_prob": 0.672,
      "edge": 0.008,
      "kelly_fraction": 0.012,
      "kelly_bet": 1.20,
      "reasoning": "Celtics have +9.3 point differential; Bucks road record 18-22"
    },
    {
      "pick": "Celtics -5.5",
      "odds": -110,
      "model_prob": 0.56,
      "implied_prob": 0.524,
      "edge": 0.036,
      "kelly_fraction": 0.066,
      "kelly_bet": 6.60,
      "reasoning": "Model projects 7.1 pt margin; ATS line appears soft"
    }
  ],
  "generated_at": "2026-03-01T10:00:00Z"
}`,
  },
  {
    method: "GET",
    path: "/api/picks/today",
    summary: "Get today's AI picks",
    description:
      "Returns the full slate of today's pre-computed AI picks, ordered by edge. Free picks are always included; premium picks require an `Authorization: Bearer <token>` header.",
    params: [
      { name: "sport",      type: "string",  required: false, description: 'Filter by sport: "nba" | "nfl" | "mlb"' },
      { name: "confidence", type: "string",  required: false, description: 'Filter by confidence: "high" | "medium" | "low"' },
      { name: "limit",      type: "integer", required: false, description: "Max results to return (default: 20, max: 50)" },
    ],
    responseExample: `{
  "date": "2026-03-01",
  "picks": [
    {
      "id": "pick_abc123",
      "sport": "nba",
      "game": "Bucks @ Celtics",
      "time": "7:30 PM ET",
      "pick": "Celtics ML",
      "odds": -205,
      "edge": 0.046,
      "confidence": "high",
      "is_premium": false,
      "model_prob": 0.68
    },
    {
      "id": "pick_def456",
      "sport": "nfl",
      "game": "Bills @ Chiefs",
      "time": "8:20 PM ET",
      "pick": "Chiefs ML",
      "odds": -168,
      "edge": 0.022,
      "confidence": "high",
      "is_premium": true
    }
  ],
  "total": 6,
  "free": 3,
  "premium": 3
}`,
  },
  {
    method: "GET",
    path: "/api/leaderboard",
    summary: "Get season leaderboard",
    description:
      "Returns top users ranked by ROI for the current season. Each entry includes record, ROI, and total profit.",
    params: [
      { name: "period", type: "string",  required: false, description: '"season" (default) | "month" | "week"' },
      { name: "limit",  type: "integer", required: false, description: "Results per page (default: 20, max: 100)" },
      { name: "offset", type: "integer", required: false, description: "Pagination offset (default: 0)" },
    ],
    responseExample: `{
  "period": "season",
  "leaderboard": [
    {
      "rank": 1,
      "username": "sharp_bettor_42",
      "avatar_url": "https://...",
      "record": { "wins": 142, "losses": 87, "pushes": 6 },
      "win_rate": 0.62,
      "roi": 18.4,
      "total_profit": 1840.00,
      "total_staked": 10000.00
    }
  ],
  "total": 247,
  "generated_at": "2026-03-01T10:00:00Z"
}`,
  },
];

// ---------- Components ----------

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  POST:   "bg-green-500/15 text-green-400 border-green-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={copy}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function CodeBlock({ code, lang = "json" }: { code: string; lang?: string }) {
  return (
    <div className="relative rounded-lg bg-muted/50 border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="px-4 py-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre">{code}</pre>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <Badge variant="outline" className={`font-mono text-xs shrink-0 w-14 justify-center border ${METHOD_COLORS[ep.method]}`}>
          {ep.method}
        </Badge>
        <span className="font-mono text-sm text-foreground flex-1">{ep.path}</span>
        <span className="text-sm text-muted-foreground hidden sm:block flex-1">{ep.summary}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-5">
          <p className="text-sm text-muted-foreground">{ep.description}</p>

          {/* Parameters */}
          {ep.params && ep.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {ep.method === "POST" ? "Request Body" : "Query Parameters"}
              </h4>
              <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
                {ep.params.map((p) => (
                  <div key={p.name} className="flex gap-4 px-4 py-3 text-sm bg-background">
                    <div className="w-32 shrink-0">
                      <span className="font-mono font-medium text-foreground">{p.name}</span>
                      {p.required && (
                        <span className="ml-1.5 text-[10px] text-red-400 font-semibold">required</span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-blue-400 shrink-0 w-16">{p.type}</span>
                    <span className="text-muted-foreground flex-1">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body example */}
          {ep.bodyExample && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Example Request</h4>
              <CodeBlock code={ep.bodyExample} />
            </div>
          )}

          {/* Response */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Example Response</h4>
            <CodeBlock code={ep.responseExample} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Page ----------

export default function ApiDocs() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-6 h-6 text-green-500" />
        <h1 className="text-2xl font-bold text-foreground">API Reference</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-8">
        REST API for AI Advantage prediction endpoints. All responses are JSON.
        Premium endpoints require an <code className="font-mono bg-muted px-1 rounded">Authorization: Bearer &lt;token&gt;</code> header.
      </p>

      {/* Base URL */}
      <div className="rounded-xl border border-border bg-card p-4 mb-8">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Base URL</div>
        <div className="flex items-center justify-between font-mono text-sm text-foreground bg-muted/50 rounded-lg px-3 py-2">
          <span>https://ai-advantage.netlify.app</span>
          <CopyButton text="https://ai-advantage.netlify.app" />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Rate limit: 60 requests/min (unauthenticated) · 300 requests/min (authenticated)
        </p>
      </div>

      {/* Endpoints */}
      <div className="space-y-3">
        {ENDPOINTS.map((ep) => (
          <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} />
        ))}
      </div>

      {/* Auth note */}
      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold text-foreground mb-2">Authentication</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Obtain a token by signing in with GitHub on the <a href="/profile" className="underline hover:text-foreground">Profile page</a>.
          Pass it as a Bearer token in the Authorization header:
        </p>
        <CodeBlock lang="http" code={`GET /api/picks/today HTTP/1.1
Authorization: Bearer eyJhbGci...`} />
      </div>
    </div>
  );
}
