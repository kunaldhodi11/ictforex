'use strict';
const fs=require('node:fs');
const source=fs.readFileSync('assets/js/institutional-flow.js','utf8');
const start=source.indexOf('function getMarketXray(bars){');
const end=source.indexOf('\nfunction addXrayEvent',start);
if(start<0||end<0)throw new Error('getMarketXray extraction failed');
const getMarketXray=new Function('avg','fmt','epochMs',source.slice(start,end)+'; return getMarketXray;')(
 xs=>xs.reduce((a,b)=>a+b,0)/(xs.length||1),
 n=>Number(n).toFixed(2),
 value=>typeof value==='number'?value:Date.parse(value)
);
function bars(after=[]){
 const b=Array.from({length:32+after.length},(_,i)=>({openTime:new Date(Date.UTC(2026,10,20,0,i)).toISOString(),open:100,high:101,low:99,close:100}));
 b[29].high=100;
 b[31]={...b[31],open:103,high:104,low:102,close:103};
 after.forEach((patch,i)=>Object.assign(b[32+i],patch));
 return b;
}
function check(ok,message){if(!ok)throw new Error(message);process.stdout.write('PASS '+message+'\n')}
const fresh=getMarketXray(bars([{low:102.2,high:103,open:102.5,close:102.6}]));
const z=fresh.activeZones.find(x=>x.side==='bullish'&&x.low===100&&x.high===102);
check(!!z&&z.state==='FRESH'&&z.mitigationPercent===0,'fresh bullish FVG is active with zero mitigation');
const touch=getMarketXray(bars([{low:101.8,high:103,open:102.5,close:102.6}])).activeZones.find(x=>x.low===100&&x.high===102);
check(!!touch&&touch.state==='TOUCHED'&&touch.firstTouch!==null,'first overlap marks FVG touched and records timestamp');
const ce=getMarketXray(bars([{low:101,high:103,open:102.5,close:102.6}])).activeZones.find(x=>x.low===100&&x.high===102);
check(!!ce&&ce.state==='CE REACHED'&&ce.mitigationPercent===50,'50 percent penetration marks consequent encroachment');
const full=getMarketXray(bars([{low:99.9,high:103,open:102.5,close:100.5}])).activeZones.find(x=>x.low===100&&x.high===102);
check(!full,'fully filled FVG is removed from active zones');
const invalid=getMarketXray(bars([{low:99.9,high:103,open:100.5,close:99.5}]));
check(!invalid.activeZones.some(x=>x.low===100&&x.high===102),'close beyond far boundary invalidates FVG even if wick also filled it');
