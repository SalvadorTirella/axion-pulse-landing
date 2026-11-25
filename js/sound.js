// Track del sitio: play/pausa con fundidos (nunca un corte seco) y un detector de kick
// que hace latir al orbe y al punto del BPM con la música real.
// Arranca sonando: si el navegador permite autoplay, al cargar; si no, en el primer gesto del
// visitante (clic, tecla o toque). Scroll y rueda no cuentan como gesto para los navegadores.

const VOLUME = .85;
const FADE_IN = .8, FADE_OUT = .45;   // segundos
const LOW_HZ = 140;                   // banda del kick
const DECAY = 12;                     // igual que el latido sintético: exp(-fase·6) a 120 BPM
// bandas que deforman el orbe: graves (tamaño de la deformación), medios (ondas), agudos (temblor)
const BANDS = [['low', 30, 140], ['mid', 300, 2000], ['high', 4000, 12000]];

export function initSound({ button, audio, reduce = false }) {
  let ctx = null, gain = null, analyser = null, bins = null, lowBins = 2, binHz = 43;
  let playing = false, pauseTimer = 0, raf = 0, last = 0;
  const dot = button.querySelector('i');
  const label = button.querySelector('.frame__sound');

  // estado que lee gl.js en cada frame. low/mid/high/level van de 0 a 1 normalizados contra
  // el pico reciente de cada banda; hits cuenta los kicks detectados.
  const out = { beat: 0, mix: 0, low: 0, mid: 0, high: 0, level: 0, hits: 0 };
  const bandPeak = { low: .08, mid: .08, high: .08 };
  let floor = 0, peak = 1e-3, prev = 0, sinceHit = 1;

  function setup() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const src = ctx.createMediaElementSource(audio);
    gain = ctx.createGain(); gain.gain.value = 0;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = .2;
    bins = new Uint8Array(analyser.frequencyBinCount);
    binHz = ctx.sampleRate / analyser.fftSize;
    lowBins = Math.max(2, Math.round(LOW_HZ / binHz));
    src.connect(gain); gain.connect(analyser); analyser.connect(ctx.destination);
  }

  function ramp(to, secs) {
    if (!gain) { audio.volume = to; return; }
    const t = ctx.currentTime, g = gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + secs);
  }

  function render() {
    button.setAttribute('aria-pressed', String(playing));
    button.setAttribute('aria-label', playing ? 'Pausar pieza musical' : 'Reproducir pieza musical');
    button.dataset.tooltipTitle = playing ? 'Pausar pieza' : 'Reproducir pieza';
    button.classList.toggle('is-playing', playing);
    if (label) label.textContent = playing ? 'Sonando' : 'Escuchar';
    // el tooltip del cursor solo se actualiza al entrar; si está encima, cambiarlo ya
    const tip = document.querySelector('.cursor-tooltip');
    if (tip && button.matches(':hover')) tip.textContent = button.dataset.tooltipTitle;
  }

  // kick: energía de graves contra un piso adaptativo; cada golpe dispara la envolvente
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, .05); last = now;
    out.mix += ((playing ? 1 : 0) - out.mix) * (1 - Math.exp(-dt * (playing ? 3 : 5)));
    out.beat *= Math.exp(-dt * DECAY);
    sinceHit += dt;
    if (analyser && playing) {
      analyser.getByteFrequencyData(bins);
      let e = 0;
      for (let i = 1; i <= lowBins; i++) e += bins[i];
      e /= lowBins * 255;
      floor += (e - floor) * (1 - Math.exp(-dt * 1.5));
      peak = Math.max(e, peak * Math.exp(-dt * .5), floor + .05);
      const rise = e - prev; prev = e;
      if (rise > .025 && e > floor + .35 * (peak - floor) && sinceHit > .18) {
        out.beat = Math.max(out.beat, Math.min(1, .55 + (e - floor) / (peak - floor + 1e-3) * .45));
        sinceHit = 0;
        out.hits++;
      }
      // energía por banda, con ataque rápido y caída más lenta
      for (const [key, lo, hi] of BANDS) {
        const a = Math.max(1, Math.round(lo / binHz)), b = Math.min(bins.length - 1, Math.round(hi / binHz));
        let s = 0;
        for (let i = a; i <= b; i++) s += bins[i];
        const v = s / ((b - a + 1) * 255);
        bandPeak[key] = Math.max(v, bandPeak[key] * Math.exp(-dt * .12), .08);
        const n = Math.min(1, v / bandPeak[key]);
        out[key] += (n - out[key]) * (1 - Math.exp(-dt * (n > out[key] ? 18 : 5)));
      }
      out.level += ((out.low * .5 + out.mid * .35 + out.high * .15) - out.level) * (1 - Math.exp(-dt * 2));
    } else {
      const k = Math.exp(-dt * 4);
      out.low *= k; out.mid *= k; out.high *= k; out.level *= k;
    }
    if (dot && !reduce) {
      const b = out.beat * out.mix;
      dot.style.transform = `scale(${(.8 + .55 * b).toFixed(3)})`;
      dot.style.opacity = (.45 + .55 * b).toFixed(3);
    }
    if (!playing && out.mix < .002) {
      cancelAnimationFrame(raf); raf = 0; out.mix = 0; out.beat = 0;
      out.low = out.mid = out.high = out.level = 0;
      if (dot) { dot.style.transform = ''; dot.style.opacity = ''; }
      button.classList.remove('is-live');
    }
  }

  async function play() {
    if (!ctx) setup();
    clearTimeout(pauseTimer);
    playing = true; render();
    try {
      if (ctx && ctx.state === 'suspended') await ctx.resume();
      ramp(VOLUME, FADE_IN);
      await audio.play();
    } catch (err) {
      console.warn('track off', err);
      playing = false; render(); ramp(0, .05);
      return false;
    }
    button.classList.add('is-live');
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    return true;
  }

  // autoplay bloqueado → esperar el primer gesto en cualquier parte de la página
  function armFirstGesture() {
    const types = ['click', 'keydown', 'touchend'];
    const onGesture = e => {
      types.forEach(t => removeEventListener(t, onGesture, true));
      if (button.contains(e.target)) return;   // el botón alterna por su cuenta
      if (e.target.closest && e.target.closest('[data-no-sound]')) return;   // "Entrar sin sonido"
      if (!playing) play();
    };
    types.forEach(t => addEventListener(t, onGesture, true));
  }

  function autoStart() {
    if (!ctx) setup();
    // un AudioContext nace 'suspended' cuando el navegador no permite sonar sin gesto
    if (ctx && ctx.state !== 'running') { armFirstGesture(); return; }
    play().then(ok => { if (!ok) armFirstGesture(); });
  }

  function pause() {
    playing = false; render();
    ramp(0, FADE_OUT);
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { if (!playing) audio.pause(); }, FADE_OUT * 1000 + 60);
  }

  button.addEventListener('click', () => (playing ? pause() : play()));
  audio.addEventListener('error', () => { if (playing) { playing = false; render(); } });
  render();
  autoStart();
  // para el "Entrar" del loader: ¿el track ya está sonando? si no, hace falta un gesto.
  // (se mira la reproducción real: el AudioContext puede estar 'running' y el <audio> bloqueado)
  out.needsGesture = () => !(playing && !audio.paused);
  out.play = () => play();
  return out;
}
