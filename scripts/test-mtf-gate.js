'use strict';
const fs=require('node:fs');
const source=fs.readFileSync('assets/js/institutional-flow.js','utf8');
const start=source.indexOf('function applyMtfEntryGate(analysis,mtf){');
const end=source.indexOf('\n function attachMtfLiquidityTargets',start);
if(start<0||end<0)throw new Error('MTF gate extraction failed');
const gate=new Function(source.slice(start,end)+'; return applyMtfEntryGate;')();
const t=s=>Date.parse('2026-11-20T'+s+':00Z');
function fixture(overrides={}){
 const candidate={side:'bullish',time:new Date(t('10:20')).toISOString(),zone:[100,101],score:80};
 const mtf={
  '4h':{structure:'Bullish BOS',bias:'Bullish',xray:{breakSide:'bullish',priorTrend:'Bullish'}},
  '1h':{structure:'Bullish structure',bias:'Bullish',xray:{breakSide:'neutral',priorTrend:'Bullish'}},
  '15m':{xray:{activeZones:[{side:'bullish',low:99.5,high:101.5,state:'FRESH',time:new Date(t('10:00')).toISOString()}]}},
  '5m':{setups:[{side:'bullish',time:new Date(t('10:10')).toISOString(),zone:[99.75,101.25],evidence:{sweepIndex:10,mssIndex:12}}]}
 };
 return {analysis:{results:[candidate]},mtf:{...mtf,...overrides}};
}
function run(name,overrides,expected){
 const f=fixture(overrides),result=gate(f.analysis,f.mtf);
 const pass=result.results.length===1;
 if(pass!==expected)throw new Error(name+': expected '+expected+', got '+pass+'; '+(result.results[0]?.mtfText||'rejected'));
 process.stdout.write('PASS '+name+'\n');
}
run('valid full MTF confluence',{},true);
run('missing 4H context',{'4h':null},false);
run('opposing 1H structure',{'1h':{structure:'Bearish BOS',bias:'Bearish',xray:{breakSide:'bearish'}}},false);
run('no aligned 15M POI',{'15m':{xray:{activeZones:[{side:'bearish',low:99.5,high:101.5,state:'FRESH',time:new Date(t('10:00')).toISOString()}]}}},false);
run('15M POI not yet confirmed',{'15m':{xray:{activeZones:[{side:'bullish',low:99.5,high:101.5,state:'FRESH',time:new Date(t('10:15')).toISOString()}]}}},false);
run('no 5M MSS setup',{'5m':{setups:[]}},false);
run('stale 5M MSS setup',{'5m':{setups:[{side:'bullish',time:new Date(t('10:00')).toISOString(),zone:[99.75,101.25]}]}},false);
run('5M MSS confirms direction while 1M refines entry',{'5m':{setups:[{side:'bullish',time:new Date(t('10:10')).toISOString(),zone:[103,104],evidence:{sweepIndex:10,mssIndex:12}}]}},true);
run('5M setup without sweep/MSS evidence rejected',{'5m':{setups:[{side:'bullish',time:new Date(t('10:10')).toISOString(),zone:[99.75,101.25]}]}},false);
