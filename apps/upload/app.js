import { listUploads, saveUpload, downloadFile } from "../../js/filesystem.js";

const listEl = document.getElementById("uploadList");
const pickBtn = document.getElementById("pickFiles");
const refreshBtn = document.getElementById("refreshList");
const input = document.getElementById("fileInput");

function formatSize(bytes){
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function syncTheme(){
  try {
    const parentClasses = parent?.document?.body?.classList;
    if (!parentClasses) return;
    const themes = ["dark", "beos", "system7", "greenscreen", "cyberpunk"];
    let next = "";
    for (const t of themes){
      if (parentClasses.contains(t)) {
        next = t;
        break;
      }
    }
    document.documentElement.className = next;
  } catch {
    document.documentElement.className = "";
  }
}

async function refresh(){
  const files = await listUploads();
  if (!files.length) {
    listEl.innerHTML = '<div class="empty">No files uploaded yet.</div>';
    return;
  }
  listEl.innerHTML = "";
  files
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .forEach(file => {
      const row = document.createElement("div");
      row.className = "row";
      const info = document.createElement("div");
      const title = document.createElement("div");
      title.textContent = file.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = `${file.type || "file"} • ${formatSize(file.size || 0)} • ${new Date(file.updatedAt).toLocaleString()}`;
      info.appendChild(title);
      info.appendChild(meta);
      const actions = document.createElement("div");
      const dl = document.createElement("button");
      dl.className = "btn";
      dl.type = "button";
      dl.textContent = "Download";
      dl.addEventListener("click", () => downloadFile(file.id));
      actions.appendChild(dl);
      row.appendChild(info);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
}

pickBtn.addEventListener("click", () => input.click());
refreshBtn.addEventListener("click", refresh);
input.addEventListener("change", async () => {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  for (const file of files){
    await saveUpload(file);
  }
  input.value = "";
  await refresh();
  if (parent?.window) parent.window.dispatchEvent(new Event("hedgey:docs-changed"));
});

syncTheme();
refresh();
try {
  const obs = new MutationObserver(syncTheme);
  obs.observe(parent.document.body, { attributes: true, attributeFilter: ["class"] });
} catch {}
