// Генерира data.json и страница за всяка аптека (apteka/*.html) от data/pharmacies.txt + data/overrides.json.
// Стартиране: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
const H = createRequire(import.meta.url)("./holidays.js");
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

function hoursHtml(p) {
  if (p.closedTemp) return "Временно затворена";
  if (p.h24) return "Денонощно (24 часа)";
  const known = HL.ORDER.some(d => p.days[d] !== undefined);
  if (!known) return p.close ? `Затваря в ${p.close} ч. <span class="muted">· часове по дни: предстои да се добавят</span>` : `<span class="muted">—</span>`;
  return `<table class="hours">${HL.ORDER.map(d => `<tr><td>${HL.LONG[d]}</td><td>${p.days[d] === undefined ? '<span class="muted">—</span>' : p.days[d] === null ? "Почивен ден" : p.days[d][0] + "–" + p.days[d][1]}</td></tr>`).join("")}</table>`;
}
const plain = p => HL.summary(p).replace(/^—$/, "");
const descr = p => `${p.name} – аптека във Варна, ${p.address}.${p.phone ? " Телефон: " + p.phone + "." : ""}${plain(p) ? " Работно време: " + plain(p).replace(/\.$/, "") + "." : ""} Карта и упътвания в Google Maps.`;
const pageUrl = p => BASE + "apteka/" + p.slug + ".html";
function pharmacyLd(p) {
  const o = { "@context":"https://schema.org", "@type":"Pharmacy", name:p.name, url:pageUrl(p),
    address:{ "@type":"PostalAddress", streetAddress:p.address, addressLocality:"Варна", addressCountry:"BG" } };
  if (p.phone) o.telephone = "+359" + p.phone.split("/")[0].replace(/\D/g, "").replace(/^0/, "");
  if (p.lat != null) o.geo = { "@type":"GeoCoordinates", latitude:p.lat, longitude:p.lon };
  if (p.website) o.sameAs = [p.website];
  const oh = HL.schemaHours(p); if (oh.length) o.openingHoursSpecification = oh;
  const crumbs = { "@context":"https://schema.org", "@type":"BreadcrumbList", itemListElement:[
    { "@type":"ListItem", position:1, name:"Аптеки във Варна", item:BASE }, { "@type":"ListItem", position:2, name:p.name, item:pageUrl(p) }] };
  delete o["@context"]; delete crumbs["@context"];
  return { "@context":"https://schema.org", "@graph":[o, crumbs] };
}
const theme = `<script>try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>`;

rmSync("apteka", { recursive: true, force: true });
mkdirSync("apteka");
for (const p of list) {
  const tel = p.phone.replace(/[^\d+]/g, "");
  writeFileSync(`apteka/${p.slug}.html`, `<!doctype html>
<html lang="bg" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.name)} – ${esc(p.address)}, Варна | Телефон и работно време</title>
<meta name="description" content="${esc(descr(p))}">
<link rel="canonical" href="${esc(BASE + "apteka/" + p.slug + ".html")}">
<meta property="og:type" content="website"><meta property="og:locale" content="bg_BG">
<meta property="og:title" content="${esc(p.name)} – ${esc(p.address)}, Варна"><meta property="og:description" content="${esc(descr(p))}">
<meta property="og:url" content="${esc(BASE + "apteka/" + p.slug + ".html")}">
<meta name="twitter:card" content="summary">
<meta name="robots" content="noindex, follow">
${ld(pharmacyLd(p))}
<link rel="stylesheet" href="../style.css">
${theme}
</head>
<body>
<div class="layout">
<aside class="ad">Място за реклама</aside>
<div class="content">
<nav class="nav"><a class="on" href="../">Аптеки</a><a href="../pochivni-dni.html">Почивни дни</a><button id="theme" type="button" aria-label="Смяна на режима"></button></nav>
<header>
  <div class="top"><a href="../">← Всички аптеки</a>${p.kvartalPage ? `<a href="../kvartal/${p.kvartalSlug}.html">Аптеки в ${esc(p.kvartal)} →</a>` : ""}</div>
  <h1>${esc(p.name)}</h1>
  <div id="badges">${p.h24 ? '<span class="badge">24ч</span>' : ""}${p.closedTemp ? '<span class="badge closed">Временно затворена</span>' : ""}${p.compound ? '<span class="badge alt">Приготвя лекарства</span>' : ""}${p.holiday ? '<span class="badge alt">Работи на празници</span>' : ""}<span id="state"></span></div>
</header>
<main>
  <section class="card info">
    <div class="row"><b>Адрес</b><span>${esc(p.address)}, Варна</span></div>
    ${p.kvartal ? `<div class="row"><b>Квартал</b><span>${p.kvartalPage ? `<a href="../kvartal/${p.kvartalSlug}.html">${esc(p.kvartal)}</a>` : esc(p.kvartal)}</span></div>` : ""}
    <div class="row"><b>Телефон</b><span>${p.phone ? `<a href="tel:${esc(tel)}">${esc(p.phone)}</a>` : '<span class="muted">—</span>'}</span></div>
    <div class="row"><b>Работно време</b><span>${hoursHtml(p)}</span></div>
    <div class="row"><b>Уебсайт</b><span>${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website)}</a>` : p.hasSite ? '<span class="muted">има сайт в Google – предстои да се добави</span>' : '<span class="muted">—</span>'}</span></div>
    ${p.note ? `<div class="row"><b>Бележка</b><span>${esc(p.note)}</span></div>` : ""}
    <div class="links"><a class="btn" href="${esc(dirUrl(p))}" target="_blank" rel="noopener">Упътвания в Google Maps</a>${p.phone ? `<a class="btn" href="tel:${esc(tel)}">Обади се</a>` : ""}</div>
  </section>
  <iframe class="map" title="Карта" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(embedUrl(p))}"></iframe>
