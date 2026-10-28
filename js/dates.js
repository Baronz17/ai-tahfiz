// Tanggal lokal dalam format YYYY-MM-DD (bukan UTC, agar pergantian hari mengikuti zona waktu pengguna).
export function localDate(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // jam 12 menghindari masalah pergantian DST
}

export function addDays(dateStr, n) {
  const d = parse(dateStr);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

export function diffDays(a, b) {
  return Math.round((parse(a) - parse(b)) / 86400000);
}
