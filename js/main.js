// Axion Pulse — sitio, muestra 1.
// Patrón: casi todo el scroll motion es un listener (rAF) que escribe progresos 0..1
// en variables CSS; GSAP hace los reveals de una vez, el intro y dos pins.
import { initGL } from './gl.js';
import { initSound } from './sound.js';

const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });
gsap.defaults({ ease: 'power4.out' });

const html = document.documentElement;
html.classList.add('js');
const reduce = html.classList.contains('reduce-motion');
const isMobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const desktop = () => innerWidth >= 900;
let VH = innerHeight;
let REM = parseFloat(getComputedStyle(html).fontSize);

/* =========================================================================
   Text splitting
   ========================================================================= */
function splitWords(el, mode = 'mask') {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  const out = [];
  const walk = node => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          if (mode === 'mask') {
            const w = document.createElement('span'); w.className = 'mask-word'; w.setAttribute('aria-hidden', 'true');
            const inner = document.createElement('span'); inner.className = 'mask-word__inner'; inner.textContent = part;
            w.appendChild(inner); frag.appendChild(w); out.push(inner);
          } else {
            const w = document.createElement('span'); w.className = 'scroll-word'; w.setAttribute('aria-hidden', 'true');
            w.textContent = part; frag.appendChild(w); out.push(w);
          }
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        walk(child);
      }
    });
  };
  walk(el);
  const sr = document.createElement('span'); sr.className = 'visually-hidden'; sr.textContent = text;
  el.appendChild(sr);
  return out;
}

function groupLines(inners) {
  const lines = [];
  let lastTop = null;
  inners.forEach(inner => {
    const top = Math.round((inner.parentElement || inner).getBoundingClientRect().top);
    if (lastTop === null || Math.abs(top - lastTop) > 4) { lines.push([]); lastTop = top; }
    lines[lines.length - 1].push(inner);
  });
  return lines;
}

function revealLines(lines, { delay = 0, duration = 1.1, stagger = .08 } = {}) {
  const tl = gsap.timeline({ delay });
  lines.forEach((line, i) => tl.fromTo(line, { yPercent: 115 }, { yPercent: 0, duration, ease: 'power4.out' }, i * stagger));
  return tl;
}

/* =========================================================================
   Lenis
   ========================================================================= */
let lenis = null;
if (!reduce && window.Lenis) {
  lenis = new window.Lenis({
    duration: 1.2,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    syncTouch: false,
    virtualScroll: e => {
      if (e.event && e.event.type === 'wheel') {
        e.deltaX = clamp(e.deltaX, -100, 100);
        e.deltaY = clamp(e.deltaY, -100, 100);
      }
      return true;
    },
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  lenis.stop();
}
const scrollToTarget = (target, duration = 1.6) => {
  if (lenis) lenis.scrollTo(target, { duration });
  else if (typeof target === 'number') scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
  else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
};
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  e.preventDefault();
  closeMenu();
  if (id === '#top' || id === '#') { scrollToTarget(0, 2); return; }
  const el = document.querySelector(id);
  if (el) scrollToTarget(el);
});
history.scrollRestoration = 'manual';
scrollTo(0, 0);

/* =========================================================================
   WebGL
   ========================================================================= */
let gl = null;
try { gl = initGL($('.webgl'), { mobile: isMobileUA, reduce }); } catch (err) { console.warn('WebGL off', err); }
const sound = initSound({ button: $('.frame__bpm'), audio: $('.site-track'), reduce });
if (gl) gl.setAudio(sound);
if (gl && new URLSearchParams(location.search).has('debug')) window.axionGL = gl;   // ?debug: inspect the orb from the console

/* =========================================================================
   Letter roll
   ========================================================================= */
function letterRoll(el) {
  const txt = el.textContent;
  el.setAttribute('aria-label', txt);
  el.textContent = '';
  [...txt].forEach((ch, i) => {
    const c = document.createElement('span'); c.className = 'letter-roll__char'; c.setAttribute('aria-hidden', 'true');
    const t = document.createElement('span'); t.className = 'letter-roll__track';
    t.style.setProperty('--i', i);
    t.textContent = ch === ' ' ? ' ' : ch;
    t.dataset.char = ch === ' ' ? ' ' : ch;
    c.appendChild(t); el.appendChild(c);
  });
  const n = txt.length;
  const roll = () => {
    if (el.classList.contains('is-rolling') || html.classList.contains('nav-collapsed') && !el.closest('.header__menu')) return;
    el.classList.add('is-rolling');
    setTimeout(() => el.classList.remove('is-rolling'), 600 + (n - 1) * 35);
  };
  (el.closest('a,button') || el).addEventListener('mouseenter', roll);
}
$$('[data-letter-roll]').forEach(letterRoll);
const navLinks = $$('.header__nav-link');
navLinks.forEach((link, i) => link.style.setProperty('--d', `${(navLinks.length - 1 - i) * 70}ms`));

/* =========================================================================
   Counters (rolling digits)
   ========================================================================= */
function buildCounter(el) {
  const n = +el.dataset.count;
  const digits = document.createElement('span'); digits.className = 'counter__digits';
  for (let i = 1; i <= n; i++) { const s = document.createElement('span'); s.textContent = String(i).padStart(2, '0'); digits.appendChild(s); }
  const total = document.createElement('span'); total.className = 'counter__total'; total.textContent = '/' + String(n).padStart(2, '0');
  el.append(digits, total);
  return { el, digits, n, x: 0, v: 0, target: 0 };
}
function stepSpring(s, dt) {
  const w = 4.7 / .7;
  const a = w * w * (s.target - s.x) - 2 * w * s.v;
  s.v += a * dt; s.x += s.v * dt;
  if (Math.abs(s.target - s.x) < 5e-4 && Math.abs(s.v) < .005) { s.x = s.target; s.v = 0; }
  s.el.style.setProperty('--pos', s.x.toFixed(4));
}

/* =========================================================================
   Sections: setup
   ========================================================================= */
