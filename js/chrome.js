/* =====================================================================
   CHROME — 1024px design-canvas scaling.
   Scaling strategy follows the mirror: `zoom` on Chromium/Firefox desktop,
   `transform: scale()` on Safari and every touch device (WebKit bug 77998 /
   173841 desyncs `zoom` from getBoundingClientRect once the page scrolls).
   The overlay chrome this file used to drive (music switch, INVERT SITE, the
   brand typewriter, the minimap) is gone; only the scaling remains.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 1024 design canvas ---------------- */
  var PAGE_H = 624;                       /* #scene3d top:-5 + height:629 */
  var COARSE = matchMedia('(pointer: coarse)').matches;
  var IS_SAFARI = /^((?!chrome|crios|crmo|android).)*safari/i.test(navigator.userAgent) && !COARSE;
  var USE_TRANSFORM = IS_SAFARI || COARSE;

  var pageEl = document.getElementById('page');
  /* #fixedLayer went with the overlay chrome. Both branches below still scale
     #page identically; the layer is only touched when it is actually present. */
  var fixedEl = document.getElementById('fixedLayer');

  function rescale() {
    /* on touch devices innerWidth reports the auto-expanded visual viewport;
       clientWidth is the stable layout viewport */
    var VW = COARSE ? document.documentElement.clientWidth : window.innerWidth;
    var s = VW / 1024;
    window.__VW = VW;
    window.__SCALE = s;

    pageEl.style.height = PAGE_H + 'px';
    if (USE_TRANSFORM) {
      /* #page leaves the flow so a plain transform can scale it; body height is
         then set explicitly to the already-scaled footprint, which `zoom` used
         to do on its own. */
      pageEl.style.zoom = '';
      pageEl.style.position = 'absolute';
      pageEl.style.top = '0';
      pageEl.style.left = '0';
      pageEl.style.transform = 'scale(' + s + ')';
      document.body.style.position = 'relative';
      document.body.style.height = Math.ceil(PAGE_H * s) + 'px';
      if (fixedEl) { fixedEl.style.zoom = ''; fixedEl.style.transform = 'scale(' + s + ')'; }
    } else {
      pageEl.style.transform = '';
      pageEl.style.position = '';
      pageEl.style.top = '';
      pageEl.style.left = '';
      pageEl.style.zoom = s;
      document.body.style.position = '';
      document.body.style.height = '';
      if (fixedEl) { fixedEl.style.transform = ''; fixedEl.style.zoom = s; }
    }
  }
  rescale();
  addEventListener('resize', rescale);

  /* Kept as the documented hero:ready hook even though no chrome is left to
     stagger in — the scene reveal itself is the preloader hiding in hero.js.
     The timeout is a safety net so a WebGL failure never wedges the flag. */
  function revealChrome() {
    if (document.body.classList.contains('chrome-in')) return;
    document.body.classList.add('chrome-in');
  }
  window.addEventListener('hero:ready', revealChrome, { once: true });
  setTimeout(revealChrome, 4000);
})();
