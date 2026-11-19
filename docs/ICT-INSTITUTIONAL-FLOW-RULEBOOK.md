# ICT Institutional Flow Terminal — Rulebook & Detection Specification

Version: 1.0  
Status: Engineering baseline for the free-data phase  
Markets: XAUUSD and NAS100  
Primary execution timeframe: 5m / 15m / 1h (user-selectable)  
Context timeframes: 1h / 4h / 1D when provider data is available  
Data source in phase 1: BiQuote public REST + SignalR  
Scope: Educational market analysis only; no order execution.

---

## 1. Product principles

1. Never fabricate a price, candle, liquidity pool, order-book level, institutional position, setup, score or target.
2. Keep live quote information separate from candle-confirmed structure.
3. Every detection must carry its source, timeframe, event time, confirmation state and invalidation condition.
4. A wick event is not automatically a structure break. A touch is not automatically a sweep. A candle-derived zone is not an observed pending order.
5. If data is stale, incomplete, symbol-mismatched or unavailable, mark the affected module unavailable and suppress new setups.
6. Bullish and bearish evidence are evaluated independently. A neutral market may legitimately show no valid setup on either side.
7. Scores are heuristic confluence scores, not win probabilities. They must not be presented as a percentage chance of profit.
8. All thresholds are configurable and instrument-aware. XAUUSD and NAS100 must not share hard-coded pip/tick assumptions.

## 2. Data contract and quality gates

### 2.1 Required quote fields

- Symbol and provider symbol
- Bid and ask, when supplied
- Mid price, or calculated as (bid + ask) / 2
- Provider timestamp and local receive timestamp
- Market state, stale flag and quote age, when supplied

Reject a tick when the symbol does not match the active subscription, price is non-finite/non-positive, timestamp is invalid, or provider explicitly marks it stale. If only bid or ask is available, do not silently treat it as mid. Display the available side and label it accurately.

### 2.2 Required candle fields

- Open time in UTC
- Open, high, low, close
- isOpen flag
- Tick volume only when supplied, explicitly labelled tick volume

Validate OHLC consistency: high must be at least max(open, close), low must be at most min(open, close), and high must be greater than or equal to low. Sort by UTC open time, remove duplicate timestamps, reject malformed bars and retain a visible data-quality warning.

The currently open candle may update the chart and live range, but structural events are computed from completed candles only. The open candle must never be counted as a confirmed MSS, BOS, FVG, OB or sweep.

### 2.3 Provider truth

BiQuote documentation describes public REST and SignalR tick delivery. Its OHLC history may combine bootstrap/history sources and real-time aggregation and is a rolling window, not an unlimited archive. Therefore the terminal must display provider and freshness status, and must not describe the feed as a consolidated exchange tape or institutional order book.

For spot/CFD XAUUSD and NAS100, a provider quote is the provider's instrument, not a universal market price. Tick volume is not consolidated traded volume.

## 3. Timeframes and market context

- Execution/context scan: 5m, 15m, 1h, 4h and 1D where data exists.
- A timeframe is unavailable when insufficient valid completed bars exist. Do not substitute another timeframe.
- Every structure, zone and liquidity object stores its source timeframe.
- Higher-timeframe bias is context, not a mandatory trade direction. Lower-timeframe evidence may conflict; show the conflict rather than hiding it.
- Session calculations use UTC timestamps and a maintained daylight-saving-aware session calendar. Until that calendar exists, label sessions as approximate UTC windows and never claim exact kill-zone timing.

Suggested context hierarchy:
1. 1D / 4h: external range, major swing structure and directional context.
2. 1h / 15m: dealing range, key liquidity and PD arrays.
3. 5m: confirmation, displacement and candidate execution zone.
4. 1m may be added later only if the provider supplies reliable history and the user explicitly enables it.

## 4. Swing points and market structure

### 4.1 Confirmed swing high / low

Engineering baseline: a swing high at candle i is confirmed when its high is strictly above the highs of the two candles before it and greater than or equal to the highs of the two candles after it. A swing low is the inverse. This is a 2-left / 2-right fractal and becomes knowable only after two subsequent candles close.

Store:
- pivot price and candle time
- timeframe
- confirmation time
- pivot type
- whether later invalidated

This is a consistent algorithmic proxy, not a claim that every ICT trader defines every swing identically.

### 4.2 BOS

