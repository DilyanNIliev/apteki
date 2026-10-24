// Общо генериране на съдържанието на страниците на аптеки и квартали – ползва се от build.mjs (български, за търсачките)
// и от браузъра (превод на другите езици). Зависи от i18n.js и hours.js (глобалните I18N и HoursLib).
(function (root) {
  const I = () => root.I18N, HL = () => root.HoursLib;
  const tl = (l, k, v) => I().t(l, k, v);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
  const TR = { а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sht",ъ:"a",ь:"",ю:"yu",я:"ya" };
  const slugify = s => s.toLowerCase().split("").map(c => TR[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pluralIdx = (l, n) => (l === "ru" || l === "uk") ? ((n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? 1 : 2) : (n === 1 ? 0 : 1);
  const pl = (l, n) => n + " " + tl(l, "kv.i.pharm")[pluralIdx(l, n)];

  const q = p => encodeURIComponent(`${p.name}, ${p.address}, Варна`);
  const dirUrl = p => p.gmaps || `https://www.google.com/maps/dir/?api=1&destination=${q(p)}`;
  const embedUrl = p => p.lat != null ? `https://maps.google.com/maps?q=${p.lat},${p.lon}&z=17&output=embed` : `https://maps.google.com/maps?q=${q(p)}&z=16&output=embed`;

  function hoursHtml(p, l) {
    if (p.closedTemp) return tl(l, "closedTemp");
    if (p.h24) return tl(l, "h.24long");
    const known = HL().ORDER.some(d => p.days[d] !== undefined);
    if (!known) return p.close ? tl(l, "h.closesAtNoDays", { c: p.close }) : `<span class="muted">—</span>`;
    return `<table class="hours">${HL().ORDER.map(d => `<tr><td>${HL().long(l, d)}</td><td>${p.days[d] === undefined ? '<span class="muted">—</span>' : p.days[d] === null ? tl(l, "h.offDay") : p.days[d][0] + "–" + p.days[d][1]}</td></tr>`).join("")}</table>`;
  }

  // квартали със страница (поне kvMin аптеки)
  function buildKvartali(list, kvMin = 3) {
    const by = new Map();
    for (const p of list) if (p.kvartal) (by.get(p.kvartal) || by.set(p.kvartal, []).get(p.kvartal)).push(p);
    return [...by.entries()].filter(([, ps]) => ps.length >= kvMin).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "bg"))
      .map(([name, ps]) => ({ name, slug: slugify(name), ps }));
  }
  const wk = (ps, d) => ps.filter(p => p.h24 || (p.days[d] && p.days[d] !== null));
  function kvIntro(k, l, kvInfo) {
    const { name, ps } = k, q2 = I().quarter(l, name), h24 = ps.filter(p => p.h24);
    const wkdSat = wk(ps, 6), sun = wk(ps, 0);
    const sunKnown = ps.some(p => p.h24 || p.days[0] !== undefined);
    const info = (kvInfo || {})[name] || {};
    return [
      info["intro_" + l] || (l === "bg" ? info.intro : "") || "",
      tl(l, "kv.i.count", { q: q2, n: pl(l, ps.length), h24: h24.length ? tl(l, "kv.i.with24", { n: h24.length }) : tl(l, "kv.i.no24") }),
      sunKnown ? tl(l, "kv.i.sun", { list: sun.length ? sun.map(p => p.name).join(", ") : tl(l, "kv.i.none") }) : "",
      wkdSat.length && ps.some(p => p.days[6] !== undefined) ? tl(l, "kv.i.sat", { n: wkdSat.length }) : ""
    ].filter(Boolean).join(" ");
  }
  function kvFaq(k, l) {
    const { name, ps } = k, q2 = I().quarter(l, name), h24 = ps.filter(p => p.h24), out = [];
    out.push({ q: tl(l, "kv.q.24", { q: q2 }), a: h24.length ? tl(l, "kv.a.24yes", { list: h24.map(p => `${p.name} (${p.address}${p.phone ? ", " + p.phone : ""})`).join("; ") }) : tl(l, "kv.a.24no", { q: q2 }) });
    const sun = ps.filter(p => p.h24 || (p.days[0] && p.days[0] !== null));
    if (ps.some(p => p.h24 || p.days[0] !== undefined)) out.push({ q: tl(l, "kv.q.sun", { q: q2 }), a: sun.length ? tl(l, "kv.a.sunYes", { list: sun.map(p => `${p.name} (${p.address}, ${HL().summary(p, l)})`).join("; ") }) : tl(l, "kv.a.sunNo", { q: q2 }) });
    const late = ps.filter(p => !p.h24).map(p => ({ p, c: ((p.days[1] || [])[1]) || p.close })).filter(x => x.c).sort((a, b) => b.c.localeCompare(a.c))[0];
    if (late) out.push({ q: tl(l, "kv.q.late", { q: q2 }), a: tl(l, "kv.a.late", { name: late.p.name, addr: late.p.address, c: late.c }) });
    return out;
  }
  const rowHtml = (p, l, rootPath) => `<tr><td><a href="${rootPath}apteka/${p.slug}.html">${esc(p.name)}</a>${p.h24 ? ` <span class="badge">${esc(tl(l, "yes24"))}</span>` : ""}${p.closedTemp ? ` <span class="badge closed">${esc(tl(l, "badge.closed"))}</span>` : ""}</td><td>${esc(p.address)}</td><td>${p.phone ? `<a href="tel:${esc(p.phone.split("/")[0].replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : "—"}</td><td>${esc(HL().summary(p, l))}</td><td><div class="actions"><a class="btn sm ghost" href="${esc(dirUrl(p))}" target="_blank" rel="noopener">${esc(tl(l, "btn.map"))}</a><a class="btn sm fix" href="${rootPath}korekciya.html?id=${p.id}${l === "bg" ? "" : "&lang=" + l}">${esc(tl(l, "btn.fixShort"))}</a></div></td></tr>`;

  // <header> + <main> на страницата на аптека. env = { root: "../" }
  function pharmacyHtml(p, l, env) {
    const tel = p.phone.replace(/[^\d+]/g, ""), r = env.root, ix = r + (l === "bg" ? "" : l + "/");
    const fixHref = `${r}korekciya.html?id=${p.id}${l === "bg" ? "" : "&lang=" + l}`;
    return `<header>
  <div class="top"><a href="${ix}">${esc(tl(l, "back.all"))}</a>${p.kvartalPage ? `<a href="${ix}kvartal/${p.kvartalSlug}.html">${esc(tl(l, "in.quarter", { q: I().quarter(l, p.kvartal) }))}</a>` : ""}</div>
  <h1>${esc(p.name)}</h1>
  <div id="badges">${p.h24 ? `<span class="badge">${esc(tl(l, "yes24"))}</span>` : ""}${p.closedTemp ? `<span class="badge closed">${esc(tl(l, "closedTemp"))}</span>` : ""}${p.compound ? `<span class="badge alt">${esc(tl(l, "badge.compound"))}</span>` : ""}${p.holiday ? `<span class="badge alt">${esc(tl(l, "badge.holiday"))}</span>` : ""}<span id="state"></span></div>
</header>
<main>
  <section class="card info">
    <div class="row"><b>${esc(tl(l, "lbl.address"))}</b><span>${esc(p.address)}, ${esc(tl(l, "city"))}</span></div>
    ${p.kvartal ? `<div class="row"><b>${esc(tl(l, "lbl.quarter"))}</b><span>${p.kvartalPage ? `<a href="${ix}kvartal/${p.kvartalSlug}.html">${esc(I().quarter(l, p.kvartal))}</a>` : esc(I().quarter(l, p.kvartal))}</span></div>` : ""}
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
</main>`;
  }
  // <header> + <main> на страницата на квартал
  function kvartalHtml(k, kvartali, l, env) {
    const { name, ps } = k, q2 = I().quarter(l, name), r = env.root, ix = r + (l === "bg" ? "" : l + "/");
    const faq = kvFaq(k, l), th = tl(l, "kv.th"), others = kvartali.filter(x => x.slug !== k.slug);
    const sorted = ps.slice().sort((a, b) => (b.h24 - a.h24) || a.name.localeCompare(b.name, "bg"));
    return `<header>
  <p class="note"><a href="${ix}">${esc(tl(l, "index.title"))}</a> › ${esc(q2)}</p>
  <h1>${esc(tl(l, "kv.h1", { q: q2 }))}</h1>
  <p class="sub">${esc(kvIntro(k, l, env.kvInfo))}</p>
</header>
<main>
  <section class="card"><div class="tablewrap"><table class="list"><thead><tr>${th.map(x => `<th>${esc(x)}</th>`).join("")}<th></th></tr></thead><tbody>${sorted.map(p => rowHtml(p, l, r)).join("")}</tbody></table></div>
  <div class="links"><a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tl(l, "kv.mapQuery", { q: q2 }))}" target="_blank" rel="noopener">${esc(tl(l, "kv.allMap"))}</a></div></section>
  ${faq.length ? `<section class="card seo"><h2>${esc(tl(l, "kv.faqH", { q: q2 }))}</h2>${faq.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}</section>` : ""}
  ${others.length ? `<section class="card seo"><h2>${esc(tl(l, "kv.otherH"))}</h2><p>${others.map(x => `<a href="${ix}kvartal/${x.slug}.html">${esc(I().quarter(l, x.name))}</a> (${x.ps.length})`).join(" · ")}</p></section>` : ""}
</main>`;
  }
  root.Render = { esc, slugify, pl, dirUrl, embedUrl, hoursHtml, buildKvartali, kvIntro, kvFaq, pharmacyHtml, kvartalHtml };
  if (typeof module !== "undefined") module.exports = root.Render;
})(typeof window !== "undefined" ? window : globalThis);
