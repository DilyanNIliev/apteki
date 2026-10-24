// Превод на страниците на аптеки и квартали в браузъра: българският вариант е готов в HTML (за търсачките),
// а при друг език съдържанието се прерисува от data.json с общите шаблони (render.js).
(function () {
  const d = document.documentElement, kind = d.dataset.kind;
  if (!kind) return;
  let data = null, kvInfo = {}, loading = null;
  function load() {
    if (!loading) loading = Promise.all([
      fetch("../data.json").then(r => r.json()),
      fetch("../data/kvartali.json").then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]).then(([a, b]) => { data = a; kvInfo = b; });
    return loading;
  }
  function paintState(p) {
    const el = document.getElementById("state");
    if (!el) return;
    const st = isOpen(p, sofiaNow());
    el.innerHTML = st === true ? `<span class="badge">${tt("badge.open")}</span>` : st === false ? `<span class="badge closed">${tt("badge.closed")}</span>` : "";
  }
  async function paint() {
    await load();
    const env = { root: "../", kvInfo }, kvs = Render.buildKvartali(data);
    const app = document.getElementById("app");
    if (kind === "pharmacy") {
      const p = data.find(x => x.id === d.dataset.id); if (!p) return;
      app.innerHTML = Render.pharmacyHtml(p, LANG, env);
      document.title = tt("pg.title", { name: p.name, addr: p.address });
      paintState(p);
    } else {
      const k = kvs.find(x => x.slug === d.dataset.slug); if (!k) return;
      app.innerHTML = Render.kvartalHtml(k, kvs, LANG, env);
      document.title = tt("kv.title", { q: I18N.quarter(LANG, k.name) });
    }
  }
  window.onLangChange = () => { paint(); };
  paint();
})();
