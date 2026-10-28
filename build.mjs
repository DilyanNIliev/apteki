// Генерира data.json и страница за всяка аптека (apteka/*.html) от data/pharmacies.txt + data/overrides.json.
// Стартиране: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const H = createRequire(import.meta.url)("./holidays.js");
const I = createRequire(import.meta.url)("./i18n.js");   // трябва да се зареди преди hours.js и render.js
const HL = createRequire(import.meta.url)("./hours.js");
const R = createRequire(import.meta.url)("./render.js");   // общи шаблони за страниците на аптеки и квартали
// Адрес на сайта (за canonical, sitemap, JSON-LD): променливата SITE_URL, иначе "siteUrl" от data/config.json (при собствен домейн), иначе GitHub Pages.
let cfgSite = ""; try { cfgSite = JSON.parse(readFileSync("data/config.json", "utf8")).siteUrl || ""; } catch {}
const BASE = (process.env.SITE_URL || cfgSite || "https://dilyanniliev.github.io/apteki/").replace(/\/?$/, "/");
const today = new Date().toISOString().slice(0, 10);
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

const TR = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sht",ъ:"a",ь:"",ю:"yu",я:"ya" };
const slugify = s => s.toLowerCase().split("").map(c => TR[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

// overrides.json: { "001": { website, kvartal, wdOpen, wdClose, saOpen, saClose, saOff, suOpen, suClose, suOff, gmaps, lat, lon, compound, holiday, note } } – ключът е номерът на реда в pharmacies.txt
let overrides = {};
try { overrides = JSON.parse(readFileSync("data/overrides.json", "utf8")); } catch {}

// Автоматично определяне на квартал – само при явни признаци (име или улица); останалото се задава в админ страницата.
const AUTO = [
  [/Чайка/, "Чайка"], [/Младост/, "Младост"], [/Кайсиева|ж\.к\. Владислав Варненчик|Владиславово/, "Владиславово"],
  [/Аспарухово|Народни будители|Кирил и Методий/, "Аспарухово"], [/Трошево/, "Трошево"], [/Св(ети|\.) Иван Рилски/, "Св. Иван Рилски"],
  [/Кочмар/, "Кочмар"], [/Колхозен пазар/, "Колхозен пазар"], [/Левски/, "Левски"], [/Аксаково/, "Аксаково"], [/Владая/, "Владая"],
  [/Цар Освободител (?:[1-9]\d?\b|10\d\b|77А)|27-ми юли|Патриарх Евтимий|ул\. Русе/, "Център"]
];
const autoKvartal = (name, address) => (AUTO.find(([re]) => re.test(name + " " + address)) || [])[1] || "";
let kvInfo = {};
try { kvInfo = JSON.parse(readFileSync("data/kvartali.json", "utf8")); } catch {}   // { "Чайка": { "intro": "…" } }

const rows = readFileSync("data/pharmacies.txt", "utf8").split("\n").filter(l => l.trim() && !l.startsWith("#"));
const list = rows.map((line, i) => {
  const [name0, address0, phone0, close, flags = ""] = line.split("|").map(s => s.trim());
  const id = String(i + 1).padStart(3, "0");
  const f = flags.split(/\s+/);
  const o = overrides[id] || {};
  const name = o.name || name0, address = o.address || address0;
  return {
    id, slug: id + "-" + slugify(name0).slice(0, 40) + "-" + slugify(address0).slice(0, 30),
    name, address, phone: o.phone || phone0 || "",
    wdOpen: o.wdOpen || o.open || "", wdClose: o.wdClose || o.close || "",
    saOpen: o.saOpen || "", saClose: o.saClose || "", saOff: !!o.saOff, suOpen: o.suOpen || "", suClose: o.suClose || "", suOff: !!o.suOff,
    close: o.wdClose || o.close || close || "",
    h24: f.includes("24"), closedTemp: f.includes("x"),
    hasSite: f.includes("w") || !!o.website, website: o.website || "",
    gmaps: o.gmaps || "", lat: o.lat ?? null, lon: o.lon ?? null,
    compound: !!o.compound, holiday: f.includes("24") || !!o.holiday, note: o.note || "",
    kvartal: o.kvartal || autoKvartal(name, address)
  };
}).map(p => ({ ...p, days: HL.buildDays(p), kvartalSlug: p.kvartal ? slugify(p.kvartal) : "" }));

const kvCount = {};
for (const p of list) if (p.kvartal) kvCount[p.kvartal] = (kvCount[p.kvartal] || 0) + 1;
for (const p of list) p.kvartalPage = !!p.kvartal && kvCount[p.kvartal] >= 3;   // има ли страница за квартала (поне 3 аптеки)

const q = p => encodeURIComponent(`${p.name}, ${p.address}, Варна`);
const dirUrl = p => p.gmaps || `https://www.google.com/maps/dir/?api=1&destination=${q(p)}`;
const embedUrl = p => p.lat != null ? `https://maps.google.com/maps?q=${p.lat},${p.lon}&z=17&output=embed` : `https://maps.google.com/maps?q=${q(p)}&z=16&output=embed`;

// ---------- езици ----------
// bg е в корена на сайта. Страниците, които се индексират (начална, „Почивни дни“, квартали), имат готова версия за всеки
// език в /en/, /ru/, /uk/. Останалите (аптеки, корекция) се превеждат с JS (виж static.js, lang.js).
const LANGS = I.LANGS, tl = (l, k, v) => I.t(l, k, v);
const dirOf = l => (l === "bg" ? "" : l + "/");
const urlOf = (l, path) => BASE + dirOf(l) + path;
const OG_LOCALE = { bg: "bg_BG", en: "en_GB", ru: "ru_RU", uk: "uk_UA" };
const hreflangs = path => LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(urlOf(l, path))}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${esc(urlOf("bg", path))}">`;
const imgUrl = (l, kind) => BASE + `og-${kind}-${l}.png`;         // картинка за споделяне (kind: index | hol)

const plain = p => HL.summary(p, "bg").replace(/^—$/, "");
const descr = p => tl("bg", "pg.descr", { name: p.name, addr: p.address,
  phone: p.phone ? tl("bg", "pg.descrPhone", { p: p.phone }) : "", hours: plain(p) ? tl("bg", "pg.descrHours", { h: plain(p).replace(/\.$/, "") }) : "" });
const pageUrl = p => urlOf("bg", `apteka/${p.slug}.html`);
// аптека като структурирани данни (schema.org/Pharmacy); url – страницата, към която сочи записът
function pharmacyNode(p, l, url) {
  const o = { "@type":"Pharmacy", name:p.name, url,
    address:{ "@type":"PostalAddress", streetAddress:p.address, addressLocality:tl(l, "city"), addressCountry:"BG" } };
  if (p.phone) o.telephone = "+359" + p.phone.split("/")[0].replace(/\D/g, "").replace(/^0/, "");
  if (p.lat != null) o.geo = { "@type":"GeoCoordinates", latitude:p.lat, longitude:p.lon };
  if (p.website) o.sameAs = [p.website];
  const oh = HL.schemaHours(p); if (oh.length) o.openingHoursSpecification = oh;
  return o;
}
function pharmacyLd(p) {
  const crumbs = { "@type":"BreadcrumbList", itemListElement:[
    { "@type":"ListItem", position:1, name:"Аптеки във Варна", item:BASE }, { "@type":"ListItem", position:2, name:p.name, item:pageUrl(p) }] };
  return { "@context":"https://schema.org", "@graph":[pharmacyNode(p, "bg", pageUrl(p)), crumbs] };
}
const theme = `<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>`;
// иконки, манифест и цвят на браузъра; root е относителният път до корена
const iconLinks = root => `<meta name="theme-color" content="#0a8f5b">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="${root}apple-touch-icon.png"><link rel="manifest" href="${root}manifest.webmanifest">`;

// долен колонтитул с видими връзки: езици (за търсачките и за хората) и основни страници
const LANG_NAMES = { bg: "Български", en: "English", ru: "Русский", uk: "Українська" };
const footerHtml = (l, path, pre, kvs) => {
  const href = (x, p) => (pre + dirOf(x) + p) || "./";
  return `<footer class="site-footer">
  <nav aria-label="${esc(tl(l, "foot.lang"))}"><b>${esc(tl(l, "foot.lang"))}:</b> ${LANGS.map(x => `<a href="${href(x, path)}" hreflang="${x}" lang="${x}"${x === l ? ' aria-current="true"' : ""}>${LANG_NAMES[x]}</a>`).join(" · ")}</nav>
  <nav aria-label="${esc(tl(l, "foot.pages"))}"><b>${esc(tl(l, "foot.pages"))}:</b> <a href="${href(l, "")}">${esc(tl(l, "nav.pharm"))}</a> · <a href="${href(l, "pochivni-dni.html")}">${esc(tl(l, "nav.hol"))}</a>${kvs.length ? " · " + kvs.map(k => `<a href="${href(l, `kvartal/${k.slug}.html`)}">${esc(I.quarter(l, k.name))}</a>`).join(" · ") : ""}</nav>
</footer>`;
};

// обща обвивка на генерираните страници; root е относителният път до корена на сайта
const shell = ({ l, root, attrs, head, inner, scripts, foot = "" }) => `<!doctype html>
<html lang="${l}" data-theme="auto" data-root="${root}" ${attrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${iconLinks(root)}
${head}
<link rel="stylesheet" href="${root}style.css">
${theme}
</head>
<body>
<div class="layout">
<aside class="side" aria-hidden="true"></aside>
<div class="content">
<nav class="nav"><a class="on" href="${root}${dirOf(l)}" data-idx="" data-i18n="nav.pharm">${esc(tl(l, "nav.pharm"))}</a><a href="${root}${dirOf(l)}pochivni-dni.html" data-idx="pochivni-dni.html" data-i18n="nav.hol">${esc(tl(l, "nav.hol"))}</a><button id="theme" type="button"></button><div id="lang"></div></nav>
<div id="app">${inner}</div>
${foot}
</div>
<aside class="side" aria-hidden="true"></aside>
</div>
${scripts.map(s => `<script src="${root}${s}"></script>`).join("\n")}
</body>
</html>
`;
// за страници без индексиране (аптеки)
const ogMeta = (l, url, title, desc) => `<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:locale" content="${OG_LOCALE[l]}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">`;
// за страниците, които се индексират: canonical, езикови връзки, robots, Open Graph и Twitter с картинка
const seoMeta = (l, path, title, desc, kind) => `<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
<link rel="canonical" href="${esc(urlOf(l, path))}">
${hreflangs(path)}
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(tl(l, "index.title"))}"><meta property="og:locale" content="${OG_LOCALE[l]}">${LANGS.filter(x => x !== l).map(x => `<meta property="og:locale:alternate" content="${OG_LOCALE[x]}">`).join("")}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(urlOf(l, path))}">
<meta property="og:image" content="${esc(imgUrl(l, kind))}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(imgUrl(l, kind))}">`;

for (const d of ["apteka", "kvartal", ...LANGS.filter(l => l !== "bg")]) rmSync(d, { recursive: true, force: true });
mkdirSync("apteka");
for (const l of LANGS) mkdirSync(dirOf(l) + "kvartal", { recursive: true });

// ---------- страница на всяка аптека (на български; другите езици – с JS) ----------
for (const p of list) {
  const title = tl("bg", "pg.title", { name: p.name, addr: p.address }), desc = descr(p);
  writeFileSync(`apteka/${p.slug}.html`, shell({ l: "bg", root: "../", attrs: `data-kind="pharmacy" data-id="${p.id}"`,
    head: `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${ogMeta("bg", pageUrl(p), title, desc)}\n<meta name="robots" content="noindex, follow">\n${ld(pharmacyLd(p))}`,
    inner: R.pharmacyHtml(p, "bg", { root: "../" }),
    scripts: ["i18n.js", "hours.js", "render.js", "lang.js", "common.js", "static.js"] }));
}
writeFileSync("data.json", JSON.stringify(list));
console.log(`Генерирани ${list.length} аптеки.`);

// ---------- страници по квартали – на всички езици ----------
const kvartali = R.buildKvartali(list);
const kvUrl = (k, l = "bg") => urlOf(l, `kvartal/${k.slug}.html`);
for (const l of LANGS) for (const k of kvartali) {
  const { ps } = k, qn = I.quarter(l, k.name), faq = R.kvFaq(k, l), root = l === "bg" ? "../" : "../../", kp = `kvartal/${k.slug}.html`, url = kvUrl(k, l);
  const title = tl(l, "kv.title", { q: qn }), desc = tl(l, "kv.desc", { q: qn, n: R.pl(l, ps.length), h24: ps.some(p => p.h24) ? tl(l, "kv.desc24") : "" });
  const sorted = ps.slice().sort((a, b) => (b.h24 - a.h24) || a.name.localeCompare(b.name, "bg"));
  writeFileSync(dirOf(l) + kp, shell({ l, root, attrs: `data-lang="${l}" data-page="${kp}"`,
    head: `<title>${esc(title)}</title>\n${seoMeta(l, kp, title, desc, "index")}\n${ld({ "@context":"https://schema.org", "@graph":[
      { "@type":"CollectionPage", "@id":url, name:title, description:desc, url, inLanguage:l, dateModified:today, primaryImageOfPage:imgUrl(l, "index"),
        isPartOf:{ "@id":BASE + "#site" }, about:{ "@type":"Place", name:`${qn}, ${tl(l, "city")}` }, breadcrumb:{ "@id":url + "#crumbs" } },
      { "@type":"BreadcrumbList", "@id":url + "#crumbs", itemListElement:[{ "@type":"ListItem", position:1, name:tl(l, "index.title"), item:urlOf(l, "") }, { "@type":"ListItem", position:2, name:tl(l, "kv.h1", { q: qn }), item:url }] },
      { "@type":"ItemList", numberOfItems:ps.length, itemListElement:sorted.map((p, i) => ({ "@type":"ListItem", position:i + 1, item:{ ...pharmacyNode(p, l, `${url}#p${p.id}`), "@id":`${url}#p${p.id}` } })) },
      ...(faq.length ? [{ "@type":"FAQPage", mainEntity:faq.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) }] : [])
    ] })}`,
    inner: R.kvartalHtml(k, kvartali, l, { root, kvInfo }),
    foot: footerHtml(l, kp, root, kvartali),
    scripts: ["i18n.js", "hours.js", "lang.js", "common.js"] }));
}

// ---------- начална страница и „Почивни дни“: версия на всеки език ----------
// index.html и pochivni-dni.html са шаблони за българската версия (корена); езиковите версии се правят от тях в /en/, /ru/, /uk/.
const subStr = (s, name, html) => {
  const re = new RegExp(`<!--${name}-->[\\s\\S]*?<!--/${name}-->`);
  if (!re.test(s)) throw new Error(`Липсва маркер ${name}`);
  return s.replace(re, () => `<!--${name}-->${html}<!--/${name}-->`);
};
const open24 = list.filter(p => p.h24);
const todayY = +today.slice(0, 4), years = [todayY - 1, todayY, todayY + 1], yearsTxt = years.join(", ");
const dm = (l, d) => I.dayMonth(l, d);
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const holName = (l, y, h) => h.comp ? tl(l, "hol.comp", { dow: I.dowName(l, h.comp.dow).toLowerCase(), date: dm(l, new Date(y, h.comp.m, h.comp.d)) }) : I.name(l, h.name);
const yearBlocks = years.map(y => ({ y, hs: H.holidays(y), easter: H.orthodoxEaster(y), school: H.schoolEvents(y).filter(e => e.kind === "vacation") }));
const faqOf = (l, { y, hs, easter, school }) => [
  { q: tl(l, "faq.q1", { y }), a: hs.map(h => `${dm(l, h.date)} (${I.dowName(l, h.date.getDay()).toLowerCase()}) – ${holName(l, y, h)}`).join("; ") + "." },
  { q: tl(l, "faq.q2", { y }), a: tl(l, "faq.a2", { y, date: dm(l, easter), dow: I.dowName(l, easter.getDay()).toLowerCase() }) },
  { q: tl(l, "faq.q3", { y }), a: school.map(e => `${I.name(l, e.name)}: ${dm(l, e.fromD)}${e.from === e.to ? "" : " – " + dm(l, e.toD)}${e.toD.getFullYear() !== y ? " " + e.toD.getFullYear() : ""}`).join("; ") + "." }
];
const faqHtml = (heading, items) => `<section class="card seo" id="faq">
  <h2>${esc(heading)}</h2>
  ${items.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("\n  ")}
