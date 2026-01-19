import { toEmbedUrl } from "./embedify.js";
import { NOTES_KEY } from "./constants.js";
import { createDesktopIcons } from "./desktop-icons.js";

export function createWindowManager({ desktop, iconLayer, templates, openWindowsList, saveDialog, appsMenu, theme }){
  const { finderTpl, appTpl, browserTpl, notesTpl, terminalTpl, themesTpl } = templates;
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
    }, { passive: false });

    bar.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      e.preventDefault();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const b = dragBounds();
      const newLeft = clamp(startLeft + dx, b.minLeft, b.maxLeft);
      const newTop  = clamp(startTop + dy, b.minTop, b.maxTop);

      win.style.left = newLeft + "px";
      win.style.top  = newTop + "px";
    }, { passive: false });

    bar.addEventListener("pointerup", () => dragging = false);
    bar.addEventListener("pointercancel", () => dragging = false);
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

  function randChoice(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  function buildFinderRows(tbody){
    const fakeNames = [
      "Hedgehog", "Pig", "Boarbarian", "Flipside", "Lina",
      "Decentricity", "Ms. Pandu Sastrowardoyo", "inversebrah",
      "Danceu", "Fren", "HedgeyTown", "Chordynaut", "Unconnected",
      "SufferMon", "GunDB", "Pandan Studios", "myriad.social",
      "debio.ai", "blocksphere", "hedgey.sock", "kernel_hedgehog",
      "probably_not_a_virus", "definitely_a_virus", "tiny_psa.txt"
    ];

    const kinds = ["folder", "document", "alias", "mystery", "aesthetic artifact"];
    const dates = [
      "Yesterday, 9:09 AM",
      "Thu, May 1, 2003, 11:49 PM",
      "Mon, Jul 14, 2003, 12:24 PM",
      "Wed, Jun 11, 2003, 9:08 AM",
      "Fri, Jul 11, 2003, 12:28 PM",
      "Just now",
      "Back in the Before Times"
    ];
    const sizes = ["--", "4 K", "42 K", "692 K", "3.5 MB", "13.37 MB", "∞"];

    const rows = [];
    for (let i = 0; i < 18; i++){
      rows.push({
        name: fakeNames[i] || ("mystery_" + (i+1)),
        date: randChoice(dates),
        size: randChoice(sizes),
        kind: randChoice(kinds),
      });
    }

    tbody.innerHTML = "";
    rows.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.className = "row" + (idx === 0 ? " selected" : "");
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

    buildFinderRows(tbody);

    nav.addEventListener("click", (e) => {
      const li = e.target.closest(".navitem");
      if (!li) return;
      nav.querySelectorAll(".navitem").forEach(x => x.classList.remove("active"));
      li.classList.add("active");
    });

    list.addEventListener("click", (e) => {
      const tr = e.target.closest("tr.row");
      if (!tr) return;
      list.querySelectorAll("tr.row").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      if (status) status.textContent = "Selected: " + tr.children[0].textContent;
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

  function wireTerminalUI(win){
    const screen = win.querySelector("[data-v86-screen]");
    const statusEl = win.querySelector("[data-v86-status]");
    const capture = win.querySelector("[data-v86-capture]");
    const keyOverlay = win.querySelector("[data-v86-keys]");
    if (!screen) return;

    const setStatus = (text) => {
      if (statusEl) statusEl.textContent = text;
    };

    if (!window.V86Starter) {
      setStatus("v86 engine not available.");
      return;
    }

    screen.tabIndex = 0;
    const st = state.get(win.dataset.id);

    const emulator = new window.V86Starter({
      wasm_path: "vendor/v86/v86.wasm",
      screen_container: screen,
      bios: { url: "vendor/v86/bios/seabios.bin" },
      vga_bios: { url: "vendor/v86/bios/vgabios.bin" },
      bzimage: { url: "vendor/v86/buildroot-bzimage.bin", size: 5166352 },
      cmdline: "tsc=reliable mitigations=off random.trust_cpu=on",
      autostart: true,
      memory_size: 256 * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
    });

    emulator.add_listener("download-progress", (evt) => {
      if (!evt.lengthComputable) {
        setStatus("Loading Buildroot Linux...");
        return;
      }
      const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
      setStatus(`Loading Buildroot Linux... ${pct}%`);
    });

    emulator.add_listener("download-error", () => {
      setStatus("Failed to download v86 assets.");
    });

    emulator.add_listener("emulator-loaded", () => {
      setStatus("Buildroot Linux booting...");
    });

    const focusScreen = () => {
      if (capture) capture.focus();
      screen.focus();
      emulator.keyboard_set_status?.(true);
    };
    win.addEventListener("pointerdown", focusScreen);
    screen.addEventListener("pointerdown", focusScreen);
    const sendSpecialKey = (key) => {
      const map = {
        Enter: 13,
        Backspace: 8,
        Tab: 9,
        Escape: 27,
        ArrowUp: 38,
        ArrowDown: 40,
        ArrowLeft: 37,
        ArrowRight: 39,
        Insert: 45,
        Delete: 46,
        Home: 36,
        End: 35,
        PageUp: 33,
        PageDown: 34,
      };
      const keyCode = map[key];
      if (!keyCode) return false;
      if (key === "Enter" && emulator.keyboard_send_scancodes) {
        emulator.keyboard_send_scancodes([0x1c, 0x9c]);
      } else {
        emulator.keyboard_send_keys?.([keyCode]);
      }
      return true;
    };

    if (capture) {
      capture.tabIndex = 0;
      capture.setAttribute("aria-label", "Terminal input capture");
      capture.setAttribute("contenteditable", "true");
      capture.addEventListener("pointerdown", focusScreen);
      capture.addEventListener("keydown", (e) => {
        const sentSpecial = sendSpecialKey(e.key);
        if (!sentSpecial && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          emulator.keyboard_send_text?.(e.key);
        }
        if (keyOverlay) {
          keyOverlay.textContent = `Key: ${e.key}  Code: ${e.code || "n/a"}  KeyCode: ${e.keyCode || 0}`;
        }
        e.preventDefault();
      });
    }

    // Avoid dynamic scale changes on resize; CSS stretching keeps the view stable.

    if (st) {
      st.emulator = emulator;
    }
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
    if (tpl === terminalTpl) wireTerminalUI(win);
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
    return spawn(terminalTpl, "Terminal", { kind: "app" });
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
