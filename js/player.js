// Pemutar audio berantrean: ulangi tiap ayat N kali, lanjut ke ayat berikutnya, opsional ulangi rentang.
import { audioUrl } from './api.js';

export function createPlayer(onChange) {
  const audio = new Audio();
  audio.preload = 'auto';
  let queue = [], idx = 0, rep = 0, opts = { repeatEach: 1, loop: false, reciter: 'ar.alafasy' }, status = 'idle';

  const snapshot = () => ({ status, item: queue[idx] || null, rep: rep + 1, repeatEach: opts.repeatEach, index: idx, length: queue.length });
  const notify = (extra = {}) => onChange({ ...snapshot(), ...extra });

  function load() {
    const item = queue[idx];
    audio.src = audioUrl(opts.reciter, item.global);
    status = 'playing';
    notify();
    audio.play().catch(err => {
      if (err?.name === 'AbortError') return; // src berganti sebelum mulai
      stop({ error: 'Audio tidak dapat diputar. Periksa koneksi internet.' });
    });
  }

  audio.addEventListener('ended', () => {
    if (status !== 'playing') return;
    rep++;
    if (rep < opts.repeatEach) { audio.currentTime = 0; audio.play().catch(() => stop()); notify(); return; }
    rep = 0;
    idx++;
    if (idx >= queue.length) {
      if (!opts.loop) { stop(); return; }
      idx = 0;
    }
    load();
  });
  audio.addEventListener('error', () => {
    if (status === 'playing') stop({ error: 'Audio gagal dimuat. Periksa koneksi atau coba qari lain.' });
  });

  function play(items, o = {}) {
    if (!items.length) return;
    queue = items; idx = 0; rep = 0;
    opts = { ...opts, ...o, repeatEach: Math.max(1, Number(o.repeatEach) || 1) };
    load();
  }

  function toggle() {
    if (status === 'playing') { audio.pause(); status = 'paused'; notify(); }
    else if (status === 'paused') { status = 'playing'; audio.play().catch(() => stop()); notify(); }
  }

  function stop(extra = {}) {
    audio.pause();
    status = 'idle';
    notify(extra);
    queue = []; idx = 0; rep = 0;
  }

  return { play, toggle, stop, get status() { return status; } };
}

const subscribers = new Set();
export const player = createPlayer(s => subscribers.forEach(fn => fn(s)));
export const onPlayer = fn => subscribers.add(fn);
