(function(){
'use strict';
const API='https://biquote.io/api';
const $=id=>document.getElementById(id);
function updateChartClock(){const el=$('chartClock');if(!el)return;el.textContent=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())+' IST';}
function updateCandleTimer(){const el=$('candleTimer');if(!el)return;const left=60-(Math.floor(Date.now()/1000)%60);el.textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');el.title='Time remaining in the current 1-minute execution candle';}
const state={market:'XAUUSD',tf:'1m',symbol:null,scan:[],timer:null,chart:null,candleSeries:null,lines:[],hub:null,subscribedSymbol:null,liveCandle:null,chartHasData:false,chartLastTime:null,pendingLiveCandle:null,liveFrame:null,lastPriceLine:null,lastTickAt:0,alertsEnabled:false,alerted:new Set(),overlay:null,chartZones:[],overlayFrame:null,scanning:false,scanRequested:false,xray:null,lastLivePrice:null,lastTickDirection:'WAITING',lastFlowAt:0,flowEvents:[]};
const candidates={XAUUSD:['XAUUSD','GOLD'],NAS100:['NAS100','US100','USTEC','NASDAQ100','NDX100','NQ100','NAS100.cash']};
async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
function updateLiveTick(tick){
 if(!tick||!tick.symbol||String(tick.symbol).toUpperCase()!==String(state.symbol||'').toUpperCase())return;
 const mid=num(tick.mid);if(mid===null)return;
 if(tickIsStale(tick)){$('feedState').textContent='STALE FEED';$('quoteAge').textContent=age(tick.timestamp);return}
 $('price').textContent=fmt(mid);
 queueLiveCandle(mid,tick.timestamp);updateLiveXray(mid);updateTickPressurePanels();
 if(tick.dayDiffPercent!==undefined&&tick.dayDiffPercent!==null){$('change').textContent=(tick.dayDiffPercent>0?'+':'')+Number(tick.dayDiffPercent).toFixed(2)+'%';$('change').style.color=Number(tick.dayDiffPercent)>=0?'var(--green)':'var(--red)'}
 if(tick.marketState)$('marketStatus').textContent=tick.marketState;
 $('quoteAge').textContent=tick.timestamp?age(tick.timestamp):'Live tick received';
 $('feedState').textContent='LIVE STREAM';
 $('updated').textContent='Tick '+new Date().toLocaleTimeString();
}
function queueLiveCandle(price,timestamp){
 if(state.tf!=='1m')return;
 const stamp=epochMs(timestamp??Date.now());if(!Number.isFinite(stamp))return;
 const time=Math.floor(stamp/60000)*60;
 if(state.chartLastTime!==null&&time<state.chartLastTime)return;
 if(!state.liveCandle||state.liveCandle.time!==time){
  state.liveCandle={time,open:price,high:price,low:price,close:price};
 }else{
  state.liveCandle.high=Math.max(state.liveCandle.high,price);
  state.liveCandle.low=Math.min(state.liveCandle.low,price);
  state.liveCandle.close=price;
 }
 state.chartLastTime=Math.max(state.chartLastTime||time,time);
 state.lastTickAt=stamp;
 state.pendingLiveCandle={...state.liveCandle};
 if(state.liveFrame!==null)return;
 state.liveFrame=requestAnimationFrame(()=>{
  state.liveFrame=null;
  if(!state.candleSeries||!state.pendingLiveCandle)return;
  const candle=state.pendingLiveCandle;state.pendingLiveCandle=null;
  try{
   state.candleSeries.update(candle);
   if(state.lastPriceLine)state.lastPriceLine.applyOptions({price:candle.close});
  }catch(e){}
 });
}
function setupAlertKey(r){return [state.market,state.tf,r.side,r.type,r.time,Number(r.entry).toFixed(3)].join('|')}
function notifyNewSetups(results){
 if(!state.alertsEnabled)return;
 results.forEach(r=>{
  const key=setupAlertKey(r);if(state.alerted.has(key))return;state.alerted.add(key);
  if(state.alerted.size>300)state.alerted=new Set(Array.from(state.alerted).slice(-150));
  const title=state.market+' '+r.side.toUpperCase()+' ICT setup';
  const body=r.type+' · Entry '+fmt(r.entry)+' · SL '+fmt(r.stop)+' · TP '+fmt(r.target)+' · '+r.rr+' RR';
  if('Notification'in window&&Notification.permission==='granted'){try{new Notification(title,{body,tag:key})}catch(e){}}
  const status=$('alertStatus');if(status)status.textContent='New setup: '+r.type+' · '+new Date().toLocaleTimeString();
 });
}
async function connectLive(symbol){
 if(!window.signalR||!window.signalR.HubConnectionBuilder){$('feedState').textContent='REST SNAPSHOT';return}
 if(!state.hub){
  state.hub=new signalR.HubConnectionBuilder().withUrl('https://biquote.io/hubs/tick').withAutomaticReconnect().build();
  state.hub.on('ReceiveTick',payload=>{(Array.isArray(payload)?payload:[payload]).forEach(updateLiveTick)});
  state.hub.onreconnecting(()=>{$('feedState').textContent='STREAM RECONNECTING'});
  state.hub.onreconnected(async()=>{state.subscribedSymbol=null;if(state.symbol)await connectLive(state.symbol)});
 }
 if(state.subscribedSymbol===symbol&&state.hub.state===signalR.HubConnectionState.Connected)return;
 if(state.hub.state!==signalR.HubConnectionState.Connected)await state.hub.start();
 if(state.subscribedSymbol!==symbol){await state.hub.invoke('Subscribe',[symbol]);state.subscribedSymbol=symbol}
 $('feedState').textContent='LIVE STREAM CONNECTED';
}
function epochMs(value){
 if(typeof value==='number'&&Number.isFinite(value))return value<1e12?value*1000:value;
 if(typeof value==='string'&&/^\\d+(?:\\.\\d+)?$/.test(value.trim())){const n=Number(value);return n<1e12?n*1000:n}
 const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:NaN;
}
function candleEpochSeconds(c){
 const value=c&&(c.openTime??c.time??c.timestamp??c.date??c.datetime);
 const ms=epochMs(value);return Number.isFinite(ms)?Math.floor(ms/1000):NaN;
}
function num(v){return typeof v==='number'&&Number.isFinite(v)?v:null}
function fmt(v){return v==null?'—':v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function age(ts){if(ts===undefined||ts===null||ts==='')return 'Quote timestamp unavailable';const ms=epochMs(ts);if(!Number.isFinite(ms))return 'Quote timestamp unavailable';let s=Math.max(0,Math.floor((Date.now()-ms)/1000));return s<60?'Quote '+s+'s ago':'Quote '+Math.floor(s/60)+'m ago'}
function tickIsStale(tick){if(!tick)return true;if(tick.stale===true)return true;const reported=num(tick.quoteAgeSeconds);if(reported!==null)return reported>120;if(tick.timestamp!==undefined&&tick.timestamp!==null){const ms=epochMs(tick.timestamp);return !Number.isFinite(ms)||Date.now()-ms>120000}return true}
async function resolveSymbol(market){
 try{const data=await get(API+'/active');const rows=Array.isArray(data)?data:(data.items||data.symbols||[]);const names=rows.map(x=>String(x.name||x.symbol||'').toUpperCase());const found=candidates[market].find(x=>names.includes(x));if(found)return found}catch(e){}
 // Resolve the instrument even when its market is closed. The provider returns
 // the last known quote with marketState="closed" unless strict freshness is requested.
 for(const sym of candidates[market]){try{await get(API+'/'+encodeURIComponent(sym));return sym}catch(e){}}
 throw Error(market==='NAS100'?'No supported NAS100/US100 symbol was found in the free feed.':'XAUUSD is not currently available in the feed.');
}
function avg(a){return a.reduce((s,x)=>s+x,0)/(a.length||1)}
function analyze(bars){
 const b=bars.filter(x=>!x.isOpen&&[x.open,x.high,x.low,x.close].every(v=>num(v)!==null)&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close)&&x.high>=x.low).sort((a,b)=>candleEpochSeconds(a)-candleEpochSeconds(b));
 if(b.length<25)throw Error('Not enough completed candles for a reliable scan.');
 const last=b[b.length-1],body=c=>Math.abs(c.close-c.open),range=c=>Math.max(c.high-c.low,Number.EPSILON);
 const atrAt=i=>avg(b.slice(Math.max(0,i-14),i).map(range));
 // A pivot becomes usable only after its two right-hand candles have closed.
 const pivots=[];
 for(let i=2;i<b.length-2;i++){
  if(b[i].high>b[i-1].high&&b[i].high>b[i-2].high&&b[i].high>=b[i+1].high&&b[i].high>=b[i+2].high)pivots.push({side:'high',price:b[i].high,index:i,confirmedAt:i+2});
  if(b[i].low<b[i-1].low&&b[i].low<b[i-2].low&&b[i].low<=b[i+1].low&&b[i].low<=b[i+2].low)pivots.push({side:'low',price:b[i].low,index:i,confirmedAt:i+2});
 }
 const results=[],lookbackStart=Math.max(20,b.length-30);
 for(let si=lookbackStart;si<b.length-2;si++){
  const sweep=b[si],atr=atrAt(si),tolerance=Math.max(0.01,atr*0.10),penetration=Math.max(0.01,atr*0.02);
  const pools=[];
  for(const side of ['high','low']){
   const eligible=pivots.filter(p=>p.side===side&&p.confirmedAt<si&&p.index>=Math.max(0,si-40));
   const used=new Set();
   for(const p of eligible){
    if(used.has(p.index))continue;
    const cluster=eligible.filter(q=>Math.abs(q.price-p.price)<=tolerance);
    cluster.forEach(q=>used.add(q.index));
    const level=avg(cluster.map(q=>q.price));
    pools.push({side,level,count:cluster.length,kind:cluster.length>1?(side==='high'?'EQH':'EQL'):(side==='high'?'Swing High':'Swing Low'),members:cluster});
   }
  }
  // Raid must pierce a previously confirmed swing/EQH/EQL and reclaim its level on close.
  const candidates=[];
  for(const p of pools){
   if(p.side==='low'&&sweep.low<p.level-penetration&&sweep.close>p.level)candidates.push({...p,raidSide:'bullish',extreme:sweep.low});
   if(p.side==='high'&&sweep.high>p.level+penetration&&sweep.close<p.level)candidates.push({...p,raidSide:'bearish',extreme:sweep.high});
  }
  if(!candidates.length)continue;
  candidates.sort((a,b)=>Math.abs(sweep.close-a.level)-Math.abs(sweep.close-b.level));
  const pool=candidates[0],side=pool.raidSide,sweepLevel=pool.level,sweepExtreme=pool.extreme;
  const expiry=Math.min(b.length-1,si+6);
  let confirmed=null;
  for(let j=si+1;j<=expiry;j++){
   const impulse=b[j],before=b.slice(Math.max(0,j-20),j);
   if(before.length<8)continue;
   const avgBody=avg(before.map(body)),atrNow=avg(before.slice(-14).map(range));
   const candleRange=range(impulse),bodyRatio=body(impulse)/candleRange;
   const closeLocation=(impulse.close-impulse.low)/candleRange;
   const displacement=bodyRatio>=0.65&&body(impulse)>=Math.max(avgBody*1.5,atrNow*0.65);
   // MSS must close through the latest relevant, already-confirmed opposing swing.
   const structuralSide=side==='bullish'?'high':'low';
   const structures=pivots.filter(p=>p.side===structuralSide&&p.confirmedAt<j&&p.index<j&&p.index>=Math.max(0,si-20)).sort((a,b)=>b.index-a.index);
   const structure=structures[0];
   if(!structure)continue;
   const closesBeforeBreak=b.slice(structure.confirmedAt+1,j);
   const notAlreadyBroken=side==='bullish'?closesBeforeBreak.every(c=>c.close<=structure.price):closesBeforeBreak.every(c=>c.close>=structure.price);
   const mss=notAlreadyBroken&&(side==='bullish'
    ?displacement&&impulse.close>impulse.open&&closeLocation>=0.75&&impulse.close>structure.price
    :displacement&&impulse.close<impulse.open&&closeLocation<=0.25&&impulse.close<structure.price);
   if(!mss)continue;
   let zone=null,zoneType=null,zoneIndex=j;
   // Three-candle FVG is valid only after the displacement candle has closed.
   if(j>=2&&side==='bullish'&&impulse.low>b[j-2].high){zone=[b[j-2].high,impulse.low];zoneType='Bullish FVG'}
   if(j>=2&&side==='bearish'&&impulse.high<b[j-2].low){zone=[impulse.high,b[j-2].low];zoneType='Bearish FVG'}
   if(!zone){
    // OB is the last opposing candle before the displacement, not an arbitrary nearby candle.
    for(let k=j-1;k>si;k--){
     const c=b[k],opposite=side==='bullish'?c.close<c.open:c.close>c.open;
     if(opposite){zone=[c.low,c.high];zoneType=side==='bullish'?'Bullish order block':'Bearish order block';zoneIndex=k;break}
    }
   }
   if(zone&&zone[1]>zone[0]){
    const nextBar=b[j+1],confirmationTime=nextBar&&nextBar.openTime?nextBar.openTime:(impulse.closeTime||impulse.openTime);
    confirmed={index:j,zone,zoneType,zoneIndex,impulse,sweepLevel,sweepExtreme,side,confirmationTime,structure};
    break;
   }
  }
  if(!confirmed)continue;
  const later=b.slice(confirmed.index+1),zoneInvalid=side==='bullish'?later.some(c=>c.close<confirmed.zone[0]):later.some(c=>c.close>confirmed.zone[1]);
  const sweepInvalid=side==='bullish'?later.some(c=>c.low<sweepExtreme):later.some(c=>c.high>sweepExtreme);
  if(zoneInvalid||sweepInvalid)continue;
  const entry=(confirmed.zone[0]+confirmed.zone[1])/2;
  const touched=later.some(c=>c.low<=entry&&c.high>=entry);
  const buffer=Math.max(atr*0.1,Math.abs(entry)*0.0001);
  const stop=side==='bullish'?sweepExtreme-buffer:sweepExtreme+buffer;
  const risk=Math.abs(entry-stop);if(!Number.isFinite(risk)||risk<=0)continue;
  // Target pivots must already have been confirmed before the MSS candle: no future-pivot lookahead.
  const opposing=side==='bullish'?'high':'low';
  const targets=pivots.filter(p=>p.side===opposing&&p.confirmedAt<confirmed.index&&p.index<confirmed.index&&
   (side==='bullish'?p.price>entry:p.price<entry)&&
   (side==='bullish'?p.price>sweepLevel:p.price<sweepLevel)&&
   // A target pool already raided after confirmation is no longer available liquidity.
   b.slice(p.confirmedAt+1,confirmed.index+1).every(c=>side==='bullish'?c.high<p.price:c.low>p.price))
   .map(p=>p.price).filter(v=>{const rr=Math.abs(v-entry)/risk;return rr>=2&&rr<=15})
   .sort((a,b)=>side==='bullish'?a-b:b-a);
  // No synthetic 2R target: a trade needs a real, opposing liquidity objective.
  const uniqueTargets=targets.filter((v,i,a)=>a.findIndex(x=>Math.abs(x-v)<=Math.max(0.01,atr*0.05))===i);
  if(!uniqueTargets.length)continue;
  const targetLadder=uniqueTargets.slice(0,3),finalTarget=targetLadder[0];
  const status=touched?'ENTRY PRICE TOUCHED':'WAITING FOR RETRACEMENT';
  results.push({
   side,type:confirmed.zoneType+' · '+(side==='bullish'?'Bullish':'Bearish')+' MSS setup',
   zone:confirmed.zone,entry,stop,target:finalTarget,targets:targetLadder,
   targetSource:'Confirmed opposing swing-liquidity ladder · nearest valid pool first',
   rr:'1:'+(Math.abs(finalTarget-entry)/risk).toFixed(1),
   score:Math.min(95,78+(touched?3:0)),status,lifecycle:status,
   reason:'Confirmed sequence: '+pool.kind+' raid/reclaim → displacement (body/range '+(body(confirmed.impulse)/range(confirmed.impulse)).toFixed(2)+') → close through confirmed market structure → '+confirmed.zoneType+'. '+(touched?'Price has revisited the zone.':'Awaiting a retracement; no fill is implied.'),
   evidence:{sweepIndex:si,mssIndex:confirmed.index,zoneIndex:confirmed.zoneIndex,sweepLevel,sweepExtreme,liquidityPoolType:pool.kind,liquidityPoolTouches:pool.count,structureLevel:confirmed.structure.price,structurePivotIndex:confirmed.structure.index,displacementBodyRatio:body(confirmed.impulse)/(avg(b.slice(Math.max(0,confirmed.index-20),confirmed.index).map(body))||1),displacementBodyRangeRatio:body(confirmed.impulse)/range(confirmed.impulse)},
   time:confirmed.confirmationTime
  });
  si=expiry;
 }
 const latestBySide={};results.sort((a,b)=>b.evidence.mssIndex-a.evidence.mssIndex).forEach(r=>{if(!latestBySide[r.side])latestBySide[r.side]=r});
 const qualified=Object.values(latestBySide);
 const prior=b.slice(-21,-1),hi=Math.max(...prior.map(x=>x.high)),lo=Math.min(...prior.map(x=>x.low));
 return {bars:b,last,results:qualified,bias:last.close>avg(b.slice(-20).map(x=>x.close))?'Bullish':last.close<avg(b.slice(-20).map(x=>x.close))?'Bearish':'Neutral',hi,lo};
}
function applyMtfEntryGate(analysis,mtf){
  const direction=m=>{
   if(!m)return 'neutral';
   const x=m.xray||{},breakSide=String(x.breakSide||'').toLowerCase();
   if(breakSide==='bullish'||breakSide==='bearish')return breakSide;
   const trend=String(x.priorTrend||'').toLowerCase();
   if(trend==='bullish'||trend==='bearish')return trend;
   const structure=String(m.structure||'').toLowerCase();
   if(structure.startsWith('bullish'))return 'bullish';
   if(structure.startsWith('bearish'))return 'bearish';
   const bias=String(m.bias||'').toLowerCase();
   return bias==='bullish'||bias==='bearish'?bias:'neutral';
  };
  const overlaps=(a,b)=>Array.isArray(a)&&a.length===2&&b&&Number.isFinite(b.low)&&Number.isFinite(b.high)&&Math.min(a[1],b.high)>=Math.max(a[0],b.low);
  analysis.results=analysis.results.filter(r=>{
   const signalTime=Date.parse(r.time),h4=direction(mtf['4h']),h1=direction(mtf['1h']);
   if(!Number.isFinite(signalTime)||h4!==r.side||h1!==r.side){
    r.mtfText='Rejected: 4H major bias or 1H structure is not aligned';
    return false;
   }
   const poi=(mtf['15m']&&mtf['15m'].xray&&mtf['15m'].xray.activeZones||[]).find(z=>{
    const zoneTime=Date.parse(z.time);
    return z.side===r.side&&z.state!=='INVALIDATED'&&z.state!=='FULLY FILLED'&&Number.isFinite(zoneTime)&&zoneTime+15*60000<=signalTime&&overlaps(r.zone,z);
   });
   if(!poi){
    r.mtfText='Rejected: no confirmed, active 15M FVG POI overlaps the 1M entry zone';
    return false;
   }
   // 5M confirms the directional sweep/displacement/MSS; 1M is the entry refinement.
   // Requiring the independent 5M MSS zone to overlap the 1M entry zone was over-restrictive.
   const five=(mtf['5m']&&mtf['5m'].setups||[]).find(z=>{
    const t=Date.parse(z.time),e=z.evidence||{};
    const confirmed=Number.isFinite(e.sweepIndex)&&Number.isFinite(e.mssIndex);
    return z.side===r.side&&confirmed&&Number.isFinite(t)&&t<=signalTime&&signalTime-t<=15*60000;
   });
   if(!five){
    r.mtfText='Rejected: no recent confirmed 5M sweep + displacement + MSS in the same direction';
    return false;
   }
   r.score=Math.min(98,r.score+8);
   r.mtfText='4H '+h4.toUpperCase()+' bias · 1H '+h1.toUpperCase()+' structure · 15M active FVG POI aligned · 5M MSS confirmed';
   r.mtfConfirmation={fourHour:h4,oneHour:h1,fifteenMinutePoi:poi.time,fiveMinuteMss:five.time};
   r.status=r.status||'1M ENTRY SETUP';
   return true;
  });
  return analysis;
 }
 function attachMtfLiquidityTargets(analysis,mtfBars){
  analysis.results.forEach(r=>{
   const risk=Math.abs(r.entry-r.stop),signalTime=Date.parse(r.time);
   r.targets=[];r.target=null;r.targetLevels=[];r.noLiquidityTarget=true;
   if(!Number.isFinite(risk)||risk<=0||!Number.isFinite(signalTime))return;
   const levels=[];
   ['1m','5m','15m','1h','4h'].forEach(tf=>{
    const raw=mtfBars[tf]||[],b=raw.filter(x=>!x.isOpen&&[x.open,x.high,x.low,x.close].every(v=>num(v)!==null)&&Number.isFinite(Date.parse(x.openTime))).sort((a,b)=>Date.parse(a.openTime)-Date.parse(b.openTime));
    for(let i=2;i<b.length-3;i++){
     // A 2-bar-right pivot is usable only after its two right candles have closed.
     const confirmedAt=Date.parse(b[i+3].openTime);
     if(!Number.isFinite(confirmedAt)||confirmedAt>signalTime)continue;
     const p=r.side==='bullish'?b[i].high:b[i].low;
     const pivot=r.side==='bullish'?(p>b[i-1].high&&p>b[i-2].high&&p>=b[i+1].high&&p>=b[i+2].high):(p<b[i-1].low&&p<b[i-2].low&&p<=b[i+1].low&&p<=b[i+2].low);
     if(!pivot)continue;
     // Reject a pool already raided after the swing was formed and before the signal.
     const sweptAfterConfirmation=b.slice(i+3).some(c=>Date.parse(c.openTime)<signalTime&&(r.side==='bullish'?c.high>=p:c.low<=p));
     if(sweptAfterConfirmation)continue;
     const ahead=r.side==='bullish'?p>r.entry:p<r.entry,rr=Math.abs(p-r.entry)/risk;
     if(ahead&&rr>=2&&rr<=15)levels.push({price:p,tf,rr,confirmedAt});
    }
   });
   levels.sort((a,b)=>a.rr-b.rr||a.confirmedAt-b.confirmedAt);
   const unique=[];levels.forEach(x=>{if(!unique.some(y=>Math.abs(y.price-x.price)<=Math.max(Math.abs(r.entry)*0.00003,0.03)))unique.push(x)});
   const chosen=unique.slice(0,3);
   if(!chosen.length){
    r.targetSource='No unraided, already-confirmed opposing swing liquidity between 2R and 15R; setup rejected';
    return;
   }
   r.targets=chosen.map(x=>x.price);r.target=r.targets[0];r.noLiquidityTarget=false;
   r.targetSource='Unraided, past-confirmed opposing swing liquidity only: '+chosen.map(x=>x.tf.toUpperCase()).join(' → ');
   r.targetLevels=chosen.map(x=>({price:x.price,timeframe:x.tf,rr:'1:'+x.rr.toFixed(1)}));
   r.rr='1:'+(Math.abs(r.target-r.entry)/risk).toFixed(1);
  });
  analysis.results=analysis.results.filter(r=>!r.noLiquidityTarget&&Array.isArray(r.targets)&&r.targets.length>0&&Number.isFinite(r.target));
  return analysis;
 }
 function getMarketXray(bars){
 const last=bars[bars.length-1],recent=bars.slice(-30),high=Math.max(...recent.map(x=>x.high)),low=Math.min(...recent.map(x=>x.low)),mid=(high+low)/2,range=high-low;
 const pivots=[];
 for(let i=2;i<bars.length-2;i++){
  const p=bars[i];
  if(p.high>bars[i-1].high&&p.high>bars[i-2].high&&p.high>=bars[i+1].high&&p.high>=bars[i+2].high)pivots.push({type:'high',price:p.high,index:i,time:p.openTime});
  if(p.low<bars[i-1].low&&p.low<bars[i-2].low&&p.low<=bars[i+1].low&&p.low<=bars[i+2].low)pivots.push({type:'low',price:p.low,index:i,time:p.openTime});
 }
 const highs=pivots.filter(p=>p.type==='high'),lows=pivots.filter(p=>p.type==='low'),sh=highs[highs.length-1],sl=lows[lows.length-1],ph=highs[highs.length-2],pl=lows[lows.length-2];
 const higherHigh=!!(sh&&ph&&sh.price>ph.price),higherLow=!!(sl&&pl&&sl.price>pl.price),lowerHigh=!!(sh&&ph&&sh.price<ph.price),lowerLow=!!(sl&&pl&&sl.price<pl.price);
 let priorTrend='Range';if(higherHigh&&higherLow)priorTrend='Bullish';else if(lowerHigh&&lowerLow)priorTrend='Bearish';
 const brokeHigh=!!(sh&&last.close>sh.price),brokeLow=!!(sl&&last.close<sl.price);
 let structure='Range / unclear',note='No completed close has broken a confirmed swing',choch='No CHOCH',chochNote='No opposing structure break confirmed',breakType='NONE',brokenLevel=null,breakSide='neutral';
 if(brokeHigh){breakSide='bullish';brokenLevel=sh.price;breakType=priorTrend==='Bearish'?'BULLISH CHOCH':'BULLISH BOS';structure=priorTrend==='Bearish'?'Bullish CHOCH':'Bullish BOS';note='Completed candle closed above confirmed swing high '+fmt(sh.price)+'.';if(priorTrend==='Bearish'){choch='Bullish CHOCH';chochNote='Bearish swing sequence invalidated by a completed close above its latest confirmed swing high.'}}
 else if(brokeLow){breakSide='bearish';brokenLevel=sl.price;breakType=priorTrend==='Bullish'?'BEARISH CHOCH':'BEARISH BOS';structure=priorTrend==='Bullish'?'Bearish CHOCH':'Bearish BOS';note='Completed candle closed below confirmed swing low '+fmt(sl.price)+'.';if(priorTrend==='Bullish'){choch='Bearish CHOCH';chochNote='Bullish swing sequence invalidated by a completed close below its latest confirmed swing low.'}}
 else if(priorTrend!=='Range'){structure=priorTrend+' structure';note=priorTrend+' swing sequence: '+(priorTrend==='Bullish'?'higher highs and higher lows':'lower highs and lower lows')+'. No new break on the latest close.';breakType='STRUCTURE HOLD'}
 const tolerance=Math.max(Math.abs(last.close)*0.00035,range*0.008);
 const makeClusters=(items,side)=>{
  const sorted=items.slice().sort((a,b)=>a.price-b.price),groups=[];
  sorted.forEach(p=>{let g=groups.find(x=>Math.abs(p.price-avg(x.map(y=>y.price)))<=tolerance);if(!g){g=[];groups.push(g)}g.push(p)});
  return groups.filter(g=>g.length>=2).map(g=>({side,price:avg(g.map(p=>p.price)),low:Math.min(...g.map(p=>p.price)),high:Math.max(...g.map(p=>p.price)),count:g.length,lastIndex:Math.max(...g.map(p=>p.index)),swept:side==='BSL'?last.high>Math.max(...g.map(p=>p.price))&&last.close<Math.max(...g.map(p=>p.price)):last.low<Math.min(...g.map(p=>p.price))&&last.close>Math.min(...g.map(p=>p.price))})).sort((a,b)=>a.price-b.price);
 };
 const bslPools=makeClusters(highs,'BSL'),sslPools=makeClusters(lows,'SSL');
 const nearest=(arr)=>arr.slice().sort((a,b)=>Math.abs(a.price-last.close)-Math.abs(b.price-last.close))[0]||null;
 const bslPool=nearest(bslPools),sslPool=nearest(sslPools),bsl=bslPool?bslPool.price:null,ssl=sslPool?sslPool.price:null;
 const confirmedRange=sh&&sl?{high:sh.price,low:sl.price,from:sl.index<sh.index?'swing low → swing high':'swing high → swing low'}:null;
 const dr=confirmedRange&&confirmedRange.high>confirmedRange.low?confirmedRange:null,drMid=dr?(dr.high+dr.low)/2:null;
 const pos=dr?Math.max(0,Math.min(100,(last.close-dr.low)/(dr.high-dr.low)*100)):null;
 const zone=pos===null?'Range not established':pos>50?'Premium':pos<50?'Discount':'Equilibrium';
 const dateKey=d=>d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'),lastDate=new Date(last.openTime),todayKey=dateKey(lastDate);
 const dayGroups=new Map(),weekGroups=new Map();
 bars.forEach(c=>{const d=new Date(c.openTime);if(!Number.isFinite(d.getTime()))return;const dk=dateKey(d),weekStart=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-((d.getUTCDay()+6)%7))),wk=weekStart.toISOString().slice(0,10);if(!dayGroups.has(dk))dayGroups.set(dk,{date:dk,high:-Infinity,low:Infinity});let dg=dayGroups.get(dk);dg.high=Math.max(dg.high,c.high);dg.low=Math.min(dg.low,c.low);if(!weekGroups.has(wk))weekGroups.set(wk,{date:wk,high:-Infinity,low:Infinity});let wg=weekGroups.get(wk);wg.high=Math.max(wg.high,c.high);wg.low=Math.min(wg.low,c.low)});
 const priorDays=Array.from(dayGroups.values()).filter(x=>x.date!==todayKey).sort((a,b)=>a.date.localeCompare(b.date)),pday=priorDays[priorDays.length-1]||null;
 const currentWeekStart=new Date(Date.UTC(lastDate.getUTCFullYear(),lastDate.getUTCMonth(),lastDate.getUTCDate()-((lastDate.getUTCDay()+6)%7))).toISOString().slice(0,10);
 const priorWeeks=Array.from(weekGroups.values()).filter(x=>x.date<currentWeekStart).sort((a,b)=>a.date.localeCompare(b.date)),pweek=priorWeeks[priorWeeks.length-1]||null;
 const zones=[];
 for(let i=Math.max(2,bars.length-80);i<bars.length;i++){
  const a=bars[i-2],c=bars[i];let side=null,z=null;
  if(c.low>a.high){side='bullish';z=[a.high,c.low]}
  else if(c.high<a.low){side='bearish';z=[c.high,a.low]}
  if(!z||z[1]<=z[0])continue;
  const after=bars.slice(i+1),farClose=side==='bullish'?after.some(x=>x.close<z[0]):after.some(x=>x.close>z[1]);
  const touched=after.some(x=>x.low<=z[1]&&x.high>=z[0]),filled=side==='bullish'?after.some(x=>x.low<=z[0]):after.some(x=>x.high>=z[1]),ce=after.some(x=>side==='bullish'?x.low<=(z[0]+z[1])/2:x.high>=(z[0]+z[1])/2);
  zones.push({side,low:z[0],high:z[1],mid:(z[0]+z[1])/2,index:i,time:c.openTime,state:farClose?'INVALIDATED':filled?'FULLY FILLED':ce?'CE REACHED':touched?'TOUCHED':'FRESH'});
 }
 const activeZones=zones.filter(z=>z.state!=='INVALIDATED'&&z.state!=='FULLY FILLED').slice(-8);
 const dt=new Date(last.openTime),hour=dt.getUTCHours();let session='Between sessions';if(hour<7)session='Asia (UTC proxy)';else if(hour<12)session='London (UTC proxy)';else if(hour<16)session='London + New York (UTC proxy)';else if(hour<21)session='New York (UTC proxy)';else session='Late New York (UTC proxy)';
 const windowBars=bars.slice(-21),path=windowBars.slice(1).reduce((sum,x,i)=>sum+Math.abs(x.close-windowBars[i].close),0),eff=path?Math.abs(windowBars[windowBars.length-1].close-windowBars[0].close)/path:0,strength=eff<.2?'Weak':eff<.45?'Moderate':'Strong',trendPct=Math.round(eff*100);
 const prior20=bars.slice(-21,-1),priorHigh=Math.max(...prior20.map(x=>x.high)),priorLow=Math.min(...prior20.map(x=>x.low)),sweptHigh=last.high>priorHigh&&last.close<priorHigh,sweptLow=last.low<priorLow&&last.close>priorLow,acceptedAbove=last.close>priorHigh,acceptedBelow=last.close<priorLow;
 let liquidityEvent='No recent range event';if(sweptHigh)liquidityEvent='Buy-side sweep and reclaim';else if(sweptLow)liquidityEvent='Sell-side sweep and reclaim';else if(acceptedAbove)liquidityEvent='Close accepted above prior range';else if(acceptedBelow)liquidityEvent='Close accepted below prior range';
 return {high,low,mid,pos,zone,structure,note,session,time:dt.toISOString(),choch,chochNote,strength,trendPct,bsl,ssl,bslPools,sslPools,bslPoolCount:bslPool?bslPool.count:0,sslPoolCount:sslPool?sslPool.count:0,pdh:pday?pday.high:null,pdl:pday?pday.low:null,pwh:pweek?pweek.high:null,pwl:pweek?pweek.low:null,dealingRange:dr,dealingMid:drMid,activeZones,liquidityEvent,sweptHigh,sweptLow,acceptedAbove,acceptedBelow,breakType,brokenLevel,breakSide,priorTrend,higherHigh,higherLow,lowerHigh,lowerLow,confirmedSwingHigh:sh?sh.price:null,confirmedSwingLow:sl?sl.price:null};
}
function addXrayEvent(title,detail,kind='info'){
 const now=Date.now(),item={title,detail,kind,time:new Date(now).toLocaleTimeString()};
 state.flowEvents.unshift(item);state.flowEvents=state.flowEvents.slice(0,8);
 const tape=$('xrayEventTape');if(!tape)return;tape.innerHTML='';
 state.flowEvents.forEach(ev=>{const row=document.createElement('div');row.className='xray-event '+ev.kind;const dot=document.createElement('span');dot.className='event-dot';const body=document.createElement('div'),titleEl=document.createElement('b'),detailEl=document.createElement('small'),time=document.createElement('time');titleEl.textContent=ev.title;detailEl.textContent=ev.detail;time.textContent=ev.time;body.append(titleEl,detailEl);row.append(dot,body,time);tape.appendChild(row)});
}
function updateLiveXray(price){
 const x=state.xray;if(!x||!Number.isFinite(price))return;
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};
 set('xrayLivePrice',fmt(price));
 const prev=state.lastLivePrice,delta=prev===null?0:price-prev;
 set('xrayLiveMove',prev===null?'Live quote received':(delta>0?'+':delta<0?'−':'')+Math.abs(delta).toFixed(2)+' since last tick');
 const pct=x.high!==x.low?Math.max(0,Math.min(100,(price-x.low)/(x.high-x.low)*100)):50;
 set('xrayLivePosition',pct.toFixed(1)+'%');set('xrayLiveZone',pct>55?'Premium side':pct<45?'Discount side':'Equilibrium area');
 const direction=prev===null?'FLAT':delta>0?'UPTICK':delta<0?'DOWNTICK':'UNCHANGED';state.lastTickDirection=direction;set('xrayLiveBias',direction);set('xrayLiveBiasNote','Live tick direction · not a trade signal');
 const levels=[{name:'Range high',value:x.high},{name:'Equilibrium',value:x.mid},{name:'Range low',value:x.low}].sort((a,b)=>Math.abs(a.value-price)-Math.abs(b.value-price));
 set('xrayLiveLevel',fmt(levels[0].value));set('xrayLiveLevelNote',levels[0].name+' · '+Math.abs(levels[0].value-price).toFixed(2)+' away');
 const track=$('rangeMarker');if(track)track.style.left=pct+'%';
 const now=Date.now();if(prev!==null&&now-state.lastFlowAt>5000&&Math.abs(delta)>0){
  addXrayEvent('LIVE PRICE '+direction, 'Price '+fmt(price)+' · '+(delta>0?'+':'−')+Math.abs(delta).toFixed(2)+' from previous tick','tick');state.lastFlowAt=now;
 }
 if(prev!==null){
  if((prev<x.mid&&price>=x.mid)||(prev>x.mid&&price<=x.mid))addXrayEvent('EQUILIBRIUM CROSSED','Live price crossed the 30-candle dealing-range midpoint at '+fmt(x.mid),'level');
  if((prev<x.high&&price>=x.high)||(prev>x.high&&price<=x.high))addXrayEvent('RANGE HIGH TEST','Price reached the current 30-candle range high '+fmt(x.high),'warning');
  if((prev>x.low&&price<=x.low)||(prev<x.low&&price>=x.low))addXrayEvent('RANGE LOW TEST','Price reached the current 30-candle range low '+fmt(x.low),'warning');
 }
 state.lastLivePrice=price;
}
function updateTickPressurePanels(){
 const direction=state.lastTickDirection||'WAITING';
 ['xrayBullItems','xrayBearItems'].forEach(id=>{
  const list=$(id);if(!list)return;
  const row=Array.from(list.querySelectorAll('.xray-direction-item')).find(el=>{
   const label=el.querySelector('small');return label&&label.textContent==='Tick pressure';
  });
  if(!row)return;
  const value=row.querySelector('b');
  const detail=row.querySelector('span');
  if(value)value.textContent=direction;
  if(detail)detail.textContent='Latest tick-to-tick movement only; not a confirmed trend or trade signal';
 });
}
function renderXraySides(bars,mtf,results,x){
 const renderSide=(side)=>{
  const bullish=side==='bullish',prefix=bullish?'xrayBull':'xrayBear',list=$(prefix+'Items'),status=$(prefix+'Status'),count=$(prefix+'Count');
  if(!list)return;
  const matches=(results||[]).filter(r=>r.side===side);
  const structureMatch=x.structure.toLowerCase().startsWith(bullish?'bullish':'bearish');
  const alignedMtf=['5m','15m','1h','4h'].filter(tf=>mtf&&mtf[tf]&&String(mtf[tf].structure||'').toLowerCase().startsWith(bullish?'bullish':'bearish'));
  const evidence=[];
  evidence.push({title:'Market structure',value:structureMatch?x.structure:'No confirmed '+(bullish?'bullish':'bearish')+' break',detail:x.note});
  evidence.push({title:'Tick pressure',value:state.lastTickDirection||(bullish?'Monitoring upside ticks':'Monitoring downside ticks'),detail:'Short-term tick movement only; not a confirmed trend'});
  if(bullish&&x.ssl!==null)evidence.push({title:'Sell-side liquidity',value:fmt(x.ssl),detail:'Potential SSL pool inferred from swing lows'});
  if(!bullish&&x.bsl!==null)evidence.push({title:'Buy-side liquidity',value:fmt(x.bsl),detail:'Potential BSL pool inferred from swing highs'});
  if(alignedMtf.length)evidence.push({title:'MTF alignment',value:alignedMtf.map(t=>t.toUpperCase()).join(' · '),detail:'Timeframes with matching candle-derived structure'});
  matches.forEach(r=>evidence.push({title:r.type,value:'Entry '+fmt(r.entry)+' · SL '+fmt(r.stop),detail:'Target '+fmt(r.target)+' · '+r.rr+' R:R · '+r.status}));
  count.textContent=String(matches.length);
  status.textContent=(structureMatch?'STRUCTURE ALIGNED':'NO CONFIRMED STRUCTURE')+' · '+alignedMtf.length+'/4 MTF';
  list.innerHTML='';
  if(!evidence.length){list.innerHTML='<div class="xray-direction-empty">No confirmed evidence yet.</div>';return}
  evidence.forEach(item=>{const row=document.createElement('div');row.className='xray-direction-item';const title=document.createElement('small'),value=document.createElement('b'),detail=document.createElement('span');title.textContent=item.title;value.textContent=item.value;detail.textContent=item.detail;row.append(title,value,detail);list.appendChild(row)});
 };
 renderSide('bullish');renderSide('bearish');
}
function renderXray(bars,mtf,results){
 const x=getMarketXray(bars);state.xray=x;renderXraySides(bars,mtf,results,x);state.lastLivePrice=null;$('xrayTf').textContent='15M CONTEXT';$('xrayStructure').textContent=x.structure;$('xrayStructureNote').textContent=x.note;$('xrayRange').textContent=x.dealingRange?fmt(x.dealingRange.low)+' – '+fmt(x.dealingRange.high):'Not established';$('xrayRangeNote').textContent=x.dealingRange?'Confirmed swing pair · EQ '+fmt(x.dealingMid):'No valid confirmed swing pair in loaded candles';$('xrayZone').textContent=x.zone;$('xrayZoneNote').textContent=x.pos===null?'Premium / discount unavailable without a dealing range':'Price position '+x.pos.toFixed(0)+'% of confirmed range';$('xraySession').textContent=x.session;$('xraySessionNote').textContent='Candle UTC '+x.time.slice(11,16);$('rangeMarker').style.left=(x.pos===null?50:x.pos)+'%';
 const set=(id,value)=>{const el=$(id);if(el)el.textContent=value};set('xrayChoch',x.choch);set('xrayChochNote',x.chochNote);set('xrayTrend',x.strength+' · '+x.trendPct+'/100');set('xrayTrendNote','20-candle directional efficiency (not win probability)');set('xrayBsl',x.bsl===null?'No clear pool':fmt(x.bsl));set('xrayBslNote',x.bsl===null?'No equal-high cluster confirmed':'Potential BSL · '+x.bslPoolCount+' confirmed swing highs');set('xraySsl',x.ssl===null?'No clear pool':fmt(x.ssl));set('xraySslNote',x.ssl===null?'No equal-low cluster confirmed':'Potential SSL · '+x.sslPoolCount+' confirmed swing lows');
 set('xrayPdhPdl',x.pdh===null||x.pdl===null?'Unavailable':fmt(x.pdh)+' / '+fmt(x.pdl));set('xrayPdhPdlNote',x.pdh===null?'Prior UTC day not present in loaded candles':'PDH / PDL · previous UTC day');
 set('xrayPwhPwl',x.pwh===null||x.pwl===null?'Unavailable':fmt(x.pwh)+' / '+fmt(x.pwl));set('xrayPwhPwlNote',x.pwh===null?'Prior UTC week not present in loaded candles':'PWH / PWL · previous UTC week');
 set('xrayDealingRange',x.dealingRange?fmt(x.dealingRange.low)+' – '+fmt(x.dealingRange.high):'Not established');set('xrayDealingRangeNote',x.dealingRange?'Confirmed swing pair · EQ '+fmt(x.dealingMid)+' · '+x.zone:'No valid confirmed swing pair');
 set('xrayFvgCount',String(x.activeZones.length));set('xrayFvgNote',x.activeZones.filter(z=>z.state==='FRESH').length+' fresh · '+x.activeZones.filter(z=>z.state==='TOUCHED'||z.state==='CE REACHED').length+' revisited');
 const poolList=$('xrayPoolList');if(poolList){poolList.innerHTML='';const pools=[...x.bslPools,...x.sslPools].sort((a,b)=>Math.abs(a.price-bars[bars.length-1].close)-Math.abs(b.price-bars[bars.length-1].close)).slice(0,8);if(!pools.length)poolList.innerHTML='<div class="xray-direction-empty">No EQH / EQL cluster with at least two confirmed pivots.</div>';pools.forEach(p=>{const el=document.createElement('div');el.className='xray-pool-item';const label=document.createElement('small'),price=document.createElement('b'),stateEl=document.createElement('small'),detail=document.createElement('span');label.textContent=p.side+' · '+p.count+' PIVOTS';price.textContent=fmt(p.price);stateEl.className='pool-state';stateEl.textContent=p.swept?'RAIDED / RECLAIM CHECK':'POTENTIAL POOL';detail.textContent='Band '+fmt(p.low)+' – '+fmt(p.high)+' · candle-derived; not order-book data';el.append(label,price,stateEl,detail);poolList.appendChild(el)})}
 const fvgList=$('xrayFvgList');if(fvgList){fvgList.innerHTML='';if(!x.activeZones.length)fvgList.innerHTML='<div class="xray-direction-empty">No active FVG arrays in the loaded candle window.</div>';x.activeZones.slice().reverse().forEach(z=>{const el=document.createElement('div');el.className='xray-pool-item';const label=document.createElement('small'),price=document.createElement('b'),stateEl=document.createElement('small'),detail=document.createElement('span');label.textContent=z.side.toUpperCase()+' FVG';price.textContent=fmt(z.low)+' – '+fmt(z.high);stateEl.className='pool-state';stateEl.textContent=z.state;detail.textContent='CE '+fmt(z.mid)+' · created '+new Date(z.time).toLocaleString();el.append(label,price,stateEl,detail);fvgList.appendChild(el)})}

 const grid=$('xrayMtfGrid');if(grid){grid.innerHTML='';['5m','15m','1h','4h'].forEach(tf=>{const m=mtf&&mtf[tf]?mtf[tf]:null,d=document.createElement('div');d.className='xray-mtf-cell';const label=document.createElement('small');label.textContent=tf.toUpperCase();const value=document.createElement('b');value.textContent=m?m.structure:'Unavailable';const sub=document.createElement('span');sub.textContent=m&&m.bars?m.bars+' candles':'No provider data';d.append(label,value,sub);grid.appendChild(d)})}
 const structureKey=[state.market,state.tf,x.structure,x.brokenLevel].join('|');if(state.lastStructureKey!==structureKey){addXrayEvent(x.breakType==='NONE'?'STRUCTURE CONTEXT':x.breakType,x.note+' · '+x.zone+' · '+x.session,x.breakType.includes('CHOCH')?'warning':'structure');state.lastStructureKey=structureKey;}set('xrayBreakType',x.breakType);set('xrayBreakLevel',x.brokenLevel===null?'—':fmt(x.brokenLevel));set('xrayBreakNote',x.priorTrend+' prior swing sequence · close-confirmed only');$('xrayFoot').textContent='Liquidity event: '+x.liquidityEvent+'. Sweep requires a wick beyond the prior 20-candle range and a completed close back inside; a close beyond the range is labelled acceptance, not a sweep. Pools and structure are candle-derived estimates, not broker order-book data. Sessions use approximate UTC windows.';
}
function resetChartForMarket(){
 if(!state.chart||!state.candleSeries)return;
 try{state.candleSeries.setData([])}catch(e){}
 state.lines.forEach(line=>{try{state.candleSeries.removePriceLine(line)}catch(e){}});
 state.lines=[];state.chartHasData=false;state.chartLastTime=null;state.liveCandle=null;state.pendingLiveCandle=null;
 if(state.overlay)state.overlay.replaceChildren();
 const title=$('chartTitle');if(title)title.textContent=state.market+' · 1M EXECUTION';
 const status=$('chartStatus');if(status)status.textContent='LOADING '+state.market;
}
function ensureChartLibrary(){
 if(window.LightweightCharts)return Promise.resolve(true);
 if(state.chartLibraryPromise)return state.chartLibraryPromise;
 state.chartLibraryPromise=new Promise((resolve,reject)=>{
  const urls=['https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js','https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js'];
  const load=index=>{
   if(window.LightweightCharts){resolve(true);return}
   if(index>=urls.length){reject(Error('Chart library could not be loaded from either CDN.'));return}
   const script=document.createElement('script');script.src=urls[index];script.async=true;
   script.onload=()=>window.LightweightCharts?resolve(true):load(index+1);
   script.onerror=()=>load(index+1);document.head.appendChild(script);
  };
  load(0);
 });
 return state.chartLibraryPromise;
}
function redrawChartOverlays(){
 if(!state.overlay||!state.candleSeries)return;
 state.overlay.replaceChildren();
 state.chartZones.forEach((item,i)=>{
  const top=state.candleSeries.priceToCoordinate(Math.max(...item.zone)),bottom=state.candleSeries.priceToCoordinate(Math.min(...item.zone));
  if(top===null||bottom===null||!Number.isFinite(top)||!Number.isFinite(bottom))return;
  const band=document.createElement('div');band.className='chart-zone '+item.side+(item.kind==='fvg'?' chart-fvg-zone':'');
  band.style.top=Math.min(top,bottom)+'px';band.style.height=Math.max(3,Math.abs(bottom-top))+'px';
  band.style.opacity=String(item.kind==='fvg'?.32:Math.max(.48,.82-i*.04));
  const label=document.createElement('span');label.textContent=item.label;band.appendChild(label);state.overlay.appendChild(band);
 });
}
function scheduleChartOverlayRedraw(){
 if(state.overlayFrame!==null)return;
 state.overlayFrame=requestAnimationFrame(()=>{state.overlayFrame=null;redrawChartOverlays()});
}
function initChart(){
 if(state.chart||!window.LightweightCharts)return;
 const el=$('marketChart');if(!el)return;
 el.replaceChildren();
 state.chart=LightweightCharts.createChart(el,{width:el.clientWidth,height:el.clientHeight,layout:{background:{color:'#0b1420'},textColor:'#91a2b8'},grid:{vertLines:{color:'#172438'},horzLines:{color:'#172438'}},rightPriceScale:{borderColor:'#25364b'},timeScale:{borderColor:'#25364b',timeVisible:true,secondsVisible:false,rightOffset:6,barSpacing:8,minBarSpacing:3},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true},crosshair:{mode:LightweightCharts.CrosshairMode.Normal}});
 state.candleSeries=state.chart.addCandlestickSeries({upColor:'#36d39a',downColor:'#f07878',borderUpColor:'#36d39a',borderDownColor:'#f07878',wickUpColor:'#36d39a',wickDownColor:'#f07878',borderVisible:false});state.lastPriceLine=state.candleSeries.createPriceLine({price:0,title:'LIVE',color:'#d8b66c',lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,axisLabelVisible:true});state.overlay=document.createElement('div');state.overlay.className='chart-overlay';el.appendChild(state.overlay);
 new ResizeObserver(()=>{if(state.chart)state.chart.applyOptions({width:el.clientWidth,height:el.clientHeight});scheduleChartOverlayRedraw()}).observe(el);state.chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleChartOverlayRedraw);['wheel','pointerup','touchend'].forEach(type=>el.addEventListener(type,scheduleChartOverlayRedraw,{passive:true}));
}
function updateChartAnalysisSummary(best){
 const title=$('chartAnalysisTitle'),stateEl=$('chartAnalysisState'),summary=$('chartAnalysisSummary');
 if(!title||!stateEl||!summary)return;
 if(!best){title.textContent='No qualifying ICT setup right now';stateEl.textContent='WAITING';summary.textContent='No trade plan is displayed because the full confirmation sequence is not present. The chart can still show confirmed FVGs, liquidity pools and structure levels. Wait for a liquidity raid → displacement → MSS/BOS → valid order-block retracement with multi-timeframe alignment.';return;}
 title.textContent=(best.side==='bullish'?'BULLISH':'BEARISH')+' · '+best.type;
 stateEl.textContent=best.status||'CONFIRMED';
 const zone=Array.isArray(best.zone)?'OB zone '+fmt(best.zone[0])+' – '+fmt(best.zone[1])+' · ':'';
 const targets=(best.targets||[best.target]).filter(Number.isFinite).map((v,i)=>'TP'+(i+1)+' '+fmt(v)).join(' · ');
 summary.textContent=zone+'Entry '+fmt(best.entry)+' · Stop Loss '+fmt(best.stop)+' · '+targets+' · Risk/Reward '+best.rr+'. '+best.reason+' Target basis: '+(best.targetSource||'confirmed opposing liquidity')+'. '+(best.mtfText?'MTF confirmation: '+best.mtfText+'.':'');
}
function drawChart(bars,results){
 initChart();if(!state.candleSeries)return;
 const data=bars.map(x=>({time:candleEpochSeconds(x),open:x.open,high:x.high,low:x.low,close:x.close,isOpen:!!x.isOpen})).filter(x=>Number.isFinite(x.time)&&[x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
 if(!data.length)return;
 const clean=data.map(({isOpen,...bar})=>bar),scale=state.chart.timeScale();
 if(!state.chartHasData){
  state.candleSeries.setData(clean);scale.fitContent();state.chartHasData=true;
 }else{
  const prior=state.chartLastTime;
  const same=data.find(x=>x.time===prior);
  if(same){
   let latest={time:same.time,open:same.open,high:same.high,low:same.low,close:same.close};
   if(state.liveCandle&&state.liveCandle.time===same.time){
    latest={time:same.time,open:state.liveCandle.open,high:Math.max(same.high,state.liveCandle.high),low:Math.min(same.low,state.liveCandle.low),close:state.liveCandle.close};
   }
   try{state.candleSeries.update(latest)}catch(e){}
  }
  data.filter(x=>x.time>prior).forEach(x=>{
   const bar={time:x.time,open:x.open,high:x.high,low:x.low,close:x.close};
   try{state.candleSeries.update(bar)}catch(e){}
   state.liveCandle=x.isOpen?{...bar}:null;
  });
 }
 const last=data[data.length-1],liveTime=state.liveCandle?state.liveCandle.time:0;
 if(last.time>=liveTime){
  if(last.isOpen){
   if(state.liveCandle&&state.liveCandle.time===last.time){
    state.liveCandle={time:last.time,open:state.liveCandle.open,high:Math.max(last.high,state.liveCandle.high),low:Math.min(last.low,state.liveCandle.low),close:state.liveCandle.close};
   }else state.liveCandle={time:last.time,open:last.open,high:last.high,low:last.low,close:last.close};
  }else if(!state.liveCandle||state.liveCandle.time<last.time){state.liveCandle=null}
 }
 state.chartLastTime=Math.max(state.chartLastTime||0,last.time);
 if(state.lastPriceLine)state.lastPriceLine.applyOptions({price:(state.liveCandle||clean[clean.length-1]).close});
 state.lines.forEach(line=>{try{state.candleSeries.removePriceLine(line)}catch(e){}});state.lines=[];
 const best=results[0];const colors={Entry:'#70b9e8',Stop:'#f07878',TP1:'#36d39a',TP2:'#8bd8b7',TP3:'#d8b66c'};
 if(best){[['Entry',best.entry],['Stop',best.stop],['TP1',(best.targets||[best.target])[0]],['TP2',(best.targets||[])[1]],['TP3',(best.targets||[])[2]]].filter(x=>Number.isFinite(x[1])).forEach(([title,price])=>state.lines.push(state.candleSeries.createPriceLine({price,title,color:colors[title],lineWidth:title==='TP1'?2:1,lineStyle:LightweightCharts.LineStyle.Dashed,axisLabelVisible:true})))}
 const closedBars=bars.filter(x=>!x.isOpen&&[x.open,x.high,x.low,x.close].every(Number.isFinite));
 const chartXray=closedBars.length>=25?getMarketXray(closedBars):null;
 if(chartXray){
  if(chartXray.bsl!==null)state.lines.push(state.candleSeries.createPriceLine({price:chartXray.bsl,title:'BSL · EQH pool',color:'#d8a85d',lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dotted,axisLabelVisible:true}));
  if(chartXray.ssl!==null)state.lines.push(state.candleSeries.createPriceLine({price:chartXray.ssl,title:'SSL · EQL pool',color:'#d8a85d',lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dotted,axisLabelVisible:true}));
  if(chartXray.brokenLevel!==null)state.lines.push(state.candleSeries.createPriceLine({price:chartXray.brokenLevel,title:chartXray.breakType,color:chartXray.breakSide==='bullish'?'#36d39a':'#f07878',lineWidth:2,lineStyle:LightweightCharts.LineStyle.Solid,axisLabelVisible:true}));
 }
 const zones=chartXray?chartXray.activeZones.slice(-6).map(z=>({zone:[z.low,z.high],side:z.side,label:z.side.toUpperCase()+' FVG · '+z.state,kind:'fvg'})):[];
 const setupZones=results.slice(0,5).map(r=>({zone:r.zone,side:r.side,label:r.type.toUpperCase(),kind:'setup'}));
 state.chartZones=[...zones,...setupZones];scheduleChartOverlayRedraw();
 const markers=[];results.slice(0,8).forEach(r=>markers.push({time:Math.floor(Date.parse(r.time)/1000),position:r.side==='bullish'?'belowBar':'aboveBar',color:r.side==='bullish'?'#36d39a':'#f07878',shape:r.side==='bullish'?'arrowUp':'arrowDown',text:r.type.replace(' candidate','').replace('fair value gap','FVG').replace('liquidity sweep','Sweep').replace('order block','OB')}));
 if(state.candleSeries.setMarkers)state.candleSeries.setMarkers(markers.sort((a,b)=>a.time-b.time));
 $('chartTitle').textContent=state.market+' · '+state.tf.toUpperCase()+(state.tf==='1m'?' EXECUTION':' CHART');$('chartStatus').textContent=data.length+' '+state.tf.toUpperCase()+' candles · '+(last.isOpen?'CURRENT BAR':'LAST COMPLETED BAR');$('chartFoot').textContent=state.tf==='1m'?(best?'Live 1M ticks update the active OHLC candle. Chart overlays show completed-candle FVGs, confirmed liquidity pools and any closed-candle BOS/CHOCH; trade levels appear only after full setup confirmation.':'Live 1M ticks update the active candle. Structural FVG/liquidity overlays remain visible; no entry signal is shown until sweep, displacement, MSS and MTF confirmation align.'):'Viewing '+state.tf.toUpperCase()+' candles. Live tick updates are reserved for the 1M execution chart; multi-timeframe ICT confirmation continues in the background.';updateChartAnalysisSummary(best);
}
function render(data){
 state.lastData=data;
 $('price').textContent=fmt(data.tick.mid);$('change').textContent=data.tick.dayDiffPercent==null?'—':(data.tick.dayDiffPercent>0?'+':'')+data.tick.dayDiffPercent.toFixed(2)+'%';$('change').style.color=(data.tick.dayDiffPercent||0)>=0?'var(--green)':'var(--red)';
 $('marketStatus').textContent=data.tick.marketState||'Unknown';$('quoteAge').textContent=age(data.tick.timestamp);$('symbolLabel').textContent=data.symbol;$('setupCount').textContent=data.analysis.results.length;$('structureTf').textContent='MTF';
 $('feedState').textContent=tickIsStale(data.tick)?'STALE QUOTE':(data.tick.marketState==='open'?'FEED CONNECTED':'LAST QUOTE');$('updated').textContent='Updated '+new Date().toLocaleTimeString();
 const selectedTfBars=data.mtfBars&&data.mtfBars[state.tf];const selectedTfCount=selectedTfBars?selectedTfBars.filter(x=>!x.isOpen).length:data.analysis.bars.length;$('feedNote').textContent='Resolved provider symbol: '+data.symbol+'. '+selectedTfCount+' completed '+state.tf+' candles displayed; 1M is the execution-signal timeframe.';
 const chartBars=data.mtfBars&&data.mtfBars[state.tf]&&data.mtfBars[state.tf].length?data.mtfBars[state.tf]:data.analysis.bars;drawChart(chartBars,state.tf==='1m'?data.analysis.results:[]);renderXray((data.mtfBars&&data.mtfBars['15m']&&data.mtfBars['15m'].length?analyze(data.mtfBars['15m']).bars:data.analysis.bars),data.mtf,data.analysis.results);notifyNewSetups(data.analysis.results);if(state.hub&&state.hub.state===signalR.HubConnectionState.Connected)$('feedState').textContent='LIVE STREAM CONNECTED';
 const bullList=$('bullishList'),bearList=$('bearishList');bullList.innerHTML='';bearList.innerHTML='';
 const bulls=data.analysis.results.filter(r=>r.side==='bullish'),bears=data.analysis.results.filter(r=>r.side==='bearish');
 if(!bulls.length)bullList.innerHTML='<div class="empty">No valid bullish setup detected. Waiting for confirmation.</div>';
 if(!bears.length)bearList.innerHTML='<div class="empty">No valid bearish setup detected. Waiting for confirmation.</div>';
 data.analysis.results.forEach((r)=>{const sideResults=r.side==='bullish'?bulls:bears;const i=sideResults.indexOf(r);const div=document.createElement('article');div.className='setup '+r.side;const dir=document.createElement('div');dir.innerHTML='<div class="direction '+r.side+'">'+r.side.toUpperCase()+'</div><h3>'+r.type+'</h3><div class="setup-status">'+(r.status||'CONFIRMED SEQUENCE')+'</div><div class="muted">Rank #'+(i+1)+' · '+new Date(r.time).toLocaleString()+'</div>';const levels=document.createElement('div');levels.className='levels';[['ENTRY',r.entry],['STOP',r.stop],['TP1',(r.targets||[r.target])[0]],['TP2',(r.targets||[])[1]],['TP3',(r.targets||[])[2]]].filter(x=>Number.isFinite(x[1])).forEach(([k,v])=>{const d=document.createElement('div');d.innerHTML='<small>'+k+'</small><b>'+fmt(v)+'</b>';levels.appendChild(d)});const why=document.createElement('div');why.className='muted';why.textContent=r.reason+' · '+(r.targetSource||'Target model')+(r.mtfText?' · MTF: '+r.mtfText:'');const score=document.createElement('div');score.className='score';score.innerHTML='<b>'+r.score+'</b><small>RULE CONFLUENCE / 100</small><small>NOT WIN-RATE · '+r.rr+' R:R</small>';div.append(dir,levels,why,score);(r.side==='bullish'?bullList:bearList).appendChild(div)});
 const rows=[['Short-term bias',data.analysis.bias],['5m structure',data.mtf&&data.mtf['5m']?data.mtf['5m'].structure:'Unavailable'],['15m structure',data.mtf&&data.mtf['15m']?data.mtf['15m'].structure:'Unavailable'],['1h structure',data.mtf&&data.mtf['1h']?data.mtf['1h'].structure:'Unavailable'],['Recent range high',fmt(data.analysis.hi)],['Recent range low',fmt(data.analysis.lo)],['Completed candles',data.analysis.bars.length],['Detected patterns',data.analysis.results.length]];$('confluence').innerHTML='';rows.forEach(([k,v])=>{const d=document.createElement('div');d.className='con-row';const a=document.createElement('span'),b=document.createElement('span');a.textContent=k;b.textContent=v;d.append(a,b);$('confluence').appendChild(d)});
}
async function scanMarket(market){
 const symbol=await resolveSymbol(market),intervals=['1m','5m','15m','1h','4h'];
 const responses=await Promise.all([get(API+'/'+encodeURIComponent(symbol)),...intervals.map(tf=>get(API+'/'+encodeURIComponent(symbol)+'/ohlc?interval='+tf+'&limit='+(tf==='1m'?300:100)).catch(err=>tf==='4h'?{bars:[]}:Promise.reject(err)))]);
 const tick=responses[0],mtf={};let selectedBars=[];
 const mtfBars={};
 intervals.forEach((tf,i)=>{const bars=responses[i+1].bars||responses[i+1].data||responses[i+1].candles||[];mtfBars[tf]=bars;if(tf==='1m')selectedBars=bars;try{const a=analyze(bars),x=getMarketXray(a.bars);mtf[tf]={bias:a.bias,structure:x.structure,bars:a.bars.length,xray:x,setups:a.results}}catch(e){mtf[tf]={bias:'Unavailable',structure:'Unavailable',bars:0,xray:null,setups:[]}}});
 if(!selectedBars.length)throw Error('Selected timeframe candles are unavailable for '+market+'.');
 const analysis=attachMtfLiquidityTargets(applyMtfEntryGate(analyze(selectedBars),mtf),mtfBars);
 return {market,symbol,tick,analysis,mtf,mtfBars,scannedAt:new Date().toISOString()};
}
function renderRadar(result){
 const p=result.market==='XAUUSD'?'radarXau':'radarNas',set=(suffix,value)=>{const el=$(p+suffix);if(el)el.textContent=value};
 set('State',tickIsStale(result.tick)?'STALE':'SCANNED');set('Price',fmt(result.tick.mid));set('Bias',result.analysis.bias);set('Setups',String(result.analysis.results.length));
 const best=result.analysis.results[0];set('Best',best?best.side.toUpperCase()+' · '+best.type+' · '+best.rr+' R:R':'No qualifying setup detected');
 set('Time','Updated '+new Date(result.scannedAt).toLocaleTimeString());
 const card=$(p);if(card)card.dataset.market=result.market;
}
function renderRadarError(market,error){
 const p=market==='XAUUSD'?'radarXau':'radarNas',set=(suffix,value)=>{const el=$(p+suffix);if(el)el.textContent=value};
 set('State','UNAVAILABLE');set('Price','—');set('Bias','Unavailable');set('Setups','—');set('Best',error.message);set('Time','Last scan failed');
}
async function scan(){
 if(state.scanning){state.scanRequested=true;return}state.scanning=true;
 await ensureChartLibrary().catch(()=>false);
 $('feedState').textContent='SCANNING BOTH MARKETS';$('radarStatus').textContent='SCANNING';
 $('bullishList').innerHTML='<div class="loading">Scanning bullish setups…</div>';$('bearishList').innerHTML='<div class="loading">Scanning bearish setups…</div>';
 try{
  const results=await Promise.allSettled(['XAUUSD','NAS100'].map(scanMarket));
  let selected=null,success=0;
  results.forEach((result,i)=>{const market=i===0?'XAUUSD':'NAS100';if(result.status==='fulfilled'){success++;renderRadar(result.value);if(market===state.market)selected=result.value}else renderRadarError(market,result.reason)});
  $('radarStatus').textContent=success===2?'BOTH MARKETS SCANNED':success===1?'PARTIAL DATA':'DATA UNAVAILABLE';
  if(!selected)throw Error(state.market+' scan unavailable. See Market Radar for each market status.');
  state.symbol=selected.symbol;
  connectLive(selected.symbol).catch(()=>{$('feedState').textContent='REST SNAPSHOT';});
  render(selected);
 }catch(e){
  $('feedState').textContent='DATA UNAVAILABLE';$('updated').textContent='Scan could not complete';
  const chartStatus=$('chartStatus'),chartFoot=$('chartFoot');
  if(chartStatus)chartStatus.textContent='DATA UNAVAILABLE';
  if(chartFoot)chartFoot.textContent='Live candles could not be loaded: '+e.message+' · Use Refresh to retry.';
  if(!state.chart){const chartEl=$('marketChart');if(chartEl){const note=document.createElement('div');note.className='tv-loading';note.textContent='Market data unavailable — '+e.message;chartEl.replaceChildren(note)}}
  const message=document.createElement('div');message.className='empty';message.textContent=e.message+' No placeholder prices or signals are displayed. Try again later.';
  $('bullishList').replaceChildren(message.cloneNode(true));$('bearishList').replaceChildren(message);
  $('feedNote').textContent='Provider response: '+e.message;$('setupCount').textContent='0';$('price').textContent='—';$('change').textContent='—';$('marketStatus').textContent='Unavailable';
 }finally{state.scanning=false;if(state.scanRequested){state.scanRequested=false;scan()}}
}
document.querySelectorAll('.market').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.market').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.market=btn.dataset.market;if(window.loadOfficialTradingViewChart)window.loadOfficialTradingViewChart(state.market,state.tf);resetChartForMarket();scan()}));
$('timeframe').value=state.tf;$('timeframe').disabled=false;$('timeframe').addEventListener('change',()=>{state.tf=$('timeframe').value;if(window.loadOfficialTradingViewChart)window.loadOfficialTradingViewChart(state.market,state.tf);if(state.lastData)render(state.lastData);else scan()});
$('refresh').addEventListener('click',scan);
const alertBtn=$('enableAlerts');if(alertBtn)alertBtn.addEventListener('click',async()=>{
 if(!('Notification'in window)){$('alertStatus').textContent='Browser notifications are not supported.';return}
 const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
 state.alertsEnabled=permission==='granted';alertBtn.textContent=state.alertsEnabled?'Alerts enabled ✓':'Enable alerts';
 $('alertStatus').textContent=state.alertsEnabled?'Browser alerts are active while this page is open.':'Notification permission was not granted.';
});
updateChartClock();updateCandleTimer();setInterval(updateChartClock,1000);setInterval(updateCandleTimer,1000);
ensureChartLibrary().then(()=>{const status=$('chartStatus');if(status)status.textContent='CHART READY · WAITING FOR DATA'}).catch(e=>{const status=$('chartStatus'),foot=$('chartFoot');if(status)status.textContent='CHART LIBRARY ERROR';if(foot)foot.textContent=e.message});
scan();state.timer=setInterval(scan,60000);
})();