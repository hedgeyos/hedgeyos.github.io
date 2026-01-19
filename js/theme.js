import { DARK_MODE_KEY } from "./constants.js";

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