const hero = $('.hero');
const heroTitle = $('.hero__title');
const heroLoc = $('.hero__location');
const heroTitleWords = splitWords(heroTitle);
const heroLocWords = splitWords(heroLoc);

const about = $('.about');
about.dataset.revealLine = '0.05';

/* ---------- triangle mosaic: how the dark section arrives ----------
   Each 30px triangle grows from its own centre when a noisy front, centred on the
   viewport, reaches it. Triangles at the front flicker in dark greys and fade out; a few
   stay as outlines; the revealed interior (transparent, like the other dark sections)
   keeps faint dotted grid lines until the mosaic completes. */
const mosaic = (() => {
  const canvas = $('.about__mosaic');
  const ctx = canvas.getContext('2d');
  let tris = [], maxD = 1, W = 0, H = 0, q = 0, raf = 0, state = 'hidden';
  const BAND = 150;            // px of the growing front
  const reachOf = p => p * (maxD + BAND + 60) - 30;
  function build() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tris = buildTriangles(W, H, 30, W / 2, H / 2).map(t => ({ ...t, h2: (t.h * 7.13) % 1, h3: (t.h * 3.71) % 1 }));
    maxD = Math.max(...tris.map(t => t.d));
  }
  function draw(time) {
    const t = time / 1000;
    const reach = reachOf(q);
    ctx.clearRect(0, 0, W, H);
    const grid = .14 * (1 - smooth(clamp((q - .55) / .45)));
    ctx.setLineDash([1.5, 3]);
    for (const tr of tris) {
      const s = clamp((reach - tr.d - (tr.h - .5) * 60) / BAND);
      if (s <= 0) continue;
      if (s >= 1) {
        if (grid > .005) drawTri(ctx, tr, 1, null, `rgba(250,250,250,${(grid * .7).toFixed(3)})`);
        continue;
      }
      const grow = 1 - Math.pow(1 - s, 3);
      const tw = .5 + .5 * Math.sin(t * (5 + 4 * tr.h) + 6.283 * tr.h2);
      const v = Math.round(18 + (1 - s) * (20 + 70 * tw * (.4 + .6 * tr.h3)));
      const a = (1 - s * s).toFixed(3);                        // the front fades into the dark interior
      if (tr.h < .1 && s < .85) {
        ctx.setLineDash([]);
        drawTri(ctx, tr, grow, null, `rgba(250,250,250,${(.35 + .5 * tw).toFixed(3)})`);
        ctx.setLineDash([1.5, 3]);
      } else {
        drawTri(ctx, tr, grow, `rgba(${v},${v},${v},${a})`, null);
      }
    }
    ctx.setLineDash([]);
  }
  function loop(time) {
    draw(time);
    raf = state === 'running' ? requestAnimationFrame(loop) : 0;
  }
  build();
  addEventListener('resize', build);
  return {
    setProgress(p) {
      q = p;
      const next = p <= 0 ? 'hidden' : p >= 1 ? 'done' : 'running';
      about.classList.toggle('is-mosaic', next !== 'done');
      about.style.setProperty('--reach', `${p <= 0 ? 0 : Math.max(0, reachOf(p) + 40).toFixed(1)}px`);
      about.style.setProperty('--cy', `${(H / 2).toFixed(1)}px`);
      if (next === state) return;
      state = next;
      if (state === 'running' && !raf) raf = requestAnimationFrame(loop);
      if (state !== 'running') ctx.clearRect(0, 0, W, H);
    },
  };
})();
const aboutWords = splitWords($('[data-scroll-words]'), 'lit');

const flow = $('.flow');
const flowPin = $('.flow__pin');
const flowTrack = $('.flow__track');
const flowSteps = $$('.flow-step', flowTrack);
const flowRealSteps = flowSteps.filter(s => !s.classList.contains('flow-step--cta'));
flowSteps.forEach(step => $$('.flow-step__tags span', step).forEach((s, k) => {
  s.innerHTML = `<i>${s.textContent}</i>`; s.style.setProperty('--k', k);
}));
const flowCounter = buildCounter($('.flow__counter'));

const servicesCounter = buildCounter($('.services__counter'));
const services = $$('.service');
const ticks = $('.services__ticks');
services.forEach(() => ticks.appendChild(document.createElement('span')));
const tickEls = $$('span', ticks);
const servicesAside = $('.services__aside');
let serviceActive = 0;
const peek = services.map(() => 0);
let hovered = -1;
services.forEach((s, i) => {
  s.addEventListener('mouseenter', () => { hovered = i; });
  s.addEventListener('mouseleave', () => { if (hovered === i) hovered = -1; });
});
function measureFold() {
  let max = 0;
  services.forEach(s => { max = Math.max(max, $('.service__body', s).scrollHeight); });
  $('.services__list').style.setProperty('--fold-h', max + 'px');
}

const stage = $('.product-stage');
const cards = $$('.product-panel', stage);
stage.style.setProperty('--cards', cards.length);
cards.forEach((c, i) => c.style.setProperty('--i', i));
const cardWords = cards.map(c => splitWords($('[data-arrive-words]', c)));
function assignRows() {
  cardWords.forEach(words => groupLines(words).forEach((line, r) => line.forEach(w => w.style.setProperty('--row', r))));
}

const rule0 = $('.rule0');
const rule0Stage = $('.rule0__stage');
const rule0Name = $('.rule0__name');
$$('[data-chars]', rule0).forEach(word => {
  const txt = word.textContent; word.textContent = ''; word.setAttribute('aria-label', txt);
  [...txt].forEach((ch, i) => { const c = document.createElement('span'); c.className = 'rule0__char'; c.style.setProperty('--i', i); c.textContent = ch; c.setAttribute('aria-hidden', 'true'); word.appendChild(c); });
});
const rule0Statement = $('[data-lit-words]');
const rule0Words = splitWords(rule0Statement, 'lit');

const footer = $('.footer');
footer.dataset.revealLine = '0.3';

/* =========================================================================
   Reveal system
   ========================================================================= */
