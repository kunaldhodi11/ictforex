(function(){
'use strict';
const API='https://biquote.io/api';
const $=id=>document.getElementById(id);
const state={market:'XAUUSD',tf:'15m',symbol:null,scan:[],timer:null,chart:null,candleSeries:null,lines:[]};
const candidates={XAUUSD:['XAUUSD','GOLD'],NAS100:['NAS100','US100','USTEC','NASDAQ100','NDX100','NQ100','NAS100.cash']};
async function get(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
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
 state.candleSeries.setData(data);state.lines.forEach(line=>{try{state.candleSeries.removePriceLine(line)}catch(e){}});state.lines=[];
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
 drawChart(data.analysis.bars,data.analysis.results);
 const list=$('setupList');list.innerHTML='';
 if(!data.analysis.results.length){list.innerHTML='<div class="empty">No qualifying setup found in the latest completed candles. The scanner will not invent a trade.</div>'}
 data.analysis.results.forEach((r,i)=>{const div=document.createElement('article');div.className='setup';const dir=document.createElement('div');dir.innerHTML='<div class="direction '+r.side+'">'+r.side.toUpperCase()+'</div><h3>'+r.type+'</h3><div class="muted">Rank #'+(i+1)+' · '+new Date(r.time).toLocaleString()+'</div>';const levels=document.createElement('div');levels.className='levels';[['ENTRY',r.entry],['STOP',r.stop],['TARGET',r.target]].forEach(([k,v])=>{const d=document.createElement('div');d.innerHTML='<small>'+k+'</small><b>'+fmt(v)+'</b>';levels.appendChild(d)});const why=document.createElement('div');why.className='muted';why.textContent=r.reason;const score=document.createElement('div');score.className='score';score.innerHTML='<b>'+r.score+'</b><small>CONFLUENCE / 100</small><small>'+r.rr+' R:R</small>';div.append(dir,levels,why,score);list.appendChild(div)});
 const rows=[['Short-term bias',data.analysis.bias],['Recent range high',fmt(data.analysis.hi)],['Recent range low',fmt(data.analysis.lo)],['Completed candles',data.analysis.bars.length],['Detected patterns',data.analysis.results.length]];$('confluence').innerHTML='';rows.forEach(([k,v])=>{const d=document.createElement('div');d.className='con-row';const a=document.createElement('span'),b=document.createElement('span');a.textContent=k;b.textContent=v;d.append(a,b);$('confluence').appendChild(d)});
}
async function scan(){
 $('feedState').textContent='SCANNING';$('setupList').innerHTML='<div class="loading">Fetching feed and analysing completed candles…</div>';
 try{const symbol=await resolveSymbol(state.market);state.symbol=symbol;const [tick,raw]=await Promise.all([get(API+'/'+encodeURIComponent(symbol)),get(API+'/'+encodeURIComponent(symbol)+'/ohlc?interval='+state.tf+'&limit=100')]);const bars=raw.bars||raw.data||raw.candles||[];const analysis=analyze(bars);render({symbol,tick,analysis})}
 catch(e){$('feedState').textContent='DATA UNAVAILABLE';$('updated').textContent='Scan could not complete';$('setupList').innerHTML='';const d=document.createElement('div');d.className='empty';d.textContent=e.message+' No placeholder prices or signals are displayed. Try again later or switch market.';$('setupList').appendChild(d);$('feedNote').textContent='Provider response: '+e.message;$('setupCount').textContent='0';$('price').textContent='—';$('change').textContent='—';$('marketStatus').textContent='Unavailable'}
}
document.querySelectorAll('.market').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.market').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.market=btn.dataset.market;scan()}));
$('timeframe').addEventListener('change',e=>{state.tf=e.target.value;scan()});$('refresh').addEventListener('click',scan);scan();state.timer=setInterval(scan,60000);
})();