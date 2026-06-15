---
name: meinhaustier
description: Arbeit am 3D-Tierfarm-Tycoon „MeinHaustier" (Three.js/TypeScript/Vite). Nutzen beim Hinzufügen/Ändern von Tieren, Gebäuden, glTF-Modellen, Animationen, Slots, Ökonomie, Straßen, UI/Audio oder beim Debuggen von Modell-Platzierung/Skalierung/Fade. Kapselt die Projekt-Konventionen und den Playwright-Verifikations-Workflow.
---

# MeinHaustier — Arbeitsanleitung

Vollständige Referenz: **[docs/DEVELOPMENT.md](../../../docs/DEVELOPMENT.md)** —
Architektur, Datenmodelle, Abmessungen, Modell-/Animations-Konventionen. Immer
zuerst dort die relevante Sektion lesen.

## Setup / Befehle
- Paketmanager ist **pnpm** (per `devEngines` erzwungen). `npx` schlägt fehl.
- `pnpm dev` (Server :5173), `pnpm build` (Typecheck + Bundle). Nach Code-Änderungen
  **immer `pnpm build`** zum Typecheck.

## Eiserne Regeln (häufige Fehlerquellen)
1. **Gerigte glTF-Modelle nur mit `SkeletonUtils.clone()` klonen** — `Object3D.clone()`
   bindet das Skelett nicht neu → Klon erscheint an falscher Position. Vorher prüfen,
   ob das GLB `skins`/`joints` enthält (Python-Snippet in docs §10).
2. **Slot-Höhe in Modell-Gebäuden per Raycast auf den Innenboden snappen** — Modelle
   haben einen erhöhten Boden; sonst versinken Marker/Tiere und sind nicht klickbar
   (siehe `createModelBuilding` in `src/scene/Building.ts`).
3. **Modelle werden vorab geladen & normalisiert** in `src/scene/AnimalModels.ts`
   (Tiere auf Größe 1.4, Gebäude uniform auf `width×depth`, Boden auf y=0). Neue
   Asset-Typen dort einreihen. **Kein Top-Level-`await`** (Build-Target es2020) →
   in `init()` kapseln.
4. **Dach-Fade ist material-/modellabhängig**: `roofMaterials` je Gebäude prüfen
   (rote Flächen können Wände sein). Geschlossene Gebäude: `fadeAll: true`.
5. **Klick-Durchlass**: stark transparente Meshes (Opazität < 0.5) werden vom Picker
   ignoriert — so klickt man durch ausgeblendete Dächer.

## Neues Tier / Gebäude
Datengetrieben — meist nur ein Katalog-Eintrag (Details + Checkliste in docs §14):
- Tier: GLB nach `public/models/animals/`, Eintrag in `src/game/config/animals.ts`.
  Laden/Normalisieren/Klonen/Idle(+Eat)-Animation/Kauf laufen automatisch.
- Gebäude: GLB nach `public/models/buildings/`, Eintrag in
  `src/game/config/buildings.ts` (`model`, `width/depth` für Slot-Zahl, `fadeAll`
  ODER `roofMaterials`, ggf. `modelRotation` damit die offene Seite nach +z zeigt).

## Verifikation (Pflicht bei sichtbaren Änderungen)
Es gibt keinen UI-Testrunner — per **Playwright-Screenshot** prüfen. Im Dev-Build
existiert `window.__game = { state, world, sceneManager, placement, roadController,
audio, models }`.

Ablauf:
1. `pnpm dev` im Hintergrund starten.
2. Wegwerf-Skript `scripts/_verify.mjs` schreiben (Muster in docs §13): Seite laden,
   ~1.8 s warten (Modelle), via `__game` Zustand setzen (Geld, Tiere/Gebäude bauen),
   Screenshot nach `scripts/shot.png`, `pageerror` einsammeln.
3. `node scripts/_verify.mjs` ausführen, Screenshot ansehen (Read-Tool auf das PNG),
   ggf. Werte (Skalierung/`modelRotation`/`roofMaterials`/Slot-Inset) justieren und
   wiederholen.
4. **Aufräumen**: `_verify.mjs` und Screenshots wieder löschen.

Nützliche Hooks: `world.bubbleWorldPos(i)` (Welt→Screen-Projektion zum Klicken),
`world.animalClip(i)` (laufender Animationsclip), `sceneManager.camera/controls`
(Kamera für gezielte Screenshots setzen), `state.slotBase(b)`.

## Stil
- Code an den Nachbardateien orientieren (deutsche Kommentare, knapp, datengetrieben).
- Reine Daten in `GameState`; Darstellung in `scene/`; Berechnung in `economy.ts`.
- Strukturänderungen an Gebäuden → `world.rebuild()`.
