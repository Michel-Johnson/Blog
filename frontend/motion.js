(() => {
  const svg = document.querySelector('.logo-svg');
  const skipButton = document.querySelector('.skip-intro');
  if (!svg) return;

  const duration = 5200;
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const cssVars = getComputedStyle(document.documentElement);
  const cssColor = (name, fallback) => cssVars.getPropertyValue(name).trim() || fallback;
  const bg = cssColor('--intro-bg', '#ffffff');
  const ink = cssColor('--intro-ink', '#09090b');
  const red = cssColor('--intro-red', '#f04438');
  const liftY = -61;
  const mobileScale = isCoarsePointer ? 1.42 : 1;
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const eraseStart = 0.34;
  const eraseDuration = 0.10;
  const questionD = 'M499.3 487.0 L499.3 481.0 C499.3 470.2 501.8 463.2 509.9 454.3 C518.8 444.4 531.3 436.1 532.7 419.7 C534.5 399.0 520.4 385.0 500.0 385.0 C474.0 385.0 457.8 402.2 457.1 424.6';
  svg.style.backgroundColor = bg;
  svg.style.color = ink;
  svg.style.forcedColorAdjust = 'none';
  svg.style.filter = 'none';
  svg.style.mixBlendMode = 'normal';
  svg.style.webkitPrintColorAdjust = 'exact';
  svg.style.printColorAdjust = 'exact';
  svg.innerHTML = `
    <defs>
      <clipPath id="canvas-i-clip" clipPathUnits="userSpaceOnUse"><rect x="220" y="520" width="80" height="104" /></clipPath>
    </defs>
    <rect class="canvas-bg" width="1000" height="1000" fill="${bg}" style="forced-color-adjust:none" />
    <g class="canvas-logo-scale">
    <g class="canvas-word" aria-label="insight">
      <g class="canvas-i"><text x="245" y="596" clip-path="url(#canvas-i-clip)">i</text></g>
      <g class="canvas-rest"><text x="285" y="596">nsight</text></g>
    </g>
    <g class="canvas-question-wrap"><path class="canvas-question" d="${questionD}" /></g>
    <circle class="canvas-dot" cx="500" cy="540" r="14.8" />
    </g>
  `;
  const logoScale = svg.querySelector('.canvas-logo-scale');
  const questionWrap = svg.querySelector('.canvas-question-wrap');
  const question = svg.querySelector('.canvas-question');
  const dot = svg.querySelector('.canvas-dot');
  const iGroup = svg.querySelector('.canvas-i');
  const rest = svg.querySelector('.canvas-rest');
  const qLen = question.getTotalLength();
  const finalDotX = 278;

  const frames = {
    initial: 0,
    lift: 0.30,
    'erase-start': 0.35,
    'erase-lower': 0.41,
    'erase-mid': 0.47,
    'erase-top': 0.54,
    'after-erase': 0.64,
    stem: 0.75,
    final: 1,
  };

  function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }
  function smooth(x) {
    const t = clamp(x);
    return t * t * (3 - 2 * t);
  }
  function easeOut(x) { return 1 - Math.pow(1 - clamp(x), 3); }

  function setStyles() {
    logoScale.style.transformBox = 'view-box';
    logoScale.style.transformOrigin = '500px 520px';
    logoScale.style.transform = `scale(${mobileScale})`;
    question.setAttribute('fill', 'none');
    question.setAttribute('stroke', ink);
    question.setAttribute('stroke-width', '21');
    question.setAttribute('stroke-linecap', 'round');
    question.setAttribute('stroke-linejoin', 'round');
    question.style.shapeRendering = 'geometricPrecision';
    question.style.forcedColorAdjust = 'none';
    question.style.willChange = 'stroke-dasharray, stroke-dashoffset, opacity';
    dot.setAttribute('fill', red);
    dot.style.forcedColorAdjust = 'none';
    svg.querySelectorAll('.canvas-word text').forEach((t) => {
      t.setAttribute('fill', ink);
      t.style.forcedColorAdjust = 'none';
      t.style.fontFamily = '"Insight Intro Fixed", "Helvetica Neue", Helvetica, Arial, Inter, sans-serif';
      t.style.fontSize = '170px';
      t.style.fontStyle = 'italic';
      t.style.fontWeight = '800';
      t.style.letterSpacing = '-11px';
      t.style.dominantBaseline = 'alphabetic';
      t.style.textRendering = 'geometricPrecision';
    });
  }

  function render(p) {
    const lift = smooth((p - 0.20) / 0.065);
    const y = liftY * lift;

    const erase = clamp((p - eraseStart) / eraseDuration);
    const remain = clamp(1 - erase);
    questionWrap.style.transformBox = 'view-box';
    questionWrap.style.transformOrigin = '500px 528px';
    questionWrap.style.transform = `translateY(${y}px)`;
    questionWrap.style.opacity = remain > 0.001 ? '1' : '0';
    question.style.strokeDasharray = `${qLen * remain} ${qLen}`;
    question.style.strokeDashoffset = `${-qLen * erase}`;

    const dotShift = p < 0.425 ? 0 : (finalDotX - 500) * smooth((p - 0.425) / 0.155);
    const dotR = p < 0.47 ? 14.8 : 14.8;
    const dotX = p < 0.30 ? 500 : 500 + dotShift;
    const dotY = p < 0.30 ? 540 + y : 540 + liftY;
    dot.setAttribute('r', dotR.toFixed(3));
    dot.setAttribute('cx', dotX.toFixed(3));
    dot.setAttribute('cy', dotY.toFixed(3));
    dot.style.transform = 'none';

    const iReveal = clamp((p - eraseStart) / eraseDuration);
    const iMove = smooth((p - 0.425) / 0.155);
    iGroup.style.opacity = p < eraseStart ? '0' : '1';
    iGroup.style.clipPath = `inset(${(1 - iReveal) * 100}% 0 0 0)`;
    iGroup.style.transformBox = 'view-box';
    iGroup.style.transformOrigin = '500px 500px';
    iGroup.style.transform = `translateX(${226 * (1 - iMove)}px) skewX(${10 * (1 - iMove)}deg)`;

    const restReveal = easeOut((p - 0.535) / 0.15);
    rest.style.opacity = p < 0.535 ? '0' : '1';
    rest.style.clipPath = `inset(0 ${(1 - restReveal) * 100}% 0 0)`;
  }

  let rafId = 0;
  let introFinished = false;
  const introExitDelay = 180;
  const shouldLoop = new URLSearchParams(window.location.search).get('loop') === '1';

  function completeIntro() {
    if (introFinished) return;
    introFinished = true;
    if (rafId) cancelAnimationFrame(rafId);
    render(1);
    document.body.classList.remove('intro-running');
    document.body.classList.add('intro-done');
    window.dispatchEvent(new CustomEvent('insight:intro-complete'));
  }

  let startTime = performance.now();

  function frame(now) {
    const elapsed = now - startTime;
    if (shouldLoop) {
      render((elapsed % duration) / duration);
      rafId = requestAnimationFrame(frame);
      return;
    }
    render(clamp(elapsed / duration));
    if (elapsed >= duration + introExitDelay) {
      completeIntro();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function startIntro() {
    startTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  setStyles();
  skipButton?.addEventListener('click', completeIntro);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') completeIntro();
  });
  window.addEventListener('wheel', completeIntro, { once: true, passive: true });
  window.addEventListener('touchstart', completeIntro, { once: true, passive: true });

  const params = new URLSearchParams(window.location.search);
  const previewHome = params.get('home') === '1';
  const allowFrameDebug =
    params.get('debug') === '1' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '::1';
  if (previewHome) {
    document.body.classList.remove('intro-running');
    document.body.classList.add('intro-done', 'preview-home');
    render(1);
    svg.closest('.intro-stage')?.setAttribute('hidden', '');
    return;
  }
  const forcedFrame = params.get('frame');
  const forcedT = params.has('t') ? Number(params.get('t')) : NaN;
  if (allowFrameDebug && frames[forcedFrame] !== undefined) {
    document.documentElement.dataset.frame = forcedFrame;
    render(frames[forcedFrame]);
  } else if (allowFrameDebug && Number.isFinite(forcedT)) {
    render(clamp(forcedT));
  } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    completeIntro();
  } else {
    const fontReady = document.fonts?.load
      ? document.fonts.load('italic 800 170px \"Insight Intro Fixed\"')
      : Promise.resolve();
    fontReady.then(startIntro, startIntro);
  }
})();
