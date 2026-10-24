// Общи помощни функции: тема и "отворено сега" (по часа и деня в България).
const toMin = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
function sofiaNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Sofia", weekday:"short", hour:"2-digit", minute:"2-digit", hour12:false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(p.weekday), min:(+p.hour % 24)*60 + +p.minute };
}
// true / false, или null ако няма данни за днешния ден (виж hours.js)
const isOpen = (p, now) => HoursLib.isOpen(p, now);
function effTheme() { const r = document.documentElement; return r.dataset.theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : r.dataset.theme; }
// етикет на бутона за режим – на езика на страницата (ако lang.js е зареден)
function paintTheme() {
  const btn = document.getElementById("theme");
  if (!btn) return;
  const dark = effTheme() === "dark";
  btn.textContent = typeof tt === "function" ? tt(dark ? "theme.day" : "theme.night") : (dark ? "☀️ Дневен" : "🌙 Нощен");
  if (typeof tt === "function") btn.setAttribute("aria-label", tt("theme.aria"));
}
(function theme() {
  const root = document.documentElement, btn = document.getElementById("theme");
  if (!btn) return;
  btn.onclick = () => {
    root.dataset.theme = effTheme() === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
    paintTheme();
  };
  paintTheme();
})();
