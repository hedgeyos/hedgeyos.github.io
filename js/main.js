import { BOOT_KEY } from "./constants.js";
import { createSaveDialog } from "./save-dialog.js";
import { createAppsMenu } from "./apps-menu.js";
import { createWindowManager } from "./wm.js";
import { initMenuDropdowns, initMenuActions } from "./menubar.js";
import { saveUpload } from "./filesystem.js";
import { initThemeToggle, initThemeState, applyTheme, getTheme } from "./theme.js";
import { createHud } from "./hud.js";

const menubar = document.getElementById("menubar");
const desktop = document.getElementById("desktop");
const iconLayer = document.getElementById("iconLayer");
const openWindowsList = document.getElementById("openWindowsList");

async function loadAppsConfig(){
  try{
    const resp = await fetch("apps.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`apps.json failed: ${resp.status}`);
    const data = await resp.json();
    if (!data || !Array.isArray(data.apps)) throw new Error("apps.json missing apps");
    return data;
  } catch (err){
    console.error(err);
    return { apps: [] };
  }
}

function toAppsMap(appsConfig){
  const map = {};
  for (const app of appsConfig.apps || []){
    if (!app || !app.id) continue;
    map[app.id] = { title: app.title || app.id, url: app.url || "" };
  }
  return map;
}

async function boot(){
  const appsConfig = await loadAppsConfig();
  const appsMap = toAppsMap(appsConfig);

  const appsMenu = createAppsMenu({
    savedAppsList: document.getElementById("savedAppsList"),
    appsList: document.getElementById("appsList"),
    appsConfig,
  });

  const saveDialog = createSaveDialog({
    modal: document.getElementById("saveModal"),
    nameField: document.getElementById("saveAppName"),
    urlField: document.getElementById("saveAppUrl"),
    btnNo: document.getElementById("saveNo"),
    btnYes: document.getElementById("saveYes"),
    onSaved: () => appsMenu.renderSavedApps(),
  });

  const wm = createWindowManager({
    desktop,
    iconLayer,
    templates: {
      finderTpl: document.getElementById("finderTemplate"),
      appTpl: document.getElementById("appTemplate"),
      browserTpl: document.getElementById("browserTemplate"),
      notesTpl: document.getElementById("notesTemplate"),
      themesTpl: document.getElementById("themesTemplate"),
    },
    openWindowsList,
    saveDialog,
    appsMenu,
    appsMap,
    theme: { applyTheme, getTheme },
  });

  const hud = createHud({
    video: document.getElementById("hudFeed"),
    body: document.body,
    switchButton: document.getElementById("hudSwitch"),
  });

  initMenuDropdowns({ menubar });
  initMenuActions({ menubar, wm, appsMenu, defaultApps: appsMap, hud });
  initThemeToggle({ button: document.getElementById("modebtn") });
  initThemeState();

  appsMenu.renderAppsMenu();
  appsMenu.renderSavedApps();

  const firstBoot = localStorage.getItem(BOOT_KEY) !== "1";
  wm.createFilesWindow();

  const toast = document.getElementById("toast");
  const toastBody = document.getElementById("toastBody");
  let toastTimer = null;
  function showToast(message){
    if (!toast || !toastBody) return;
    toastBody.innerHTML = message;
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 8000);
  }

  window.addEventListener("hedgey:encryption-notice", () => {
    showToast('Your files are encrypted. <span class="toast-link">Click here for key operations.</span>');
  });

  if (toast) {
    toast.addEventListener("click", () => {
      // Placeholder for future key management UI.
    });
  }

  async function handleDroppedFiles(files){
    const list = Array.from(files || []).filter(f => f instanceof File);
    if (!list.length) return;
    for (const file of list){
      await saveUpload(file);
    }
    window.dispatchEvent(new Event("hedgey:docs-changed"));
    if (typeof wm.focusDocumentsWindow === "function") {
      wm.focusDocumentsWindow();
    }
  }

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDroppedFiles(e.dataTransfer?.files);
  });

  if (firstBoot){
    const pre = "HedgeyOS was made by Decentricity. Follow me on X!";
    wm.createNotesWindow({ prefill: pre, forcePrefill: true });
    localStorage.setItem(BOOT_KEY, "1");
  } else {
    wm.createNotesWindow();
  }
}

boot();
