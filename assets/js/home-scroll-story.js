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

    /* No per-frame DOM writes in the story text controller. The video has
       its own scroll-linked renderer; this controller only swaps copy when
       the reader crosses a chapter boundary. */
    function setActiveScene(index){
      index=Math.max(0,Math.min(scenes.length-1,index));
      if(index===activeScene)return;
      activeScene=index;
      scenes.forEach(function(scene,i){
        var active=i===index;
        scene.classList.toggle('is-active',active);
        scene.setAttribute('aria-hidden',active?'false':'true');
      });
      if(progressFill){
        progressFill.style.transform='scaleX('+Math.max(.08,(index+1)/scenes.length)+')';
      }
    }

    setActiveScene(0);
    window.ScrollTrigger.create({
      trigger:story,
      start:'top top',
      end:'bottom bottom',
      invalidateOnRefresh:true,
      onUpdate:function(self){
        var index=Math.min(scenes.length-1,Math.floor(self.progress*scenes.length));
        setActiveScene(index);
      },
      onRefresh:function(self){
        var index=Math.min(scenes.length-1,Math.floor(self.progress*scenes.length));
        setActiveScene(index);
      }
    });
  }
  if(window.gsap&&window.ScrollTrigger)init();
  else window.addEventListener('load',init,{once:true});
})();