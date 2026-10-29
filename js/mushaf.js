// Tampilan mushaf: teks mengalir per halaman dengan penanda ayat, mode sembunyikan ayat untuk hafalan,
// dan "ikuti bacaan": saat mikrofon aktif, kata yang dibaca dengan benar muncul otomatis.
import { $, $$, h, toast, openSheet, closeSheet } from './dom.js';
import { normalizeArabic, PROFILES } from './arabic.js';
import { Follower } from './follow.js';
import { state, gradeAyah, surahLabel } from './state.js';
import { ayahKey } from './progress.js';
import { GRADES } from './srs.js';
import { player } from './player.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const arabicDigits = n => String(n).replace(/\d/g, d => DIGITS[d]);

let surah = null, follower = null, wordEls = [], hideOn = false, following = false, rec = null;
let pageObserver = null, heardFinal = '';
const handlers = {};
const currentProfile = () => PROFILES[state.settings.sensitivity] || PROFILES.normal;

const box = () => $('#mushaf');
export const isFollowing = () => following;
export const isHidden = () => hideOn;
export const mistakeCount = () => (follower ? follower.mistakes.size + follower.pending.size : 0);
export const canPeek = () => !!follower && hideOn && follower.cursor < wordEls.length;

// onMarker(ayah): ketuk nomor ayat. onChange(): status sesi berubah (badge, tombol). onFollow(aktif): mikrofon nyala/mati.
export function initMushaf(h) {
  Object.assign(handlers, h);
  box().addEventListener('click', e => {
    const mk = e.target.closest('.mk');
    if (mk) { handlers.onMarker?.(Number(mk.dataset.ayah)); return; }
    const w = e.target.closest('.w.hid');
    if (w) { // ketuk kata tersembunyi = intip kata itu (dicatat "dibantu")
      const i = Number(w.dataset.i);
      follower.peeked.add(i);
      paint([i]);
      handlers.onChange?.();
    }
  });
}

export function renderMushaf(s, { hide }) {
  stopFollow(false);
  surah = s;
  wordEls = [];
  const words = [];
  const pages = [];
  for (const a of s.ayahs) {
    let pg = pages[pages.length - 1];
    if (!pg || pg.page !== a.page) pages.push(pg = { page: a.page, juz: a.juz, hizb: a.hizb, ayahs: [] });
    pg.ayahs.push(a);
  }
  const parts = [h('div', { class: 'surah-banner' }, h('span', { lang: 'ar', dir: 'rtl', text: s.name || surahLabel(s.number) }))];
  if (s.ayahs[0]?.bismillah) parts.push(h('p', { class: 'm-bismillah', lang: 'ar', dir: 'rtl', text: BISMILLAH }));
  for (const pg of pages) {
    const text = h('p', { class: 'm-text', lang: 'ar', dir: 'rtl' });
    for (const a of pg.ayahs) {
      const ay = h('span', { class: 'ay', dataset: { ayah: a.n } });
      let prev = null;
      for (const tok of a.text.split(/\s+/).filter(Boolean)) {
        const norm = normalizeArabic(tok);
        // Tanda waqaf/simbol tanpa huruf ditempel ke kata sebelumnya agar ikut tersembunyi.
        if (!norm) { if (prev) prev.append(' ' + tok); else ay.append(tok + ' '); continue; }
        prev = h('span', { class: 'w', dataset: { i: words.length }, text: tok });
        words.push({ ayah: a.n, norm, display: tok });
        wordEls.push(prev);
        ay.append(prev, ' ');
      }
      ay.append(h('button', { class: 'mk', type: 'button', dataset: { ayah: a.n }, 'aria-label': `Ayat ${a.n}: menu`, text: arabicDigits(a.n) }), ' ');
      text.append(ay);
    }
    parts.push(h('section', { class: 'm-page', dataset: { page: pg.page ?? '', juz: pg.juz ?? '', hizb: pg.hizb ?? '' } },
      text,
      h('footer', { class: 'm-foot' },
        h('span', { text: pg.juz ? `Juz ${pg.juz}` : '' }),
        h('span', { class: 'm-pnum', text: pg.page ? arabicDigits(pg.page) : '' }),
        h('span', { text: pg.hizb ? `Hizb ${pg.hizb}` : '' }))));
  }
  box().replaceChildren(...parts);
  follower = new Follower(words, currentProfile());
  hideOn = !!hide;
  box().classList.toggle('hide-on', hideOn);
  updateMarkers();
  paintAll();
  watchPages();
  handlers.onChange?.();
}

function cls(i) {
  const f = follower;
  let c = 'w';
  if (f.mistakes.has(i)) c += ' err';
  else if (f.pending.has(i)) c += ' ragu';
  else if (f.peeked.has(i)) c += ' peek';
  else if (f.done.has(i)) c += ' done';
  else if (f.preview.has(i)) c += ' pv';
  else if (hideOn && i >= f.start) c += ' hid';
  if (i === f.cursor && (hideOn || following)) c += ' cur';
  return c;
}

