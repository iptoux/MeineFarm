# MeinHaustier — Entwickler-Dokumentation

3D-Tierfarm-Tycoon mit **Three.js + TypeScript + Vite**. Diese Datei ist die
zentrale Referenz für die Weiterentwicklung: Architektur, Datenmodelle,
Abmessungen, Modell-/Animations-Konventionen und der Verifikations-Workflow.

> Kurz-Setup: `pnpm install` → `pnpm dev` (öffnet `http://localhost:5173/`),
> `pnpm build` (Typecheck + Bundle). Paketmanager ist **pnpm** (per `devEngines`
> erzwungen); `esbuild`-Build ist in `pnpm-workspace.yaml` freigegeben.

---

## 1. Projektstruktur

```text
src/
  main.ts                 # Bootstrap: baut das persistente Rig + Startmenü, startet den Loop
  game/
    Game.ts               # rAF-Loop → onTick(dt,tSec) + render
    GameSession.ts        # Ein laufendes Spiel pro Spielstand (State+World+UI), dispose-bar
    GameState.ts          # money, buildings[], slots[], roads[] + Mutatoren + Events
    economy.ts            # Produktions-/Boost-/Offline-Berechnung (rein funktional)
    config/
      animals.ts          # Tier-Katalog (AnimalDef[], inkl. relativer Größe)
      buildings.ts        # Gebäude-Katalog (BuildingDef[])
      roads.ts            # Straßen-Konstanten + Gitter-Helfer
      slots.ts            # Startwerte + Slot-Freischalt-Kostenkurve
  scene/
    SceneManager.ts       # Renderer (Tonemapping/Fog), Kamera, OrbitControls, Licht, WASD, Zoom-Fade
    Ground.ts             # grüne Bodenfläche (y=0)
    Grass.ts              # Animiertes Wind-Gras (instanzierte GLB-Büschel) + Belegungs-Culling
    Sky.ts                # SkyManager: atmosphärischer Himmel + Tag/Nacht-Zyklus + Sterne (+ daylight)
    Clouds.ts             # CloudManager: ziehende Low-Poly-Wolken + weiche Bodenschatten (Rig)
    Building.ts           # createBuilding (Primitive) + createModelBuilding (glTF)
    AnimalModels.ts       # Lädt/normalisiert alle glTF-Modelle (Tiere, Deko-Critter, Gebäude, UI)
    SlotEntity.ts         # Ein Slot: Marker | Tier (+Animation) | Münze
    World.ts              # Baut Gebäude+Slots+Straßen aus dem State; Produktions-Tick; Gras-Culling
    Critters.ts           # CritterManager: streunender Hund (A*-Pathfinding) + Frosch-Spawner (pro Session)
    Picker.ts             # Raycaster: Links-/Rechtsklick-Routing, Klick-Durchlass
    CoinBurst.ts          # 3D-Münz-Funken beim Ernten
    PlacementController.ts # Gebäude/Zaun bauen/bewegen (Silhouette, R = drehen, Zaun-Snapping)
    RoadController.ts     # Straßen-Bau (Raster, Toggle)
    IconRenderer.ts       # Rendert ein Modell einmalig zu einer PNG-Data-URL (HUD-Icon)
  ui/
    Hud.ts                # Geldanzeige
    DayNightHud.ts        # Tageszeit-Anzeige oben mittig (Icon + Uhr + Balken)
    StartMenu.ts          # Vollbild-Startmenü: Spielstände anlegen/laden/löschen
    SlotMenu.ts, BuildMenu.ts, BuildingMenu.ts, AnimalMenu.ts, Effects.ts
    styles.css
  storage/SaveManager.ts  # localStorage: mehrere benannte Spielstände + Autosave + Offline-Gutschrift
  audio/
    AudioManager.ts       # Musik + Ambience-Loop + SFX (Mute, Autoplay-Unlock) + playAnimalCall
    AmbientAnimals.ts     # zufällige Hintergrund-Rufe der vorhandenen Tiere (pro Session)
public/
  models/animals/*.glb    # Tier-Modelle (Poly Pizza); Shiba Inu.glb + Frog.glb = Deko-Critter; Husky.glb ungenutzt
  models/buildings/*.glb  # Gebäude-Modelle (Open/Big Barn + Fence/Fence_big = Zäune genutzt)
  models/world/*.glb      # Grass Patch.glb + grass yellowing.glb (Gras); Fertile soil.glb ungenutzt
  models/ui/*.glb         # Coin.glb, Coin Piles.glb
  sounds/*.mp3            # Musik + Ambience + Tierrufe (sounds/animals/<id>.mp3); Mixkit, siehe CREDITS.md
  sounds/*.wav            # SFX (collect/unlock/purchase/build)
```

---

## 2. Architektur: Rig + Session

Die App trennt **persistente Infrastruktur** von einem **austauschbaren Spiel**:

- **Rig** (in [main.ts](../src/main.ts) einmalig erzeugt, lebt für die ganze
  Seitensitzung): `SceneManager`, `AnimalModels`, `Grass`, `CoinBurst`,
  `AudioManager` — plus `SkyManager` und `DayNightHud`. Boden, Gras, Licht und
  Himmel hängen dauerhaft in der Szene. Hier läuft auch die **einzige**
  Render-/Update-Schleife ([Game.ts](../src/game/Game.ts)).
