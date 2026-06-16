import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
await page.addInitScript(() => {
  window.prompt = () => "Sky Distance Verify";
});

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game);
await page.evaluate(() => {
  document.querySelector(".sm-new-btn")?.click();
});
await page.waitForFunction(() => !!window.__game.session);

await page.evaluate(() => {
  const g = window.__game;
  g.sky.speed = 0;
  g.sky.timeOfDay = 0.5;
  g.weather.setWeather("clear", true);
  g.sceneManager.camera.position.set(12, 4.5, 18);
  g.sceneManager.controls.target.set(0, 1.8, 0);
  g.sceneManager.controls.update();
});
await page.waitForTimeout(900);
await page.screenshot({ path: "scripts/skybox-distance.png" });

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("OK - wrote scripts/skybox-distance.png");
