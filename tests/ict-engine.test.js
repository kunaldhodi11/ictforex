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

test('detects a fresh bullish FVG from a completed three-candle sequence', () => {
  const bars = baseBars();
  bars[20] = candle(20, { high: 101, low: 99, open: 100, close: 100.5 });
  bars[21] = candle(21, { high: 103.5, low: 102.5, open: 102.7, close: 103.3 });
  bars[22] = candle(22, { high: 104, low: 103, open: 103.2, close: 103.7 });
  bars[23] = candle(23, { high: 104, low: 102.5, open: 103.5, close: 103.2 });
  bars[24] = candle(24, { high: 104, low: 102.2, open: 103.2, close: 103 });
  const found = findBullishFvg(analyze(bars));
  assert.ok(found);
  assert.equal(found.lifecycle, 'FRESH');
});

test('marks an FVG partially mitigated when price trades into but not through it', () => {
  const bars = baseBars();
  bars[20] = candle(20, { high: 101, low: 99 });
  bars[21] = candle(21, { high: 103.5, low: 102.5, open: 102.7, close: 103.3 });
  bars[22] = candle(22, { high: 104, low: 103, open: 103.2, close: 103.7 });
  bars[23] = candle(23, { high: 104, low: 102.5, open: 103.5, close: 103.2 });
  bars[24] = candle(24, { high: 104, low: 102.2, open: 103.2, close: 103 });
  bars[24] = candle(24, { high: 103.5, low: 102, open: 103, close: 102.8 });
  const found = findBullishFvg(analyze(bars));
  assert.ok(found);
  assert.equal(found.lifecycle, 'PARTIALLY MITIGATED');
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

test('detects a completed sell-side sweep and reclaim', () => {
  const bars = baseBars();
  bars[24] = candle(24, { open: 100, high: 101, low: 97.5, close: 100.2 });
  const result = analyze(bars);
  assert.ok(result.results.some(item => item.type === 'Sell-side liquidity sweep'));
});
