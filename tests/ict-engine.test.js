// Lightweight deterministic tests for the browser ICT detection engine.
// Run from repository root: node --test tests/ict-engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', 'assets', 'js', 'institutional-flow.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function extractFunction(text, signature, nextSignature) {
  const start = text.indexOf(signature);
  const end = text.indexOf(nextSignature, start);
  assert.notEqual(start, -1, 'function signature exists: ' + signature);
  assert.notEqual(end, -1, 'next function boundary exists: ' + nextSignature);
  return text.slice(start, end).trim();
}
const analyzeSource = extractFunction(source, 'function analyze(bars){', '\nfunction getMarketXray');
const analyze = new Function('num', 'avg', analyzeSource + '; return analyze;')(
  value => typeof value === 'number' && Number.isFinite(value) ? value : null,
  values => values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
);

function candle(i, overrides = {}) {
  return {
    openTime: new Date(Date.UTC(2026, 0, 1, 0, i * 5)).toISOString(),
    open: 100, high: 101, low: 99, close: 100.5, isOpen: false,
    ...overrides
  };
}
function baseBars() {
  return Array.from({ length: 25 }, (_, i) => candle(i));
}
function findBullishFvg(result) {
  return result.results.find(item => item.type === 'Bullish fair value gap' &&
    item.zone[0] === 101 && item.zone[1] === 103);
}

test('engine source parses as JavaScript', () => {
  assert.doesNotThrow(() => new Function(source));
});

test('does not promote a fresh standalone bullish FVG to a setup', () => {
  const bars = baseBars();
  bars[20] = candle(20, { high: 101, low: 99, open: 100, close: 100.5 });
  bars[21] = candle(21, { high: 103.5, low: 102.5, open: 102.7, close: 103.3 });
  bars[22] = candle(22, { high: 104, low: 103, open: 103.2, close: 103.7 });
  bars[23] = candle(23, { high: 104, low: 103.2, open: 103.5, close: 103.4 });
  bars[24] = candle(24, { high: 104, low: 103.1, open: 103.4, close: 103.3 });
  assert.equal(analyze(bars).results.length, 0);
});

test('does not promote a partially mitigated standalone FVG to a setup', () => {
  const bars = baseBars();
  bars[20] = candle(20, { high: 101, low: 99 });
  bars[21] = candle(21, { high: 103.5, low: 102.5, open: 102.7, close: 103.3 });
  bars[22] = candle(22, { high: 104, low: 103, open: 103.2, close: 103.7 });
  bars[23] = candle(23, { high: 104, low: 102.5, open: 103.5, close: 103.2 });
  bars[24] = candle(24, { high: 104, low: 102.2, open: 103.2, close: 103 });
  bars[24] = candle(24, { high: 103.5, low: 102, open: 103, close: 102.8 });
  assert.equal(analyze(bars).results.length, 0);
});

test('does not present a fully filled bullish FVG as active', () => {
  const bars = baseBars();
  bars[20] = candle(20, { high: 101, low: 99 });
  bars[21] = candle(21, { high: 103.5, low: 102.5, open: 102.7, close: 103.3 });
  bars[22] = candle(22, { high: 104, low: 103, open: 103.2, close: 103.7 });
  bars[23] = candle(23, { high: 104, low: 102.5, open: 103.5, close: 103.2 });
  bars[24] = candle(24, { high: 104, low: 102.2, open: 103.2, close: 103 });
  bars[24] = candle(24, { high: 103, low: 100.5, open: 102.5, close: 101.5 });
  assert.equal(findBullishFvg(analyze(bars)), undefined);
});

test('keeps a sweep without subsequent MSS and zone confirmation unqualified', () => {
  const bars = baseBars();
  bars[24] = candle(24, { open: 100, high: 101, low: 97.5, close: 100.2 });
  const result = analyze(bars);
  assert.equal(result.results.length, 0);
});


function extractXray(text) {
  const start = text.indexOf('function getMarketXray(bars){');
  const end = text.indexOf('\nfunction addXrayEvent', start);
  assert.notEqual(start, -1, 'Market X-Ray function exists');
  assert.notEqual(end, -1, 'Market X-Ray function boundary exists');
  return text.slice(start, end).trim();
}
const getMarketXray = new Function('avg', 'fmt', extractXray(source) + '; return getMarketXray;')(
  values => values.reduce((sum, value) => sum + value, 0) / (values.length || 1),
  value => value == null ? '—' : Number(value).toFixed(2)
);

test('Market X-Ray does not invent a BOS in a flat range', () => {
  const bars = Array.from({ length: 40 }, (_, i) => candle(i));
  const xray = getMarketXray(bars);
  assert.equal(xray.breakType, 'NONE');
  assert.equal(xray.structure, 'Range / unclear');
});

