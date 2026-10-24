// Генерира data.json и страница за всяка аптека (apteka/*.html) от data/pharmacies.txt + data/overrides.json.
// Стартиране: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const H = createRequire(import.meta.url)("./holidays.js");
const I = createRequire(import.meta.url)("./i18n.js");   // трябва да е преди hours.js
const HL = createRequire(import.meta.url)("./hours.js");
const R = createRequire(import.meta.url)("./render.js");   // общи шаблони за страниците на аптеки и квартали (ползват се и в браузъра)
// Адрес на сайта (за canonical, sitemap, JSON-LD). При собствен домейн: SITE_URL=https://example.bg/ node build.mjs
const BASE = (process.env.SITE_URL || "https://dilyanniliev.github.io/apteki/").replace(/\/?$/, "/");
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

// ---------- страници на аптеки и квартали (на български, за търсачките; другите езици се превеждат в браузъра) ----------
const tl = (l, k, v) => I.t(l, k, v);
const plain = (p, l = "bg") => HL.summary(p, l).replace(/^—$/, "");
const descr = p => tl("bg", "pg.descr", { name: p.name, addr: p.address,
  phone: p.phone ? tl("bg", "pg.descrPhone", { p: p.phone }) : "", hours: plain(p) ? tl("bg", "pg.descrHours", { h: plain(p).replace(/\.$/, "") }) : "" });
const pageUrl = p => BASE + `apteka/${p.slug}.html`;
function pharmacyLd(p) {
  const o = { "@type":"Pharmacy", name:p.name, url:pageUrl(p), inLanguage:"bg",
    address:{ "@type":"PostalAddress", streetAddress:p.address, addressLocality:"Варна", addressCountry:"BG" } };
  if (p.phone) o.telephone = "+359" + p.phone.split("/")[0].replace(/\D/g, "").replace(/^0/, "");
  if (p.lat != null) o.geo = { "@type":"GeoCoordinates", latitude:p.lat, longitude:p.lon };
  if (p.website) o.sameAs = [p.website];
  const oh = HL.schemaHours(p); if (oh.length) o.openingHoursSpecification = oh;
  const crumbs = { "@type":"BreadcrumbList", itemListElement:[
    { "@type":"ListItem", position:1, name:"Аптеки във Варна", item:BASE }, { "@type":"ListItem", position:2, name:p.name, item:pageUrl(p) }] };
  return { "@context":"https://schema.org", "@graph":[o, crumbs] };
}
const theme = `<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>`;
// езици: bg е в корена, останалите в /en/, /ru/, /uk/ (само индексируемите страници – начална, почивни дни, квартали)
const LANGS = I.LANGS, dirOf = l => (l === "bg" ? "" : l + "/"), rootOf = l => (l === "bg" ? "../" : "../../");   // rootOf: от kvartal/ до корена
const urlOf = (l, path) => BASE + dirOf(l) + path;
const OGL = { bg: "bg_BG", en: "en_GB", ru: "ru_RU", uk: "uk_UA" };
const hreflangs = path => LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(urlOf(l, path))}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${esc(urlOf("bg", path))}">`;
const navHtml = (l, root) => `<nav class="nav"><a class="on" href="${root}${dirOf(l)}" id="navHome">${esc(tl(l, "nav.pharm"))}</a><a href="${root}${dirOf(l)}pochivni-dni.html" id="navHol">${esc(tl(l, "nav.hol"))}</a><button id="theme" type="button"></button><div id="lang"></div></nav>`;
const scriptsHtml = (root, extra) => `<script src="${root}i18n.js"></script>\n<script src="${root}hours.js"></script>\n<script src="${root}render.js"></script>\n<script src="${root}common.js"></script>${extra ? `\n<script src="${root}${extra}"></script>` : ""}`;
const shell = (l, root, attrs, head, inner, extraScript) => `<!doctype html>
<html lang="${l}" data-theme="auto" data-root="${root}" ${attrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<link rel="stylesheet" href="${root}style.css">
${theme}
</head>
<body>
<div class="layout">
<aside class="ad">${esc(tl(l, "ad"))}</aside>
<div class="content">
${navHtml(l, root)}
<div id="app">${inner}</div>
</div>
<aside class="ad">${esc(tl(l, "ad"))}</aside>
</div>
${scriptsHtml(root, extraScript)}
</body>
</html>
`;
const ogMeta = (l, url, title, desc, hreflangPath) => `<link rel="canonical" href="${esc(url)}">
${hreflangPath !== undefined ? hreflangs(hreflangPath) + "\n" : ""}<meta property="og:type" content="website"><meta property="og:locale" content="${OGL[l]}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">`;

