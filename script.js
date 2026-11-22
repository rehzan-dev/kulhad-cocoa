/* Kulhad & Cocoa — scroll-scrubbed video site.
   Every scene is a tall section with a sticky full-viewport video.
   Scroll progress drives the video frame by frame, so scrolling down
   plays it forward and scrolling up plays it in reverse.
   Desktop scrubs the <video> itself (currentTime). Phones can't seek
   video smoothly, so touch devices scrub pre-rendered frame-sheets
   drawn on a <canvas> instead — same motion, zero decoder stalls.
   Works without JS too: videos fall back to their poster stills. */

(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Live open / closed status (8:00 – 23:00) ---------- */
  var openDot = document.getElementById('openDot');
  var openText = document.getElementById('openText');
  if (openDot && openText) {
    var hour = new Date().getHours();
    var isOpen = hour >= 8 && hour < 23;
    openDot.classList.toggle('is-open', isOpen);
    openText.textContent = isOpen ? 'Open now · closes 11:00 PM' : 'Closed · opens 8:00 AM';
  }

  /* If GSAP failed to load (offline CDN), leave the page as readable
     static content: posters show, copy stays visible. */
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || reducedMotion) {
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Smooth scroll (Lenis), wired into GSAP's ticker ----------
     Desktop only: touch scrolling is already smooth natively, and Lenis
     adds nothing on a phone except another thing that can break scroll. */
  var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) document.documentElement.classList.add('touch-scrub');
  var lenis = null;
  if (typeof Lenis !== 'undefined' && !isTouch) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* Anchor links scroll through Lenis when available. */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0 });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  /* ---------- Header state + top progress bar ---------- */
  var header = document.getElementById('siteHeader');
  var progressBar = document.getElementById('progressBar');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: function (self) {
      if (progressBar) progressBar.style.transform = 'scaleX(' + self.progress + ')';
      if (header) header.classList.toggle('scrolled', self.scroll() > 60);
    }
  });

  /* ---------- Hero entrance ---------- */
  gsap.from('.hero-copy > *', {
    y: 44, opacity: 0, duration: 1.1, stagger: 0.12,
    ease: 'power3.out', delay: 0.25, clearProps: 'all'
  });
  gsap.from('.scroll-cue', { opacity: 0, duration: 1, delay: 1.2 });

  /* ---------- Scene counter ---------- */
  var sceneCurrent = document.getElementById('sceneCurrent');

  /* ---------- Canvas frame-sheets (touch devices) ----------
     Phones can't seek video smoothly, so on touch devices each scene
     scrubs pre-rendered frames instead: 10 fps JPEG sheets, 60 frames
     per sheet (10 x 6 grid, 480x270 each). Drawing a frame is instant,
     so scrubbing stays smooth with no decoder stalls. */
  var FRAMES_PER_SHEET = 60;
  var SHEET_COLS = 10;
  var FRAME_W = 480;
  var FRAME_H = 270;
  var FRAME_COUNTS = {
    'hero-chai': 102, 'chocolate-pour': 88, 'kolkata-chai': 119,
    'chocolate-swirl': 101, 'street-tea': 91, 'milk-tea': 102,
    'chocolate-mix': 105, 'noodle-stew': 101, 'aloo-paratha': 101,
    'spices': 79
  };

  /* One rAF loop drives every scene's scrub, so work stays in step
     with the display. Each scene registers an update(progress) — video
     seeking on desktop, canvas frame drawing on touch. Every scene is
     updated every frame: gating on ScrollTrigger's active state misses
     scenes at page load (onToggle never fires for the initial state)
     and scenes jumped past by a fast scroll, leaving them frozen. */
  var scrubStates = [];
  (function scrubLoop() {
    scrubStates.forEach(function (st) { st.update(st.progress); });
    requestAnimationFrame(scrubLoop);
  })();

  /* ---------- Per-scene: lazy media + scroll scrub + text ---------- */
  document.querySelectorAll('.scene').forEach(function (scene) {
    var video = scene.querySelector('video');
    var canvas = scene.querySelector('canvas');
    var copy = scene.querySelector('.scene-copy');
    var shade = scene.querySelector('.scene-shade');
    var isHero = scene.classList.contains('scene-hero');
    var clipName = video && video.dataset.src
      ? video.dataset.src.split('/').pop().replace('.mp4', '') : '';

    /* Desktop: lazy-load the video as the scene approaches. */
    if (!isTouch && video && video.dataset.src) {
      var loader = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !video.src) {
            video.src = video.dataset.src;
            video.preload = 'auto';
            video.load();
            loader.disconnect();
          }
        });
      }, { rootMargin: '100% 0px 100% 0px' });
      loader.observe(scene);
    }

    /* Touch: lazy-load this scene's frame-sheets instead. */
    var sheets = [];
    if (isTouch && canvas && clipName && FRAME_COUNTS[clipName]) {
      var totalSheets = Math.ceil(FRAME_COUNTS[clipName] / FRAMES_PER_SHEET);
      var sheetLoader = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          sheetLoader.disconnect();
          for (var s = 0; s < totalSheets; s++) {
            (function (idx) {
              var img = new Image();
              img.onload = function () { sheets[idx] = img; };
              img.src = 'frames/' + clipName + '-' + (idx + 1) + '.jpg';
            })(s);
          }
        });
      }, { rootMargin: '100% 0px 100% 0px' });
      sheetLoader.observe(scene);
    }

    /* The per-scene scrub update: video seek on desktop, frame draw
       on touch. Before a sheet loads, the canvas stays transparent
       and the video's poster shows through underneath. */
    var ctx = canvas ? canvas.getContext('2d') : null;
    var lastFrame = -1;
    function updateScene(progress) {
      if (isTouch) {
        if (!ctx || !clipName || !FRAME_COUNTS[clipName]) return;
        var total = FRAME_COUNTS[clipName];
        var frame = Math.min(total - 1, Math.floor(progress * total));
        if (frame === lastFrame) return;
        var sheet = sheets[Math.floor(frame / FRAMES_PER_SHEET)];
        if (!sheet) return;
        var inSheet = frame % FRAMES_PER_SHEET;
        ctx.drawImage(sheet,
          (inSheet % SHEET_COLS) * FRAME_W,
          Math.floor(inSheet / SHEET_COLS) * FRAME_H,
          FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
        lastFrame = frame;
        return;
      }
      if (!video || video.readyState < 1 || !video.duration || video.seeking) return;
      var target = progress * video.duration;
      if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
    }

    /* Scroll progress -> scrub. ScrollTrigger only records the target
       progress (smoothed, 0.5s catch-up); the rAF loop applies it.
       onToggle only moves the scene counter — the scrub itself must
       not depend on it (see the note on the rAF loop above). */
    var scrubState = { progress: 0, update: updateScene };
    scrubStates.push(scrubState);
    ScrollTrigger.create({
      trigger: scene,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: function (self) { scrubState.progress = self.progress; },
      onToggle: function (self) {
        if (self.isActive && sceneCurrent) sceneCurrent.textContent = scene.dataset.index;
      }
    });

    /* Cinematic settle: media eases from a slight zoom to full frame. */
    var zoomTarget = isTouch ? canvas : video;
    if (zoomTarget) {
      gsap.fromTo(zoomTarget, { scale: 1.12 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom bottom', scrub: true }
      });
    }

    /* Shade lifts as you scroll through the scene. */
    if (shade) {
      gsap.fromTo(shade, { opacity: 0.62 }, {
        opacity: 0.28, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom bottom', scrub: true }
      });
    }

    /* Copy: rises in early, drifts out late. The hero only drifts out —
       its entrance is the load animation above. */
    if (copy) {
      var tl = gsap.timeline({
        scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom bottom', scrub: true }
      });
      if (!isHero) {
        tl.fromTo(copy, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: 'power2.out' }, 0.03);
      }
      tl.to(copy, { y: -60, opacity: 0, duration: 0.18, ease: 'power2.in' }, 0.8);
    }

    /* Scene number fades with the copy. */
    var num = scene.querySelector('.scene-num');
    if (num && !isHero) {
      gsap.fromTo(num, { opacity: 0 }, {
        opacity: 1, duration: 0.15, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top top', end: '30% top', scrub: true }
      });
    }
  });

  /* ---------- Manifesto lines rise in ---------- */
  gsap.utils.toArray('.manifesto-line').forEach(function (line, i) {
    gsap.from(line, {
      y: 50, opacity: 0, duration: 0.9, ease: 'power3.out', delay: i * 0.05,
      scrollTrigger: { trigger: line, start: 'top 85%' }
    });
  });
  gsap.from('.manifesto-mark', {
    scale: 0.7, opacity: 0, duration: 1, ease: 'back.out(1.6)',
    scrollTrigger: { trigger: '.manifesto-inner', start: 'top 75%' }
  });

  /* ---------- Menu items stagger in ---------- */
  gsap.utils.toArray('.menu-item').forEach(function (item) {
    gsap.from(item, {
      y: 26, opacity: 0, duration: 0.7, ease: 'power2.out',
      scrollTrigger: { trigger: item, start: 'top 92%' }
    });
  });
  gsap.from('.menu-head > *', {
    y: 36, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out',
    scrollTrigger: { trigger: '.menu-head', start: 'top 85%' }
  });

  /* ---------- Footer ---------- */
  gsap.from('.footer-inner > *', {
    y: 30, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power2.out',
    scrollTrigger: { trigger: '.site-footer', start: 'top 85%' }
  });
})();