</section>`;
const orgNodes = l => [
  { "@type":"Organization", "@id":BASE + "#org", name:tl("bg", "index.title"), url:BASE, logo:{ "@type":"ImageObject", url:BASE + "icon-512.png", width:512, height:512 } },
  { "@type":"WebSite", "@id":BASE + "#site", name:tl(l, "index.title"), url:urlOf(l, ""), inLanguage:l, publisher:{ "@id":BASE + "#org" } }
];
const pageNode = (l, path, title, desc, kind) => ({ "@type":"WebPage", "@id":urlOf(l, path) + "#page", name:title, description:desc, url:urlOf(l, path), inLanguage:l, dateModified:today,
  isPartOf:{ "@id":BASE + "#site" }, primaryImageOfPage:imgUrl(l, kind), breadcrumb:{ "@id":urlOf(l, path) + "#crumbs" } });
const crumbs = (l, path, trail) => ({ "@type":"BreadcrumbList", "@id":urlOf(l, path) + "#crumbs", itemListElement:trail.map(([name, p], i) => ({ "@type":"ListItem", position:i + 1, name, item:urlOf(l, p) })) });
const preOf = l => (l === "bg" ? "" : "../");           // от страница в корена на езиковата версия до корена на сайта

function indexFill(s, l) {
  const title = tl(l, "index.docTitle"), desc = tl(l, "index.desc", { n: list.length }), pre = preOf(l);
  const faq = [{ q: tl(l, "idx.q1"), a: tl(l, "idx.a1", { list: open24.map(p => `${p.name} (${p.address}${p.phone ? ", " + p.phone : ""})`).join("; ") }) },
               { q: tl(l, "idx.q2"), a: tl(l, "idx.a2", { n: list.length }) }, { q: tl(l, "idx.q3"), a: tl(l, "idx.a3") }];
  s = subStr(s, "META", seoMeta(l, "", title, desc, "index"));
  s = subStr(s, "LD", ld({ "@context":"https://schema.org", "@graph":[
    ...orgNodes(l), pageNode(l, "", title, desc, "index"), crumbs(l, "", [[tl(l, "index.title"), ""]]),
    { "@type":"ItemList", name:tl(l, "seo.h"), numberOfItems:kvartali.length,
      itemListElement:kvartali.map((k, i) => ({ "@type":"ListItem", position:i + 1, url:kvUrl(k, l), name:tl(l, "kv.h1", { q:I.quarter(l, k.name) }) })) },
    { "@type":"FAQPage", mainEntity:faq.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) } ] }));
  s = subStr(s, "LIST", list.map(p => R.cardHtml(p, l, { root: pre, open: null })).join(""));       // списъкът е в готовия HTML; JS го заменя при зареждане
  s = subStr(s, "SEOLIST", `