const revealSections = $$('.home-section, .footer').map(section => {
  const headings = $$('.home-section__heading, .footer__cta', section).filter(h => h.dataset.reveal !== 'none' && !h.classList.contains('rule0__name'));
  const headingWords = headings.map(h => splitWords(h));
  const fades = $$('[data-reveal="fade"]', section);
  const rows = $$('[data-reveal="row"]', section);
  return { section, headingWords, fades, rows, revealed: false, line: parseFloat(section.dataset.revealLine || '.82'), tl: null };
});
function resetReveal(r) {
  r.revealed = false;
  if (r.tl) r.tl.kill();
  r.headingWords.forEach(w => gsap.set(w, { yPercent: 115 }));
  gsap.set(r.fades, { opacity: 0, y: 18 });
}
function playReveal(r) {
  r.revealed = true;
  const tl = gsap.timeline();
  r.headingWords.forEach((words, i) => tl.add(revealLines(groupLines(words)), .1 + i * .18));
  if (r.fades.length) tl.to(r.fades, { opacity: 1, y: 0, duration: .8, stagger: .08 }, .35);
  r.tl = tl;
}
if (!reduce) {
  revealSections.forEach(resetReveal);
  const rowObs = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting);
    visible.forEach((e, i) => {
      gsap.to(e.target, { opacity: 1, y: 0, duration: .8, delay: i * .06 });
      rowObs.unobserve(e.target);
    });
  }, { threshold: .15 });
  revealSections.forEach(r => r.rows.forEach(row => { gsap.set(row, { opacity: 0, y: 18 }); rowObs.observe(row); }));
}
function updateReveals() {
  if (reduce) return;
  revealSections.forEach(r => {
    const rect = r.section.getBoundingClientRect();
    if (!r.revealed && rect.top < VH * r.line && rect.bottom > 0) playReveal(r);
    else if (r.revealed && (rect.bottom < -40 || rect.top > VH + 40)) resetReveal(r);
  });
}

/* =========================================================================
   Statement pin (ScrollTrigger #1)
   ========================================================================= */
const statementText = $('.statement__text');
function setupStatement() {
  const section = $('.statement');
  const PIN = innerWidth < 900 ? 2.8 : 2.55;
  ScrollTrigger.create({
    trigger: section, start: 'top top', end: () => `+=${section.offsetHeight * PIN}`,
    pin: '.statement__content', pinSpacing: true, anticipatePin: 1, fastScrollEnd: true,
    onUpdate: st => {
      const p = st.progress;
      const c = .4 / PIN, u = (.4 + .5) / PIN, h = 1 - .25 / PIN, d = h - .6 / PIN;
      const m = clamp(p < u ? (p - c) / (u - c) : p > d ? (h - p) / (h - d) : 1);
      statementText.style.opacity = m;
      statementText.style.filter = `blur(${((1 - m) * 10).toFixed(2)}px)`;
    },
  });
}
if (reduce) statementText.style.opacity = 1; else setupStatement();

/* =========================================================================
   Scroll-driven updates
   ========================================================================= */
const frameSections = $$('[data-frame-section-number]');
const frameInner = $('.frame__section-inner');
let currentFrame = null;
function setFrameLabel(sec, animate = true) {
  if (sec === currentFrame) return;
  currentFrame = sec;
  const html_ = `<b>${sec.dataset.frameSectionNumber}</b>${sec.dataset.frameSectionLabel}`;
  if (!animate || reduce) { frameInner.innerHTML = html_; return; }
  gsap.to(frameInner, {
    opacity: 0, yPercent: -115, duration: .25, ease: 'power2.in', overwrite: true,
    onComplete: () => {
      frameInner.innerHTML = html_;
      gsap.fromTo(frameInner, { opacity: 0, yPercent: 115 }, { opacity: 1, yPercent: 0, duration: .6 });
    },
  });
}
setFrameLabel(frameSections[0], false);

const whites = $$('.surface-white');
let aboutQ = 0;
let pointer = { x: innerWidth / 2, y: innerHeight / 2, active: false };
let navHover = false;
let introDone = false;

function whiteAt(y, x) {
  return whites.some(el => {
    const r = el.getBoundingClientRect();
    return r.top <= y && r.bottom >= y && (x === undefined || (r.left <= x && r.right >= x));
  });
}

