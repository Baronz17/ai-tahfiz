// Model data progres (murni, tanpa akses DOM/penyimpanan) + migrasi dari format MVP v1.
import { localDate, addDays } from './dates.js';
import { newRecord, review, GRADES } from './srs.js';

export const TOTAL_AYAH = 6236;

export function emptyProgress() {
  return { version: 2, items: {}, activity: {}, last: { surah: 1, ayah: 1 }, bookmarks: {} };
}

const validRef = (s, a) => s >= 1 && s <= 114 && a >= 1 && a <= 286;

// Penanda: { "s:a": { at } }. Mengembalikan true bila sekarang tertanda.
export function toggleBookmark(p, s, a, now = Date.now()) {
  p.bookmarks ||= {};
  const key = ayahKey(s, a);
  if (p.bookmarks[key]) { delete p.bookmarks[key]; return false; }
  p.bookmarks[key] = { at: now };
  return true;
}

// Daftar penanda, terbaru lebih dulu.
export function listBookmarks(p) {
  return Object.entries(p.bookmarks || {})
    .map(([k, v]) => { const [surah, ayah] = parseKey(k); return { surah, ayah, at: Number(v?.at) || 0 }; })
    .filter(b => validRef(b.surah, b.ayah))
    .sort((x, y) => y.at - x.at);
}

export const ayahKey = (s, a) => `${s}:${a}`;
export const parseKey = k => k.split(':').map(Number);

function bump(p, today, field) {
  const day = p.activity[today] || (p.activity[today] = { memorized: 0, reviewed: 0 });
  day[field] = (day[field] || 0) + 1;
}

export function gradeAyah(p, s, a, grade, today = localDate(), now = Date.now()) {
  const key = ayahKey(s, a);
  const before = p.items[key];
  const wasMemorized = before?.status === 'memorized';
  const rec = review(before, grade, today, now);
  p.items[key] = rec;
  if (!wasMemorized && rec.status === 'memorized') bump(p, today, 'memorized');
  else bump(p, today, 'reviewed');
  return rec;
}

export function removeAyah(p, s, a) {
  delete p.items[ayahKey(s, a)];
}

export function stats(p, today = localDate()) {
  const entries = Object.entries(p.items);
  const memorized = entries.filter(([, r]) => r.status === 'memorized');
  const due = entries.filter(([, r]) => r.due && r.due <= today)
    .sort(([ka, a], [kb, b]) => a.due.localeCompare(b.due) || compareKeys(ka, kb));
  const upcoming = entries.filter(([, r]) => r.due && r.due > today && r.due <= addDays(today, 7)).length;
  return {
    memorized: memorized.length,
    learning: entries.length - memorized.length,
    memorizedToday: p.activity[today]?.memorized || 0,
    reviewedToday: p.activity[today]?.reviewed || 0,
    due: due.map(([k]) => k),
    upcoming,
    percent: Math.min(100, memorized.length / TOTAL_AYAH * 100),
    streak: streak(p.activity, today),
  };
}

export function compareKeys(a, b) {
  const [sa, aa] = parseKey(a), [sb, ab] = parseKey(b);
  return sa - sb || aa - ab;
}

function active(day) { return day && ((day.memorized || 0) + (day.reviewed || 0) > 0); }

// Hari berturut-turut dengan aktivitas. Hari ini yang belum ada aktivitas tidak memutus streak.
export function streak(activity, today = localDate()) {
  let d = active(activity[today]) ? today : addDays(today, -1), n = 0;
  while (active(activity[d])) { n++; d = addDays(d, -1); }
  return n;
}

export function perSurah(p) {
  const out = {};
  for (const [k, r] of Object.entries(p.items)) {
    const [s] = parseKey(k);
    const o = out[s] || (out[s] = { memorized: 0, learning: 0 });
    r.status === 'memorized' ? o.memorized++ : o.learning++;
  }
  return out;
}

// Format v1: { known: {"s:a": {at}}, review: {"s:a": ts}, activity: {"YYYY-MM-DD(UTC)": true} }
export function migrateV1(old, today = localDate()) {
  const p = emptyProgress();
  for (const [k, v] of Object.entries(old?.known || {})) {
    if (!/^\d+:\d+$/.test(k)) continue;
    const at = Number(v?.at) || Date.now();
    p.items[k] = { ...review(undefined, GRADES.LANCAR, localDate(new Date(at)), at) };
    if (p.items[k].due < today) p.items[k].due = today;
  }
  for (const [k, ts] of Object.entries(old?.review || {})) {
    if (!/^\d+:\d+$/.test(k) || p.items[k]) continue;
    p.items[k] = { ...newRecord(), due: today, lastAt: Number(ts) || null };
  }
  for (const d of Object.keys(old?.activity || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) p.activity[d] = { memorized: 0, reviewed: 1 };
  }
  for (const r of Object.values(p.items)) {
    if (r.memorizedAt) {
      const d = localDate(new Date(r.memorizedAt));
      const day = p.activity[d] || (p.activity[d] = { memorized: 0, reviewed: 0 });
      day.memorized++;
    }
  }
  return p;
}

// Validasi berkas impor (v2 atau ekspor v1). Melempar Error bila format tidak dikenali.
export function parseImport(json, today = localDate()) {
  const data = json?.progress ?? json;
  if (data?.version === 2 && data.items && typeof data.items === 'object') {
    const p = emptyProgress();
    for (const [k, r] of Object.entries(data.items)) {
      if (!/^\d+:\d+$/.test(k) || typeof r !== 'object' || !r) continue;
      const [s, a] = parseKey(k);
      if (s < 1 || s > 114 || a < 1 || a > 286) continue;
      const rec = { ...newRecord(), ...r };
      rec.status = rec.status === 'memorized' ? 'memorized' : 'learning';
      if (rec.due && !/^\d{4}-\d{2}-\d{2}$/.test(rec.due)) rec.due = today;
      p.items[k] = rec;
    }
    for (const [d, v] of Object.entries(data.activity || {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === 'object') {
        p.activity[d] = { memorized: Number(v.memorized) || 0, reviewed: Number(v.reviewed) || 0 };
      }
    }
    const s = Number(data.last?.surah), a = Number(data.last?.ayah);
    if (s >= 1 && s <= 114) p.last = { surah: s, ayah: a >= 1 ? a : 1 };
    for (const [k, v] of Object.entries(data.bookmarks || {})) {
      if (!/^\d+:\d+$/.test(k)) continue;
      const [bs, ba] = parseKey(k);
      if (validRef(bs, ba)) p.bookmarks[k] = { at: Number(v?.at) || Date.now() };
    }
    return p;
  }
  if (data && (data.known || data.review)) return migrateV1(data, today);
  throw new Error('Format berkas tidak dikenali.');
}
