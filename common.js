// Общи помощни функции: тема и "отворено сега" (по часа в България).
const toMin = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
function sofiaNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Sofia", hour:"2-digit", minute:"2-digit", hour12:false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { min:(+p.hour % 24)*60 + +p.minute };
}
// true / false, или null ако няма достатъчно данни (липсва час на отваряне или затваряне)
function isOpen(p, now) {
  if (p.closedTemp) return false;
  if (p.h24) return true;
  if (!p.open || !p.close) return null;
  const o = toMin(p.open), c = toMin(p.close);
  return c > o ? now.min >= o && now.min < c : now.min >= o || now.min < c;
}
(function theme() {
  const root = document.documentElement, btn = document.getElementById("theme");
  const eff = () => root.dataset.theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : root.dataset.theme;
  const paint = () => { btn.textContent = eff() === "dark" ? "☀️ Дневен" : "🌙 Нощен"; };
  btn.onclick = () => {
    root.dataset.theme = eff() === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
    paint();
  };
  paint();
})();
