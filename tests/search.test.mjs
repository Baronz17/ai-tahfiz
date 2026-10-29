import test from 'node:test';
import assert from 'node:assert/strict';
import { nameKey, findSurahs, parseRef, buildIndex, searchText, snippet } from '../js/search.js';
import { emptyProgress, toggleBookmark, listBookmarks, parseImport } from '../js/progress.js';

// Ejaan seperti dari AlQuran Cloud (englishName) + nama Arab.
const LIST = [
  [1, 'Al-Faatiha', 'سُورَةُ ٱلْفَاتِحَةِ', 7], [2, 'Al-Baqara', 'سُورَةُ البَقَرَةِ', 286], [3, 'Aal-i-Imraan', 'سُورَةُ آلِ عِمۡرَانَ', 200],
  [9, 'At-Tawba', 'سُورَةُ التَّوۡبَةِ', 129], [18, 'Al-Kahf', 'سُورَةُ الكَهۡفِ', 110], [20, 'Taa-Haa', 'سُورَةُ طه', 135],
  [23, 'Al-Muminoon', 'سُورَةُ المُؤۡمِنُونَ', 118], [36, 'Yaa-Seen', 'سُورَةُ يسٓ', 83], [51, 'Adh-Dhaariyat', 'سُورَةُ الذَّارِيَاتِ', 60],
  [91, 'Ash-Shams', 'سُورَةُ الشَّمۡسِ', 15], [112, 'Al-Ikhlaas', 'سُورَةُ الإِخۡلَاصِ', 4], [114, 'An-Naas', 'سُورَةُ النَّاسِ', 6],
].map(([number, englishName, name, ayahs]) => ({ number, englishName, name, ayahs }));
const first = q => findSurahs(q, LIST)[0]?.number;

test('search: Indonesian spellings find English-transliterated surah names', () => {
  assert.equal(first('Al-Fatihah'), 1);
  assert.equal(first('baqarah'), 2);
  assert.equal(first('Ali Imran'), 3);
  assert.equal(first('At-Taubah'), 9);
  assert.equal(first('Al Kahfi'), 18);
  assert.equal(first('Thaha'), 20);
  assert.equal(first("Al-Mu'minun"), 23);
  assert.equal(first('yasin'), 36);
  assert.equal(first('Adz-Dzariyat'), 51);
  assert.equal(first('Asy-Syams'), 91);
  assert.equal(first('ikhlas'), 112);
  assert.equal(first('An Nas'), 114);
  assert.equal(first('الكهف'), 18);
  assert.equal(first('36'), 36);
  assert.deepEqual(findSurahs('xy', LIST), [], 'kueri terlalu pendek');
});

test('search: references in several formats', () => {
  assert.deepEqual(parseRef('2:255', LIST), { surah: 2, ayah: 255 });
  assert.deepEqual(parseRef('36 71', LIST), { surah: 36, ayah: 71 });
  assert.deepEqual(parseRef('yasin 71', LIST), { surah: 36, ayah: 71 });
  assert.deepEqual(parseRef('Al-Baqarah:255', LIST), { surah: 2, ayah: 255 });
  assert.equal(parseRef('2:300', LIST), null, 'melebihi jumlah ayat');
  assert.equal(parseRef('115:1', LIST), null);
  assert.equal(parseRef('baqarah', LIST), null);
});

test('search: Arabic text ignores harakat, Latin matches all words in translation', () => {
  const index = buildIndex([{ number: 112, ayahs: [
    { n: 1, text: 'قُلْ هُوَ ٱللَّهُ أَحَدٌ', translation: 'Katakanlah (Muhammad), "Dialah Allah, Yang Maha Esa.' },
    { n: 2, text: 'ٱللَّهُ ٱلصَّمَدُ', translation: 'Allah tempat meminta segala sesuatu.' },
  ] }]);
  assert.deepEqual(searchText('الصمد', index).results.map(r => r.a), [2]);
  assert.deepEqual(searchText('الله', index).results.map(r => r.a), [1, 2]);
  assert.deepEqual(searchText('maha esa', index).results.map(r => r.a), [1]);
  assert.deepEqual(searchText('allah meminta', index).results.map(r => r.a), [2]);
  assert.equal(searchText('zz', index).total, 0);
});

test('search: snippet marks every matched term', () => {
  const parts = snippet('Allah tempat meminta segala sesuatu.', ['allah', 'meminta']);
  assert.deepEqual(parts.filter(p => p.hit).map(p => p.text), ['Allah', 'meminta']);
  assert.equal(parts.map(p => p.text).join(''), 'Allah tempat meminta segala sesuatu.');
});

test('bookmarks: toggle, newest first, survive export/import', () => {
  const p = emptyProgress();
  assert.equal(toggleBookmark(p, 36, 71, 1000), true);
  assert.equal(toggleBookmark(p, 2, 255, 2000), true);
  assert.deepEqual(listBookmarks(p).map(b => `${b.surah}:${b.ayah}`), ['2:255', '36:71']);
  assert.equal(toggleBookmark(p, 36, 71), false);
  assert.deepEqual(listBookmarks(p).map(b => `${b.surah}:${b.ayah}`), ['2:255']);
  p.bookmarks['999:1'] = { at: 1 };
  const back = parseImport(JSON.parse(JSON.stringify({ progress: p })));
  assert.deepEqual(Object.keys(back.bookmarks), ['2:255']);
  assert.deepEqual(listBookmarks({}), [], 'data lama tanpa penanda');
});
