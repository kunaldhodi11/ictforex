/* ICT Forex Academy — scroll-controlled cinematic background + lightweight reveals */
(function(){
  'use strict';
  var root=document.documentElement;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  var isWide=window.innerWidth>760&&finePointer;
  var reveal=[];

  /* Keep the existing low-cost IntersectionObserver content reveals. */
  function addReveal(el){
    if(!el||el.dataset.ifaReveal==='true')return;
    el.dataset.ifaReveal='true';
    reveal.push(el);
  }
  var hero=document.querySelector('.hero');
  if(hero){
    addReveal(hero.querySelector('.hero-badge'));
    addReveal(hero.querySelector('h1'));
    addReveal(hero.querySelector('.hero-sub'));
    addReveal(hero.querySelector('.hero-market-visual'));
    addReveal(hero.querySelector('.hero-btns'));
    addReveal(hero.querySelector('.trust-strip'));
  }
  addReveal(document.querySelector('.facts'));
  document.querySelectorAll('.section').forEach(function(section){
    addReveal(section.querySelector('.sec-hd'));
    addReveal(section.querySelector('.daily-tip-section'));
    section.querySelectorAll('.faq-item').forEach(addReveal);
  });
  document.querySelectorAll('.course-card').forEach(addReveal);
  addReveal(document.querySelector('.footer-grid'));
  addReveal(document.querySelector('.footer-bottom'));

  if(!reduce&&'IntersectionObserver'in window){
    var revealObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('ifa-in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    },{threshold:0.08,rootMargin:'0px 0px -3% 0px'});
    root.classList.add('ifa-motion-ready');
    reveal.forEach(function(el){revealObserver.observe(el);});
  }else{
    reveal.forEach(function(el){el.classList.add('ifa-in-view');});
  }

  /* Add the presentation stylesheet without changing the existing page markup. */
  if(!document.querySelector('link[data-ifa-scroll-video-css]')){
    var css=document.createElement('link');
    css.rel='stylesheet';
    css.href='/assets/css/scroll-video-experience.css';
    css.setAttribute('data-ifa-scroll-video-css','');
    document.head.appendChild(css);
  }

  /* Homepage video path. Other page-specific paths will be configured as those pages are integrated. */
  var pageVideos={
    '/':'/assets/videos/home-journey-test.mp4',
    '/index.html':'/assets/videos/home-journey-test.mp4',
    '/free-learning.html':'/assets/videos/free-course.mp4',
    '/vip-course.html':'/assets/videos/vip-academy.mp4',
    '/candlestick-patterns.html':'/assets/videos/candlesticks.mp4',
    '/support-resistance.html':'/assets/videos/support-resistance.mp4',
    '/price-action.html':'/assets/videos/price-action.mp4',
    '/trading-books.html':'/assets/videos/books.mp4',
    '/community.html':'/assets/videos/community.mp4',
    '/rules.html':'/assets/videos/trading-rules.mp4',
    '/about.html':'/assets/videos/about-journey.mp4'
  };
  var videoPath=pageVideos[window.location.pathname]||'/assets/videos/home-journey-test.mp4';
  var scene=document.createElement('div');
  scene.className='ifa-scroll-scene';
  scene.setAttribute('aria-hidden','true');
  var canvas=document.createElement('canvas');
  canvas.className='ifa-scroll-particles';
  var video=document.createElement('video');
  video.muted=true;
  video.defaultMuted=true;
  video.playsInline=true;
  video.setAttribute('playsinline','');
  video.setAttribute('muted','');
  video.preload=isWide&&!((navigator.connection||{}).saveData)?'auto':'metadata';
  video.setAttribute('aria-hidden','true');
  video.disablePictureInPicture=true;
  var source=document.createElement('source');
  source.src=videoPath;
  source.type='video/mp4';
  video.appendChild(source);
  scene.appendChild(canvas);
  scene.appendChild(video);
  document.body.appendChild(scene);
  /* Keep all existing page content and controls above the fixed video layer. */
  Array.prototype.forEach.call(document.body.children,function(child){
    if(child===scene)return;
    if(child.id==='bull-bear-background'){child.style.zIndex='0';return;}
    var computed=window.getComputedStyle(child);
    if(computed.position==='static')child.style.position='relative';
    if(computed.zIndex==='auto')child.style.zIndex='2';
  });

  /* A slim chapter rail lets visitors pause, orient themselves and jump to a section. */
  var chapterTargets=[];
  if(hero)chapterTargets.push(hero);
  if(document.querySelector('.facts'))chapterTargets.push(document.querySelector('.facts'));
  document.querySelectorAll('main > section,main section[id],main > div.section').forEach(function(el){chapterTargets.push(el);});
  var footer=document.querySelector('.footer')||document.querySelector('footer');
  if(footer)chapterTargets.push(footer);
  chapterTargets=chapterTargets.filter(function(el,i,arr){return el&&arr.indexOf(el)===i;});
  function chapterName(el,index){
    var heading=el.querySelector('h1,h2,h3,[aria-label]');
    var raw=heading?(heading.textContent||heading.getAttribute('aria-label')||''):'';
    raw=raw.replace(/\s+/g,' ').trim();
    return raw?raw.slice(0,28).toUpperCase():('CHAPTER '+(index+1));
  }
  var chapterNames=chapterTargets.map(chapterName);
  chapterTargets.forEach(function(el,i){el.setAttribute('data-ifa-chapter',String(i));});
  var rail=document.createElement('nav');
  rail.className='ifa-scroll-progress';
  rail.setAttribute('aria-label','Page chapters');
  var track=document.createElement('span');track.className='ifa-scroll-progress-track';
  var fill=document.createElement('span');fill.className='ifa-scroll-progress-fill';
  rail.appendChild(track);rail.appendChild(fill);
  var dots=[];
  chapterTargets.forEach(function(target,i){
    var dot=document.createElement('button');
    dot.type='button';dot.className='ifa-scroll-dot';
    dot.setAttribute('aria-label','Go to '+(chapterNames[i]||('chapter '+(i+1))));
    dot.addEventListener('click',function(){
      if(window.ifaLenis){window.ifaLenis.scrollTo(target,{offset:-24,duration:1.05});}
      else target.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
    });
    rail.appendChild(dot);dots.push(dot);
  });
  document.body.appendChild(rail);
  var sceneLabel=document.createElement('div');
  sceneLabel.className='ifa-scroll-scene-label';
  sceneLabel.textContent='SCROLL TO EXPLORE';
  document.body.appendChild(sceneLabel);

  var activeChapter=0;
  function setActive(index){
    if(index<0||index>=dots.length||index===activeChapter)return;
    activeChapter=index;
    dots.forEach(function(dot,i){if(i===index)dot.setAttribute('aria-current','step');else dot.removeAttribute('aria-current');});
    sceneLabel.textContent=chapterNames[index]||'EXPLORE';
  }
  if(dots.length){dots[0].setAttribute('aria-current','step');}
  if('IntersectionObserver'in window&&chapterTargets.length){
    var chapterObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          var index=chapterTargets.indexOf(entry.target);
          if(index>=0)setActive(index);
        }
      });
    },{rootMargin:'-38% 0px -48% 0px',threshold:0});
    chapterTargets.forEach(function(el){chapterObserver.observe(el);});
  }

  /* Missing MP4 never blocks the site: reveal the existing bull/bear artwork plus a subtle particle field. */
  var ctx=canvas.getContext('2d');
  var particles=[];
  var particleFrame=0;
  function resizeCanvas(){
    if(!ctx)return;
    var dpr=Math.min(window.devicePixelRatio||1,1.5);
    canvas.width=Math.round(window.innerWidth*dpr);
    canvas.height=Math.round(window.innerHeight*dpr);
    canvas.style.width=window.innerWidth+'px';
    canvas.style.height=window.innerHeight+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    var count=window.innerWidth<600?22:42;
    particles=[];
    for(var i=0;i<count;i++)particles.push({
      x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,
      r:1+Math.random()*2.2,v:.12+Math.random()*.32,a:.12+Math.random()*.28,
      hue:Math.random()>.55?155:8
    });
  }
  function drawParticles(){
    if(!ctx||scene.classList.contains('is-video-ready'))return;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    particles.forEach(function(p){
      p.y-=p.v;
      p.x+=Math.sin((particleFrame+p.y)*.002)*.12;
      if(p.y<-8){p.y=window.innerHeight+8;p.x=Math.random()*window.innerWidth;}
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='hsla('+p.hue+',72%,68%,'+p.a+')';ctx.fill();
    });
    particleFrame++;
    requestAnimationFrame(drawParticles);
  }
  resizeCanvas();
  drawParticles();
  window.addEventListener('resize',resizeCanvas,{passive:true});

  var duration=0,videoReady=false,lastTime=-1,scrollProgress=0,rafPending=false;
  function getProgress(){
    var max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    return Math.max(0,Math.min(1,window.scrollY/max));
  }
  function updateProgress(progress){
    scrollProgress=Math.max(0,Math.min(1,progress));
    var maxHeight=Math.max(0,rail.clientHeight-44);
    fill.style.height=(maxHeight*scrollProgress)+'px';
    if(!window.ScrollTrigger)sceneLabel.style.opacity=scrollProgress>.015?'.66':'0';
  }
  function seekVideo(progress){
    updateProgress(progress);
    if(!videoReady||!duration||reduce)return;
    var target=Math.max(0,Math.min(duration-.04,progress*duration));
    if(lastTime<0||Math.abs(target-lastTime)>.045){
      try{video.currentTime=target;lastTime=target;}catch(e){}
    }
  }
  function onNativeScroll(){
    if(rafPending)return;
    rafPending=true;
    requestAnimationFrame(function(){rafPending=false;seekVideo(getProgress());});
  }
  window.addEventListener('scroll',onNativeScroll,{passive:true});
  window.addEventListener('resize',function(){onNativeScroll();if(window.ScrollTrigger)window.ScrollTrigger.refresh();},{passive:true});

  video.addEventListener('loadedmetadata',function(){
    if(!isFinite(video.duration)||video.duration<=0)return;
    duration=video.duration;
    videoReady=true;
    video.pause();
    scene.classList.add('is-video-ready');
    sceneLabel.textContent='SCROLL TO EXPLORE';
    seekVideo(getProgress());
    if(window.ScrollTrigger)window.ScrollTrigger.refresh();
  });
  video.addEventListener('loadeddata',function(){if(videoReady)scene.classList.add('is-video-ready');});
  video.addEventListener('error',function(){
    videoReady=false;
    scene.classList.remove('is-video-ready');
    scene.style.background='transparent';
    video.remove();
    sceneLabel.textContent='EXPLORE ICTFOREX';
  });
  video.load();

  /* Load animation libraries progressively. Native scroll + direct seeking remain the fallback. */
  function loadScript(src){
    return new Promise(function(resolve,reject){
      var s=document.createElement('script');s.src=src;s.async=true;
      s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
    });
  }
  function initGsap(){
    if(!window.gsap||!window.ScrollTrigger)return;
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.ScrollTrigger.create({
      trigger:document.documentElement,start:'top top',end:'bottom bottom',
      onUpdate:function(self){seekVideo(self.progress);}
    });
    window.ScrollTrigger.refresh();
    /* Lenis is enabled on desktop only; touch scrolling stays native for reliability. */
    if(isWide&&!reduce&&window.Lenis){
      try{
        var lenis=new window.Lenis({duration:1.05,smoothWheel:true,gestureOrientation:'vertical',wheelMultiplier:.9});
        window.ifaLenis=lenis;
        lenis.on('scroll',window.ScrollTrigger.update);
        window.gsap.ticker.add(function(time){lenis.raf(time*1000);});
        window.gsap.ticker.lagSmoothing(0);
      }catch(e){window.ifaLenis=null;}
    }
  }
  if(!reduce){
    loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js')
      .then(function(){return loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js');})
      .then(function(){return loadScript('https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js').catch(function(){});})
      .then(initGsap).catch(function(){onNativeScroll();});
  }else{
    scene.style.display='none';
    onNativeScroll();
  }
  /* Ensure the first visible frame matches the initial scroll position. */
  requestAnimationFrame(onNativeScroll);
})();