import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, addDays, diffDays } from '../js/dates.js';
import { normalizeArabic, compareRecitation, splitBismillah, firstLetterHint, tokenize } from '../js/arabic.js';
import { review, nextInterval, GRADES } from '../js/srs.js';
import { emptyProgress, gradeAyah, stats, streak, migrateV1, parseImport } from '../js/progress.js';

const FATIHAH_4 = 'مَٰلِكِ يَوْمِ ٱلدِّينِ';
const IKHLAS_1 = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ';

test('dates: local date arithmetic across month/year boundaries', () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(diffDays('2026-11-02', '2026-10-28'), 5);
});

test('arabic: normalization strips harakat and unifies alef forms', () => {
  assert.equal(normalizeArabic('ٱلْحَمْدُ لِلَّهِ'), 'الحمد لله');
  assert.equal(normalizeArabic(FATIHAH_4), 'ملك يوم الدين');
  assert.equal(normalizeArabic('۞ إِنَّ'), 'ان');
});

test('arabic: tokenize drops tokens without letters', () => {
  assert.deepEqual(tokenize('۞ وَٱلشَّمْسِ').map(t => t.norm), ['والشمس']);
});

test('arabic: recitation comparison tolerates Uthmani vs imla\'i spelling', () => {
  const r = compareRecitation(FATIHAH_4, 'مالك يوم الدين');
  assert.equal(r.matched, 3);
  assert.equal(r.score, 1);
  assert.equal(r.extra, 0);
});

test('arabic: recitation comparison flags missing words and extras in order', () => {
  const r = compareRecitation(FATIHAH_4, 'يوم الدين نعبد');
  assert.deepEqual(r.words.map(w => w.matched), [false, true, true]);
  assert.equal(r.extra, 1);
  const empty = compareRecitation(FATIHAH_4, '');
  assert.equal(empty.score, 0);
});

test('arabic: bismillah split only for ayah 1 outside Al-Fatihah', () => {
  const r = splitBismillah(112, 1, IKHLAS_1);
  assert.equal(r.bismillah, true);
  assert.equal(normalizeArabic(r.text), 'قل هو الله احد');
  assert.equal(splitBismillah(1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ').bismillah, false);
  assert.equal(splitBismillah(112, 2, 'ٱللَّهُ ٱلصَّمَدُ').bismillah, false);
});

test('arabic: first-letter hint keeps one letter per word', () => {
  assert.equal(firstLetterHint('قُلْ هُوَ'), 'قُ… هُ…');
  assert.equal(firstLetterHint('ٱلْحَمْدُ لِلَّهِ'), 'ٱلْحَ… لِ…');
  assert.equal(firstLetterHint('لَمْ'), 'لَ…');
  assert.equal(firstLetterHint('ق'), 'ق');
});

test('srs: lancar grows interval, lupa resets, ragu shrinks ease', () => {
  const t = '2026-10-28';
  let r = review(undefined, GRADES.LANCAR, t, 1);
  assert.equal(r.status, 'memorized'); assert.equal(r.interval, 1); assert.equal(r.due, '2026-10-29');
  r = review(r, GRADES.LANCAR, '2026-10-29', 2);
  assert.equal(r.interval, 3);
  r = review(r, GRADES.LANCAR, '2026-11-01', 3);
  assert.ok(r.interval >= 7, `interval ${r.interval}`);
  const ease = r.ease;
  const ragu = review(r, GRADES.RAGU, '2026-11-10', 4);
  assert.ok(ragu.ease < ease);
  const lupa = review(r, GRADES.LUPA, '2026-11-10', 5);
  assert.equal(lupa.status, 'learning'); assert.equal(lupa.due, '2026-11-10'); assert.equal(lupa.lapses, 1);
  assert.equal(nextInterval(undefined, GRADES.LUPA), 0);
});

test('progress: grading counts new memorization once per ayah', () => {
  const p = emptyProgress();
  gradeAyah(p, 1, 1, GRADES.LANCAR, '2026-10-28');
  gradeAyah(p, 1, 1, GRADES.LANCAR, '2026-10-28');
  gradeAyah(p, 1, 2, GRADES.LUPA, '2026-10-28');
  const s = stats(p, '2026-10-28');
  assert.equal(s.memorized, 1);
  assert.equal(s.memorizedToday, 1);
  assert.equal(s.reviewedToday, 2);
  assert.deepEqual(s.due, ['1:2']);
  assert.equal(s.streak, 1);
});

test('progress: streak survives a not-yet-active today, breaks on a gap', () => {
  const a = { '2026-10-25': { reviewed: 1 }, '2026-10-26': { reviewed: 2 }, '2026-10-27': { memorized: 1 } };
  assert.equal(streak(a, '2026-10-28'), 3);
  assert.equal(streak(a, '2026-10-29'), 0);
});

test('progress: migrates v1 data', () => {
  const at = new Date(2026, 9, 20, 10).getTime();
  const p = migrateV1({ known: { '1:1': { at } }, review: { '1:2': at, bad: 1 }, activity: { '2026-10-20': true } }, '2026-10-28');
  assert.equal(p.items['1:1'].status, 'memorized');
  assert.equal(p.items['1:1'].due, '2026-10-28');
  assert.equal(p.items['1:2'].status, 'learning');
  assert.equal(p.items.bad, undefined);
  assert.equal(p.activity['2026-10-20'].memorized, 1);
});

test('progress: import accepts v2 and v1 exports, rejects junk', () => {
  const p = emptyProgress();
  gradeAyah(p, 2, 255, GRADES.LANCAR, '2026-10-28');
  p.items['999:1'] = { status: 'memorized' };
  const back = parseImport(JSON.parse(JSON.stringify({ progress: p })), '2026-10-28');
  assert.ok(back.items['2:255']);
  assert.equal(back.items['999:1'], undefined);
  assert.ok(parseImport({ progress: { known: { '1:1': { at: 1 } }, review: {} } }).items['1:1']);
  assert.throws(() => parseImport({ hello: 1 }));
});
