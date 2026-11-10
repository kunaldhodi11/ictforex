/* ICT Forex Academy — scroll-triggered count-up for the facts bar numbers,
   echoing the ticking stat counters seen in premium editorial scroll sites. */
(function(){
  'use strict';
  var facts=document.querySelectorAll('.fact-n');
  if(!facts.length)return;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce)return;

  function parseTarget(text){
    var m=text.match(/^(\d+)/);
    return m?parseInt(m[1],10):null;
  }

  function animateCount(el){
    var raw=el.textContent.trim();
    var target=parseTarget(raw);
    if(target===null)return;
    var suffix=raw.replace(/^\d+/,'');
    var duration=1000;
    var start=null;
    function tick(now){
      if(start===null)start=now;
      var p=Math.min(1,(now-start)/duration);
      var eased=1-Math.pow(1-p,3);
      el.textContent=Math.round(target*eased)+suffix;
      if(p<1)requestAnimationFrame(tick);
      else el.textContent=target+suffix;
    }
    requestAnimationFrame(tick);
  }

  if('IntersectionObserver'in window){
    var seen=new WeakSet();
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting&&!seen.has(entry.target)){
          seen.add(entry.target);
          animateCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    },{threshold:0.4});
    facts.forEach(function(el){obs.observe(el);});
  }
})();
