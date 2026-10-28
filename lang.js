// Език на страницата: определяне, превод на статичните текстове, превключвател (горе вдясно) и връзки.
// Зависи от i18n.js. Зарежда се преди common.js и другите скриптове на страницата.
//
// Страници с езикови версии (начална, „Почивни дни“, квартали) имат в <html>: data-lang (езикът на версията) и
// data-page (път от корена на сайта, "" за началната). Езикът се взема от data-lang и се запомня.
// Останалите страници (аптеки, корекция) се превеждат с JS: езикът е ?lang= > запомненият > български.
// data-root е относителният път от страницата до корена на сайта.
const ROOT_EL = document.documentElement;
const SITE_ROOT = ROOT_EL.dataset.root || "";
const PAGE_PATH = ROOT_EL.dataset.page;                 // undefined = страница без езикови версии
const langDir = l => (l === "bg" ? "" : l + "/");
let LANG = "bg";
(function initLang() {
  const ok = l => I18N.LANGS.includes(l);
  let stored = null;
  try { stored = localStorage.getItem("lang"); } catch (e) {}
  if (PAGE_PATH !== undefined) {
    LANG = ok(ROOT_EL.dataset.lang) ? ROOT_EL.dataset.lang : "bg";
  } else {
    const q = new URLSearchParams(location.search).get("lang");
    LANG = ok(q) ? q : ok(stored) ? stored : "bg";
  }
  try { localStorage.setItem("lang", LANG); } catch (e) {}
  ROOT_EL.lang = LANG;
})();

const tt = (key, vars) => I18N.t(LANG, key, vars);
const nameL = bg => I18N.name(LANG, bg);                              // имена на празници и събития
const idxHref = (path, l) => (SITE_ROOT + langDir(l || LANG) + path) || "./";    // връзка към страница с езикови версии („./“, а не празен адрес – той би сочил към същата страница)
const withLang = url => LANG === "bg" ? url : url + (url.includes("?") ? "&" : "?") + "lang=" + LANG;   // към страница, която се превежда с JS

// превод на статичните текстове: data-i18n (текст), data-i18n-ph (placeholder), data-i18n-aria (aria-label)
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(e => { e.textContent = tt(e.dataset.i18n, e.dataset.vars ? JSON.parse(e.dataset.vars) : undefined); });
  document.querySelectorAll("[data-i18n-ph]").forEach(e => { e.placeholder = tt(e.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-aria]").forEach(e => { e.setAttribute("aria-label", tt(e.dataset.i18nAria)); });
  document.querySelectorAll("a[data-idx]").forEach(a => { a.href = idxHref(a.dataset.idx); });
  if (typeof paintTheme === "function") paintTheme();
  paintLang();
}
function setLang(l) {
  if (!I18N.LANGS.includes(l) || l === LANG) return;
  try { localStorage.setItem("lang", l); } catch (e) {}
  if (PAGE_PATH !== undefined) { location.href = SITE_ROOT + langDir(l) + PAGE_PATH; return; }   // версията на същата страница на другия език
  LANG = l; ROOT_EL.lang = l;
  try { const u = new URL(location.href); u.searchParams.delete("lang"); history.replaceState(null, "", u); } catch (e) {}
  applyI18n();
  if (typeof onLangChange === "function") onLangChange();
}

// превключвател: флаг + абревиатура, падащ списък с 4-те езика
function paintLang() {
  const box = document.getElementById("lang");
  if (!box) return;
  const m = I18N.META[LANG];
  box.innerHTML = `<details class="langsw"><summary aria-label="${tt("lang.aria")}"><span class="fl">${m.flag}</span> ${m.abbr} ▾</summary><div class="menu">${
    I18N.LANGS.map(l => `<button type="button" data-l="${l}" class="${l === LANG ? "on" : ""}"><span class="fl">${I18N.META[l].flag}</span> ${I18N.META[l].abbr} <small>${I18N.META[l].name}</small></button>`).join("")
  }</div></details>`;
  box.querySelectorAll("button[data-l]").forEach(b => { b.onclick = () => { box.querySelector("details").open = false; setLang(b.dataset.l); }; });
}
document.addEventListener("click", e => { const d = document.querySelector(".langsw[open]"); if (d && !d.contains(e.target)) d.open = false; });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyI18n); else applyI18n();
