'use strict';
const fs=require('node:fs');
const source=fs.readFileSync('assets/js/institutional-flow.js','utf8');
const start=source.indexOf('function applyMtfEntryGate(analysis,mtf,mtfBars){');
const end=source.indexOf('\n function attachMtfLiquidityTargets',start);
if(start<0||end<0)throw new Error('Time-aware MTF gate extraction failed');
const gate=new Function('epochMs','timeframeSeconds','getMarketXray','analyze',source.slice(start,end)+'; return applyMtfEntryGate;')(
 value=>{const n=Date.parse(value);return Number.isFinite(n)?n:NaN},
 tf=>({'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400})[tf]||60,
 bars=>{const last=bars[bars.length-1]||{};return {breakSide:last.breakSide||'neutral',priorTrend:'neutral',activeZones:last.activeZones||[]}},
 bars=>({results:(bars[bars.length-1]||{}).setups||[]})
);
const base=Date.parse('2026-11-20T12:00:00Z'),iso=ms=>new Date(ms).toISOString();
function series(minutes,count,lastFields={}){return Array.from({length:count},(_,i)=>({openTime:iso(base-(count-1-i)*minutes*60000),isOpen:false,...(i===count-1?lastFields:{})}))}
const poi={side:'bullish',low:99.5,high:101.5,state:'FRESH',time:iso(base-30*60000)};
const fiveSetup={side:'bullish',time:iso(base-10*60000),zone:[99.75,101.25],evidence:{sweepIndex:10,mssIndex:12}};
const four=series(240,25,{breakSide:'bullish'});four[24].openTime=iso(base-4*3600000);
four.push({openTime:iso(base),isOpen:false,breakSide:'bearish'});
const one=series(60,25,{breakSide:'bullish'});one[24].openTime=iso(base-3600000);
one.push({openTime:iso(base),isOpen:false,breakSide:'bearish'});
const fifteen=series(15,25,{activeZones:[poi]});fifteen[24].openTime=iso(base-15*60000);
const five=series(5,25,{setups:[fiveSetup]});five[24].openTime=iso(base-5*60000);
const mtfBars={'4h':four,'1h':one,'15m':fifteen,'5m':five};
function assert(ok,message){if(!ok)throw new Error(message);process.stdout.write('PASS '+message+'\n')}
const candidate={side:'bullish',time:iso(base),zone:[100,101],score:80};
const result=gate({results:[{...candidate}]},{},mtfBars);
assert(result.results.length===1,'uses only fully closed MTF candles and confirms aligned 4H/1H/15M/5M context');
assert(result.results[0].mtfConfirmation.asOf===iso(base),'records the exact signal-time MTF snapshot');
const beforeClose=gate({results:[{...candidate,time:iso(base-60000)}]},{},mtfBars);
assert(beforeClose.results.length===0,'does not use 4H/1H candles before their close time');
const staleBars=series(5,25,{setups:[{...fiveSetup,time:iso(base-20*60000)}]});staleBars[24].openTime=iso(base-5*60000);
const staleFive={'4h':four,'1h':one,'15m':fifteen,'5m':staleBars};
const stale=gate({results:[{...candidate}]},{},staleFive);
assert(stale.results.length===0,'rejects stale 5M confirmation outside the 15-minute window');
