'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/js/institutional-flow.js'), 'utf8');
function extract(startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Could not extract ' + label + ' from institutional-flow.js');
  return source.slice(start, end);
}
const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const avg = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const fmt = v => Number.isFinite(v) ? Number(v).toFixed(2) : '—';
const analyze = new Function('num', 'avg',
  extract('function analyze(bars){', '\nfunction applyMtfEntryGate', 'analyze') + '; return analyze;'
)(num, avg);
const applyGate = new Function('',
  extract('function applyMtfEntryGate(analysis,mtf){', '\n function attachMtfLiquidityTargets', 'MTF gate') + '; return applyMtfEntryGate;'
)();
const attachTargets = new Function('num',
  extract('function attachMtfLiquidityTargets(analysis,mtfBars){', '\n function getMarketXray', 'liquidity targets') + '; return attachMtfLiquidityTargets;'
)(num);
const getXray = new Function('avg', 'fmt',
  extract('function getMarketXray(bars){', '\nfunction addXrayEvent', 'market X-ray') + '; return getMarketXray;'
)(avg, fmt);

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
    const bar = { openTime, open: Number(cells[ix.open]), high: Number(cells[ix.high]),
      low: Number(cells[ix.low]), close: Number(cells[ix.close]), isOpen: false };
    if (!Number.isFinite(Date.parse(openTime)) ||
        ![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
        bar.high < Math.max(bar.open, bar.close) ||
        bar.low > Math.min(bar.open, bar.close) || bar.high < bar.low) continue;
    bars.push(bar);
  }
  bars.sort((a, b) => Date.parse(a.openTime) - Date.parse(b.openTime));
  return bars;
}

// UTC-aligned aggregation. Partial buckets and buckets with missing 1m bars are discarded.
function resample1m(bars, minutes) {
  const duration = minutes * 60000, groups = new Map();
  for (const bar of bars) {
    const t = Date.parse(bar.openTime), bucket = Math.floor(t / duration) * duration;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(bar);
  }
  const out = [];
  for (const [bucket, rows] of groups) {
    rows.sort((a, b) => Date.parse(a.openTime) - Date.parse(b.openTime));
    if (rows.length !== minutes || Date.parse(rows[0].openTime) !== bucket) continue;
    let complete = true;
    for (let i = 0; i < rows.length; i++) {
      if (Date.parse(rows[i].openTime) !== bucket + i * 60000) { complete = false; break; }
    }
    if (!complete) continue;
    out.push({
      openTime: new Date(bucket).toISOString(),
      closeTime: new Date(bucket + duration).toISOString(),
      open: rows[0].open,
      high: Math.max(...rows.map(x => x.high)),
      low: Math.min(...rows.map(x => x.low)),
      close: rows[rows.length - 1].close,
      isOpen: false
    });
  }
  return out.sort((a, b) => Date.parse(a.openTime) - Date.parse(b.openTime));
}

function simulate(bars, signalIndex, setup, maxForward = 720) {
  const targets = (setup.targets || [setup.target]).filter(Number.isFinite);
  const entry = setup.entry, outcome = { filled: false, highestTarget: 0, stopped: false, expired: false };
  const bullish = setup.side === 'bullish';
  let fillIndex = -1;
  for (let i = signalIndex; i < Math.min(bars.length, signalIndex + maxForward); i++) {
    const c = bars[i];
    if (bullish && c.open < entry) continue;
    if (!bullish && c.open > entry) continue;
    if (c.low <= entry && c.high >= entry) { outcome.filled = true; fillIndex = i; break; }
  }
  if (!outcome.filled) { outcome.expired = true; return outcome; }
  for (let i = fillIndex; i < Math.min(bars.length, fillIndex + maxForward); i++) {
    const c = bars[i], stopHit = bullish ? c.low <= setup.stop : c.high >= setup.stop;
    const hitIndices = targets.map((t, k) => ({ t, k })).filter(x => bullish ? c.high >= x.t : c.low <= x.t);
    if (stopHit) { outcome.stopped = true; break; }
    if (hitIndices.length) outcome.highestTarget = Math.max(outcome.highestTarget, ...hitIndices.map(x => x.k + 1));
    if (outcome.highestTarget === targets.length && targets.length) break;
  }
  if (!outcome.stopped && outcome.highestTarget < targets.length) outcome.expired = true;
  return outcome;
}

