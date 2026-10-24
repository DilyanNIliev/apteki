// Общи помощни функции: тема и "отворено сега" (по часа и деня в България).
const toMin = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
function sofiaNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Sofia", weekday:"short", hour:"2-digit", minute:"2-digit", hour12:false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(p.weekday), min:(+p.hour % 24)*60 + +p.minute };
}
// true / false, или null ако няма данни за днешния ден (виж hours.js)
const isOpen = (p, now) => HoursLib.isOpen(p, now);
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
