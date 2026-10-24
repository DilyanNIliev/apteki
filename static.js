// Превод на страницата на аптека в браузъра. Българският вариант е готов HTML (за търсачките и без JS);
// при друг език (или смяна на езика) съдържанието се прерисува от data.json с общите шаблони (render.js).
(function () {
  const ctx = document.documentElement.dataset;
  if (ctx.kind !== "pharmacy") return;
  let data = null;
  const load = () => data ? Promise.resolve(data) : fetch(SITE_ROOT + "data.json").then(r => r.json()).then(d => (data = d));
  async function paint() {
    const list = await load(), p = list.find(x => x.id === ctx.id);
    if (!p) return;
    document.getElementById("app").innerHTML = Render.pharmacyHtml(p, LANG, { root: SITE_ROOT });
    document.title = tt("pg.title", { name: p.name, addr: p.address });
    const st = isOpen(p, sofiaNow()), el = document.getElementById("state");
    if (el) el.innerHTML = st === true ? `<span class="badge">${tt("badge.open")}</span>` : st === false ? `<span class="badge closed">${tt("badge.closed")}</span>` : "";
  }
  window.onLangChange = paint;
  paint();
})();
