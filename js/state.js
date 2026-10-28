// Status aplikasi bersama: pengaturan, progres, daftar surah, dan event perubahan.
import { emptyProgress, migrateV1, gradeAyah as grade } from './progress.js';
import { localDate } from './dates.js';

const PROGRESS_KEY = 'aitahfiz-progress-v2', LEGACY_KEY = 'aitahfiz-progress-v1', SETTINGS_KEY = 'aitahfiz-settings-v1';

export const DEFAULT_SETTINGS = {
  dailyTarget: 5, reciter: 'ar.alafasy', fontSize: 30, theme: 'auto',
  showTranslation: true, hideMode: 'show', repeatEach: 3, loopRange: false,
};

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function loadProgress() {
  const p = read(PROGRESS_KEY);
  if (p?.version === 2) return { ...emptyProgress(), ...p };
  const legacy = read(LEGACY_KEY);
  if (legacy) {
    const migrated = migrateV1(legacy);
    write(PROGRESS_KEY, migrated);
    return migrated;
  }
  return emptyProgress();
}

const listeners = new Set();

export const state = {
  settings: { ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) || {}) },
  progress: loadProgress(),
  surahList: [],
  online: navigator.onLine,
};

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(type, detail) { for (const fn of listeners) fn(type, detail); }

export function saveProgress() {
  if (!write(PROGRESS_KEY, state.progress)) emit('storage-error');
  emit('progress');
}

export function saveSettings(patch) {
  Object.assign(state.settings, patch);
  write(SETTINGS_KEY, state.settings);
  emit('settings', patch);
}

export function gradeAyah(s, a, g) {
  const rec = grade(state.progress, s, a, g, localDate());
  saveProgress();
  return rec;
}

export function replaceProgress(p) {
  state.progress = p;
  saveProgress();
}

export function setLast(surah, ayah) {
  state.progress.last = { surah, ayah };
  write(PROGRESS_KEY, state.progress);
}

export function surahMeta(n) {
  return state.surahList.find(s => s.number === n);
}

export function surahLabel(n) {
  const m = surahMeta(n);
  return m ? m.englishName : `Surah ${n}`;
}