function update() {
  const sy = scrollY;
  VH = innerHeight;

  // frame inset 40 → 20 on wide screens
  if (innerWidth >= 1441) html.style.setProperty('--frame-inset-live', `${lerp(40, 20, clamp(sy / (1.5 * VH)))}px`);

  // hero scroll-out
  if (introDone) {
    const t = Math.min(1, sy / (1.5 * VH));
    heroTitle.style.opacity = 1 - t;
    heroTitle.style.filter = `blur(${(5 * t).toFixed(2)}px)`;
    heroTitle.style.transform = `translateX(${-5 * t}vw)`;
    heroLoc.style.opacity = 1 - t;
    heroLoc.style.filter = `blur(${(5 * t).toFixed(2)}px)`;
    heroLoc.style.transform = `translateX(${(innerWidth >= 1024 ? 5 : -5) * t}vw)`;
  }

  // scroll buffer: next section arrives late (desktop)
  if (desktop() && !reduce) {
    $$('[data-scroll-buffer]').forEach(sec => {
      const next = sec.nextElementSibling;
      if (!next) return;
      const k = parseFloat(sec.dataset.scrollBuffer);
      const a = sec.offsetTop + sec.offsetHeight - VH - .6 * VH;
      const u = clamp((sy - a) / (1.6 * VH));
      next.style.transform = u >= 1 ? '' : `translate3d(0, ${(k * VH * (1 - smooth(u))).toFixed(1)}px, 0)`;
    });
  }

  // about: circle reveal from the viewport centre (while pinned) + lit words
  {
    const r = about.getBoundingClientRect();
    const N = aboutWords.length;
    let f;
    if (desktop() && !reduce) {
      const mosaicRun = 1.2 * VH, range = (N / 30) * VH;
      about.style.minHeight = `${Math.ceil(VH * 1.3 + mosaicRun + range)}px`;
      // the mosaic runs while the section is pinned (its top has reached the viewport top)
      aboutQ = clamp(-r.top / mosaicRun);
      mosaic.setProgress(aboutQ);
      f = clamp((-r.top - mosaicRun * .8) / range);
    } else {
      about.style.minHeight = ''; aboutQ = 1; mosaic.setProgress(1);
      f = clamp((VH * .7 - r.top) / (VH * .9 + r.height * .5));
    }
    const m = f * (N + 4);
    aboutWords.forEach((w, i) => w.style.setProperty('--lit', clamp((m - i) / 4).toFixed(3)));
  }

  // flow: pinned horizontal scroll
  if (desktop() && !reduce) {
    const overflow = Math.max(0, flowTrack.scrollWidth - flowPin.clientWidth);
    const run = overflow * .65;
    const pinH = flowPin.getBoundingClientRect().height;
    flow.style.height = Math.ceil(pinH + run) + 'px';
    const p = run ? clamp(-flow.getBoundingClientRect().top / run) : 0;
    flowTrack.style.transform = `translate3d(${(-p * overflow).toFixed(1)}px,0,0)`;
    flow.style.setProperty('--p', p.toFixed(4));
    let target = .35 * innerWidth;
    if (p > .85) {
      const last = flowSteps[flowSteps.length - 1].getBoundingClientRect();
      target = lerp(target, last.left + last.width / 2, (p - .85) / .15);
    }
    let best = 0, bestD = Infinity;
    flowSteps.forEach((s, i) => { const b = s.getBoundingClientRect(); const d = Math.abs(b.left + b.width / 2 - target); if (d < bestD) { bestD = d; best = i; } });
    const flowVisible = flow.getBoundingClientRect().top < VH * .6;
    flowSteps.forEach((s, i) => {
      s.classList.toggle('is-active', i === best);
      s.classList.toggle('is-seen', flowVisible && i <= best);
    });
    flowCounter.target = Math.min(best, flowRealSteps.length - 1);
  } else {
    flow.style.height = '';
    flowSteps.forEach(s => s.classList.add('is-seen', 'is-active'));
  }

  // services: active item nearest the viewport middle (with hysteresis)
  {
    const mid = VH / 2;
    const centers = services.map(s => { const b = s.getBoundingClientRect(); return b.top + b.height / 2; });
    let cand = serviceActive, cd = Math.abs(centers[serviceActive] - mid);
    centers.forEach((c, i) => { const d = Math.abs(c - mid); if (d < cd - 40) { cd = d; cand = i; } });
    serviceActive = cand;
    services.forEach((s, i) => s.classList.toggle('is-active', i === serviceActive));
    tickEls.forEach((t, i) => { t.classList.toggle('is-active', i <= serviceActive); t.classList.toggle('is-current', i === serviceActive); });
    servicesCounter.target = serviceActive;
    const ab = servicesAside.getBoundingClientRect();
    const rr = clamp((.95 * VH - ab.top) / (.5 * VH));
    const o = 1 - (1 - rr) * (1 - rr);
    servicesAside.style.opacity = o.toFixed(3);
    servicesCounter.digits.style.setProperty('--enter', (1 - o).toFixed(3));
  }

  // product cards: depth + arrive
  {
    const top0 = 20 + 4.5 * REM;
    const tab = clamp(.016 * VH, .75 * REM, 1.25 * REM);
    const rects = cards.map(c => c.getBoundingClientRect());
    cards.forEach((c, a) => {
      const st = top0 + a * tab;
      let depth = 0;
      for (let u = a + 1; u < cards.length; u++) {
        const stU = top0 + u * tab;
        const denom = rects[a].height - (stU - st);
        if (denom > 0) depth += clamp((rects[a].top + rects[a].height - rects[u].top) / denom);
      }
      depth = Math.min(depth, 2.5);
      const arrive = reduce ? 1 : clamp((.75 * VH - rects[a].top) / (.75 * VH - st));
      c.style.setProperty('--depth', depth.toFixed(3));
      c.style.setProperty('--arrive', arrive.toFixed(3));
      c.classList.toggle('is-covered', depth >= 1);
    });
  }

  // rule #0 stage + lit statement
  if (desktop()) {
    const b = rule0Stage.getBoundingClientRect();
    const p = clamp((.7 * VH - b.top) / (b.height - VH + .7 * VH));
    rule0Stage.style.setProperty('--p', p.toFixed(4));
    rule0Name.style.setProperty('--np', p.toFixed(4));
  } else {
    rule0Stage.style.setProperty('--p', 1);
    rule0Name.style.setProperty('--np', 1);
  }
  {
    const b = rule0Statement.getBoundingClientRect();
    const range = VH * .4 + b.height;
    const f = clamp((VH * .85 - b.top) / range);
    const N = rule0Words.length;
    const m = f * (N + 4);
    rule0Words.forEach((w, i) => w.style.setProperty('--lit', clamp((m - i) / 4).toFixed(3)));
  }

  // section indicator
  let active = frameSections[0];
  frameSections.forEach(s => { if (s.getBoundingClientRect().top <= VH * .5) active = s; });
  setFrameLabel(active);

  // surfaces under header / bottom frame / cursor
  html.classList.toggle('surface-top-light', whiteAt(40));
  html.classList.toggle('surface-bottom-light', whiteAt(VH - 35));
  if (pointer.active) html.classList.toggle('surface-cursor-light', whiteAt(pointer.y, pointer.x));

  // nav collapse while the card stage passes under the vertical nav
  if (!html.classList.contains('menu-mode')) {
    const nav = $('.header__nav-list').getBoundingClientRect();
    const sb = stage.getBoundingClientRect();
    const overlap = sb.top < nav.bottom + 10 && sb.bottom - VH * .35 > 20;
    html.classList.toggle('nav-collapsed', overlap && !navHover);
  }

  // reveals
  updateReveals();

  // WebGL
  if (gl) {
    const fb = footer.getBoundingClientRect();
    const docBottom = fb.bottom - VH;               // px until the page bottom
    const footerX = clamp(1 - docBottom / (2 * fb.height));
    gl.setScroll(sy / VH, footerX, about.offsetTop / VH);
  }
}

