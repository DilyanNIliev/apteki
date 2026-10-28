// Еднократно генериране на иконките и картинките за споделяне (не се пуска при изграждането на сайта).
// Пускане: node tools/make-assets.mjs   (изисква Playwright и Chromium)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const I = require("../i18n.js");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = createRequire("/node-tools/node_modules/")("playwright")); }
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const svg = readFileSync("favicon.svg", "utf8");
async function shot(html, w, h, out) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html); await page.screenshot({ path: out }); await page.close();
}
for (const [size, name] of [[180, "apple-touch-icon.png"], [192, "icon-192.png"], [512, "icon-512.png"]])
  await shot(`<body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`, size, size, name);
// картинки 1200×630 за споделяне – по една на език за началната и за „Почивни дни“
const card = (title, sub) => `<body style="margin:0;width:1200px;height:630px;font-family:system-ui,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0a8f5b,#064e35);color:#fff;display:flex;align-items:center;padding:0 90px;box-sizing:border-box;gap:60px">
  <div style="flex:0 0 220px">${svg.replace("<svg ", '<svg width="220" height="220" ')}</div>
  <div><div style="font-size:84px;font-weight:800;line-height:1.05;letter-spacing:-2px">${title}</div>
  <div style="font-size:38px;margin-top:26px;opacity:.9;line-height:1.3">${sub}</div></div></body>`;
for (const l of I.LANGS) {
  await shot(card(I.t(l, "index.title"), I.t(l, "index.sub")), 1200, 630, `og-index-${l}.png`);
  await shot(card(I.t(l, "hol.title"), I.t(l, "og.holSub")), 1200, 630, `og-hol-${l}.png`);
}
await browser.close();
writeFileSync("manifest.webmanifest", JSON.stringify({
  name: "Аптеки във Варна", short_name: "Аптеки Варна", lang: "bg", start_url: "./", display: "standalone",
  background_color: "#f5f8f6", theme_color: "#0a8f5b",
  icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }, { src: "favicon.svg", sizes: "any", type: "image/svg+xml" }]
}, null, 2) + "\n");
console.log("готово");
