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
      chunks.ts           # Erweiterbares Spielfeld (FieldBounds, CHUNK, Erweiterungskosten)
      dognames.ts         # Liste cooler Hundenamen + randomDogName()
  scene/
    SceneManager.ts       # Renderer (Tonemapping/Fog), Kamera, OrbitControls, Licht, WASD, Zoom-Fade, Kamera-Fokus
    Ground.ts             # grüne Bodenfläche (y=0)
    wind.ts               # Geteilter höhenmaskierter Wind-Vertex-Shader (Gras + Bäume), uTime + uWind
    Grass.ts              # Animiertes Wind-Gras (instanzierte GLB-Büschel) + Belegungs-Culling
    Trees.ts              # Zufällig verteilte Bäume (instanziert, Wind, Belegungs-Culling, seeded) (Rig)
    Sky.ts                # SkyManager: atmosphärischer Himmel + Tag/Nacht-Zyklus + Sterne (+ daylight)
    Clouds.ts             # CloudManager: ziehende Low-Poly-Wolken + weiche Bodenschatten (Rig)
    Fireflies.ts          # Nacht-Gluehwuermchen (Points-Shader, feld-/wetterabhaengig) (Rig)
    Weather.ts            # WeatherManager: Wetterlagen (clear/rain/storm/fog) + windStrength (Rig)
    Building.ts           # createBuilding (Primitive) + createModelBuilding (glTF)
    AnimalModels.ts       # Lädt/normalisiert alle glTF-Modelle (Tiere, Deko-Critter, Gebäude, UI, Herz)
    SlotEntity.ts         # Ein Slot: Marker | Tier (+Animation) | Münze
    World.ts              # Baut Gebäude+Slots+Straßen aus dem State; Produktions-Tick; Gras-/Baum-Culling
    Critters.ts           # CritterManager: anklickbarer Hund (A*-Pathfinding, Menü-Aktionen, Herzen) + Frosch-Spawner
    Picker.ts             # Raycaster: Links-/Rechtsklick-Routing, Klick-Durchlass (inkl. Hund)
    CoinBurst.ts          # 3D-Münz-Funken beim Ernten
    PlacementController.ts # Gebäude/Zaun bauen/bewegen (Silhouette, R = drehen, Zaun-Snapping)
    RoadController.ts     # Straßen-Bau (Raster, Toggle)
    FieldExpansion.ts     # „+"-Pads an den Feldkanten (Spielfeld erweitern)
    IconRenderer.ts       # Rendert ein Modell einmalig zu einer PNG-Data-URL (HUD-Icon)
  ui/
    Hud.ts                # Geldanzeige
    DayNightHud.ts        # Tageszeit-Anzeige oben mittig (Icon + Uhr + Balken)
    StartMenu.ts          # Vollbild-Startmenü: Spielstände anlegen/laden/löschen
    DogMenu.ts            # Hunde-Kontextmenü: Füttern/Streicheln/Spielen/Name ändern
    SlotMenu.ts, BuildMenu.ts, BuildingMenu.ts, AnimalMenu.ts, FieldMenu.ts, Effects.ts
    styles.css
  storage/SaveManager.ts  # localStorage: mehrere benannte Spielstände + Autosave + Offline-Gutschrift
  audio/
    AudioManager.ts       # Musik + Ambience-Loop + SFX (Mute, Autoplay-Unlock) + playAnimalCall
    AmbientAnimals.ts     # zufällige Hintergrund-Rufe der vorhandenen Tiere (pro Session)
