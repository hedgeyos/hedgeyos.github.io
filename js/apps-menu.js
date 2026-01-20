import { loadSavedApps } from "./storage.js";

export function createAppsMenu({ savedAppsList, appsList, appsConfig }){
  function clearNode(node){
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderAppsMenu(){
    if (!appsList) return;
    clearNode(appsList);
    const apps = appsConfig?.apps || [];
    const bySection = apps.reduce((acc, app) => {
      const section = app.section || "apps";
      if (!acc[section]) acc[section] = [];
      acc[section].push(app);
      return acc;
    }, {});

    const orderedSections = ["system", "apps"].filter(key => bySection[key]?.length);
    let firstSection = true;
    for (const section of orderedSections){
      if (!firstSection){
        const sep = document.createElement("div");
        sep.className = "menu-sep";
        appsList.appendChild(sep);
      }
      firstSection = false;
      for (const app of bySection[section]){
        const row = document.createElement("div");
        row.className = "menu-item";
        row.textContent = app.title;
        row.setAttribute("data-app", app.id);
        appsList.appendChild(row);
      }
    }
  }

  function renderSavedApps(){
    clearNode(savedAppsList);
    const saved = loadSavedApps();

    if (!saved.length){
      const empty = document.createElement("div");
      empty.className = "menu-item";
      empty.textContent = "(none)";
      empty.style.pointerEvents = "none";
      empty.style.opacity = "0.75";
      savedAppsList.appendChild(empty);
      return;
    }

    for (const item of saved){
      const row = document.createElement("div");
      row.className = "menu-item";
      row.textContent = item.name;
      row.setAttribute("data-saved-name", item.name);
      row.setAttribute("data-saved-url", item.url);
      savedAppsList.appendChild(row);
    }
  }

  return { renderSavedApps, renderAppsMenu };
}
