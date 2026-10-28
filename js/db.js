// Penyimpanan data surah di IndexedDB (kuota jauh lebih besar dari localStorage).
// Bila IndexedDB tidak tersedia (mis. mode privat tertentu), jatuh ke Map di memori.
const DB_NAME = 'aitahfiz', STORE = 'kv';
let dbPromise = null;
const memory = new Map();

function open() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  dbPromise ??= new Promise(resolve => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function get(key) {
  const db = await open();
  if (!db) return memory.get(key);
  try { return await tx(db, 'readonly', s => s.get(key)); } catch { return memory.get(key); }
}

export async function set(key, value) {
  memory.set(key, value);
  const db = await open();
  if (!db) return;
  try { await tx(db, 'readwrite', s => s.put(value, key)); } catch { /* tetap tersedia di memori */ }
}

export async function keys() {
  const db = await open();
  if (!db) return [...memory.keys()];
  try { return await tx(db, 'readonly', s => s.getAllKeys()); } catch { return [...memory.keys()]; }
}
