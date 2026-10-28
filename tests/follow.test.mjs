import test from 'node:test';
import assert from 'node:assert/strict';
import { Follower } from '../js/follow.js';
import { tokenize } from '../js/arabic.js';

function stream(ayahs) {
  return ayahs.flatMap((t, i) => tokenize(t).map(w => ({ ayah: i + 1, norm: w.norm, display: w.display })));
}
const IKHLAS = stream(['قُلْ هُوَ ٱللَّهُ أَحَدٌ', 'ٱللَّهُ ٱلصَّمَدُ', 'لَمْ يَلِدْ وَلَمْ يُولَدْ', 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ']);
const FATIHAH = stream(['بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ', 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'مَٰلِكِ يَوْمِ ٱلدِّينِ', 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ', 'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ']);

test('follow: final result advances cursor and marks words done', () => {
  const f = new Follower(IKHLAS);
  f.hear('قل هو الله احد', true);
  assert.equal(f.cursor, 4);
  assert.deepEqual([...f.done].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.equal(f.mistakes.size, 0);
});

test('follow: interim only previews, final commits', () => {
  const f = new Follower(IKHLAS);
  f.hear('قل هو', false);
  assert.equal(f.cursor, 0);
  assert.deepEqual([...f.preview], [0, 1]);
  f.hear('قل هو الله', true);
  assert.equal(f.cursor, 3);
  assert.equal(f.preview.size, 0);
});

test('follow: skipped words become mistakes', () => {
  const f = new Follower(IKHLAS);
  f.hear('قل هو الله احد', true);
  f.hear('لم يلد', true); // melewatkan "الله الصمد"
  assert.deepEqual([...f.mistakes].sort((a, b) => a - b), [4, 5]);
  assert.equal(f.cursor, 8);
  const s = f.summary();
  assert.deepEqual(s.read, [1]); // ayat 2 terlewat seluruhnya: bukan "dibaca"
  assert.deepEqual(s.clean, [1]);
  assert.equal(s.problems[0].ayah, 2);
});

test('follow: cumulative (repeated) transcripts do not double count', () => {
  const f = new Follower(IKHLAS);
  f.hear('قل هو', true);
  f.hear('قل هو الله احد', true); // gaya Chrome Android: hasil final mengulang teks sebelumnya
  assert.equal(f.cursor, 4);
  assert.equal(f.mistakes.size, 0);
});

test('follow: duplicate word matches the earliest occurrence', () => {
  const f = new Follower(IKHLAS);
  f.hear('قل هو الله', true);
  assert.equal(f.cursor, 3);
  assert.equal(f.mistakes.size, 0);
});

test('follow: noise does not move the cursor', () => {
  const f = new Follower(IKHLAS);
  f.hear('صباح الخير', true);
  assert.equal(f.cursor, 0);
  assert.equal(f.mistakes.size, 0);
});

test('follow: resync jumps to where the reader actually is, without mistakes', () => {
  const f = new Follower(FATIHAH);
  const { jumped } = f.hear('اهدنا الصراط المستقيم', true);
  assert.equal(jumped, true);
  assert.equal(f.cursor, FATIHAH.length);
  assert.equal(f.mistakes.size, 0);
});

test('follow: peek word/ayah and setStart', () => {
  const f = new Follower(IKHLAS);
  f.peekWord();
  assert.equal(f.cursor, 1);
  f.peekAyah();
  assert.equal(f.cursor, 4);
  assert.equal(f.peeked.size, 4);
  f.setStart(f.firstWordOf(3));
  assert.equal(f.cursor, 6);
  assert.equal(f.peeked.size, 4); // sebelum titik mulai tetap
  f.setStart(0);
  assert.equal(f.peeked.size, 0);
});
