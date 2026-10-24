// Общи помощни функции: часове, тема и език (BG / EN / RU / UK).
const toMin = t => { const [h,m] = t.split(":").map(Number); return h*60+m; };
function sofiaNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Sofia", weekday:"short", hour:"2-digit", minute:"2-digit", hour12:false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(p.weekday), min:(+p.hour % 24)*60 + +p.minute };
}
// true / false, или null ако няма данни за днешния ден (виж hours.js)
const isOpen = (p, now) => HoursLib.isOpen(p, now);

// ---- език ----
const ROOT_EL = document.documentElement;
let LANG = "bg";
(function initLang() {
  const ok = l => I18N.LANGS.includes(l);
  let l = new URLSearchParams(location.search).get("lang");
  if (!ok(l)) { try { l = localStorage.getItem("lang"); } catch (e) { l = null; } }
  LANG = ok(l) ? l : "bg";
  try { localStorage.setItem("lang", LANG); } catch (e) {}
  ROOT_EL.lang = LANG;
})();
const tt = (key, vars) => I18N.t(LANG, key, vars);
const nameL = bg => I18N.name(LANG, bg);                 // имена на празници / събития
const withLang = url => LANG === "bg" ? url : url + (url.includes("?") ? "&" : "?") + "lang=" + LANG;   // за връзки към динамичните страници

function applyI18n(scope) {
  const q = (sel) => (scope || document).querySelectorAll(sel);
  q("[data-i18n]").forEach(e => { e.textContent = tt(e.dataset.i18n, e.dataset.vars ? JSON.parse(e.dataset.vars) : undefined); });
  q("[data-i18n-ph]").forEach(e => { e.placeholder = tt(e.dataset.i18nPh); });
  q("[data-i18n-aria]").forEach(e => { e.setAttribute("aria-label", tt(e.dataset.i18nAria)); });
  q("[data-bgonly]").forEach(e => { e.hidden = LANG !== "bg"; });
  paintTheme(); paintLang();
}
function setLang(l) {
  if (!I18N.LANGS.includes(l) || l === LANG) return;
  try { localStorage.setItem("lang", l); } catch (e) {}
  LANG = l; ROOT_EL.lang = l;
  try { const u = new URL(location.href); u.searchParams.delete("lang"); history.replaceState(null, "", u); } catch (e) {}
  applyI18n();
  if (typeof onLangChange === "function") onLangChange();
}

// ---- тема: Авто (по часа в София: нощем 20:00–07:00 е тъмна) → Дневен → Нощен ----
const sofiaHour = () => +new Intl.DateTimeFormat("en-GB", { timeZone:"Europe/Sofia", hour:"2-digit", hour12:false }).format(new Date()) % 24;
const autoTheme = () => { const h = sofiaHour(); return h >= 20 || h < 7 ? "dark" : "light"; };
const themePref = () => { let p = "auto"; try { p = localStorage.getItem("theme") || "auto"; } catch (e) {} return ["auto", "light", "dark"].includes(p) ? p : "auto"; };
function applyTheme() { const p = themePref(); ROOT_EL.dataset.pref = p; ROOT_EL.dataset.theme = p === "auto" ? autoTheme() : p; }
function paintTheme() {
  const b = document.getElementById("theme"); if (!b) return;
  const p = themePref();
  b.textContent = tt(p === "auto" ? "theme.auto" : p === "light" ? "theme.day" : "theme.night");
  b.setAttribute("aria-label", tt("theme.aria")); b.title = tt("theme.autoTip");
}
(function themeInit() {
  applyTheme();
  const btn = document.getElementById("theme");
  if (btn) btn.onclick = () => {
    const next = { auto: "light", light: "dark", dark: "auto" }[themePref()];
    try { localStorage.setItem("theme", next); } catch (e) {}
    applyTheme(); paintTheme();
  };
  setInterval(() => { if (themePref() === "auto") applyTheme(); }, 60000);   // в авто режим се сменя сам по часа в София
})();

// ---- превключвател на езика (горе вдясно) ----
function paintLang() {
  const box = document.getElementById("lang");
  if (!box) return;
  const m = I18N.META[LANG];
  box.innerHTML = `<details class="langsw"><summary aria-label="${tt("lang.aria")}"><span class="fl">${m.flag}</span> ${m.abbr} ▾</summary><div class="menu">${
    I18N.LANGS.map(l => `<button type="button" data-l="${l}" class="${l === LANG ? "on" : ""}"><span class="fl">${I18N.META[l].flag}</span> ${I18N.META[l].abbr} <small>${I18N.META[l].name}</small></button>`).join("")
  }</div></details>`;
  box.querySelectorAll("button[data-l]").forEach(b => b.onclick = () => { box.querySelector("details").open = false; setLang(b.dataset.l); });
}
document.addEventListener("click", e => { const d = document.querySelector(".langsw[open]"); if (d && !d.contains(e.target)) d.open = false; });
document.addEventListener("DOMContentLoaded", () => applyI18n());
if (document.readyState !== "loading") applyI18n();
