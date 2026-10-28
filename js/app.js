import { $, $$, h, toast, initSheet, closeSheet } from './dom.js';
import { getSurahList, getSurah, cachedSurahNumbers, migrateLegacyCache } from './api.js';
import { state, on, saveSettings, replaceProgress, surahLabel } from './state.js';
import { stats, perSurah, parseImport, emptyProgress, TOTAL_AYAH } from './progress.js';
import { localDate, addDays, diffDays } from './dates.js';
import { player, onPlayer } from './player.js';
import { initReader, showSurah, currentSurah, readerMic, leaveReader, updateFab } from './reader.js';
import { renderReview } from './review.js';
import { initSetoran, openSetoran } from './setoran.js';

const VIEWS = ['beranda', 'belajar', 'murajaah', 'progres', 'pengaturan'];
let view = null;
const fmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

// ---------- Router ----------
function route() {
  const [name = 'beranda', a, b] = location.hash.replace(/^#\/?/, '').split('/');
  const prev = view;
  view = VIEWS.includes(name) ? name : 'beranda';
  if (prev === 'belajar' && view !== 'belajar') leaveReader();
  closeSheet();
  document.body.classList.toggle('reading', view === 'belajar');
  VIEWS.forEach(v => $(`#view-${v}`).classList.toggle('hidden', v !== view));
  $$('.nav a').forEach(l => {
    const active = l.dataset.view === view;
    l.classList.toggle('active', active);
    if (active) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
  });
  if (view === 'belajar') {
    const s = Number(a) || currentSurah()?.number || state.progress.last.surah;
    const ay = Number(b) || (!a && !currentSurah() ? state.progress.last.ayah : null);
    showSurah(s, ay > 1 ? ay : null);
  } else {
    window.scrollTo({ top: 0 });
  }
  renderView();
  updateFab();
}

function renderView() {
  if (view === 'beranda') renderHome();
  else if (view === 'murajaah') renderReview();
  else if (view === 'progres') renderProgress();
  else if (view === 'pengaturan') renderSettings();
}

// ---------- Beranda ----------
function renderHome() {
  const s = stats(state.progress);
  const { surah, ayah } = state.progress.last;
  const target = state.settings.dailyTarget;
  $('#continueTitle').textContent = `${surahLabel(surah)} · Ayat ${ayah}`;
  $('#continueMeta').textContent = s.memorized ? `${s.memorized} ayat sudah dihafal. Lanjutkan dari posisi terakhir.` : 'Mulai perjalanan hafalan dari posisi ini.';
  $('#continueBtn').href = `#/belajar/${surah}/${ayah}`;
  $('#homeToday').textContent = s.memorizedToday;
  $('#homeTarget').textContent = target;
  $('#homeTodayBar').style.width = `${Math.min(100, s.memorizedToday / target * 100)}%`;
  $('#homeTodayNote').textContent = s.memorizedToday >= target ? 'Target tercapai. Jaga hafalan dengan murajaah.' : 'Utamakan ketepatan, bukan kecepatan.';
  $('#homeDue').textContent = s.due.length;
  $('#homeUpcoming').textContent = s.upcoming ? `${s.upcoming} ayat lagi dalam 7 hari ke depan.` : 'Tidak ada jadwal dalam 7 hari ke depan.';
  $('#homeStreak').textContent = s.streak;
  $('#homeTotal').textContent = s.memorized;
  $('#homeTotalBar').style.width = `${s.percent}%`;
  $('#homePercent').textContent = `${fmt.format(s.percent)}% dari ${fmt.format(TOTAL_AYAH)} ayat`;
}

function updateBadge() {
  const n = stats(state.progress).due.length;
  $('#dueBadge').textContent = n > 99 ? '99+' : n;
  $('#dueBadge').classList.toggle('hidden', !n);
}

// ---------- Progres ----------
function renderHeatmap() {
  const today = localDate();
  const weekday = (new Date().getDay() + 6) % 7; // Senin = 0
  const start = addDays(today, -(14 * 7 + weekday));
  const cells = [];
  for (let i = 0; i < 15 * 7; i++) {
    const d = addDays(start, i);
    const day = state.progress.activity[d];
    const n = (day?.memorized || 0) + (day?.reviewed || 0);
    const level = n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 10 ? 3 : 4;
    cells.push(h('i', { class: diffDays(d, today) > 0 ? 'future' : null, 'data-l': level, title: `${d}: ${n} aktivitas` }));
  }
  $('#heatmap').replaceChildren(...cells);
}

async function renderProgress() {
  const s = stats(state.progress);
  $('#pTotal').textContent = s.memorized;
  $('#pPercent').textContent = `${fmt.format(s.percent)}% dari ${fmt.format(TOTAL_AYAH)}`;
  $('#pStreak').textContent = s.streak;
  $('#pReviewed').textContent = s.reviewedToday;
  renderHeatmap();
  const per = perSurah(state.progress);
  const nums = Object.keys(per).map(Number).sort((a, b) => a - b);
  $('#perSurah').replaceChildren(...(nums.length ? nums.map(n => {
    const total = state.surahList.find(x => x.number === n)?.ayahs;
    const pct = total ? per[n].memorized / total * 100 : 0;
    return h('a', { href: `#/belajar/${n}` },
      h('strong', { text: `${n}. ${surahLabel(n)}` }),
      h('span', { class: 'muted small', text: `${per[n].memorized}${total ? '/' + total : ''} hafal${per[n].learning ? ` · ${per[n].learning} diulang` : ''}` }),
      h('div', { class: 'bar' }, h('span', { style: `width:${pct}%` })));
  }) : [h('p', { class: 'muted', text: 'Belum ada progres per surah.' })]));
  const cached = await cachedSurahNumbers();
  $('#offlineInfo').textContent = `${cached.length} dari 114 surah tersedia offline di perangkat ini.`;
  $('#offlineBar').style.width = `${cached.length / 114 * 100}%`;
  if (!downloading) $('#downloadAll').textContent = cached.length >= 114 ? 'Semua surah sudah tersedia' : 'Unduh semua surah';
  $('#downloadAll').disabled = !downloading && cached.length >= 114;
}

let downloading = false;
async function downloadAll() {
  if (downloading) { downloading = false; return; }
  downloading = true;
  const btn = $('#downloadAll');
  const have = new Set(await cachedSurahNumbers());
  let failed = 0;
  for (let n = 1; n <= 114 && downloading; n++) {
    btn.textContent = `Mengunduh ${n}/114… (ketuk untuk batal)`;
    if (have.has(n)) continue;
    try { await getSurah(n); } catch { failed++; if (!navigator.onLine) break; }
  }
  const cancelled = !downloading;
  downloading = false;
  toast(cancelled ? 'Pengunduhan dibatalkan.' : failed ? `Selesai dengan ${failed} surah gagal. Coba lagi nanti.` : 'Semua surah tersimpan untuk offline.');
  if (view === 'progres') renderProgress();
}

function exportData() {
  const payload = { app: 'ai-tahfiz', version: 2, exportedAt: new Date().toISOString(), progress: state.progress, settings: state.settings };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `ai-tahfiz-progres-${localDate()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importData(file) {
  try {
    const p = parseImport(JSON.parse(await file.text()));
    const n = Object.keys(p.items).length;
    if (!confirm(`Ganti progres di perangkat ini dengan data impor (${n} ayat)? Progres saat ini akan ditimpa.`)) return;
    replaceProgress(p);
    toast(`Impor berhasil: ${n} ayat.`);
    renderView();
  } catch (e) {
    toast(`Impor gagal: ${e.message || 'berkas tidak valid'}`, 4000);
  }
}

// ---------- Pengaturan ----------
function applyAppearance() {
  document.documentElement.style.setProperty('--ar-size', `${state.settings.fontSize}px`);
  if (state.settings.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.settings.theme;
}

function renderSettings() {
  $('#setTarget').value = state.settings.dailyTarget;
  $('#setReciter').value = state.settings.reciter;
  $('#setFont').value = state.settings.fontSize;
  $('#setTheme').value = state.settings.theme;
}

// ---------- Inisialisasi ----------
function bindUi() {
  $('#exportData').onclick = exportData;
  $('#importFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); };
  $('#clearData').onclick = () => {
    if (!confirm('Hapus semua progres hafalan di perangkat ini? Ekspor dulu bila perlu. Tindakan ini tidak dapat dibatalkan.')) return;
    replaceProgress(emptyProgress());
    toast('Progres dihapus.');
    renderView();
  };
  $('#downloadAll').onclick = downloadAll;
  $('#setTarget').onchange = e => saveSettings({ dailyTarget: Math.min(100, Math.max(1, Math.round(Number(e.target.value)) || 5)) });
  $('#setReciter').onchange = e => saveSettings({ reciter: e.target.value });
  $('#setFont').oninput = e => { saveSettings({ fontSize: Number(e.target.value) }); applyAppearance(); };
  $('#setTheme').onchange = e => { saveSettings({ theme: e.target.value }); applyAppearance(); };

  $('#openSetoran').onclick = async () => {
    if (view === 'belajar' && readerMic()) return;
    let surah = currentSurah();
    let ayah = state.progress.last.ayah;
    if (!surah || surah.number !== state.progress.last.surah) {
      try { ({ surah } = await getSurah(state.progress.last.surah)); } catch { toast('Surah belum tersedia offline. Sambungkan internet.'); return; }
    }
    if (!surah.ayahs.some(a => a.n === ayah)) ayah = 1;
    openSetoran(surah, ayah);
  };

  $('#playerPause').onclick = () => player.toggle();
  $('#playerStop').onclick = () => player.stop();
  onPlayer(s => {
    const active = s.status !== 'idle';
    $('#playerBar').classList.toggle('hidden', !active);
    document.body.classList.toggle('playing', active);
    if (s.error) toast(s.error, 4000);
    if (!active) return;
    $('#playerLabel').textContent = `${surahLabel(s.item.surah)} ${s.item.ayah}` + (s.repeatEach > 1 ? ` · ${s.rep}/${s.repeatEach}×` : '');
    $('#playerPause').textContent = s.status === 'playing' ? '⏸' : '▶';
    $('#playerPause').setAttribute('aria-label', s.status === 'playing' ? 'Jeda' : 'Lanjutkan');
  });

  const net = () => {
    state.online = navigator.onLine;
    $('#netBadge').textContent = state.online ? 'Online' : 'Offline';
    $('#netBadge').classList.toggle('off', !state.online);
  };
  addEventListener('online', net);
  addEventListener('offline', net);
  net();

  on(type => {
    if (type === 'progress') { updateBadge(); if (view !== 'belajar' && view !== 'murajaah') renderView(); }
    if (type === 'storage-error') toast('Penyimpanan browser penuh/terblokir. Ekspor progres Anda.', 5000);
  });
  addEventListener('hashchange', route);
  // Pergantian hari saat aplikasi terbuka (mis. lewat tengah malam): segarkan angka.
  // Mikrofon tidak dibiarkan menyala saat aplikasi di latar belakang.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) leaveReader();
    else { updateBadge(); renderView(); }
  });
  const stickyTop = () => document.documentElement.style.setProperty('--sticky-top',
    matchMedia('(min-width: 760px)').matches ? `${$('.nav').offsetHeight}px` : '0px');
  addEventListener('resize', stickyTop);
  stickyTop();
}

async function loadSurahList() {
  try {
    const { list } = await getSurahList();
    state.surahList = list;
  } catch {
    toast('Tidak dapat memuat daftar surah. Buka aplikasi saat online setidaknya sekali.', 5000);
  }
  const select = $('#surahSelect');
  select.replaceChildren(...(state.surahList.length
    ? state.surahList.map(s => h('option', { value: s.number, text: `${s.number}. ${s.englishName} · ${s.name}` }))
    : Array.from({ length: 114 }, (_, i) => h('option', { value: i + 1, text: `Surah ${i + 1}` }))));
  if (currentSurah()) select.value = String(currentSurah().number);
}

async function init() {
  applyAppearance();
  initSheet();
  initSetoran();
  initReader();
  bindUi();
  updateBadge();
  await migrateLegacyCache();
  await loadSurahList();
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