A bullish BOS occurs when a completed candle body closes above the latest relevant confirmed swing high in an already bullish or non-reversing structure. A bearish BOS occurs when a completed candle body closes below the latest relevant confirmed swing low.

- Wick-only break: mark as a level raid/test, not BOS.
- Require the break level to be the current active structural pivot; do not repeatedly emit BOS on every candle above it.
- Record the broken level and event candle.
- A BOS is not automatically an entry.

### 4.3 MSS / CHOCH

MSS is a directional break against the prior active swing sequence, confirmed by a candle body close beyond the relevant opposing short-term swing. The baseline engine additionally requires displacement on the break leg.

- Bullish MSS: after a bearish short-term leg, a completed candle closes above the short-term swing high that initiated/maintained that leg, with displacement.
- Bearish MSS: after a bullish short-term leg, a completed candle closes below the short-term swing low that initiated/maintained that leg, with displacement.
- Wick-only break or weak overlapping close is not confirmed MSS.
- CHOCH may be used as a UI synonym/related state, but the rulebook stores MSS and BOS distinctly to avoid ambiguous labels.

A liquidity sweep and HTF PD-array confluence strengthen context but are not part of the mathematical definition of MSS.

## 5. Liquidity map

All liquidity pools are inferred from visible price structure. They are not proof of resting orders.

### 5.1 BSL / SSL

- Buy-side liquidity (BSL): potential stop liquidity above confirmed swing highs, equal highs and obvious range highs.
- Sell-side liquidity (SSL): potential stop liquidity below confirmed swing lows, equal lows and obvious range lows.
- Store each pool as a price band, not always a single exact price, with constituent pivot IDs and timeframe.

### 5.2 Equal highs / equal lows

Detect two or more confirmed swing highs (EQH) or lows (EQL) within a tolerance band.

Baseline tolerance:
- max of 2 instrument ticks (if tick size is known), 0.05% of current price, or 1.2% of the recent 30-bar range.
- Clamp the tolerance to a configurable maximum so a high-volatility candle cannot merge unrelated levels.
- Use median/mean cluster price and preserve the cluster's min/max band.
- Require at least two distinct confirmed pivots; do not call a single rolling high an equal-high pool.

Tolerance must be tuned and backtested separately for XAUUSD and NAS100.

### 5.3 Other liquidity references

Track independently:
- Previous day high / low (PDH / PDL)
- Previous week high / low (PWH / PWL)
- Previous month high / low (PMH / PML), when sufficient history exists
- Asia, London and New York session highs/lows
- Confirmed range highs/lows
- Internal range liquidity (IRL) and external range liquidity (ERL)

Do not merge session levels with swing-pivot pools. Label their origin.

### 5.4 Liquidity sweep / raid

A sweep candidate occurs when price trades beyond a previously confirmed pool/level by more than the instrument noise buffer.

A confirmed rejection-style sweep requires:
1. A known level existed before the sweep candle.
2. Candle high/low penetrates the level by the configured buffer.
3. Price closes back through/inside the level, or a defined follow-through candle reclaims it within a configurable number of bars.
4. The level is not simply being accepted beyond by consecutive closes.

If price breaks and holds beyond the level, classify as breakout/acceptance, not a reversal sweep. Store penetration depth, close location, reclaim delay and swept pool ID.

A sweep alone is not a trade signal. Wait for displacement and MSS for a reversal setup.

## 6. Displacement

Displacement is a directional impulse, not just a large candle.

Baseline detection combines:
- Real body / ATR(14) threshold (configurable; initial research value 0.8 ATR)
- Body-to-range ratio (initial value 0.65 or greater)
- Close near candle extreme (top 25% for bullish, bottom 25% for bearish)
- Optional multi-candle impulse: two or more directional candles with limited overlap
- Break of a relevant short-term swing for MSS context

Thresholds are initial engineering defaults, not universal ICT rules. Calibrate per market and timeframe using historical samples. Do not use tick volume as institutional volume confirmation.

## 7. Fair Value Gap (FVG) and related arrays

### 7.1 Three-candle FVG

For candles A, B, C in chronological order:
- Bullish FVG when C.low > A.high. Zone = [A.high, C.low].
- Bearish FVG when C.high < A.low. Zone = [C.high, A.low].

Only publish after C closes. Store width, width/ATR, creation time, timeframe, displacement linkage and lifecycle state.