let ticking = false;
const requestUpdate = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); } };
addEventListener('scroll', requestUpdate, { passive: true });
addEventListener('resize', () => {
  VH = innerHeight; REM = parseFloat(getComputedStyle(html).fontSize);
  measureFold(); assignRows(); ScrollTrigger.refresh(); requestUpdate();
});

// springs + service folds run on the gsap ticker
gsap.ticker.add((time, deltaMs) => {
  const dt = Math.min(deltaMs / 1000, .05);
  stepSpring(servicesCounter, dt);
  stepSpring(flowCounter, dt);
  const pos = servicesCounter.x;
  services.forEach((s, i) => {
    const hoverable = matchMedia('(hover: hover)').matches;
    peek[i] = lerp(peek[i], hoverable && hovered === i ? 1 : 0, 1 - Math.exp(-dt / (.35 / 3)));
    const open = desktop() ? Math.max(0, 1 - Math.abs(pos - i), peek[i]) : 1;
    s.style.setProperty('--open', open.toFixed(3));
  });
});

/* =========================================================================
   PULSE visual (card 3)
   ========================================================================= */
function pulseVisual(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, visible = false;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const b = canvas.getBoundingClientRect(); w = b.width; h = b.height;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  const LOOP = 8; // seconds = 4 bars at 120 BPM
  const draw = time => {
    requestAnimationFrame(draw);
    if (!visible || !w) return;
    const t = (time / 1000) % LOOP;
    ctx.fillStyle = '#080C11'; ctx.fillRect(0, 0, w, h);
    const padX = w * .06, top = h * .2, bot = h * .78, width = w - padX * 2;
    // bar grid
    ctx.strokeStyle = 'rgba(214,226,238,.07)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 16; i++) { const x = padX + width * i / 16; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke(); }
    // the long note
    ctx.fillStyle = 'rgba(62,214,240,.18)'; ctx.fillRect(padX, bot + 10, width, 10);
    ctx.fillStyle = '#3ED6F0'; ctx.fillRect(padX, bot + 10, width * (t / LOOP), 10);
    // hits: rate grows from 1 per beat to 64 per beat across the loop
    const rateAt = x => Math.pow(2, x * 6);
    let phase = 0, x = 0; const steps = 1400;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < steps; i++) {
      const u0 = i / steps, u1 = (i + 1) / steps;
      const dPhase = rateAt(u0) * 16 * (u1 - u0); // 16 beats in loop
      const before = Math.floor(phase); phase += dPhase;
      if (Math.floor(phase) > before) {
        const hx = padX + width * u1;
        const played = u1 <= t / LOOP;
        const gap = width / (16 * rateAt(u1));
        const decay = Math.max(2, Math.min(gap * .9, 60));
        ctx.strokeStyle = played ? '#3ED6F0' : 'rgba(214,226,238,.22)';
        ctx.beginPath(); ctx.moveTo(hx, bot); ctx.lineTo(hx, top + (bot - top) * (1 - Math.min(1, .35 + .65 * (1 - u1 * .4))));
        ctx.quadraticCurveTo(hx + decay * .25, bot - (bot - top) * .2, hx + decay, bot); ctx.stroke();
      }
      x = u1;
    }
    // playhead
    const px = padX + width * (t / LOOP);
    ctx.strokeStyle = '#45EBB0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, top - 10); ctx.lineTo(px, bot + 20); ctx.stroke();
    ctx.fillStyle = 'rgba(214,226,238,.55)'; ctx.font = `500 ${Math.max(10, h * .035)}px Montserrat, sans-serif`;
    ctx.fillText('1 GOLPE / BEAT', padX, top - 16);
    const label = 'ZUMBIDO'; ctx.fillText(label, padX + width - ctx.measureText(label).width, top - 16);
  };
  requestAnimationFrame(draw);
}
pulseVisual($('.pulse-visual'));

/* =========================================================================
   Cursor
   ========================================================================= */
