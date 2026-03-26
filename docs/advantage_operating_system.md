# Advantage Operating System

## Core Truth

There is no magical single formula that guarantees a betting edge.

The real edge is an operating system:

1. Better probability estimates than the market on a subset of games
2. Better prices than the closing number on a repeatable basis
3. Better timing and execution than slower bettors
4. Better sizing discipline than emotional bettors
5. Better evaluation discipline than teams who mistake hot streaks for signal

AI Advantage should position itself as an execution-first sports intelligence product, not a generic picks brand.

## The Edge Formula

Use an execution-adjusted edge score instead of raw model edge alone.

```text
RawEdge = ModelWinProb - ImpliedMarketProb

ExecutionAdjustedEdge = RawEdge
                      * CalibrationFactor
                      * CLVFactor
                      * TimingFactor
                      * MarketDislocationFactor
                      * LiquidityFactor
                      - CorrelationPenalty
                      - NewsVolatilityPenalty
```

### Factor Definitions

- `CalibrationFactor`
  - Derived from rolling Brier score, log loss, and calibration buckets
  - Suggested range: `0.75` to `1.10`
  - If recent calibration drifts, your model edge gets automatically discounted

- `CLVFactor`
  - Derived from close-beat rate and average closing line value by league / market / bet type
  - Suggested range: `0.80` to `1.15`
  - If your picks are consistently beating close, you trust the signal more

- `TimingFactor`
  - Rewards alerts caught before line movement or before injury/news fully settles into price
  - Suggested range: `0.85` to `1.10`

- `MarketDislocationFactor`
  - Rewards disagreement between books, sudden drift, stale books, and local outliers
  - Suggested range: `0.90` to `1.20`

- `LiquidityFactor`
  - Discounts low-liquidity or fragile markets where a posted number is not truly actionable at size
  - Suggested range: `0.75` to `1.05`

- `CorrelationPenalty`
  - Penalizes overexposure to the same game, same team, or same narrative across many bets

- `NewsVolatilityPenalty`
  - Penalizes situations where injury uncertainty or lineup volatility can invalidate the model faster than you can execute

## Bet Sizing Formula

Do not size directly from raw edge.
Use quarter-Kelly or half-Kelly on execution-adjusted edge.

```text
StakePct = FractionalKelly * Kelly(ModelWinProb, DecimalOdds)
AdjustedStakePct = StakePct * clamp(ExecutionAdjustedEdge / TargetEdge, 0, 1.25)
```

Suggested defaults:

- `FractionalKelly = 0.25`
- `TargetEdge = 0.04` (4 percentage points)
- Hard cap any single bet to `1.0%` to `1.5%` of bankroll unless a market is deeply validated

## What Actually Creates The Edge

### 1. Calibration Before Confidence

Most betting products sell confidence.
You should sell calibration.

If the model says 58 percent, the question is whether your 58 percent bucket wins near 58 percent over time.
That is more valuable than a flashy confidence label.

Repos that support this:
- `nba-clv-dashboard`
- `backtest-report-gen`
- `metric-regression-gate`

### 2. Price Quality Before Pick Count

The business should shift from "how many picks did we post" to "how often did we get a better number than the market eventually settled on".

If you win CLV consistently, you are building something real even through short-run variance.

Repos that support this:
- `closing-line-archive`
- `odds-drift-watch`
- `odds-cli`

### 3. Execution Before Narrative

The best signal can still lose money if it is posted after the number is gone.

AI Advantage should become fast at:
- spotting stale numbers
- catching drift windows
- pushing alerts before steam fully lands
- filtering out markets that have already moved beyond your entry threshold

### 4. Sizing Before Ego

You already have the right raw materials here.
The next level is making bankroll discipline part of the brand.

Repos that support this:
- `kelly-js`
- `nba-edge`

## Product Strategy

### Positioning

AI Advantage should not primarily present itself as:
- a picks site
- a tout brand
- a generic dashboard

It should position as:

> An execution-first sports intelligence platform for finding, sizing, and evaluating market edges.

### Best Premium Surfaces To Build Next

1. `Execution Board`
   - The best current market opportunities ranked by execution-adjusted edge
   - Includes current line, open line, estimated close edge, and sizing

2. `CLV Console`
   - Track whether posted bets beat close
   - Show by sport, market, bet type, and time-to-game bucket

3. `Alert Windows`
   - Show bets by urgency
   - Example: `hit now`, `watch`, `pass if moves 5 cents more`

4. `Portfolio Risk View`
   - Show correlated exposure across teams, games, and slates
   - Stop over-betting one narrative in different wrappers

5. `Model Trust Meter`
   - Publicly expose recent calibration and performance quality
   - This is a differentiator because most betting products hide the hard part

## Operating Plan

### Phase 1: Prove The Signal

Goal:
- show that model edge survives contact with real market prices

Build:
- closing-line capture for every posted bet
- rolling calibration report by sport
- close-beat rate by market and time bucket
- regression gate on CLV and calibration, not just win rate

KPIs:
- average CLV per bet
- close-beat rate
- calibration error by bucket
- ROI by edge bucket

### Phase 2: Improve Execution

Goal:
- turn model signal into better entries

Build:
- book-comparison feed
- alerting for stale or drifting lines
- entry windows by market state
- execution-adjusted edge score on every bet card

KPIs:
- median minutes from signal to alert
- average line captured versus close
- percentage of premium alerts that become worse within 30 minutes

### Phase 3: Productize Trust

Goal:
- make the edge explainable and worth paying for

Build:
- public proof page
- premium execution board
- bettor ledger and CLV console
- risk and bankroll overlays

KPIs:
- paid conversion from free board
- retention after 30 / 60 / 90 days
- percentage of users who place multiple tracked bets per week

### Phase 4: Grow Distribution

Goal:
- move from a personal project to a category story

Build:
- weekly market review content
- automated recap emails with CLV + results
- shareable cards for best number captured
- B2B angle for sports analytics tooling and evaluation dashboards

## Concrete Implementation Priorities

### Immediate

- Replace fixed leaderboard data with either a real tracked bettor ledger or hide it
- Add `ExecutionAdjustedEdge` to every premium pick card
- Store open line, current line, and closing line for every surfaced bet
- Tag each bet with `timing bucket`, `line move after alert`, and `close-beat result`

### Short Term

- Add a case-study section showing a single bet lifecycle:
  - model probability
  - first available price
  - alert time
  - line movement
  - close price
  - result
- Add premium filtering for `best execution windows`
- Add a confidence discount based on recent calibration by sport

### Medium Term

- Add book shopping across multiple sources, not a single feed
- Add market-type specialization:
  - sides
  - totals
  - player props
- Add sport-specific submodels rather than one generic framing

## Success Criteria

AI Advantage is succeeding when:

- the best alerts show repeatable positive CLV
- model quality is visible and auditable
- bankroll sizing is systematic, not emotional
- users feel they are buying a workflow advantage, not blind picks
- your repo ecosystem turns into one coherent operating system

## Suggested Tagline Direction

- `Find the number before the market does.`
- `Execution-first sports intelligence.`
- `Model edge is step one. Price and timing are the real game.`