Filter tiny gaps using a configurable minimum width relative to tick size and ATR. Avoid treating every microscopic gap as a meaningful PD array.

### 7.2 FVG lifecycle

States:
- Fresh: price has not returned to the zone.
- Touched: price has entered the zone.
- Partially mitigated: price has traded into part of the zone.
- CE reached: price has reached the 50% midpoint.
- Fully filled: price has traversed the full gap.
- Invalidated: a completed candle closes decisively through the far boundary according to the selected invalidation rule.

Keep historical zone records; do not redraw only the latest triplet. Multiple zones may coexist. A filled FVG is not automatically deleted; it remains in history with its state.

### 7.3 IFVG / BPR

Phase 1 may label IFVG only after an existing FVG is invalidated and then acts as a zone from the opposite side. BPR is an overlap of opposing FVGs. Both require explicit zone-overlap calculations and lifecycle states; do not approximate them with a single FVG.

## 8. Order Blocks and related blocks

### 8.1 Candidate order block

Bullish OB candidate:
- Identify a bearish candle (or defined final bearish candle sequence) immediately preceding a bullish displacement leg.
- The displacement leg must break a relevant short-term swing with a completed body close.
- The candidate zone is the selected candle's full range by default; body-only mode may be configurable.
- Link the OB to the BOS/MSS event and displacement leg.

Bearish OB is the inverse.

Do not mark the previous candle as a confirmed OB solely because the next candle is larger than an average. It is a candidate until its associated structure break is confirmed.

### 8.2 OB lifecycle and invalidation

States:
- Candidate: opposing candle identified; structure confirmation pending.
- Confirmed: linked displacement and structure break completed.
- Fresh: price has not revisited the zone.
- Touched / mitigated: price trades into the zone.
- Partially mitigated / fully mitigated: based on penetration depth.
- Invalidated: completed candle closes beyond the far side of the zone under the chosen invalidation policy.

Track proximal and distal boundaries, midpoint, origin candle, linked break, timeframe and lifecycle. OB, breaker, mitigation and rejection blocks must have separate rule definitions; do not label all failed zones as breakers.

## 9. Dealing range, premium / discount and OTE

A dealing range must be anchored to a defined pair of meaningful confirmed external swing points, not an arbitrary rolling 30-candle maximum/minimum.

- Bullish range: confirmed external swing low to external swing high.
- Bearish range: confirmed external swing high to external swing low.
- Equilibrium = 50% of range.
- Premium = above 50%; discount = below 50%.
- OTE may be displayed as an optional retracement band (commonly 62%–79% of the selected leg), with the anchor direction explicitly stated.

If no valid external swing pair exists, show "Range not established" rather than inventing premium/discount.

IRL/ERL must reference the selected dealing range: IRL is internal price delivery/arrays inside it; ERL is liquidity beyond its boundaries.

## 10. Sessions and time-based concepts

Use UTC candle timestamps and a DST-aware calendar for:
- Asia session
- London session
- New York session
- Configurable kill-zone windows
- Session high/low tracking

Do not hard-code one UTC hour window year-round for London or New York because daylight saving changes local session times. A session level becomes final only after the session ends. Until then label it developing/live.

Judas Swing, AMD (Accumulation-Manipulation-Distribution), Power of Three and Silver Bullet are advanced contextual interpretations. Phase 1 should label them as research/experimental until explicit time-window, range and confirmation rules are specified and tested. Never infer them from a single candle.

## 11. Multi-timeframe context

For each market and timeframe, return:
- data availability and freshness
- active structure state
- latest confirmed BOS/MSS event
- nearest BSL/SSL pools
- active FVG/OB zones and lifecycle
- dealing range and premium/discount
- session context where relevant

Confluence rules:
- Higher timeframe aligned: positive context.
- Higher timeframe opposing: negative context.
- Neutral/unavailable: no adjustment.
- Do not count the same timeframe twice. If the selected execution timeframe is 15m, do not also count 15m as a separate higher-timeframe bonus.
- Missing 4h/1D data must not be represented as neutral confirmation.

## 12. Setup state machine

A setup is not just a detected pattern. Each setup has a lifecycle:

