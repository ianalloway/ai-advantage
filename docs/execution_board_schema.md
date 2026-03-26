# Execution Board Schema

AI Advantage should rank board entries by execution quality, not just by raw model edge. The Execution Board turns live model signals into auditable tracked entries with explicit prices, timing windows, and close-line proof.

## Core schema

Each tracked row is represented as an `ExecutionBoardEntry`.

- `id`: unique row id in the form `gameId:recommendedSide`
- `gameId`: upstream event id from the live feed
- `sport` / `sportLabel`: canonical sport id and UI label
- `eventLabel`: human-readable matchup label
- `recommendedSide`: the side being tracked
- `opposingSide`: the other team
- `sideLocation`: `Home` or `Away`
- `status`: current board inclusion status
- `ledgerOutcome`: `pending`, `won`, `lost`, or `push`
- `marketState`: `pre`, `in`, or `post`
- `displayTime` / `commenceTime`: presentation and canonical timing
- `bookmaker`: source of the line when available
- `entryOdds`: the price shown when the row is created
- `openOdds`: opening line for the tracked side when available
- `closeOdds`: closing line for the tracked side when available
- `modelProb`: model win probability for the tracked side
- `impliedProb`: implied probability from `entryOdds`
- `rawEdge`: `modelProb - impliedProb`, in percentage points
- `executionAdjustedEdge`: edge after calibration, timing, market movement, and liquidity adjustments
- `confidence`: current model confidence
- `kellyPct`: fractional Kelly percentage
- `suggestedStake`: bankroll-scaled suggested amount
- `executionWindow`: timing label such as `Same window`, `Final hour`, or `Live`
- `openToCurrentDelta`: decimal-odds movement from open to current
- `closeLineValue`: implied-probability gain or loss versus the closing line
- `score`: overall board ranking score
- `factors`: the full `ExecutionFactors` payload used to produce the adjusted edge
- `summary`: preformatted UI strings for line, model probability, raw edge, and execution-adjusted edge

## Inclusion rules

A row belongs on the board only when all of the following are true:

- the game has a real market price
- the model can evaluate the matchup
- the execution-adjusted edge clears the board threshold
- the row can be tied to a specific side and price

If those conditions are not met, the product should show a pass state rather than fabricate a pick.

## Scoring logic

The board score is intentionally execution-first.

```text
score =
  executionAdjustedEdge * 4.8
  + max(rawEdge, 0) * 1.7
  + confidence signal
  + Kelly stake signal
  + timing signal
  + market movement signal
  + close-line value signal
  + liquidity signal
  - penalty signal
```

### Component meaning

- `executionAdjustedEdge * 4.8`
  Primary signal. If the adjusted edge is weak, the row should not rise just because the model is loud.
- `max(rawEdge, 0) * 1.7`
  Rewards true model edge without letting negative raw edge drag the board into noise.
- `confidence signal`
  Uses probability separation from 50/50 to reward cleaner model conviction.
- `Kelly stake signal`
  Gives extra weight to entries where fractional Kelly still recommends meaningful size.
- `timing signal`
  Prefers same-day or same-window entries and discounts late or live entries.
- `market movement signal`
  Uses open-to-current movement as a proxy for whether the market validated the side.
- `close-line value signal`
  Rewards entries that beat the close once a closing number exists.
- `liquidity signal`
  Small adjustment from the sport-level liquidity assumptions already embedded in the execution factors.
- `penalty signal`
  Reduces score when correlation or news-volatility penalties are elevated.

Scores are clamped to `[-99, 99]` so one noisy input cannot dominate the board.

## Product principles

- Never show fake bettor personas or synthetic lifetime leaderboards.
- Never infer long-term ROI from unpersisted data.
- Prefer explicit `Pending` labels over invented closes or outcomes.
- Treat the ledger as an audit surface, not a marketing carousel.

## Next implementation steps

1. Persist alert time, entry time, and final close for every tracked row.
2. Save settled outcomes to a historical store instead of reconstructing only from the live slate.
3. Add per-book comparisons so `entryOdds` reflects the best executable price, not just one feed.
4. Build a historical proof page for rolling CLV, outcome by edge bucket, and timing-window performance.