function initCursor() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || innerWidth <= 768) return;
  html.classList.add('has-cursor');
  const cursor = $('.cursor'), big = $('.cursor__ball--big'), path = $('path', big), small = $('.cursor__ball--small');
  const tip = $('.cursor-tooltip');
  const s = { x: innerWidth / 2, y: innerHeight / 2, hw: 24, hh: 24, rx: 24, scale: 1, stretch: 0, angle: 0 };
  const tgt = { hw: 24, hh: 24, rx: 24, scale: 1, el: null };
  let px = s.x, py = s.y, lx = px, ly = py;
  const rr = (hw, hh, r) => {
    r = Math.min(r, hw, hh);
    return `M${-hw + r},${-hh}H${hw - r}A${r},${r} 0 0 1 ${hw},${-hh + r}V${hh - r}A${r},${r} 0 0 1 ${hw - r},${hh}H${-hw + r}A${r},${r} 0 0 1 ${-hw},${hh - r}V${-hh + r}A${r},${r} 0 0 1 ${-hw + r},${-hh}Z`;
  };
  addEventListener('pointermove', e => {
    px = e.clientX; py = e.clientY; pointer = { x: px, y: py, active: true };
    cursor.classList.add('is-visible');
    if (gl) gl.setPointer(px / innerWidth, py / innerHeight);
    const flipX = px > innerWidth - 200, dy = py < 120 ? 30 : py > innerHeight - 120 ? -30 : 0;
    gsap.to(tip, { x: flipX ? px - 38 - tip.offsetWidth : px + 38, y: py - 6 + dy, duration: .5, overwrite: 'auto' });
    html.classList.toggle('surface-cursor-light', whiteAt(py, px));
  });
  document.addEventListener('mouseleave', () => cursor.classList.remove('is-visible'));
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('a, button, [data-tooltip-title]');
    if (el === tgt.el) return;
    tgt.el = el;
    if (el) {
      const b = el.getBoundingClientRect();
      if (b.width <= 360 && b.height <= 160) {
        tgt.hw = b.width / 2 + Math.max(14, b.height * .2); tgt.hh = b.height / 2 + 9; tgt.rx = Math.min(tgt.hw, tgt.hh);
      } else { tgt.hw = tgt.hh = tgt.rx = 48; tgt.el = el; }
      const title = el.dataset.tooltipTitle;
      if (title) { tip.textContent = title; gsap.to(tip, { opacity: 1, duration: .2 }); }
    } else {
      tgt.hw = tgt.hh = tgt.rx = 24;
      gsap.to(tip, { opacity: 0, duration: .2 });
    }
  });
  addEventListener('mousedown', () => { tgt.scale = 1.6; });
  addEventListener('mouseup', () => { tgt.scale = 1; });
  let last = performance.now();
  const loop = now => {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, .05); last = now;
    let tx = px, ty = py, k = 1 - Math.exp(-dt * 9);
    if (tgt.el && tgt.hw !== 48) {
      const b = tgt.el.getBoundingClientRect();
      if (b.width <= 360 && b.height <= 160) {
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        tx = cx + clamp((px - cx) * .14, -8, 8); ty = cy + clamp((py - cy) * .14, -8, 8);
        tgt.hw = b.width / 2 + Math.max(14, b.height * .2); tgt.hh = b.height / 2 + 9; tgt.rx = Math.min(tgt.hw, tgt.hh);
        k = 1 - Math.exp(-dt * 14.4);
      }
    }
    s.x += (tx - s.x) * k; s.y += (ty - s.y) * k;
    const e = 1 - Math.exp(-dt * 12);
    s.hw += (tgt.hw - s.hw) * e; s.hh += (tgt.hh - s.hh) * e; s.rx += (tgt.rx - s.rx) * e; s.scale += (tgt.scale - s.scale) * e;
    const vx = px - lx, vy = py - ly; lx = px; ly = py;
    const speed = Math.hypot(vx, vy) / Math.max(dt, 1e-3);
    s.stretch += (Math.min(1, speed / 2600) * .32 - s.stretch) * (1 - Math.exp(-dt * 14));
    if (speed > 20) s.angle = Math.atan2(vy, vx) * 180 / Math.PI;
    const st = tgt.el ? 0 : s.stretch;
    path.setAttribute('d', rr(s.hw * s.scale, s.hh * s.scale, s.rx * s.scale));
    path.setAttribute('transform', `rotate(${s.angle}) scale(${1 + st}, ${1 - st * .55}) rotate(${-s.angle})`);
    big.style.transform = `translate3d(${s.x - 30}px, ${s.y - 30}px, 0)`;
    small.style.transform = `translate3d(${px - 10}px, ${py - 10}px, 0)`;
    small.style.opacity = tgt.el ? 0 : 1;
  };
  requestAnimationFrame(loop);

  // magnetic elements
  $$('[data-magnetic]').forEach(el => {
    el.addEventListener('mousemove', e => {
      const b = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - (b.left + b.width / 2)) * .18, y: (e.clientY - (b.top + b.height / 2)) * .18, duration: .6 });
    });
    el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: 1.2, ease: 'elastic.out(1, .4)' }));
  });
}
initCursor();
if (!html.classList.contains('has-cursor')) {
  addEventListener('pointermove', e => { if (gl) gl.setPointer(e.clientX / innerWidth, e.clientY / innerHeight); }, { passive: true });
}

/* nav hover re-expands while collapsed */
const headerMenu = $('.header__menu');
const navList = $('.header__nav-list');
let navTimer = 0;
[headerMenu, navList].forEach(el => {
  el.addEventListener('mouseenter', () => { clearTimeout(navTimer); navHover = true; requestUpdate(); });
  el.addEventListener('mouseleave', () => { navTimer = setTimeout(() => { navHover = false; requestUpdate(); }, 350); });
});

/* =========================================================================
   Mobile menu with triangle cover
   ========================================================================= */
const overlay = $('.menu-overlay');
const coverCanvas = $('.triangle-cover');
$$('.menu-overlay__list li').forEach((li, i) => li.style.setProperty('--i', i));
let menuOpen = false, coverAnim = 0;
function triangleCover(open) {
  const ctx = coverCanvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = innerWidth, H = innerHeight;
  coverCanvas.width = W * dpr; coverCanvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const b = headerMenu.getBoundingClientRect();
  const ox = b.left + b.width / 2, oy = b.top + b.height / 2;
  const tris = buildTriangles(W, H, 30, ox, oy);
  const maxD = Math.max(...tris.map(t => t.d));
  const dur = open ? 1.2 : .6;
  const t0 = performance.now();
  cancelAnimationFrame(coverAnim);
  const step = now => {
    const t = (now - t0) / 1000 / dur;
    ctx.clearRect(0, 0, W, H);
    let done = true;
    tris.forEach(tr => {
      const start = (tr.d / maxD) * .75 + tr.h * .15;
      let q = clamp((t - start) / .25);
      if (!open) q = 1 - q;
      if (q < 1 && open || q > 0 && !open) done = false;
      if (q <= 0) return;
      drawTri(ctx, tr, q, '#121212', `rgba(191,191,191,${(.2 * Math.sin(q * Math.PI)).toFixed(3)})`);
    });
    if (!done || t < 1) coverAnim = requestAnimationFrame(step);
  };
  coverAnim = requestAnimationFrame(step);
}
function openMenu() {
  menuOpen = true; html.classList.add('menu-open'); overlay.setAttribute('aria-hidden', 'false');
  headerMenu.setAttribute('aria-expanded', 'true'); triangleCover(true); if (lenis) lenis.stop();
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false; html.classList.remove('menu-open'); overlay.setAttribute('aria-hidden', 'true');
  headerMenu.setAttribute('aria-expanded', 'false'); triangleCover(false); if (lenis) lenis.start();
}
headerMenu.addEventListener('click', () => {
  if (html.classList.contains('menu-mode')) { menuOpen ? closeMenu() : openMenu(); }
  else { navHover = true; requestUpdate(); }
});