- **GameSession** ([GameSession.ts](../src/game/GameSession.ts)): ein konkreter
  Spielstand. Besitzt `GameState`, die sichtbare `World` und alle an den State
  gebundenen Objekte (HUD, Kontextmenüs, `PlacementController`,
  `RoadController`, `Picker`). Bekommt das Rig herein und lässt es bei
  `dispose()` unangetastet.
- **Lebenszyklus:** Startmenü → `onPlay(id)` erzeugt eine `GameSession`. Der
  „☰ Menü"-Button ruft `session.dispose()` (speichert, hängt Listener ab, baut
  die Welt aus der Szene ab) und öffnet das Startmenü wieder. Spielwechsel =
  alte Session disposen, neue erzeugen.
- **Listener-Hygiene:** Alle globalen DOM-Listener der Session hängen an einem
  `AbortController` (`signal` wird an Picker/Menüs durchgereicht); `dispose()`
  ruft `abort()` → automatische Abmeldung, keine Leaks beim Spielwechsel.

**Loop** ([main.ts](../src/main.ts)): `session?.update(dt,tSec)`,
`coinBurst.update`, `grass.update(tSec)` (Wind), `sky.update(dt)` (Tag/Nacht),
`clouds.update(dt, sky.daylight)` (Wolken/Schatten), `dayNight.update(sky.timeOfDay)`.
`session.update` selbst tickt Produktion (`world.update`), die Hintergrund-Rufe
(`ambient.update`) **und** die Deko-Critter (`critters.update`).

**Datenfluss innerhalb einer Session:** `GameState` ist reine Daten +
`onChange`-Events. `World` liest den State und baut die Szene. UI-Komponenten
hängen sich über `state.onChange()` ein. Strukturänderungen (Gebäude bauen/
bewegen/drehen/entfernen, Straßen) lösen `world.rebuild()` bzw.
`world.rebuildRoads()` aus (und damit das Gras-Culling, §9).

---

## 3. Koordinaten & Abmessungen

- **Boden** liegt bei `y = 0` (grüne Ebene 120×120, [Ground.ts](../src/scene/Ground.ts)).
- **Gras** wird im Bereich ±`AREA` (=46) gestreut ([Grass.ts](../src/scene/Grass.ts)).
- **Primitive-Gebäude**: Bodenoberkante `FLOOR_TOP_Y = 0.3` ([Building.ts](../src/scene/Building.ts)).
- **Modell-Gebäude**: Unterkante auf y=0; begehbarer Innenboden höher
  (modellabhängig, z.B. Open Barn ≈ 0.33, Big Barn ≈ 0.44). Slot-Höhen werden
  **per Raycast** auf diesen Boden gesetzt (siehe §6).
- **Tier-Größe**: **relativ pro Tier** über `AnimalDef.size` (längste
  Bounding-Box-Kante), Füße auf Slot-Boden. Kein globaler Einheitswert mehr.
- **Münze**: `COIN_SIZE = 0.7`; schwebt **dynamisch** über dem Tier — Höhe =
  Oberkante der Tier-Bounding-Box + 0.6 (Minimum 1.0), berechnet in
  `SlotEntity.setAnimal` ([SlotEntity.ts](../src/scene/SlotEntity.ts)). Skaliert
  also automatisch mit der Tiergröße.
- **Straßen-Kachel**: `ROAD_TILE = 3` (Rasterweite).
- **Kamera**: `PerspectiveCamera` + `OrbitControls`, Start `(9,6,14)` → Ziel
  `(0,1.2,0)`, Zoom-Distanz 6–40, Polarwinkel begrenzt. **WASD** pant Kamera+Ziel.
- **Renderer/Tonemapping**: `NeutralToneMapping` (Khronos PBR Neutral, entsättigt
  weniger als ACES → satterer Himmel), `toneMappingExposure = 0.85`. Zusätzlich
  `scene.fog` (Fog, 70–180), dessen Farbe der SkyManager pro Frame setzt.

---

## 4. Tiere

Definiert in [src/game/config/animals.ts](../src/game/config/animals.ts) als
`AnimalDef`. Neues Tier = **ein Eintrag** (plus GLB unter `public/models/animals/`).

| Feld | Bedeutung |
|------|-----------|
| `id` | stabile ID (auch im Save) |
| `name` | Anzeigename (Kauf-/Verkaufsmenü) |
| `cost` | Kaufpreis |
| `income` | Wert einer **vollen** Münze (Normaltempo) |
| `intervalMs` | Zeit bis die Münze voll ist (Normaltempo) |
| `boostFactor` | Produktionsfaktor wenn voll & online (Standard 2) |
| `model` | Pfad zum glTF-Modell |
| `color` | Fallback-Farbe (Platzhalter, falls Modell fehlt) |
| `size` | **relative Zielgröße** (längste Bounding-Box-Kante in Welt-Einheiten) |

**Aktueller Katalog:**

