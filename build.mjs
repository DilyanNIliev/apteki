// Генерира data.json и страница за всяка аптека (apteka/*.html) от data/pharmacies.txt + data/overrides.json.
// Стартиране: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const H = createRequire(import.meta.url)("./holidays.js");
const I = createRequire(import.meta.url)("./i18n.js");   // трябва да е преди hours.js
const HL = createRequire(import.meta.url)("./hours.js");
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

// ---------- езици: bg е в корена, останалите в /en/, /ru/, /uk/ ----------
const LANGS = I.LANGS, tl = (l, k, v) => I.t(l, k, v);
const dirOf = l => (l === "bg" ? "" : l + "/");
const rootOf = l => (l === "bg" ? "../" : "../../");              // от apteka/ и kvartal/ до корена на сайта
const qsL = l => (l === "bg" ? "" : "?lang=" + l);                  // връзки към динамичните страници (начална, почивни дни)
const urlOf = (l, path) => BASE + dirOf(l) + path;
const hreflangs = path => LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${esc(urlOf(l, path))}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${esc(urlOf("bg", path))}">`;
const OGL = { bg: "bg_BG", en: "en_GB", ru: "ru_RU", uk: "uk_UA" };
const pluralIdx = (l, n) => (l === "ru" || l === "uk") ? ((n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? 1 : 2) : (n === 1 ? 0 : 1);
const pl = (l, n) => n + " " + tl(l, "kv.i.pharm")[pluralIdx(l, n)];

function hoursHtml(p, l) {
  if (p.closedTemp) return tl(l, "closedTemp");
  if (p.h24) return tl(l, "h.24long");
  const known = HL.ORDER.some(d => p.days[d] !== undefined);
  if (!known) return p.close ? tl(l, "h.closesAtNoDays", { c: p.close }) : `<span class="muted">—</span>`;
  return `<table class="hours">${HL.ORDER.map(d => `<tr><td>${HL.long(l, d)}</td><td>${p.days[d] === undefined ? '<span class="muted">—</span>' : p.days[d] === null ? tl(l, "h.offDay") : p.days[d][0] + "–" + p.days[d][1]}</td></tr>`).join("")}</table>`;
}
const plain = (p, l = "bg") => HL.summary(p, l).replace(/^—$/, "");
const descr = (p, l) => tl(l, "pg.descr", { name: p.name, addr: p.address,
  phone: p.phone ? tl(l, "pg.descrPhone", { p: p.phone }) : "", hours: plain(p, l) ? tl(l, "pg.descrHours", { h: plain(p, l).replace(/\.$/, "") }) : "" });
const pageUrl = (p, l = "bg") => urlOf(l, `apteka/${p.slug}.html`);
function pharmacyLd(p, l) {
  const o = { "@type":"Pharmacy", name:p.name, url:pageUrl(p, l), inLanguage:l,
    address:{ "@type":"PostalAddress", streetAddress:p.address, addressLocality:tl(l, "city"), addressCountry:"BG" } };
  if (p.phone) o.telephone = "+359" + p.phone.split("/")[0].replace(/\D/g, "").replace(/^0/, "");
  if (p.lat != null) o.geo = { "@type":"GeoCoordinates", latitude:p.lat, longitude:p.lon };
  if (p.website) o.sameAs = [p.website];
  const oh = HL.schemaHours(p); if (oh.length) o.openingHoursSpecification = oh;
  const crumbs = { "@type":"BreadcrumbList", itemListElement:[
    { "@type":"ListItem", position:1, name:tl(l, "index.title"), item:BASE + (l === "bg" ? "" : "?lang=" + l) }, { "@type":"ListItem", position:2, name:p.name, item:pageUrl(p, l) }] };
  return { "@context":"https://schema.org", "@graph":[o, crumbs] };
}
const theme = `<script>(function(){try{var p=localStorage.getItem("theme")||"auto",d=document.documentElement;d.dataset.pref=p;if(p==="auto"){var h=+new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Sofia",hour:"2-digit",hour12:false}).format(new Date())%24;p=(h>=20||h<7)?"dark":"light"}d.dataset.theme=p}catch(e){}})();</script>`;
const navHtml = l => { const r = rootOf(l); return `<nav class="nav"><a class="on" href="${r}${qsL(l)}">${esc(tl(l, "nav.pharm"))}</a><a href="${r}pochivni-dni.html${qsL(l)}">${esc(tl(l, "nav.hol"))}</a><button id="theme" type="button"></button><div id="lang"></div></nav>`; };
const scripts = l => `<script src="${rootOf(l)}i18n.js"></script>\n<script src="${rootOf(l)}hours.js"></script>\n<script src="${rootOf(l)}common.js"></script>`;
const htmlOpen = (l, page) => `<html lang="${l}" data-theme="auto" data-static="1" data-root="${rootOf(l)}" data-page="${esc(page)}">`;

for (const d of ["apteka", "kvartal", ...LANGS.filter(l => l !== "bg")]) rmSync(d, { recursive: true, force: true });
for (const l of LANGS) { mkdirSync(dirOf(l) + "apteka", { recursive: true }); mkdirSync(dirOf(l) + "kvartal", { recursive: true }); }

// ---------- страница на всяка аптека ----------
for (const l of LANGS) for (const p of list) {
  const tel = p.phone.replace(/[^\d+]/g, ""), root = rootOf(l), pp = `apteka/${p.slug}.html`;
  const title = tl(l, "pg.title", { name: p.name, addr: p.address }), desc = descr(p, l);
  const fixHref = `${root}korekciya.html?id=${p.id}${l === "bg" ? "" : "&lang=" + l}`;
  writeFileSync(dirOf(l) + pp, `<!doctype html>
${htmlOpen(l, pp)}
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(pageUrl(p, l))}">
${hreflangs(pp)}
<meta property="og:type" content="website"><meta property="og:locale" content="${OGL[l]}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(pageUrl(p, l))}">
<meta name="twitter:card" content="summary">
<meta name="robots" content="noindex, follow">
${ld(pharmacyLd(p, l))}
<link rel="stylesheet" href="${root}style.css">
${theme}
</head>
<body>
<div class="layout">
<aside class="ad">${esc(tl(l, "ad"))}</aside>
<div class="content">
${navHtml(l)}
<header>
  <div class="top"><a href="${root}${qsL(l)}">${esc(tl(l, "back.all"))}</a>${p.kvartalPage ? `<a href="../kvartal/${p.kvartalSlug}.html">${esc(tl(l, "in.quarter", { q: I.quarter(l, p.kvartal) }))}</a>` : ""}</div>
  <h1>${esc(p.name)}</h1>
  <div id="badges">${p.h24 ? `<span class="badge">${esc(tl(l, "yes24"))}</span>` : ""}${p.closedTemp ? `<span class="badge closed">${esc(tl(l, "closedTemp"))}</span>` : ""}${p.compound ? `<span class="badge alt">${esc(tl(l, "badge.compound"))}</span>` : ""}${p.holiday ? `<span class="badge alt">${esc(tl(l, "badge.holiday"))}</span>` : ""}<span id="state"></span></div>
</header>
<main>
  <section class="card info">
    <div class="row"><b>${esc(tl(l, "lbl.address"))}</b><span>${esc(p.address)}, ${esc(tl(l, "city"))}</span></div>
    ${p.kvartal ? `<div class="row"><b>${esc(tl(l, "lbl.quarter"))}</b><span>${p.kvartalPage ? `<a href="../kvartal/${p.kvartalSlug}.html">${esc(I.quarter(l, p.kvartal))}</a>` : esc(I.quarter(l, p.kvartal))}</span></div>` : ""}
    <div class="row"><b>${esc(tl(l, "lbl.phone"))}</b><span>${p.phone ? `<a href="tel:${esc(tel)}">${esc(p.phone)}</a>` : '<span class="muted">—</span>'}</span></div>
    <div class="row"><b>${esc(tl(l, "lbl.hours"))}</b><span>${hoursHtml(p, l)}</span></div>
    <div class="row"><b>${esc(tl(l, "lbl.website"))}</b><span>${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website)}</a>` : p.hasSite ? `<span class="muted">${esc(tl(l, "site.missing"))}</span>` : '<span class="muted">—</span>'}</span></div>
    ${p.note ? `<div class="row"><b>${esc(tl(l, "lbl.note"))}</b><span>${esc(p.note)}</span></div>` : ""}
    <div class="links"><a class="btn" href="${esc(dirUrl(p))}" target="_blank" rel="noopener">${esc(tl(l, "btn.directions"))}</a>${p.phone ? `<a class="btn" href="tel:${esc(tel)}">${esc(tl(l, "btn.call"))}</a>` : ""}</div>
  </section>
  <iframe class="map" title="${esc(tl(l, "btn.map").replace(/^\S+\s/, ""))}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(embedUrl(p))}"></iframe>
  <section class="card fix">
    <h2>${esc(tl(l, "fix.h"))}</h2>
    <p class="muted">${esc(tl(l, "fix.p"))}</p>
    <div class="actions"><a class="btn sm ghost" href="${esc(dirUrl(p))}" target="_blank" rel="noopener">${esc(tl(l, "btn.gmaps"))}</a><a class="btn fix" href="${esc(fixHref)}">${esc(tl(l, "btn.fix"))}</a></div>
  </section>
</main>
</div>
<aside class="ad">${esc(tl(l, "ad"))}</aside>
</div>
${scripts(l)}
<script>
const p = ${JSON.stringify({ days:p.days, close:p.close, h24:p.h24, closedTemp:p.closedTemp }).replace(/</g, "\\u003c")};
const st = isOpen(p, sofiaNow());
document.getElementById("state").innerHTML = st === true ? '<span class="badge">' + tt("badge.open") + '</span>' : st === false ? '<span class="badge closed">' + tt("badge.closed") + '</span>' : "";
</script>
</body>
</html>
`);
}
writeFileSync("data.json", JSON.stringify(list));
console.log(`Генерирани ${list.length} аптеки × ${LANGS.length} езика.`);

// ---------- страници по квартали ----------
const byKv = new Map();
for (const p of list) if (p.kvartal) (byKv.get(p.kvartal) || byKv.set(p.kvartal, []).get(p.kvartal)).push(p);
const KV_MIN = 3;   // страница за квартал се прави само при поне 3 аптеки – по-малките не са достатъчно полезни
const kvartali = [...byKv.entries()].filter(([, ps]) => ps.length >= KV_MIN).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "bg"))
  .map(([name, ps]) => ({ name, slug: slugify(name), ps }));
const kvUrl = (k, l = "bg") => urlOf(l, `kvartal/${k.slug}.html`);
const wk = (ps, d) => ps.filter(p => p.h24 || (p.days[d] && p.days[d] !== null));
function kvIntro(k, l) {
  const { name, ps } = k, q = I.quarter(l, name), h24 = ps.filter(p => p.h24);
  const wkdSat = wk(ps, 6), sun = wk(ps, 0);
  const sunKnown = ps.some(p => p.h24 || p.days[0] !== undefined);
  const info = kvInfo[name] || {};
  return [
    info["intro_" + l] || (l === "bg" ? info.intro : "") || "",
    tl(l, "kv.i.count", { q, n: pl(l, ps.length), h24: h24.length ? tl(l, "kv.i.with24", { n: h24.length }) : tl(l, "kv.i.no24") }),
    sunKnown ? tl(l, "kv.i.sun", { list: sun.length ? sun.map(p => p.name).join(", ") : tl(l, "kv.i.none") }) : "",
    wkdSat.length && ps.some(p => p.days[6] !== undefined) ? tl(l, "kv.i.sat", { n: wkdSat.length }) : ""
  ].filter(Boolean).join(" ");
}
function kvFaq(k, l) {
  const { name, ps } = k, q = I.quarter(l, name), h24 = ps.filter(p => p.h24), out = [];
  out.push({ q: tl(l, "kv.q.24", { q }), a: h24.length ? tl(l, "kv.a.24yes", { list: h24.map(p => `${p.name} (${p.address}${p.phone ? ", " + p.phone : ""})`).join("; ") }) : tl(l, "kv.a.24no", { q }) });
  const sun = ps.filter(p => p.h24 || (p.days[0] && p.days[0] !== null));
  if (ps.some(p => p.h24 || p.days[0] !== undefined)) out.push({ q: tl(l, "kv.q.sun", { q }), a: sun.length ? tl(l, "kv.a.sunYes", { list: sun.map(p => `${p.name} (${p.address}, ${HL.summary(p, l)})`).join("; ") }) : tl(l, "kv.a.sunNo", { q }) });
  const late = ps.filter(p => !p.h24).map(p => ({ p, c: ((p.days[1] || [])[1]) || p.close })).filter(x => x.c).sort((a, b) => b.c.localeCompare(a.c))[0];
  if (late) out.push({ q: tl(l, "kv.q.late", { q }), a: tl(l, "kv.a.late", { name: late.p.name, addr: late.p.address, c: late.c }) });
  return out;
}
const rowHtml = (p, l) => `<tr><td><a href="../apteka/${p.slug}.html">${esc(p.name)}</a>${p.h24 ? ` <span class="badge">${esc(tl(l, "yes24"))}</span>` : ""}${p.closedTemp ? ` <span class="badge closed">${esc(tl(l, "badge.closed"))}</span>` : ""}</td><td>${esc(p.address)}</td><td>${p.phone ? `<a href="tel:${esc(p.phone.split("/")[0].replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : "—"}</td><td>${esc(HL.summary(p, l))}</td><td><div class="actions"><a class="btn sm ghost" href="${esc(dirUrl(p))}" target="_blank" rel="noopener">${esc(tl(l, "btn.map"))}</a><a class="btn sm fix" href="${rootOf(l)}korekciya.html?id=${p.id}${l === "bg" ? "" : "&lang=" + l}">${esc(tl(l, "btn.fixShort"))}</a></div></td></tr>`;
for (const l of LANGS) for (const k of kvartali) {
  const { name, ps } = k, q = I.quarter(l, name), faq = kvFaq(k, l), kp = `kvartal/${k.slug}.html`, root = rootOf(l);
  const title = tl(l, "kv.title", { q }), desc = tl(l, "kv.desc", { q, n: pl(l, ps.length), h24: ps.some(p => p.h24) ? tl(l, "kv.desc24") : "" });
  const sorted = ps.slice().sort((a, b) => (b.h24 - a.h24) || a.name.localeCompare(b.name, "bg"));
  const others = kvartali.filter(x => x.slug !== k.slug), th = tl(l, "kv.th");
  writeFileSync(dirOf(l) + kp, `<!doctype html>
${htmlOpen(l, kp)}
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(kvUrl(k, l))}">
${hreflangs(kp)}
<meta property="og:type" content="website"><meta property="og:locale" content="${OGL[l]}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(kvUrl(k, l))}">
<meta name="twitter:card" content="summary">
${ld({ "@context":"https://schema.org", "@graph":[
  { "@type":"CollectionPage", name:title, url:kvUrl(k, l), inLanguage:l, dateModified:today, about:{ "@type":"Place", name:`${q}, ${tl(l, "city")}` } },
  { "@type":"ItemList", numberOfItems:ps.length, itemListElement:sorted.map((p, i) => ({ "@type":"ListItem", position:i + 1, name:`${p.name} – ${p.address}`, url:pageUrl(p, l) })) },
  { "@type":"BreadcrumbList", itemListElement:[{ "@type":"ListItem", position:1, name:tl(l, "index.title"), item:BASE + qsL(l) }, { "@type":"ListItem", position:2, name:tl(l, "kv.h1", { q }), item:kvUrl(k, l) }] },
  ...(faq.length ? [{ "@type":"FAQPage", mainEntity:faq.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) }] : [])
] })}
<link rel="stylesheet" href="${root}style.css">
${theme}
</head>
<body>
<div class="layout">
<aside class="ad">${esc(tl(l, "ad"))}</aside>
<div class="content">
${navHtml(l)}
<header>
  <p class="note"><a href="${root}${qsL(l)}">${esc(tl(l, "index.title"))}</a> › ${esc(q)}</p>
  <h1>${esc(tl(l, "kv.h1", { q }))}</h1>
  <p class="sub">${esc(kvIntro(k, l))}</p>
</header>
<main>
  <section class="card"><div class="tablewrap"><table class="list"><thead><tr>${th.map(x => `<th>${esc(x)}</th>`).join("")}<th></th></tr></thead><tbody>${sorted.map(p => rowHtml(p, l)).join("")}</tbody></table></div>
  <div class="links"><a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tl(l, "kv.mapQuery", { q }))}" target="_blank" rel="noopener">${esc(tl(l, "kv.allMap"))}</a></div></section>
  ${faq.length ? `<section class="card seo"><h2>${esc(tl(l, "kv.faqH", { q }))}</h2>${faq.map(f => `<details class="acc"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</section>` : ""}
  ${others.length ? `<section class="card seo"><h2>${esc(tl(l, "kv.otherH"))}</h2><p>${others.map(x => `<a href="${x.slug}.html">${esc(I.quarter(l, x.name))}</a> (${x.ps.length})`).join(" · ")}</p></section>` : ""}
</main>
</div>
<aside class="ad">${esc(tl(l, "ad"))}</aside>
</div>
${scripts(l)}
</body>
</html>
`);
}

// ---------- SEO за началната страница ----------
const sub = (file, name, html) => {
  const s = readFileSync(file, "utf8"), re = new RegExp(`<!--${name}-->[\\s\\S]*?<!--/${name}-->`);
  if (!re.test(s)) throw new Error(`Липсва маркер ${name} във ${file}`);
  writeFileSync(file, s.replace(re, () => `<!--${name}-->${html}<!--/${name}-->`));
};
const open24 = list.filter(p => p.h24);
const meta = (path, title, desc) => `<link rel="canonical" href="${esc(BASE + path)}">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:locale" content="bg_BG"><meta property="og:site_name" content="Аптеки във Варна">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(BASE + path)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`;
sub("index.html", "META", meta("", "Аптеки във Варна – работно време, телефони и карта", `Всички аптеки във Варна: ${list.length} адреса с телефон, работно време и карта. Денонощни аптеки, отворени сега и най-близка до теб.`));
sub("index.html", "LD", ld({ "@context":"https://schema.org", "@graph":[
  { "@type":"WebSite", name:"Аптеки във Варна", url:BASE, inLanguage:"bg" },
  { "@type":"ItemList", name:"Аптеки във Варна по квартали", numberOfItems:kvartali.length,
    itemListElement:kvartali.map((k, i) => ({ "@type":"ListItem", position:i + 1, url:kvUrl(k), name:`Аптеки в ${k.name}` })) },
  { "@type":"FAQPage", mainEntity:[
    { "@type":"Question", name:"Кои са денонощните аптеки във Варна?", acceptedAnswer:{ "@type":"Answer", text:"Денонощни аптеки във Варна: " + open24.map(p => `${p.name} (${p.address}${p.phone ? ", тел. " + p.phone : ""})`).join("; ") + "." } },
    { "@type":"Question", name:"Колко аптеки има в списъка?", acceptedAnswer:{ "@type":"Answer", text:`В сайта са събрани ${list.length} аптеки във Варна с адрес, телефон, работно време и карта.` } },
    { "@type":"Question", name:"Как да намеря най-близката аптека?", acceptedAnswer:{ "@type":"Answer", text:"Натиснете бутона „Най-близка до мен“ и разрешете достъп до местоположението – аптеките се подреждат по разстояние." } }
  ] } ] }));
sub("index.html", "SEOLIST", `
<section class="card seo" id="all-links">
  <h2 data-i18n="seo.h">Аптеки във Варна по квартали</h2>
  <p class="muted"><span data-i18n="seo.intro" data-vars='{"n":${list.length}}'>Каталог на ${list.length} аптеки във Варна с адрес, телефон и работно време по дни.</span> <span data-i18n="seo.h24">Денонощни аптеки:</span> ${open24.map(p => esc(p.name) + ", " + esc(p.address)).join("; ")}.</p>
  <p>${kvartali.map(k => `<a data-href="kvartal/${k.slug}.html" data-q="${esc(k.name)}" data-count="${k.ps.length}" href="kvartal/${k.slug}.html">${esc(k.name)} (${k.ps.length})</a>`).join(" · ") || "Кварталите ще бъдат добавени скоро."}</p>
</section>`);

// ---------- SEO за страницата с почивните дни (3 години, статично) ----------
const todayY = +today.slice(0, 4), years = [todayY - 1, todayY, todayY + 1];
const fmt = d => `${d.getDate()} ${H.MON[d.getMonth()].toLowerCase()}`;
const holIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yearBlocks = years.map(y => {
  const hs = H.holidays(y), easter = H.orthodoxEaster(y), offs = hs.filter(h => h.off);
  return { y, hs, easter, offs, school: H.schoolEvents(y).filter(e => e.kind === "vacation") };
});
sub("pochivni-dni.html", "META", meta("pochivni-dni.html", `Почивни дни ${years.join(", ")} в България – празници, учебни ваканции и отпуска`, `Официални почивни дни и празници в България за ${years.join(", ")}, учебни ваканции по МОН и най-изгодните комбинации за отпуска, за да почиваш по-дълго.`));
const faqOf = ({ y, hs, easter, school }) => [
  { q:`Кои са официалните почивни дни през ${y} г. в България?`, a: hs.map(h => `${fmt(h.date)} (${H.DOW[h.date.getDay()].toLowerCase()}) – ${h.name}`).join("; ") + "." },
  { q:`Кога е Великден през ${y} г.?`, a:`Православният Великден през ${y} г. е на ${fmt(easter)} (${H.DOW[easter.getDay()].toLowerCase()}). Официалните почивни дни са от Велики петък до Великденски понеделник.` },
  { q:`Кога са учебните ваканции през ${y} г.?`, a: school.map(e => `${e.name}: ${fmt(e.fromD)}${e.from === e.to ? "" : " – " + fmt(e.toD)}${e.toD.getFullYear() !== y ? " " + e.toD.getFullYear() : ""}`).join("; ") + "." }
];
const faqAll = yearBlocks.flatMap(faqOf);
sub("pochivni-dni.html", "LD", ld({ "@context":"https://schema.org", "@graph":[
  { "@type":"WebPage", name:"Почивни дни в България", url:BASE + "pochivni-dni.html", inLanguage:"bg", dateModified:today },
  { "@type":"FAQPage", mainEntity: faqAll.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) },
  ...yearBlocks.flatMap(({ hs }) => hs.map(h => ({ "@type":"Event", name:h.name, startDate:holIso(h.date), endDate:holIso(h.date),
    eventAttendanceMode:"https://schema.org/OfflineEventAttendanceMode", eventStatus:"https://schema.org/EventScheduled",
    location:{ "@type":"Country", name:"България" } })))
] }));
// въпросите са в сгъваеми блокове (<details>), за да не заемат място; съдържанието им се индексира нормално
sub("pochivni-dni.html", "SEOFAQ", `
<section class="card seo" id="faq" data-bgonly>
  <h2 data-i18n="faq.h">Често задавани въпроси за почивните дни</h2>
  ${faqAll.map(f => `<details class="acc"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n  ")}
</section>`);

// ---------- sitemap, robots, llms.txt ----------
// страниците на отделните аптеки са noindex; кварталите са на 4 езика с hreflang
const alt = path => LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(urlOf(l, path))}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(urlOf("bg", path))}"/>`;
const smUrl = (loc, pri, path) => `  <url><loc>${esc(loc)}</loc><lastmod>${today}</lastmod><priority>${pri}</priority>${path ? alt(path) : ""}</url>`;
writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[
  smUrl(BASE, "1.0"), smUrl(BASE + "pochivni-dni.html", "1.0"),
  ...kvartali.flatMap(k => LANGS.map(l => smUrl(kvUrl(k, l), l === "bg" ? "0.8" : "0.7", `kvartal/${k.slug}.html`)))
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
