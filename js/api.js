// Klien AlQuran Cloud API. Teks Al-Qur'an bersifat statis, jadi data yang sudah tersimpan
// dipakai lebih dulu (cache-first); jaringan hanya dipakai untuk surah yang belum tersimpan.
import * as db from './db.js';
import { splitBismillah } from './arabic.js';

export const API = 'https://api.alquran.cloud/v1';
export const TEXT_EDITION = 'quran-uthmani';
export const TRANSLATION_EDITION = 'id.indonesian';
const LIST_KEY = 'surah-list', surahKey = n => `surah-${n}`;

// hizbQuarter 1–240 → hizb 1–60.
const hizbOf = a => (a.hizbQuarter ? Math.ceil(a.hizbQuarter / 4) : null);

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j.code !== 200) throw new Error(j.status || 'API error');
  return j.data;
}

export async function getSurahList() {
  const cached = await db.get(LIST_KEY);
  if (cached?.length === 114) return { list: cached, source: 'cache' };
  const raw = await fetchJSON(`${API}/surah`);
  const list = raw.map(s => ({
    number: s.number, name: s.name, englishName: s.englishName,
    translation: s.englishNameTranslation, ayahs: s.numberOfAyahs, type: s.revelationType,
  }));
  await db.set(LIST_KEY, list);
  return { list, source: 'network' };
}

async function fetchEditions(n) {
  try {
    const [text, trans] = await fetchJSON(`${API}/surah/${n}/editions/${TEXT_EDITION},${TRANSLATION_EDITION}`);
    return { text, trans };
  } catch (e) {
    // Cadangan: dua permintaan terpisah, seperti versi MVP.
    const text = await fetchJSON(`${API}/surah/${n}/${TEXT_EDITION}`);
    const trans = await fetchJSON(`${API}/surah/${n}/${TRANSLATION_EDITION}`).catch(() => null);
    return { text, trans };
  }
}

export async function getSurah(n) {
  const cached = await db.get(surahKey(n));
  if (cached) return { surah: cached, source: 'cache' };
  const { text, trans } = await fetchEditions(n);
  const ayahs = text.ayahs.map((a, i) => {
    const { bismillah, text: t } = splitBismillah(n, a.numberInSurah, a.text);
    return {
      n: a.numberInSurah, global: a.number, juz: a.juz, page: a.page, hizb: hizbOf(a),
      text: t, bismillah, translation: trans?.ayahs?.[i]?.text || '',
    };
  });
  const surah = { number: n, name: text.name, englishName: text.englishName, ayahs, edition: TEXT_EDITION, savedAt: Date.now() };
  await db.set(surahKey(n), surah);
  return { surah, source: 'network' };
}

export async function cachedSurahNumbers() {
  return (await db.keys()).filter(k => /^surah-\d+$/.test(k)).map(k => Number(k.slice(6)));
}

// Memindahkan cache surah lama (localStorage, format MVP) ke IndexedDB lalu membebaskan kuota.
export async function migrateLegacyCache() {
  let old;
  try { old = JSON.parse(localStorage.getItem('aitahfiz-surah-cache-v1')); } catch { old = null; }
  if (old && typeof old === 'object') {
    for (const [n, d] of Object.entries(old)) {
      const num = Number(n);
      if (!d?.ayahs?.length || await db.get(surahKey(num))) continue;
      const ayahs = d.ayahs.map(a => {
        const { bismillah, text } = splitBismillah(num, a.numberInSurah, a.text);
        return { n: a.numberInSurah, global: a.number, juz: a.juz, page: a.page, hizb: hizbOf(a), text, bismillah, translation: a.translation || '' };
      });
      await db.set(surahKey(num), { number: num, name: d.name, englishName: d.englishName, ayahs, edition: TEXT_EDITION, savedAt: Date.now() });
    }
  }
  try { localStorage.removeItem('aitahfiz-surah-cache-v1'); localStorage.removeItem('aitahfiz-surah-list'); } catch { /* abaikan */ }
}

export function audioUrl(reciter, globalNumber, bitrate = 128) {
  return `https://cdn.islamic.network/quran/audio/${bitrate}/${reciter}/${globalNumber}.mp3`;
}
