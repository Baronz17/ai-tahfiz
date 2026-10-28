// Penjadwalan murajaah berbasis pengulangan berjarak (varian sederhana SM-2) per ayat.
import { addDays } from './dates.js';

export const GRADES = { LUPA: 0, RAGU: 1, LANCAR: 2 };
export const GRADE_LABEL = ['Lupa', 'Ragu', 'Lancar'];

const MIN_EASE = 1.3, MAX_EASE = 3.0, START_EASE = 2.5;

export function newRecord() {
  return { status: 'learning', ease: START_EASE, interval: 0, due: null, reps: 0, lapses: 0, lastGrade: null, lastAt: null, memorizedAt: null };
}

export function nextInterval(rec, grade) {
  rec = rec || newRecord();
  if (grade === GRADES.LUPA) return 0;
  if (grade === GRADES.RAGU) return Math.max(1, Math.round(rec.interval * 1.2));
  const reps = rec.reps + 1;
  if (reps === 1) return 1;
  if (reps === 2) return 3;
  return Math.max(rec.interval + 1, Math.round(rec.interval * rec.ease));
}

export function review(rec, grade, today, now = Date.now()) {
  const r = { ...newRecord(), ...(rec || {}) };
  const interval = nextInterval(r, grade);
  if (grade === GRADES.LUPA) {
    if (r.status === 'memorized') r.lapses++;
    r.status = 'learning';
    r.reps = 0;
    r.ease = Math.max(MIN_EASE, r.ease - 0.2);
  } else if (grade === GRADES.RAGU) {
    r.ease = Math.max(MIN_EASE, r.ease - 0.15);
  } else {
    r.reps++;
    r.ease = Math.min(MAX_EASE, r.ease + 0.05);
    if (r.status !== 'memorized') { r.status = 'memorized'; r.memorizedAt = now; }
  }
  r.interval = interval;
  r.due = addDays(today, interval);
  r.lastGrade = grade;
  r.lastAt = now;
  return r;
}

export function describeInterval(days) {
  if (days <= 0) return 'hari ini';
  if (days === 1) return 'besok';
  if (days < 30) return `${days} hari`;
  if (days < 365) return `${Math.round(days / 30)} bln`;
  return `${(days / 365).toFixed(1)} thn`;
}