function paint(indices) {
  for (const i of indices) if (wordEls[i]) wordEls[i].className = cls(i);
}

function paintAll() {
  wordEls.forEach((el, i) => { el.className = cls(i); });
}

function scrollToCursor() {
  const el = wordEls[Math.min(follower.cursor, wordEls.length - 1)];
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < innerHeight * 0.2 || r.bottom > innerHeight * 0.65) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function updateMarkers() {
  if (!surah) return;
  for (const mk of $$('.mk', box())) {
    const r = state.progress.items[ayahKey(surah.number, Number(mk.dataset.ayah))];
    mk.classList.toggle('memorized', r?.status === 'memorized');
    mk.classList.toggle('learning', !!r && r.status !== 'memorized');
    mk.classList.toggle('bm', !!state.progress.bookmarks?.[ayahKey(surah.number, Number(mk.dataset.ayah))]);
  }
}

// Nomor ayat teratas yang terlihat di layar.
function firstVisibleAyah() {
  const top = $('#mushafInfo').getBoundingClientRect().bottom + 8;
  for (const ay of $$('.ay', box())) if (ay.getBoundingClientRect().bottom > top) return Number(ay.dataset.ayah);
  return surah.ayahs[0].n;
}

// Aktif/nonaktifkan sembunyikan ayat. Saat diaktifkan, hafalan dimulai dari ayat teratas yang terlihat.
export function setHidden(on, fromAyah = null) {
  if (!follower) return;
  hideOn = on;
  box().classList.toggle('hide-on', on);
  if (on) follower.setStart(follower.firstWordOf(fromAyah ?? firstVisibleAyah()));
  paintAll();
  handlers.onChange?.();
}

export function startFrom(ayah) {
  follower.setStart(follower.firstWordOf(ayah));
  paintAll();
  handlers.onChange?.();
}

export function peekWord() { paint(follower.peekWord()); scrollToCursor(); handlers.onChange?.(); }
export function peekAyah() { paint(follower.peekAyah()); scrollToCursor(); handlers.onChange?.(); }

// ---------- Ikuti bacaan (mikrofon) ----------
export function toggleFollow() {
  if (following) stopFollow(true); else startFollow();
}

function startFollow() {
  if (!follower) return;
  if (!Recognition) { toast('Browser ini belum mendukung pengenalan suara. Coba Chrome di Android atau desktop.', 4500); return; }
  if (follower.cursor >= wordEls.length) { toast('Sudah di akhir surah. Ketuk nomor ayat untuk mulai lagi.', 4000); return; }
  player.stop(); // audio qari jangan sampai ikut tertangkap mikrofon
  following = true;
  heardFinal = '';
  showHeard('', '');
  listen();
  paint([follower.cursor]);
  scrollToCursor();
  handlers.onFollow?.(true);
  toast(hideOn ? 'Mendengarkan… ayat muncul saat Anda membacanya.' : 'Mendengarkan… kata yang dibaca akan ditandai.');
}

function listen() {
  follower.newSession();
  rec = new Recognition();
  rec.lang = 'ar-SA';
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 5; // beberapa tebakan; dipilih yang paling cocok dengan ayat
  rec.onresult = e => {
    follower.profile = currentProfile();
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const { dirty, jumped, heard } = follower.hear(Array.from(r, alt => alt.transcript), r.isFinal);
      paint(dirty);
      if (r.isFinal) { heardFinal = heard; showHeard(heard, ''); } else showHeard(heardFinal, heard);
      if (jumped) toast(`Melompat ke ayat ${follower.words[follower.cursor - 1]?.ayah ?? ''}`);
    }
    scrollToCursor();
    handlers.onChange?.();
    if (follower.cursor >= wordEls.length) { stopFollow(true); toast('Sampai akhir surah. بارك الله فيك'); }
  };
  rec.onerror = e => {
    const fatal = { 'not-allowed': 'Izin mikrofon ditolak.', 'service-not-allowed': 'Pengenalan suara tidak diizinkan di browser ini.', 'audio-capture': 'Mikrofon tidak ditemukan.', network: 'Pengenalan suara memerlukan internet.' }[e.error];
    if (fatal) { stopFollow(false); toast(fatal, 4500); }
  };
  // Browser menghentikan pengenalan setelah jeda; nyalakan lagi selama mode ikuti aktif.
  rec.onend = () => { if (following) setTimeout(() => { if (following) listen(); }, 150); };
  try { rec.start(); } catch { stopFollow(false); toast('Tidak dapat memulai mikrofon. Coba lagi.'); }
}

export function stopFollow(showSummary) {
  if (!following) return;
  following = false;
  try { rec?.stop(); } catch { /* sudah berhenti */ }
  rec = null;
  const pv = [...follower.preview, follower.cursor, ...follower.settle()];
  follower.preview = new Set();
  paint(pv);
  $('#heard').classList.add('hidden');
  handlers.onFollow?.(false);
  handlers.onChange?.();
  if (showSummary && (follower.done.size || follower.mistakes.size)) {
    const s = follower.summary();
    toast(`${s.read.length} ayat dibaca · ${s.mistakeCount} kesalahan. Ketuk "Kesalahan" untuk detail.`, 4000);
  }
}

