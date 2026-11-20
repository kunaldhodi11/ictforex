'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/js/institutional-flow.js'), 'utf8');
const analyzeStart = source.indexOf('function analyze(bars){');
const analyzeEnd = source.indexOf('\nfunction applyMtfEntryGate', analyzeStart);
const targetStart = source.indexOf('function attachMtfLiquidityTargets(analysis,mtfBars){');
const targetEnd = source.indexOf('\n function getMarketXray', targetStart);
if ([analyzeStart, analyzeEnd, targetStart, targetEnd].some(x => x < 0)) {
  throw new Error('Could not extract ICT engine functions from institutional-flow.js');
}
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const avg = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const analyze = new Function('num', 'avg', source.slice(analyzeStart, analyzeEnd) + '; return analyze;')(num, avg);
const attachTargets = new Function('num', source.slice(targetStart, targetEnd) + '; return attachMtfLiquidityTargets;')(num);

function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const header = lines.shift().split(',');
  const ix = Object.fromEntries(header.map((x, i) => [x.trim().toLowerCase(), i]));
  for (const key of ['datetime', 'open', 'high', 'low', 'close']) {
    if (ix[key] === undefined) throw new Error(file + ': missing CSV column ' + key);
  }
  const bars = [];
  for (const line of lines) {
    const cells = line.split(',');
    const openTime = cells[ix.datetime];
    const bar = {
      openTime,
      open: Number(cells[ix.open]),
      high: Number(cells[ix.high]),
      low: Number(cells[ix.low]),
      close: Number(cells[ix.close]),
      isOpen: false
    };
    if (!Number.isFinite(Date.parse(openTime)) ||
        ![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
        bar.high < Math.max(bar.open, bar.close) ||
        bar.low > Math.min(bar.open, bar.close) ||
        bar.high < bar.low) continue;
    bars.push(bar);
  }
  bars.sort((a, b) => Date.parse(a.openTime) - Date.parse(b.openTime));
  return bars;
}

function simulate(bars, signalIndex, setup, maxForward = 720) {
  const targets = (setup.targets || [setup.target]).filter(Number.isFinite);
  const entry = setup.entry;
  const outcome = { filled: false, highestTarget: 0, stopped: false, expired: false };
  const bullish = setup.side === 'bullish';
  let fillIndex = -1;
  for (let i = signalIndex; i < Math.min(bars.length, signalIndex + maxForward); i++) {
    const c = bars[i];
    // Conservative limit-fill model: require a touch of the exact midpoint entry.
    // Skip gap-through bars rather than assuming a better-than-planned fill.
    if (bullish && c.open < entry) continue;
    if (!bullish && c.open > entry) continue;
    if (c.low <= entry && c.high >= entry) {
      outcome.filled = true;
      fillIndex = i;
      break;
    }
  }
  if (!outcome.filled) {
    outcome.expired = true;
    return outcome;
  }
  for (let i = fillIndex; i < Math.min(bars.length, fillIndex + maxForward); i++) {
    const c = bars[i];
    const stopHit = bullish ? c.low <= setup.stop : c.high >= setup.stop;
    const hitIndices = targets.map((t, k) => ({ t, k })).filter(x =>
      bullish ? c.high >= x.t : c.low <= x.t);
    if (stopHit) {
      outcome.stopped = true;
      break; // conservative OHLC assumption: stop wins if stop and target occur in same candle
    }
    if (hitIndices.length) outcome.highestTarget = Math.max(outcome.highestTarget, ...hitIndices.map(x => x.k + 1));
    if (outcome.highestTarget === targets.length && targets.length) break;
  }
  if (!outcome.stopped && outcome.highestTarget < targets.length) outcome.expired = true;
  return outcome;
}

function runMarket(symbol, file) {
  const bars = readCsv(file);
  if (bars.length < 500) throw new Error(symbol + ': not enough valid bars (' + bars.length + ')');
  const seen = new Set();
  const trades = [];
  const windowSize = 180;
  for (let i = 30; i < bars.length; i++) {
    const start = Math.max(0, i - windowSize);
    const window = bars.slice(start, i);
    // The last closed candle's close coincides with the next candle's open.
    // This gives the engine its confirmation timestamp without exposing the next candle OHLC.
    window[window.length - 1].closeTime = bars[i].openTime;
    let result;
    try { result = analyze(window); } catch (_) { continue; }
    for (const candidate of result.results) {
      if (Date.parse(candidate.time) !== Date.parse(bars[i].openTime)) continue;
      const key = candidate.side + '|' + candidate.time + '|' + candidate.type;
      if (seen.has(key)) continue;
      seen.add(key);
      const setup = { ...candidate, time: bars[i].openTime };
      const targetAnalysis = { results: [setup] };
      attachTargets(targetAnalysis, { '1m': window });
      if (!targetAnalysis.results.length) continue; // no genuine opposing liquidity: no trade
      const targetedSetup = targetAnalysis.results[0];
      const outcome = simulate(bars, i, targetedSetup);
      trades.push({
        side: targetedSetup.side, time: targetedSetup.time, entry: targetedSetup.entry, stop: targetedSetup.stop,
        targets: targetedSetup.targets, targetSource: targetedSetup.targetSource, ...outcome
      });
    }
  }
  const filled = trades.filter(t => t.filled);
  const total = n => filled.filter(t => t.highestTarget >= n).length;
  const stoppedBeforeTp1 = filled.filter(t => t.stopped && t.highestTarget === 0).length;
  const summary = {
    symbol, dataRows: bars.length, fromUTC: bars[0].openTime, toUTC: bars[bars.length - 1].openTime,
    detectedSetups: trades.length, filledTrades: filled.length,
    unfilledSetups: trades.length - filled.length,
    tp1Hits: total(1), tp2Hits: total(2), tp3Hits: total(3),
    tp1HitRatePct: filled.length ? +(100 * total(1) / filled.length).toFixed(2) : null,
    tp2HitRatePct: filled.length ? +(100 * total(2) / filled.length).toFixed(2) : null,
    tp3HitRatePct: filled.length ? +(100 * total(3) / filled.length).toFixed(2) : null,
    stoppedBeforeTp1, stopBeforeTp1RatePct: filled.length ? +(100 * stoppedBeforeTp1 / filled.length).toFixed(2) : null,
    assumptions: [
      '1-minute candidate engine only; 5M/15M/1H/4H entry gate is not represented by these 1M-only samples.',
      'Targets are selected only from already-confirmed, not-yet-swept 1M opposing swing liquidity; setups without a valid 2R–15R pool are rejected. No higher-timeframe pools are available.',
      'Limit fill requires the candle to touch the exact midpoint entry; gap-through bars are skipped.',
      'If stop and target are both inside one OHLC candle, stop is counted first.',
      'Unfilled setups are excluded from hit-rate denominator; trades unresolved after 720 minutes are censored.'
    ],
    trades
  };
  return summary;
}

const outDir = path.join(ROOT, 'backtest-results');
fs.mkdirSync(outDir, { recursive: true });
const reports = [
  runMarket('XAUUSD', process.argv[2] || '/tmp/XAUUSD_1m.csv'),
  runMarket('NAS100', process.argv[3] || '/tmp/NAS100_1m.csv')
];
for (const report of reports) {
  fs.writeFileSync(path.join(outDir, report.symbol.toLowerCase() + '-target-backtest.json'), JSON.stringify(report, null, 2));
  const { trades, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
}
