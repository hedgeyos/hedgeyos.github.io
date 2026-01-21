const DB_NAME = "hedgeyfs";
const DB_VERSION = 1;
const STORE = "files";

let dbPromise = null;

function openDb(){
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("kind", "kind", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore(mode, fn){
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let req = null;
    try {
      req = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    if (req) req.onerror = () => reject(req.error);
  }));
}

export async function listFiles(){
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getFileById(id){
  if (!id) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function uniqueName(name, entries, excludeId){
  const base = (name || "").trim();
  if (!base) return "";
  const taken = new Set(entries.filter(x => x.id !== excludeId).map(x => (x.name || "").toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has((base + " " + i).toLowerCase())) i++;
  return base + " " + i;
}

export async function saveNote({ id, name, content }){
  const entries = await listFiles();
  const finalName = uniqueName(name, entries, id || null);
  if (!finalName) return null;
  const now = Date.now();
  const record = {
    id: id || ("n" + Math.random().toString(36).slice(2, 10)),
    name: finalName,
    kind: "note",
    type: "text/plain",
    size: (content || "").length,
    content: typeof content === "string" ? content : "",
    updatedAt: now,
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function saveUpload(file){
  if (!file) return null;
  const entries = await listFiles();
  const finalName = uniqueName(file.name || "Untitled", entries, null);
  if (!finalName) return null;
  const record = {
    id: "f" + Math.random().toString(36).slice(2, 10),
    name: finalName,
    kind: "file",
    type: file.type || "application/octet-stream",
    size: file.size || 0,
    blob: file,
    updatedAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.put(record));
  return record;
}

export async function downloadFile(id){
  const record = await getFileById(id);
  if (!record) return false;
  let blob = null;
  if (record.kind === "note") {
    blob = new Blob([record.content || ""], { type: "text/plain" });
  } else {
    blob = record.blob;
  }
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = record.name || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function listNotes(){
  const entries = await listFiles();
  return entries.filter(x => x.kind === "note");
}

export async function listUploads(){
  const entries = await listFiles();
  return entries.filter(x => x.kind === "file");
}
