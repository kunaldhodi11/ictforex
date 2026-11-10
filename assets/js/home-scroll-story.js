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

    var root=document.documentElement;
    var timeline=gsap.timeline({
      defaults:{ease:'none'},
      scrollTrigger:{
        trigger:story,
        start:'top top',
        end:'bottom bottom',
        scrub:0.65,
        invalidateOnRefresh:true,
        onUpdate:function(self){
          var active=Math.min(scenes.length-1,Math.round(self.progress*(scenes.length-1)));
          scenes.forEach(function(scene,index){
            scene.setAttribute('aria-hidden',index===active?'false':'true');
          });
          if(progressFill)gsap.set(progressFill,{scaleX:Math.max(.08,self.progress)});
          /* Slow continuous Ken-Burns push-in on the cinematic background video
             while this story section is in view, echoing the camera drift of
             premium editorial scroll sites. Resets once the section is left. */
          root.style.setProperty('--ifa-story-zoom',self.progress.toFixed(4));
        },
        onLeave:function(){root.style.setProperty('--ifa-story-zoom','1')},
        onEnterBack:function(){},
        onLeaveBack:function(){root.style.setProperty('--ifa-story-zoom','0')}
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
    window.addEventListener('resize',function(){window.ScrollTrigger.refresh()},{passive:true});
  }
  if(window.gsap&&window.ScrollTrigger)init();
  else window.addEventListener('load',init,{once:true});
})();
