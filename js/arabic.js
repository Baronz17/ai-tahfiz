// Normalisasi dan pencocokan teks Arab untuk membandingkan hasil transkripsi suara dengan teks ayat.
// Ini perbandingan kata secara kasar, BUKAN penilaian tajwid atau makhraj.

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

// Buang harakat & tanda Al-Qur'an saja (huruf tetap). Untuk teks di elemen yang memakai font sistem
// (mis. <select>), yang sering tidak punya glyph tanda khusus seperti U+06E1.
export const stripMarks = text => String(text || '').replace(MARKS, '');

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

// Huruf yang bunyinya mirip dan sering tertukar oleh pengenal suara. Pertukaran di dalam satu grup
// diberi biaya kecil. Catatan: ini membuat pencocokan toleran terhadap kesalahan makhraj — yang memang
// tidak dinilai aplikasi ini.
const CONFUSABLE = ['سصث', 'ذزظ', 'ضدظ', 'تط', 'كق', 'هح', 'اعء', 'غخ'];
const CONFUSABLE_PAIRS = new Set(CONFUSABLE.flatMap(g => [...g].flatMap(a => [...g].map(b => a + b))));
const SOFT = 'اويء'; // huruf panjang/hamzah: sering hilang atau bertambah pada transkripsi

function distance(a, b, phonetic) {
  if (a === b) return 0;
  const del = c => (phonetic && SOFT.includes(c) ? 0.5 : 1);
  const sub = (x, y) => (x === y ? 0 : phonetic && CONFUSABLE_PAIRS.has(x + y) ? 0.35 : 1);
  let prev = new Float64Array(b.length + 1), cur = new Float64Array(b.length + 1);
  for (let j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + del(b[j - 1]);
  for (let i = 1; i <= a.length; i++) {
    const ca = a[i - 1], da = del(ca);
    cur[0] = prev[0] + da;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + da, cur[j - 1] + del(b[j - 1]), prev[j - 1] + sub(ca, b[j - 1]));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function ratio(a, b, phonetic) {
  const len = Math.max(a.length, b.length);
  return len ? Math.max(0, 1 - distance(a, b, phonetic) / len) : 1;
}

// Kosakata Al-Qur'an berulang, jadi hasil perbandingan kata disimpan (memo) — mempercepat banyak sekali.
const simCache = new Map();
export function wordSimilarity(a, b, phonetic = true) {
  if (a === b) return 1;
  const key = `${phonetic ? 1 : 0}${a}|${b}`;
  let sim = simCache.get(key);
  if (sim !== undefined) return sim;
  sim = ratio(a, b, phonetic);
  const sa = skeleton(a), sb = skeleton(b);
  if (sa.length >= 2 && sb.length >= 2) sim = Math.max(sim, ratio(sa, sb, phonetic) * 0.95);
  if (simCache.size > 100000) simCache.clear();
  simCache.set(key, sim);
  return sim;
}

// Tingkat kepekaan pencocokan suara.
export const PROFILES = {
  ketat: { threshold: 0.75, phonetic: false },
  normal: { threshold: 0.6, phonetic: true },
  longgar: { threshold: 0.5, phonetic: true },
};
export const MATCH_THRESHOLD = PROFILES.normal.threshold;

// Kata pendek (≤ 3 huruf) butuh kemiripan lebih tinggi: satu huruf beda sudah mengubah banyak,
// dan tanpa ini "الله" dianggap cocok dengan "له" (0,63).
const SHORT_MIN = 0.75;
export const thresholdFor = (a, b, threshold) => (Math.min(a.length, b.length) <= 3 ? Math.max(threshold, SHORT_MIN) : threshold);

// Pecah teks ayat menjadi kata tampilan + bentuk ternormalisasi; token tanpa huruf (mis. ۞) dibuang.
export function tokenize(text) {
  return String(text || '').split(/\s+/)
    .map(display => ({ display, norm: normalizeArabic(display) }))
    .filter(t => t.norm);
}

// Penjajaran (alignment) kata target vs kata yang terdengar dengan pemrograman dinamis:
// memaksimalkan jumlah kemiripan kata target yang cocok, urutan tetap dijaga.
// Selain 1-ke-1, menangani kata yang dipecah pengenal suara (1 target = 2 ucapan) dan kata yang
// digabung (2 target = 1 ucapan, mis. "يا أيها" → "ياايها").
// Hasil: [indeksTarget, ucapanAwal, ucapanAkhir] urut menaik.
const SKIP_T = 0, MATCH = 1, SPLIT = 2, JOIN = 3, SKIP_S = 4;
export function alignWords(targetNorms, spoken, profile = PROFILES.normal) {
  const { threshold, phonetic } = profile;
  const joinMin = Math.max(threshold, 0.75); // gabung/pecah butuh bukti lebih kuat
  const t = targetNorms, sp = spoken, n = t.length, m = sp.length;
  const sim = (a, b) => wordSimilarity(a, b, phonetic);
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const mv = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      if (!i && !j) continue;
      // Urutan preferensi saat seri: lewati target dulu → ucapan dipasangkan ke kemunculan paling awal.
      let best = -Infinity, move = SKIP_T;
      if (i) best = dp[i - 1][j];
      if (i && j) {
        const s = sim(t[i - 1], sp[j - 1]);
        if (s >= thresholdFor(t[i - 1], sp[j - 1], threshold) && dp[i - 1][j - 1] + s > best) { best = dp[i - 1][j - 1] + s; move = MATCH; }
      }
      if (i && j > 1) {
        const s = sim(t[i - 1], sp[j - 2] + sp[j - 1]);
        if (s >= joinMin && dp[i - 1][j - 2] + s > best) { best = dp[i - 1][j - 2] + s; move = SPLIT; }
      }
      if (i > 1 && j) {
        const s = sim(t[i - 2] + t[i - 1], sp[j - 1]);
        if (s >= joinMin && dp[i - 2][j - 1] + 2 * s > best) { best = dp[i - 2][j - 1] + 2 * s; move = JOIN; }
      }
      if (j && dp[i][j - 1] > best) { best = dp[i][j - 1]; move = SKIP_S; }
      dp[i][j] = best;
      mv[i][j] = move;
    }
  }
  const pairs = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    switch (mv[i][j]) {
      case MATCH: pairs.push([i - 1, j - 1, j - 1]); i--; j--; break;
      case SPLIT: pairs.push([i - 1, j - 2, j - 1]); i--; j -= 2; break;
      case JOIN: pairs.push([i - 1, j - 1, j - 1], [i - 2, j - 1, j - 1]); i -= 2; j--; break;
      case SKIP_S: j--; break;
      default: i--;
    }
  }
  return pairs.reverse();
}

export function compareRecitation(targetText, spokenText, profile = PROFILES.normal) {
  const target = tokenize(targetText);
  const spoken = normalizeArabic(spokenText).split(' ').filter(Boolean);
  const words = target.map(t => ({ word: t.display, matched: false, heard: null }));
  const pairs = alignWords(target.map(t => t.norm), spoken, profile);
  const used = new Set();
  for (const [ti, a, b] of pairs) {
    words[ti].matched = true;
    words[ti].heard = spoken.slice(a, b + 1).join(' ');
    for (let k = a; k <= b; k++) used.add(k);
  }
  const n = target.length;
  return { words, matched: pairs.length, total: n, extra: spoken.length - used.size, score: n ? pairs.length / n : 0 };
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