1. WATCHING_LIQUIDITY — relevant pool identified.
2. LIQUIDITY_SWEPT — confirmed raid/reclaim.
3. WAITING_FOR_MSS — sweep exists, structure confirmation pending.
4. MSS_CONFIRMED — displacement + opposing swing close confirmed.
5. ZONE_IDENTIFIED — linked FVG/OB/breaker created.
6. WAITING_FOR_RETRACE — price has not returned to entry zone.
7. ENTRY_ZONE_TOUCHED — price enters the zone; this is not necessarily a fill.
8. INVALIDATED — stop/structure/zone invalidation occurred.
9. TARGET_1 / TARGET_2 / TARGET_3 — targets reached, tracked independently.
10. EXPIRED — setup exceeds configured bar/time limit or context is superseded.

Never display WAITING_FOR_ZONE as the status of every pattern regardless of its actual lifecycle. No automatic trade execution is included.

## 13. Entry, stop, targets and risk/reward

### 13.1 Entry

Entry is a planned price or zone, not a guaranteed fill. Use a configurable entry model:
- FVG midpoint / CE
- OB proximal edge
- OB midpoint
- Confirmed zone retest with lower-timeframe trigger

Show the exact model used.

### 13.2 Stop

For bullish reversal setup, stop generally belongs beyond the sweep low / structural invalidation low plus a volatility and spread buffer. For bearish setup, beyond sweep high / structural invalidation high plus buffer.

Stop must not be chosen only by arbitrary percentages of zone width. Buffer should account for tick size, spread and ATR. If spread is unavailable, label the buffer estimate and avoid pretending execution costs are known.

### 13.3 Targets

Rank real, pre-existing opposing liquidity references:
1. nearest valid internal liquidity
2. external swing liquidity
3. session/day/week liquidity
4. higher-timeframe liquidity

Targets must be beyond entry in the intended direction and must not be invalidated/consumed already. Distinguish target source and timeframe. A fixed R-multiple may be shown as a fallback reference, never mislabeled as a liquidity target.

### 13.4 Dynamic RR

Calculate gross R:R from planned entry and stop. Show costs-adjusted R:R only when spread/fees/slippage assumptions are known. Candidate targets may span 1:2 to 1:15 or more if actual structure supports them, but never force a 1:15 target. If no credible target provides minimum configured room, mark "No qualifying liquidity target" rather than inventing one.

For partial targets:
- TP1, TP2, TP3 each have separate price, source and R multiple.
- Display remaining distance and whether target liquidity has already been reached.
- Do not assume partial exits or actual fills.

### 13.5 Position sizing

If enabled, calculate illustrative position size from user-entered account equity, risk percentage, stop distance and instrument contract specifications. Never guess contract size, point value or currency conversion. Default it off until specifications are verified for the selected broker/instrument.

## 14. Scoring and ranking

Keep dimensions separate:
- Structural quality
- Liquidity quality
- Displacement quality
- PD-array quality
- Higher-timeframe alignment
- Session context
- Target room / RR
- Data quality

The visible confluence score is a deterministic heuristic, not probability. Each setup must show score components and reasons. Missing data is "unknown", not zero-quality or positive confirmation.

Do not give multiple points for duplicate evidence (e.g. the same swing level represented as both a rolling high and a pivot high). Penalize opposing HTF structure and stale data. If feed quality fails, suppress ranking and show unavailable.

Before any score is described as predictive, it must be calibrated on out-of-sample historical data with transaction costs, spread, slippage, and regime segmentation. Until then label it "Confluence score / 100 — heuristic".

## 15. Market X-Ray and boards

### Market X-Ray
- Live quote, bid/ask if available, spread and quote age.
- Confirmed structure, active dealing range and equilibrium.
- BSL/SSL clusters with constituent levels.
- Active FVG/OB zones and lifecycle.
- MTF alignment/conflict matrix.
- Session status and session levels.
- Tick direction/short-term pressure clearly separated from structural bias.
- Event tape records only meaningful state changes; deduplicate repeated events.

### Bullish and Bearish boards
- Independently list all valid same-side setups.
- Show stage, timeframe, confirmation time, entry zone, invalidation, target source, RR and confluence breakdown.
- Empty state should explicitly say no confirmed setup.
- Do not show a bullish tick as a bullish trade setup or a bearish tick as a bearish setup.

### Liquidity Board
- Rank pools by distance, timeframe significance, number of constituent pivots, freshness and whether already swept.
- Display "potential liquidity" rather than visible orders.

## 16. Live update cadence

