// Normalisasi dan pencocokan teks Arab untuk membandingkan hasil transkripsi suara dengan teks ayat.
// Ini perbandingan kata secara kasar, BUKAN penilaian tajwid atau makhraj.

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function normalizeArabic(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Kerangka kata tanpa huruf panjang/hamzah: menjembatani perbedaan rasm Utsmani dan ejaan imla'i
// (mis. ملك/مالك, الصلوه/الصلاه).
function skeleton(word) {
  return word.replace(/[اويء]/g, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function ratio(a, b) {
  const len = Math.max(a.length, b.length);
  return len ? 1 - levenshtein(a, b) / len : 1;
}

export function wordSimilarity(a, b) {
  let sim = ratio(a, b);
  const sa = skeleton(a), sb = skeleton(b);
  if (sa.length >= 2 && sb.length >= 2) sim = Math.max(sim, ratio(sa, sb) * 0.95);
  return sim;
}

export const MATCH_THRESHOLD = 0.6;

// Pecah teks ayat menjadi kata tampilan + bentuk ternormalisasi; token tanpa huruf (mis. ۞) dibuang.
export function tokenize(text) {
  return String(text || '').split(/\s+/)
    .map(display => ({ display, norm: normalizeArabic(display) }))
    .filter(t => t.norm);
}

// Penjajaran (alignment) kata target vs kata yang terdengar dengan pemrograman dinamis:
// memaksimalkan jumlah kemiripan pasangan kata yang cocok, urutan tetap dijaga.
export function compareRecitation(targetText, spokenText) {
  const target = tokenize(targetText);
  const spoken = normalizeArabic(spokenText).split(' ').filter(Boolean);
  const n = target.length, m = spoken.length;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const sims = Array.from({ length: n }, (_, i) => spoken.map(w => wordSimilarity(target[i].norm, w)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = sims[i - 1][j - 1];
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], s >= MATCH_THRESHOLD ? dp[i - 1][j - 1] + s : -Infinity);
    }
  }
  const words = target.map(t => ({ word: t.display, matched: false, heard: null }));
  let i = n, j = m, used = 0;
  while (i > 0 && j > 0) {
    const s = sims[i - 1][j - 1];
    if (s >= MATCH_THRESHOLD && dp[i][j] === dp[i - 1][j - 1] + s) {
      words[i - 1].matched = true;
      words[i - 1].heard = spoken[j - 1];
      used++; i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  const matched = words.filter(w => w.matched).length;
  return { words, matched, total: n, extra: m - used, score: n ? matched / n : 0 };
}

const BISMILLAH = normalizeArabic('بسم الله الرحمن الرحيم');

// Sumber teks Utsmani menyertakan basmalah di awal ayat 1 untuk surah selain Al-Fatihah.
// Basmalah itu bukan bagian dari ayat 1 (kecuali Al-Fatihah), jadi dipisahkan.
export function splitBismillah(surah, ayah, text) {
  if (surah === 1 || ayah !== 1) return { bismillah: false, text };
  const words = String(text).trim().split(/\s+/);
  if (words.length > 4 && normalizeArabic(words.slice(0, 4).join(' ')) === BISMILLAH) {
    return { bismillah: true, text: words.slice(4).join(' ') };
  }
  return { bismillah: false, text };
}

// Petunjuk huruf awal: tiap kata dipotong ke huruf pertamanya (beserta harakat) + elipsis.
// Untuk kata berawalan alif-lam (ال/ٱل) disertakan juga huruf sesudahnya, karena "ٱ…" saja tidak membantu.
const CLUSTER = /[\u0621-\u064A\u0671][\u064B-\u065F\u0670]*/g;
export function firstLetterHint(text) {
  return String(text || '').split(/\s+/).filter(Boolean).map(w => {
    const clusters = w.match(CLUSTER);
    if (!clusters) return w;
    const n = /^[اأإآٱ]/.test(clusters[0]) && clusters[1]?.[0] === 'ل' ? 3 : 1;
    return clusters.length <= n ? w : clusters.slice(0, n).join('') + '…';
  }).join(' ');
}
