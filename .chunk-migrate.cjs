const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type()==="error") errs.push("[console] "+m.text()); });
  await page.goto("http://localhost:5175/", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });

  // v2-Spielstand (OHNE field) + Index injizieren, mit out-of-bounds Gebäude (x=70).
  await page.evaluate(() => {
    const id = "v2test";
    const v2 = { version: 2, money: 1234,
      buildings: [ {defId:"stall", x:0, z:0, rotation:0}, {defId:"stall", x:70, z:0, rotation:0} ],
      slots: [ {unlocked:true, animalId:"huhn", pending:0} ],
      roads: [], lastSaveTs: Date.now() };
    localStorage.setItem("meinhaustier:save:"+id, JSON.stringify(v2));
    localStorage.setItem("meinhaustier:saves", JSON.stringify([{id, name:"Alt v2", lastSaveTs:Date.now(), money:1234}]));
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await page.$eval(".sm-load", (el) => el.click());
  const loaded = await page.waitForFunction(() => !!window.__game.session, null, { timeout: 10000 }).then(()=>true).catch(()=>false);

  const res = await page.evaluate(() => {
    const g = window.__game; if (!g.session) return { loaded:false };
    const s = g.session.state;
    return { loaded:true, version_field: {...s.field}, money: s.money,
      buildings: s.buildings.length, groundW: g.rig.ground.mesh.geometry.parameters.width,
      // out-of-bounds Gebäude bleibt erhalten, neue Platzierung dort aber gesperrt:
      keepsOob: s.buildings.some(b=>b.x===70), inField_70: s.inField(70,0,2,2) };
  });

  await browser.close();
  console.log("ERRORS:", errs.length?errs.join("\n"):"none");
  console.log("LOADED:", loaded);
  console.log("RES:", JSON.stringify(res));
})();
