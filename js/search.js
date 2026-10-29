// Inti pencarian (murni, tanpa DOM): referensi "2:255", nama surah (ejaan Latin longgar), dan teks ayat.
import { normalizeArabic } from './arabic.js';

const ARABIC = /[؀-ۿ]/;

// Kunci ejaan Latin longgar agar ejaan Indonesia dan Inggris bertemu:
// Yasin/Yaa-Siin, At-Taubah/At-Tawba, Thaha/Taa-Haa, Adz-Dzariyat/Adh-Dhaariyat, Al-Mu'minun/Al-Mu'minoon.
export function nameKey(text) {
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/sy|sh/g, 's').replace(/dz|dh/g, 'd').replace(/ts|th/g, 't')
    .replace(/w/g, 'u').replace(/o/g, 'u').replace(/q/g, 'k').replace(/e/g, 'i')
    .replace(/(.)\1+/g, '$1')
    .replace(/h$/, '');
}

// Buang kata sandang di depan: "Al-", "An-", "Ash-", "Adh-", "Asy-", "Adz-" ... (bukan "Aal-i-Imraan").
const stripArticle = text => String(text || '').replace(/^\s*a[lnrstdz][hy]?[\s'-]+/i, '');

function surahKeys(s) {
  return { full: nameKey(s.englishName), bare: nameKey(stripArticle(s.englishName)), ar: normalizeArabic(s.name).replace(/^سوره\s*/, '') };
}

export function findSurahs(query, surahList, limit = 6) {
  const q = String(query || '').trim();
  if (!q) return [];
  if (/^\d{1,3}$/.test(q)) return surahList.filter(s => s.number === Number(q));
  if (ARABIC.test(q)) {
    const qa = normalizeArabic(q).replace(/^سوره\s*/, '');
    return qa ? surahList.filter(s => surahKeys(s).ar.includes(qa)).slice(0, limit) : [];
  }
  const qk = nameKey(stripArticle(q)), qf = nameKey(q);
  if (qk.length < 3) return [];
  const scored = [];
  for (const s of surahList) {
    const k = surahKeys(s);
    let score = 0;
    if (k.bare === qk || k.full === qf) score = 3;
    else if (k.bare.startsWith(qk) || qk.startsWith(k.bare)) score = 2;
    else if (k.full.includes(qf) || k.bare.includes(qk)) score = 1;
    if (score) scored.push({ s, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.s.number - b.s.number).slice(0, limit).map(x => x.s);
}

// Referensi langsung: "2:255", "2 255", "2.255", "baqarah 255", "yasin:71".
export function parseRef(query, surahList) {
  const q = String(query || '').trim();
  let m = q.match(/^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/);
  let surah = null, ayah = null;
  if (m) { surah = surahList.find(s => s.number === Number(m[1])) || (Number(m[1]) <= 114 ? { number: Number(m[1]) } : null); ayah = Number(m[2]); }
  else if ((m = q.match(/^(.+?)\s*[:.\s]\s*(\d{1,3})$/))) { surah = findSurahs(m[1], surahList, 1)[0] || null; ayah = Number(m[2]); }
  if (!surah || surah.number < 1 || surah.number > 114 || ayah < 1) return null;
  if (surah.ayahs && ayah > surah.ayahs) return null;
  return { surah: surah.number, ayah };
}

// Indeks: [{ s, a, ar (Arab ternormalisasi), tr (terjemahan huruf kecil), text, translation }].
export function buildIndex(surahs) {
  const items = [];
  for (const surah of surahs) {
    for (const a of surah.ayahs) {
      items.push({ s: surah.number, a: a.n, ar: normalizeArabic(a.text), tr: (a.translation || '').toLowerCase(), text: a.text, translation: a.translation || '' });
    }
  }
  return items;
}

// Arab: frasa (tanpa harakat) harus muncul. Latin: semua kata (≥ 2 huruf) harus ada di terjemahan.
export function searchText(query, index, limit = 50) {
  const q = String(query || '').trim();
  if (ARABIC.test(q)) {
    const qa = normalizeArabic(q);
    if (qa.replace(/\s/g, '').length < 2) return { kind: 'ar', terms: [], results: [], total: 0 };
    const all = index.filter(it => it.ar.includes(qa));
    return { kind: 'ar', terms: [qa], results: all.slice(0, limit), total: all.length };
  }
  const terms = q.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  if (!terms.length || q.length < 3) return { kind: 'lat', terms, results: [], total: 0 };
  const all = index.filter(it => terms.every(t => it.tr.includes(t)));
  return { kind: 'lat', terms, results: all.slice(0, limit), total: all.length };
}

// Potongan terjemahan di sekitar kata pertama yang cocok: [{ text, hit }].
export function snippet(text, terms, radius = 70) {
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map(t => lower.indexOf(t)).filter(i => i >= 0), Infinity);
  const start = first === Infinity ? 0 : Math.max(0, first - radius);
  const end = Math.min(text.length, (first === Infinity ? 0 : first) + radius * 2);
  const piece = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  if (!terms.length) return [{ text: piece, hit: false }];
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return piece.split(re).filter(Boolean).map(part => ({ text: part, hit: terms.includes(part.toLowerCase()) }));
}