public/
  models/animals/*.glb    # Tier-Modelle (Poly Pizza); Shiba Inu.glb + Frog.glb = Deko-Critter; Husky.glb ungenutzt
  models/buildings/*.glb  # Gebäude-Modelle (Open/Big Barn + Fence/Fence_big = Zäune genutzt)
  models/world/*.glb      # Grass Patch.glb + grass yellowing.glb (Gras); Trees.glb (5 Bäume); Fertile soil.glb ungenutzt
  models/ui/*.glb         # Coin.glb, Coin Piles.glb, Heart.glb (Streichel-Herzen)
  sounds/*.mp3            # Musik + Ambience + Tierrufe (sounds/animals/<id>.mp3); Mixkit, siehe CREDITS.md
  sounds/*.wav            # SFX (collect/unlock/purchase/build)
```

---

## 2. Architektur: Rig + Session

Die App trennt **persistente Infrastruktur** von einem **austauschbaren Spiel**:

- **Rig** (in [main.ts](../src/main.ts) einmalig erzeugt, lebt für die ganze
  Seitensitzung): `SceneManager`, `AnimalModels`, `Grass`, `Trees`, `CoinBurst`,
  `AudioManager` — plus `SkyManager`, `WeatherManager`, `CloudManager`,
  `Fireflies` und `DayNightHud`. Boden, Gras, Bäume, Licht und Himmel hängen dauerhaft in der
  Szene. Hier läuft auch die **einzige** Render-/Update-Schleife
  ([Game.ts](../src/game/Game.ts)).
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
`coinBurst.update`, `grass.update(tSec)` + `grass.setWind(weather.windStrength)`,
`trees.update(tSec, weather.windStrength)` (beide wiegen wetterabhängig im Wind,
§9/§21), `sky.update(dt)` (Tag/Nacht), `weather.update(...)`,
`clouds.update(dt, sky.daylight, sky.sunDir)` (Wolken/Schatten),
`fireflies.update(dt,tSec, sky.daylight, weather.target, weather.windStrength)`
(nächtliche Glow-Partikel, §22),
`dayNight.update(sky.timeOfDay)`. `session.update` selbst tickt Produktion
(`world.update`), die Hintergrund-Rufe (`ambient.update`) **und** die Deko-Critter
(`critters.update`, inkl. Herzen-Effekt).

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
> (streunender, **anklickbarer** Hund mit Namen + Menü-Aktionen) und `Frog.glb`
> (Frösche) werden separat geladen und vom `CritterManager` animiert bewegt —
> siehe **§19**. Ungenutztes Modell: `Husky.glb`.

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
- **Wind**: höhenmaskierter Vertex-Shader, ausgelagert nach
  [wind.ts](../src/scene/wind.ts) (`applyWind`, via `material.onBeforeCompile`,
  `#include <begin_vertex>` patchen). Wurzel (y≈0) fix, Spitze schwingt; zwei
  überlagerte Sinuswellen + Phasenversatz aus der Instanz-Weltposition. Zwei
  geteilte Uniforms: **`uTime`** (Zeit, `grass.update(tSec)`) und **`uWind`**
  (Stärke-Multiplikator, `grass.setWind(strength)`). Effektive Auslenkung =
  `amplitude · uWind`. Die Stärke kommt pro Frame aus `weather.windStrength`
  (ruhig ~0.4 bei Nebel, ~1.0 klar, ~2.4 im Sturm) → Gras wogt bei Unwetter
  sichtbar stärker. **Bäume** teilen denselben Helfer (§21).

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
  die Wolkenschatten tagsüber ein- und nachts auszublenden (**§20**) und an
  `fireflies.update(...)`, damit die Gluehwuermchen erst in Daemmerung/Nacht
  sichtbar werden (**§22**).
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
| **Linksklick** Hund | Hunde-Menü + Auswahl/Kamera-Fokus (`onDog`, §19) |
| **Rechtsklick** Gebäude | Gebäude-Menü Bewegen/Drehen/Entfernen (`onBuilding`) |

Pickbare Meshes tragen `userData: PickData { kind, slotIndex?, buildingIndex? }`
(`kind` = `marker|bubble|animal|building|dog`). **Klick-Durchlass:** Meshes mit
`transparent && opacity < 0.5` werden ignoriert — so klickt man durch ein
ausgeblendetes (gezoomtes) Dach auf Tiere/Münzen. Der Raycaster prüft die Liste
`[...world.pickables(), ...critters.dogPickables()]`: der **Hund ist anklickbar**
(linke Maustaste → Hunde-Menü, §19), die **Frösche** stehen nicht darin und stören
Ernten/Verkaufen nicht.

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
historisch; lädt Tiere **und** Gebäude **und** UI-Modelle: Münze, Münzhaufen,
**Herz** `getHeart()` für den Streichel-Effekt §19). Alles wird in `load()`
**vor** dem Welt-Aufbau geladen (`await models.load()` im Rig-Aufbau). Gras- und
Baum-GLBs laden separat [Grass.ts](../src/scene/Grass.ts) (`createGrass`) bzw.
[Trees.ts](../src/scene/Trees.ts) (`createTrees`).

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
- **Pro Stand** `meinhaustier:save:<id>`: vollständige `SaveData` (version 3;
  `money`, `buildings` inkl. `rotation`, `slots`, `roads`, `field` (Spielfeld-
  Grenzen), `timeOfDay`, `weather`, **`dogName`** (optional; fehlt → Zufallsname),
  `lastSaveTs`). v2-Stände (ohne `field`) werden weiter geladen (Startfeld-Default).
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
window.__game = { rig, sceneManager, sky, weather, grass, trees, ground, clouds, fireflies, get session() }
```

`rig` = `{ sceneManager, models, grass, trees, ground, clouds, fireflies, sky, weather,
coinBurst, audio }`. **State und World liegen jetzt unter der Session**:
`__game.session.state`, `__game.session.world`. Es muss zuerst ein Spiel laufen
(Startmenü!), sonst ist `session` `null`. Wetter zum Testen forcieren:
`__game.weather.setWeather("storm")` (Gras + Bäume wogen dann stärker, §9/§21).

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
`session.state.dogName`/`setDogName(n)` (Hundename),
`sky.timeOfDay`/`sky.speed` (Tageszeit steuern/anhalten),
`weather.setWeather(kind, immediate)`/`weather.windStrength` (Wetter/Wind),
`grass.cullables` (sichtbare/Gesamt-Instanzen prüfen),
`sceneManager.camera/controls`, `sceneManager.focusOn(pos)`/`clearFocus()` (Kamerafahrt),
`session.critters.selectDog(camPos)`/`deselectDog()`/`feedDog()`/`petDog()`/`playWithDog()`,
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
- **Baum-Materialien mattieren** (`metalness 0`, `roughness 1`): die GLB-Materialien
  sind glänzend und erzeugen sonst grelle Specular-Flecken am Laub (§21).
- **Hund-Aktions-Clips teilen die Idle-Instanz**: `clipAction` liefert pro Clip
  dieselbe `AnimationAction` → Loop-Modus **pro `switchTo()`** setzen, nie einmalig
  (sonst spielen geteilte Idle-Clips nur noch einmal statt zu loopen) — §19.
- **Wind ist wetterabhängig**: Gras **und** Bäume teilen `wind.ts` (`uWind` aus
  `weather.windStrength`). Amplituden sind Basiswerte × `uWind` (§9/§21).

---

## 19. Deko-Critter: Hund & Frösche

[Critters.ts](../src/scene/Critters.ts) (`CritterManager`, **pro Session** in
[GameSession.ts](../src/game/GameSession.ts) erzeugt/`update`d/`dispose`d). Liest
direkt `state.buildings` (Footprints) und `state.roads`; das Nav-Gitter wird beim
nächsten Wegfinden neu aufgebaut (immer aktuell, keine Subscription). Modelle aus
`DECOR` (§13): `shiba` (size 2.0), `frog` (0.45). Beide werfen Schatten (`castShadow`);
der **Hund ist anklickbar** (Menü/Aktionen, s.u.), die Frösche nicht (§11).

**Hund (`Dog`)** — ein Shiba, streift den Hof ab und ist **anklickbar**:
- Zustände `walk ↔ pause ↔ action`; Pause spielt Idle/Idle_2/Eating
  (Schnüffeln/Grasen), weite Ziele werden im `gallop` angesteuert. Ausrichtung
  dreht weich (`lerpAngle`). Clip-Auswahl über `makeAction` (exakt → `|name` →
  Teilstring, damit `idle` nicht `Idle_HitReact` trifft).
- **Pathfinding**: grobes Belegungs-Gitter (`AREA = 40`, `CELL = 2`) + **A\***
  (`planPath`, 8-Nachbarschaft). Gebäude-Footprints (gedreht) sind blockiert; Ställe
  haben eine **Tür-Lücke** an der offenen Vorderseite (lokales +z, `DOOR_HALF`),
  sodass der Hund hinein **und** wieder heraus findet. Zäune blockieren komplett.
  Bäume blockieren **nicht** (reine Deko).
- **Höhe**: im Gebäude-Footprint auf `FLOOR_TOP_Y`, sonst y=0 (weich interpoliert) →
  kein Einsinken im Stall.

**Hund anklicken — Auswahl, Menü, Aktionen (Shiba-Clips):**
- `CritterManager.dogPickables()` liefert die Hund-Meshes (mit `userData.kind="dog"`)
  in die Picker-Liste (§11). Linksklick → `onDog` ([GameSession](../src/game/GameSession.ts)):
  `critters.selectDog(camera.position)` + `sceneManager.focusOn(headPos)` +
  `dogMenu.openForDog()`.
- **Auswahl/Einfrieren**: `Dog.setSelected(true)` stoppt das Roaming (Idle), der Hund
  bleibt stehen, bis das Menü zugeht. `faceTowards(point)` dreht ihn sanft **zur
  Kamera** (man sieht sein Gesicht). `setSelected(false)` (Menü-`onClose`) lässt ihn
  weiterstreunen.
- **Kamerafahrt**: `SceneManager.focusOn(point, dist=6)` sichert die aktuelle Ansicht
  und fährt per Ease-Tween (0.6 s) nah heran (behält die horizontale Blickrichtung,
  leicht erhöht). `clearFocus()` fährt zurück. Während des Tweens ist `controls`
  deaktiviert; WASD/Pan pausieren.
- **Aktionen** (`DogMenu` → `feedDog/petDog/playWithDog` → `Dog.triggerAction`,
  einmalige Clips via `switchTo(action, force=true)`, `actionTimer ≤ 2.5 s`):
  *Füttern* = `Eating`, *Streicheln* = `Idle_2_HeadLow` (+ Herzen), *Spielen* =
  `Jump_ToIdle`. **Wichtig:** `clipAction` liefert pro Clip **dieselbe Instanz** wie
  die Idle-Pausen → der Loop-Modus (`LoopOnce`/`LoopRepeat`) wird **pro `switchTo()`**
  gesetzt, nicht einmalig im Konstruktor (sonst loopen geteilte Idle-Clips nicht mehr).
- **Herzen** (`HeartBurst` in `Critters.ts`, Vorbild `CoinBurst`): `petDog()` spawnt
  ~5 `Heart.glb`-Klone (`models.getHeart()`) über dem Kopf, die aufsteigen, mit einer
  Sinus-Hüllkurve einploppen/schrumpfen und nach ~1,1 s verschwinden. `update(dt)`
  läuft in `critters.update`.
- **Name**: `GameState.dogName` (Default `randomDogName()` aus
  [dognames.ts](../src/game/config/dognames.ts), §1), **persistent** im Save (§15).
  `DogMenu` zeigt ihn als Titel; „Name ändern" blendet eine Inline-Eingabe ein
  (`setDogName`, max 24 Zeichen; `keydown`-`stopPropagation`, damit WASD-Tippen nicht
  die Kamera bewegt). Das Menü positioniert sich **links der Mitte** (Hund ist durch
  den Fokus in der Bildmitte → wird nicht verdeckt).

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

---

## 21. Bäume (zufällig verteilt, „drüber bauen")

[Trees.ts](../src/scene/Trees.ts), einmalig per `await createTrees()` (Teil des
Rigs). **Spiegelt das Gras** (§9): instanziert + Belegungs-Culling, teilt sich den
Wind-Shader ([wind.ts](../src/scene/wind.ts)).

- **Modell**: `models/world/Trees.glb` enthält **5 Varianten** (`NormalTree_1..5`),
  je 2 Primitive mit den geteilten Materialien `NormalTree_Bark` / `NormalTree_Leaves`.
  `createTrees()` extrahiert pro Variante Stamm- und Kronen-Geometrie **getrennt** (auf
  die Welt-Matrix gebacken, gemeinsam normalisiert: Basis y=0, in x/z zentriert, auf
  `TREE_HEIGHT ≈ 5` skaliert).
- **Modell-Materialien sind glänzend** (`metalness 0.4`, `roughness 0.3`) → erzeugen
  grelle grüne Specular-„Glüh"-Flecken. Beim Laden auf **matt** gesetzt
  (`metalness 0`, `roughness 1`, kein Emissive). Nicht regressen lassen.
- **Verteilung** (`rebuildForField(field)`): Anzahl skaliert mit der Fläche
  (`BASE_COUNT ≈ 40` fürs Startfeld, gedeckelt `CAP ≈ 120`), Platzierung per *jittered
  grid* mit **seeded RNG** (`mulberry32`, Seed aus der Feldgröße) → **stabiles Layout**
  über Reloads; bei Feld-Erweiterung wächst die Fläche mit. Pro genutzter Variante zwei
  `InstancedMesh` (Bark + Leaves, **dieselben** Instanz-Matrizen). Wind (`applyWind`) nur
  auf das **Leaves**-Material (höhenmaskiert → Stamm steif, Krone wiegt; Phase aus
  `instanceMatrix` pro Baum). `update(tSec, windStrength)` setzt `uTime`/`uWind`.
- **„Man kann darüber bauen"** — `setOccupancy(isOccupied)` nutzt **dieselbe
  Compaction** wie das Gras (sichtbare Instanzen nach vorne packen, `count` senken):
  Bäume unter Gebäuden/Straßen werden ausgeblendet, **ohne** zu kollidieren/blockieren.
  Ausgelöst von [World.ts](../src/scene/World.ts) `cullGrass()` (cullt jetzt Gras **und**
  Bäume) bei jeder strukturellen Änderung. Belegungsradius = **Stamm** (`TRUNK_RADIUS`),
  nicht die Krone — Bäume verschwinden also erst, wenn der Stamm verbaut wird.
- **Feld-Sync**: [GameSession](../src/game/GameSession.ts) `applyField()` ruft
  `trees.rebuildForField(f)` (neben Gras/Boden/Wolken) und danach `world.cullGrass()`.

> Stellschrauben oben in der Datei: `TREE_HEIGHT`, `BASE_COUNT`/`CAP` (Dichte/Deckel),
> `LEAF_AMP` (Wind-Amplitude der Krone), `TRUNK_RADIUS` (Belegungs-Footprint).

---

## 22. Gluehwuermchen (Nacht-Atmosphaere)

[Fireflies.ts](../src/scene/Fireflies.ts), einmalig als Rig-System in
[main.ts](../src/main.ts) erzeugt. Es rendert alle Gluehwuermchen in **einem**
`THREE.Points`-Draw-Call mit `ShaderMaterial`:

- **Feld-Sync:** `GameSession.applyField()` ruft `fireflies.rebuildForField(f)`.
  Die Partikel werden deterministisch aus der Feldgroesse verteilt und wachsen bei
  Erweiterungen mit (`BASE_COUNT`/`CAP` oben in der Datei).
- **Tageszeit:** `update(dt,tSec, sky.daylight, weather.target, windStrength)`
  blendet erst in Daemmerung/Nacht ein; tagsueber sind die Punkte unsichtbar.
- **Wetter:** klar = volle Dichte, Nebel = gedimmt, Regen/Gewitter = fast weg.
  Starker Wind reduziert die Deckkraft, damit der Effekt bei Sturm nicht unruhig
  wirkt.
- **Animation:** Bewegung und Puls passieren im Vertex-/Fragment-Shader aus
  stabilen Attributen (`aPhase`, `aSize`, `aLift`, `aTone`) statt per CPU-Update
  pro Partikel.

## 23. Blender: Gebäude-Modelle prozedural erstellen (gelernt)

Eigene Low-Poly-Modelle (z.B. die **Windmühle**, `public/models/buildings/Windmill.glb`)
werden per Skript in Blender gebaut, damit sie zur Poly-Pizza-Optik der gekauften
Scheunen passen. Diese Sektion fasst den kompletten Workflow + alle Stolpersteine zusammen.

### 23.1 Verbindung zu Blender (BlenderMCP)
- Das **BlenderMCP-Addon** lauscht auf **`127.0.0.1:9876`** (JSON-über-TCP). Ist der
  MCP-Server nicht in der Session registriert, aber Blender läuft mit „Connect", kann
  man direkt mit dem Socket sprechen — Protokoll: `{"type":"execute_code","params":{"code":"…"}}`,
  Antwort `{"status":"success","result":{…}}`. Weitere Typen: `get_scene_info`,
  `get_object_info`, `get_viewport_screenshot`.
- Praktisch: ein kleiner Python-Client schickt `execute_code` mit dem Inhalt einer
  `.py`-Datei. Build/Inspect/Render/Export sind alles separate `execute_code`-Aufrufe.
- **Stil der vorhandenen GLBs vorab abkupfern:** GLB importieren, Material-`Base Color`,
  `roughness`/`metallic`, Bounding-Box und Mesh-Namen auslesen, wieder löschen.

### 23.2 Art-Stil & Palette (Scheunen-Look)
- **Flat low-poly:** alle Polygone `use_smooth = False`, Principled BSDF mit
  **roughness ≈ 0.9, metallic 0**. Keine Texturen — nur flache `Base Color`-Materialien.
- **Palette (lineare Werte, exakt wie Open/Big Barn — direkt als `default_value` setzen,
  glTF exportiert sie als `baseColorFactor`):**
  - `DarkRed` `(0.202, 0.043, 0.032)` · `LightRed` `(0.274, 0.056, 0.042)`
  - `White` `(0.640, 0.640, 0.640)` · `RoofBlack` `(0.079, 0.079, 0.079)`
  - `Wood` `(0.246, 0.144, 0.054)` · `Wood_Light` `(0.376, 0.243, 0.097)`
- **Wände wirken plankig** durch viele schmale, leicht erhabene **vertikale Leisten**
  (LightRed auf DarkRed) auf den Achteck-Facetten; **Dach** = gestapelte, leicht
  hervorstehende **Schindel-Ringe** (RoofBlack/RoofBlack2) statt glattem Kegel.
- **Weiße Zierbänder** (Sockel/Mitte/oben) und **weiße Fensterrahmen** sind Pflicht-
  Stilmerkmale (matchen die Scheunen).

### 23.3 Koordinaten & glTF-Export
- Blender ist **Z-up**, glTF **Y-up**. Konvertierung beim Export: `three.X=Blender.X`,
  `three.Y=Blender.Z`, `three.Z=−Blender.Y`.
- **Front (offene/Tür-Seite) im Modell nach Blender −Y bauen** → zeigt im Spiel nach
  **+Z** (Slot-Front, siehe §3); dann ist meist keine `modelRotation` nötig.
- Türen schwingen um **Blender-Z** (= vertikale three-Y-Achse). Flügel-Nabe (Windmühle)
  rotiert um **Blender-Y**.
- Export: `bpy.ops.export_scene.gltf(export_format='GLB', export_yup=True,
  export_apply=False, export_animations=True, export_animation_mode='ACTIONS',
  export_force_sampling=True)`. Preview-Kamera/Licht vorher löschen.

### 23.4 Größe & Skalierung (WICHTIG — häufige Verwirrung)
`normalizeBuilding` (§13) skaliert **uniform** mit `min(width/sizeX, depth/sizeZ)`, wobei
`sizeX/sizeZ` die **Bounding-Box** des Modells sind. Folgen:
- Eine **weit auskragende Komponente bestimmt den Maßstab** (bei der Windmühle die
  Flügelspanne in X). Dann bleibt der Turm relativ klein/niedrig, egal wie groß `width`.
- **In-Game-Höhe ≈ `blenderHöhe · width / sizeX`** (wenn `width` die Skalierung bestimmt),
  **Boden-Durchmesser ≈ `modellBasis · width / sizeX`**.
- Zum **Vergrößern/Höher-/Breiter-Machen** also **die Modell-Proportionen** ändern
  (Turm dicker/höher), **nicht nur** `width/depth` erhöhen — sonst wachsen nur die Flügel.
- **Referenz-Endmaße** (im Browser mit gleicher Formel gemessen):
  Open Barn ~7.67 hoch / 10×10 · Big Barn ~13.43 / 14×14 · **Windmühle ~15.36 / 11×11**
  (dicker Turm Basis-Ø ~8.5; höchstes Gebäude).

### 23.5 Gebäude-Animationen (Mixer pro Instanz)
Pipeline: `AnimalModels.load()` speichert `gltf.animations` je Gebäude-Id
(`getBuildingClips`). [Building.ts](../src/scene/Building.ts) `setupAnimations()` baut
**pro Instanz** einen `THREE.AnimationMixer`; [World.ts](../src/scene/World.ts) hält die
Mixer je Gebäude-Index und ruft `mixer.update(dt)` in `World.update`.
- **Clip-Namens-Konvention:** Clips mit **„door"** im Namen → einmalige, geklemmte
  Aktion (`LoopOnce` + `clampWhenFinished`), per Klick vor-/rückwärts (`toggleDoors`,
  ausgelöst über `onBuildingLeft` in `GameSession`). Alle anderen Clips → `LoopRepeat`
  (Flügel, Flagge …). **Neue Animationen funktionieren automatisch**, sobald das GLB
  Clips enthält — kein weiterer Code nötig.
- **Pro Objekt eine eigene Action** → der `ACTIONS`-Export erzeugt **einen Clip pro
  Objekt** (z.B. `DoorOpenL`/`DoorOpenR`, `SailSpin`, `FlagWave`). Tracks zeigen per
  **Objektname** ins GLB; `clone(true)` erhält die Namen → Mixer am Klon funktioniert.
- **Türen:** Objekt-Ursprung **am Scharnier** (lokale x=0-Kante). Bei verjüngten Wänden
  die Tür **um die Wandneigung kippen** (konstante `rotation_euler.x`) **und in den
  Wand-Tunnel zurückversetzen**, sonst steht sie heraus oder zeigt Sichtlücken. Die
  konstante Kippung in **alle Euler-Keyframes** mit-keyframen (sonst geht sie beim
  Export/Abspielen verloren).
- **Blender 4.4+ Action-API:** `action.fcurves` gibt es nicht mehr — F-Curves liegen
  unter `action.layers[*].strips[*].channelbag(obj.animation_data.action_slot).fcurves`.
  `obj.keyframe_insert(...)` funktioniert weiterhin versions-übergreifend.

### 23.6 Hohle Innenräume & Öffnungen (Boolean)
- Turm **hohl**: innere Kavität als kleineren Kegel **subtrahieren**; Türöffnung als
  extrudiertes **Bogen-Profil** durch Wand **und** Sockelring schneiden (Boolean an
  beide Objekte). Boolean-Solver **`EXACT`**.
- **Modifier anwenden kontext-sicher:** statt `bpy.ops.object.modifier_apply` das
  ausgewertete Mesh backen — `obj.data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))`,
  dann `obj.modifiers.clear()`. (Ops brauchen oft den richtigen UI-Kontext.)
- Innenraum sichtbar machen: Holzboden + ein paar Props (Säcke, Mühlstein) hinter der Tür.

### 23.7 Fenster-Nacht-Leuchten
- Glasscheibe bekommt ein Material, dessen **Name „glow" enthält** (`WindowGlow`), mit
  **Emission** (Principled „Emission Color/Strength" → glTF `emissiveFactor`, z.B. warmes
  `[1, 0.72, 0.30]`).
- [Building.ts](../src/scene/Building.ts) sammelt alle `*/glow/*`-Materialien
  (`emissiveIntensity = 0`); [World.ts](../src/scene/World.ts) `update(dt,tSec,wind,daylight)`
  setzt `emissiveIntensity = clamp((0.5 − daylight)/0.5, 0, 1) · 1.5`;
  [GameSession.ts](../src/game/GameSession.ts) reicht `sky.daylight` durch (1=Tag, 0=Nacht).
  → Tag aus, Dämmerung/Nacht leuchtend. **Beliebig viele** Glow-Meshes werden generisch
  erfasst (kein Code-Change bei mehr Fenstern).

### 23.8 Stolpersteine
1. **Kind-Objekt-Doppel-Offset:** Einem Kind **nicht** zusätzlich eine Welt-`location`
   geben, wenn das Eltern-Objekt schon dort sitzt — Kinder bekommen lokal `(0,0,0)`
   (Geometrie ist bereits im Eltern-Frame). Sonst schwebt das Teil weg.
2. **Verifikation immer aus mehreren Winkeln** rendern (Front/3-4/Seite/Rück/offen +
   Tür-Nahaufnahme) und zusätzlich das GLB prüfen: JSON-Chunk parsen (Clips/Knoten/
   Materialien) **und** im Browser via `GLTFLoader` laden (Clips, `emissive`, finale
   Größe über die `normalizeBuilding`-Formel).
3. Größen-/Höhen-„zu klein"-Reklamationen kommen fast immer aus §23.4 (Auskragung
   bestimmt den Maßstab) — Modell-Proportion ändern, nicht nur `width`.
