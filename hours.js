// Работно време по дни – ползва се от сайта (браузър) и от build.mjs.
// Входни полета (overrides): wdOpen/wdClose (Пн–Пт), saOpen/saClose/saOff (събота), suOpen/suClose/suOff (неделя).
// Остарелите open/close се четат като Пн–Пт.
// days[0..6] (0 = неделя): [отваряне, затваряне] = известно; null = почивен ден; липсва = неизвестно.
(function (root) {
  const SHORT = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const LONG = ["Неделя", "Понеделник", "Вторник", "Сряда", "Четвъртък", "Петък", "Събота"];
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  function buildDays(o) {
    const d = {};
    const wdO = o.wdOpen || o.open, wdC = o.wdClose || o.close;
    if (wdO && wdC) for (const i of [1, 2, 3, 4, 5]) d[i] = [wdO, wdC];
    if (o.saOff) d[6] = null; else if (o.saOpen && o.saClose) d[6] = [o.saOpen, o.saClose];
    if (o.suOff) d[0] = null; else if (o.suOpen && o.suClose) d[0] = [o.suOpen, o.suClose];
    return d;
  }
  const OFF = "\u0000off";   // вътрешен маркер за почивен ден (превежда се при показване)
  const dayText = v => v === undefined ? "" : v === null ? OFF : v[0] + "–" + v[1];
  // думите се вземат от i18n.js, ако е зареден; иначе – български
  const tr = (lang, key, vars) => root.I18N ? root.I18N.t(lang || "bg", key, vars) : null;
  const short = (lang, d) => root.I18N ? root.I18N.dowShort(lang || "bg", d) : SHORT[d];
  const long = (lang, d) => root.I18N ? root.I18N.dowName(lang || "bg", d) : LONG[d];
  const show = (lang, t) => t === OFF ? (tr(lang, "h.off") || "почивен") : t;

  // групира последователни дни с еднакво време: "Пн–Пт 08:00–20:00, Сб 09:00–14:00, Нд почивен"
  function groups(days) {
    const out = [];
    for (const i of ORDER) {
      const t = dayText(days[i]);
      if (!t) continue;
      const last = out[out.length - 1];
      if (last && last.t === t && last.end === ORDER[ORDER.indexOf(i) - 1]) last.end = i; else out.push({ start:i, end:i, t });
    }
    return out;
  }
  function summary(p, lang) {
    if (p.closedTemp) return tr(lang, "closedTemp") || "Временно затворена";
    if (p.h24) return tr(lang, "h.24") || "Денонощно";
    const g = groups(p.days || {});
    if (g.length === 1 && g[0].start === 1 && g[0].end === 0) return (tr(lang, "h.every") || "Всеки ден") + " " + show(lang, g[0].t);
    if (g.length) return g.map(x => (x.start === x.end ? short(lang, x.start) : short(lang, x.start) + "–" + short(lang, x.end)) + " " + show(lang, x.t)).join(", ");
    return p.close ? (tr(lang, "h.closesAt", { c: p.close }) || "Затваря в " + p.close + " ч.") : "—";
  }
  // true / false, или null ако няма данни за днешния ден
  function isOpen(p, now) {
    if (p.closedTemp) return false;
    if (p.h24) return true;
    const days = p.days || {}, t = days[now.day];
    if (t === null) return false;
    if (!t) {
      // Няма часове за днес. Нощем (преди 06:00) аптеките са затворени; ако знаем само часа на затваряне (по Google),
      // след него също е затворено. Иначе не твърдим нищо.
      if (now.min < 360) return false;
      if (p.close && !Object.keys(days).length && now.min >= toMin(p.close)) return false;
      return null;
    }
    const o = toMin(t[0]), c = toMin(t[1]);
    return c > o ? now.min >= o && now.min < c : now.min >= o || now.min < c;
  }
  const EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function schemaHours(p) {          // за JSON-LD
    if (p.h24) return [{ "@type":"OpeningHoursSpecification", dayOfWeek:EN, opens:"00:00", closes:"23:59" }];
    return groups(p.days || {}).filter(g => g.t !== OFF).map(g => {
      const [opens, closes] = g.t.split("–");
      const idx = []; for (let i = ORDER.indexOf(g.start); ; i = (i + 1) % 7) { idx.push(ORDER[i]); if (ORDER[i] === g.end) break; }
      return { "@type":"OpeningHoursSpecification", dayOfWeek:idx.map(i => EN[i]), opens, closes };
    });
  }
  root.HoursLib = { SHORT, LONG, ORDER, toMin, buildDays, dayText, summary, isOpen, schemaHours, long, OFF };
  if (typeof module !== "undefined") module.exports = root.HoursLib;
})(typeof window !== "undefined" ? window : globalThis);
