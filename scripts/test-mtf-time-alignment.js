'use strict';
const fs=require('node:fs');
const source=fs.readFileSync('assets/js/institutional-flow.js','utf8');
const start=source.indexOf('function applyMtfEntryGate(analysis,mtf,mtfBars){');
const end=source.indexOf('\n function attachMtfLiquidityTargets',start);
if(start<0||end<0)throw new Error('Time-aware MTF gate extraction failed');
const gate=new Function('epochMs','timeframeSeconds','getMarketXray','analyze',source.slice(start,end)+'; return applyMtfEntryGate;')(
 value=>{const n=Date.parse(value);return Number.isFinite(n)?n:NaN},
 tf=>({'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400})[tf]||60,
 bars=>{const last=bars[bars.length-1]||{};return {breakSide:last.breakSide||'neutral',priorTrend:last.priorTrend||'neutral',activeZones:last.activeZones||[]}},
 bars=>({results:(bars[bars.length-1]||{}).setups||[]})
);
const stamp=s=>new Date('2026-11-20T'+s+':00Z').toISOString();
const signalTime=stamp('12:00');
const poi={side:'bullish',low:99.5,high:101.5,state:'FRESH',time:stamp('11:30')};
const fiveSetup={side:'bullish',time:stamp('11:50'),zone:[99.75,101.25],evidence:{sweepIndex:10,mssIndex:12}};
const mtfBars={
 '4h':[{openTime:stamp('08:00'),isOpen:false,breakSide:'bullish'},{openTime:stamp('12:00'),isOpen:false,breakSide:'bearish'}],
 '1h':[{openTime:stamp('11:00'),isOpen:false,breakSide:'bullish'},{openTime:stamp('12:00'),isOpen:false,breakSide:'bearish'}],
 '15m':[{openTime:stamp('11:30'),isOpen:false,activeZones:[poi]},{openTime:stamp('11:45'),isOpen:false,activeZones:[poi]}],
 '5m':[{openTime:stamp('11:50'),isOpen:false,setups:[fiveSetup]},{openTime:stamp('11:55'),isOpen:false,setups:[fiveSetup]}]
};
function assert(ok,message){if(!ok)throw new Error(message);process.stdout.write('PASS '+message+'\n')}
const candidate={side:'bullish',time:signalTime,zone:[100,101],score:80};
const result=gate({results:[{...candidate}]},{},mtfBars);
assert(result.results.length===1,'uses only fully closed MTF candles and confirms aligned 4H/1H/15M/5M context');
assert(result.results[0].mtfConfirmation.asOf===signalTime,'records the exact signal-time MTF snapshot');
const beforeClose=gate({results:[{...candidate,time:stamp('11:59')}]},{},mtfBars);
assert(beforeClose.results.length===0,'does not use 4H or 1H candles before their close time');
const staleFive={...mtfBars,'5m':[{openTime:stamp('11:35'),isOpen:false,setups:[{...fiveSetup,time:stamp('11:35')}]}]};
const stale=gate({results:[{...candidate}]},{},staleFive);
assert(stale.results.length===0,'rejects stale 5M confirmation outside the 15-minute window');