<section class="card seo" id="all-links">
  <h2 data-i18n="seo.h">${esc(tl(l, "seo.h"))}</h2>
  <p class="muted"><span data-i18n="seo.intro" data-vars='{"n":${list.length}}'>${esc(tl(l, "seo.intro", { n: list.length }))}</span> <span data-i18n="seo.h24">${esc(tl(l, "seo.h24"))}</span> ${open24.map(p => esc(p.name) + ", " + esc(p.address)).join("; ")}.</p>
  <p>${kvartali.map(k => `<a href="kvartal/${k.slug}.html">${esc(I.quarter(l, k.name))}</a> (${k.ps.length})`).join(" · ")}</p>
</section>
${faqHtml(tl(l, "idx.faqH"), faq)}`);
  s = subStr(s, "FOOT", footerHtml(l, "", pre, kvartali));
  return { s, title };
}
function holFill(s, l) {
  const title = tl(l, "hol.seoTitle", { y: todayY }), desc = tl(l, "hol.desc", { y: yearsTxt }), pre = preOf(l);
  const faqAll = yearBlocks.flatMap(yb => faqOf(l, yb));
  s = subStr(s, "META", seoMeta(l, "pochivni-dni.html", title, desc, "hol"));
  s = subStr(s, "LD", ld({ "@context":"https://schema.org", "@graph":[
    ...orgNodes(l), pageNode(l, "pochivni-dni.html", title, desc, "hol"),
    crumbs(l, "pochivni-dni.html", [[tl(l, "index.title"), ""], [tl(l, "hol.title"), "pochivni-dni.html"]]),
    { "@type":"FAQPage", mainEntity: faqAll.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) }
  ] }));
  s = subStr(s, "Y", String(todayY));
  s = subStr(s, "HOL", H.holidays(todayY).map(h => `<div class="hol ${isoDate(h.date) < today ? "past" : ""}">
      <div class="d">${esc(dm(l, h.date))}, ${esc(I.dowName(l, h.date.getDay()))}</div>
      <div>${esc(holName(l, todayY, h))}${h.off ? ` <span class="badge">${esc(tl(l, "hol.badge.off"))}</span>` : ` <span class="badge closed">${esc(tl(l, "hol.badge.ph"))}</span>`}</div></div>`).join(""));
  s = subStr(s, "SEOFAQ", "\n" + faqHtml(tl(l, "faq.h"), faqAll));
  s = subStr(s, "FOOT", footerHtml(l, "pochivni-dni.html", pre, kvartali));
  return { s, title };
}
// превод на статичните текстове на готовата страница: data-i18n (текст), data-tr (текст с текущата година), data-i18n-ph (placeholder)
function pretranslate(s, l) {
  const fill = (m, open, tag, key, close, vars) => {
    const v = I.T[key];
    if (!v || typeof v[0] !== "string") throw new Error("Няма превод за " + key);
    return open + esc(tl(l, key, vars)) + close;
  };
  s = s.replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)[^<]*(<\/\2>)/g, (m, open, tag, key, close) => {
    const vm = open.match(/data-vars='([^']*)'/);
    return fill(m, open, tag, key, close, vm ? JSON.parse(vm[1]) : undefined);
  });
  s = s.replace(/(<([a-z0-9]+)\b[^>]*\sdata-tr="([^"]+)"[^>]*>)[^<]*(<\/\2>)/g, (m, open, tag, key, close) => fill(m, open, tag, key, close, { y: todayY }));
  s = s.replace(/<[^>]*\sdata-i18n-ph="([^"]+)"[^>]*>/g, (tag, key) => tag.replace(/placeholder="[^"]*"/, `placeholder="${esc(tl(l, key))}"`));
  return s;
}
// копие на страницата в /en/, /ru/, /uk/: друг език, заглавие и пътища до общите файлове (те остават в корена)
function langCopy(s, l, title) {
  return s.replace('<html lang="bg" data-theme="auto" data-lang="bg"', `<html lang="${l}" data-theme="auto" data-lang="${l}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace('data-root=""', 'data-root="../"')
    .replace(/(href|src)="(style\.css|[a-z0-9-]+\.js|favicon\.svg|apple-touch-icon\.png|manifest\.webmanifest)"/g, '$1="../$2"');
}
for (const [file, fill] of [["index.html", indexFill], ["pochivni-dni.html", holFill]]) {
  const src = readFileSync(file, "utf8");
  const bg = fill(src, "bg");
  writeFileSync(file, pretranslate(bg.s, "bg"));                // българската версия остава в корена (и е шаблонът)
  for (const l of LANGS.filter(x => x !== "bg")) {
    const r = fill(src, l);
    writeFileSync(`${dirOf(l)}${file}`, langCopy(pretranslate(r.s, l), l, r.title));
  }
}

