const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("dialog", (d) => { console.log("DIALOG:", d.type(), d.message()); d.accept("ChunkTest"); });
  page.on("pageerror", (e) => console.log("PAGEERR:", String(e)));
  await page.goto("http://localhost:5175/", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  const dom = await page.evaluate(() => ({
    hasNewBtn: !!document.querySelector(".sm-new-btn"),
    startMenuHidden: document.getElementById("start-menu")?.classList.contains("hidden"),
    bodyHasMenu: !!document.querySelector(".sm-new-btn, #start-menu"),
    hookKeys: Object.keys(window.__game),
    sessionNow: !!window.__game.session,
  }));
  console.log("DOM:", JSON.stringify(dom));
  await page.click(".sm-new-btn", { timeout: 5000 }).then(()=>console.log("clicked")).catch(e=>console.log("clickErr", e.message));
  await page.waitForTimeout(800);
  console.log("sessionAfter:", await page.evaluate(()=>!!window.__game.session));
  await browser.close();
})();