// Teks mentah yang didengar browser, agar terlihat apakah salah dengar atau salah cocok.
function showHeard(final, interim) {
  const box = $('#heard');
  box.classList.toggle('hidden', !following || !state.settings.showHeard);
  $('#heardText').replaceChildren(final || '', interim ? h('span', { class: 'interim', text: (final ? ' ' : '') + interim }) : '');
  if (!final && !interim) $('#heardText').textContent = '…';
}

// ---------- Ringkasan kesalahan ----------
export function openMistakes(focusAyah) {
  if (!follower) return;
  const s = follower.summary();
  const word = i => follower.words[i].display;
  const body = [];
  if (!s.read.length && !s.problems.length) {
    body.push(h('p', { text: 'Belum ada bacaan pada sesi ini.' }),
      h('ol', { class: 'muted small how' },
        h('li', { text: 'Aktifkan "Sembunyikan ayat" (ikon mata).' }),
        h('li', { text: 'Tekan tombol mikrofon, lalu baca dari kata yang bergaris.' }),
        h('li', { text: 'Kata yang Anda baca muncul otomatis; kata yang terlewat/berbeda ditandai merah.' }),
        h('li', { text: 'Ketuk nomor ayat untuk memilih titik mulai.' })));
  } else {
    body.push(h('p', { class: 'muted small', text: `${s.read.length} ayat dibaca lengkap · ${s.mistakeCount} kata salah/terlewat · ${s.peekCount} kata dibantu` }));
    if (s.problems.length) {
      body.push(h('div', { class: 'mistake-list' }, s.problems.map(p => h('button', {
        class: 'mistake', type: 'button',
        onclick: () => { closeSheet(); focusAyah?.(p.ayah); },
      },
      h('span', { class: 'pill', text: `Ayat ${p.ayah}` }),
      h('span', { class: 'chips', lang: 'ar', dir: 'rtl' },
        p.err.map(i => h('b', { class: 'err', text: word(i) })),
        p.peek.map(i => h('b', { class: 'peek', text: word(i) }))),
      p.heard.length ? h('small', { class: 'heard-as' }, 'terdengar: ', h('bdi', { lang: 'ar', dir: 'rtl', text: p.heard.join(' · ') })) : null))));
      body.push(h('p', { class: 'muted tiny', text: 'Merah = terlewat/berbeda menurut transkripsi, kuning = dibuka manual. "Terdengar" = teks yang ditangkap browser di posisi itu. Bila Anda yakin bacaan sudah benar, coba kepekaan "Longgar" di Pengaturan.' }));
    }
    if (follower.log.length) {
      body.push(h('details', { class: 'heard-log' },
        h('summary', { text: `Riwayat teks terdengar (${follower.log.length})` }),
        h('ol', { lang: 'ar', dir: 'rtl' }, follower.log.slice().reverse().map(t => h('li', { text: t })))));
    }
    const actions = h('div', { class: 'sheet-actions' });
    if (s.clean.length && hideOn) {
      actions.append(h('button', { type: 'button', onclick: e => applyGrade(e.currentTarget, s.clean, GRADES.LANCAR) }, `✓ Tandai ${s.clean.length} ayat lancar sebagai hafal`));
    }
    if (s.problems.length) {
      actions.append(h('button', { type: 'button', class: 'secondary', onclick: e => applyGrade(e.currentTarget, s.problems.map(p => p.ayah), GRADES.LUPA) }, `↺ Masukkan ${s.problems.length} ayat ke murajaah`));
    }
    actions.append(h('button', { type: 'button', class: 'ghost', onclick: () => { follower.setStart(follower.start); paintAll(); handlers.onChange?.(); closeSheet(); toast('Sesi diulang.'); } }, 'Ulangi sesi'));
    body.push(actions);
  }
  openSheet({ title: 'Kesalahan', subtitle: surahLabel(surah.number), body });
}

function applyGrade(btn, ayahs, grade) {
  for (const a of ayahs) gradeAyah(surah.number, a, grade);
  btn.disabled = true;
  btn.textContent = grade === GRADES.LANCAR ? '✓ Sudah ditandai hafal' : '✓ Sudah masuk murajaah';
  updateMarkers();
}

// Info halaman/juz/hizb di bilah atas mengikuti halaman yang sedang terlihat.
function watchPages() {
  pageObserver?.disconnect();
  const show = sec => {
    const { page, juz, hizb } = sec.dataset;
    $('#miSurah').textContent = surahLabel(surah.number);
    $('#miPage').textContent = [page && `Halaman ${page}`, juz && `Juz ${juz}`, hizb && `Hizb ${hizb}`].filter(Boolean).join(' | ');
  };
  const first = $('.m-page', box());
  if (first) show(first);
  pageObserver = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) show(e.target);
  }, { rootMargin: '-25% 0px -70% 0px' });
  $$('.m-page', box()).forEach(p => pageObserver.observe(p));
}
