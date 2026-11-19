/* ICT Forex Academy — Live Market Heatmap
 *
 * Prices are read straight from the visitor's browser from the free biquote.io
 * market data service (no API key, CORS enabled). This site never stores or
 * re-publishes the prices.
 *
 * Rule for this file: nothing is ever invented. If the feed gives no value for a
 * market, the tile shows "N/A" or an em dash.
 *
 * Add ?debug=1 to the page address to print what the feed returned in the
 * browser console (handy when a symbol name or response shape changes).
 */
(function () {
  'use strict';

  var API = 'https://biquote.io/api';
  var POLL_MS = 15000;          // how often prices refresh
  var REF_MS = 10 * 60 * 1000;  // how often the daily open is refreshed
  var TIMEOUT_MS = 8000;
  var MAX_BACKOFF_MS = 120000;
  var STALE_AFTER_MS = 60000;
  var DEBUG = /[?&]debug=1(&|$)/.test(location.search);

  function dbg() {
    if (DEBUG && window.console) console.log.apply(console, ['[heatmap]'].concat([].slice.call(arguments)));
  }

  /* ---------- Markets ---------- */

  var CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
  var MAJORS = { EURUSD: 1, GBPUSD: 1, AUDUSD: 1, NZDUSD: 1, USDJPY: 1, USDCHF: 1, USDCAD: 1 };
  var FX_PAIRS = [
    'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD',
    'EURGBP', 'EURJPY', 'EURCHF', 'EURAUD', 'EURCAD', 'EURNZD',
    'GBPJPY', 'GBPCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD',
    'AUDJPY', 'AUDCHF', 'AUDCAD', 'AUDNZD',
    'NZDJPY', 'NZDCHF', 'NZDCAD',
    'CADJPY', 'CADCHF',
    'CHFJPY'
  ];
  // The first name that the feed answers for is used. Index CFD names differ between providers.
  var KEY_MARKETS = [
    { id: 'XAUUSD', label: 'Gold', sub: 'XAU/USD', cands: ['XAUUSD'], dec: 2, scale: 2 },
    { id: 'NAS100', label: 'Nasdaq 100', sub: 'NAS100', cands: ['NAS100', 'US100', 'USTEC', 'NASDAQ100', 'NDX100'], dec: 1, scale: 2 },
    { id: 'US30', label: 'Dow Jones 30', sub: 'US30', cands: ['US30', 'DJ30', 'WS30', 'DJI30', 'USDOW'], dec: 1, scale: 2 },
    { id: 'BTCUSD', label: 'Bitcoin', sub: 'BTC/USD', cands: ['BTCUSD'], dec: 1, scale: 5 }
  ];

  var insts = [];
  KEY_MARKETS.forEach(function (d) {
    insts.push(makeInst({ id: d.id, label: d.label, sub: d.sub, cands: d.cands, dec: d.dec, scale: d.scale, group: 'key' }));
  });
  FX_PAIRS.forEach(function (p) {
    var base = p.slice(0, 3), quote = p.slice(3);
    insts.push(makeInst({
      id: p, label: base + '/' + quote, sub: '', cands: [p], base: base, quote: quote,
      dec: quote === 'JPY' ? 3 : 5, scale: 1, group: MAJORS[p] ? 'majors' : 'crosses'
    }));
  });

  function makeInst(def) {
    return {
      def: def, sym: null, price: null, bid: null, ask: null, open: null, high: null, low: null,
      chg: null, ts: NaN, seen: 0, marketState: '', stale: false, el: null, refs: null
    };
  }

  var state = {
    booted: false, busy: false, batchBroken: false, lastOk: 0, lastRef: 0, fails: 0,
    filter: 'all', sort: false, openInst: null, timer: null
  };

  /* ---------- Helpers ---------- */

  function num(v) {
    var n = typeof v === 'string' ? parseFloat(v) : v;
    return (typeof n === 'number' && isFinite(n)) ? n : null;
  }
  function firstNum(o, keys) {
    for (var i = 0; i < keys.length; i++) {
      var n = num(o[keys[i]]);
      if (n !== null) return n;
    }
    return null;
  }
  function toTime(v) {
    if (typeof v === 'number' && isFinite(v)) return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') { var t = Date.parse(v); return isFinite(t) ? t : NaN; }
    return NaN;
  }
  function toArray(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') {
      var wrap = ['ticks', 'data', 'items', 'results', 'bars', 'candles', 'ohlc'];
      for (var i = 0; i < wrap.length; i++) if (Array.isArray(x[wrap[i]])) return x[wrap[i]];
      return Object.keys(x).map(function (k) {
        var v = x[k];
        return (v && typeof v === 'object' && !Array.isArray(v) && !v.symbol) ? Object.assign({ symbol: k }, v) : v;
      });
    }
    return [];
  }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function fmtPrice(v, dec) {
    return v === null ? 'N/A' : v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtPct(v) {
    if (v === null) return '—';
    var s = Math.abs(v) < 0.005 ? 0 : v;
    return (s > 0 ? '+' : '') + s.toFixed(2) + '%';
  }
  function fmtTime(ms) {
    return isFinite(ms) && ms > 0 ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  }

  /* ---------- Feed ---------- */

  function getJSON(url) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store', credentials: 'omit', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); throw e; });
  }

  // Latest price. Documented shape: { symbol, bid, ask, mid, timestamp, marketState, stale }
  function parseTick(o) {
    if (!o || typeof o !== 'object') return null;
    var bid = num(o.bid), ask = num(o.ask), mid = num(o.mid);
    if (mid === null && bid !== null && ask !== null) mid = (bid + ask) / 2;
    if (mid === null || mid <= 0) return null;
    return {
      symbol: String(o.symbol || '').toUpperCase(), mid: mid, bid: bid, ask: ask,
      ts: toTime(o.timestamp), marketState: String(o.marketState || '').toLowerCase(), stale: o.stale === true
    };
  }

  // Daily bar. The exact field names are read defensively because the docs do not show a sample.
  function parseBar(b) {
    if (Array.isArray(b)) {
      var o1 = num(b[1]);
      return o1 === null || o1 <= 0 ? null : { t: toTime(b[0]), o: o1, h: num(b[2]), l: num(b[3]), c: num(b[4]) };
    }
    if (!b || typeof b !== 'object') return null;
    var o = firstNum(b, ['open', 'o', 'Open']);
    if (o === null || o <= 0) return null;
    var t = NaN, tk = ['time', 't', 'timestamp', 'openTime', 'start', 'date'];
    for (var i = 0; i < tk.length && !isFinite(t); i++) t = toTime(b[tk[i]]);
    return { t: t, o: o, h: firstNum(b, ['high', 'h', 'High']), l: firstNum(b, ['low', 'l', 'Low']), c: firstNum(b, ['close', 'c', 'Close']) };
  }

  // Today's bar = newest by time; if times are unreadable, the one whose range holds the current price.
  function chooseBar(bars, mid) {
    var list = bars.filter(Boolean);
    if (!list.length) return null;
    var timed = list.filter(function (b) { return isFinite(b.t); });
    if (timed.length === list.length) {
      return timed.reduce(function (a, b) { return b.t > a.t ? b : a; });
    }
    for (var i = list.length - 1; i >= 0; i--) {
      var b = list[i];
      if (b.l !== null && b.h !== null && mid >= b.l && mid <= b.h) return b;
    }
    return list[list.length - 1];
  }

  function applyTick(inst, t) {
    var prev = inst.price;
    inst.price = t.mid; inst.bid = t.bid; inst.ask = t.ask;
    inst.marketState = t.marketState; inst.stale = t.stale;
    if (isFinite(t.ts)) inst.ts = t.ts;
    inst.seen = Date.now();
    inst.flash = (prev !== null && t.mid !== prev) ? (t.mid > prev ? 'up' : 'down') : '';
    updateChange(inst);
  }
  function updateChange(inst) {
    inst.chg = (inst.open !== null && inst.price !== null) ? (inst.price - inst.open) / inst.open * 100 : null;
  }

  function resolveOne(inst) {
    var cands = inst.def.cands.slice();
    function next() {
      if (!cands.length) { inst.sym = null; return Promise.resolve(false); }
      var c = cands.shift();
      return getJSON(API + '/' + encodeURIComponent(c)).then(function (j) {
        var tick = parseTick(j);
        dbg('resolve', c, tick ? 'ok' : 'no usable price', j);
        if (tick) { inst.sym = c; applyTick(inst, tick); return true; }
        return next();
      }, function (e) { dbg('resolve', c, 'failed', e.message); return next(); });
    }
    return next();
  }

  function loadRef(inst) {
    if (!inst.sym) return Promise.resolve();
    return getJSON(API + '/' + encodeURIComponent(inst.sym) + '/ohlc?interval=1d&limit=2').then(function (j) {
      var bar = chooseBar(toArray(j).map(parseBar), inst.price);
      dbg('daily bar', inst.sym, bar, j);
      if (bar) { inst.open = bar.o; inst.high = bar.h; inst.low = bar.l; }
      updateChange(inst);
    }, function (e) { dbg('daily bar failed', inst.sym, e.message); });
  }

  function refreshRefs() {
    var jobs = insts.map(function (i) { return i.sym ? loadRef(i) : resolveOne(i).then(function () { return loadRef(i); }); });
    return Promise.all(jobs).then(function () { state.lastRef = Date.now(); });
  }

  function pollBatch(live) {
    var q = live.map(function (i) { return 'symbols=' + encodeURIComponent(i.sym); }).join('&');
    return getJSON(API + '/latest?' + q).then(function (j) {
      var ticks = toArray(j).map(parseTick).filter(Boolean);
      dbg('batch', ticks.length, 'ticks');
      var n = 0;
      ticks.forEach(function (t) {
        for (var i = 0; i < live.length; i++) {
          if (live[i].sym.toUpperCase() === t.symbol) { applyTick(live[i], t); n++; break; }
        }
      });
      return n;
    });
  }
  function pollEach(live) {
    return Promise.all(live.map(function (inst) {
      return getJSON(API + '/' + encodeURIComponent(inst.sym)).then(function (j) {
        var t = parseTick(j);
        if (t) { applyTick(inst, t); return 1; }
        return 0;
      }, function () { return 0; });
    })).then(function (r) { return r.reduce(function (a, b) { return a + b; }, 0); });
  }

  function poll() {
    var live = insts.filter(function (i) { return i.sym; });
    if (!live.length) return Promise.resolve(0);
    var first = state.batchBroken ? Promise.resolve(0) : pollBatch(live).catch(function (e) { dbg('batch failed', e.message); return 0; });
    return first.then(function (n) {
      if (n) return n;
      return pollEach(live).then(function (m) { if (m) state.batchBroken = true; return m; });
    });
  }

  /* ---------- Build the page ---------- */

  function buildTiles() {
    var keyGrid = $('mhKeyGrid'), fxGrid = $('mhFxGrid');
    insts.forEach(function (inst) {
      var isKey = inst.def.group === 'key';
      var b = el('button', 'mh-tile mh-na' + (isKey ? ' mh-tile-key' : ''));
      b.type = 'button';
      var top = el('div', 'mh-tile-top');
      top.appendChild(el('span', 'mh-sym', inst.def.label));
      var badge = el('span', 'mh-badge', '');
      top.appendChild(badge);
      var chg = el('div', 'mh-chg', '—');
      var bottom = el('div', 'mh-price', 'Loading…');
      b.appendChild(top);
      if (inst.def.sub) b.appendChild(el('div', 'mh-sub', inst.def.sub));
      b.appendChild(chg);
      b.appendChild(bottom);
      b.addEventListener('click', function () { if (inst.price !== null) openDetail(inst); });
      inst.el = b;
      inst.refs = { badge: badge, chg: chg, price: bottom };
      (isKey ? keyGrid : fxGrid).appendChild(b);
    });

    var bars = $('mhBars');
    CURRENCIES.forEach(function (c) {
      var row = el('div', 'mh-bar-row');
      row.setAttribute('data-cur', c);
      row.appendChild(el('span', 'mh-bar-cur', c));
      var track = el('div', 'mh-track');
      var fill = el('div', 'mh-fill');
      track.appendChild(fill);
      row.appendChild(track);
      var val = el('span', 'mh-bar-val', '—');
      row.appendChild(val);
      row._fill = fill; row._val = val;
      bars.appendChild(row);
    });
  }

  /* ---------- Render ---------- */

  function renderTile(inst) {
    var e = inst.el, r = inst.refs;
    var noFeed = inst.sym === null && (state.booted || state.fails > 0);
    var dir = inst.chg === null ? 'na' : (Math.abs(inst.chg) < 0.005 ? 'flat' : (inst.chg > 0 ? 'up' : 'down'));
    if (inst.price !== null && inst.chg === null) dir = 'flat';
    var t = inst.chg === null ? 0 : Math.min(1, Math.abs(inst.chg) / inst.def.scale);

    e.classList.remove('mh-up', 'mh-down', 'mh-flat', 'mh-na', 'mh-hot', 'mh-stale');
    e.classList.add('mh-' + dir);
    if (t > 0.8) e.classList.add('mh-hot');
    var stale = inst.stale || (inst.price !== null && Date.now() - inst.seen > STALE_AFTER_MS);
    if (stale) e.classList.add('mh-stale');
    e.style.setProperty('--t', t.toFixed(3));
    e.disabled = inst.price === null;

    var arrow = dir === 'up' ? '▲ ' : (dir === 'down' ? '▼ ' : '');
    r.chg.textContent = noFeed ? 'N/A' : arrow + fmtPct(inst.chg);
    r.price.textContent = noFeed ? 'No data from feed' : (inst.price === null ? 'Loading…' : fmtPrice(inst.price, inst.def.dec));
    r.badge.textContent = inst.marketState === 'closed' ? 'Closed' : '';

    if (inst.price !== null) {
      e.setAttribute('aria-label', inst.def.label + ' ' + fmtPrice(inst.price, inst.def.dec) + ', ' +
        (inst.chg === null ? 'daily change not available' : fmtPct(inst.chg) + ' since the daily open') + '. Open details.');
    } else {
      e.setAttribute('aria-label', inst.def.label + (noFeed ? ' not available on this feed' : ' loading'));
    }

    if (inst.flash) {
      var cls = 'mh-flash-' + inst.flash;
      e.classList.remove('mh-flash-up', 'mh-flash-down');
      void e.offsetWidth;
      e.classList.add(cls);
      inst.flash = '';
    }
  }

  function computeStrength() {
    var acc = {};
    CURRENCIES.forEach(function (c) { acc[c] = { sum: 0, n: 0 }; });
    insts.forEach(function (i) {
      if (i.def.group === 'key' || i.chg === null) return;
      acc[i.def.base].sum += i.chg; acc[i.def.base].n++;
      acc[i.def.quote].sum -= i.chg; acc[i.def.quote].n++;
    });
    var out = {};
    CURRENCIES.forEach(function (c) { out[c] = acc[c].n >= 4 ? acc[c].sum / acc[c].n : null; });
    return out;
  }

  function renderStrength() {
    var s = computeStrength();
    var max = 0.05;
    CURRENCIES.forEach(function (c) { if (s[c] !== null) max = Math.max(max, Math.abs(s[c])); });
    var rows = [].slice.call($('mhBars').children);
    rows.forEach(function (row) {
      var c = row.getAttribute('data-cur'), v = s[c];
      row._val.textContent = fmtPct(v);
      row._fill.className = 'mh-fill ' + (v !== null && v < 0 ? 'mh-neg' : 'mh-pos');
      row._fill.style.width = v === null ? '0' : (Math.abs(v) / max * 50).toFixed(1) + '%';
      row.style.order = v === null ? 99 : String(Math.round((1000 - v * 100)));
    });
    var ranked = CURRENCIES.filter(function (c) { return s[c] !== null; }).sort(function (a, b) { return s[b] - s[a]; });
    $('mhStrongest').textContent = ranked.length ? ranked[0] : '–';
    $('mhWeakest').textContent = ranked.length ? ranked[ranked.length - 1] : '–';
  }

  function applyFilterAndSort() {
    var f = state.filter;
    var visible = { key: 0, fx: 0 };
    insts.forEach(function (i) {
      var g = i.def.group;
      var show = f === 'all' || (f === 'key' && g === 'key') || (f === 'majors' && g === 'majors') || (f === 'crosses' && g === 'crosses');
      i.el.hidden = !show;
      if (show) visible[g === 'key' ? 'key' : 'fx']++;
    });
    $('mhKeySection').hidden = visible.key === 0;
    $('mhFxSection').hidden = visible.fx === 0;

    insts.forEach(function (i, idx) {
      var order = idx;
      if (state.sort) order = i.chg === null ? 9999 : Math.round(1000 - Math.abs(i.chg) / i.def.scale * 100);
      i.el.style.order = String(order);
    });
  }

  function setStatus(kind, text) {
    var s = $('mhState');
    if (s.getAttribute('data-state') !== kind) s.setAttribute('data-state', kind);
    if ($('mhStateText').textContent !== text) $('mhStateText').textContent = text;
  }

  function renderAll() {
    insts.forEach(renderTile);
    renderStrength();
    applyFilterAndSort();

    var up = 0, down = 0;
    insts.forEach(function (i) {
      if (i.chg === null || Math.abs(i.chg) < 0.005) return;
      if (i.chg > 0) up++; else down++;
    });
    var anyChg = insts.some(function (i) { return i.chg !== null; });
    $('mhRising').textContent = anyChg ? String(up) : '–';
    $('mhFalling').textContent = anyChg ? String(down) : '–';

    var priced = insts.filter(function (i) { return i.price !== null; });
    var allClosed = priced.length > 0 && priced.every(function (i) { return i.marketState === 'closed'; });
    var age = state.lastOk ? Date.now() - state.lastOk : Infinity;
    if (!state.booted && state.fails === 0) {
      setStatus('connecting', 'Connecting to price feed…');
    } else if (!priced.length) {
      setStatus('error', 'Price feed unavailable. Retrying…');
    } else if (state.fails >= 3 || age > STALE_AFTER_MS * 3) {
      setStatus('error', 'Price feed unavailable. Showing last prices.');
    } else if (allClosed) {
      setStatus('closed', 'Markets closed · last prices');
    } else if (age > STALE_AFTER_MS) {
      setStatus('delayed', 'Delayed · retrying');
    } else {
      setStatus('live', 'Live · indicative prices');
    }
    $('mhUpdated').textContent = state.lastOk ? 'Last update ' + fmtTime(state.lastOk) : '';
    if (state.openInst) renderDetail(state.openInst);
  }

  /* ---------- Detail dialog ---------- */

  function openDetail(inst) {
    state.openInst = inst;
    renderDetail(inst);
    var d = $('mhDialog');
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else { d.setAttribute('open', ''); }
  }
  function closeDetail() {
    var d = $('mhDialog');
    state.openInst = null;
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }
  function renderDetail(inst) {
    var dec = inst.def.dec;
    $('mhDlgTitle').textContent = inst.def.label;
    $('mhDlgSub').textContent = inst.def.sub ? inst.def.sub : (inst.sym || '');
    var price = $('mhDlgPrice');
    price.textContent = fmtPrice(inst.price, dec);
    var tag = el('span', '', fmtPct(inst.chg));
    var dir = inst.chg === null || Math.abs(inst.chg) < 0.005 ? '' : (inst.chg > 0 ? 'mh-up-text' : 'mh-down-text');
    if (dir) tag.className = dir;
    price.appendChild(tag);

    var spread = (inst.bid !== null && inst.ask !== null) ? inst.ask - inst.bid : null;
    var rows = [
      ['Change since daily open', fmtPct(inst.chg)],
      ['Daily open', inst.open === null ? 'N/A' : fmtPrice(inst.open, dec)],
      ['Day high', inst.high === null ? 'N/A' : fmtPrice(inst.high, dec)],
      ['Day low', inst.low === null ? 'N/A' : fmtPrice(inst.low, dec)],
      ['Bid', inst.bid === null ? 'N/A' : fmtPrice(inst.bid, dec)],
      ['Ask', inst.ask === null ? 'N/A' : fmtPrice(inst.ask, dec)],
      ['Spread', spread === null ? 'N/A' : fmtPrice(spread, dec)],
      ['Market state', inst.marketState ? inst.marketState.charAt(0).toUpperCase() + inst.marketState.slice(1) : 'N/A'],
      ['Feed time', fmtTime(inst.ts)]
    ];
    var dl = $('mhDlgList');
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    rows.forEach(function (r) {
      var d = el('div');
      d.appendChild(el('dt', '', r[0]));
      d.appendChild(el('dd', '', r[1]));
      dl.appendChild(d);
    });
  }

  /* ---------- Controls ---------- */

  function bindControls() {
    [].slice.call(document.querySelectorAll('.mh-chip[data-filter]')).forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.getAttribute('data-filter');
        [].slice.call(document.querySelectorAll('.mh-chip[data-filter]')).forEach(function (x) {
          var on = x === b;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        applyFilterAndSort();
      });
    });
    $('mhSort').addEventListener('click', function () {
      state.sort = !state.sort;
      this.setAttribute('aria-pressed', state.sort ? 'true' : 'false');
      applyFilterAndSort();
    });
    $('mhDlgClose').addEventListener('click', closeDetail);
    $('mhDialog').addEventListener('click', function (ev) { if (ev.target === this) closeDetail(); });
    $('mhDialog').addEventListener('close', function () { state.openInst = null; });
  }

  /* ---------- Loop ---------- */

  function schedule(ms) {
    clearTimeout(state.timer);
    state.timer = setTimeout(tick, ms);
  }
  function nextDelay() {
    return state.fails ? Math.min(POLL_MS * Math.pow(2, state.fails), MAX_BACKOFF_MS) : POLL_MS;
  }

  function boot() {
    return Promise.all(insts.map(resolveOne)).then(function () {
      var any = insts.some(function (i) { return i.sym; });
      if (!any) return false;
      return refreshRefs().then(function () { return true; });
    });
  }

  function tick() {
    if (document.hidden || state.busy) return; // resumes on visibilitychange
    state.busy = true;
    var job;
    if (!state.booted) {
      job = boot().then(function (ok) { if (ok) state.booted = true; return ok; });
    } else {
      job = poll().then(function (n) {
        if (Date.now() - state.lastRef > REF_MS) return refreshRefs().then(function () { return n; });
        return n;
      });
    }
    job.then(function (ok) { return !!ok; }, function () { return false; }).then(function (ok) {
      if (ok) { state.fails = 0; state.lastOk = Date.now(); } else { state.fails++; }
      state.busy = false;
      renderAll();
      schedule(nextDelay());
    });
  }

  function init() {
    buildTiles();
    bindControls();
    renderAll();
    if (DEBUG) window.__mh = { insts: insts, state: state };
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { clearTimeout(state.timer); tick(); }
    });
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
