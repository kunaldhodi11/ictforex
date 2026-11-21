# Detection Accuracy Phase — Code Audit & Regression Plan

Date: 2026-11-21
Repository: kunaldhodi11/ictforex
Audited file: assets/js/institutional-flow.js
Baseline specification: docs/ICT-INSTITUTIONAL-FLOW-RULEBOOK.md

## Scope and current status

This is a source-code audit, not a claim that live prices or backtest performance have been verified. The current engine contains a linked sweep → displacement/MSS → FVG/OB candidate flow and an MTF gate. The following differences should be resolved before trusting generated setups.

## Confirmed implementation gaps

### 1. Sweep detection is not yet pool-based

In `analyze(bars)`, the sweep loop calculates `poolHigh` and `poolLow` as the maximum/minimum of the preceding 20 candles. It then calls a wick through that rolling extreme followed by a close back inside a sweep.

The same function separately calculates 2-left/2-right pivots, but those pivots are not used to identify the swept level. Consequently:
- a single rolling high/low can be treated as liquidity without a confirmed pivot;
- EQH/EQL clusters and their price bands are not used as sweep sources;
- the setup evidence does not retain a stable liquidity-pool ID or pool origin.

Required change: build confirmed swing pools first, cluster equal highs/lows using instrument-aware tolerance, and detect a raid against a pool that was confirmed before the raid candle. Preserve the pool ID, band, constituent pivots, timeframe and confirmation timestamp.

### 2. Displacement lacks the specified body-to-range gate

The current condition is `body >= max(averageBody * 1.5, ATR * 0.65)`, with a close-location test. It does not enforce the rulebook's independent real-body / full-candle-range ratio (initial research threshold 0.65).

Required change: calculate true candle range `high - low` and require both the configured ATR/body expansion and body-to-range ratio, plus the close-near-extreme condition. Keep thresholds configurable by symbol and timeframe; do not claim the initial thresholds are universal.

### 3. MSS is approximated by a recent rolling window

The current MSS check compares the impulse close with the highest/lowest of up to eight recent candles. It does not explicitly require a previously confirmed, relevant opposing short-term swing or verify the prior leg direction described in the rulebook.

Required change: reference the active confirmed structural pivot, record its ID/price/time, require a completed candle close through it, and distinguish MSS from BOS. A wick-only break must not qualify.

### 4. Order-block fallback needs a stricter origin rule

When no FVG is found, the current code selects the nearest opposite-colour candle within a short lookback. Colour alone is insufficient evidence that the candle is the last opposing candle responsible for the displacement.

Required change: select the last opposing candle immediately preceding the qualifying displacement leg, preserve the leg linkage, and apply explicit invalidation and mitigation states. If the origin cannot be established, do not manufacture an OB zone.

### 5. Historical validation is not yet demonstrated

The inspected source shows target selection and an MTF gate, but this audit did not find evidence of a reproducible historical backtest harness or verified performance report.

Required change: use timestamp-ordered, completed candles only; model entry after the signal becomes knowable; include spread/fees/slippage assumptions where available; prevent look-ahead; and report sample size, win rate, expectancy in R, profit factor, max drawdown and per-market/timeframe results. Never optimize and report on the same untouched sample.

## Regression cases required before release

1. One isolated rolling high is not EQH and must not create a pool by itself.
2. Two confirmed highs inside the configured tolerance create an EQH band; the equivalent applies to EQL.
3. A candle cannot sweep a pivot before that pivot's two right-hand confirmation candles have closed.
4. Wick penetration followed by close/reclaim through the pool is a sweep candidate; consecutive closes accepting beyond the pool are breakout/acceptance, not reversal sweep.
5. A large candle with body/range below the configured threshold is not displacement.
6. A wick-only break of a structural pivot is not MSS/BOS.
7. A close through the correct active pivot with displacement can confirm MSS only after the candle closes.
8. An FVG is published only after the third candle closes; lifecycle transitions are retained rather than deleting filled zones.
9. A missing or stale timeframe must suppress dependent MTF setups and show unavailable status, never substitute another timeframe.
10. Entry, stop and liquidity targets are calculated only from information available at the signal timestamp. No future pivot or post-signal candle may influence the decision.

## Release gates

- Unit tests pass for all regression cases above.
- XAUUSD and NAS100 tolerances are independently configurable and calibrated.
- Historical tests use chronological train/validation/test periods with no look-ahead.
- Live feed health, symbol match, timestamp freshness and candle completeness are visible.
- No setup is labelled executable merely because its entry price was touched; fill simulation and trigger rules must be explicit.

## Next implementation sequence

1. Implement confirmed liquidity-pool construction (swing highs/lows, EQH/EQL bands).
2. Replace rolling-extreme sweep detection with pool-ID-based raid/reclaim logic.
3. Strengthen displacement and MSS with independent gates and explicit pivot references.
4. Tighten OB origin and FVG lifecycle handling.
5. Add deterministic synthetic-candle unit tests, then historical replay/backtest.
6. Only after passing tests, enable the revised engine in the live terminal.
