// Pencarian ayat dan penanda (bookmark): tampilan lembar + navigasi ke ayat.
import { $, h, toast, openSheet, closeSheet } from './dom.js';
import { getSurah, cachedSurahNumbers } from './api.js';
import { state, surahLabel, saveProgress } from './state.js';
import { toggleBookmark, listBookmarks, ayahKey } from './progress.js';
import { findSurahs, parseRef, buildIndex, searchText, snippet } from './search.js';

// Buka ayat di halaman Belajar (juga bila alamatnya sama dengan yang sedang terbuka).
export function goToAyah(surah, ayah = 1) {
  closeSheet();
  const hash = `#/belajar/${surah}/${ayah}`;
  if (location.hash === hash) dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

const fmtDate = ts => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

// ---------- Penanda ----------
export const isBookmarked = (s, a) => !!state.progress.bookmarks?.[ayahKey(s, a)];

export function toggleBookmarkUI(s, a) {
  const on = toggleBookmark(state.progress, s, a);
  saveProgress();
  toast(on ? `🔖 Penanda disimpan: ${surahLabel(s)} · Ayat ${a}` : 'Penanda dihapus.');
  return on;
}

function bookmarkRow(b, onRemove) {
  return h('div', { class: 'list-row' },
    h('button', { type: 'button', class: 'list-main', onclick: () => goToAyah(b.surah, b.ayah) },
      h('strong', { text: `${surahLabel(b.surah)} · Ayat ${b.ayah}` }),
      h('small', { class: 'muted', text: b.at ? `Ditandai ${fmtDate(b.at)}` : '' })),
    onRemove ? h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': `Hapus penanda ${surahLabel(b.surah)} ayat ${b.ayah}`, onclick: onRemove }, '✕') : null);
}

// current = { surah, ayah } posisi yang bisa langsung ditandai (dari halaman Belajar).
export function openBookmarks(current = null) {
  const render = () => {
    const last = state.progress.last;
    const marks = listBookmarks(state.progress);
    const body = [
      h('p', { class: 'eyebrow', text: 'Terakhir dibaca (otomatis)' }),
      bookmarkRow({ surah: last.surah, ayah: last.ayah, at: 0 }),
    ];
    if (current) {
      const on = isBookmarked(current.surah, current.ayah);
      body.push(h('button', { type: 'button', class: on ? 'secondary' : '', onclick: () => { toggleBookmarkUI(current.surah, current.ayah); render(); } },
        on ? `Hapus penanda Ayat ${current.ayah}` : `🔖 Tandai ${surahLabel(current.surah)} · Ayat ${current.ayah}`));
    }
    body.push(h('p', { class: 'eyebrow', text: `Penanda (${marks.length})` }));
    body.push(marks.length
      ? h('div', { class: 'list' }, marks.map(b => bookmarkRow(b, () => { toggleBookmark(state.progress, b.surah, b.ayah); saveProgress(); render(); })))
      : h('p', { class: 'muted small', text: 'Belum ada penanda. Ketuk nomor ayat di mushaf lalu pilih "Tandai", atau gunakan tombol di atas.' }));
    openSheet({ title: 'Penanda', subtitle: 'Simpan tempat bacaan untuk dilanjutkan nanti', body });
  };
  render();
}

export function renderHomeBookmarks() {
  const marks = listBookmarks(state.progress).slice(0, 3);
  const box = $('#homeBookmarks');
  box.replaceChildren(...(marks.length
    ? marks.map(b => bookmarkRow(b))
    : [h('p', { class: 'muted small', text: 'Belum ada penanda. Ketuk nomor ayat saat membaca lalu pilih "Tandai".' })]));
}

// ---------- Pencarian ----------
let index = null, indexedCount = -1, searchTimer = null, searchToken = 0;

async function ensureIndex() {
  const nums = (await cachedSurahNumbers()).sort((a, b) => a - b);
  if (index && nums.length === indexedCount) return { index, count: nums.length };
  const surahs = [];
  for (const n of nums) { try { surahs.push((await getSurah(n)).surah); } catch { /* lewati */ } }
  index = buildIndex(surahs);
  indexedCount = nums.length;
  return { index, count: nums.length };
}

function resultRow({ title, sub, arabic, parts, onclick }) {
  return h('button', { type: 'button', class: 'result', onclick },
    h('strong', { text: title }),
    sub ? h('small', { class: 'muted', text: sub }) : null,
    arabic ? h('span', { class: 'result-ar', lang: 'ar', dir: 'rtl', text: arabic }) : null,
    parts ? h('span', { class: 'result-tr' }, parts.map(p => (p.hit ? h('mark', { text: p.text }) : p.text))) : null);
}

async function runSearch(q) {
  const token = ++searchToken;
  const out = $('#searchResults');
  const query = q.trim();
  if (!query) {
    out.replaceChildren(h('div', { class: 'muted small search-help' },
      h('p', { text: 'Contoh pencarian:' }),
      h('ul', {},
        h('li', { text: '2:255 atau "yasin 71" — langsung ke ayat' }),
        h('li', { text: 'Al-Kahfi, Thaha, الملك — nama surah' }),
        h('li', { text: 'الصمد — teks Arab (tanpa harakat juga bisa)' }),
        h('li', { text: 'sabar, maha esa — kata dalam terjemahan' }))));
    return;
  }
  const sections = [];
  const ref = parseRef(query, state.surahList);
  if (ref) {
    sections.push(h('p', { class: 'eyebrow', text: 'Lompat ke ayat' }),
      resultRow({ title: `${surahLabel(ref.surah)} · Ayat ${ref.ayah}`, sub: `Surah ${ref.surah}`, onclick: () => goToAyah(ref.surah, ref.ayah) }));
  }
  const surahs = ref ? [] : findSurahs(query, state.surahList);
  if (surahs.length) {
    sections.push(h('p', { class: 'eyebrow', text: 'Surah' }),
      ...surahs.map(s => resultRow({ title: `${s.number}. ${s.englishName}`, sub: `${s.ayahs} ayat · ${s.translation || ''}`, arabic: s.name, onclick: () => goToAyah(s.number, 1) })));
  }
  out.replaceChildren(...sections, h('p', { class: 'muted small', text: 'Mencari teks ayat…' }));
  const { index: idx, count } = await ensureIndex();
  if (token !== searchToken) return;
  const found = ref ? { results: [], total: 0 } : searchText(query, idx);
  if (found.results.length) {
    sections.push(h('p', { class: 'eyebrow', text: `Ayat (${found.total}${found.total > found.results.length ? `, ${found.results.length} ditampilkan` : ''})` }),
      ...found.results.map(r => resultRow({
        title: `${surahLabel(r.s)} · Ayat ${r.a}`,
        arabic: r.text,
        parts: found.kind === 'lat' ? snippet(r.translation, found.terms) : null,
        onclick: () => goToAyah(r.s, r.a),
      })));
  }
  if (!sections.length) sections.push(h('p', { class: 'muted', text: 'Tidak ditemukan.' }));
  if (count < 114 && !ref) {
    sections.push(h('p', { class: 'muted small search-note' },
      `Pencarian teks hanya mencakup ${count} dari 114 surah yang tersimpan di perangkat. `,
      h('a', { href: '#/progres', onclick: () => closeSheet(), text: 'Unduh semua surah' }),
      ' untuk mencari di seluruh Al-Qur\'an.'));
  }
  out.replaceChildren(...sections);
}

export function openSearch(initial = '') {
  const input = h('input', { type: 'search', id: 'searchInput', placeholder: 'Surah, 2:255, kata Arab atau terjemahan…', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Cari ayat' });
  input.value = initial;
  input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(input.value), 180); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('#searchResults .result'); first?.click(); } });
  openSheet({ title: 'Cari', subtitle: '', body: [input, h('div', { id: 'searchResults', class: 'results', 'aria-live': 'polite' })] });
  $('#sheet').classList.add('sheet-top');
  input.focus();
  runSearch(initial);
}
