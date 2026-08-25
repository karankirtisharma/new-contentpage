(async () => {
  const px = (el, k) => el ? Math.round(el.getBoundingClientRect()[k]) : null;
  const cs = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
  const vids = [...document.querySelectorAll('video')];
  const t0 = performance.now(); let f = 0;
  await new Promise(r => { const s = performance.now(); const l = () => { f++; performance.now() - s < 2000 ? requestAnimationFrame(l) : r(); }; requestAnimationFrame(l); });
  const fps = Math.round(f / ((performance.now() - t0) / 1000));
  const cv = document.querySelector('#scene3d canvas');
  return {
    fps,
    scale: window.__SCALE,
    canvasBacking: cv ? [cv.width, cv.height] : null,
    canvasCss: cv ? [Math.round(cv.getBoundingClientRect().width), Math.round(cv.getBoundingClientRect().height)] : null,
    videos: vids.map(v => ({ src: v.currentSrc.split('/').slice(-2).join('/'), playing: !v.paused, t: +v.currentTime.toFixed(2), dims: [v.videoWidth, v.videoHeight] })),
    chromeDesignPx: {
      brandTop: px(document.querySelector('.brand'), 'top') / window.__SCALE,
      iconsTop: px(document.querySelector('.icons'), 'top') / window.__SCALE,
      musicLeft: px(document.querySelector('.music'), 'left') / window.__SCALE,
      invertLeft: px(document.querySelector('#invertSite'), 'left') / window.__SCALE,
      nvBtnTop: (px(document.querySelector('#nvBtn'), 'top')) / window.__SCALE,
      sceneH: px(document.querySelector('#scene3d'), 'height') / window.__SCALE,
    },
    minimapFont: cs('#miniMap a', 'fontSize'),
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    activeMinimap: document.querySelector('#miniMap a.is-on')?.textContent,
    chromeIn: document.body.classList.contains('chrome-in'),
    brandText: document.querySelector('.brand')?.textContent.trim(),
  };
})()