for (const d of ["apteka", "kvartal", "en", "ru", "uk"]) rmSync(d, { recursive: true, force: true });
mkdirSync("apteka");
for (const l of LANGS) mkdirSync(dirOf(l) + "kvartal", { recursive: true });

// ---------- страница на всяка аптека (български; другите езици – с JS) ----------
for (const p of list) {
  const title = tl("bg", "pg.title", { name: p.name, addr: p.address }), desc = descr(p);
  writeFileSync(`apteka/${p.slug}.html`, shell("bg", "../", `data-kind="pharmacy" data-id="${p.id}"`,
    `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${ogMeta("bg", pageUrl(p), title, desc)}\n<meta name="robots" content="noindex, follow">\n${ld(pharmacyLd(p))}`,
    R.pharmacyHtml(p, "bg", { root: "../" }), "static.js"));
}
writeFileSync("data.json", JSON.stringify(list));
console.log(`Генерирани ${list.length} аптеки.`);

// ---------- страници по квартали – на 4 езика ----------
const kvartali = R.buildKvartali(list);
const kvUrl = (k, l = "bg") => urlOf(l, `kvartal/${k.slug}.html`);
for (const l of LANGS) for (const k of kvartali) {
  const { ps } = k, q = I.quarter(l, k.name), faq = R.kvFaq(k, l), root = rootOf(l), kp = `kvartal/${k.slug}.html`;
  const title = tl(l, "kv.title", { q }), desc = tl(l, "kv.desc", { q, n: R.pl(l, ps.length), h24: ps.some(p => p.h24) ? tl(l, "kv.desc24") : "" });
  const sorted = ps.slice().sort((a, b) => (b.h24 - a.h24) || a.name.localeCompare(b.name, "bg"));
  writeFileSync(dirOf(l) + kp, shell(l, root, `data-lang="${l}" data-page="${kp}"`,
    `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${ogMeta(l, kvUrl(k, l), title, desc, kp)}\n${ld({ "@context":"https://schema.org", "@graph":[
      { "@type":"CollectionPage", name:title, url:kvUrl(k, l), inLanguage:l, dateModified:today, about:{ "@type":"Place", name:`${q}, ${tl(l, "city")}` } },
      { "@type":"ItemList", numberOfItems:ps.length, itemListElement:sorted.map((p, i) => ({ "@type":"ListItem", position:i + 1, name:`${p.name} – ${p.address}`, url:pageUrl(p) })) },
      { "@type":"BreadcrumbList", itemListElement:[{ "@type":"ListItem", position:1, name:tl(l, "index.title"), item:urlOf(l, "") }, { "@type":"ListItem", position:2, name:tl(l, "kv.h1", { q }), item:kvUrl(k, l) }] },
      ...(faq.length ? [{ "@type":"FAQPage", mainEntity:faq.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) }] : [])
    ] })}`,
    R.kvartalHtml(k, kvartali, l, { root, kvInfo })));
}

