// Генерира data.json и страница за всяка аптека (apteka/*.html) от data/pharmacies.txt + data/overrides.json.
// Стартиране: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const H = createRequire(import.meta.url)("./holidays.js");
const I = createRequire(import.meta.url)("./i18n.js");   // трябва да се зареди преди hours.js и render.js
const HL = createRequire(import.meta.url)("./hours.js");
const R = createRequire(import.meta.url)("./render.js");   // общи шаблони за страниците на аптеки и квартали
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

// ---------- езици ----------
// bg е в корена на сайта. Страниците, които се индексират (начална, „Почивни дни“, квартали), имат готова версия за всеки
// език в /en/, /ru/, /uk/. Останалите (аптеки, корекция) се превеждат с JS (виж static.js, lang.js).
const LANGS = I.LANGS, tl = (l, k, v) => I.t(l, k, v);
const dirOf = l => (l === "bg" ? "" : l + "/");
const urlOf = (l, path) => BASE + dirOf(l) + path;
const OG_LOCALE = { bg: "bg_BG", en: "en_GB", ru: "ru_RU", uk: "uk_UA" };
const hreflangs = path => LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(urlOf(l, path))}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${esc(urlOf("bg", path))}">`;

const plain = p => HL.summary(p, "bg").replace(/^—$/, "");
const descr = p => tl("bg", "pg.descr", { name: p.name, addr: p.address,
  phone: p.phone ? tl("bg", "pg.descrPhone", { p: p.phone }) : "", hours: plain(p) ? tl("bg", "pg.descrHours", { h: plain(p).replace(/\.$/, "") }) : "" });