</main>
</div>
<aside class="ad">Място за реклама</aside>
</div>
<script src="../hours.js"></script>
<script src="../common.js"></script>
<script>
const p = ${JSON.stringify({ days:p.days, h24:p.h24, closedTemp:p.closedTemp }).replace(/</g, "\\u003c")};
const st = isOpen(p, sofiaNow());
document.getElementById("state").innerHTML = st === true ? '<span class="badge">Отворено</span>' : st === false ? '<span class="badge closed">Затворено</span>' : "";
</script>
</body>
</html>
`);
}
writeFileSync("data.json", JSON.stringify(list));
console.log(`Генерирани ${list.length} аптеки.`);

// ---------- страници по квартали ----------
rmSync("kvartal", { recursive: true, force: true });
mkdirSync("kvartal");
const byKv = new Map();
for (const p of list) if (p.kvartal) (byKv.get(p.kvartal) || byKv.set(p.kvartal, []).get(p.kvartal)).push(p);
const KV_MIN = 3;   // страница за квартал се прави само при поне 3 аптеки – по-малките не са достатъчно полезни
const kvartali = [...byKv.entries()].filter(([, ps]) => ps.length >= KV_MIN).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "bg"))
  .map(([name, ps]) => ({ name, slug: slugify(name), ps }));
const kvUrl = k => BASE + "kvartal/" + k.slug + ".html";
const pl = (n, one, many) => n + " " + (n === 1 ? one : many);
const wk = (ps, d) => ps.filter(p => p.h24 || (p.days[d] && p.days[d] !== null));
function kvIntro(k) {
  const { name, ps } = k, h24 = ps.filter(p => p.h24);
  const wkdSat = wk(ps, 6), sun = wk(ps, 0);
  const sunKnown = ps.some(p => p.h24 || p.days[0] !== undefined);
  return [
    (kvInfo[name] && kvInfo[name].intro) || "",
    `В ${name}, Варна, в нашия списък има ${pl(ps.length, "аптека", "аптеки")}${h24.length ? `, от които ${pl(h24.length, "денонощна", "денонощни")}` : ", но няма денонощна"}.`,
    sunKnown ? `Аптеки с потвърдена работа в неделя: ${sun.length ? sun.map(p => p.name).join(", ") : "засега няма"}.` : "",
    wkdSat.length && ps.some(p => p.days[6] !== undefined) ? `С потвърдена работа в събота: ${pl(wkdSat.length, "аптека", "аптеки")}.` : ""
  ].filter(Boolean).join(" ");
}
function kvFaq(k) {
  const { name, ps } = k, h24 = ps.filter(p => p.h24), out = [];
  out.push({ q:`Има ли денонощна аптека в ${name}?`, a: h24.length ? `Да: ${h24.map(p => `${p.name} (${p.address}${p.phone ? ", тел. " + p.phone : ""})`).join("; ")}.` : `В нашия списък за ${name} няма денонощна аптека. Най-близките денонощни аптеки във Варна са на страницата „Денонощни аптеки“.` });
  const sun = ps.filter(p => p.h24 || (p.days[0] && p.days[0] !== null));
  if (ps.some(p => p.h24 || p.days[0] !== undefined)) out.push({ q:`Кои аптеки в ${name} работят в неделя?`, a: sun.length ? "С потвърдено работно време в неделя: " + sun.map(p => `${p.name} (${p.address}, ${HL.summary(p)})`).join("; ") + "." : `В момента нямаме потвърдена аптека в ${name}, която работи в неделя.` });
  const late = ps.filter(p => !p.h24).map(p => ({ p, c: ((p.days[1] || [])[1]) || p.close })).filter(x => x.c).sort((a, b) => b.c.localeCompare(a.c))[0];
  if (late) out.push({ q:`Коя аптека в ${name} работи най-късно вечерта?`, a:`Най-късно затваря ${late.p.name} (${late.p.address}) – в ${late.c} ч. в делничен ден.` });
  return out;
}
const rowHtml = (p, pre = "../") => `<tr><td><a href="${pre}apteka/${p.slug}.html">${esc(p.name)}</a>${p.h24 ? ' <span class="badge">24ч</span>' : ""}${p.closedTemp ? ' <span class="badge closed">затворена</span>' : ""}</td><td>${esc(p.address)}</td><td>${p.phone ? `<a href="tel:${esc(p.phone.split("/")[0].replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : "—"}</td><td>${esc(HL.summary(p))}</td><td><a href="${esc(dirUrl(p))}" target="_blank" rel="noopener">Карта</a></td></tr>`;
for (const k of kvartali) {
  const { name, ps } = k, faq = kvFaq(k), title = `Аптеки в ${name}, Варна – адреси, телефони и работно време`;
  const desc = `Аптеки в ${name}, Варна: ${pl(ps.length, "аптека", "аптеки")} с адрес, телефон и работно време по дни. ${ps.some(p => p.h24) ? "Включва денонощна аптека." : ""}`;
  const sorted = ps.slice().sort((a, b) => (b.h24 - a.h24) || a.name.localeCompare(b.name, "bg"));
  const others = kvartali.filter(x => x.slug !== k.slug);
  writeFileSync(`kvartal/${k.slug}.html`, `<!doctype html>
<html lang="bg" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(kvUrl(k))}">
<meta property="og:type" content="website"><meta property="og:locale" content="bg_BG"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(kvUrl(k))}">
<meta name="twitter:card" content="summary">
${ld({ "@context":"https://schema.org", "@graph":[
  { "@type":"CollectionPage", name:title, url:kvUrl(k), inLanguage:"bg", dateModified:today, about:{ "@type":"Place", name:`${name}, Варна` } },
  { "@type":"ItemList", numberOfItems:ps.length, itemListElement:sorted.map((p, i) => ({ "@type":"ListItem", position:i + 1, name:`${p.name} – ${p.address}`, url:pageUrl(p) })) },
  { "@type":"BreadcrumbList", itemListElement:[{ "@type":"ListItem", position:1, name:"Аптеки във Варна", item:BASE }, { "@type":"ListItem", position:2, name:`Аптеки в ${name}`, item:kvUrl(k) }] },
  ...(faq.length ? [{ "@type":"FAQPage", mainEntity:faq.map(f => ({ "@type":"Question", name:f.q, acceptedAnswer:{ "@type":"Answer", text:f.a } })) }] : [])
] })}
<link rel="stylesheet" href="../style.css">
${theme}
</head>
<body>
<div class="layout">
<aside class="ad">Място за реклама</aside>
<div class="content">
<nav class="nav"><a class="on" href="../">Аптеки</a><a href="../pochivni-dni.html">Почивни дни</a><button id="theme" type="button" aria-label="Смяна на режима"></button></nav>
<header>
  <p class="note"><a href="../">Аптеки във Варна</a> › ${esc(name)}</p>
  <h1>Аптеки в ${esc(name)}, Варна</h1>
  <p class="sub">${esc(kvIntro(k))}</p>
</header>
<main>
  <section class="card"><div class="tablewrap"><table class="list"><thead><tr><th>Аптека</th><th>Адрес</th><th>Телефон</th><th>Работно време</th><th></th></tr></thead><tbody>${sorted.map(p => rowHtml(p)).join("")}</tbody></table></div>
  <div class="links"><a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("аптеки " + name + " Варна")}" target="_blank" rel="noopener">Виж всички на картата</a></div></section>
  ${faq.length ? `<section class="card seo"><h2>Често задавани въпроси за аптеките в ${esc(name)}</h2>${faq.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}</section>` : ""}
  ${others.length ? `<section class="card seo"><h2>Аптеки в други квартали на Варна</h2><p>${others.map(x => `<a href="${x.slug}.html">${esc(x.name)}</a> (${x.ps.length})`).join(" · ")}</p></section>` : ""}
</main>
</div>
<aside class="ad">Място за реклама</aside>
</div>
<script src="../common.js"></script>
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
  <h2>Аптеки във Варна по квартали</h2>
  <p class="muted">Каталог на ${list.length} аптеки във Варна с адрес, телефон и работно време по дни. Денонощни аптеки: ${open24.map(p => esc(p.name) + ", " + esc(p.address)).join("; ")}.</p>
  <p>${kvartali.map(k => `<a href="kvartal/${k.slug}.html">${esc(k.name)}</a> (${k.ps.length})`).join(" · ") || "Кварталите ще бъдат добавени скоро."}</p>
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
sub("pochivni-dni.html", "LD", ld({ "@context":"https://schema.org", "@graph":[
  { "@type":"WebPage", name:"Почивни дни в България", url:BASE + "pochivni-dni.html", inLanguage:"bg", dateModified:today },
  { "@type":"FAQPage", mainEntity: yearBlocks.flatMap(({ y, hs, easter, offs, school }) => [
    { "@type":"Question", name:`Кои са официалните почивни дни през ${y} г. в България?`, acceptedAnswer:{ "@type":"Answer",
      text: hs.map(h => `${fmt(h.date)} (${H.DOW[h.date.getDay()].toLowerCase()}) – ${h.name}`).join("; ") + "." } },
    { "@type":"Question", name:`Кога е Великден през ${y} г.?`, acceptedAnswer:{ "@type":"Answer", text:`Православният Великден през ${y} г. е на ${fmt(easter)} (${H.DOW[easter.getDay()].toLowerCase()}). Официалните почивни дни са от Велики петък до Великденски понеделник.` } },
    { "@type":"Question", name:`Кога са учебните ваканции през ${y} г.?`, acceptedAnswer:{ "@type":"Answer", text: school.map(e => `${e.name}: ${fmt(e.fromD)}${e.from === e.to ? "" : " – " + fmt(e.toD)}${e.toD.getFullYear() !== y ? " " + e.toD.getFullYear() : ""}`).join("; ") + "." } }
  ]) },
  ...yearBlocks.flatMap(({ hs }) => hs.map(h => ({ "@type":"Event", name:h.name, startDate:holIso(h.date), endDate:holIso(h.date),
    eventAttendanceMode:"https://schema.org/OfflineEventAttendanceMode", eventStatus:"https://schema.org/EventScheduled",
    location:{ "@type":"Country", name:"България" } })))
] }));
sub("pochivni-dni.html", "SEOFAQ", `
<section class="card seo" id="faq">
  <h2>Често задавани въпроси за почивните дни</h2>
  ${yearBlocks.map(({ y, hs, easter, offs, school }) => `<h3>Почивни дни ${y}</h3>
  <p>През ${y} г. официалните празници и почивни дни в България са ${hs.length}: ${hs.map(h => `${fmt(h.date)} (${H.DOW[h.date.getDay()].toLowerCase()}) – ${esc(h.name)}`).join("; ")}. Православният Великден е на ${fmt(easter)}.</p>
  <p>Учебни ваканции през ${y} г.: ${school.map(e => `${esc(e.name)} – ${fmt(e.fromD)}${e.from === e.to ? "" : " до " + fmt(e.toD)}`).join("; ")}.</p>`).join("\n  ")}
</section>`);

// ---------- sitemap, robots, llms.txt ----------
const urls = [BASE, BASE + "pochivni-dni.html", ...kvartali.map(kvUrl)];   // страниците на отделните аптеки са noindex
writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u, i) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><priority>${i < 2 ? "1.0" : "0.8"}</priority></url>`).join("\n")}\n</urlset>\n`);
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