// ---------- начална страница и „Почивни дни“: версии на 4 езика ----------
const subStr = (s, name, html) => {
  const re = new RegExp(`<!--${name}-->[\\s\\S]*?<!--/${name}-->`);
  if (!re.test(s)) throw new Error(`Липсва маркер ${name}`);
  return s.replace(re, () => `<!--${name}-->${html}<!--/${name}-->`);
};
const open24 = list.filter(p => p.h24);
const metaL = (l, path, title, desc) => `${ogMeta(l, urlOf(l, path), title, desc, path)}
<meta name="description" content="${esc(desc)}"><meta property="og:site_name" content="${esc(tl(l, "index.title"))}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`;
const todayY = +today.slice(0, 4), years = [todayY - 1, todayY, todayY + 1], yearsTxt = years.join(", ");
const dm = (l, d) => I.dayMonth(l, d);
const holIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const holName = (l, y, h) => h.comp ? tl(l, "hol.comp", { dow: I.dowName(l, h.comp.dow).toLowerCase(), date: dm(l, new Date(y, h.comp.m, h.comp.d)) }) : I.name(l, h.name);
const yearBlocks = years.map(y => ({ y, hs: H.holidays(y), easter: H.orthodoxEaster(y), school: H.schoolEvents(y).filter(e => e.kind === "vacation") }));
const faqOf = (l, { y, hs, easter, school }) => [
  { q: tl(l, "faq.q1", { y }), a: hs.map(h => `${dm(l, h.date)} (${I.dowName(l, h.date.getDay()).toLowerCase()}) – ${holName(l, y, h)}`).join("; ") + "." },
  { q: tl(l, "faq.q2", { y }), a: tl(l, "faq.a2", { y, date: dm(l, easter), dow: I.dowName(l, easter.getDay()).toLowerCase() }) },
  { q: tl(l, "faq.q3", { y }), a: school.map(e => `${I.name(l, e.name)}: ${dm(l, e.fromD)}${e.from === e.to ? "" : " – " + dm(l, e.toD)}${e.toD.getFullYear() !== y ? " " + e.toD.getFullYear() : ""}`).join("; ") + "." }
];

