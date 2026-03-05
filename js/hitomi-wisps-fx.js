export function animateHitomiWispsShow(root, opts = {}){
  if (!root || !(root instanceof HTMLElement)) return;
  if (!root.isConnected) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const color = String(opts.color || "rgba(255, 133, 196, 0.95)");
  const glow = String(opts.glow || "rgba(255, 133, 196, 0.45)");
  const count = Math.max(8, Math.min(20, Number(opts.count) || 12));
  const duration = Math.max(260, Math.min(900, Number(opts.durationMs) || 520));

  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.overflow = "visible";
  overlay.style.zIndex = "2";
  root.appendChild(overlay);

  // Hedgehog appears with a tiny pop while wisps pass around it.
  root.animate(
    [
      { transform: "scale(0.94)", opacity: 0.86, filter: "brightness(0.9)" },
      { transform: "scale(1.03)", opacity: 1, filter: "brightness(1.08)" },
      { transform: "scale(1)", opacity: 1, filter: "brightness(1)" },
    ],
    { duration, easing: "cubic-bezier(.2,.8,.2,1)", fill: "none" },
  );

  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement("div");
    const size = 8 + Math.random() * 20;
    dot.style.position = "absolute";
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderRadius = "999px";
    dot.style.background = color;
    dot.style.opacity = "0";
    dot.style.filter = `blur(${1 + Math.random() * 2.6}px)`;
    dot.style.boxShadow = `0 0 10px ${glow}`;
    dot.style.mixBlendMode = "screen";

    const startX = 18 + Math.random() * 96;
    const startY = 80 + Math.random() * 40;
    const driftX = (Math.random() - 0.5) * 46;
    const driftY = -40 - Math.random() * 56;
    dot.style.left = `${startX}px`;
    dot.style.top = `${startY}px`;
    overlay.appendChild(dot);

    dot.animate(
      [
        { transform: "translate3d(0, 0, 0) scale(0.7)", opacity: 0 },
        { transform: "translate3d(0, -8px, 0) scale(1)", opacity: 0.72 },
        { transform: `translate3d(${driftX}px, ${driftY}px, 0) scale(1.15)`, opacity: 0 },
      ],
      {
        duration: duration * (0.7 + Math.random() * 0.6),
        delay: Math.random() * 130,
        easing: "ease-out",
        fill: "forwards",
      },
    );
  }

  setTimeout(() => {
    overlay.remove();
  }, duration + 260);
}
