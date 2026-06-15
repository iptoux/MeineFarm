const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type()==="error") errs.push("[console] "+m.text()); });
  page.on("dialog", (d) => d.accept("ChunkTest"));
  await page.goto("http://localhost:5175/", { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await page.$eval(".sm-new-btn", (el) => el.click());
  await page.waitForFunction(() => !!window.__game.session, null, { timeout: 10000 });

  await page.evaluate(() => {
    const g = window.__game, sm = g.rig.sceneManager, s = g.session.state;
    s.money = 999999; s.emit();
    // Kamera auf das maxX-Pad (~x=50) zentrieren, innerhalb maxDistance.
    sm.controls.target.set(50, 0, 0);
    sm.camera.position.set(50, 28, 6);
    sm.controls.update();
  });
  await page.waitForTimeout(150);

  const before = await page.evaluate(() => {
    const g = window.__game, s = g.session.state;
    return { field: {...s.field}, groundW: g.rig.ground.mesh.geometry.parameters.width, grass: g.grass.object.children.map(c=>c.count) };
  });

  const click = await page.evaluate(() => {
    const g = window.__game, cam = g.rig.sceneManager.camera, s = g.session.state;
    cam.updateMatrixWorld();
    const Vec = cam.position.constructor;
    const v = new Vec(s.field.maxX + 5, 0.12, 0); v.project(cam);
    const rect = g.rig.sceneManager.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x*0.5+0.5)*rect.width, y: rect.top + (-v.y*0.5+0.5)*rect.height, ndc:{x:+v.x.toFixed(2),y:+v.y.toFixed(2)} };
  });
  await page.mouse.click(click.x, click.y);
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const g = window.__game, s = g.session.state;
    return { field: {...s.field}, groundW: g.rig.ground.mesh.geometry.parameters.width, grass: g.grass.object.children.map(c=>c.count), money: s.money, inField_50: s.inField(50,0,1,1) };
  });

  await browser.close();
  console.log("ERRORS:", errs.length?errs.join("\n"):"none");
  console.log("BEFORE:", JSON.stringify(before));
  console.log("CLICK :", JSON.stringify(click));
  console.log("AFTER :", JSON.stringify(after));
})();