function indexFill(s, l) {
  const title = tl(l, "index.docTitle"), desc = tl(l, "index.desc", { n: list.length });
  s = subStr(s, "META", metaL(l, "", title, desc));
  s = subStr(s, "LD", ld({ "@context":"https://schema.org", "@graph":[
    { "@type":"WebSite", name:tl(l, "index.title"), url:urlOf(l, ""), inLanguage:l },
    { "@type":"ItemList", name:tl(l, "seo.h"), numberOfItems:kvartali.length,
      itemListElement:kvartali.map((k, i) => ({ "@type":"ListItem", position:i + 1, url:kvUrl(k, l), name:tl(l, "kv.h1", { q:I.quarter(l, k.name) }) })) },
    { "@type":"FAQPage", mainEntity:[
      { "@type":"Question", name:tl(l, "idx.q1"), acceptedAnswer:{ "@type":"Answer", text:tl(l, "idx.a1", { list: open24.map(p => `${p.name} (${p.address}${p.phone ? ", " + p.phone : ""})`).join("; ") }) } },
      { "@type":"Question", name:tl(l, "idx.q2"), acceptedAnswer:{ "@type":"Answer", text:tl(l, "idx.a2", { n: list.length }) } },
      { "@type":"Question", name:tl(l, "idx.q3"), acceptedAnswer:{ "@type":"Answer", text:tl(l, "idx.a3") } }
    ] } ] }));
  s = subStr(s, "SEOLIST", `
<section class="card seo" id="all-links">
  <h2 data-i18n="seo.h">${esc(tl(l, "seo.h"))}</h2>
  <p class="muted"><span data-i18n="seo.intro" data-vars='{"n":${list.length}}'>${esc(tl(l, "seo.intro", { n: list.length }))}</span> <span data-i18n="seo.h24">${esc(tl(l, "seo.h24"))}</span> ${open24.map(p => esc(p.name) + ", " + esc(p.address)).join("; ")}.</p>
  <p>${kvartali.map(k => `<a data-href="kvartal/${k.slug}.html" data-q="${esc(k.name)}" data-count="${k.ps.length}" href="${dirOf(l)}kvartal/${k.slug}.html">${esc(I.quarter(l, k.name))} (${k.ps.length})</a>`).join(" · ")}</p>
</section>`);
  return { s, title };
}
function holFill(s, l) {
  const title = tl(l, "hol.docTitle", { y: yearsTxt }), desc = tl(l, "hol.desc", { y: yearsTxt });
  s = subStr(s, "META", metaL(l, "pochivni-dni.html", title, desc));
  const faqAll = yearBlocks.flatMap(yb => faqOf(l, yb));
  s = subStr(s, "LD", ld({ "@context":"https://schema.org", "@graph":[
    { "@type":"WebPage", name:tl(l, "hol.title"), url:urlOf(l, "pochivni-dni.html"), inLanguage:l, dateModified:today },
    { "@type":"FAQPage", mainEntity: faqAll.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) },
    ...yearBlocks.flatMap(({ y, hs }) => hs.map(h => ({ "@type":"Event", name:holName(l, y, h), startDate:holIso(h.date), endDate:holIso(h.date),
      eventAttendanceMode:"https://schema.org/OfflineEventAttendanceMode", eventStatus:"https://schema.org/EventScheduled",
      location:{ "@type":"Country", name:l === "bg" ? "България" : l === "en" ? "Bulgaria" : l === "ru" ? "Болгария" : "Болгарія" } })))
  ] }));
  s = subStr(s, "SEOFAQ", `
<section class="card seo" id="faq">
  <h2 data-i18n="faq.h">${esc(tl(l, "faq.h"))}</h2>
  ${faqAll.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("\n  ")}
</section>`);
  return { s, title };
}
// за копията на други езици: превод на статичните текстове (data-i18n), заглавие, <html lang>, <base> и връзки в менюто
function pretranslate(s, l) {
  s = s.replace(/(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, key, old, close) => {
    const v = I.T[key]; if (!v || typeof v[0] !== "string") return m;
    const vm = open.match(/data-vars='([^']*)'/);
    return open + esc(tl(l, key, vm ? JSON.parse(vm[1]) : undefined)) + close;
  });
  s = s.replace(/(<[^>]*\bdata-i18n-ph="([^"]+)"[^>]*\bplaceholder=")[^"]*(")/g, (m, a, key, z) => a + esc(tl(l, key)) + z);
  return s;
}
function langCopy(src, l, title) {
  let s = src.replace(/<html lang="bg" data-theme="auto" data-lang="bg"/, `<html lang="${l}" data-theme="auto" data-lang="${l}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="../">')   // относителните връзки и файлове остават от корена на сайта
    .replace('href="./" id="navHome"', `href="${l}/" id="navHome"`).replace('id="navHol"', 'id="navHol"').replace(/href="pochivni-dni\.html"( id="navHol")/, `href="${l}/pochivni-dni.html"$1`)
    .replace(/<a class="on" href="\.\/" id="navHome"/, `<a class="on" href="${l}/" id="navHome"`);
  return pretranslate(s, l);
}
for (const [file, fill] of [["index.html", indexFill], ["pochivni-dni.html", holFill]]) {
  const src = readFileSync(file, "utf8");
  const bg = fill(src, "bg");
  writeFileSync(file, bg.s);                                   // българската версия остава в корена
  for (const l of LANGS.filter(x => x !== "bg")) {
    const r = fill(readFileSync(file, "utf8"), l);
    writeFileSync(`${dirOf(l)}${file}`, langCopy(r.s, l, r.title));
  }
}

// ---------- sitemap, robots, llms.txt ----------
// страниците на отделните аптеки са noindex; индексируемите страници са на 4 езика с hreflang
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

## Бележки
- Часът на затваряне е по данни от Google Maps; часовете на отваряне се допълват ръчно. Проверявайте по телефона.
- Почивните дни са по Кодекса на труда (чл. 154) и решенията на Министерския съвет; учебните ваканции – по заповеди на МОН.
`);
console.log(`SEO: sitemap (${urls.length} адреса), robots.txt, llms.txt.`);
