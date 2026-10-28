// Tampilan Murajaah: sesi kartu hafalan untuk ayat yang jatuh tempo (pengulangan berjarak).
import { $, h, toast } from './dom.js';
import { getSurah } from './api.js';
import { state, gradeAyah, surahLabel } from './state.js';
import { stats, parseKey } from './progress.js';
import { GRADES, GRADE_LABEL, nextInterval, describeInterval } from './srs.js';
import { firstLetterHint } from './arabic.js';
import { player } from './player.js';
import { openSetoran } from './setoran.js';

let session = null; // { queue: [key], pos, requeued: Set, tally: [0,0,0] }
let reveal = 0;     // 0 tersembunyi, 1 huruf awal, 2 penuh
let renderToken = 0;

function startSession() {
  const due = stats(state.progress).due;
  session = { queue: [...due], pos: 0, requeued: new Set(), tally: [0, 0, 0] };
  reveal = 0;
  render();
}

function grade(key, g) {
  const [s, a] = parseKey(key);
  gradeAyah(s, a, g);
  advance(key, g);
}

function advance(key, g) {
  session.tally[g]++;
  // Ayat yang lupa diulang sekali lagi di akhir sesi.
  if (g === GRADES.LUPA && !session.requeued.has(key)) { session.requeued.add(key); session.queue.push(key); }
  session.pos++;
  reveal = 0;
  player.stop();
  render();
}

function summaryCounts() {
  const s = stats(state.progress);
  $('#revDue').textContent = s.due.length;
  $('#revUpcoming').textContent = s.upcoming;
  $('#revLearning').textContent = s.learning;
  return s;
}

export async function renderReview() {
  const s = summaryCounts();
  if (!session || session.pos >= session.queue.length) {
    if (session && session.pos > 0) return renderDone();
    session = null;
    return renderIdle(s);
  }
  render();
}

function renderIdle(s) {
  const body = $('#reviewBody');
  if (!s.due.length) {
    body.replaceChildren(h('div', { class: 'empty' },
      h('div', { class: 'big', text: '🌿' }),
      h('p', { text: Object.keys(state.progress.items).length
        ? 'Tidak ada murajaah yang jatuh tempo. Lanjutkan hafalan baru atau istirahat sejenak.'
        : 'Belum ada ayat yang ditandai. Tandai ayat sebagai “Hafal” di halaman Belajar, dan murajaah akan dijadwalkan otomatis.' }),
      h('a', { class: 'btn secondary', href: '#/belajar', text: 'Ke halaman Belajar' })));
    return;
  }
  const preview = s.due.slice(0, 8).map(k => { const [su, a] = parseKey(k); return `${surahLabel(su)} ${a}`; }).join(', ');
  body.replaceChildren(
    h('p', { text: `${s.due.length} ayat menunggu murajaah hari ini.` }),
    h('p', { class: 'muted small', text: preview + (s.due.length > 8 ? ', …' : '') }),
    h('p', { class: 'muted small', text: 'Ingat ayat dari petunjuk ayat sebelumnya, bacakan, lalu buka teks untuk memeriksa dan beri nilai jujur.' }),
    h('button', { onclick: startSession, text: '▶ Mulai sesi' }));
}

function renderDone() {
  const [lupa, ragu, lancar] = session.tally;
  $('#reviewBody').replaceChildren(h('div', { class: 'empty' },
    h('div', { class: 'big', text: '✅' }),
    h('p', { text: `Sesi selesai: ${lancar} lancar, ${ragu} ragu, ${lupa} lupa.` }),
    h('p', { class: 'muted small', text: 'Jadwal berikutnya sudah diatur otomatis.' }),
    h('button', { class: 'secondary', onclick: () => { session = null; renderReview(); }, text: 'Kembali' })));
  session.pos = session.queue.length;
}

async function render() {
  summaryCounts();
  const token = ++renderToken;
  const body = $('#reviewBody');
  if (session.pos >= session.queue.length) return renderDone();
  const key = session.queue[session.pos];
  const [s, a] = parseKey(key);
  body.replaceChildren(h('div', { class: 'skeleton' }));
  let surah;
  try { ({ surah } = await getSurah(s)); } catch {
    if (token !== renderToken) return;
    body.replaceChildren(h('p', { text: `${surahLabel(s)} belum tersimpan offline. Sambungkan internet, atau lewati ayat ini.` }),
      h('button', { class: 'secondary', onclick: () => { session.pos++; render(); }, text: 'Lewati' }));
    return;
  }
  if (token !== renderToken) return;
  const ayah = surah.ayahs.find(x => x.n === a);
  if (!ayah) { session.pos++; return render(); }
  const prev = surah.ayahs.find(x => x.n === a - 1);
  const rec = state.progress.items[key];

  const recall = h('div', { class: 'recall' },
    reveal === 0 ? h('p', { class: 'placeholder', text: 'Bacakan ayat dari hafalan, lalu buka untuk memeriksa.' })
      : h('p', { class: 'arabic', lang: 'ar', dir: 'rtl', text: reveal === 1 ? firstLetterHint(ayah.text) : ayah.text }));

  body.replaceChildren(...[
    h('div', { class: 'review-ref' },
      h('strong', { text: `${surahLabel(s)} · Ayat ${a}` }),
      h('span', { class: 'pill', text: `${session.pos + 1} / ${session.queue.length}` })),
    h('div', { class: 'cue' },
      prev ? h('p', { class: 'arabic', lang: 'ar', dir: 'rtl', text: prev.text }) : h('p', { class: 'muted small', text: 'Awal surah — ayat pertama.' }),
      prev ? h('p', { class: 'muted small', text: `Ayat sebelumnya (${a - 1}). Lanjutkan dengan ayat ${a}.` }) : null),
    recall,
    reveal === 2 ? h('p', { class: 'translation', text: ayah.translation }) : null,
    h('div', { class: 'row wrap', style: 'margin:10px 0' },
      h('button', { class: 'ghost', disabled: reveal >= 1, onclick: () => { reveal = 1; render(); }, text: 'Petunjuk' }),
      h('button', { class: 'ghost', disabled: reveal >= 2, onclick: () => { reveal = 2; render(); }, text: 'Tampilkan ayat' }),
      h('button', { class: 'ghost', onclick: () => player.play([{ surah: s, ayah: a, global: ayah.global }], { repeatEach: 1, reciter: state.settings.reciter }), text: '▶ Dengar' }),
      h('button', { class: 'ghost', onclick: () => openSetoran({ ...surah, ayahs: [ayah] }, a, { onGraded: (_s, _a, g) => afterExternalGrade(key, g) }), text: '🎙 Setor' })),
    h('div', { class: 'grades' }, [GRADES.LUPA, GRADES.RAGU, GRADES.LANCAR].map(g =>
      h('button', { class: `g${g}`, onclick: () => grade(key, g) }, GRADE_LABEL[g], h('small', { text: `ulang ${describeInterval(nextInterval(rec, g))}` })))),
  ].filter(Boolean));
}

// Nilai diberikan dari popup setoran (yang sudah menyimpan progres): lanjutkan sesi tanpa menilai dua kali.
function afterExternalGrade(key, g) {
  if (session?.queue[session.pos] === key) { advance(key, g); toast('Lanjut ke ayat berikutnya.'); }
}
