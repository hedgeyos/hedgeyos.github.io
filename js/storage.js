import { SAVED_APPS_KEY, NOTES_FILES_KEY } from "./constants.js";

export function loadSavedApps(){
  try{
    const raw = localStorage.getItem(SAVED_APPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(x => x && typeof x.name === "string" && typeof x.url === "string")
      .map(x => ({ name: x.name.trim(), url: x.url.trim() }))
      .filter(x => x.name && x.url);
  } catch {
    return [];
  }
}

export function saveSavedApps(list){
  localStorage.setItem(SAVED_APPS_KEY, JSON.stringify(list));
}

export function normalizeUrl(url){
  const u = (url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return "https://" + u;
}

export function upsertSavedApp(name, url){
  const n = (name || "").trim();
  const u = normalizeUrl(url);
  if (!n || !u) return false;

  const list = loadSavedApps();
  const idxByUrl = list.findIndex(x => x.url.toLowerCase() === u.toLowerCase());

  if (idxByUrl >= 0){
    list[idxByUrl].name = n;
    list[idxByUrl].url = u;
  } else {
    let finalName = n;
    const taken = new Set(list.map(x => x.name.toLowerCase()));
    if (taken.has(finalName.toLowerCase())){
      let i = 2;
      while (taken.has((finalName + " " + i).toLowerCase())) i++;
      finalName = finalName + " " + i;
    }
    list.push({ name: finalName, url: u });
  }

  saveSavedApps(list);
  return true;
}

function normalizeNotesList(list){
  if (!Array.isArray(list)) return [];
  return list
    .filter(x => x && typeof x.id === "string" && typeof x.name === "string")
    .map(x => ({
      id: x.id,
      name: x.name.trim(),
      content: typeof x.content === "string" ? x.content : "",
      updatedAt: typeof x.updatedAt === "number" ? x.updatedAt : Date.now(),
    }))
    .filter(x => x.name);
}

export function loadNotesFiles(){
  try {
    const raw = localStorage.getItem(NOTES_FILES_KEY);
    if (!raw) return [];
    return normalizeNotesList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function getNotesFileById(id){
  if (!id) return null;
  return loadNotesFiles().find(x => x.id === id) || null;
}

export function getNotesFileByName(name){
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  return loadNotesFiles().find(x => x.name.toLowerCase() === n) || null;
}

function uniqueNotesName(name, list, excludeId){
  const base = (name || "").trim();
  if (!base) return "";
  const taken = new Set(list.filter(x => x.id !== excludeId).map(x => x.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has((base + " " + i).toLowerCase())) i++;
  return base + " " + i;
}

export function saveNotesFile({ id, name, content }){
  const list = loadNotesFiles();
  const finalName = uniqueNotesName(name, list, id || null);
  if (!finalName) return null;
  const now = Date.now();
  if (id) {
    const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        name: finalName,
        content: typeof content === "string" ? content : "",
        updatedAt: now,
      };
      localStorage.setItem(NOTES_FILES_KEY, JSON.stringify(list));
      return list[idx];
    }
  }
  const newItem = {
    id: "n" + Math.random().toString(36).slice(2, 10),
    name: finalName,
    content: typeof content === "string" ? content : "",
    updatedAt: now,
  };
  list.push(newItem);
  localStorage.setItem(NOTES_FILES_KEY, JSON.stringify(list));
  return newItem;
}
