// Генерира data.json и страница за всяка аптека (apteka/*.html) от data/pharmacies.txt + data/overrides.json.
// Стартиране: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const TR = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sht",ъ:"a",ь:"",ю:"yu",я:"ya" };
const slugify = s => s.toLowerCase().split("").map(c => TR[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

// overrides.json: { "001": { website, open, close, gmaps, lat, lon, compound, holiday, note } } – ключът е номерът на реда в pharmacies.txt
let overrides = {};
try { overrides = JSON.parse(readFileSync("data/overrides.json", "utf8")); } catch {}

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
    open: o.open || "", close: o.close || close || "",
    h24: f.includes("24"), closedTemp: f.includes("x"),
    hasSite: f.includes("w") || !!o.website, website: o.website || "",
    gmaps: o.gmaps || "", lat: o.lat ?? null, lon: o.lon ?? null,
    compound: !!o.compound, holiday: f.includes("24") || !!o.holiday, note: o.note || ""
  };
});

const q = p => encodeURIComponent(`${p.name}, ${p.address}, Варна`);
const dirUrl = p => p.gmaps || `https://www.google.com/maps/dir/?api=1&destination=${q(p)}`;
const embedUrl = p => p.lat != null ? `https://maps.google.com/maps?q=${p.lat},${p.lon}&z=17&output=embed` : `https://maps.google.com/maps?q=${q(p)}&z=16&output=embed`;

function hoursHtml(p) {
  if (p.closedTemp) return "Временно затворена";
  if (p.h24) return "Денонощно (24 часа)";
  if (p.open && p.close) return `Всеки ден ${p.open}–${p.close}`;
  if (p.close) return `Затваря в ${p.close} ч. <span class="muted">· час на отваряне: предстои да се добави</span>`;
  return `<span class="muted">—</span>`;
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
<title>${esc(p.name)} – ${esc(p.address)}, Варна</title>
<meta name="description" content="${esc(p.name)}, ${esc(p.address)}, Варна. Телефон, работно време и карта.">
<link rel="stylesheet" href="../style.css">
${theme}
</head>
<body>
<header>
  <div class="top"><a href="../">← Всички аптеки</a><button id="theme" type="button" aria-label="Смяна на режима"></button></div>
  <h1>${esc(p.name)}</h1>
  <div id="badges">${p.h24 ? '<span class="badge">24ч</span>' : ""}${p.closedTemp ? '<span class="badge closed">Временно затворена</span>' : ""}${p.compound ? '<span class="badge alt">Приготвя лекарства</span>' : ""}${p.holiday ? '<span class="badge alt">Работи на празници</span>' : ""}<span id="state"></span></div>
</header>
<main>
  <section class="card info">
    <div class="row"><b>Адрес</b><span>${esc(p.address)}, Варна</span></div>
    <div class="row"><b>Телефон</b><span>${p.phone ? `<a href="tel:${esc(tel)}">${esc(p.phone)}</a>` : '<span class="muted">—</span>'}</span></div>
    <div class="row"><b>Работно време</b><span>${hoursHtml(p)}</span></div>
    <div class="row"><b>Уебсайт</b><span>${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website)}</a>` : p.hasSite ? '<span class="muted">има сайт в Google – предстои да се добави</span>' : '<span class="muted">—</span>'}</span></div>
    ${p.note ? `<div class="row"><b>Бележка</b><span>${esc(p.note)}</span></div>` : ""}
    <div class="links"><a class="btn" href="${esc(dirUrl(p))}" target="_blank" rel="noopener">Упътвания в Google Maps</a>${p.phone ? `<a class="btn" href="tel:${esc(tel)}">Обади се</a>` : ""}</div>
  </section>
  <iframe class="map" title="Карта" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(embedUrl(p))}"></iframe>
</main>
<script src="../common.js"></script>
<script>
const p = ${JSON.stringify({ open:p.open, close:p.close, h24:p.h24, closedTemp:p.closedTemp }).replace(/</g, "\\u003c")};
const st = isOpen(p, sofiaNow());
document.getElementById("state").innerHTML = st === true ? '<span class="badge">Отворено</span>' : st === false ? '<span class="badge closed">Затворено</span>' : "";
</script>
</body>
</html>
`);
}
writeFileSync("data.json", JSON.stringify(list));
console.log(`Генерирани ${list.length} аптеки.`);