const pageUrl = p => urlOf("bg", `apteka/${p.slug}.html`);
function pharmacyLd(p) {
  const o = { "@type":"Pharmacy", name:p.name, url:pageUrl(p),
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

// обща обвивка на генерираните страници; root е относителният път до корена на сайта
const shell = ({ l, root, attrs, head, inner, scripts }) => `<!doctype html>
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
<aside class="side" aria-hidden="true"></aside>
<div class="content">
<nav class="nav"><a class="on" href="${root}${dirOf(l)}" data-idx="" data-i18n="nav.pharm">${esc(tl(l, "nav.pharm"))}</a><a href="${root}${dirOf(l)}pochivni-dni.html" data-idx="pochivni-dni.html" data-i18n="nav.hol">${esc(tl(l, "nav.hol"))}</a><button id="theme" type="button"></button><div id="lang"></div></nav>
<div id="app">${inner}</div>
</div>
<aside class="side" aria-hidden="true"></aside>
</div>
${scripts.map(s => `<script src="${root}${s}"></script>`).join("\n")}
</body>
</html>
`;
const ogMeta = (l, url, title, desc) => `<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:locale" content="${OG_LOCALE[l]}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">`;

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
  const { ps } = k, qn = I.quarter(l, k.name), faq = R.kvFaq(k, l), root = l === "bg" ? "../" : "../../", kp = `kvartal/${k.slug}.html`;
  const title = tl(l, "kv.title", { q: qn }), desc = tl(l, "kv.desc", { q: qn, n: R.pl(l, ps.length), h24: ps.some(p => p.h24) ? tl(l, "kv.desc24") : "" });
  const sorted = ps.slice().sort((a, b) => (b.h24 - a.h24) || a.name.localeCompare(b.name, "bg"));
  writeFileSync(dirOf(l) + kp, shell({ l, root, attrs: `data-lang="${l}" data-page="${kp}"`,
    head: `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${ogMeta(l, kvUrl(k, l), title, desc)}\n${hreflangs(kp)}\n${ld({ "@context":"https://schema.org", "@graph":[
      { "@type":"CollectionPage", name:title, url:kvUrl(k, l), inLanguage:l, dateModified:today, about:{ "@type":"Place", name:`${qn}, ${tl(l, "city")}` } },
      { "@type":"ItemList", numberOfItems:ps.length, itemListElement:sorted.map((p, i) => ({ "@type":"ListItem", position:i + 1, name:`${p.name} – ${p.address}`, url:pageUrl(p) })) },
      { "@type":"BreadcrumbList", itemListElement:[{ "@type":"ListItem", position:1, name:tl(l, "index.title"), item:urlOf(l, "") }, { "@type":"ListItem", position:2, name:tl(l, "kv.h1", { q: qn }), item:kvUrl(k, l) }] },
      ...(faq.length ? [{ "@type":"FAQPage", mainEntity:faq.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) }] : [])
    ] })}`,
    inner: R.kvartalHtml(k, kvartali, l, { root, kvInfo }),
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
// видим текст за всяка година (заглавие + два абзаца); въпросите и отговорите за структурираните данни са във faqOf
const faqYear = (l, { y, hs, easter, school }) => `<h3>${esc(tl(l, "faqy.h", { y }))}</h3>
  <p>${esc(tl(l, "faqy.p1", { y, n: hs.length, easter: dm(l, easter), list: hs.map(h => `${dm(l, h.date)} (${I.dowName(l, h.date.getDay()).toLowerCase()}) – ${holName(l, y, h)}`).join("; ") }))}</p>
  <p>${esc(tl(l, "faqy.p2", { y, list: school.map(e => `${I.name(l, e.name)} – ${dm(l, e.fromD)}${e.from === e.to ? "" : " " + tl(l, "faqy.to") + " " + dm(l, e.toD)}`).join("; ") }))}</p>`;
const metaBlock = (l, path, title, desc) => `${ogMeta(l, urlOf(l, path), title, desc)}
${hreflangs(path)}
<meta name="description" content="${esc(desc)}"><meta property="og:site_name" content="${esc(tl(l, "index.title"))}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`;

function indexFill(s, l) {
  const title = tl(l, "index.docTitle"), desc = tl(l, "index.desc", { n: list.length });
  s = subStr(s, "META", metaBlock(l, "", title, desc));
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
  <p>${kvartali.map(k => `<a href="kvartal/${k.slug}.html">${esc(I.quarter(l, k.name))}</a> (${k.ps.length})`).join(" · ")}</p>
</section>`);
  return { s, title };
}
function holFill(s, l) {
  const title = tl(l, "hol.docTitle", { y: yearsTxt }), desc = tl(l, "hol.desc", { y: yearsTxt });
  s = subStr(s, "META", metaBlock(l, "pochivni-dni.html", title, desc));
  const faqAll = yearBlocks.flatMap(yb => faqOf(l, yb));
  s = subStr(s, "LD", ld({ "@context":"https://schema.org", "@graph":[
    { "@type":"WebPage", name:tl(l, "hol.title"), url:urlOf(l, "pochivni-dni.html"), inLanguage:l, dateModified:today },
    { "@type":"FAQPage", mainEntity: faqAll.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) },
    ...yearBlocks.flatMap(({ y, hs }) => hs.map(h => ({ "@type":"Event", name:holName(l, y, h), startDate:isoDate(h.date), endDate:isoDate(h.date),
      eventAttendanceMode:"https://schema.org/OfflineEventAttendanceMode", eventStatus:"https://schema.org/EventScheduled",
      location:{ "@type":"Country", name:tl(l, "country") } })))
  ] }));
  s = subStr(s, "SEOFAQ", `
<section class="card seo" id="faq">
  <h2 data-i18n="faq.h">${esc(tl(l, "faq.h"))}</h2>
  ${yearBlocks.map(yb => faqYear(l, yb)).join("\n  ")}
</section>`);
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
    .replace(/(href|src)="(style\.css|[a-z0-9-]+\.js)"/g, '$1="../$2"');
}
for (const [file, fill] of [["index.html", indexFill], ["pochivni-dni.html", holFill]]) {
  const src = readFileSync(file, "utf8");
  const bg = fill(src, "bg");
  const bgPage = pretranslate(bg.s, "bg");
  writeFileSync(file, bgPage);                                   // българската версия остава в корена (и е шаблонът)
  for (const l of LANGS.filter(x => x !== "bg")) {
    const r = fill(src, l);
    writeFileSync(`${dirOf(l)}${file}`, langCopy(pretranslate(r.s, l), l, r.title));
  }
}

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

## Бележки
- Часът на затваряне е по данни от Google Maps; часовете на отваряне се допълват ръчно. Проверявайте по телефона.
- Почивните дни са по Кодекса на труда (чл. 154) и решенията на Министерския съвет; учебните ваканции – по заповеди на МОН.
`);
console.log(`SEO: sitemap (${urls.length} адреса), robots.txt, llms.txt.`);
