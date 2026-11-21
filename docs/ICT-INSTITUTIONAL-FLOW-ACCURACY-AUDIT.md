# ICT Institutional Flow Terminal — Accuracy Audit

Date: 2026-11-21
Branch: `fix/ict-causal-signal-audit`

## Changes in this audit pass

### 1. Stop-buffer ATR is now causal
Previously, the setup's stop buffer used an ATR-like average calculated from the end of the entire loaded candle window. When evaluating an older setup, that calculation could include candles that had not yet existed at the setup time.

The buffer now uses the preceding 14 completed candles available immediately before the sweep candle. This keeps the volatility buffer anchored to information available at the event.

### 2. Liquidity target pivots must be confirmed by signal time
The target pivot detector requires two candles to the right of a swing. Previously, a pivot could be selected merely because its pivot index preceded the MSS index, even when its two confirming candles came after the MSS.

The target filter now requires `pivot.index + 2 <= confirmed.index`, so both right-side confirmation candles must be at or before the MSS candle.

## Static verification completed

- Confirmed both new causal conditions are present in the branch file.
- Confirmed the previous full-window ATR expression is absent.
- Confirmed the previous insufficient pivot-time condition is absent.
- Parsed the complete JavaScript file successfully with a JavaScript syntax check.

## Not yet verified

These code-level checks do not establish trading performance. The following still require historical OHLC fixtures and reproducible tests:

- No-lookahead tests for every signal field, including multi-timeframe direction and POI state.
- Sweep, displacement, MSS, FVG, order-block, and EQH/EQL detection against labelled examples.
- Entry fill assumptions (zone touch is not proof of executable fill).
- Stop/target ordering when both are touched within one candle.
- TP1/TP2/TP3 hit rates, expectancy, drawdown, and sample size by symbol and timeframe.
- Provider timestamp, timezone, missing-candle, duplicate-candle, and stale-feed handling.

## Important interpretation

A setup's zone being touched is not equivalent to a filled trade. A backtest must model order activation, spread, slippage, and intrabar ambiguity before reporting win rate or profitability. No profitability claim is made by this audit.