function runMarket(symbol, file) {
  const bars = readCsv(file);
  if (bars.length < 500) throw new Error(symbol + ': not enough valid 1m bars (' + bars.length + ')');
  const higher = { '5m': resample1m(bars, 5), '15m': resample1m(bars, 15),
    '1h': resample1m(bars, 60), '4h': resample1m(bars, 240) };
  const pointers = { '5m': 0, '15m': 0, '1h': 0, '4h': 0 };
  const mtf = {}, seen = new Set(), trades = [];
  const gateRejects = { '4H major bias or 1H structure': 0, '15M active FVG POI': 0, '5M confirmed MSS': 0, 'other': 0 };
  const windowSize = 180;
  for (let i = 30; i < bars.length; i++) {
    const signalTime = Date.parse(bars[i].openTime);
    for (const tf of ['5m', '15m', '1h', '4h']) {
      const series = higher[tf];
      let next = pointers[tf];
      while (next < series.length && Date.parse(series[next].closeTime) <= signalTime) next++;
      if (next !== pointers[tf]) {
        pointers[tf] = next;
        const closed = series.slice(Math.max(0, next - 180), next);
        try {
          const a = analyze(closed), x = getXray(a.bars);
          mtf[tf] = { bias: a.bias, structure: x.structure, bars: a.bars.length, xray: x, setups: a.results };
        } catch (_) {
          mtf[tf] = { bias: 'Unavailable', structure: 'Unavailable', bars: closed.length, xray: null, setups: [] };
        }
      }
    }
    const start = Math.max(0, i - windowSize), window = bars.slice(start, i);
    window[window.length - 1].closeTime = bars[i].openTime;
    let result;
    try { result = analyze(window); } catch (_) { continue; }
    for (const candidate of result.results) {
      if (Date.parse(candidate.time) !== signalTime) continue;
      const key = candidate.side + '|' + candidate.time + '|' + candidate.type;
      if (seen.has(key)) continue;
      seen.add(key);
      const gated = applyGate({ results: [{ ...candidate }] }, mtf);
      if (!gated.results.length) {
        const why = candidate.mtfText || '';
        if (why.includes('4H') || why.includes('1H')) gateRejects['4H major bias or 1H structure']++;
        else if (why.includes('15M')) gateRejects['15M active FVG POI']++;
        else if (why.includes('5M')) gateRejects['5M confirmed MSS']++;
        else gateRejects.other++;
        continue;
      }
      const setup = gated.results[0];
      const targetBars = { '1m': window };
      for (const tf of ['5m', '15m', '1h', '4h']) targetBars[tf] = higher[tf].slice(Math.max(0, pointers[tf] - 500), pointers[tf]);
      const targetAnalysis = { results: [setup] };
      attachTargets(targetAnalysis, targetBars);
      if (!targetAnalysis.results.length) continue;
      const targeted = targetAnalysis.results[0], outcome = simulate(bars, i, targeted);
      trades.push({ side: targeted.side, time: targeted.time, entry: targeted.entry, stop: targeted.stop,
        targets: targeted.targets, targetLevels: targeted.targetLevels, mtfConfirmation: targeted.mtfConfirmation, ...outcome });
    }
  }
  const filled = trades.filter(t => t.filled), eligible = n => filled.filter(t => (t.targets || []).length >= n);
  const hits = n => eligible(n).filter(t => t.highestTarget >= n).length;
  const e1 = eligible(1).length, e2 = eligible(2).length, e3 = eligible(3).length;
  const stopped = filled.filter(t => t.stopped && t.highestTarget === 0).length;
  return {
    symbol, dataRows: bars.length, fromUTC: bars[0].openTime, toUTC: bars[bars.length - 1].openTime,
    resampledBars: Object.fromEntries(Object.entries(higher).map(([tf, rows]) => [tf, rows.length])),
    strictMtfQualifiedSetups: trades.length, filledTrades: filled.length, unfilledSetups: trades.length - filled.length,
    gateRejects, tp1EligibleTrades: e1, tp2EligibleTrades: e2, tp3EligibleTrades: e3,
    tp1Hits: hits(1), tp2Hits: hits(2), tp3Hits: hits(3),
    tp1HitRatePct: e1 ? +(100 * hits(1) / e1).toFixed(2) : null,
    tp2HitRatePct: e2 ? +(100 * hits(2) / e2).toFixed(2) : null,
    tp3HitRatePct: e3 ? +(100 * hits(3) / e3).toFixed(2) : null,
    stoppedBeforeTp1: stopped, stopBeforeTp1RatePct: filled.length ? +(100 * stopped / filled.length).toFixed(2) : null,
    assumptions: [
      'This is a historical 4H/1H/15M/5M confluence gate applied to 1M candidate setups; all timeframes are UTC-resampled from the same free 1M source.',
      'Only complete, contiguous 1M buckets are used to construct higher timeframes; incomplete buckets are discarded.',
      'Higher-timeframe candles are exposed only after their close time is at or before the 1M signal timestamp.',
      '4H and 1H direction, confirmed active 15M FVG POI, and recent confirmed 5M sweep/displacement/MSS zone must align.',
      'Targets are selected from already-confirmed, not-yet-swept opposing swing liquidity on available timeframes, with 2R–15R limits; no valid target means no trade.',
      'Limit fill requires exact midpoint entry touch; gap-through bars are skipped. Stop wins if stop and target are both inside one OHLC candle.',
      'TP2/TP3 hit rates use only filled trades with at least two/three real targets. Unfilled setups are excluded; unresolved trades after 720 minutes are censored.',
      'Data are free vendor samples, not tick data; OHLC execution and spread/slippage are not modeled.'
    ],
    trades
  };
}

const outDir = path.join(ROOT, 'backtest-results');
fs.mkdirSync(outDir, { recursive: true });
for (const [symbol, file] of [['XAUUSD', process.argv[2] || '/tmp/XAUUSD_1m.csv'],
  ['NAS100', process.argv[3] || '/tmp/NAS100_1m.csv']]) {
  const report = runMarket(symbol, file);
  fs.writeFileSync(path.join(outDir, symbol.toLowerCase() + '-mtf-backtest.json'), JSON.stringify(report, null, 2));
  const { trades, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2));
}
