/* ICT Forex Academy — lightweight scroll reveals
   Uses IntersectionObserver only; no per-scroll layout reads or pointer tilt. */
(function(){
  'use strict';
  var root=document.documentElement;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce){return;}
  var reveal=[];
  function add(el){
    if(!el||el.dataset.ifaReveal==='true')return;
    el.dataset.ifaReveal='true';
    reveal.push(el);
  }
  var hero=document.querySelector('.hero');
  if(hero){
    add(hero.querySelector('.hero-badge'));
    add(hero.querySelector('h1'));
    add(hero.querySelector('.hero-sub'));
    add(hero.querySelector('.hero-market-visual'));
    add(hero.querySelector('.hero-btns'));
    add(hero.querySelector('.trust-strip'));
  }
  add(document.querySelector('.facts'));
  document.querySelectorAll('.section').forEach(function(section){
    add(section.querySelector('.sec-hd'));
    add(section.querySelector('.daily-tip-section'));
    section.querySelectorAll('.faq-item').forEach(add);
  });
  document.querySelectorAll('.course-card').forEach(add);
  add(document.querySelector('.footer-grid'));
  add(document.querySelector('.footer-bottom'));
  if(!('IntersectionObserver' in window)){
    reveal.forEach(function(el){el.classList.add('ifa-in-view');});
    return;
  }
  var observer=new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('ifa-in-view');
        observer.unobserve(entry.target);
      }
    });
  },{threshold:0.08,rootMargin:'0px 0px -3% 0px'});
  root.classList.add('ifa-motion-ready');
  reveal.forEach(function(el){observer.observe(el);});
})();