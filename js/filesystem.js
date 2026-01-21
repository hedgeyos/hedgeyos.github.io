const DB_NAME = "hedgeyfs";
const DB_VERSION = 2;
const STORE = "files";
const META = "meta";
const KEY_NAME = "cryptoKey";
const NOTICE_KEY = "hedgey_encryption_notice_v1";

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
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "id" });
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

function withMeta(mode, fn){
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(META, mode);
    const store = tx.objectStore(META);
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

function bytesToB64(bytes){
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64ToBytes(str){
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getCryptoKey(){
  const existing = await withMeta("readonly", store => store.get(KEY_NAME));
  if (existing && existing.jwk){
    return crypto.subtle.importKey("jwk", existing.jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await withMeta("readwrite", store => store.put({ id: KEY_NAME, jwk }));
  return key;
}

function emitEncryptionNotice(){
  if (localStorage.getItem(NOTICE_KEY) === "1") return;
  localStorage.setItem(NOTICE_KEY, "1");
  try{
    if (window?.dispatchEvent) {
      window.dispatchEvent(new Event("hedgey:encryption-notice"));
    }
    if (window?.parent?.window && window.parent !== window) {
      window.parent.window.dispatchEvent(new Event("hedgey:encryption-notice"));
    }
  } catch {}
}

async function encryptBytes(bytes){
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { iv: bytesToB64(iv), blob: new Blob([cipher]) };
}

async function decryptBlob(blob, ivB64){
  const key = await getCryptoKey();
  const iv = b64ToBytes(ivB64);
  const data = await blob.arrayBuffer();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new Uint8Array(plain);
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
  const encoder = new TextEncoder();
  const { iv, blob } = await encryptBytes(encoder.encode(content || ""));
  const record = {
    id: id || ("n" + Math.random().toString(36).slice(2, 10)),
    name: finalName,
    kind: "note",
    type: "text/plain",
    size: (content || "").length,
    enc: true,
    iv,
    blob,
    updatedAt: now,
  };
  await withStore("readwrite", (store) => store.put(record));
  emitEncryptionNotice();
  return record;
}

export async function saveUpload(file){
  if (!file) return null;
  const entries = await listFiles();
  const finalName = uniqueName(file.name || "Untitled", entries, null);
  if (!finalName) return null;
  const data = new Uint8Array(await file.arrayBuffer());
  const { iv, blob } = await encryptBytes(data);
  const record = {
    id: "f" + Math.random().toString(36).slice(2, 10),
    name: finalName,
    kind: "file",
    type: file.type || "application/octet-stream",
    size: file.size || 0,
    enc: true,
    iv,
    blob,
    updatedAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.put(record));
  emitEncryptionNotice();
  return record;
}

export async function downloadFile(id){
  const record = await getFileById(id);
  if (!record) return false;
  let blob = null;
  if (record.enc && record.blob && record.iv) {
    const bytes = await decryptBlob(record.blob, record.iv);
    blob = new Blob([bytes], { type: record.type || "application/octet-stream" });
  } else if (record.kind === "note") {
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

export async function readNoteText(id){
  const record = await getFileById(id);
  if (!record || record.kind !== "note") return null;
  if (record.enc && record.blob && record.iv) {
    const bytes = await decryptBlob(record.blob, record.iv);
    return new TextDecoder().decode(bytes);
  }
  return record.content || "";
}

export async function readFileBlob(id){
  const record = await getFileById(id);
  if (!record) return null;
  if (record.enc && record.blob && record.iv) {
    const bytes = await decryptBlob(record.blob, record.iv);
    return { record, blob: new Blob([bytes], { type: record.type || "application/octet-stream" }) };
  }
  return { record, blob: record.blob || null };
}
