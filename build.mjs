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
const theme = `<script>(function(){try{var p=localStorage.getItem("theme")||"auto",d=document.documentElement;d.dataset.pref=p;if(p==="auto"){var h=+new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Sofia",hour:"2-digit",hour12:false}).format(new Date())%24;p=(h>=20||h<7)?"dark":"light"}d.dataset.theme=p}catch(e){}})();</script>`;
const navHtml = `<nav class="nav"><a class="on" href="../" data-i18n="nav.pharm">Аптеки</a><a href="../pochivni-dni.html" data-i18n="nav.hol">Почивни дни</a><button id="theme" type="button"></button><div id="lang"></div></nav>`;
const scripts = `<script src="../i18n.js"></script>\n<script src="../hours.js"></script>\n<script src="../render.js"></script>\n<script src="../common.js"></script>\n<script src="../static.js"></script>`;
const shell = (attrs, head, inner) => `<!doctype html>
<html lang="bg" data-theme="auto" ${attrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<link rel="stylesheet" href="../style.css">
${theme}
</head>
<body>
<div class="layout">
<aside class="ad" data-i18n="ad">Място за реклама</aside>
<div class="content">
${navHtml}
<div id="app">${inner}</div>
</div>
<aside class="ad" data-i18n="ad">Място за реклама</aside>
</div>
${scripts}
</body>
</html>
`;
const ogMeta = (url, title, desc) => `<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:locale" content="bg_BG"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">`;

for (const d of ["apteka", "kvartal", "en", "ru", "uk"]) rmSync(d, { recursive: true, force: true });   // en/ru/uk – остатък от старата версия
mkdirSync("apteka"); mkdirSync("kvartal");

// ---------- страница на всяка аптека ----------
for (const p of list) {
  const title = tl("bg", "pg.title", { name: p.name, addr: p.address }), desc = descr(p);
  writeFileSync(`apteka/${p.slug}.html`, shell(`data-kind="pharmacy" data-id="${p.id}"`,
    `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${ogMeta(pageUrl(p), title, desc)}\n<meta name="robots" content="noindex, follow">\n${ld(pharmacyLd(p))}`,
    R.pharmacyHtml(p, "bg", { root: "../" })));
}
writeFileSync("data.json", JSON.stringify(list));
console.log(`Генерирани ${list.length} аптеки.`);

// ---------- страници по квартали ----------
const kvartali = R.buildKvartali(list);
const kvUrl = k => BASE + `kvartal/${k.slug}.html`;
for (const k of kvartali) {
  const { name, ps } = k, faq = R.kvFaq(k, "bg");
  const title = tl("bg", "kv.title", { q: name }), desc = tl("bg", "kv.desc", { q: name, n: R.pl("bg", ps.length), h24: ps.some(p => p.h24) ? tl("bg", "kv.desc24") : "" });
  const sorted = ps.slice().sort((a, b) => (b.h24 - a.h24) || a.name.localeCompare(b.name, "bg"));
  writeFileSync(`kvartal/${k.slug}.html`, shell(`data-kind="kvartal" data-slug="${k.slug}"`,
    `<title>${esc(title)}</title>\n<meta name="description" content="${esc(desc)}">\n${ogMeta(kvUrl(k), title, desc)}\n${ld({ "@context":"https://schema.org", "@graph":[
      { "@type":"CollectionPage", name:title, url:kvUrl(k), inLanguage:"bg", dateModified:today, about:{ "@type":"Place", name:`${name}, Варна` } },
      { "@type":"ItemList", numberOfItems:ps.length, itemListElement:sorted.map((p, i) => ({ "@type":"ListItem", position:i + 1, name:`${p.name} – ${p.address}`, url:pageUrl(p) })) },
      { "@type":"BreadcrumbList", itemListElement:[{ "@type":"ListItem", position:1, name:"Аптеки във Варна", item:BASE }, { "@type":"ListItem", position:2, name:tl("bg", "kv.h1", { q: name }), item:kvUrl(k) }] },
      ...(faq.length ? [{ "@type":"FAQPage", mainEntity:faq.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) }] : [])
    ] })}`,
    R.kvartalHtml(k, kvartali, "bg", { root: "../", kvInfo })));
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
// страниците на отделните аптеки са noindex
writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
  [BASE, "1.0"], [BASE + "pochivni-dni.html", "1.0"], ...kvartali.map(k => [kvUrl(k), "0.8"])
].map(([u, pri]) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`).join("\n")}\n</urlset>\n`);
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
