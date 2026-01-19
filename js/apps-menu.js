import { loadSavedApps } from "./storage.js";

export function createAppsMenu({ savedAppsList }){
  function clearNode(node){
    while (node.firstChild) node.removeChild(node.firstChild);
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

  return { renderSavedApps };
}
