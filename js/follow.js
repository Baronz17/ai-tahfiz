// Mesin "ikuti bacaan": melacak posisi pembaca di dalam rangkaian kata surah berdasarkan transkripsi suara.
// Murni (tanpa DOM) agar bisa diuji. Kata = { ayah, norm, display }.
import { normalizeArabic, alignWords, wordSimilarity, PROFILES } from './arabic.js';

const LOOKAHEAD = 4; // kata tambahan di jendela pencocokan; membatasi lompatan tak sengaja
const BACK = 8;      // kata "ragu" sejauh ini di belakang kursor masih bisa diselamatkan bila dibaca ulang
const LOG_MAX = 30;

const toWords = text => normalizeArabic(text).split(' ').filter(Boolean);

export class Follower {
  constructor(words, profile = PROFILES.normal) {
    this.words = words;
    this.profile = profile;
    this.ranges = new Map(); // ayah -> [kataPertama, kataTerakhir]
    words.forEach((w, i) => {
      const r = this.ranges.get(w.ayah);
      if (r) r[1] = i; else this.ranges.set(w.ayah, [i, i]);
    });
    this.log = []; // teks final yang terdengar (terbaru di akhir), untuk diagnosis
    this.reset(0);
  }

  reset(at = 0) {
    this.start = this.cursor = at;
    this.done = new Set();     // kata yang terdengar cocok
    this.pending = new Set();  // terlewat tetapi belum dipastikan ("ragu"); bisa selamat bila dibaca ulang
    this.mistakes = new Set(); // terlewat/berbeda dan sudah dipastikan
    this.peeked = new Set();   // kata yang dibuka manual (dibantu)
    this.preview = new Set();  // cocok sementara dari hasil interim
    this.heardAs = new Map();  // indeks kata salah -> teks yang terdengar di posisinya
  }

  // Mulai (ulang) dari kata `at`: status sesudah titik itu dihapus, sebelum itu dipertahankan.
  setStart(at) {
    for (const set of [this.done, this.pending, this.mistakes, this.peeked]) for (const i of [...set]) if (i >= at) set.delete(i);
    for (const i of [...this.heardAs.keys()]) if (i >= at) this.heardAs.delete(i);
    this.start = this.cursor = Math.max(0, Math.min(at, this.words.length));
    this.preview = new Set();
  }

  firstWordOf(ayah) { return this.ranges.get(ayah)?.[0] ?? 0; }

  // Pasangan [indeksKataAbsolut, ucapanAwal, ucapanAkhir] untuk jendela mulai `pos`.
  alignAt(pos, spoken, extra = 0) {
    const end = Math.min(this.words.length, pos + extra + spoken.length + LOOKAHEAD);
    return alignWords(this.words.slice(pos, end).map(w => w.norm), spoken, this.profile).map(([t, a, b]) => [pos + t, a, b]);
  }

  // Cari posisi lain di surah yang cocok dengan ucapan (pembaca melompat tanpa memilih ayat).
  resync(spoken) {
    const need = Math.max(3, Math.ceil(spoken.length * 0.6));
    let best = -1, bestScore = 0, bestDist = Infinity;
    const { threshold, phonetic } = this.profile;
    const near = (i, w) => i < this.words.length && wordSimilarity(this.words[i].norm, w, phonetic) >= threshold;
    for (let p = 0; p < this.words.length; p++) {
      // Saringan murah sebelum penjajaran penuh: kata ke-1 cocok dan kata ke-2 muncul tak jauh sesudahnya.
      if (!near(p, spoken[0])) continue;
      if (spoken.length > 1 && ![1, 2, 3].some(d => near(p + d, spoken[1]))) continue;
      const m = this.alignAt(p, spoken);
      if (m.length < need || m[0][0] !== p) continue;
      const dist = p >= this.cursor ? p - this.cursor : this.words.length + this.cursor - p; // utamakan ke depan
      if (m.length > bestScore || (m.length === bestScore && dist < bestDist)) { best = p; bestScore = m.length; bestDist = dist; }
    }
    return best;
  }

  // Awal jendela: mundur ke kata "ragu" terdekat agar bacaan ulang bisa menyelamatkannya.
  windowStart() {
    let from = this.cursor;
    for (const i of this.pending) if (i < from && i >= this.cursor - BACK) from = i;
    return from;
  }

  // Pilih alternatif transkripsi yang paling cocok dengan teks yang diharapkan.
  pick(texts) {
    const from = this.windowStart();
    let best = null;
    for (const text of texts) {
      const spoken = toWords(text);
      if (!spoken.length) continue;
      const pairs = this.alignAt(from, spoken, this.cursor - from);
      if (!best || pairs.length > best.pairs.length) best = { text, spoken, pairs, from };
    }
    return best;
  }