// ---------- страница 404 (GitHub Pages я показва за липсващи адреси) ----------
const basePath = new URL(BASE).pathname;                     // "/apteki/" или "/" при собствен домейн
writeFileSync("404.html", `<!doctype html>
<html lang="bg" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Страницата не е намерена</title>
<meta name="robots" content="noindex">
<link rel="icon" href="${basePath}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${basePath}style.css">
${theme}
</head>
<body>
<div class="layout"><aside class="side" aria-hidden="true"></aside>
<div class="content"><main style="padding-top:48px">
  <h1>404 – Страницата не е намерена</h1>
  <p class="sub">Адресът не съществува или е преместен. Опитай някоя от основните страници:</p>
  <p class="links"><a class="btn" href="${basePath}">Аптеки във Варна</a><a class="btn ghost" href="${basePath}pochivni-dni.html">Почивни дни</a></p>
  <p class="note"><a href="${basePath}en/">English</a> · <a href="${basePath}ru/">Русский</a> · <a href="${basePath}uk/">Українська</a></p>
</main></div><aside class="side" aria-hidden="true"></aside></div>
</body>
</html>
`);

// ---------- sitemap, robots, llms.txt ----------
const alt = path => LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(urlOf(l, path))}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(urlOf("bg", path))}"/>`;
const smUrl = (l, path, pri) => `  <url><loc>${esc(urlOf(l, path))}</loc><lastmod>${today}</lastmod><priority>${pri}</priority>${alt(path)}</url>`;
writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[
  ...LANGS.map(l => smUrl(l, "", "1.0")), ...LANGS.map(l => smUrl(l, "pochivni-dni.html", "1.0")),
  ...kvartali.flatMap(k => LANGS.map(l => smUrl(l, `kvartal/${k.slug}.html`, l === "bg" ? "0.8" : "0.7")))
].join("\n")}\n</urlset>\n`);
const urls = [BASE, BASE + "pochivni-dni.html", ...kvartali.map(k => kvUrl(k))];
writeFileSync("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin.html\n\n# Разрешаваме и ИИ роботите да четат сайта\nUser-agent: GPTBot\nAllow: /\nUser-agent: ClaudeBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nUser-agent: Google-Extended\nAllow: /\nDisallow: /admin.html\n\nSitemap: ${BASE}sitemap.xml\n`);
writeFileSync("llms.txt", `# Аптеки във Варна и почивни дни

> Каталог на ${list.length} аптеки във Варна (адрес, телефон, работно време, карта) и календар с официалните почивни дни, учебните ваканции и препоръки за отпуска в България.

## Страници
- [Аптеки във Варна](${BASE}): търсене и филтри – работят сега, денонощни, най-близка до мен
- [Почивни дни в България](${BASE}pochivni-dni.html): празници за ${years.join(", ")}, учебни ваканции и най-изгодни комбинации за отпуска
- [Аптеки по квартали](${BASE}): ${kvartali.map(k => `[${k.name}](${kvUrl(k)})`).join(", ") || "предстои"}\n- [Данни за аптеките (JSON)](${BASE}data.json): всички аптеки като структурирани данни

## Денонощни аптеки във Варна
${open24.map(p => `- [${p.name}](${pageUrl(p)}): ${p.address}${p.phone ? ", " + p.phone : ""}`).join("\n")}

## Всички аптеки
${list.map(p => `- [${p.name}](${pageUrl(p)}): ${p.address}${p.phone ? ", " + p.phone : ""}${plain(p) ? " – " + plain(p) : ""}${p.kvartal ? " (" + p.kvartal + ")" : ""}`).join("\n")}

## Езици
- [Български](${BASE}), [English](${BASE}en/), [Русский](${BASE}ru/), [Українська](${BASE}uk/)

## Бележки
- Часът на затваряне е по данни от Google Maps; часовете на отваряне се допълват ръчно. Проверявайте по телефона.
- Почивните дни са по Кодекса на труда (чл. 154) и решенията на Министерския съвет; учебните ваканции – по заповеди на МОН.
`);
console.log(`SEO: sitemap (${urls.length} адреса), robots.txt, llms.txt.`);
