// Mesin "ikuti bacaan": melacak posisi pembaca di dalam rangkaian kata surah berdasarkan transkripsi suara.
// Murni (tanpa DOM) agar bisa diuji. Kata = { ayah, norm, display }.
import { normalizeArabic, alignWords, wordSimilarity, MATCH_THRESHOLD } from './arabic.js';

const LOOKAHEAD = 4; // kata tambahan di jendela pencocokan; membatasi lompatan tak sengaja

export class Follower {
  constructor(words) {
    this.words = words;
    this.ranges = new Map(); // ayah -> [kataPertama, kataTerakhir]
    words.forEach((w, i) => {
      const r = this.ranges.get(w.ayah);
      if (r) r[1] = i; else this.ranges.set(w.ayah, [i, i]);
    });
    this.reset(0);
  }

  reset(at = 0) {
    this.start = this.cursor = at;
    this.done = new Set();     // kata yang terdengar cocok
    this.mistakes = new Set(); // kata yang terlewat/salah (ada kata sesudahnya yang sudah cocok)
    this.peeked = new Set();   // kata yang dibuka manual (dibantu)
    this.preview = new Set();  // cocok sementara dari hasil interim
  }

  // Mulai (ulang) dari kata `at`: status sesudah titik itu dihapus, sebelum itu dipertahankan.
  setStart(at) {
    for (const set of [this.done, this.mistakes, this.peeked]) for (const i of [...set]) if (i >= at) set.delete(i);
    this.start = this.cursor = Math.max(0, Math.min(at, this.words.length));
    this.preview = new Set();
  }

  firstWordOf(ayah) { return this.ranges.get(ayah)?.[0] ?? 0; }

  alignAt(pos, spoken) {
    const end = Math.min(this.words.length, pos + spoken.length + LOOKAHEAD);
    return alignWords(this.words.slice(pos, end).map(w => w.norm), spoken).map(([t]) => pos + t);
  }

  // Cari posisi lain di surah yang cocok dengan ucapan (pembaca melompat tanpa memilih ayat).
  resync(spoken) {
    const need = Math.max(3, Math.ceil(spoken.length * 0.6));
    let best = -1, bestScore = 0, bestDist = Infinity;
    for (let p = 0; p < this.words.length; p++) {
      if (wordSimilarity(this.words[p].norm, spoken[0]) < MATCH_THRESHOLD) continue;
      const m = this.alignAt(p, spoken);
      if (m.length < need || m[0] !== p) continue;
      const dist = p >= this.cursor ? p - this.cursor : this.words.length + this.cursor - p; // utamakan ke depan
      if (m.length > bestScore || (m.length === bestScore && dist < bestDist)) { best = p; bestScore = m.length; bestDist = dist; }
    }
    return best;
  }

  // Proses satu hasil transkripsi. Final: kursor maju, kata terlewat dicatat salah. Interim: hanya pratinjau.
  // Kata yang sudah terlewati kursor tidak dicocokkan lagi, jadi hasil berulang/kumulatif aman.
  hear(text, isFinal) {
    const spoken = normalizeArabic(text).split(' ').filter(Boolean);
    const dirty = new Set([...this.preview, this.cursor]);
    this.preview = new Set();
    if (!spoken.length || this.cursor >= this.words.length) return { dirty: [...dirty], jumped: false };
    let matched = this.alignAt(this.cursor, spoken), jumped = false;
    if (isFinal && spoken.length >= 3 && matched.length < spoken.length * 0.3) {
      const p = this.resync(spoken);
      if (p >= 0 && p !== this.cursor) { this.cursor = p; matched = this.alignAt(p, spoken); jumped = true; }
    }
    if (!matched.length) return { dirty: [...dirty], jumped: false };
    if (isFinal) {
      const hit = new Set(matched), last = matched[matched.length - 1];
      for (let i = this.cursor; i <= last; i++) { (hit.has(i) ? this.done : this.mistakes).add(i); dirty.add(i); }
      this.cursor = last + 1;
      dirty.add(this.cursor);
    } else {
      for (const i of matched) { this.preview.add(i); dirty.add(i); }
    }
    return { dirty: [...dirty], jumped };
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

  summary() {
    const read = [], clean = [], problems = [];
    for (const [ayah, [from, to]] of this.ranges) {
      let covered = true, anyDone = false;
      const err = [], peek = [];
      for (let i = from; i <= to; i++) {
        if (this.mistakes.has(i)) err.push(i);
        else if (this.peeked.has(i)) peek.push(i);
        else if (this.done.has(i)) anyDone = true;
        else covered = false;
      }
      if (err.length || peek.length) problems.push({ ayah, err, peek });
      if (covered && anyDone) { read.push(ayah); if (!err.length && !peek.length) clean.push(ayah); }
    }
    return { read, clean, problems, mistakeCount: this.mistakes.size, peekCount: this.peeked.size };
  }
}
