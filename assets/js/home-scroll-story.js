/* ICT Forex Academy — scroll-scrubbed editorial text storytelling */
(function(){
  'use strict';
  var story=document.querySelector('.ifa-scroll-story');
  if(!story)return;
  var stage=story.querySelector('.ifa-scroll-story-stage');
  var scenes=Array.prototype.slice.call(story.querySelectorAll('.ifa-story-scene'));
  var progressFill=story.querySelector('.ifa-story-progress span');
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!stage||scenes.length<2||reduce)return;

  function init(){
    if(!window.gsap||!window.ScrollTrigger)return;
    var gsap=window.gsap;
    gsap.registerPlugin(window.ScrollTrigger);
    var copies=scenes.map(function(scene){return scene.querySelector('.ifa-story-copy')});
    var backgrounds=scenes.map(function(scene){return scene.querySelector('.ifa-story-backdrop')});
    gsap.set(copies,{autoAlpha:0,y:30});
    gsap.set(backgrounds,{autoAlpha:0});
    gsap.set(copies[0],{autoAlpha:1,y:0});
    gsap.set(backgrounds[0],{autoAlpha:1});

    /* Update accessibility only when the active scene changes. ScrollTrigger can
       call onUpdate many times per second; walking every scene on every tick
       creates avoidable DOM work on touch devices. */
    var activeScene=-1;
    /* Touch scrolling already has native momentum. A timed scrub adds a second
       animation delay, which can make the first story transition feel stuck.
       Keep direct scroll-to-animation sync on phones; retain the softer scrub
       on desktop where wheel/trackpad input benefits from it. */
    var touchScroll=window.matchMedia&&window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    var timeline=gsap.timeline({
      defaults:{ease:'none'},
      scrollTrigger:{
        trigger:story,
        start:'top top',
        end:'bottom bottom',
        scrub:touchScroll?true:0.65,
        invalidateOnRefresh:true,
        onUpdate:function(self){
          var active=Math.min(scenes.length-1,Math.round(self.progress*(scenes.length-1)));
          if(active!==activeScene){
            activeScene=active;
            scenes.forEach(function(scene,index){
              scene.setAttribute('aria-hidden',index===active?'false':'true');
            });
          }
          if(progressFill)progressFill.style.transform='scaleX('+Math.max(.08,self.progress)+')';
        }
      }
    });
    for(var i=1;i<scenes.length;i++){
      var at=i-1;
      timeline.to(copies[i-1],{autoAlpha:0,y:-30,duration:.28},at);
      timeline.to(backgrounds[i-1],{autoAlpha:0,duration:.46},at);
      timeline.fromTo(backgrounds[i],{autoAlpha:0},{autoAlpha:1,duration:.46},at);
      timeline.fromTo(copies[i],{autoAlpha:0,y:30},{autoAlpha:1,y:0,duration:.28},at+.12);
    }
    window.addEventListener('load',function(){window.ScrollTrigger.refresh()},{once:true});
    /* Coalesce resize bursts into one refresh per animation frame. */
    var refreshFrame=0;
    window.addEventListener('resize',function(){
      if(refreshFrame)return;
      refreshFrame=requestAnimationFrame(function(){
        refreshFrame=0;
        window.ScrollTrigger.refresh();
      });
    },{passive:true});
  }
  if(window.gsap&&window.ScrollTrigger)init();
  else window.addEventListener('load',init,{once:true});
})();
