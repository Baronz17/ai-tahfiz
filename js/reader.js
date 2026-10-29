// Tampilan Belajar: baca surah (daftar ayat atau mushaf), mode hafalan, audio berulang, tandai hafalan.
import { $, $$, h, toast, openSheet, closeSheet } from './dom.js';
import { getSurah } from './api.js';
import { state, on, saveSettings, gradeAyah, setLast, surahMeta, replaceProgress } from './state.js';
import { ayahKey, removeAyah } from './progress.js';
import { GRADES } from './srs.js';
import { firstLetterHint } from './arabic.js';
import { localDate } from './dates.js';
import { player, onPlayer } from './player.js';
import { openSetoran } from './setoran.js';
import * as mushaf from './mushaf.js';
import { isBookmarked, toggleBookmarkUI, openBookmarks } from './finder.js';

let surah = null, loadToken = 0, observer = null, lastSaveTimer = null;

export function currentSurah() { return surah; }

const isMushaf = () => state.settings.view === 'mushaf';
const ayahEl = n => (isMushaf() ? $(`#mushaf .ay[data-ayah="${n}"]`) : document.getElementById(`ayah-${n}`));

const signature = (rec, bm) => (rec ? `${rec.status}|${rec.due}` : '') + (bm ? '|bm' : '');

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
  const bm = isBookmarked(n, a.n);
  const el = h('article', { class: 'verse', id: `ayah-${a.n}`, dataset: { ayah: a.n, sig: signature(rec, bm) } },
    h('div', { class: 'verse-head' },
      h('span', { class: 'num', 'aria-label': `Ayat ${a.n}`, text: a.n }),
      statusPill(rec),
      h('span', { class: 'spacer' }),
      h('div', { class: 'actions' },
        h('button', { class: 'ghost', 'aria-label': `Putar ayat ${a.n}`, onclick: () => playFrom(a.n, a.n) }, '▶'),
        h('button', { class: 'ghost', onclick: () => { setLast(n, a.n); openSetoran(surah, a.n); } }, '🎙 Setor'),
        h('button', { class: memorized ? 'secondary' : '', onclick: () => mark(a.n, GRADES.LANCAR) }, memorized ? '✓ Lancar' : '✓ Hafal'),
        h('button', { class: 'ghost', onclick: () => mark(a.n, GRADES.LUPA) }, '↺ Ulang'),
        h('button', { class: bm ? 'secondary' : 'ghost', 'aria-pressed': String(bm), 'aria-label': bm ? `Hapus penanda ayat ${a.n}` : `Tandai ayat ${a.n}`, title: 'Penanda', onclick: () => toggleBookmarkUI(n, a.n) }, '🔖'),
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
  $$(isMushaf() ? '#mushaf .ay' : '#verses .verse').forEach(v => observer.observe(v));
}

// Gambar surah sesuai tampilan aktif (daftar/mushaf).
function render() {
  const m = isMushaf();
  document.body.classList.toggle('mushaf-view', m);
  $('#verses').classList.toggle('hidden', m);
  $('#mushaf').classList.toggle('hidden', !m);
  $('#mushafInfo').classList.toggle('hidden', !m);
  $('#listTools').classList.toggle('hidden', m);
  $('#bismillah').classList.toggle('hidden', m || !surah.ayahs[0]?.bismillah);
  if (m) {
    $('#verses').replaceChildren();
    mushaf.renderMushaf(surah, { hide: state.settings.hideMode === 'hide' });
  } else {
    mushaf.stopFollow(false);
    $('#mushaf').replaceChildren();
    $('#verses').replaceChildren(...surah.ayahs.map(verseEl));
    applyDisplay();
  }
  watchPosition();
  updateBar();
}

export async function showSurah(n, focusAyah = null) {
  n = Math.min(114, Math.max(1, Number(n) || 1));
  if (surah?.number === n) { if (focusAyah) focus(focusAyah); return; }
  const token = ++loadToken;
  mushaf.stopFollow(false);
  $('#surahSelect').value = String(n);
  const loading = isMushaf() ? $('#mushaf') : $('#verses');
  loading.replaceChildren(...Array.from({ length: 3 }, () => h('div', { class: 'skeleton' })));
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
    updateBar();
    $('#sourceStatus').textContent = '';
    loading.replaceChildren(h('div', { class: 'card empty' },
      h('div', { class: 'big', text: '📡' }),
      h('p', { text: 'Surah ini belum tersimpan di perangkat. Sambungkan internet lalu coba lagi.' }),
      h('button', { onclick: () => showSurah(n, focusAyah), text: 'Coba lagi' })));
    return;
  }
  $('#h-belajar').textContent = meta ? `${n}. ${meta.englishName}` : `${n}. ${surah.englishName}`;
  $('#surahArabic').textContent = surah.name || meta?.name || '';
  $('#surahMeta').textContent = [meta?.translation, `${surah.ayahs.length} ayat`, meta?.type === 'Medinan' ? 'Madaniyah' : meta?.type === 'Meccan' ? 'Makkiyah' : null].filter(Boolean).join(' · ');
  render();
  fillRange();
  if (focusAyah) {
    if (isMushaf() && state.settings.hideMode === 'hide') mushaf.startFrom(focusAyah);
    focus(focusAyah);
  } else { window.scrollTo({ top: 0 }); setLast(n, 1); }
}

function focus(ayah, smooth = true) {
  const el = ayahEl(ayah);
  if (!el) return;
  $$('.verse.focus, .ay.focus').forEach(v => v.classList.remove('focus'));
  el.classList.add('focus');
  requestAnimationFrame(() => el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' }));
}

// ---------- Bilah bawah: kesalahan, ganti tampilan, sembunyikan ayat, intip ----------
function updateBar() {
  const m = isMushaf(), hide = state.settings.hideMode === 'hide';
  $('#rbView').setAttribute('aria-pressed', String(m));
  $('#rbView').setAttribute('aria-label', m ? 'Ganti ke tampilan daftar ayat' : 'Ganti ke tampilan mushaf');
  $('#rbHide').setAttribute('aria-pressed', String(hide));
  $('#rbMistakes').classList.toggle('hidden', !m);
  const n = mushaf.mistakeCount();
  $('#rbMistakeCount').textContent = n;
  $('#rbMistakeCount').classList.toggle('hidden', !m || !n);
  const peek = m && mushaf.canPeek();
  $('#rbPeekWord').classList.toggle('hidden', !(m && hide));
  $('#rbPeekAyah').classList.toggle('hidden', !(m && hide));
  $('#rbPeekWord').disabled = $('#rbPeekAyah').disabled = !peek;
  updateFab();
}

export function updateFab() {
  const fab = $('#openSetoran');
  const reading = !$('#view-belajar').classList.contains('hidden');
  fab.classList.toggle('round', reading);
  fab.classList.toggle('live', mushaf.isFollowing());
  fab.setAttribute('aria-pressed', String(mushaf.isFollowing()));
  fab.setAttribute('aria-label', !reading ? 'Setoran suara'
    : !isMushaf() ? 'Setoran suara untuk ayat ini'
    : mushaf.isFollowing() ? 'Hentikan mikrofon' : 'Mulai baca dengan mikrofon');
}

function toggleView() {
  if (!surah) return;
  const at = state.progress.last.surah === surah.number ? state.progress.last.ayah : 1;
  mushaf.stopFollow(false);
  saveSettings({ view: isMushaf() ? 'list' : 'mushaf' });
  render();
  if (isMushaf() && state.settings.hideMode === 'hide') mushaf.startFrom(at);
  focus(at, false);
}

function toggleHide() {
  const on = state.settings.hideMode !== 'hide';
  saveSettings({ hideMode: on ? 'hide' : 'show' });
  if (isMushaf()) mushaf.setHidden(on); else applyDisplay();
  updateBar();
  toast(`Sembunyikan ayat: ${on ? 'aktif' : 'nonaktif'}`, 1600);
}

// Tombol mikrofon di halaman Belajar. Mushaf: ikuti bacaan langsung. Daftar: popup setoran.
export function readerMic() {
  if (!surah) return false;
  if (isMushaf()) mushaf.toggleFollow();
  else {
    const last = state.progress.last;
    openSetoran(surah, last.surah === surah.number ? last.ayah : 1);
  }
  return true;
}

export function leaveReader() { mushaf.stopFollow(false); updateFab(); }

// Menu saat nomor ayat di mushaf diketuk.
function ayahMenu(n) {
  const a = surah.ayahs.find(x => x.n === n);
  const rec = state.progress.items[ayahKey(surah.number, n)];
  const hidden = state.settings.hideMode === 'hide';
  const act = (label, fn, cls = 'ghost') => h('button', { type: 'button', class: cls, onclick: () => { closeSheet(); fn(); } }, label);
  setLast(surah.number, n);
  openSheet({
    title: `${surahMeta(surah.number)?.englishName || surah.englishName} · Ayat ${n}`,
    subtitle: [a.page && `Halaman ${a.page}`, a.juz && `Juz ${a.juz}`].filter(Boolean).join(' · '),
    body: [
      statusPill(rec),
      hidden ? null : h('p', { class: 'arabic', lang: 'ar', dir: 'rtl', text: a.text }),
      h('p', { class: 'translation', text: a.translation || 'Terjemahan belum tersedia.' }),
      h('div', { class: 'sheet-actions' },
        act('🎯 Hafalkan mulai ayat ini', () => {
          if (!hidden) { saveSettings({ hideMode: 'hide' }); mushaf.setHidden(true, n); } else mushaf.startFrom(n);
          updateBar();
          focus(n);
          toast('Ayat disembunyikan. Tekan mikrofon lalu mulai membaca.', 3000);
        }, ''),
        act('▶ Putar audio', () => playFrom(n, n)),
        act('🎙 Setor & nilai ayat', () => openSetoran(surah, n)),
        act(rec?.status === 'memorized' ? '✓ Lancar' : '✓ Tandai hafal', () => mark(n, GRADES.LANCAR)),
        act('↺ Perlu diulang', () => mark(n, GRADES.LUPA)),
        act(isBookmarked(surah.number, n) ? '🔖 Hapus penanda' : '🔖 Tandai (penanda)', () => toggleBookmarkUI(surah.number, n)),
        rec ? act('✕ Hapus status', () => reset(n)) : null),
    ],
  });
}

export function initReader() {
  const go = d => { const n = (surah?.number || Number($('#surahSelect').value) || 1) + d; if (n >= 1 && n <= 114) location.hash = `#/belajar/${n}`; };
  $('#prevSurah').onclick = () => go(-1);
  $('#nextSurah').onclick = () => go(1);
  $('#surahSelect').onchange = e => { location.hash = `#/belajar/${e.target.value}`; };
  $$('.seg button').forEach(b => b.onclick = () => { saveSettings({ hideMode: b.dataset.mode }); applyDisplay(); updateBar(); });
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
  $('#rbView').onclick = toggleView;
  $('#miBookmark').onclick = () => {
    if (!surah) return;
    const last = state.progress.last;
    openBookmarks({ surah: surah.number, ayah: last.surah === surah.number ? last.ayah : 1 });
  };
  $('#rbHide').onclick = toggleHide;
  $('#rbMistakes').onclick = () => mushaf.openMistakes(n => focus(n));
  $('#rbPeekWord').onclick = () => mushaf.peekWord();
  $('#rbPeekAyah').onclick = () => mushaf.peekAyah();
  mushaf.initMushaf({ onMarker: ayahMenu, onChange: updateBar, onFollow: updateFab });
  onPlayer(s => {
    $$('.verse.playing, .ay.playing').forEach(v => v.classList.remove('playing'));
    if (s.status === 'idle' || !s.item || s.item.surah !== surah?.number) return;
    const el = ayahEl(s.item.ayah);
    if (!el) return;
    el.classList.add('playing');
    const r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight - 160) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  on(type => {
    if (type !== 'progress' || !surah) return;
    if (isMushaf()) mushaf.updateMarkers();
    else $$('.verse').forEach(v => refreshVerseIfChanged(v));
  });
}

// Sinkronkan tampilan ayat bila progres berubah (tombol, popup setoran, impor, dsb.).
function refreshVerseIfChanged(v) {
  const ayah = Number(v.dataset.ayah);
  if (v.dataset.sig !== signature(state.progress.items[ayahKey(surah.number, ayah)], isBookmarked(surah.number, ayah))) refreshVerse(ayah);
}
