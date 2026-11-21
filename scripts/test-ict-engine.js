'use strict';
const fs=require('node:fs');
const source=fs.readFileSync('assets/js/institutional-flow.js','utf8');
const start=source.indexOf('function analyze(bars){');
const end=source.indexOf('\nfunction applyMtfEntryGate',start);
if(start<0||end<0)throw new Error('ICT analyze extraction failed');
const analyze=new Function('num','avg',source.slice(start,end)+'; return analyze;')(
 v=>typeof v==='number'&&Number.isFinite(v)?v:null,
 xs=>xs.reduce((a,b)=>a+b,0)/(xs.length||1)
);
function fixture({equalLows=false,target=true,pool=true}={}){
 const bars=Array.from({length:70},(_,i)=>({
  openTime:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),
  open:101.4,close:101.5,high:101.7,low:101.2,isOpen:false
 }));
 if(target)bars[20]={...bars[20],high:107};
 bars[25]={...bars[25],low:100};
 if(equalLows)bars[31]={...bars[31],low:100.02};
 bars[43]={...bars[43],high:102.2};
 bars[45]={...bars[45],open:101.7,close:100.5,high:101.7,low:99.5};
 bars[48]={...bars[48],open:101.8,close:105.7,high:105.8,low:101.8};
 for(let i=49;i<bars.length;i++)bars[i]={...bars[i],open:101.8,close:101.8,high:102,low:101.7};
 if(!pool)for(let i=0;i<bars.length;i++)if(i!==45)bars[i]={...bars[i],low:101.2};
 return bars;
}
function assert(condition,message){if(!condition)throw new Error(message);process.stdout.write('PASS '+message+'\n');}
const swing=analyze(fixture()).results[0];
assert(!!swing,'confirmed swing-liquidity raid produces a qualified setup');
assert(swing.evidence.liquidityPoolType==='Swing Low','single confirmed swing is identified as a swing-liquidity pool');
assert(swing.evidence.displacementBodyRangeRatio>=0.65,'displacement passes the body-to-range threshold');
assert(swing.evidence.structurePivotIndex===43,'MSS references a confirmed opposing structural pivot');
assert(swing.targets.length>0&&swing.targets.every(t=>Math.abs(t-swing.entry)/Math.abs(swing.entry-swing.stop)>=2&&Math.abs(t-swing.entry)/Math.abs(swing.entry-swing.stop)<=15),'targets are genuine 2R-to-15R opposing liquidity levels');
const equal=analyze(fixture({equalLows:true})).results[0];
assert(equal&&equal.evidence.liquidityPoolType==='EQL'&&equal.evidence.liquidityPoolTouches===2,'equal lows are clustered into an EQL pool');
assert(analyze(fixture({pool:false})).results.length===0,'rolling-range wick without a confirmed liquidity pool is rejected');
assert(analyze(fixture({target:false})).results.length===0,'setup without a real 2R-to-15R opposing liquidity target is rejected');
