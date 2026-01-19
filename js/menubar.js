export function initMenuDropdowns({ menubar }){
  const menus = Array.from(menubar.querySelectorAll(".menu"));

  function closeAll(){ menus.forEach(m => m.classList.remove("open")); }

  menubar.addEventListener("click", (e) => {
    const menu = e.target.closest(".menu");
    if (!menu) return;
    const already = menu.classList.contains("open");
    closeAll();
    if (!already) menu.classList.add("open");
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("#menubar")) return;
    closeAll();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
}

async function requestFullScreen(){
  try{
    const el = document.documentElement;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {
    // ignore; some mobile browsers are picky about gestures
  }
}

export function initMenuActions({ menubar, wm, appsMenu, defaultApps }){
  menubar.addEventListener("click", (e) => {
    const action = e.target.getAttribute("data-action");
    const app = e.target.getAttribute("data-app");

    const savedRow = e.target.closest("[data-saved-url]");
    if (savedRow){
      const title = savedRow.getAttribute("data-saved-name") || "App";
      const url = savedRow.getAttribute("data-saved-url") || "about:blank";
      wm.createAppWindow(title, url);
      e.stopPropagation();
      return;
    }

    if (action === "fullScreen"){
      requestFullScreen();
    }

    if (action === "aboutSystem"){
      wm.createAppWindow("About", defaultApps.about.url);
    }
    if (action === "newFiles"){
      wm.createFilesWindow();
    }
    if (action === "newNotes"){
      wm.createNotesWindow();
    }

    if (app === "files"){
      wm.createFilesWindow();
    } else if (app === "browser"){
      wm.createBrowserWindow();
    } else if (app === "notes"){
      wm.createNotesWindow();
    } else if (app && defaultApps[app]){
      wm.createAppWindow(defaultApps[app].title, defaultApps[app].url);
    }

    if (e.target.closest("#appsMenu")){
      wm.refreshOpenWindowsMenu();
      wm.refreshIcons();
    }

    if (action || app || savedRow) e.stopPropagation();
  });

  appsMenu.renderSavedApps();
}
