import { toEmbedUrl } from "./embedify.js";
import { NOTES_KEY } from "./constants.js";
import { createDesktopIcons } from "./desktop-icons.js";
import { loadSavedApps } from "./storage.js";

export function createWindowManager({ desktop, iconLayer, templates, openWindowsList, saveDialog, appsMenu, appsMap, theme }){
  const { finderTpl, appTpl, browserTpl, notesTpl, themesTpl } = templates;
  const DesktopIcons = createDesktopIcons({ iconLayer, desktop });

  let zTop = 20;
  let idSeq = 1;
  let activeId = null;
  const state = new Map();

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function deskRect(){ return desktop.getBoundingClientRect(); }
  function deskSize(){ return { w: desktop.clientWidth, h: desktop.clientHeight }; }

  function getTitle(win){
    return win.querySelector("[data-titletext]")?.textContent?.trim() || "Window";
  }

  function refreshOpenWindowsMenu(){
    openWindowsList.innerHTML = "";
    const entries = Array.from(state.entries());

    if (!entries.length){
      const empty = document.createElement("div");
      empty.className = "menu-item";
      empty.textContent = "(none)";
      empty.style.pointerEvents = "none";
      empty.style.opacity = "0.75";
      openWindowsList.appendChild(empty);
      return;
    }

    entries.sort((a,b) => {
      const za = parseInt(a[1].win.style.zIndex || "0", 10);
      const zb = parseInt(b[1].win.style.zIndex || "0", 10);
      return zb - za;
    });

    for (const [id, st] of entries){
      const item = document.createElement("div");
      item.className = "menu-item";
      item.textContent = (st.minimized ? "◊ " : "") + st.title;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        restore(id);
        focus(id);
        document.querySelectorAll("#menubar .menu").forEach(m => m.classList.remove("open"));
      });
      openWindowsList.appendChild(item);
    }
  }

  function refreshIcons(){
    const metaById = new Map();
    const order = Array.from(state.entries())
      .sort((a,b) => a[1].createdAt - b[1].createdAt)
      .map(([id, st]) => {
        metaById.set(id, { title: st.title, kind: st.kind });
        return id;
      });

    DesktopIcons.render(order, metaById, (id) => {
      restore(id);
      focus(id);
    });
  }

  function focus(id){
    for (const [wid, st] of state.entries()){
      st.win.classList.toggle("inactive", wid !== id);
    }
    const st = state.get(id);
    if (!st) return;
    activeId = id;
    st.win.style.zIndex = String(++zTop);
    if (st.term) st.term.focus();
    if (st.term) {
      st.term.focus();
    }
    refreshOpenWindowsMenu();
  }


  function minimize(id){
    const st = state.get(id);
    if (!st || st.minimized) return;
    st.minimized = true;
    st.win.style.display = "none";
    refreshOpenWindowsMenu();
    refreshIcons();
  }

  function restore(id){
    const st = state.get(id);
    if (!st || !st.minimized) return;
    st.minimized = false;
    st.win.style.display = "grid";
    refreshOpenWindowsMenu();
    refreshIcons();
  }

  function close(id){
    const st = state.get(id);
    if (!st) return;
    if (st.emulator) {
      st.emulator.destroy?.();
      st.emulator = null;
    }
    st.win.remove();
    state.delete(id);
    DesktopIcons.removeIcon(id);

    const last = Array.from(state.keys()).pop();
    if (last) focus(last);

    refreshOpenWindowsMenu();
    refreshIcons();
  }

  function applyDefaultSize(win){
    const { w: dw, h: dh } = deskSize();
    const w = Math.max(320, Math.floor(dw * 0.8));
    const h = Math.max(240, Math.floor(dh * 0.5));
    win.style.width = w + "px";
    win.style.height = h + "px";
  }

  function toggleZoom(id){
    const st = state.get(id);
    if (!st) return;

    const { w: dw, h: dh } = deskSize();

    if (!st.maximized){
      const rect = st.win.getBoundingClientRect();
      const dr = deskRect();
      st.restoreRect = {
        left: rect.left - dr.left,
        top: rect.top - dr.top,
        width: rect.width,
        height: rect.height
      };

      const pad = 6;
      st.win.style.left = pad + "px";
      st.win.style.top = pad + "px";
      st.win.style.width = Math.max(320, dw - pad * 2) + "px";
      st.win.style.height = Math.max(240, dh - pad * 2) + "px";
      st.maximized = true;
    } else {
      const r = st.restoreRect;
      if (r){
        st.win.style.left = r.left + "px";
        st.win.style.top = r.top + "px";
        st.win.style.width = r.width + "px";
        st.win.style.height = r.height + "px";
      }
      st.maximized = false;
    }
    focus(id);
    refreshIcons();
  }

  function dragBounds(){
    const { w: dw, h: dh } = deskSize();
    const keep = 40;
    const offX = Math.floor(dw * 0.4);
    const offY = Math.floor(dh * 0.4);
    return {
      minLeft: -offX,
      maxLeft: (dw - keep),
      minTop: -offY,
      maxTop: (dh - keep),
    };
  }

  function makeDraggable(id, win){
    const bar = win.querySelector("[data-titlebar]");
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    let currentLeft = 0, currentTop = 0;
    let raf = null;
    let pendingDx = 0, pendingDy = 0;
    let currentTilt = 0;
    let targetTilt = 0;
    let lastMoveTs = 0;
    let lastMoveX = 0;
    let lastMoveY = 0;
    let lastTiltRaw = 0;
    let idleTiltTimer = null;
    const maxTilt = 15;

    win.addEventListener("pointerdown", () => focus(id), { capture: true });

    bar.addEventListener("pointerdown", (e) => {
      const onControl = e.target.closest("[data-close],[data-minimize],[data-zoom]");
      if (onControl) return;
      if (state.get(id)?.maximized) return;

      e.preventDefault();
      dragging = true;
      bar.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;

      const rect = win.getBoundingClientRect();
      const dr = deskRect();
      startLeft = rect.left - dr.left;
      startTop  = rect.top - dr.top;
      currentLeft = startLeft;
      currentTop = startTop;
      currentTilt = 0;
      targetTilt = 0;
      lastTiltRaw = 0;
      lastMoveTs = performance.now();
      lastMoveX = e.clientX;
      lastMoveY = e.clientY;
      if (idleTiltTimer) {
        clearInterval(idleTiltTimer);
        idleTiltTimer = null;
      }
      win.style.willChange = "transform";
    }, { passive: false });

    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const b = dragBounds();
      const newLeft = clamp(startLeft + dx, b.minLeft, b.maxLeft);
      const newTop  = clamp(startTop + dy, b.minTop, b.maxTop);

      currentLeft = newLeft;
      currentTop = newTop;
      pendingDx = newLeft - startLeft;
      pendingDy = newTop - startTop;
      const now = performance.now();
      const dt = Math.max(12, now - lastMoveTs);
      const vx = (e.clientX - lastMoveX) / dt;
      const vy = (e.clientY - lastMoveY) / dt;
      const speed = Math.hypot(vx, vy);
      const tiltRaw = pendingDx / 9 + pendingDy / 80;
      const filtered = lastTiltRaw + (tiltRaw - lastTiltRaw) * 0.2;
      lastTiltRaw = filtered;
      const clamped = Math.max(-maxTilt, Math.min(maxTilt, filtered));
      targetTilt = speed < 0.04 ? 0 : clamped;
      lastMoveTs = now;
      lastMoveX = e.clientX;
      lastMoveY = e.clientY;

      if (!raf) {
        raf = requestAnimationFrame(() => {
          currentTilt += (targetTilt - currentTilt) * 0.12;
          win.style.transform = `translate3d(${pendingDx}px, ${pendingDy}px, 0) rotate(${currentTilt}deg)`;
          raf = null;
        });
      }

      if (!idleTiltTimer) {
        idleTiltTimer = setInterval(() => {
          if (!dragging) return;
          if (Math.abs(targetTilt) < 0.01 && Math.abs(currentTilt) < 0.05) {
            return;
          }
          currentTilt += (0 - currentTilt) * 0.08;
          win.style.transform = `translate3d(${pendingDx}px, ${pendingDy}px, 0) rotate(${currentTilt}deg)`;
        }, 80);
      }
    }, { passive: false });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (idleTiltTimer) {
        clearInterval(idleTiltTimer);
        idleTiltTimer = null;
      }
      win.style.left = currentLeft + "px";
      win.style.top = currentTop + "px";
      win.style.transform = "";
      win.style.willChange = "";
    };
    bar.addEventListener("pointerup", endDrag);
    bar.addEventListener("pointercancel", endDrag);
    bar.addEventListener("lostpointercapture", endDrag);
    bar.addEventListener("dblclick", () => toggleZoom(id));
  }

  function makeResizable(id, win){
    const grip = win.querySelector("[data-grip]");
    let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;

    grip.addEventListener("pointerdown", (e) => {
      if (state.get(id)?.maximized) return;
      e.preventDefault();

      resizing = true;
      grip.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;

      const rect = win.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
    }, { passive: false });

    grip.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const rect = win.getBoundingClientRect();
      const dr = deskRect();
      const left = rect.left - dr.left;
      const top  = rect.top - dr.top;

      const { w: dw, h: dh } = deskSize();
      const maxW = dw + Math.max(0, -left);
      const maxH = dh + Math.max(0, -top);

      const newW = clamp(startW + dx, 320, Math.max(320, maxW));
      const newH = clamp(startH + dy, 240, Math.max(240, maxH));

      win.style.width = newW + "px";
      win.style.height = newH + "px";
    }, { passive: false });

    grip.addEventListener("pointerup", () => resizing = false);
    grip.addEventListener("pointercancel", () => resizing = false);
  }

  function buildFinderRows(tbody, rows){
    tbody.innerHTML = "";
    rows.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.className = "row" + (idx === 0 ? " selected" : "");
      if (r.open) tr.dataset.open = r.open;
      if (r.url) tr.dataset.url = r.url;
      if (r.title) tr.dataset.title = r.title;
      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.size)}</td>
        <td>${escapeHtml(r.kind)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }

  function wireFinderUI(win){
    const nav = win.querySelector("[data-nav]");
    const list = win.querySelector("[data-list]");
    const status = win.querySelector("[data-status]");
    const tbody = win.querySelector("[data-finder-rows]");
    const navItems = Array.from(nav.querySelectorAll(".navitem"));

    const appRows = () => {
      const defaults = Object.values(appsMap || {}).map(app => ({
        name: app.title,
        date: "Just now",
        size: "--",
        kind: "application",
        open: "app",
        url: app.url,
        title: app.title,
      })).filter(row => row.url);
      const saved = loadSavedApps().map(app => ({
        name: app.name,
        date: "Just now",
        size: "--",
        kind: "application",
        open: "app",
        url: app.url,
        title: app.name,
      }));
      return defaults.concat(saved).sort((a, b) => a.name.localeCompare(b.name));
    };

    const systemRows = () => ([
      { name: "Terminal", date: "Just now", size: "--", kind: "system app", open: "terminal" },
      { name: "Files", date: "Just now", size: "--", kind: "system app", open: "files" },
    ]);

    const emptyRows = () => ([]);

    const sections = {
      Applications: appRows,
      Documents: emptyRows,
      "System Folder": systemRows,
      Desktop: emptyRows,
      Library: emptyRows,
    };

    const renderSection = (label) => {
      const rows = (sections[label] || emptyRows)();
      buildFinderRows(tbody, rows);
      if (status) status.textContent = `${rows.length} item${rows.length === 1 ? "" : "s"}`;
    };

    const active = nav.querySelector(".navitem.active")?.textContent?.trim() || "Applications";
    renderSection(active);

    nav.addEventListener("click", (e) => {
      const li = e.target.closest(".navitem");
      if (!li) return;
      navItems.forEach(x => x.classList.remove("active"));
      li.classList.add("active");
      renderSection(li.textContent.trim());
    });

    list.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.row");
      if (!tr) return;
      list.querySelectorAll("tr.row").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      if (status) status.textContent = "Selected: " + tr.children[0].textContent;
    });

    list.addEventListener("dblclick", (e) => {
      const tr = e.target.closest("tr.row");
      if (!tr) return;
      const open = tr.dataset.open;
      if (open === "terminal") {
        createTerminalWindow();
      } else if (open === "files") {
        createFilesWindow();
      } else if (open === "app") {
        const title = tr.dataset.title || tr.children[0].textContent || "App";
        const url = tr.dataset.url || "about:blank";
        createAppWindow(title, url);
      }
    });

    const newWinBtn = win.querySelector("[data-newwin]");
    if (newWinBtn) newWinBtn.addEventListener("click", () => createFilesWindow());
  }

  function wireAppUI(win, url){
    const iframe = win.querySelector("[data-iframe]");
    iframe.src = url;
  }

  function wireBrowserUI(win){
    const field = win.querySelector("[data-urlfield]");
    const goBtn = win.querySelector("[data-go]");
    const saveBtn = win.querySelector("[data-save]");
    const iframe = win.querySelector("[data-iframe]");
    const status = win.querySelector("[data-browser-status]");

    function setStatus(txt){
      if (status) status.textContent = txt;
    }

    function setUrl(u){
      const raw = (u || "").trim();
      if (!raw){
        setStatus("Enter a URL");
        return;
      }

      const conv = toEmbedUrl(raw, { twitchParent: location.hostname || "localhost" });
      if (conv.ok){
        field.value = raw;
        iframe.src = conv.embedUrl;
        setStatus("Embedded via " + conv.provider);
      } else {
        const norm = /^https?:\/\//i.test(raw) ? raw : ("https://" + raw);
        field.value = norm;
        iframe.src = norm;
        if (conv.reason === "twitch_requires_parent"){
          setStatus("Twitch needs a parent domain; opened raw URL");
        } else {
          setStatus("Opened direct URL (no embed)");
        }
      }
    }

    goBtn.addEventListener("click", () => setUrl(field.value));
    field.addEventListener("keydown", (e) => {
      if (e.key === "Enter"){
        e.preventDefault();
        setUrl(field.value);
      }
    });

    saveBtn.addEventListener("click", () => {
      const current = (iframe.getAttribute("src") || field.value || "").trim();
      const url = /^https?:\/\//i.test(current) ? current : ("https://" + current);

      const guessName = (() => {
        try{
          const host = new URL(url).hostname.replace(/^www\./i,"");
          return host || "New App";
        } catch {
          return "New App";
        }
      })();

      saveDialog.open(url, guessName, () => {
        appsMenu.renderSavedApps();
      });
    });

    setUrl(field.value);
  }

  function wireNotesUI(win, opts){
    const ta = win.querySelector("[data-notes]");
    const status = win.querySelector("[data-notestatus]");

    const prefill = (opts && typeof opts.prefill === "string") ? opts.prefill : null;
    const forcePrefill = !!(opts && opts.forcePrefill);

    const saved = localStorage.getItem(NOTES_KEY);
    if (typeof saved === "string" && !forcePrefill){
      ta.value = saved;
    } else if (prefill !== null){
      ta.value = prefill;
      localStorage.setItem(NOTES_KEY, ta.value);
    }

    let t = null;
    function setStatus(txt){
      if (status) status.textContent = txt;
    }

    function doSave(){
      localStorage.setItem(NOTES_KEY, ta.value);
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      setStatus("Saved at " + hh + ":" + mm + ":" + ss);
    }

    function scheduleSave(){
      setStatus("Typing...");
      if (t) clearTimeout(t);
      t = setTimeout(doSave, 1000);
    }

    ta.addEventListener("input", scheduleSave);
    ta.addEventListener("blur", () => {
      if (t) { clearTimeout(t); t = null; }
      doSave();
    });

    setStatus(saved ? "Loaded" : "Not saved yet");
    setTimeout(() => ta.focus(), 0);
  }


  function wireThemesUI(win){
    const list = win.querySelector("[data-themes-list]");
    const items = Array.from(list.querySelectorAll("[data-theme]"));
    const title = win.querySelector("[data-theme-title]");
    const desc = win.querySelector("[data-theme-desc]");

    const meta = {
      hedgey: {
        label: "OS 9 Classic",
        desc: "Classic HedgeyOS chrome with Mac OS 9-inspired greys.",
      },
      system7: {
        label: "System Software 7",
        desc: "Early Macintosh look with tighter chrome and lighter greys.",
      },
      greenscreen: {
        label: "Greenscreen",
        desc: "Flat black-and-green CRT terminal vibe with glowing accents.",
      },
      cyberpunk: {
        label: "Cyberpunk Red",
        desc: "BeOS-style tabs with flat black-and-red chrome.",
      },
      beos: {
        label: "BeOS",
        desc: "Warm BeOS yellow title bars and a brighter, punchier contrast.",
      },
    };

    function applySelection(name){
      theme.applyTheme(name);
      items.forEach(item => {
        item.classList.toggle("active", item.dataset.theme === name);
      });
      const info = meta[name] || meta.hedgey;
      if (title) title.textContent = info.label;
      if (desc) desc.textContent = info.desc;
    }

    items.forEach(item => {
      item.addEventListener("click", () => applySelection(item.dataset.theme));
    });

    applySelection(theme.getTheme());
  }

  function spawn(tpl, title, extra){
    const id = "w" + (idSeq++);
    const frag = tpl.content.cloneNode(true);
    const win = frag.querySelector("[data-win]");

    win.dataset.id = id;
    win.style.zIndex = String(++zTop);

    applyDefaultSize(win);

    const { w: dw, h: dh } = deskSize();
    const wNow = parseFloat(win.style.width) || 400;
    const hNow = parseFloat(win.style.height) || 300;

    const baseLeft = 6 + 18 * (idSeq - 2);
    const baseTop  = 6 + 18 * (idSeq - 2);

    win.style.left = clamp(baseLeft, 0, Math.max(0, dw - wNow)) + "px";
    win.style.top  = clamp(baseTop, 0, Math.max(0, dh - hNow)) + "px";

    const titleText = win.querySelector("[data-titletext]");
    if (titleText && title) titleText.textContent = title;

    desktop.appendChild(win);

    const st = {
      win,
      minimized: false,
      maximized: false,
      restoreRect: null,
      title: getTitle(win),
      kind: extra?.kind || "window",
      createdAt: Date.now() + idSeq
    };
    state.set(id, st);

    win.querySelector("[data-close]").addEventListener("click", () => close(id));
    win.querySelector("[data-minimize]").addEventListener("click", () => minimize(id));
    win.querySelector("[data-zoom]").addEventListener("click", () => toggleZoom(id));

    makeDraggable(id, win);
    makeResizable(id, win);

    if (tpl === finderTpl) wireFinderUI(win);
    if (tpl === appTpl) wireAppUI(win, extra?.url || "about:blank");
    if (tpl === browserTpl) wireBrowserUI(win);
    if (tpl === notesTpl) wireNotesUI(win, extra?.notesOpts || null);
    if (tpl === themesTpl) wireThemesUI(win);

    st.title = getTitle(win);
    focus(id);
    refreshOpenWindowsMenu();
    refreshIcons();

    return id;
  }

  function createFilesWindow(){
    return spawn(finderTpl, "Files", { kind: "files" });
  }

  function createBrowserWindow(){
    return spawn(browserTpl, "Browser", { kind: "browser" });
  }

  function createAppWindow(title, url){
    return spawn(appTpl, title, { kind: "app", url });
  }

  function createNotesWindow(notesOpts){
    return spawn(notesTpl, "Notes", { kind: "notes", notesOpts: notesOpts || null });
  }

  function createTerminalWindow(){
    return spawn(appTpl, "Terminal", { kind: "app", url: "apps/terminal/index.html" });
  }

  function createThemesWindow(){
    return spawn(themesTpl, "Themes", { kind: "app" });
  }

  window.addEventListener("resize", () => {
    refreshIcons();
    refreshOpenWindowsMenu();
  });

  return {
    createFilesWindow,
    createBrowserWindow,
    createNotesWindow,
    createTerminalWindow,
    createAppWindow,
    createThemesWindow,
    refreshOpenWindowsMenu,
    refreshIcons,
    focus,
    restore,
  };
}
