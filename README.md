# Kulhad & Cocoa — Scroll-Scrubbed Video Site

A concept site for a fictional artisan chai & chocolate house in Karachi.
Built in the style of the viral TikTok scroll sites: every scene is a
full-screen video that is **scrubbed by your scroll** — scroll down and the
video plays forward, scroll up and it plays in reverse.

## How it works

- 10 scenes, each a tall section (`300vh`) with a sticky full-viewport video.
- Videos are paused (`muted`, no autoplay). GSAP ScrollTrigger maps scroll
  progress to `video.currentTime`, frame by frame.
- Lenis smooth-scrolls the page; video scale, shade and text are all driven
  by the same scroll progress (cinematic settle + crossfade feel).
- Videos lazy-load one viewport ahead via IntersectionObserver, so the page
  stays fast. Posters show while a clip loads (and if JS is off).
- Live "Open now / Closed" status in the footer from the real clock.

## Stack

- Plain HTML / CSS / JS — no build step, no backend.
- GSAP 3 + ScrollTrigger and Lenis smooth scroll, self-hosted in `vendor/`
  (no CDN dependency, so the scrub works even on a slow mobile network).
- Fonts: Fraunces + Manrope (Google Fonts).

## Files

- `index.html` — structure (10 scenes, manifesto band, menu, footer)
- `styles.css` — design system (cream / terracotta / espresso)
- `script.js` — scrub logic, lazy loading, animations
- `assets/logo-mark.png` — brand mark (kulhad cup + steam curl)
- `videos/` — 10 web-ready clips (H.264, 1080p, dense keyframes, faststart)
- `posters/` — middle-frame posters for each clip

## Videos

All footage is free Pexels stock (no attribution required), trimmed to
~10 seconds per scene and re-encoded for the web (CRF 23–28, keyframe
every 12 frames for smooth seeking).

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

## Deploy

Static hosting only — GitHub Pages, Netlify, or any static host.
No server code, no environment variables.
