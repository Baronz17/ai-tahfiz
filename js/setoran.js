// Popup setoran: dengarkan bacaan lewat Web Speech API, bandingkan dengan teks ayat, lalu nilai sendiri.
import { $, h, toast } from './dom.js';
import { compareRecitation } from './arabic.js';
import { GRADES, GRADE_LABEL, nextInterval, describeInterval } from './srs.js';
import { state, gradeAyah, surahLabel } from './state.js';
import { ayahKey } from './progress.js';

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let target = null;          // { surah, ayahs, index }
let recognition = null, finalText = '', interimText = '', listening = false, lastFocus = null;
let onGradedCb = null;

const modal = () => $('#setoranModal');
const current = () => target?.ayahs[target.index];

export function isOpen() { return !modal().classList.contains('hidden'); }

// surah: objek surah dari api.getSurah; ayah: nomor ayat dalam surah.
export function openSetoran(surah, ayah, { onGraded } = {}) {
  onGradedCb = onGraded || null;
  const index = Math.max(0, surah.ayahs.findIndex(a => a.n === ayah));
  target = { surah, ayahs: surah.ayahs, index };
  lastFocus = document.activeElement;
  modal().classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderTarget();
  $('#startListen').focus();
}

export function closeSetoran() {
  stopListening();
  modal().classList.add('hidden');
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}

function renderTarget() {
  const a = current();
  $('#setoranRef').textContent = `${surahLabel(target.surah.number)} · Ayat ${a.n} dari ${target.ayahs.length}`;
  $('#setoranText').textContent = a.text;
  $('#setoranText').classList.toggle('hidden', !$('#setoranShowText').checked);
  $('#setoranPrev').disabled = target.index === 0;
  $('#setoranNext').disabled = target.index >= target.ayahs.length - 1;
  finalText = interimText = '';
  renderTranscript();
  $('#setoranResult').classList.add('hidden');
  $('#listenStatus').textContent = Recognition
    ? 'Tekan Mulai, izinkan mikrofon, lalu bacakan ayat dari hafalan.'
    : 'Browser ini belum mendukung pengenalan suara (coba Chrome/Edge). Anda tetap bisa menilai hafalan sendiri.';
  $('#startListen').disabled = !Recognition;
  renderGrades(null);
}

function renderTranscript() {
  const box = $('#transcript');
  box.replaceChildren(finalText, interimText ? h('span', { class: 'interim', text: (finalText ? ' ' : '') + interimText }) : '');
}

function renderGrades(suggested) {
  const a = current();
  const rec = state.progress.items[ayahKey(target.surah.number, a.n)];
  const box = $('#setoranGrades');
  box.replaceChildren(...[GRADES.LUPA, GRADES.RAGU, GRADES.LANCAR].map(g => h('button', {
    class: `g${g}${g === suggested ? ' suggested' : ''}`,
    onclick: () => grade(g),
  }, GRADE_LABEL[g], h('small', { text: `ulang ${describeInterval(nextInterval(rec, g))}` }))));
}

function grade(g) {
  const a = current();
  gradeAyah(target.surah.number, a.n, g);
  toast(`Ayat ${a.n} dinilai: ${GRADE_LABEL[g]}`);
  onGradedCb?.(target.surah.number, a.n, g);
  if (target.index < target.ayahs.length - 1) { target.index++; renderTarget(); }
  else closeSetoran();
}

function showResult() {
  const spoken = (finalText + ' ' + interimText).trim();
  if (!spoken) { $('#listenStatus').textContent = 'Tidak ada suara yang dikenali. Coba lagi lebih dekat ke mikrofon.'; return; }
  const r = compareRecitation(current().text, spoken);
  const pct = Math.round(r.score * 100);
  $('#scoreValue').textContent = `${pct}%`;
  $('#scoreNote').textContent = `${r.matched}/${r.total} kata cocok${r.extra ? ` · ${r.extra} kata tambahan` : ''} (perkiraan)`;
  $('#scoreWords').replaceChildren(...r.words.flatMap((w, i) => [
    h('span', { class: w.matched ? 'hit' : 'miss', title: w.matched ? `terdengar: ${w.heard}` : 'tidak terdengar' , text: w.word }),
    i < r.words.length - 1 ? ' ' : '',
  ]));
  $('#setoranResult').classList.remove('hidden');
  renderGrades(pct >= 90 ? GRADES.LANCAR : pct >= 60 ? GRADES.RAGU : GRADES.LUPA);
  $('#listenStatus').textContent = 'Kata merah = tidak terdengar/berbeda. Periksa dengan mushaf, lalu pilih nilai.';
}

function startListening() {
  if (!Recognition || listening) return;
  recognition = new Recognition();
  recognition.lang = 'ar-SA';
  recognition.interimResults = true;
  recognition.continuous = true;
  finalText = interimText = '';
  renderTranscript();
  $('#setoranResult').classList.add('hidden');
  recognition.onresult = e => {
    let fin = '', interim = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    finalText = fin.trim(); interimText = interim.trim();
    renderTranscript();
  };
  recognition.onerror = e => {
    const msg = { 'not-allowed': 'Izin mikrofon ditolak.', 'no-speech': 'Tidak ada suara terdeteksi.', network: 'Pengenalan suara memerlukan internet.' }[e.error];
    $('#listenStatus').textContent = msg || `Pengenalan suara: ${e.error}`;
  };
  recognition.onend = () => {
    const wasListening = listening;
    listening = false;
    setButtons();
    if (wasListening) showResult();
  };
  try {
    recognition.start();
    listening = true;
    setButtons();
    $('#listenStatus').textContent = 'Mendengarkan… bacakan ayat, lalu tekan Selesai.';
  } catch {
    $('#listenStatus').textContent = 'Tidak dapat memulai pengenalan suara. Coba lagi.';
  }
}

function stopListening() {
  if (recognition && listening) { try { recognition.stop(); } catch { /* sudah berhenti */ } }
}

function abortListening() {
  if (recognition) { listening = false; try { recognition.abort(); } catch { /* abaikan */ } }
}

function setButtons() {
  $('#startListen').disabled = listening || !Recognition;
  $('#stopListen').disabled = !listening;
}

export function initSetoran() {
  $('#closeSetoran').onclick = closeSetoran;
  $('#startListen').onclick = startListening;
  $('#stopListen').onclick = () => { stopListening(); $('#listenStatus').textContent = 'Memproses…'; };
  $('#setoranPrev').onclick = () => { abortListening(); target.index--; renderTarget(); };
  $('#setoranNext').onclick = () => { abortListening(); target.index++; renderTarget(); };
  $('#setoranShowText').onchange = () => $('#setoranText').classList.toggle('hidden', !$('#setoranShowText').checked);
  modal().addEventListener('click', e => { if (e.target === modal()) closeSetoran(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) closeSetoran(); });
}