| id | Name | cost | income | intervalMs | size | Modell | gerigt? | Animation |
|----|------|------|--------|------------|------|--------|---------|-----------|
| `huhn` | Huhn | 10 | 2 | 4000 | 0.85 | Chicken.glb | nein | – (statisch) |
| `schwein` | Schwein | 75 | 12 | 6000 | 2.25 | Pig.glb | ja | Idle |
| `schaf` | Schaf | 200 | 32 | 7000 | 1.9 | Sheep.glb | ja | Idle |
| `kuh` | Kuh | 400 | 60 | 9000 | 3.5 | Cow.glb | ja | Idle |
| `pferd` | Pferd | 1500 | 220 | 12000 | 3.2 | Horse.glb | ja | Idle ↔ Eating |

> `size` ist eine Designgröße, keine reale Skala — frei justierbar. Da die
> Münzhöhe aus der Tier-Bounding-Box folgt, wandert die Münze automatisch mit.

**Animation** ([SlotEntity.ts](../src/scene/SlotEntity.ts)): generisch. Hat ein
Modell Clips, wird ein `AnimationMixer` erstellt und der **Idle**-Clip gespielt.
Existiert zusätzlich ein **Eat**-Clip, wird im Zufallswechsel zwischen Idle (6–13 s)
und Eat (3–6 s) per Crossfade umgeschaltet. Clip-Auswahl:
- Idle: exakt `idle`, sonst `…|idle`, sonst best-effort (ohne „react"/„jump").
- Eat: enthält `eat`, aber **nicht** `death` (sonst matcht „Death" fälschlich).

> **Deko-Critter** (keine kaufbaren Tiere, nicht im Katalog): `Shiba Inu.glb`
> (streunender Hund) und `Frog.glb` (Frösche) werden separat geladen und vom
> `CritterManager` animiert bewegt — siehe **§19**. Ungenutztes Modell: `Husky.glb`.

---

## 5. Gebäude

Definiert in [src/game/config/buildings.ts](../src/game/config/buildings.ts) als
`BuildingDef`.

| Feld | Bedeutung |
|------|-----------|
| `id`, `name`, `cost` | Identität & Baukosten |
| `slotCount` | Anzahl Slots (Raster 4 Spalten × `ceil(N/4)` Reihen) |
| `width`, `depth` | Ziel-Grundfläche → Modell-Skalierung, Slot-Raster, Platzierungs-Silhouette, Overlap-Check, **Gras-Culling** |
| `roofColor` | Fallback-Dachfarbe (nur Primitive) |
| `model?` | Pfad zum glTF; wenn gesetzt → Modell statt Primitive |
| `modelRotation?` | Basis-Drehung (Radiant), um die offene/Vorderseite nach **+z** zu drehen |
| `roofMaterials?` | Material-Namen, die als „Dach" beim Nah-Zoom ausgeblendet werden |
| `fadeAll?` | beim Nah-Zoom das **ganze** Gebäude ausblenden (für geschlossene Gebäude) |
| `slotInset?` | Rand-Abstand des Slot-Rasters (x & z); größer = Slots weiter innen |
| `icon?` | Emoji im Bau-Menü (Default 🏠); z.B. `🚧` für Zäune |

**Aktueller Katalog:**

| id | Name | cost | slots | width×depth | Modell | Fade |
|----|------|------|-------|-------------|--------|------|
| `stall` | Stall | 120 | 8 | 10×10 | Open Barn.glb (offen) | nur Dach (`RoofBlack`) |
| `scheune` | Große Scheune | 300 | 16 | 14×14 | Big Barn.glb (geschlossen) | ganzes Gebäude (`fadeAll`) |
| `zaun` | Zaun | 15 | 0 | 6×1 | Fence.glb | – (`fadeAll:false`) |
| `zaun_gross` | Großer Zaun | 30 | 0 | 6×1 | Fence_big.glb | – (`fadeAll:false`) |

**Deko-Objekte (`slotCount: 0`)** wie Zäune liefern ein **leeres** Slot-Raster
(`computeSlotPositions` läuft 0×) → keine Tier-Plätze, keine Slot-Marker. Ansonsten
durchlaufen sie dieselbe Pipeline (Laden/Normalisieren/Platzieren) wie Gebäude.

**Orientierung:** Die offene/Vorderseite sollte nach **+z** zeigen (Richtung
Standard-Kamera). Stimmt das Modell nicht, `modelRotation` setzen (z.B. `Math.PI`).
Drehen über das Gebäude-Menü rotiert Modell **und** Slot-Raster.

### 5.1 Platzierung (PlacementController)

[PlacementController.ts](../src/scene/PlacementController.ts) zeigt eine
durchscheinende Silhouette (grün = ok, rot = ungültig), die dem Boden-Cursor folgt;
Linksklick platziert, Rechtsklick/ESC bricht ab. Während des Modus ist die
Kamera-Steuerung aus.

- **Drehen mit `R`**: dreht Silhouette + zu platzierendes Objekt in 90°-Schritten.
  Die Drehung wird über `onBuild(defId,x,z,rotation)` / `onMove(i,x,z,rotation)`
  durchgereicht und in `GameState.addBuilding` / `moveBuilding` gespeichert. Beim
  **Verschieben** startet die Drehung mit der aktuellen Gebäude-Rotation.
- **Zaun-Snapping**: Beim Platzieren eines Deko-Objekts (`slotCount === 0`) rastet
  das nächstgelegene **Ende** innerhalb `SNAP_DIST (=2.5)` exakt am Ende eines
  bereits platzierten Zauns ein (`fenceEnds`/`snapFence`). So entstehen lückenlose
  Reihen, Ecken und parallele Zäune.
- **Kollision (`isValid`)** nutzt **gedrehte** AABB-Halbausdehnungen (`halfExtents`,
  90°/270° tauscht width/depth) für Feldgrenze (`FIELD_HALF = 45`) und Overlap:
  - Gebäude ↔ Gebäude: Mindestabstand `SPACING_MARGIN = 1.5`.
  - Zaun ↔ Gebäude: darf **dicht** anschließen (Toleranz `-0.05`), aber nicht *in*
    einem Stall stehen.
  - **Zaun ↔ Zaun: kein Overlap-Check** — Zäune blockieren sich nicht gegenseitig
    (frei aneinander/über Eck/parallel; Snapping richtet die Enden aus).

**Material-Klassifikation:** Bei beiden Barns sind die roten Flächen
(`DarkRed`/`LightRed`) **Wände**, das **Dach** ist `RoofBlack`. Für roof-only-Fade
nur Dach-Materialien in `roofMaterials` listen.

---

## 6. Slots

- **Flaches Array** `GameState.slots`; Gebäude `b` besitzt Indizes
  `[slotBase(b) .. slotBase(b)+slotCount)`. `slotBase` summiert die `slotCount`
  vorheriger Gebäude.
- **Zustände** ([SlotEntity.ts](../src/scene/SlotEntity.ts)): gesperrt (roter
  Marker), leer (grüner Marker), besetzt (Tier + Münze).
- **Raster** ([Building.ts](../src/scene/Building.ts) `computeSlotPositions`):
  4 Spalten, Reihen = `ceil(slotCount/4)`, Inset, um die Hochachse gedreht,
  vordere Reihe (offene Seite) zuerst.
- **Boden-Snap (Modell-Gebäude):** pro Slot Raycast von oben, **unterster
  Treffer** (= Erdgeschoss-Boden) als Slot-Höhe (+0.02). Ohne Treffer Fallback
  `FLOOR_TOP_Y`.
- **Freischalten:** Kosten `slotUnlockCost(unlockedCount)` = `15 · 2.2^(n-1)`
  ([slots.ts](../src/game/config/slots.ts)), global gezählt.

---

## 7. Ökonomie & Produktion

[economy.ts](../src/game/economy.ts) (rein funktional) + Tick in [World.ts](../src/scene/World.ts):

- `normalRatePerSec = income / (intervalMs/1000)`.
- Münze füllt sich bis `income` (= „voll"). Danach **online** Weiterproduktion mit
  `boostFactor` (Stapel wächst sichtbar weiter; Münze wird größer/goldener mit
  pulsierendem Emissive).
- **Ernten** (Münze anklicken): ganzer Stapel → Geld, Münze zurück auf 0/Normal.
- **Offline** ([SaveManager.ts](../src/storage/SaveManager.ts)): volle abwesende
  Zeit, **immer Normaltempo, ohne Cap**.
- **Start:** `STARTING_MONEY = 15`, `STARTING_UNLOCKED = 1`, Slot 0 = Gratis-Huhn.
- **Verkaufen** (Tier anklicken → Menü): 50 % Rückerstattung, Slot bleibt frei.

---

## 8. Straßen (dekorativ)

[roads.ts](../src/game/config/roads.ts) + [RoadController.ts](../src/scene/RoadController.ts):
Raster-Kacheln (`ROAD_TILE = 3`). **Typen** in `ROADS` (`RoadDef {id,name,cost,color}`),
aktuell `strasse` (grau, 5 €) und `feldweg` (braun, 2 €). Bau-Modus
(`roadController.begin(typeId)`) bleibt aktiv; Linksklick leere Zelle = setzen,
belegte = entfernen; Rechtsklick/ESC beendet. State: `GameState.roads:
{gx,gz,type}[]`. **Rendering** ([World.ts](../src/scene/World.ts) `rebuildRoads`):
Kacheln in **voller** `ROAD_TILE`-Größe (kein Spalt). Das Bau-Menü listet alle
`BUILDINGS` + alle `ROADS`.

---

## 9. Gras (animiert, mit Belegungs-Culling)

[Grass.ts](../src/scene/Grass.ts), erzeugt einmalig per `await createGrass()` (Teil
des Rigs). Aufbau aus **instanzierten GLB-Büscheln** (`THREE.InstancedMesh`,
je 1 Draw-Call):

- **Haupt-Teppich**: `Grass Patch.glb` (~8,5k Tris/Büschel), ~1700 Instanzen auf
  einem **jittered Grid** (Rasterzelle + Zufalls-Versatz) → gleichmäßige,
  lückenlose Abdeckung (reines Zufalls-Streuen erzeugt Klumpen + kahle Stellen).
- **Akzente**: `grass yellowing.glb` (trocken), ~350 Instanzen rein zufällig
  (`scatter: true`).
- **Wind**: höhenmaskierter Vertex-Shader via `material.onBeforeCompile`
  (`#include <begin_vertex>` patchen). Wurzel (y≈0) fix, Spitze schwingt; zwei
  überlagerte Sinuswellen + Phasenversatz aus der Instanz-Weltposition. Alle
  Materialien teilen **eine** `uTime`-Uniform, gesetzt in `grass.update(tSec)`.

**Belegungs-Culling** — `grass.setOccupancy(pred)` blendet Gras unter Gebäuden/
Straßen aus. Ausgelöst von [World.ts](../src/scene/World.ts) in
`addBuildingVisuals` und `rebuildRoads` (`cullGrass`), also bei jeder
strukturellen Änderung; das Prädikat ist `World.isOccupied(x,z,r)`.

Wichtige Details (zwei behobene Bugs, nicht regressen lassen):
1. **Compaction statt Matrix=0**: sichtbare Instanzen werden im Buffer nach vorne
   gepackt und `mesh.count` reduziert → verdeckte Büschel kosten keine Vertex-Last.
   Dabei **immer aus den Originalmatrizen (`orig`) kopieren**, nie aus dem schon
   umsortierten Live-Buffer — sonst verschieben sich Positionen bei wiederholten
   Aufrufen (Gras verschwindet an falschen Stellen).
2. **Radius-genau**: jedes Büschel ist ~2,9 m breit. Das Culling berücksichtigt
   den **Instanz-Radius** (`baseHalf · Skala`, Skala aus der Matrix) — die
   Gebäudefläche/Straße wird um diesen Radius erweitert (`isOccupied(x,z,r)`),
   sonst ragen breite Büschel von außen ins Gebäude. Fester Zusatzrand:
   `GRASS_BUILD_MARGIN = 0.1`.

> Performance-Stellschrauben in `createGrass()` (Instanz-`count`) und `AREA` in
> [Grass.ts](../src/scene/Grass.ts) — bei FPS-Einbrüchen `count` senken.

---

## 10. Himmel & Tag/Nacht-Zyklus

[Sky.ts](../src/scene/Sky.ts) (`SkyManager`, Teil des Rigs) + Anzeige
[DayNightHud.ts](../src/ui/DayNightHud.ts).

- **Himmel**: atmosphärischer `Sky` aus `three/examples/jsm/objects/Sky.js`
  (Atmospheric Scattering), Box mit `scale = SKY_RADIUS (400)`.
- **Zeit**: `timeOfDay ∈ [0,1)` (0 = Mitternacht, 0.25 = Sonnenaufgang, 0.5 =
  Mittag, 0.75 = Sonnenuntergang). `update(dt)` rückt um `dt·speed/DAY_LENGTH_SEC`
  vor (`DAY_LENGTH_SEC = 360` → ~6 min pro Tag; `speed` für Zeitraffer/Stop).
- **Sonne**: Elevation auf Sinus-Bogen (max `MAX_ELEVATION = 60°`). Der
  Sonnen-Richtungsvektor speist `sky.uniforms.sunPosition` **und** die Position
  der `DirectionalLight` (Schatten drehen mit).
- **Lichtstimmung** (in `apply()`, mutiert die SceneManager-Lichter): Sonnen-
  Intensität/-farbe (warm-orange bei Auf-/Untergang → weiß mittags), Hemisphere
  und Ambient mit niedrigen **Nacht-Minima** (`hemi 0.08 + day·0.95`,
  `ambient 0.07 + day·0.45`), plus `scene.fog`-Farbe (Tag/Dämmerung/Nacht).
- **Sterne**: `THREE.Points` (additives Blending, ~2600, innerhalb der Sky-Box),
  Opazität blendet nachts ein.
- **`daylight ∈ [0,1]`**: in `apply()` mitgesetzter Tageslicht-Faktor (0 = Nacht,
  1 = heller Tag). Wird in der Loop an `clouds.update(dt, sky.daylight)` gegeben, um
  die Wolkenschatten tagsüber ein- und nachts auszublenden (**§20**).
- **HUD**: Phasen-Emoji (🌅 ☀️ 🌇 🌙) + Uhrzeit `HH:MM` + Farbverlaufs-Balken mit
  Marker (`#daynight` in [index.html](../index.html)/[styles.css](../src/ui/styles.css)).

---

## 11. Interaktion (Picker)

[Picker.ts](../src/scene/Picker.ts) per Raycaster, mit Drag-Schwelle (Kamera-Drehen
löst nichts aus):

| Eingabe | Wirkung |
|---------|---------|
| **Linksklick** Münze | ernten (`onBubble`) |
| **Linksklick** Tier | Verkaufen-Menü (`onAnimal`) |
| **Linksklick** Slot-Marker | Freischalten/Tier-Kauf-Menü (`onMarker`) |
| **Rechtsklick** Gebäude | Gebäude-Menü Bewegen/Drehen/Entfernen (`onBuilding`) |

Pickbare Meshes tragen `userData: PickData { kind, slotIndex?, buildingIndex? }`.
**Klick-Durchlass:** Meshes mit `transparent && opacity < 0.5` werden ignoriert —
so klickt man durch ein ausgeblendetes (gezoomtes) Dach auf Tiere/Münzen.
Der Raycaster prüft **nur** die von `world.pickables()` gelieferte Liste; Deko-Critter
(Hund/Frösche) stehen nicht darin und stören Ernten/Verkaufen daher nicht.

---

## 12. Zoom-Fade

[SceneManager.ts](../src/scene/SceneManager.ts) `setFadeOnZoom`/`updateFade`: Je
nach Kamera-Abstand werden registrierte Fade-Meshes ein-/ausgeblendet —
Distanz ≥ 14 → Opazität 1.0, ≤ 8 → 0.12, dazwischen linear. `depthWrite` ab
Opazität > 0.95. Fade-Meshes liefert `World.roofMeshes` (Dach bzw. ganzes
Gebäude je `fadeAll`); pro Session via `sceneManager.setFadeOnZoom(...)` gesetzt.

---

## 13. glTF-Modelle — Konventionen (WICHTIG)

Geladen & normalisiert in [AnimalModels.ts](../src/scene/AnimalModels.ts) (Name
historisch; lädt Tiere **und** Gebäude **und** UI-Münzen). Alles wird in `load()`
**vor** dem Welt-Aufbau geladen (`await models.load()` im Rig-Aufbau). Gras-GLBs
lädt separat [Grass.ts](../src/scene/Grass.ts) (`createGrass`).

- **Normalisierung Tiere:** uniform auf `def.size` (längste Kante), in x/z
  zentriert, Füße auf y=0.
- **Normalisierung Gebäude:** uniform `min(width/sizeX, depth/sizeZ)`, in x/z
  zentriert, Unterkante auf y=0, optionale `modelRotation`. Alle Materialien
  `transparent: true` (Opazität bleibt 1 → deckend, ermöglicht Fade).
- **Klonen:**
  - **Gerigte (skinned) Modelle müssen mit `SkeletonUtils.clone()`** geklont
    werden — `Object3D.clone()` bindet das Skelett nicht neu → Fehlplatzierung.
    Prüfen: GLB enthält `skins`/`joints`.
  - Münze/Gebäude: `clone(true)` + **Materialien pro Instanz klonen**.
- **Build-Target:** kein Top-Level-`await` (es2020) → Async-Init in `init()` kapseln.

**Modell prüfen (GLB-Header lesen):**
```bash
python - <<'PY'
import struct, json
f="public/models/animals/Horse.glb"
d=open(f,"rb").read(); off=12; ln=struct.unpack_from("<I",d,off)[0]; off+=8
j=json.loads(d[off:off+ln])
print("skinned:", "skins" in j, "| anims:", [a.get("name") for a in j.get("animations",[]) if "|" not in (a.get("name") or "")])
print("materials:", [m["name"] for m in j.get("materials",[])])
print("meshes/prims/tris:", [(m["name"], len(m["primitives"])) for m in j.get("meshes",[])])
PY
```

---

## 14. Audio

[AudioManager.ts](../src/audio/AudioManager.ts): zwei Loops + SFX. Autoplay startet
erst nach erster Nutzergeste (Pointer/Tastendruck); Mute-Button im HUD pausiert/
startet beide Loops.

- **Loops**: `farm-music.mp3` (Hintergrundmusik, vol 0.3) **und** `farm-ambience.mp3`
  (leise Bauernhof-Kulisse, vol 0.18).
- **SFX**: `collect`, `unlock`, `purchase`, `build` (+ leiser `playRoad`).
- **Tierrufe**: `playAnimalCall(id, vol)` spielt `sounds/animals/<id>.mp3`
  (`id` = Tier-`id` aus dem Katalog). Genutzt
  (a) **laut** beim Anklicken eines Tiers ([GameSession](../src/game/GameSession.ts)
  `onAnimal`, vol 0.55) und
  (b) **leise** als zufällige Hintergrund-Rufe der vorhandenen Tiere
  ([AmbientAnimals.ts](../src/audio/AmbientAnimals.ts), vol 0.22; pro Session,
  Timer 8–20 s, zieht eine zufällige `animalId` aus den belegten Slots).
- Fehlt eine Sound-Datei, passiert nichts (`play().catch()` schluckt den Fehler).
- Lizenz/Quellen: [public/sounds/CREDITS.md](../public/sounds/CREDITS.md)
  (Mixkit Free License). Neues Tier ⇒ optional `sounds/animals/<id>.mp3` ergänzen.

---

## 15. Speichern (mehrere Spielstände)

[SaveManager.ts](../src/storage/SaveManager.ts) — **statisch**, gegen localStorage:

- **Index** `meinhaustier:saves`: Liste leichter Metadaten (`SaveMeta {id, name,
  lastSaveTs, money}`) für die Menü-Liste.
- **Pro Stand** `meinhaustier:save:<id>`: vollständige `SaveData` (version 2;
  `money`, `buildings` inkl. `rotation`, `slots`, `roads`, `lastSaveTs`).
- **Legacy-Migration**: ein alter Einzel-Stand `meinhaustier:save:v2` wird beim
  Modul-Load **einmalig** in einen benannten Slot überführt.
- **API**: `listSaves()`, `createSave(name)`, `deleteSave(id)`, `loadInto(state,
  id)` (inkl. Offline-Gutschrift), `save(state, id)`, `startAutosave(state, id)`
  (Intervall 5 s + `beforeunload`, gibt Stop-Funktion zurück).
- **Startmenü** ([StartMenu.ts](../src/ui/StartMenu.ts)): Spielstände anlegen
  (`prompt` für Namen), laden, löschen (`confirm`). Wird beim Seitenstart und bei
  jeder Rückkehr aus dem Spiel geöffnet.

Format-Änderungen → `version` erhöhen und `loadInto` defensiv halten.

---

## 16. Verifikations-Workflow (Playwright)

Es gibt **keinen** UI-Testrunner; verifiziert wird per Headless-Browser-Screenshot
und einem **Dev-Debug-Hook**. In [main.ts](../src/main.ts) wird unter
`import.meta.env.DEV` gesetzt:

```js
window.__game = { rig, sceneManager, sky, grass, get session() }
```

`rig` = `{ sceneManager, models, grass, coinBurst, audio }`. **State und World
liegen jetzt unter der Session**: `__game.session.state`, `__game.session.world`.
Es muss zuerst ein Spiel laufen (Startmenü!), sonst ist `session` `null`.

Muster (Dev-Server auf :5173):
```js
// scripts/_verify.mjs  (Wegwerf-Skript, nach Gebrauch löschen)
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1140, height: 660 } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:5173/", { waitUntil: "load" });
await p.waitForFunction(() => !!window.__game);
// Spiel starten (frischen Stand anlegen) und auf Session warten
await p.evaluate(async () => {
  const { SaveManager } = await import("/src/storage/SaveManager.ts");
  const id = SaveManager.createSave("Test");
  document.querySelector("#start-menu .sm-load")?.click(); // oder: onPlay via Menü
  window.__startTest = id;
});
await p.waitForFunction(() => window.__game.session);
await p.evaluate(() => {
  const g = window.__game.session;
  g.state.money = 5000; g.state.emit();
  g.state.unlockSlot(1); g.state.buyAnimal(1, "schwein");
});
// Optional Tageszeit fixieren: window.__game.sky.speed = 0; sky.timeOfDay = 0.5;
await p.screenshot({ path: "scripts/shot.png" });
await b.close();
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
```
Ablauf: `pnpm dev` im Hintergrund → Skript mit `node` → Screenshot per
Read-Tool prüfen → Skript & PNG löschen.

Nützliche Hooks: `session.world.bubbleWorldPos(i)` (Welt-Pos einer Münze),
`session.world.animalClip(i)` (laufender Clip), `session.state.slotBase(b)`,
`sky.timeOfDay`/`sky.speed` (Tageszeit steuern/anhalten),
`grass.cullables` (sichtbare/Gesamt-Instanzen prüfen),
`sceneManager.camera/controls` (Kamera für Screenshots),
`session.critters.dog.object.position` / `session.critters.frogs` (Hund/Frösche),
`session.placement` (`begin(def)`, `rotation`, `isValid(x,z)` für Platzierungs-Tests).

---

## 17. Neues Tier / Gebäude hinzufügen — Checkliste

**Tier:**
1. GLB nach `public/models/animals/` legen; mit dem Python-Snippet (§13) prüfen
   (skinned? Idle/Eat-Clipnamen?).
2. Eintrag in [animals.ts](../src/game/config/animals.ts) inkl. **`size`**
   (relativ; Münzhöhe folgt automatisch).
3. Läuft automatisch: Laden, Normalisieren, Klonen, Idle/Eat-Animation, Kauf.
4. Verifizieren (§16): sichtbar im Slot, Größe stimmig, Animation, kauf-/verkaufbar.

**Gebäude:**
1. GLB nach `public/models/buildings/`; prüfen (offen/geschlossen? Dach-Material?).
2. Eintrag in [buildings.ts](../src/game/config/buildings.ts): `model`, `width/depth`,
   `fadeAll` (geschlossen) **oder** `roofMaterials` (offen), ggf. `modelRotation`.
3. Verifizieren (§16): Skalierung/Orientierung, Slots **im** Gebäude auf dem Boden,
   Zoom-Fade, Rechtsklick-Menü, Drehen rotiert Modell+Slots, **Gras innen weg**.

**Deko-Objekt (Zaun-artig):** Eintrag mit `slotCount: 0` (+ `icon`); platzierbar/
drehbar/snappbar ohne weiteren Code (§5.1). Blockiert den Hund automatisch (§19).

**Deko-Critter (Hund/Frosch o.ä.):** GLB nach `public/models/animals/`, Eintrag in
`DECOR` ([AnimalModels.ts](../src/scene/AnimalModels.ts)) → über `models.get(id)`/
`getClips(id)` nutzbar; Bewegung/Animation im `CritterManager` (§19) ergänzen.

---

## 18. Bekannte Stolpersteine
- **Skinned-Clone**: immer `SkeletonUtils.clone()` (sonst Fehlplatzierung).
- **Modell-Innenboden**: Slots per Raycast auf den Boden snappen (§6).
- **Gras-Culling**: immer aus `orig` kopieren (Compaction-Bug) und den Büschel-
  **Radius** in `isOccupied` berücksichtigen (sonst Gras im Gebäude) — §9.
- **Material-Namen** modellabhängig — Dach-Erkennung (`roofMaterials`) je Modell prüfen.
- **Top-Level-await** vermeiden (es2020) → `init()`-Kapselung.
- **Session-Listener** an den `AbortController` hängen (`signal` durchreichen),
  damit beim Spielwechsel nichts leakt.
- **Debug-Hook**: State/World liegen unter `__game.session` (nur wenn ein Spiel läuft).
- **pnpm** nutzen; `esbuild`-Build-Freigabe steht in `pnpm-workspace.yaml`.
- **Critter-Nav vs. dünne Hindernisse**: Das Nav-Gitter (Zelle 2) prüft
  **zellüberlappend** (`cellHalf = CELL/2`), nicht nur Zell-Mittelpunkte — sonst
  rutschen Tiere durch dünne Zäune (§19). Die „Tür"-Lücke gilt nur für Ställe
  (`slotCount > 0`); Zäune blockieren ganz.
- **Zäune blockieren sich nicht gegenseitig** (Platzierung, §5.1) — bewusst, damit
  Ecken/Reihen baubar sind. Nicht „reparieren".

---

## 19. Deko-Critter: Hund & Frösche

[Critters.ts](../src/scene/Critters.ts) (`CritterManager`, **pro Session** in
[GameSession.ts](../src/game/GameSession.ts) erzeugt/`update`d/`dispose`d). Liest
direkt `state.buildings` (Footprints) und `state.roads`; das Nav-Gitter wird beim
nächsten Wegfinden neu aufgebaut (immer aktuell, keine Subscription). Modelle aus
`DECOR` (§13): `shiba` (size 1.5), `frog` (0.45). Beide werfen Schatten (`castShadow`)
und sind **nicht** anklickbar (§11).

**Hund (`Dog`)** — ein Shiba, streift den Hof ab:
- Zustände `walk ↔ pause`; Pause spielt Idle/Idle_2/Eating (Schnüffeln/Grasen),
  weite Ziele werden im `gallop` angesteuert. Ausrichtung dreht weich
  (`lerpAngle`). Clip-Auswahl über `makeAction` (exakt → `|name` → Teilstring,
  damit `idle` nicht `Idle_HitReact` trifft).
- **Pathfinding**: grobes Belegungs-Gitter (`AREA = 40`, `CELL = 2`) + **A\***
  (`planPath`, 8-Nachbarschaft). Gebäude-Footprints (gedreht) sind blockiert; Ställe
  haben eine **Tür-Lücke** an der offenen Vorderseite (lokales +z, `DOOR_HALF`),
  sodass der Hund hinein **und** wieder heraus findet. Zäune blockieren komplett.
- **Höhe**: im Gebäude-Footprint auf `FLOOR_TOP_Y`, sonst y=0 (weich interpoliert) →
  kein Einsinken im Stall.

**Frösche (`FrogSpawner`)**:

- Spawnen **nur bei vorhandenen Straßen**, **selten** (Timer 20–45 s) und **max. 2**.
- Ablauf: Start im Gras neben einer zufälligen Straßen-Kachel → in Sprüngen
  (`Frog_Jump`, Parabel-Bogen pro Hüpfer) auf die Straße → ein Stück **entlang des
  Straßenverlaufs** (Richtung aus Nachbarzellen) → auf der anderen Seite ins Gras →
  entfernen. Jeder Frosch ist ein eigenständiges, kurzlebiges Objekt.

> Blickrichtung: Modelle werden über `rotation.y = atan2(dir.x, dir.z)` ausgerichtet
> (Vorderseite +z). Stimmt sie nicht, einen Offset in `Dog`/`Frog` ergänzen.

---

## 20. Wolken & Bodenschatten

[Clouds.ts](../src/scene/Clouds.ts) (`CloudManager`, **Teil des Rigs**, in
[main.ts](../src/main.ts) erzeugt, `update(dt, sky.daylight)` in der Loop).

- **Wolken**: `CLOUD_COUNT (12)` Gruppen aus mehreren abgeflachten Low-Poly-Kugeln
  (`IcosahedronGeometry`, geteiltes `MeshStandardMaterial`) in Höhe `CLOUD_HEIGHT`,
  driften mit `WIND` über `±SPREAD` und wrappen am Rand. Da sie auf Szenenlicht
  reagieren, dunkeln sie nachts automatisch mit ab.
- **Bodenschatten**: pro Wolke ein flaches Plane bei y≈0.06 mit weicher radialer
  Alpha-Textur (Canvas-Gradient), das synchron mitzieht. Bewusst **gefälschte
  Decals** statt Shadow-Map (performant, sauber, sonnenstand-unabhängig).
- **Nacht**: Schatten-Opazität skaliert mit `sky.daylight` → nachts unsichtbar.

> Stellschrauben oben in der Datei: `CLOUD_COUNT` (Dichte), `CLOUD_HEIGHT` (Höhe),
> `WIND` (Tempo/Richtung), `SHADOW_MAX_OPACITY` (Schatten-Stärke).
