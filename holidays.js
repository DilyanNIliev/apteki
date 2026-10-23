// Данни и изчисления за почивни дни и учебни ваканции – ползват се от страницата и от build.mjs (SEO).
(function (root) {
// Празниците са изчислени по чл. 154 от Кодекса на труда. Допълнителни почивни дни по решение на Министерския съвет – в EXTRA.
const EXTRA = {
  2026: [{ date:"2026-01-02", name:"Почивен ден по решение на Министерския съвет", off:true }]
};
const DOW = ["Неделя","Понеделник","Вторник","Сряда","Четвъртък","Петък","Събота"];
const MON = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
const iso = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
const mk = (y, m, d) => new Date(y, m-1, d);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function orthodoxEaster(y) {           // Юлиански Великден + 13 дни (валидно 1900–2099)
  const a = y % 4, b = y % 7, c = y % 19, d = (19*c + 15) % 30, e = (2*a + 4*b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return addDays(mk(y, month, day), 13);
}
function holidays(y) {
  const easter = orthodoxEaster(y);
  const fixed = [
    [1,1,"Нова година"], [3,3,"Ден на Освобождението на България"], [5,1,"Ден на труда и на международната работническа солидарност"],
    [5,6,"Гергьовден, Ден на храбростта и на Българската армия"], [5,24,"Ден на българската просвета и култура и на славянската писменост"],
    [9,6,"Ден на Съединението"], [9,22,"Ден на Независимостта"], [12,24,"Бъдни вечер"], [12,25,"Рождество Христово"], [12,26,"Рождество Христово (втори ден)"]
  ].map(([m,d,name]) => ({ date:mk(y,m,d), name }));
  const easterDays = [[-2,"Велики петък"],[-1,"Велика събота"],[0,"Великден"],[1,"Великден (втори ден)"]]
    .map(([n,name]) => ({ date:addDays(easter,n), name, easter:true }));
  const all = [...fixed, ...easterDays].sort((a,b) => a.date - b.date);
  // Празник (без Великден) в събота/неделя -> следващият работен ден е почивен (чл. 154, ал. 2 КТ)
  const taken = new Set(all.map(h => iso(h.date))), out = all.map(h => ({ ...h, iso:iso(h.date) }));
  for (const h of all.filter(h => !h.easter && [0,6].includes(h.date.getDay()))) {
    let d = addDays(h.date, 1);
    while ([0,6].includes(d.getDay()) || taken.has(iso(d))) d = addDays(d, 1);
    taken.add(iso(d));
    out.push({ date:d, iso:iso(d), name:"Почивен ден – компенсация за празник в " + DOW[h.date.getDay()].toLowerCase() + " (" + h.date.getDate() + " " + MON[h.date.getMonth()].toLowerCase() + ")", off:true });
  }
  for (const x of EXTRA[y] || []) { const d = new Date(x.date + "T00:00:00"); out.push({ date:d, iso:x.date, name:x.name, off:true }); }
  return out.sort((a,b) => a.date - b.date);
}

// Учебни ваканции по заповеди на МОН. kind: vacation (периоди, оцветяват се в календара), nonschool (неучебен ден), end/start (информационни дати).
// tentative: true = предварителни данни, не окончателна заповед.
const SCHOOL = [
  { from:"2024-12-21", to:"2025-01-02", name:"Коледна ваканция", kind:"vacation" },
  { from:"2025-03-29", to:"2025-04-06", name:"Пролетна ваканция", note:"За XII клас – от 4 април", kind:"vacation" },
  { from:"2025-05-15", to:"2025-05-15", name:"Последен учебен ден за XII клас", kind:"end" },
  { from:"2025-06-02", to:"2025-06-02", name:"Край на учебните занятия за I–III клас", kind:"end" },
  { from:"2025-06-16", to:"2025-06-16", name:"Край на учебните занятия за IV–VI клас", kind:"end" },
  { from:"2025-06-30", to:"2025-06-30", name:"Край на учебните занятия за VII–XI клас", kind:"end" },
  { from:"2025-09-15", to:"2025-09-15", name:"Начало на учебната 2025/2026 г.", kind:"start" },
  { from:"2025-10-31", to:"2025-11-03", name:"Есенна ваканция", kind:"vacation" },
  { from:"2025-12-24", to:"2026-01-04", name:"Коледна ваканция", kind:"vacation" },
  { from:"2026-01-31", to:"2026-02-02", name:"Междусрочна ваканция", kind:"vacation" },
  { from:"2026-03-02", to:"2026-03-02", name:"Неучебен ден", kind:"nonschool" },
  { from:"2026-04-04", to:"2026-04-13", name:"Пролетна ваканция", note:"За XII клас – от 8 април", kind:"vacation" },
  { from:"2026-05-20", to:"2026-05-20", name:"Неучебен ден (ДЗИ по български език и литература)", kind:"nonschool" },
  { from:"2026-05-29", to:"2026-05-29", name:"Край на учебните занятия за I–III клас", kind:"end" },
  { from:"2026-06-12", to:"2026-06-12", name:"Край на учебните занятия за IV–VI клас", kind:"end" },
  { from:"2026-06-30", to:"2026-06-30", name:"Край на учебните занятия за VII–XI клас", kind:"end" },
  { from:"2026-09-15", to:"2026-09-15", name:"Начало на учебната 2026/2027 г.", kind:"start" },
  { from:"2026-10-31", to:"2026-11-02", name:"Есенна ваканция", kind:"vacation" },
  { from:"2026-12-24", to:"2027-01-03", name:"Коледна ваканция", kind:"vacation" },
  { from:"2027-01-30", to:"2027-02-02", name:"Междусрочна ваканция", kind:"vacation" },
  { from:"2027-04-03", to:"2027-04-11", name:"Пролетна ваканция", note:"За XII клас – от 8 април. Има предложение ваканцията да е 30 април – 9 май, заради Великден.", kind:"vacation", tentative:true },
  { from:"2027-05-14", to:"2027-05-14", name:"Последен учебен ден за XII клас", kind:"end", tentative:true },
  { from:"2027-06-03", to:"2027-06-03", name:"Край на учебните занятия за I–III клас", kind:"end", tentative:true },
  { from:"2027-06-17", to:"2027-06-17", name:"Край на учебните занятия за IV–VI клас", kind:"end", tentative:true },
  { from:"2027-07-03", to:"2027-07-03", name:"Край на учебните занятия за VII–XI клас", kind:"end", tentative:true }
];
const parse = x => new Date(x + "T00:00:00");
function schoolEvents(y) {            // събития, които засягат календарната година y
  const a = mk(y, 1, 1), b = mk(y, 12, 31);
  return SCHOOL.map(e => ({ ...e, fromD:parse(e.from), toD:parse(e.to) })).filter(e => e.toD >= a && e.fromD <= b);
}

root.HolidayData = { EXTRA, DOW, MON, iso, mk, addDays, orthodoxEaster, holidays, schoolEvents };
if (typeof module !== "undefined") module.exports = root.HolidayData;
})(typeof window !== "undefined" ? window : globalThis);
