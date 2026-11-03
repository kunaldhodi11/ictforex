/* ICT Forex Academy — cinematic scroll controller v1
   No dependencies. If setup fails, all page content stays visible. */
(function(){
 'use strict';
 var root=document.documentElement;
 var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 var fine=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;
 var progress=document.createElement('div');
 progress.id='ifa-scroll-progress';
 progress.setAttribute('aria-hidden','true');
 progress.innerHTML='<span></span>';
 document.body.appendChild(progress);
 if(reduce){return;}
 var reveal=[];
 function add(el,delay){
   if(!el||el.dataset.ifaReveal==='true')return;
   el.dataset.ifaReveal='true';
   if(delay)el.style.setProperty('--ifa-reveal-delay',delay+'ms');
   reveal.push(el);
 }
 var hero=document.querySelector('.hero');
 if(hero){
   add(hero.querySelector('.hero-badge'),80);
   add(hero.querySelector('h1'),180);
   add(hero.querySelector('.hero-sub'),300);
   add(hero.querySelector('.hero-btns'),410);
   add(hero.querySelector('.trust-strip'),520);
 }
 add(document.querySelector('.facts'),100);
 document.querySelectorAll('.section').forEach(function(section,index){
   add(section.querySelector('.sec-hd'),index*50);
   add(section.querySelector('.daily-tip-section'));
   section.querySelectorAll('.faq-item').forEach(function(item,i){add(item,i*90);});
 });
 document.querySelectorAll('.course-card').forEach(function(card){add(card);});
 add(document.querySelector('.footer-grid'),100);
 add(document.querySelector('.footer-bottom'),160);
 if(!('IntersectionObserver' in window)){
   reveal.forEach(function(el){el.classList.add('ifa-in-view');});
 }else{
   var observer=new IntersectionObserver(function(entries){
     entries.forEach(function(entry){
       if(entry.isIntersecting){
         entry.target.classList.add('ifa-in-view');
         observer.unobserve(entry.target);
       }
     });
   },{threshold:.12,rootMargin:'0px 0px -6% 0px'});
   reveal.forEach(function(el){observer.observe(el);});
 }
 root.classList.add('ifa-motion-ready');
 var ticking=false;
 function updateProgress(){
   var doc=document.documentElement;
   var max=doc.scrollHeight-window.innerHeight;
   var value=max>0?Math.min(1,Math.max(0,window.scrollY/max)):0;
   progress.firstElementChild.style.transform='scaleX('+value+')';
   ticking=false;
 }
 function onScroll(){
   if(!ticking){window.requestAnimationFrame(updateProgress);ticking=true;}
 }
 window.addEventListener('scroll',onScroll,{passive:true});
 window.addEventListener('resize',onScroll,{passive:true});
 updateProgress();
 if(fine){
   document.querySelectorAll('.course-card').forEach(function(card){
     var frame=0,lastEvent=null;
     card.addEventListener('pointermove',function(event){
       lastEvent=event;
       if(frame)return;
       frame=window.requestAnimationFrame(function(){
         frame=0;
         if(!lastEvent)return;
         var bounds=card.getBoundingClientRect();
         var x=(lastEvent.clientX-bounds.left)/bounds.width;
         var y=(lastEvent.clientY-bounds.top)/bounds.height;
         var rx=(.5-y)*4;
         var ry=(x-.5)*6;
         card.classList.add('ifa-tilt-active');
         card.style.transform='perspective(1100px) translate3d(0,-4px,0) rotateX('+rx+'deg) rotateY('+ry+'deg)';
         card.style.setProperty('--card-glow-x',(x*100)+'%');
         card.style.setProperty('--card-glow-y',(y*100)+'%');
         lastEvent=null;
       });
     },{passive:true});
     card.addEventListener('pointerleave',function(){
       if(frame)window.cancelAnimationFrame(frame);
       frame=0;lastEvent=null;
       card.classList.remove('ifa-tilt-active');
       card.style.transform='';
     },{passive:true});
   });
 }
})();
