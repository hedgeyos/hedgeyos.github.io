import { DARK_MODE_KEY, THEME_KEY } from "./constants.js";

export function initThemeToggle({ button }){
  function apply(on){
    document.body.classList.toggle("dark", !!on);
    button.textContent = on ? "☀" : "☾";
  }

  const saved = localStorage.getItem(DARK_MODE_KEY);
  apply(saved === "1");

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    const on = !document.body.classList.contains("dark");
    apply(on);
    localStorage.setItem(DARK_MODE_KEY, on ? "1" : "0");
  });
}

export function getTheme(){
  return localStorage.getItem(THEME_KEY) || "hedgey";
}

export function applyTheme(name, { persist = true } = {}){
  const theme = (name === "beos" || name === "system7" || name === "greenscreen" || name === "cyberpunk") ? name : "hedgey";
  document.body.classList.toggle("beos", theme === "beos");
  document.body.classList.toggle("system7", theme === "system7");
  document.body.classList.toggle("greenscreen", theme === "greenscreen");
  document.body.classList.toggle("cyberpunk", theme === "cyberpunk");
  if (persist) localStorage.setItem(THEME_KEY, theme);
}

export function initThemeState(){
  applyTheme(getTheme(), { persist: false });
}
