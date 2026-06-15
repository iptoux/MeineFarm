---
name: meinhaustier
description: Arbeit am 3D-Tierfarm-Tycoon „MeinHaustier" (Three.js/TypeScript/Vite). Nutzen beim Hinzufügen/Ändern von Tieren, Gebäuden, glTF-Modellen, Animationen, Slots, Ökonomie, Straßen, Gras, Tag/Nacht-Himmel, UI/Audio, Spielständen oder beim Debuggen von Modell-Platzierung/Skalierung/Fade/Gras-Culling. Kapselt die Projekt-Konventionen und den Playwright-Verifikations-Workflow.
---

# MeinHaustier — Arbeitsanleitung

Vollständige Referenz: **[docs/DEVELOPMENT.md](../../../docs/DEVELOPMENT.md)** —
Architektur, Datenmodelle, Abmessungen, Modell-/Animations-Konventionen, Gras,
Tag/Nacht, Spielstände. Immer zuerst dort die relevante Sektion lesen.

## Setup / Befehle
- Paketmanager ist **pnpm** (per `devEngines` erzwungen). `npx` schlägt fehl.
- `pnpm dev` (Server :5173), `pnpm build` (Typecheck + Bundle). Nach Code-Änderungen
  **immer `pnpm build`** zum Typecheck.

## Architektur in einem Satz (docs §2)
Ein persistentes **Rig** (`SceneManager`, `AnimalModels`, `Grass`, `CoinBurst`,
`AudioManager`, `SkyManager`, `DayNightHud`) und die **einzige** Render-Schleife
leben in `main.ts`; pro Spielstand kapselt eine **`GameSession`** `GameState`,
`World` und alle State-gebundenen UI-/Controller (mit `AbortController`-Cleanup).
Startmenü ↔ Session über `onPlay(id)` / `session.dispose()`.

## Eiserne Regeln (häufige Fehlerquellen)
1. **Gerigte glTF-Modelle nur mit `SkeletonUtils.clone()` klonen** — `Object3D.clone()`
   bindet das Skelett nicht neu → Fehlplatzierung. Vorher prüfen, ob das GLB
   `skins`/`joints` enthält (Python-Snippet in docs §13).
2. **Slot-Höhe in Modell-Gebäuden per Raycast auf den Innenboden snappen** — sonst
   versinken Marker/Tiere (`createModelBuilding` in `src/scene/Building.ts`).
3. **Modelle werden vorab geladen & normalisiert** in `src/scene/AnimalModels.ts`
   (Tiere auf `AnimalDef.size`, Gebäude uniform auf `width×depth`, y=0). **Kein
   Top-Level-`await`** (es2020) → in `init()` kapseln.
4. **Tiergröße ist relativ pro Tier** (`size` in `animals.ts`). Die **Münzhöhe folgt
   automatisch** aus der Tier-Bounding-Box (`SlotEntity.setAnimal`) — nicht hart kodieren.
5. **Gras-Culling** (`src/scene/Grass.ts` + `World.isOccupied`): beim Anpassen
   **immer aus `orig`-Matrizen kopieren** (Compaction-Bug) und den Büschel-**Radius**
   berücksichtigen (sonst ragt Gras ins Gebäude). Details docs §9.
6. **Dach-Fade ist material-/modellabhängig**: `roofMaterials` je Gebäude prüfen
   (rote Flächen können Wände sein). Geschlossene Gebäude: `fadeAll: true`.
7. **Klick-Durchlass**: stark transparente Meshes (Opazität < 0.5) ignoriert der Picker.
8. **Session-Listener** an den durchgereichten `AbortController`-`signal` hängen.

## Neues Tier / Gebäude
Datengetrieben — meist ein Katalog-Eintrag (Checkliste docs §17):
- Tier: GLB nach `public/models/animals/`, Eintrag in `src/game/config/animals.ts`
  **inkl. `size`**. Laden/Normalisieren/Klonen/Idle(+Eat)/Kauf laufen automatisch.
- Gebäude: GLB nach `public/models/buildings/`, Eintrag in
  `src/game/config/buildings.ts` (`model`, `width/depth`, `fadeAll` ODER
  `roofMaterials`, ggf. `modelRotation` damit die offene Seite nach +z zeigt).

## Verifikation (Pflicht bei sichtbaren Änderungen)
Kein UI-Testrunner — per **Playwright-Screenshot** prüfen. Im Dev-Build:
`window.__game = { rig, sceneManager, sky, grass, get session() }`.
**State/World liegen unter `__game.session`** (nur wenn ein Spiel läuft — also erst
über das Startmenü einen Stand starten).

Ablauf:
1. `pnpm dev` im Hintergrund starten.
2. Wegwerf-Skript `scripts/_verify.mjs` (Muster docs §16): Seite laden, **Spiel
   starten** (`SaveManager.createSave` + Menü-Klick) und auf `__game.session`
   warten, via `session` Zustand setzen, Screenshot nach `scripts/shot.png`,
   `pageerror` einsammeln.
3. `node scripts/_verify.mjs`, Screenshot per Read-Tool ansehen, ggf. Werte
   (`size`/`modelRotation`/`roofMaterials`/`slotInset`/Gras-`count`) justieren.
4. **Aufräumen**: `_verify.mjs` und Screenshots löschen.

Nützliche Hooks: `session.world.bubbleWorldPos(i)`, `session.world.animalClip(i)`,
`session.state.slotBase(b)`, `sky.timeOfDay`/`sky.speed` (Tageszeit setzen/anhalten),
`grass.cullables` (sichtbare/Gesamt-Instanzen), `sceneManager.camera/controls`.

## Stil
- Code an den Nachbardateien orientieren (deutsche Kommentare, knapp, datengetrieben).
- Reine Daten in `GameState`; Darstellung in `scene/`; Berechnung in `economy.ts`.
- Strukturänderungen an Gebäuden → `world.rebuild()` (löst auch Gras-Culling aus).
