/* Kulhad & Cocoa — scroll-scrubbed video site.
   Every scene is a tall section with a sticky full-viewport video.
   Scroll progress drives video.currentTime frame by frame, so scrolling
   down plays the video forward and scrolling up plays it in reverse.
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

  /* One rAF loop does all video seeking, so a phone never gets more
     than one seek per frame per video — and never a new seek while
     the previous one is still landing. */
  var scrubStates = [];
  (function seekLoop() {
    scrubStates.forEach(function (st) {
      var v = st.video;
      if (!st.active || !v || v.readyState < 1 || !v.duration || v.seeking) return;
      var target = st.progress * v.duration;
      if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
    });
    requestAnimationFrame(seekLoop);
  })();

  /* ---------- Per-scene: lazy video + scroll scrub + text ---------- */
  document.querySelectorAll('.scene').forEach(function (scene) {
    var video = scene.querySelector('video');
    var copy = scene.querySelector('.scene-copy');
    var shade = scene.querySelector('.scene-shade');
    var isHero = scene.classList.contains('scene-hero');

    /* Lazy-load the video as the scene approaches (one viewport ahead). */
    if (video && video.dataset.src) {
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

    /* Scroll progress -> video time. ScrollTrigger only records the
       target progress (smoothed, 0.5s catch-up); the actual seeking
       happens in the rAF loop above. Seeking on every scroll tick
       overwhelms phone decoders and the video freezes. */
    var scrubState = { video: video, progress: 0, active: false };
    scrubStates.push(scrubState);
    ScrollTrigger.create({
      trigger: scene,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: function (self) { scrubState.progress = self.progress; },
      onToggle: function (self) {
        scrubState.active = self.isActive;
        if (self.isActive && sceneCurrent) sceneCurrent.textContent = scene.dataset.index;
      }
    });

    /* Cinematic settle: video eases from a slight zoom to full frame. */
    if (video) {
      gsap.fromTo(video, { scale: 1.12 }, {
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
