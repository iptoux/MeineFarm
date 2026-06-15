// Lädt die laufende Dev-Server-Seite, prüft auf Konsolen-/Runtime-Fehler
// und legt einen Screenshot der Three.js-Szene ab.
// Aufruf: node scripts/screenshot.mjs [url] [outfile]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/";
const out = process.argv[3] ?? "scripts/shot.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1140, height: 660 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(url, { waitUntil: "networkidle" });
// kurz warten, damit Three.js gerendert hat
await page.waitForTimeout(1500);
await page.screenshot({ path: out });

await browser.close();

if (errors.length) {
  console.error("FEHLER im Browser:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`OK – Screenshot: ${out}`);