- SignalR tick: update quote, spread, quote age, chart's open candle and tick-pressure tape immediately.
- Completed candle: run structure, sweep, FVG, OB and setup-state engines for that timeframe.
- REST scan: refresh market snapshots and recovery data on a rate-limited schedule.
- Reconnect: re-subscribe exactly once, recover missing candles, and mark any gap in data.
- If no tick arrives for the configured threshold, change feed state from LIVE to DELAYED/STALE.
- Both instruments may be REST-scanned in the free phase; clearly indicate which instrument has an active SignalR subscription. Do not claim both are streaming if only one is subscribed.

## 17. Validation and testing

Required test fixtures:
- wick-only swing break must not create BOS/MSS
- body close beyond swing creates BOS when structure agrees
- opposite break with displacement creates MSS
- sweep + reclaim creates sweep; break-and-hold creates breakout
- equal highs/lows cluster only within tolerance and with at least two pivots
- FVG detected from a completed three-candle sequence
- open candle cannot confirm FVG/OB/MSS
- FVG/OB lifecycle changes on revisit and invalidation
- target selection uses a valid opposing liquidity level
- no 1:15 target is fabricated when no such pool exists
- missing HTF data does not create alignment
- stale feed suppresses new setups
- duplicate scans do not duplicate event tape entries
- DST transition does not shift session labels incorrectly
- symbol switch unsubscribes prior stream and rejects stale-symbol ticks

Backtest requirements:
- Use chronological, no-lookahead data.
- Respect two-candle pivot confirmation delay.
- Include spread, commission and slippage assumptions when available.
- Separate XAUUSD and NAS100 results and segment by timeframe/session/regime.
- Report sample count, expectancy, max drawdown, profit factor, win rate and confidence intervals.
- Avoid optimizing thresholds on the same period used to report performance.

## 18. Phase 1 free-data scope and deferred features

Included:
- BiQuote REST + SignalR quote stream
- XAUUSD and NAS100 availability resolution
- completed OHLC candles
- swing structure, BOS/MSS, displacement
- BSL/SSL, EQH/EQL, session and day/week levels
- sweep/reclaim detection
- FVG and candidate/confirmed OB lifecycle
- dealing range, premium/discount
- MTF context
- setup lifecycle, dynamic liquidity targets and heuristic ranking
- feed health and event tape

Deferred until validated data is available:
- consolidated spot FX order book (not available as a universal feed)
- actual institutional orders/identity/positioning
- full exchange depth unless a separate exchange feed is connected
- footprint/delta/CVD unless reliable bid/ask trade classification is provided
- automated execution and broker integration
- predictive probability claims

Related-market futures depth (COMEX Gold / CME Nasdaq futures) may be a later optional module, but must be labelled as futures context and never merged into the spot/CFD book.

## 19. Implementation acceptance criteria

The engine is ready for a release candidate only when:
1. Every displayed event can be traced to candles/quotes and a deterministic rule.
2. No structural event is generated from an open candle.
3. Every pool/zone has origin, timeframe, creation time, state and invalidation.
4. Every setup has a lifecycle stage and explicit invalidation.
5. Targets reference real mapped liquidity or are clearly marked as non-liquidity reference.
6. Bullish/bearish evidence updates on new ticks where appropriate and on candle close where required.
7. Feed health and source labels are visible.
8. Unit tests cover the fixtures in section 17.
9. No lookahead is used in historical calculations.
10. The UI makes no claim of actual institutional order-book visibility from candle-only data.

---

## Reference material

- ICT Trading Concepts: https://ictradingconcepts.com/ — secondary structured explanations of ICT terminology; original ICT mentorship material remains the primary source for the methodology.
- Liquidity sweep guide: https://ictradingconcepts.com/ict/liquidity-sweep/
- Market Structure Shift guide: https://ictradingconcepts.com/ict/market-structure-shift/
- BiQuote API documentation: https://biquote.io/docs/
- BIS 2025 FX execution landscape: https://www.bis.org/publications/qr-202512/fx-trade-execution-landscape-through-prism-2025-bis-triennial-survey
- CME Group Liquidity Tool: https://www.cmegroup.com/liquiditytool

This document is an engineering specification inspired by ICT terminology and publicly available market-structure material. It is not an endorsement of any trading strategy and does not imply that ICT patterns reveal actual institutional intent.
