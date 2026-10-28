// Tampilan Belajar: baca surah, mode hafalan (huruf awal/sembunyi), audio berulang, tandai hafalan.
import { $, $$, h, toast } from './dom.js';
import { getSurah } from './api.js';
import { state, on, saveSettings, gradeAyah, setLast, surahMeta, replaceProgress } from './state.js';
import { ayahKey, removeAyah } from './progress.js';
import { GRADES } from './srs.js';
import { firstLetterHint } from './arabic.js';
import { localDate } from './dates.js';
import { player, onPlayer } from './player.js';
import { openSetoran } from './setoran.js';

let surah = null, loadToken = 0, observer = null, lastSaveTimer = null;

export function currentSurah() { return surah; }

const signature = rec => (rec ? `${rec.status}|${rec.due}` : '');

function statusPill(rec) {
  if (!rec) return null;
  const due = rec.due && rec.due <= localDate();
  if (rec.status === 'memorized') return h('span', { class: `pill ${due ? 'warn' : 'ok'}`, text: due ? 'Hafal · murajaah' : 'Hafal' });
  return h('span', { class: 'pill bad', text: 'Perlu diulang' });
}

function verseEl(a) {
  const n = surah.number;
  const rec = state.progress.items[ayahKey(n, a.n)];
  const memorized = rec?.status === 'memorized';
  const el = h('article', { class: 'verse', id: `ayah-${a.n}`, dataset: { ayah: a.n, sig: signature(rec) } },
    h('div', { class: 'verse-head' },
      h('span', { class: 'num', 'aria-label': `Ayat ${a.n}`, text: a.n }),
      statusPill(rec),
      h('span', { class: 'spacer' }),
      h('div', { class: 'actions' },
        h('button', { class: 'ghost', 'aria-label': `Putar ayat ${a.n}`, onclick: () => playFrom(a.n, a.n) }, '▶'),
        h('button', { class: 'ghost', onclick: () => { setLast(n, a.n); openSetoran(surah, a.n); } }, '🎙 Setor'),
        h('button', { class: memorized ? 'secondary' : '', onclick: () => mark(a.n, GRADES.LANCAR) }, memorized ? '✓ Lancar' : '✓ Hafal'),
        h('button', { class: 'ghost', onclick: () => mark(a.n, GRADES.LUPA) }, '↺ Ulang'),
        rec ? h('button', { class: 'ghost', 'aria-label': `Hapus status ayat ${a.n}`, title: 'Hapus status', onclick: () => reset(a.n) }, '✕') : null,
      ),
    ),
    h('div', { class: 'arabic text', lang: 'ar', dir: 'rtl', title: 'Ketuk untuk menampilkan/menyembunyikan' },
      h('span', { class: 'full', text: a.text }),
      h('span', { class: 'hint', text: firstLetterHint(a.text) }),
    ),
    h('p', { class: 'translation', text: a.translation || 'Terjemahan belum tersedia.' }),
  );
  $('.text', el).addEventListener('click', () => { if (state.settings.hideMode !== 'show') el.classList.toggle('revealed'); });
  return el;
}

function refreshVerse(ayah) {
  const old = document.getElementById(`ayah-${ayah}`);
  const a = surah?.ayahs.find(x => x.n === ayah);
  if (!old || !a) return;
  const el = verseEl(a);
  el.className = old.className;
  old.replaceWith(el);
  observer?.observe(el);
}

function mark(ayah, grade) {
  gradeAyah(surah.number, ayah, grade);
  setLast(surah.number, ayah);
  toast(grade === GRADES.LANCAR ? `Ayat ${ayah} ditandai hafal. Murajaah dijadwalkan otomatis.` : `Ayat ${ayah} masuk daftar murajaah hari ini.`);
}

function reset(ayah) {
  removeAyah(state.progress, surah.number, ayah);
  replaceProgress(state.progress);
}

function playFrom(from, to) {
  const items = surah.ayahs.filter(a => a.n >= from && a.n <= to).map(a => ({ surah: surah.number, ayah: a.n, global: a.global }));
  setLast(surah.number, from);
  player.play(items, { repeatEach: state.settings.repeatEach, loop: from !== to && state.settings.loopRange, reciter: state.settings.reciter });
}