test('Market X-Ray confirms bullish CHOCH only after close breaks a bearish swing sequence', () => {
  const bars = Array.from({ length: 40 }, (_, i) => candle(i));
  bars[25] = candle(25, { high: 110, low: 99, open: 100, close: 105 });
  bars[27] = candle(27, { high: 101, low: 95, open: 100, close: 97 });
  bars[30] = candle(30, { high: 108, low: 99, open: 100, close: 104 });
  bars[32] = candle(32, { high: 101, low: 93, open: 100, close: 96 });
  bars[39] = candle(39, { high: 110, low: 107, open: 108, close: 109 });
  const xray = getMarketXray(bars);
  assert.equal(xray.priorTrend, 'Bearish');
  assert.equal(xray.breakType, 'BULLISH CHOCH');
  assert.equal(xray.structure, 'Bullish CHOCH');
  assert.equal(xray.brokenLevel, 108);
});


test('does not promote an isolated FVG to a trade setup', () => {
  const bars = baseBars();
  bars[20] = candle(20, { high: 101, low: 99 });
  bars[21] = candle(21, { high: 103.5, low: 102.5, open: 102.7, close: 103.3 });
  bars[22] = candle(22, { high: 104, low: 103, open: 103.2, close: 103.7 });
  bars[23] = candle(23, { high: 104, low: 103.2, open: 103.5, close: 103.4 });
  bars[24] = candle(24, { high: 104, low: 103.1, open: 103.4, close: 103.3 });
  assert.equal(analyze(bars).results.length, 0);
});

test('timestamps a setup at its own MSS confirmation, not the latest scan candle', () => {
  const bars = Array.from({ length: 28 }, (_, i) => candle(i));
  bars[20] = candle(20, { open: 100, high: 101, low: 97.5, close: 100.2 });
  bars[21] = candle(21, { open: 100, high: 101, low: 99, close: 100.2 });
  bars[22] = candle(22, { open: 100, high: 101, low: 99, close: 100.2 });
  bars[23] = candle(23, { open: 101.2, high: 104, low: 101.1, close: 103.8 });
  const result = analyze(bars);
  const setup = result.results.find(item => item.side === 'bullish');
  assert.ok(setup);
  assert.equal(setup.time, bars[24].openTime);
  assert.notEqual(setup.time, bars[bars.length - 1].openTime);
});

test('requires sweep then displacement/MSS then a linked FVG before showing a setup', () => {
  const bars = baseBars();
  bars[20] = candle(20, { open: 100, high: 101, low: 97.5, close: 100.2 });
  bars[21] = candle(21, { open: 100, high: 101, low: 99, close: 100.2 });
  bars[22] = candle(22, { open: 100, high: 101, low: 99, close: 100.2 });
  bars[23] = candle(23, { open: 101.2, high: 104, low: 101.1, close: 103.8 });
  bars[24] = candle(24, { open: 103.5, high: 104.5, low: 103.2, close: 104 });
  const result = analyze(bars);
  assert.ok(result.results.some(item => item.side === 'bullish' && item.type.includes('Bullish MSS setup')));
  assert.ok(result.results[0].reason.includes('liquidity sweep'));
  assert.equal(result.results[0].status, 'WAITING FOR RETRACEMENT');
});

test('does not show a linked setup after its sweep extreme is invalidated', () => {
  const bars = baseBars();
  bars[20] = candle(20, { open: 100, high: 101, low: 97.5, close: 100.2 });
  bars[21] = candle(21, { open: 100, high: 101, low: 99, close: 100.2 });
  bars[22] = candle(22, { open: 100, high: 101, low: 99, close: 100.2 });
  bars[23] = candle(23, { open: 101.2, high: 104, low: 101.1, close: 103.8 });
  bars[24] = candle(24, { open: 98, high: 99, low: 97, close: 98 });
  assert.equal(analyze(bars).results.length, 0);
});


test('Market X-Ray reports no dealing range without confirmed swing pair', () => {
  const bars = Array.from({ length: 40 }, (_, i) => candle(i));
  const xray = getMarketXray(bars);
  assert.equal(xray.dealingRange, null);
  assert.equal(xray.zone, 'Range not established');
});

test('Market X-Ray exposes only multi-pivot liquidity clusters', () => {
  const bars = Array.from({ length: 50 }, (_, i) => candle(i));
  bars[10] = candle(10, { high: 105, low: 99, open: 100, close: 101 });
  bars[14] = candle(14, { high: 105.02, low: 99, open: 100, close: 101 });
  bars[18] = candle(18, { high: 106, low: 99, open: 100, close: 101 });
  const xray = getMarketXray(bars);
  assert.ok(Array.isArray(xray.bslPools));
  assert.ok(xray.bslPools.every(pool => pool.count >= 2));
});

test('Market X-Ray returns FVG lifecycle states from closed candles', () => {
  const bars = Array.from({ length: 40 }, (_, i) => candle(i));
  bars[30] = candle(30, { open: 100, high: 101, low: 100, close: 100.5 });
  bars[31] = candle(31, { open: 104, high: 105, low: 104, close: 104.8 });
  bars[32] = candle(32, { open: 105, high: 106, low: 103, close: 105.5 });
  const xray = getMarketXray(bars);
  assert.ok(Array.isArray(xray.activeZones));
});