/* =========================================================================
   Triangle grid helpers (loader + menu)
   ========================================================================= */
function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
function buildTriangles(W, H, side, ox, oy) {
  const h = side * Math.sqrt(3) / 2;
  const tris = [];
  const rows = Math.ceil(H / h) + 1, cols = Math.ceil(W / (side / 2)) + 2;
  for (let r = 0; r < rows; r++) {
    for (let c = -1; c < cols; c++) {
      const up = (r + c) % 2 === 0;
      const x = c * side / 2, y = r * h;
      const pts = up ? [[x, y + h], [x + side / 2, y], [x + side, y + h]] : [[x, y], [x + side, y], [x + side / 2, y + h]];
      const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
      tris.push({ pts, cx, cy, d: Math.hypot(cx - ox, cy - oy), h: hash(r, c) });
    }
  }
  return tris;
}
function drawTri(ctx, tr, scale, fill, stroke) {
  ctx.beginPath();
  tr.pts.forEach(([x, y], i) => {
    const X = tr.cx + (x - tr.cx) * scale, Y = tr.cy + (y - tr.cy) * scale;
    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  });
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/* =========================================================================
   Footer CTA
   ========================================================================= */
$('.footer__cta').addEventListener('click', () => {
  $('.footer__status').textContent = 'La inscripción a la lista de espera se habilitará próximamente.';
});

/* =========================================================================
   Preloader → intro
   ========================================================================= */
const loader = $('#loading-screen');
const loaderCanvas = $('.loader__canvas');
const emblemSvg = $('.loading-screen__emblem');
const emblemPaths = $$('path', emblemSvg);
const logoBox = $('.loading-screen__logo-container');
const countEl = $('.loader__count-value');

function makeDigit() {
  const d = document.createElement('span'); d.className = 'loader__digit';
  const t = document.createElement('span'); t.className = 'loader__digit-track';
  const cur = document.createElement('span'); cur.textContent = '0';
  const nx = document.createElement('span'); nx.className = 'loader__digit-next';
  t.append(cur, nx); d.append(t); countEl.appendChild(d);
  return { t, cur, nx, target: '0', anim: null, queue: null };
}
const digits = [makeDigit(), makeDigit(), makeDigit()];
function rollDigit(dg, ch, k) {
  dg.nx.textContent = ch;
  dg.anim = dg.t.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }],
    { duration: 600, delay: k * 35, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
  dg.anim.onfinish = () => {
    dg.cur.textContent = ch; dg.anim.cancel(); dg.anim = null;
    if (dg.queue !== null && dg.queue !== ch) { const q = dg.queue; dg.queue = null; rollDigit(dg, q, 0); }
    else dg.queue = null;
  };
}
function setCount(v) {
  const str = String(v).padStart(3, '0');
  let k = 0;
  digits.forEach((dg, i) => {
    const ch = str[i];
    if (dg.target === ch) return;
    dg.target = ch;
    if (dg.anim) { dg.anim.playbackRate = 2; dg.queue = ch; } else rollDigit(dg, ch, k++);
  });
  emblemSvg.setAttribute('aria-valuenow', v);
}
const digitsIdle = () => digits.every(d => !d.anim);

// loader triangle canvas
const lctx = loaderCanvas.getContext('2d');
let LW = innerWidth, LH = innerHeight;
const ldpr = Math.min(devicePixelRatio || 1, 2);
loaderCanvas.width = LW * ldpr; loaderCanvas.height = LH * ldpr; lctx.setTransform(ldpr, 0, 0, ldpr, 0, 0);
const lcx = LW / 2, lcy = LH / 2;
const ltris = buildTriangles(LW, LH, 30, lcx, lcy);
const lmaxD = Math.max(...ltris.map(t => t.d));
const haloR = Math.min(.46 * LH, LW * (LW < 768 ? .58 : .42));
function drawLoaderIdle(shown) {
  lctx.clearRect(0, 0, LW, LH);
  lctx.fillStyle = '#000'; lctx.fillRect(0, 0, LW, LH);
  ltris.forEach(tr => {
    const halo = Math.max(0, 1 - tr.d / (1.15 * haloR));
    if (halo <= 0) return;
    drawTri(lctx, tr, 1, null, `rgba(191,191,191,${(.07 * halo * (.4 + .6 * shown / 100)).toFixed(3)})`);
  });
}

// progress: images + fonts + window load
const pending = [document.fonts ? document.fonts.ready : Promise.resolve(),
  new Promise(r => (document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true })))];
$$('img').forEach(img => pending.push(img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
let done = 0;
pending.forEach(p => p.then(() => { done++; }));
const safety = setTimeout(() => { done = pending.length; }, 12000);

let shown = 0, firstAt = performance.now(), lastT = performance.now(), leaving = false;
function loaderTick(now) {
  if (leaving) return;
  const dt = now - lastT; lastT = now;
  const target = (done / pending.length) * 100;
  const cap = 100 * Math.min(1, (now - firstAt) / 1000);
  shown += (Math.min(target, cap) - shown) * (1 - Math.exp(-dt / 120));
  if (target >= 100 && cap >= 100 && shown > 99.4) shown = 100;
  const v = Math.round(shown);
  setCount(v);
  // the mark's line draws itself with the progress (grey to white) and lights up cyan at 100
  const o = Math.round(80 + shown * 1.75);
  emblemPaths[1].setAttribute('stroke-dashoffset', (1.01 * (1 - shown / 100)).toFixed(4));
  emblemPaths[1].setAttribute('stroke', v >= 100 ? '#3ED6F0' : `rgb(${o},${o},${o})`);
  if (v >= 100) emblemSvg.classList.add('is-lit');
  drawLoaderIdle(shown);
  if (v >= 100 && digitsIdle()) {
    leaving = true; clearTimeout(safety);
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(onLoaded, 200)));
    return;
  }
  requestAnimationFrame(loaderTick);
}

/* Browsers only let a page play sound after a click, tap or key. If sound is still blocked when
   loading ends, the loader asks for that click ("Entrar") so the site opens with the track on.
   When the browser already allows it, there is no button: the site enters by itself, playing. */
