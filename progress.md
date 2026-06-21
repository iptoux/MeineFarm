Original prompt: Analysiere das Project/Game. Nutze alle zur verfuegung stehenden skills aus [.agents](.agents/) und mach das Game cooler, besser!

## 2026-06-21

- Added a night-atmosphere feature: `src/scene/Fireflies.ts`.
- Integrated it into the persistent rig in `src/main.ts` and field syncing in `src/game/GameSession.ts`.
- Documented the feature in `docs/DEVELOPMENT.md`.
- `pnpm build` passes.
- Browser verification passed with a disposable Playwright script: new game, night, clear weather, 75 visible particles, opacity 0.6, no page/console errors.
- Inspected the screenshot visually; the glow reads as small night fireflies around the farm.
- Cleaned up the disposable script and screenshot.

## 2026-06-21 — Windmühle (animiertes Gebäude)

- Neues Gebäude **Windmühle** in Blender modelliert (via BlenderMCP-Socket auf Port
  9876, da der MCP-Server in der Session nicht registriert war). Stil/Palette an
  `Open Barn`/`Big Barn` orientiert: konischer Achteck-Turm (DarkRed/LightRed),
  weiße Zierbänder, schwarzes Kappendach, Holz-Flügel mit weißen Latten, Holz-
  Doppeltür, kleine Flagge. Export nach `public/models/buildings/Windmill.glb`.
- 4 Animations-Clips gebacken: `SailSpin` (Flügel, Loop), `FlagWave` (Flagge, Loop),
  `DoorOpenL`/`DoorOpenR` (Türflügel, einmalig/geklemmt, per Klick steuerbar).
- Code-Anbindung: `buildings.ts` (Def `windmuehle`, dekorativ), `AnimalModels`
  (`getBuildingClips`), `Building.ts` (`setupAnimations` + `toggleDoors`),
  `World.ts` (Mixer je Gebäude, Frame-Update, `toggleBuildingDoors`),
  `GameSession.ts` (Linksklick ohne Markt → Türen toggeln).
- `pnpm build` (tsc + vite) ist grün.
- Verifikation: Blender-Render (Ruhe + offen) visuell geprüft; GLB-Struktur per
  Python-Parser bestätigt (4 Clips, korrekte Zielknoten); echte Browser-Verifikation
  mit Playwright + three.js v0.169 (disposable, danach entfernt): Clips laden,
  Mixer dreht Tür ~0.93 rad und Flügel ~0.58 rad.
- Iterationen nach Nutzer-Feedback (jeweils mit Mehr-Winkel-Renderns geprüft):
  - HubCap/Türknäufe saßen falsch (doppelter Offset bei Kind-Objekten) → behoben.
  - Türen schlanker; **Windwelle/Achse + Lager** ergänzt (Rad hing sonst frei).
  - **Bogen-Doppeltür** + **hohler Turm-Innenraum** (Holzboden, Säcke, Mühlstein)
    via Boolean-Schnitt; Türöffnung auch durch den Sockelring geschnitten.
  - Tür **in den Wandtunnel zurückversetzt + zur Turmneigung gekippt** (7.6°),
    damit sie nicht heraussteht und keine Sichtlücke lässt.
  - **Vertikale Planken-Leisten** auf den Wänden + **gestuftes Schindeldach**
    (Stil der Scheunen); **Flügel +25%** länger (SAIL_LEN 1.72→2.15).
  - **Deutlich größer** skaliert (`width`/`depth` 5→7): finale In-Game-Höhe ~9.78
    (vs. Open Barn 7.67) — im Browser gegen die Scheunen-Maße verifiziert.
  - **Zwei Fachwerk-Fenster** im oberen Bereich (Rahmen + Sprossenkreuz +
    `WindowGlow`-Scheibe). Neues Nacht-Leuchten: `Building.ts` sammelt „glow"-
    Materialien, `World.update(…, daylight)` regelt deren `emissiveIntensity`
    (Tag 0 → Nacht 1.5), `GameSession` reicht `sky.daylight` durch. Verifiziert via
    Blender-Nacht-Render + Browser (2 Glasscheiben, emissive [1,0.72,0.3]).
  - Wirkte trotzdem zu niedrig: Ursache ist die `normalizeBuilding`-Skalierung
    (die Flügelspanne als breiteste Ausdehnung bestimmt den Maßstab → Turm bleibt
    flach). Statt breiter → **Turm im Modell höher/schlanker** (H 4.0→5.4, Aspekt
    H/Breite 1.40→1.68); In-Game-Höhe nun ~11.73 (vs. Open Barn 7.67, Big Barn
    13.43) — im Browser gegen die Scheunen verifiziert.
  - Fenster proportional vergrößert (~0.60×0.80) und symmetrisch auf alle vier
    Schrägflächen gesetzt (45/135/225/315 → von vorne UND hinten sichtbar). Reine
    GLB-/Modell-Änderung — der generische „glow"-Sammler in `Building.ts` erfasst
    automatisch alle 4 Scheiben (kein Code-Change). Browser: 4 Glow-Fenster.
  - Grundfläche kleiner als der Stall: Turm im Modell **deutlich dicker** (Basis-
    Radius 1.6→2.2 → Basis-Durchmesser ~4.4) und Config-Grundfläche 7→11×11.
    Ergebnis (im Browser gegen die Scheunen verifiziert): Grundfläche 11×11
    (> Stall 10×10), Turm-Basis ~8.5, Höhe ~15.36 → die Mühle ist jetzt das
    höchste Gebäude (über Big Barn 13.43). Tür/Fenster/Flügel mitskaliert.
  - Fensterrahmen + Sprossen auf **White** umgestellt (wie die anderen Gebäude).
- **Skill/Doku:** Gesamtes Blender-/Modell-Wissen dokumentiert — neue Sektion
  `docs/DEVELOPMENT.md` §23 (BlenderMCP-Workflow, Art-Palette, Z-up→Y-up, Größen-
  Kopplung, Gebäude-Animationen, hohle Innenräume/Booleans, Nacht-Glow, Stolpersteine)
  + kompakte Zusammenfassung im Skill `.agents/skills/meinhaustier/SKILL.md`.
