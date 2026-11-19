(function(){
'use strict';
const API='https://biquote.io/api';
const $=id=>document.getElementById(id);
const state={market:'XAUUSD',tf:'15m',symbol:null,scan:[],timer:null,chart:null,candleSeries:null,lines:[],hub:null,subscribedSymbol:null,liveCandle:null,alertsEnabled:false,alerted:new Set()};
const candidates={XAUUSD:['XAUUSD','GOLD'],NAS100:['NAS100','US100','USTEC','NASDAQ100','NDX100','NQ100','NAS100.cash']};
async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
function updateLiveTick(tick){
 if(!tick||!tick.symbol||String(tick.symbol).toUpperCase()!==String(state.symbol||'').toUpperCase())return;
 const mid=num(tick.mid);if(mid===null)return;
 if(tick.stale===true||(num(tick.quoteAgeSeconds)!==null&&tick.quoteAgeSeconds>120)){$('feedState').textContent='STALE FEED';return}
 $('price').textContent=fmt(mid);
 updateLiveCandle(mid,tick.timestamp);
 if(tick.dayDiffPercent!==undefined&&tick.dayDiffPercent!==null){$('change').textContent=(tick.dayDiffPercent>0?'+':'')+Number(tick.dayDiffPercent).toFixed(2)+'%';$('change').style.color=Number(tick.dayDiffPercent)>=0?'var(--green)':'var(--red)'}
 if(tick.marketState)$('marketStatus').textContent=tick.marketState;
 $('quoteAge').textContent=tick.timestamp?age(tick.timestamp):'Live tick received';
 $('feedState').textContent='LIVE STREAM';
 $('updated').textContent='Tick '+new Date().toLocaleTimeString();
}
function updateLiveCandle(price,timestamp){
 if(!state.candleSeries||!state.chart)return;
 const stamp=Date.parse(timestamp||new Date().toISOString());if(!Number.isFinite(stamp))return;
 const secs=({'5m':300,'15m':900,'1h':3600})[state.tf]||900;
 const time=Math.floor(stamp/1000/secs)*secs;
 if(!state.liveCandle||state.liveCandle.time!==time){
  state.liveCandle={time,open:price,high:price,low:price,close:price};
 }else{
  state.liveCandle.high=Math.max(state.liveCandle.high,price);
  state.liveCandle.low=Math.min(state.liveCandle.low,price);
  state.liveCandle.close=price;
 }
 try{state.candleSeries.update(state.liveCandle)}catch(e){}
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
function num(v){return typeof v==='number'&&Number.isFinite(v)?v:null}
function fmt(v){return v==null?'—':v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function age(ts){if(!ts)return 'Quote timestamp unavailable';let s=Math.max(0,Math.floor((Date.now()-Date.parse(ts))/1000));return s<60?'Quote '+s+'s ago':'Quote '+Math.floor(s/60)+'m ago'}
async function resolveSymbol(market){
 try{const data=await get(API+'/active');const rows=Array.isArray(data)?data:(data.items||data.symbols||[]);const names=rows.map(x=>String(x.name||x.symbol||'').toUpperCase());const found=candidates[market].find(x=>names.includes(x));if(found)return found}catch(e){}
 for(const sym of candidates[market]){try{await get(API+'/'+encodeURIComponent(sym)+'?allowStale=false');return sym}catch(e){}}
 throw Error(market==='NAS100'?'No supported NAS100/US100 symbol was found in the free feed.':'XAUUSD is not currently available in the feed.');
}
function avg(a){return a.reduce((s,x)=>s+x,0)/(a.length||1)}
function analyze(bars){
 const b=bars.filter(x=>!x.isOpen&&[x.open,x.high,x.low,x.close].every(v=>num(v)!==null)).sort((a,b)=>Date.parse(a.openTime)-Date.parse(b.openTime));
 if(b.length<25)throw Error('Not enough completed candles for a reliable scan.');
 const last=b[b.length-1],prior=b.slice(-21,-1),hi=Math.max(...prior.map(x=>x.high)),lo=Math.min(...prior.map(x=>x.low));
 const bodyAvg=avg(b.slice(-21,-1).map(x=>Math.abs(x.close-x.open)));
 const results=[];
 // Sweep: last completed candle trades beyond prior 20-bar extreme and closes back inside.
 if(last.low<lo&&last.close>lo&&last.close>last.open){const z=prior.reduce((a,x)=>x.low<a.low?x:a,prior[0]);results.push({side:'bullish',type:'Sell-side liquidity sweep',zone:[lo,last.low],score:72,reason:'Price ran below the recent range low and closed back above it.'})}
 if(last.high>hi&&last.close<hi&&last.close<last.open){results.push({side:'bearish',type:'Buy-side liquidity sweep',zone:[last.high,hi],score:72,reason:'Price ran above the recent range high and closed back below it.'})}
 // Three-candle fair value gap, using the latest completed triplet.
 const a=b[b.length-3],c=b[b.length-1];
 if(c.low>a.high){results.push({side:'bullish',type:'Bullish fair value gap',zone:[a.high,c.low],score:60,reason:'Three-candle imbalance detected in completed candles.'})}
 if(c.high<a.low){results.push({side:'bearish',type:'Bearish fair value gap',zone:[c.high,a.low],score:60,reason:'Three-candle imbalance detected in completed candles.'})}
 // Displacement + last opposite candle as a candidate order block.
 const p=b[b.length-2],swingHigh=Math.max(...b.slice(-8,-2).map(x=>x.high)),swingLow=Math.min(...b.slice(-8,-2).map(x=>x.low));
 if(last.close>last.open&&Math.abs(last.close-last.open)>bodyAvg*1.35&&last.close>swingHigh&&p.close<p.open){results.push({side:'bullish',type:'Bullish order block candidate',zone:[p.low,p.high],score:68,reason:'Bullish displacement broke a recent local high; prior down candle marked as candidate OB.'})}
 if(last.close<last.open&&Math.abs(last.close-last.open)>bodyAvg*1.35&&last.close<swingLow&&p.close>p.open){results.push({side:'bearish',type:'Bearish order block candidate',zone:[p.low,p.high],score:68,reason:'Bearish displacement broke a recent local low; prior up candle marked as candidate OB.'})}
 // Confluence adds modestly when several same-side patterns coexist.
 results.forEach(r=>{const same=results.filter(x=>x.side===r.side).length;r.score=Math.min(95,r.score+(same-1)*8);const mid=(r.zone[0]+r.zone[1])/2;const risk=Math.max(Math.abs(last.close-mid)*0.65,(r.zone[1]-r.zone[0])*0.6,Math.abs(last.close)*0.00015);r.entry=mid;r.stop=r.side==='bullish'?Math.min(...r.zone)-risk:Math.max(...r.zone)+risk;r.target=r.side==='bullish'?r.entry+2*(r.entry-r.stop):r.entry-2*(r.stop-r.entry);r.rr='1:2';r.time=last.openTime});
 return {bars:b,last,results:results.sort((x,y)=>y.score-x.score),bias:last.close>avg(b.slice(-20).map(x=>x.close))?'Bullish':'Bearish',hi,lo};
}
function getMarketXray(bars){
 const recent=bars.slice(-30),high=Math.max(...recent.map(x=>x.high)),low=Math.min(...recent.map(x=>x.low)),last=bars[bars.length-1],mid=(high+low)/2,range=high-low;
 const pivots=[];for(let i=Math.max(2,bars.length-32);i<bars.length-2;i++){const p=bars[i];if(p.high>bars[i-1].high&&p.high>bars[i-2].high&&p.high>=bars[i+1].high&&p.high>=bars[i+2].high)pivots.push({type:'high',price:p.high});if(p.low<bars[i-1].low&&p.low<bars[i-2].low&&p.low<=bars[i+1].low&&p.low<=bars[i+2].low)pivots.push({type:'low',price:p.low})}
 const highs=pivots.filter(p=>p.type==='high'),lows=pivots.filter(p=>p.type==='low'),sh=highs[highs.length-1],sl=lows[lows.length-1];let structure='Range / unclear',note='No close beyond a recent confirmed swing';
 if(sh&&last.close>sh.price){structure='Bullish BOS';note='Latest close broke the recent confirmed swing high'}else if(sl&&last.close<sl.price){structure='Bearish BOS';note='Latest close broke the recent confirmed swing low'}else if(highs.length>1&&lows.length>1){const ph=highs[highs.length-2],pl=lows[lows.length-2];if(sh.price<ph.price&&sl.price<pl.price){structure='Bearish structure';note='Recent swing highs and lows are descending'}else if(sh.price>ph.price&&sl.price>pl.price){structure='Bullish structure';note='Recent swing highs and lows are ascending'}}
 const pos=range?Math.max(0,Math.min(100,(last.close-low)/range*100)):50,zone=pos>55?'Premium':pos<45?'Discount':'Equilibrium',dt=new Date(last.openTime),hour=dt.getUTCHours();let session='Between sessions';if(hour<7)session='Asia';else if(hour<12)session='London';else if(hour<16)session='London + New York';else if(hour<21)session='New York';else session='Late New York';
 return {high,low,mid,pos,zone,structure,note,session,time:dt.toISOString()};
}
function renderXray(bars){const x=getMarketXray(bars);$('xrayTf').textContent=state.tf.toUpperCase();$('xrayStructure').textContent=x.structure;$('xrayStructureNote').textContent=x.note;$('xrayRange').textContent=fmt(x.low)+' – '+fmt(x.high);$('xrayRangeNote').textContent='30 completed candles · EQ '+fmt(x.mid);$('xrayZone').textContent=x.zone;$('xrayZoneNote').textContent='Price position '+x.pos.toFixed(0)+'% of recent range';$('xraySession').textContent=x.session;$('xraySessionNote').textContent='Candle UTC '+x.time.slice(11,16);$('rangeMarker').style.left=x.pos+'%';$('xrayFoot').textContent='Session labels use approximate UTC windows. BOS is based on a close beyond a confirmed local swing; CHOCH is not asserted without a validated prior structure reversal.'}
function initChart(){
 if(state.chart||!window.LightweightCharts)return;
 const el=$('marketChart');if(!el)return;
 state.chart=LightweightCharts.createChart(el,{width:el.clientWidth,height:el.clientHeight,layout:{background:{color:'#0b1420'},textColor:'#91a2b8'},grid:{vertLines:{color:'#172438'},horzLines:{color:'#172438'}},rightPriceScale:{borderColor:'#25364b'},timeScale:{borderColor:'#25364b',timeVisible:true,secondsVisible:false},crosshair:{mode:LightweightCharts.CrosshairMode.Normal}});
 state.candleSeries=state.chart.addCandlestickSeries({upColor:'#36d39a',downColor:'#f07878',borderUpColor:'#36d39a',borderDownColor:'#f07878',wickUpColor:'#36d39a',wickDownColor:'#f07878'});
 new ResizeObserver(()=>{if(state.chart)state.chart.applyOptions({width:el.clientWidth,height:el.clientHeight})}).observe(el);
}
function drawChart(bars,results){
 initChart();if(!state.candleSeries)return;
 const data=bars.map(x=>({time:Math.floor(Date.parse(x.openTime)/1000),open:x.open,high:x.high,low:x.low,close:x.close})).filter(x=>Number.isFinite(x.time)).sort((a,b)=>a.time-b.time);
 state.candleSeries.setData(data);state.liveCandle=null;state.lines.forEach(line=>{try{state.candleSeries.removePriceLine(line)}catch(e){}});state.lines=[];
 const best=results[0];const colors={Entry:'#70b9e8',Stop:'#f07878',Target:'#36d39a'};
 if(best){[['Entry',best.entry],['Stop',best.stop],['Target',best.target]].forEach(([title,price])=>state.lines.push(state.candleSeries.createPriceLine({price,title,color:colors[title],lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,axisLabelVisible:true})))}
 const markers=[];results.slice(0,8).forEach(r=>markers.push({time:Math.floor(Date.parse(r.time)/1000),position:r.side==='bullish'?'belowBar':'aboveBar',color:r.side==='bullish'?'#36d39a':'#f07878',shape:r.side==='bullish'?'arrowUp':'arrowDown',text:r.type.replace(' candidate','').replace('fair value gap','FVG').replace('liquidity sweep','Sweep').replace('order block','OB')}));
 if(state.candleSeries.setMarkers)state.candleSeries.setMarkers(markers.sort((a,b)=>a.time-b.time));
 state.chart.timeScale().fitContent();$('chartTitle').textContent=state.market+' · '+state.tf.toUpperCase();$('chartStatus').textContent=data.length+' candles loaded';$('chartFoot').textContent=best?'Top setup levels: Entry, Stop and 2R Target. Pattern labels are heuristic candle detections.':'No qualifying ICT setup in this candle window; chart remains available.';
}
function render(data){
 $('price').textContent=fmt(data.tick.mid);$('change').textContent=data.tick.dayDiffPercent==null?'—':(data.tick.dayDiffPercent>0?'+':'')+data.tick.dayDiffPercent.toFixed(2)+'%';$('change').style.color=(data.tick.dayDiffPercent||0)>=0?'var(--green)':'var(--red)';
 $('marketStatus').textContent=data.tick.marketState||'Unknown';$('quoteAge').textContent=age(data.tick.timestamp);$('symbolLabel').textContent=data.symbol;$('setupCount').textContent=data.analysis.results.length;$('structureTf').textContent=state.tf.toUpperCase();
 $('feedState').textContent=data.tick.stale?'STALE QUOTE':(data.tick.marketState==='open'?'FEED CONNECTED':'LAST QUOTE');$('updated').textContent='Updated '+new Date().toLocaleTimeString();
 $('feedNote').textContent='Resolved provider symbol: '+data.symbol+'. '+data.analysis.bars.length+' completed '+state.tf+' candles analysed.';
 drawChart(data.analysis.bars,data.analysis.results);renderXray(data.analysis.bars);notifyNewSetups(data.analysis.results);if(state.hub&&state.hub.state===signalR.HubConnectionState.Connected)$('feedState').textContent='LIVE STREAM CONNECTED';
 const list=$('setupList');list.innerHTML='';
 if(!data.analysis.results.length){list.innerHTML='<div class="empty">No qualifying setup found in the latest completed candles. The scanner will not invent a trade.</div>'}
 data.analysis.results.forEach((r,i)=>{const div=document.createElement('article');div.className='setup';const dir=document.createElement('div');dir.innerHTML='<div class="direction '+r.side+'">'+r.side.toUpperCase()+'</div><h3>'+r.type+'</h3><div class="muted">Rank #'+(i+1)+' · '+new Date(r.time).toLocaleString()+'</div>';const levels=document.createElement('div');levels.className='levels';[['ENTRY',r.entry],['STOP',r.stop],['TARGET',r.target]].forEach(([k,v])=>{const d=document.createElement('div');d.innerHTML='<small>'+k+'</small><b>'+fmt(v)+'</b>';levels.appendChild(d)});const why=document.createElement('div');why.className='muted';why.textContent=r.reason;const score=document.createElement('div');score.className='score';score.innerHTML='<b>'+r.score+'</b><small>CONFLUENCE / 100</small><small>'+r.rr+' R:R</small>';div.append(dir,levels,why,score);list.appendChild(div)});
 const rows=[['Short-term bias',data.analysis.bias],['Recent range high',fmt(data.analysis.hi)],['Recent range low',fmt(data.analysis.lo)],['Completed candles',data.analysis.bars.length],['Detected patterns',data.analysis.results.length]];$('confluence').innerHTML='';rows.forEach(([k,v])=>{const d=document.createElement('div');d.className='con-row';const a=document.createElement('span'),b=document.createElement('span');a.textContent=k;b.textContent=v;d.append(a,b);$('confluence').appendChild(d)});
}
async function scan(){
 $('feedState').textContent='SCANNING';$('setupList').innerHTML='<div class="loading">Fetching feed and analysing completed candles…</div>';
 try{const symbol=await resolveSymbol(state.market);state.symbol=symbol;connectLive(symbol).catch(()=>{$('feedState').textContent='REST SNAPSHOT';});const [tick,raw]=await Promise.all([get(API+'/'+encodeURIComponent(symbol)),get(API+'/'+encodeURIComponent(symbol)+'/ohlc?interval='+state.tf+'&limit=100')]);const bars=raw.bars||raw.data||raw.candles||[];const analysis=analyze(bars);render({symbol,tick,analysis})}
 catch(e){$('feedState').textContent='DATA UNAVAILABLE';$('updated').textContent='Scan could not complete';$('setupList').innerHTML='';const d=document.createElement('div');d.className='empty';d.textContent=e.message+' No placeholder prices or signals are displayed. Try again later or switch market.';$('setupList').appendChild(d);$('feedNote').textContent='Provider response: '+e.message;$('setupCount').textContent='0';$('price').textContent='—';$('change').textContent='—';$('marketStatus').textContent='Unavailable'}
}
document.querySelectorAll('.market').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.market').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.market=btn.dataset.market;scan()}));
$('timeframe').addEventListener('change',e=>{state.tf=e.target.value;state.liveCandle=null;scan()});
$('refresh').addEventListener('click',scan);
const alertBtn=$('enableAlerts');if(alertBtn)alertBtn.addEventListener('click',async()=>{
 if(!('Notification'in window)){$('alertStatus').textContent='Browser notifications are not supported.';return}
 const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
 state.alertsEnabled=permission==='granted';alertBtn.textContent=state.alertsEnabled?'Alerts enabled ✓':'Enable alerts';
 $('alertStatus').textContent=state.alertsEnabled?'Browser alerts are active while this page is open.':'Notification permission was not granted.';
});
scan();state.timer=setInterval(scan,60000);
})();