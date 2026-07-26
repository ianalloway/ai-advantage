# Portfolio Risk View

A slate of individually-sized Kelly bets is not a portfolio. Three bets on the same game, or six bets on one night's favorites, are closer to one large position than to six small ones. Per-bet Kelly sizing is blind to this: it prices each bet as if it were the only bet on the board.

The Portfolio Risk View reads the whole filtered desk at once, groups it into exposure buckets, prices the correlation between positions, and returns a stake haircut that brings every bucket back inside its limit.

Implementation: `src/lib/portfolioRisk.ts` (pure, tested) and `src/components/PortfolioRiskView.tsx` (presentation). The panel renders in the `/daily-picks` sidebar.

## Positions

The page maps each priced value bet on the desk to a `RiskPosition`: side, opponent, sport, game id, suggested stake, model probability, and the American price.

Risk is measured over the bets the user can actually place — the open board alone until premium unlocks the rest of the slate. A free user's exposure number describes their real actionable slate, not a slate they cannot see.

## Exposure buckets

Every position is added to four buckets:

- `team` — the recommended side
- `game` — the event, so two angles on one game aggregate
- `sport` — league-level concentration
- `narrative` — favorites, underdogs, or draw prices

Each bucket carries its stake, its share of bankroll, and its limit. Limits come from the user's risk profile:

| Profile | Team | Game | Sport | Total | Narrative share |
|---------|------|------|-------|-------|-----------------|
| conservative | 2% | 3% | 7% | 10% | 55% |
| balanced | 3% | 4% | 10% | 15% | 65% |
| aggressive | 5% | 6% | 15% | 25% | 75% |

Team, game, sport, and total limits are percentages of bankroll. The narrative limit is a share of total staked, since "too many favorites" is a claim about the shape of the slate rather than its size.

A narrative bucket holding fewer than three positions is not treated as a theme — it is just the bets themselves — so it is neither flagged nor charted.

## Correlation

Position sigma is the standard deviation of a single bet's P&L:

```text
sigma(i) = stake * decimalOdds * sqrt(p * (1 - p))
```

Portfolio sigma applies a correlation matrix:

```text
correlatedSigma = sqrt( sum(i) sum(j) rho(i,j) * sigma(i) * sigma(j) )
correlationMultiple = correlatedSigma / independentSigma
```

`rho` is a coarse assumption table, not a fitted covariance matrix:

| Relationship | rho |
|--------------|-----|
| Same side, same game | 1.0 |
| Opposite sides, same game | -1.0 |
| Same game, other bet | 0.6 |
| Same team, different games | 0.5 |
| Same sport, same slate | 0.15 |
| Different sport | 0.05 |

The point is to stop a desk from treating six bets on one slate as six independent coin flips, not to claim a precise correlation. Because the table is a heuristic it is not guaranteed positive semi-definite — a hedged book can drive the variance sum below zero, so it is floored at zero rather than reporting an imaginary sigma.

`correlationMultiple` above `1.0` means correlation is inflating risk beyond the independent case. It is surfaced directly on the card because it is the number per-bet Kelly cannot see.

## Diversification score

`100 * (1 - HHI)` over game-level stake weights, where `HHI` is the Herfindahl index. Game-level, not position-level: two bets inside one game are one bet for diversification purposes.

One position scores 0. Two equal games score 50. Five equal games score 80.

## The haircut

Two reductions, kept separate so each stays explainable:

1. `limitScale` — per position, the tightest ratio across every over-limit bucket it belongs to, plus the total-exposure ceiling. Because every member of an over-limit bucket is scaled by at least `limit / bucketStake`, the bucket lands inside its limit after scaling.
2. `correlationScale` — a blanket multiplier applied only once `correlationMultiple` passes a tolerance of `1.25`, scaling back toward that tolerance rather than toward zero correlation. Any multi-bet slate carries some shared risk; a haircut that fired at the first sign of correlation would just shrink every plan.

```text
suggestedStake(i) = stake(i) * limitScale(i)
suggestedTotalStake = sum(suggestedStake) * correlationScale
```

## Product principles

- Show the exposure of bets the user can actually place, never a slate they cannot see.
- Never display a limit that is not being enforced.
- State the correlation assumptions on the card — they are assumptions, and the user is entitled to discount them.
- An empty desk shows an empty panel rather than invented exposure.

## Next implementation steps

1. Persist realized correlation between settled positions and replace the assumption table where the data supports it.
2. Extend beyond moneyline once sides, totals, and props are on the board — a total and a side in one game correlate differently than two sides.
3. Carry open positions from prior slates into the exposure math, not just today's board.
4. Feed the haircut back into the displayed Kelly stake on each pick card, behind an explicit toggle.
