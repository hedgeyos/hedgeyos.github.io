import { loadSavedApps } from "./storage.js";

export function createAppsMenu({ savedAppsList, appsList, appsConfig }){
  let submenuBound = false;

  function clearNode(node){
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function closeSubmenus(except){
    if (!appsList) return;
    const subs = Array.from(appsList.querySelectorAll(".menu-sub.open"));
    subs.forEach(sub => {
      if (sub !== except) sub.classList.remove("open");
    });
  }

  function renderAppsMenu(){
    if (!appsList) return;
    clearNode(appsList);
    const apps = appsConfig?.apps || [];
    const byCategory = apps.reduce((acc, app) => {
      const category = app.category || "games";
      if (!acc[category]) acc[category] = [];
      acc[category].push(app);
      return acc;
    }, {});

    const topApps = byCategory.top || [];
    if (topApps.length) {
      for (const app of topApps){
        const row = document.createElement("div");
        row.className = "menu-item";
        row.textContent = app.title;
        row.setAttribute("data-app", app.id);
        appsList.appendChild(row);
      }
      const sep = document.createElement("div");
      sep.className = "menu-sep";
      appsList.appendChild(sep);
    }

    const categories = [
      { key: "system", title: "System" },
      { key: "utilities", title: "Utilities" },
      { key: "games", title: "Games" },
    ];

    for (const category of categories){
      const items = byCategory[category.key] || [];
      if (!items.length) continue;
      const wrap = document.createElement("div");
      wrap.className = "menu-sub";

      const label = document.createElement("div");
      label.className = "menu-item menu-subtitle";
      label.textContent = category.title;
      label.setAttribute("data-submenu-toggle", category.key);
      wrap.appendChild(label);

      const dropdown = document.createElement("div");
      dropdown.className = "menu-dropdown bevel-out hairline menu-submenu";
      for (const app of items){
        const row = document.createElement("div");
        row.className = "menu-item";
        row.textContent = app.title;
        row.setAttribute("data-app", app.id);
        dropdown.appendChild(row);
      }
      wrap.appendChild(dropdown);
      appsList.appendChild(wrap);
    }

    if (!submenuBound){
      submenuBound = true;
      appsList.addEventListener("click", (e) => {
        const toggle = e.target.closest("[data-submenu-toggle]");
        if (!toggle) return;
        e.preventDefault();
        e.stopPropagation();
        const wrap = toggle.closest(".menu-sub");
        if (!wrap) return;
        const isOpen = wrap.classList.toggle("open");
        if (isOpen) closeSubmenus(wrap);
      });
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