  // Proses satu hasil transkripsi (string atau daftar alternatif).
  // Final: kursor maju, kata terlewat jadi "ragu". Interim: hanya pratinjau.
  // Kata yang sudah terlewati kursor tidak dicocokkan lagi (kecuali kata ragu), jadi hasil kumulatif aman.
  hear(texts, isFinal) {
    texts = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
    const dirty = new Set([...this.preview, this.cursor]);
    this.preview = new Set();
    const res = { dirty, jumped: false, heard: texts[0] || '' };
    if (this.cursor >= this.words.length) return this.finish(res);
    let best = this.pick(texts);
    if (!best) return this.finish(res);
    res.heard = best.text;
    if (isFinal) this.log = [...this.log, best.text].slice(-LOG_MAX);
    const forward = () => best.pairs.filter(([i]) => i >= this.cursor);
    if (isFinal && best.spoken.length >= 3 && forward().length < best.spoken.length * 0.3) {
      const p = this.resync(best.spoken);
      if (p >= 0 && p !== this.cursor) {
        this.cursor = p;
        best = { ...best, pairs: this.alignAt(p, best.spoken), from: p };
        res.jumped = true;
      }
    }
    if (!isFinal) {
      for (const [i] of best.pairs) if (i >= this.cursor || this.pending.has(i)) { this.preview.add(i); dirty.add(i); }
      return this.finish(res);
    }
    // Kata ragu yang kini terdengar: selamat.
    for (const [i] of best.pairs) {
      if (i < this.cursor && this.pending.delete(i)) { this.done.add(i); this.heardAs.delete(i); dirty.add(i); }
    }
    const fwd = forward();
    if (fwd.length) {
      // Catat kata terlewat beserta ucapan yang terdengar di celah yang sama.
      // Ucapan yang sudah dipakai pasangan di belakang kursor tidak ikut dihitung sebagai "terdengar".
      const usedBack = best.pairs.filter(([i]) => i < this.cursor).map(([, , b]) => b);
      let prevT = this.cursor - 1, prevS = usedBack.length ? Math.max(...usedBack) : -1;
      for (const [i, a, b] of fwd) {
        if (i > prevT + 1) {
          const gap = best.spoken.slice(prevS + 1, a).join(' ');
          for (let k = prevT + 1; k < i; k++) { this.pending.add(k); if (gap) this.heardAs.set(k, gap); dirty.add(k); }
        }
        this.done.add(i);
        dirty.add(i);
        if (i > prevT) prevT = i;
        prevS = Math.max(prevS, b);
      }
      this.cursor = prevT + 1;
      dirty.add(this.cursor);
    }
    // Kata ragu yang sudah jauh di belakang dipastikan salah.
    for (const i of [...this.pending]) if (i < this.cursor - BACK) { this.pending.delete(i); this.mistakes.add(i); dirty.add(i); }
    return this.finish(res);
  }

  finish(res) { return { ...res, dirty: [...res.dirty] }; }

  // Akhir sesi: semua kata ragu dipastikan salah.
  settle() {
    const dirty = [...this.pending];
    for (const i of dirty) this.mistakes.add(i);
    this.pending.clear();
    return dirty;
  }

  peekWord() {
    if (this.cursor >= this.words.length) return [];
    this.peeked.add(this.cursor);
    this.cursor++;
    return [this.cursor - 1, this.cursor];
  }

  peekAyah() {
    if (this.cursor >= this.words.length) return [];
    const [, to] = this.ranges.get(this.words[this.cursor].ayah);
    const dirty = [];
    for (let i = this.cursor; i <= to; i++) { this.peeked.add(i); dirty.push(i); }
    this.cursor = to + 1;
    dirty.push(this.cursor);
    return dirty;
  }

  // Kata ragu dihitung salah dalam ringkasan.
  summary() {
    const read = [], clean = [], problems = [];
    const isErr = i => this.mistakes.has(i) || this.pending.has(i);
    for (const [ayah, [from, to]] of this.ranges) {
      let covered = true, anyDone = false;
      const err = [], peek = [];
      for (let i = from; i <= to; i++) {
        if (isErr(i)) err.push(i);
        else if (this.peeked.has(i)) peek.push(i);
        else if (this.done.has(i)) anyDone = true;
        else covered = false;
      }
      if (err.length || peek.length) problems.push({ ayah, err, peek, heard: [...new Set(err.map(i => this.heardAs.get(i)).filter(Boolean))] });
      if (covered && anyDone) { read.push(ayah); if (!err.length && !peek.length) clean.push(ayah); }
    }
    return { read, clean, problems, mistakeCount: this.mistakes.size + this.pending.size, peekCount: this.peeked.size };
  }
}
