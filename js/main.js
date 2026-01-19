import { DEFAULT_APPS, BOOT_KEY } from "./constants.js";
import { createSaveDialog } from "./save-dialog.js";
import { createAppsMenu } from "./apps-menu.js";
import { createWindowManager } from "./wm.js";
import { initMenuDropdowns, initMenuActions } from "./menubar.js";
import { initThemeToggle, initThemeState, applyTheme, getTheme } from "./theme.js";
import { createHud } from "./hud.js";

const menubar = document.getElementById("menubar");
const desktop = document.getElementById("desktop");
const iconLayer = document.getElementById("iconLayer");
const openWindowsList = document.getElementById("openWindowsList");

const appsMenu = createAppsMenu({
  savedAppsList: document.getElementById("savedAppsList"),
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
  theme: { applyTheme, getTheme },
});

const hud = createHud({
  video: document.getElementById("hudFeed"),
  body: document.body,
  switchButton: document.getElementById("hudSwitch"),
});

initMenuDropdowns({ menubar });
initMenuActions({ menubar, wm, appsMenu, defaultApps: DEFAULT_APPS, hud });
initThemeToggle({ button: document.getElementById("modebtn") });
initThemeState();

const firstBoot = localStorage.getItem(BOOT_KEY) !== "1";
wm.createFilesWindow();

if (firstBoot){
  const pre = "HedgeyOS was made by Decentricity. Follow me on X!";
  wm.createNotesWindow({ prefill: pre, forcePrefill: true });
  localStorage.setItem(BOOT_KEY, "1");
} else {
  wm.createNotesWindow();
}
