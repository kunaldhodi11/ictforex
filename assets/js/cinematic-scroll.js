/* ICT Forex Academy — scroll-controlled cinematic background + lightweight reveals */
(function(){
  'use strict';
  var root=document.documentElement;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer=window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  var reveal=[];

  /* Keep the existing low-cost IntersectionObserver content reveals. */
  function addReveal(el){
    if(!el||el.dataset.ifaReveal==='true')return;
    el.dataset.ifaReveal='true';
    reveal.push(el);
  }
  var hero=document.querySelector('.hero');
  if(hero){
    var heroChapterHeading=hero.querySelector('.ifa-chapter-heading');
    if(heroChapterHeading){
      addReveal(heroChapterHeading);
      addReveal(hero.querySelector('.hero-market-visual'));
    }else{
      addReveal(hero.querySelector('.hero-badge'));
      addReveal(hero.querySelector('h1'));
      addReveal(hero.querySelector('.hero-sub'));
      addReveal(hero.querySelector('.hero-market-visual'));
      addReveal(hero.querySelector('.hero-btns'));
      addReveal(hero.querySelector('.trust-strip'));
    }
  }
  var factsBar=document.querySelector('.facts');
  addReveal(factsBar);
  if(factsBar)factsBar.querySelectorAll('.fact').forEach(addReveal);
  document.querySelectorAll('.section').forEach(function(section){
    var chapterHeading=section.querySelector('.ifa-chapter-heading');
    if(chapterHeading)addReveal(chapterHeading);
    else addReveal(section);
    addReveal(section.querySelector('.sec-hd'));
    addReveal(section.querySelector('.daily-tip-section'));
    section.querySelectorAll('.faq-item').forEach(addReveal);
  });
  document.querySelectorAll('.course-card').forEach(addReveal);
  addReveal(document.querySelector('.footer'));
  addReveal(document.querySelector('.footer-grid'));
  addReveal(document.querySelector('.footer-bottom'));


  /* Small stagger between sibling cards/facts, without a per-frame animation loop. */
  document.querySelectorAll('.course-grid').forEach(function(grid){
    Array.prototype.forEach.call(grid.querySelectorAll('.course-card'),function(card,index){
      card.style.setProperty('--ifa-stagger',Math.min(index,5)*85+'ms');
    });
  });
  if(factsBar){
    Array.prototype.forEach.call(factsBar.querySelectorAll('.fact'),function(fact,index){
      fact.style.setProperty('--ifa-stagger',index*90+'ms');
    });
  }

  if(!reduce&&'IntersectionObserver'in window){
    var revealObserver=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        entry.target.classList.toggle('ifa-in-view',entry.isIntersecting);
      });
    },{threshold:0.06,rootMargin:'-10% 0px -10% 0px'});
    root.classList.add('ifa-motion-ready');
    reveal.forEach(function(el){revealObserver.observe(el);});
  }else{
    reveal.forEach(function(el){el.classList.add('ifa-in-view');});
  }

  /* Add the presentation stylesheet without changing the existing page markup. */
  if(!document.querySelector('link[data-ifa-scroll-video-css]')){
    var css=document.createElement('link');
    css.rel='stylesheet';
    css.href='/assets/css/scroll-video-experience.css?v=20261106-2';
    css.setAttribute('data-ifa-scroll-video-css','');
    document.head.appendChild(css);
  }

  /* Homepage video path. Other page-specific paths will be configured as those pages are integrated. */
  var pageVideos={
    '/':'/assets/videos/home-journey.mp4',
    '/index.html':'/assets/videos/home-journey.mp4',
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
  var isHomeRoute=window.location.pathname==='/'||window.location.pathname==='/index.html';
  var videoPath=pageVideos[window.location.pathname]||'/assets/videos/home-journey.mp4';
  var scene=document.createElement('div');
  scene.className='ifa-scroll-scene'+(isHomeRoute?' ifa-home-journey-scene':'');
  scene.setAttribute('aria-hidden','true');
  var canvas=document.createElement('canvas');
  canvas.className='ifa-scroll-particles';
  var video=document.createElement('video');
  video.muted=true;
  video.defaultMuted=true;
  video.playsInline=true;
  video.setAttribute('playsinline','');
  video.setAttribute('muted','');
  /* The homepage MP4 is only ~8.8 MB. Preload it on capable connections so
     the first scroll does not compete with a late video download. Respect
     Save-Data and very slow mobile connections. */
  var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  var saveData=!!(connection&&connection.saveData);
  var slowConnection=!!(connection&&/^(slow-2g|2g)$/.test(connection.effectiveType||''));
  video.preload=(isHomeRoute&&!saveData&&!slowConnection)?'auto':'metadata';
  video.setAttribute('aria-hidden','true');
  video.disablePictureInPicture=true;
  var source=document.createElement('source');
  source.src=videoPath;
  source.type='video/mp4';
  video.appendChild(source);
  scene.appendChild(canvas);
  scene.appendChild(video);
  document.body.appendChild(scene);
  /* The cinematic MP4 is the homepage background; disable legacy canvas/map layers there. */
  if(isHomeRoute){
    ['global-map-bg','market-cinema-bg'].forEach(function(id){
      var legacy=document.getElementById(id);
      if(legacy)legacy.style.display='none';
    });
  }
  /* Keep all existing page content and controls above the fixed video layer. */
  Array.prototype.forEach.call(document.body.children,function(child){
    if(child===scene)return;
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

  /* Missing MP4 never blocks the site: show only a subtle particle-field fallback. */
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
  var particleRaf=0;
  function drawParticles(){
    particleRaf=0;
    if(!ctx||scene.classList.contains('is-video-ready')||document.hidden)return;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    particles.forEach(function(p){
      p.y-=p.v;
      p.x+=Math.sin((particleFrame+p.y)*.002)*.12;
      if(p.y<-8){p.y=window.innerHeight+8;p.x=Math.random()*window.innerWidth;}
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle='hsla('+p.hue+',72%,68%,'+p.a+')';ctx.fill();
    });
    particleFrame++;
    particleRaf=requestAnimationFrame(drawParticles);
  }
  function startParticles(){if(!particleRaf&&!document.hidden&&!scene.classList.contains('is-video-ready'))particleRaf=requestAnimationFrame(drawParticles);}
  resizeCanvas();
  startParticles();
  document.addEventListener('visibilitychange',function(){if(document.hidden){if(particleRaf)cancelAnimationFrame(particleRaf);particleRaf=0;}else startParticles();});
  window.addEventListener('resize',resizeCanvas,{passive:true});

  var duration=0,videoReady=false,lastTime=-1,scrollProgress=0,rafPending=false;
  var isHomePage=window.location.pathname==='/'||window.location.pathname==='/index.html';
  var seekPending=false,pendingTime=0,lastSeekAt=0,seekRaf=0;
  /* Limit decoder seeks and never queue a pile of stale timestamps while scrolling. */
  var minSeekInterval=40; // cap seek requests near 25 fps; newer requests replace stale ones
  function getProgress(){
    var max=Math.max(1,document.documentElement.scrollHeight-window.innerHeight);
    return Math.max(0,Math.min(1,window.scrollY/max));
  }
  function updateProgress(progress){
    scrollProgress=Math.max(0,Math.min(1,progress));
    scene.style.setProperty('--ifa-scroll-progress',scrollProgress.toFixed(4));
    if(isHomeRoute)video.style.transform='scale('+(1.015+scrollProgress*.075).toFixed(3)+')';
    var maxHeight=Math.max(0,rail.clientHeight-44);
    fill.style.height=(maxHeight*scrollProgress)+'px';
    if(!window.ScrollTrigger)sceneLabel.style.opacity=scrollProgress>.015?'.66':'0';
  }
  function applyPendingSeek(){
    if(!videoReady||!duration||!seekPending||video.seeking||!document.body.contains(video))return;
    var now=performance.now();
    var wait=minSeekInterval-(now-lastSeekAt);
    if(wait>0){
      if(!seekRaf)seekRaf=requestAnimationFrame(function(){seekRaf=0;applyPendingSeek();});
      return;
    }
    var target=Math.max(0,Math.min(duration-.05,pendingTime));
    if(lastTime>=0&&Math.abs(target-lastTime)<.04){seekPending=false;return;}
    try{
      video.currentTime=target;
      lastTime=target;
      lastSeekAt=now;
      seekPending=false;
    }catch(e){seekPending=true;}
  }
  function seekVideo(progress){
    updateProgress(progress);
    if(!videoReady||!duration)return;
    pendingTime=progress*duration;
    seekPending=true;
    applyPendingSeek();
  }
  function onNativeScroll(){
    if(rafPending)return;
    rafPending=true;
    requestAnimationFrame(function(){rafPending=false;seekVideo(getProgress());});
  }
  video.addEventListener('seeked',function(){
    if(seekPending)applyPendingSeek();
  });
  window.addEventListener('scroll',onNativeScroll,{passive:true});
  window.addEventListener('resize',function(){onNativeScroll();if(window.ScrollTrigger)window.ScrollTrigger.refresh();},{passive:true});

  video.addEventListener('loadedmetadata',function(){
    if(!isFinite(video.duration)||video.duration<=0)return;
    duration=video.duration;
    videoReady=true;
    video.pause();
    /* Metadata enables seeking, but wait for an actual decoded frame before
       fading the video in; this avoids revealing a black/empty video layer. */
    if(particleRaf)cancelAnimationFrame(particleRaf);
    particleRaf=0;
    sceneLabel.textContent='SCROLL TO EXPLORE';
    seekVideo(getProgress());
    if(window.ScrollTrigger)window.ScrollTrigger.refresh();
  });
  video.addEventListener('loadeddata',function(){
    if(videoReady){
      scene.classList.add('is-video-ready');
      seekVideo(getProgress());
    }
  });
  video.addEventListener('error',function(){
    videoReady=false;
    scene.classList.remove('is-video-ready');
    sceneLabel.textContent='VIDEO LOAD ERROR';
  });

  /* Start loading once. Calling load() a second time can reset metadata and interrupt seeking. */
  video.load();
  /* One initial sync is enough; duplicate RAFs only repeat the same seek. */
  requestAnimationFrame(onNativeScroll);
})();