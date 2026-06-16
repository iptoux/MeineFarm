import { chromium } from "playwright";

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.addInitScript(() => { window.prompt = () => "Test Farm"; window.confirm = () => true; });
await page.goto("http://localhost:5189/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// "Neues Spiel" klicken (prompt ist gestubbt).
await page.click(".sm-new-btn");
await page.waitForTimeout(1800);

const hasSession = await page.evaluate(() => !!(window.__game && window.__game.session));
// Kategorie "Farm" öffnen.
const cats = await page.$$(".build-cat");
let farmClicked = false;
for (const c of cats) {
  const t = (await c.textContent()) || "";
  if (/Farm/.test(t)) { await c.click(); farmClicked = true; break; }
}
await page.waitForTimeout(600);

const cards = await page.$$eval(".build-popover .build-card", (els) => els.map((e) => e.textContent.trim()));
await page.screenshot({ path: "menu-farm.png" });

console.log(JSON.stringify({ hasSession, farmClicked, cards, errors }, null, 2));
await browser.close();