const gate = $('.loader__gate');
function onLoaded() {
  if (!sound.needsGesture()) { startExit(); return; }
  const label = $('.loader__count-label');
  if (label) label.textContent = 'Listo';
  $('.loader__count').style.opacity = '0';
  gate.hidden = false;
  if (!reduce) gsap.fromTo(gate, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .8 });
  $('.loader__enter').focus({ preventScroll: true });
}
function leaveGate(withSound) {
  if (gate.dataset.done) return;
  gate.dataset.done = '1';
  if (withSound) sound.play();
  const go = () => { gate.hidden = true; startExit(); };
  if (reduce) go(); else gsap.to(gate, { opacity: 0, y: -8, duration: .3, ease: 'power2.in', onComplete: go });
}
$('.loader__enter').addEventListener('click', () => leaveGate(true));
$('.loader__mute').addEventListener('click', () => leaveGate(false));

function startExit() {
  document.body.classList.remove('loading'); document.body.classList.add('loaded');
  loader.classList.add('is-leaving');
  if (gl) gl.wave(lcx, lcy);

  // triangles shrink away from the centre at 910 px/s
  if (!reduce) {
    const t0 = performance.now();
    const maxLeave = lmaxD / 910 + .3;
    const step = now => {
      const t = (now - t0) / 1000;
      lctx.clearRect(0, 0, LW, LH);
      ltris.forEach(tr => {
        const leave = tr.d / 910 + .3 * tr.h * .4;
        const q = clamp((t - leave) / .22);
        if (q >= 1) return;
        const size = 1 - (1 - Math.pow(1 - q, 3)) ;
        const tw = 1 - q * (.5 + .5 * Math.sin(t * (5 + 4 * tr.h) + 6.283 * tr.h));
        drawTri(lctx, tr, Math.max(0, size * (q > 0 ? tw : 1)), '#000', q > 0 ? `rgba(191,191,191,${(.2 * Math.sin(q * Math.PI)).toFixed(3)})` : null);
      });
      if (t < maxLeave + .25) requestAnimationFrame(step);
      else lctx.clearRect(0, 0, LW, LH);
    };
    requestAnimationFrame(step);
    loader.style.background = 'transparent';
  }
  intro();
}

function intro() {
  const header = $('.header');
  const navItems = [...$$('.header__nav-item'), headerMenu].filter(el => getComputedStyle(el).display !== 'none');
  const bottomItems = [$('.frame__section'), $('.frame__bpm')];
  gsap.set($('.header__logo'), { opacity: 0, y: -10 });
  gsap.set(navItems, { opacity: 0, y: -10 });
  gsap.set(bottomItems, { opacity: 0, y: 10 });
  html.classList.remove('intro-pending');

  const target = $('.page-emblem__marks').getBoundingClientRect();
  const box = logoBox.getBoundingClientRect();
  const tl = gsap.timeline({
    onComplete: () => {
      loader.remove();
      introDone = true;
      if (lenis) lenis.start();
      requestUpdate();
    },
  });
  if (reduce) {
    tl.set(logoBox, { opacity: 0 }).call(() => $('.page-emblem').classList.add('is-ready'));
  } else {
    tl.to(logoBox, {
      x: target.left + target.width / 2 - (box.left + box.width / 2),
      y: target.top + target.height / 2 - (box.top + box.height / 2),
      scale: target.width / box.width, duration: 1, ease: 'power3.inOut',
    }, 0);
    tl.call(() => { $('.page-emblem').classList.add('is-ready'); gsap.set(logoBox, { opacity: 0 }); }, null, 1);
  }
  tl.call(() => {
    heroTitle.style.opacity = 1; heroLoc.style.opacity = 1;
    if (!reduce) {
      revealLines(groupLines(heroTitleWords));
      revealLines(groupLines(heroLocWords), { delay: .45, duration: .9 });
    }
  }, null, .45);
  tl.to($('.header__logo'), { opacity: 1, y: 0, duration: .8 }, .7);
  tl.to(navItems, { opacity: 1, y: 0, duration: .7, stagger: .06 }, .78);
  tl.to(bottomItems, { opacity: 1, y: 0, duration: .7, stagger: .08 }, 1);
  tl.call(() => gl && gl.popIn(), null, reduce ? 0 : 1.35);
  tl.to({}, { duration: .1 }, 2.1);
}

/* click anywhere: a shockwave of the triangle grid from that point */
addEventListener('pointerdown', e => {
  if (gl && !reduce && introDone && e.button === 0) gl.wave(e.clientX, e.clientY, 1);
}, { passive: true });

/* random background waves while the hero is visible */
(function randomWaves() {
  setTimeout(() => {
    if (gl && !reduce && introDone && scrollY < VH * .8 && !document.hidden) {
      gl.wave(Math.random() * innerWidth, Math.random() * innerHeight);
    }
    randomWaves();
  }, 5000 + Math.random() * 5000);
})();

/* the Axion Pulse mark (corner and footer) beats with the site's track: sound.js's kick detector sets --kick */
const beatMarks = $$('.page-emblem, .footer__emblem');
if (!reduce) (function markBeat() {
  const k = sound.beat * sound.mix;
  const v = k < .004 ? '0' : k.toFixed(3);
  beatMarks.forEach(el => { if (el.style.getPropertyValue('--kick') !== v) el.style.setProperty('--kick', v); });
  requestAnimationFrame(markBeat);
})();

/* =========================================================================
   Boot
   ========================================================================= */
measureFold();
document.fonts && document.fonts.ready.then(() => { measureFold(); assignRows(); ScrollTrigger.refresh(); requestUpdate(); });
assignRows();
update();
if (reduce) {
  setCount(100);
  emblemPaths[1].setAttribute('stroke-dashoffset', '0'); emblemPaths[1].setAttribute('stroke', '#3ED6F0');
  emblemSvg.classList.add('is-lit');
  onLoaded();
} else {
  requestAnimationFrame(loaderTick);
}
