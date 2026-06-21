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
Ein persistentes **Rig** (`SceneManager`, `AnimalModels`, `Grass`, `Trees`,
`CloudManager`, `WeatherManager`, `CoinBurst`, `AudioManager`, `SkyManager`,
`DayNightHud`) und die **einzige** Render-Schleife leben in `main.ts`; pro
Spielstand kapselt eine **`GameSession`** `GameState`, `World`, die Deko-Critter
(`CritterManager`), die Hintergrund-Rufe (`AmbientAnimals`) und alle
State-gebundenen UI-/Controller (mit `AbortController`-Cleanup). Startmenü ↔ Session
über `onPlay(id)` / `session.dispose()`.

## Zusatz-Systeme (docs §5.1, §9, §14, §19, §20, §21)
- **Platzierung**: `R` dreht (90°), Zäune (`slotCount: 0`) snappen an Enden und
  blockieren sich **nicht** gegenseitig (docs §5.1).
- **Audio**: zwei Loops (Musik + Ambience) + Tierrufe `playAnimalCall(id)`
  (`sounds/animals/<id>.mp3`); zufällige Hintergrund-Rufe via `AmbientAnimals` (§14).
- **Hund** (`Critters.ts`, pro Session): streunender Hund mit A*-Pathfinding (umgeht
  Gebäude, Tür-Lücke nur bei Ställen, Zäune blockieren ganz). **Anklickbar** → Menü
  (`DogMenu`) *Füttern/Streicheln/Spielen/Name ändern*: friert ein, dreht sich zur
  Kamera, `sceneManager.focusOn` fährt heran; Aktionen spielen Shiba-Clips, Streicheln
  spawnt Herzen (`HeartBurst`, `Heart.glb`). Name (`state.dogName`) ist persistent. Plus
  seltene Frösche über Straßen (max. 2). Deko-Modelle in `DECOR` (`AnimalModels.ts`) (§19).
- **Bäume** (`Trees.ts`, Rig): 5 Varianten aus `Trees.glb`, instanziert + seeded
  verteilt, wiegen im Wind, unter Gebäuden/Straßen per Belegungs-Culling ausgeblendet
  (**„drüber bauen"**, keine Kollision). Materialien matt setzen (§21).
- **Wind** (`wind.ts`): geteilter Shader für Gras + Bäume; Stärke `uWind` aus
  `weather.windStrength` → bei Sturm/Unwetter stärker (§9).
- **Wolken** (`Clouds.ts`, Rig): ziehende Low-Poly-Wolken + gefälschte Schatten-Decals,
  nachts via `sky.daylight` ausgeblendet (§20).

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
- **Deko-Objekt** (Zaun-artig): `slotCount: 0` (+ `icon`) — platzier-/dreh-/snappbar
  ohne weiteren Code, blockiert den Hund automatisch.
- **Deko-Critter** (Hund/Frosch): GLB + Eintrag in `DECOR` (`AnimalModels.ts`),
  Bewegung/Animation im `CritterManager` (docs §19).

## Eigene Blender-Modelle bauen (docs §23 — Vollreferenz)
Für neue, **stilkonforme** Modelle (z.B. die animierte **Windmühle**) prozedural in
Blender bauen. Kernpunkte:
- **Verbindung:** BlenderMCP-Addon-Socket `127.0.0.1:9876` (JSON `execute_code`); funktioniert
  auch ohne registrierten MCP-Server, solange Blender mit „Connect" läuft. Stil eines
  vorhandenen GLB vorab auslesen (Material-Farben, Bounding-Box).
- **Art-Stil:** flat low-poly (`use_smooth=False`, roughness ~0.9, metallic 0), feste
  **Scheunen-Palette** (lineare Werte in docs §23.2: DarkRed/LightRed/White/RoofBlack/
  Wood/Wood_Light). Plankige Wände = schmale erhabene **vertikale Leisten**; Dach =
  gestapelte **Schindel-Ringe**; **weiße** Zierbänder + **weiße Fensterrahmen**.
- **Koordinaten:** Front nach **Blender −Y** bauen → Spiel-Front **+Z**. Export GLB mit
  `export_yup=True, export_animation_mode='ACTIONS', export_force_sampling=True`.
- **GRÖSSE/Skalierung:** `normalizeBuilding` skaliert mit `min(width/sizeX, depth/sizeZ)` —
  die **breiteste Auskragung bestimmt den Maßstab** (Flügelspanne!). Höher/größer ⇒
  **Modell-Proportionen** ändern (Turm dicker/höher), **nicht nur** `width/depth`.
  In-Game-Höhe ≈ `blenderHöhe · width/sizeX`. Endmaße: Windmühle ~15.36/11×11,
  Open Barn ~7.67/10, Big Barn ~13.43/14.
- **Animationen (automatisch):** GLB-Clips → `AnimalModels.getBuildingClips` →
  `Building.setupAnimations` (Mixer pro Instanz) → `World.update` treibt sie. Clip-Name
  mit **„door"** = per-Klick-Toggle (`onBuildingLeft`), sonst Endlos-Loop. Eine Action
  **pro Objekt** = ein Clip pro Objekt; Türen am **Scharnier**-Ursprung, bei schrägen
  Wänden kippen + in den Wand-Tunnel zurückversetzen (Kippung in alle Keyframes backen).
- **Nacht-Glow (Fenster):** Material-Name enthält **„glow"** + Emission → `Building.ts`
  sammelt sie, `World.update(…, sky.daylight)` regelt `emissiveIntensity`
  (`clamp((0.5−daylight)/0.5,0,1)·1.5`). Beliebig viele Glow-Meshes, kein Code-Change.
- **Stolperstein:** Kind-Objekte bekommen lokal `(0,0,0)` (nie zusätzlich Welt-`location`,
  sonst Doppel-Offset). Modifier kontext-sicher anwenden via `new_from_object` (nicht
  `modifier_apply`). Immer **mehrere Render-Winkel** + GLB-Parse + Browser-Load prüfen.

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
`session.state.slotBase(b)`, `session.state.dogName`/`setDogName(n)`,
`sky.timeOfDay`/`sky.speed` (Tageszeit setzen/anhalten),
`weather.setWeather(kind)`/`weather.windStrength` (Wetter/Wind, Bäume+Gras),
`grass.cullables` (sichtbare/Gesamt-Instanzen), `sceneManager.camera/controls`/`focusOn`,
`session.critters.selectDog(camPos)`/`feedDog`/`petDog`/`playWithDog`/`frogs` (Critter),
`session.placement` (`begin`/`rotation`/`isValid` für Platzierungs-Tests).

## Stil
- Code an den Nachbardateien orientieren (deutsche Kommentare, knapp, datengetrieben).
- Reine Daten in `GameState`; Darstellung in `scene/`; Berechnung in `economy.ts`.
- Strukturänderungen an Gebäuden → `world.rebuild()` (löst auch Gras-Culling aus).
