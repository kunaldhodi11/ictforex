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
    var activeScene=-1;
    var setProgress=progressFill?gsap.quickSetter(progressFill,'scaleX'):null;

    /* Change the active copy only when a chapter boundary is crossed.
       Avoid scrubbing several text/backdrop tweens on every scroll frame;
       the cinematic video already performs its own scroll-linked seeking. */
    function setActiveScene(index,progress){
      index=Math.max(0,Math.min(scenes.length-1,index));
      if(index!==activeScene){
        activeScene=index;
        scenes.forEach(function(scene,i){
          var active=i===index;
          scene.classList.toggle('is-active',active);
          scene.setAttribute('aria-hidden',active?'false':'true');
        });
      }
      if(setProgress)setProgress(Math.max(.08,progress));
    }

    setActiveScene(0,0);
    window.ScrollTrigger.create({
      trigger:story,
      start:'top top',
      end:'bottom bottom',
      invalidateOnRefresh:true,
      onUpdate:function(self){
        var index=Math.min(scenes.length-1,Math.floor(self.progress*scenes.length));
        setActiveScene(index,self.progress);
      },
      onRefresh:function(self){
        var index=Math.min(scenes.length-1,Math.floor(self.progress*scenes.length));
        setActiveScene(index,self.progress);
      }
    });
  }
  if(window.gsap&&window.ScrollTrigger)init();
  else window.addEventListener('load',init,{once:true});
})();