function applyDisplay() {
  const box = $('#verses');
  box.classList.remove('mode-show', 'mode-hint', 'mode-hide');
  box.classList.add(`mode-${state.settings.hideMode}`);
  box.classList.toggle('no-trans', !state.settings.showTranslation);
  $$('.verse.revealed', box).forEach(v => v.classList.remove('revealed'));
  $$('.seg button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === state.settings.hideMode)));
  $('#toggleTranslation').checked = state.settings.showTranslation;
}

function fillRange() {
  const opts = () => surah.ayahs.map(a => h('option', { value: a.n, text: a.n }));
  $('#rangeFrom').replaceChildren(...opts());
  $('#rangeTo').replaceChildren(...opts());
  $('#rangeTo').value = String(Math.min(surah.ayahs.length, 5));
}

function watchPosition() {
  observer?.disconnect();
  observer = new IntersectionObserver(entries => {
    const visible = entries.filter(e => e.isIntersecting).map(e => Number(e.target.dataset.ayah));
    if (!visible.length || !surah) return;
    clearTimeout(lastSaveTimer);
    lastSaveTimer = setTimeout(() => setLast(surah.number, Math.min(...visible)), 600);
  }, { rootMargin: '-35% 0px -55% 0px' });
  $$('.verse').forEach(v => observer.observe(v));
}

export async function showSurah(n, focusAyah = null) {
  n = Math.min(114, Math.max(1, Number(n) || 1));
  if (surah?.number === n) { if (focusAyah) focus(focusAyah); return; }
  const token = ++loadToken;
  $('#surahSelect').value = String(n);
  $('#verses').replaceChildren(...Array.from({ length: 3 }, () => h('div', { class: 'skeleton' })));
  $('#bismillah').classList.add('hidden');
  $('#sourceStatus').textContent = 'Memuat surah…';
  const meta = surahMeta(n);
  $('#h-belajar').textContent = meta ? `${n}. ${meta.englishName}` : `Surah ${n}`;
  try {
    const { surah: data, source } = await getSurah(n);
    if (token !== loadToken) return;
    surah = data;
    $('#sourceStatus').textContent = source === 'network' ? 'Dimuat dari internet dan disimpan untuk offline.' : '';
  } catch {
    if (token !== loadToken) return;
    surah = null;
    $('#sourceStatus').textContent = '';
    $('#verses').replaceChildren(h('div', { class: 'card empty' },
      h('div', { class: 'big', text: '📡' }),
      h('p', { text: 'Surah ini belum tersimpan di perangkat. Sambungkan internet lalu coba lagi.' }),
      h('button', { onclick: () => showSurah(n, focusAyah), text: 'Coba lagi' })));
    return;
  }
  $('#h-belajar').textContent = meta ? `${n}. ${meta.englishName}` : `${n}. ${surah.englishName}`;
  $('#surahArabic').textContent = surah.name || meta?.name || '';
  $('#surahMeta').textContent = [meta?.translation, `${surah.ayahs.length} ayat`, meta?.type === 'Medinan' ? 'Madaniyah' : meta?.type === 'Meccan' ? 'Makkiyah' : null].filter(Boolean).join(' · ');
  $('#bismillah').classList.toggle('hidden', !surah.ayahs[0]?.bismillah);
  $('#verses').replaceChildren(...surah.ayahs.map(verseEl));
  applyDisplay();
  fillRange();
  watchPosition();
  if (focusAyah) focus(focusAyah);
  else { window.scrollTo({ top: 0 }); setLast(n, 1); }
}

function focus(ayah) {
  const el = document.getElementById(`ayah-${ayah}`);
  if (!el) return;
  $$('.verse.focus').forEach(v => v.classList.remove('focus'));
  el.classList.add('focus');
  requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

export function initReader() {
  const go = d => { const n = (surah?.number || Number($('#surahSelect').value) || 1) + d; if (n >= 1 && n <= 114) location.hash = `#/belajar/${n}`; };
  $('#prevSurah').onclick = () => go(-1);
  $('#nextSurah').onclick = () => go(1);
  $('#surahSelect').onchange = e => { location.hash = `#/belajar/${e.target.value}`; };
  $$('.seg button').forEach(b => b.onclick = () => { saveSettings({ hideMode: b.dataset.mode }); applyDisplay(); });
  $('#toggleTranslation').onchange = e => { saveSettings({ showTranslation: e.target.checked }); applyDisplay(); };
  $('#repeatEach').value = String(state.settings.repeatEach);
  $('#repeatEach').onchange = e => saveSettings({ repeatEach: Number(e.target.value) });
  $('#loopRange').checked = state.settings.loopRange;
  $('#loopRange').onchange = e => saveSettings({ loopRange: e.target.checked });
  $('#rangeFrom').onchange = () => { if (Number($('#rangeTo').value) < Number($('#rangeFrom').value)) $('#rangeTo').value = $('#rangeFrom').value; };
  $('#playRange').onclick = () => {
    if (!surah) return;
    const from = Number($('#rangeFrom').value), to = Math.max(from, Number($('#rangeTo').value));
    playFrom(from, to);
  };
  onPlayer(s => {
    $$('.verse.playing').forEach(v => v.classList.remove('playing'));
    if (s.status === 'idle' || !s.item || s.item.surah !== surah?.number) return;
    const el = document.getElementById(`ayah-${s.item.ayah}`);
    if (!el) return;
    el.classList.add('playing');
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight - 140) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  on(type => { if (type === 'progress' && surah) $$('.verse').forEach(v => refreshVerseIfChanged(v)); });
}

// Sinkronkan tampilan ayat bila progres berubah (tombol, popup setoran, impor, dsb.).
function refreshVerseIfChanged(v) {
  const ayah = Number(v.dataset.ayah);
  if (v.dataset.sig !== signature(state.progress.items[ayahKey(surah.number, ayah)])) refreshVerse(ayah);
}
