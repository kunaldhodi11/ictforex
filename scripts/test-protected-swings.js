'use strict';
const fs=require('node:fs');
const source=fs.readFileSync('assets/js/institutional-flow.js','utf8');
const start=source.indexOf('function getMarketXray(bars){');
const end=source.indexOf('\nfunction addXrayEvent',start);
if(start<0||end<0)throw new Error('Protected swing classifier extraction failed');
const getMarketXray=new Function('avg','fmt','epochMs',source.slice(start,end)+'; return getMarketXray;')(
 xs=>xs.reduce((a,b)=>a+b,0)/(xs.length||1),
 n=>Number(n).toFixed(2),
 value=>typeof value==='number'?value:Date.parse(value)
);
function fixture(final={}) {
 const bars=Array.from({length:35},(_,i)=>({
  openTime:new Date(Date.UTC(2026,10,20,0,i)).toISOString(),
  open:100,high:102,low:98,close:100
 }));
 bars[15].low=95; bars[15].high=101;
 bars[20].high=110; bars[20].low=99;
 Object.assign(bars[34],final);
 return bars;
}
function assert(ok,message){if(!ok)throw new Error(message);process.stdout.write('PASS '+message+'\n')}
const wick=getMarketXray(fixture({high:112,close:109}));
assert(wick.breakType==='NONE'||wick.breakType==='STRUCTURE HOLD','wick above swing high without a close does not create BOS');
assert(wick.protectedSwingLow===null,'unbroken structure does not label an unprotected low as protected');
const close=getMarketXray(fixture({open:109,high:112,close:111}));
assert(close.breakType==='BULLISH BOS','completed close above a confirmed swing high creates bullish BOS');
assert(close.protectedSwingLow&&close.protectedSwingLow.price===95,'bullish BOS protects the last confirmed swing low preceding the broken high');
assert(close.confirmedSwingLow===95,'protected swing low is exposed as the confirmed dealing-range boundary');
