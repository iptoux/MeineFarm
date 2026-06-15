# MeinHaustier — Entwickler-Dokumentation

3D-Tierfarm-Tycoon mit **Three.js + TypeScript + Vite**. Diese Datei ist die
zentrale Referenz für die Weiterentwicklung: Architektur, Datenmodelle,
Abmessungen, Modell-/Animations-Konventionen und der Verifikations-Workflow.

> Kurz-Setup: `pnpm install` → `pnpm dev` (öffnet `http://localhost:5173/`),
> `pnpm build` (Typecheck + Bundle). Paketmanager ist **pnpm** (per `devEngines`
> erzwungen); `esbuild`-Build ist in `pnpm-workspace.yaml` freigegeben.

---

## 1. Projektstruktur

```
src/
  main.ts                 # Bootstrap (async init): Szene, State, Welt, UI, Loop
  game/
    Game.ts               # rAF-Loop → onTick(dt,tSec) + render
    GameState.ts          # money, buildings[], slots[], roads[] + Mutatoren + Events
    economy.ts            # Produktions-/Boost-/Offline-Berechnung (rein funktional)
    config/
      animals.ts          # Tier-Katalog (AnimalDef[])
      buildings.ts        # Gebäude-Katalog (BuildingDef[])
      roads.ts            # Straßen-Konstanten + Gitter-Helfer
      slots.ts            # Startwerte + Slot-Freischalt-Kostenkurve
  scene/
    SceneManager.ts       # Renderer, Kamera, OrbitControls, Licht, WASD, Zoom-Fade
    Ground.ts             # grüne Bodenfläche (y=0)
    Building.ts           # createBuilding (Primitive) + createModelBuilding (glTF)
    AnimalModels.ts       # Lädt/normalisiert alle glTF-Modelle (Tiere, Gebäude, UI)
    SlotEntity.ts         # Ein Slot: Marker | Tier (+Animation) | Münze
    World.ts              # Baut Gebäude+Slots+Straßen aus dem State; Produktions-Tick
    Picker.ts             # Raycaster: Links-/Rechtsklick-Routing, Klick-Durchlass
    CoinBurst.ts          # 3D-Münz-Funken beim Ernten
    PlacementController.ts # Gebäude bauen/bewegen (Silhouette)
    RoadController.ts     # Straßen-Bau (Raster, Toggle)
    IconRenderer.ts       # Rendert ein Modell einmalig zu einer PNG-Data-URL (HUD-Icon)
  ui/
    Hud.ts, SlotMenu.ts, BuildMenu.ts, BuildingMenu.ts, AnimalMenu.ts, Effects.ts
    styles.css
  storage/SaveManager.ts  # localStorage v2 + Autosave + Offline-Gutschrift
  audio/AudioManager.ts   # Musik + SFX (Mute, Autoplay-Unlock)
public/
  models/animals/*.glb    # Tier-Modelle (Poly Pizza)
  models/buildings/*.glb  # Gebäude-Modelle
  models/ui/*.glb         # Coin.glb, Coin Piles.glb
  sounds/*.wav|*.mp3      # SFX + Musik (Mixkit, siehe CREDITS.md)
```

**Datenfluss:** `GameState` ist reine Daten + `onChange`-Events. `World` liest den
State und baut die Szene; der Game-Loop ([Game.ts](../src/game/Game.ts)) ruft
`world.update(dt,tSec)` (Produktion + Animationen) und rendert. UI-Komponenten
hängen sich über `state.onChange()` ein. Strukturänderungen (Gebäude bauen/
bewegen/drehen/entfernen) lösen `world.rebuild()` aus.

---

## 2. Koordinaten & Abmessungen

- **Boden** liegt bei `y = 0` (grüne Ebene, [Ground.ts](../src/scene/Ground.ts)).
- **Primitive-Gebäude**: Bodenoberkante `FLOOR_TOP_Y = 0.3` ([Building.ts](../src/scene/Building.ts)).
- **Modell-Gebäude**: werden mit der **Unterkante auf y=0** platziert; der
  begehbare Innenboden liegt höher (modellabhängig, z.B. Open Barn ≈ 0.33,
  Big Barn ≈ 0.44). Slot-Höhen werden **per Raycast** auf diesen Boden gesetzt
  (siehe §5).
- **Tier-Größe**: alle Tiere werden auf `ANIMAL_SIZE = 1.4` normalisiert (längste
  Bounding-Box-Kante), Füße auf Slot-Boden.
- **Münze**: `COIN_SIZE = 0.7`; schwebt bei lokal `bubbleBaseY = 1.7` über dem Slot.
- **Straßen-Kachel**: `ROAD_TILE = 3` (Rasterweite).
- **Kamera**: `PerspectiveCamera` + `OrbitControls`, Start `(9,6,14)` → Ziel
  `(0,1.2,0)`, Zoom-Distanz 6–40, Polarwinkel begrenzt. **WASD** pant Kamera+Ziel.

---

## 3. Tiere

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

**Aktueller Katalog:**

| id | Name | cost | income | intervalMs | Modell | gerigt? | Animation |
|----|------|------|--------|------------|--------|---------|-----------|
| `huhn` | Huhn | 10 | 2 | 4000 | Chicken.glb | nein | – (statisch) |
| `schwein` | Schwein | 75 | 12 | 6000 | Pig.glb | ja | Idle |
| `schaf` | Schaf | 200 | 32 | 7000 | Sheep.glb | ja | Idle |
| `kuh` | Kuh | 400 | 60 | 9000 | Cow.glb | ja | Idle |
| `pferd` | Pferd | 1500 | 220 | 12000 | Horse.glb | ja | Idle ↔ Eating |

**Animation** ([SlotEntity.ts](../src/scene/SlotEntity.ts)): generisch. Hat ein
Modell Clips, wird ein `AnimationMixer` erstellt und der **Idle**-Clip gespielt.
Existiert zusätzlich ein **Eat**-Clip, wird im Zufallswechsel zwischen Idle (6–13 s)
und Eat (3–6 s) per Crossfade umgeschaltet. Clip-Auswahl:
- Idle: exakt `idle`, sonst `…|idle`, sonst best-effort (ohne „react"/„jump").
- Eat: enthält `eat`, aber **nicht** `death` (sonst matcht „Death" fälschlich).
Tiere stehen **flach auf dem Boden** (keine Wippanimation).

> Verfügbare, noch ungenutzte Modelle: `Cat.glb` (nicht gerigt).

---

## 4. Gebäude

Definiert in [src/game/config/buildings.ts](../src/game/config/buildings.ts) als
`BuildingDef`.

| Feld | Bedeutung |
|------|-----------|
| `id`, `name`, `cost` | Identität & Baukosten |
| `slotCount` | Anzahl Slots (Raster 4 Spalten × `ceil(N/4)` Reihen) |
| `width`, `depth` | Ziel-Grundfläche → Modell-Skalierung, Slot-Raster, Platzierungs-Silhouette, Overlap-Check |
| `roofColor` | Fallback-Dachfarbe (nur Primitive) |
| `model?` | Pfad zum glTF; wenn gesetzt → Modell statt Primitive |
| `modelRotation?` | Basis-Drehung (Radiant), um die offene/Vorderseite nach **+z** zu drehen |
| `roofMaterials?` | Material-Namen, die als „Dach" beim Nah-Zoom ausgeblendet werden |
| `fadeAll?` | beim Nah-Zoom das **ganze** Gebäude ausblenden (für geschlossene Gebäude) |
| `slotInset?` | Rand-Abstand des Slot-Rasters (x & z); größer = Slots weiter innen (z.B. bei engen Modell-Innenräumen) |

**Aktueller Katalog:**

| id | Name | cost | slots | width×depth | Modell | Fade |
|----|------|------|-------|-------------|--------|------|
| `stall` | Stall | 120 | 8 | 10×10 | Open Barn.glb (offen) | nur Dach (`RoofBlack`) |
| `scheune` | Große Scheune | 300 | 16 | 14×14 | Big Barn.glb (geschlossen) | ganzes Gebäude (`fadeAll`) |

**Orientierung:** Die offene/Vorderseite des Modells sollte nach **+z** zeigen
(Richtung Standard-Kamera), damit die vordere Slot-Reihe sichtbar ist. Stimmt das
Modell nicht, `modelRotation` setzen (z.B. `Math.PI`). Beim Drehen über das
Gebäude-Menü wird sowohl das Modell als auch das Slot-Raster rotiert.

**Hinweis Material-Klassifikation:** Bei beiden gelieferten Barns sind die roten
Flächen (`DarkRed`/`LightRed`) **Wände**, das **Dach** ist `RoofBlack`. Für
roof-only-Fade also nur Dach-Materialien in `roofMaterials` listen.

---

## 5. Slots

- **Flaches Array** `GameState.slots`; Gebäude `b` besitzt Indizes
  `[slotBase(b) .. slotBase(b)+slotCount)`. `slotBase` summiert die `slotCount`
  vorheriger Gebäude (variable Slot-Zahlen pro Gebäudetyp).
- **Zustände** ([SlotEntity.ts](../src/scene/SlotEntity.ts)): gesperrt (roter
  Marker), leer (grüner Marker), besetzt (Tier + Münze).
- **Raster** ([Building.ts](../src/scene/Building.ts) `computeSlotPositions`):
  4 Spalten, Reihen = `ceil(slotCount/4)`, Inset von den Rändern, um die
  Hochachse gedreht, vordere Reihe (offene Seite) zuerst.
- **Boden-Snap (Modell-Gebäude):** Da Modelle einen erhöhten Innenboden haben,
  wird pro Slot von oben ein **Raycast** gemacht und der **unterste Treffer**
  (= Erdgeschoss-Boden) als Slot-Höhe genommen (+0.02). So versinken Marker/Tiere
  nicht. Ohne Treffer → Fallback `FLOOR_TOP_Y`.
- **Freischalten:** Kosten `slotUnlockCost(unlockedCount)` = `15 · 2.2^(n-1)`
  ([slots.ts](../src/game/config/slots.ts)), global gezählt.

---

## 6. Ökonomie & Produktion

[economy.ts](../src/game/economy.ts) (rein funktional) + Tick in [World.ts](../src/scene/World.ts):

- `normalRatePerSec = income / (intervalMs/1000)`.
- Münze füllt sich bis `income` (= „voll"). Danach **online** Weiterproduktion mit
  `boostFactor` (Stapel wächst sichtbar weiter; Münze wird größer/goldener mit
  pulsierendem Emissive).
- **Ernten** (Münze anklicken): ganzer Stapel → Geld, Münze zurück auf 0/Normal.
- **Offline** ([SaveManager.ts](../src/storage/SaveManager.ts)): volle abwesende
  Zeit, **immer Normaltempo, ohne Cap** (kein Offline-Boost).
- **Start:** `STARTING_MONEY = 15`, `STARTING_UNLOCKED = 1`, Slot 0 = Gratis-Huhn.
- **Verkaufen** (Tier anklicken → Menü): 50 % Rückerstattung, Slot bleibt frei.

---

## 7. Straßen (dekorativ)

[roads.ts](../src/game/config/roads.ts) + [RoadController.ts](../src/scene/RoadController.ts):
Raster-Kacheln (`ROAD_TILE = 3`). **Typen** in `ROADS` (`RoadDef {id,name,cost,color}`),
aktuell `strasse` (grau, 5 €) und `feldweg` (braun, 2 €) — neuer Typ = ein Eintrag.
Bau-Modus (`roadController.begin(typeId)`) bleibt aktiv; Linksklick auf leere Zelle
= setzen, auf belegte = entfernen; Rechtsklick/ESC beendet. Rein optisch. State:
`GameState.roads: {gx,gz,type}[]`. **Rendering** ([World.ts](../src/scene/World.ts)
`rebuildRoads`): Kacheln in **voller** `ROAD_TILE`-Größe (kein Spalt) → benachbarte
Kacheln stoßen lückenlos aneinander und wirken als durchgehende Straße; Material
pro Typ (gecacht). Das Bau-Menü listet alle `BUILDINGS` + alle `ROADS`.

---

## 8. Interaktion (Picker)

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
so kann man durch ein ausgeblendetes (gezoomtes) Dach hindurch auf Tiere/Münzen
klicken.

---

## 9. Zoom-Fade

[SceneManager.ts](../src/scene/SceneManager.ts) `setFadeOnZoom`/`updateFade`: Je
nach Kamera-Abstand werden registrierte Fade-Meshes ein-/ausgeblendet —
Distanz ≥ 14 → Opazität 1.0 (deckend), ≤ 8 → 0.12 (durchsichtig), dazwischen
linear. `depthWrite` wird ab Opazität > 0.95 aktiviert. Die Fade-Meshes liefert
`World.roofMeshes` (Dach bzw. ganzes Gebäude je `fadeAll`).

---

## 10. glTF-Modelle — Konventionen (WICHTIG)

Geladen & normalisiert in [AnimalModels.ts](../src/scene/AnimalModels.ts) (Name
historisch; lädt Tiere **und** Gebäude **und** UI-Münzen). Alles wird in `load()`
**vor** dem Welt-Aufbau geladen (`await models.load()` in [main.ts](../src/main.ts)).

- **Normalisierung Tiere:** uniform auf `ANIMAL_SIZE` (längste Kante), in x/z
  zentriert, Füße auf y=0.
- **Normalisierung Gebäude:** uniform `min(width/sizeX, depth/sizeZ)`, in x/z
  zentriert, Unterkante auf y=0, optionale `modelRotation`. Alle Materialien
  `transparent: true` (Opazität bleibt 1 → wirkt deckend, ermöglicht Fade).
- **Klonen:**
  - **Gerigte (skinned) Modelle** (Skelett/Animationen) **müssen** mit
    `SkeletonUtils.clone()` geklont werden — `Object3D.clone()` bindet das Skelett
    nicht neu → Klon erscheint an falscher Position. Prüfen: GLB enthält
    `skins`/`joints`.
  - Münze/Gebäude: `clone(true)` + **Materialien pro Instanz klonen** (damit
    Einfärben/Fade je Instanz unabhängig wirkt).
- **Build-Target:** kein Top-Level-`await` (es2020). Async-Init in einer Funktion
  kapseln (`init()` in main.ts).

**Modell prüfen (GLB-Header lesen):**
```bash
python - <<'PY'
import struct, json
f="public/models/animals/Horse.glb"
d=open(f,"rb").read(); off=12; ln=struct.unpack_from("<I",d,off)[0]; off+=8
j=json.loads(d[off:off+ln])
print("skinned:", "skins" in j, "| anims:", [a.get("name") for a in j.get("animations",[]) if "|" not in (a.get("name") or "")])
print("materials:", [m["name"] for m in j.get("materials",[])])
print("meshes/prims:", [(m["name"], len(m["primitives"])) for m in j.get("meshes",[])])
PY
```

---

## 11. Audio

[AudioManager.ts](../src/audio/AudioManager.ts): Musik-Loop + SFX. Autoplay startet
erst nach erster Nutzergeste (Browser-Policy). Mute-Button im HUD. SFX:
`collect`, `unlock`, `purchase`, `build` (+ leiser `playRoad`). Quellen/Lizenz:
[public/sounds/CREDITS.md](../public/sounds/CREDITS.md) (Mixkit Free License).

---

## 12. Speichern

[SaveManager.ts](../src/storage/SaveManager.ts): localStorage-Key
`meinhaustier:save:v2`. Speichert `money`, `buildings` (inkl. `rotation`),
`slots`, `roads`, `lastSaveTs`. Autosave alle 5 s + `beforeunload`. Beim Laden
Offline-Gutschrift. Format-Änderungen → Versions-Key erhöhen.

---

## 13. Verifikations-Workflow (Playwright)

Es gibt **keinen** UI-Testrunner; verifiziert wird per Headless-Browser-Screenshot
und einem **Dev-Debug-Hook**. In [main.ts](../src/main.ts) wird unter
`import.meta.env.DEV` `window.__game = { state, world, sceneManager, placement,
roadController, audio, models }` gesetzt (nicht im Prod-Build).

Muster (Dev-Server läuft auf :5173):
```js
// scripts/_verify.mjs  (Wegwerf-Skript, nach Gebrauch löschen)
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1140, height: 660 } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await p.waitForTimeout(1800);                       // Modelle laden lassen
await p.evaluate(() => {                             // Zustand setzen
  const g = window.__game; g.state.money = 5000; g.state.emit();
  g.state.unlockSlot(1); g.state.buyAnimal(1, "schwein");
});
await p.screenshot({ path: "scripts/shot.png" });
await b.close();
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
```
Ablauf: `pnpm dev` im Hintergrund starten → Skript mit `node` ausführen →
Screenshot per Bildbetrachter prüfen → Skript & PNG wieder löschen.

Nützliche Hooks: `world.bubbleWorldPos(i)` (Welt-Pos einer Münze, für
Screen-Projektion zum Klicken), `world.animalClip(i)` (laufender Clip),
`state.slotBase(b)`, `sceneManager.camera/controls` (Kamera für Screenshots setzen).

---

## 14. Neues Tier / Gebäude hinzufügen — Checkliste

**Tier:**
1. GLB nach `public/models/animals/` legen; mit dem Python-Snippet (§10) prüfen
   (skinned? Idle/Eat-Clipnamen?).
2. Eintrag in [animals.ts](../src/game/config/animals.ts) (`id,name,cost,income,intervalMs,boostFactor,model,color`).
3. Läuft automatisch: Laden, Normalisieren, korrektes Klonen, Idle/Eat-Animation,
   Kauf im Slot-Menü.
4. Verifizieren (§13): Modell geladen, sichtbar im Slot, Animation, kauf-/verkaufbar.

**Gebäude:**
1. GLB nach `public/models/buildings/`; prüfen (offen/geschlossen? Dach-Material?).
2. Eintrag in [buildings.ts](../src/game/config/buildings.ts): `model`, `width/depth`
   (für gewünschte Slot-Zahl), `fadeAll` (geschlossen) **oder** `roofMaterials`
   (offen, nur Dach), ggf. `modelRotation`.
3. Verifizieren (§13): Skalierung/Orientierung, Slots **im** Gebäude auf dem Boden,
   Zoom-Fade korrekt, Rechtsklick-Menü, Drehen rotiert Modell+Slots.

---

## 15. Bekannte Stolpersteine
- **Skinned-Clone**: immer `SkeletonUtils.clone()` (sonst Fehlplatzierung).
- **Modell-Innenboden**: Slots per Raycast auf den Boden snappen (§5).
- **Material-Namen** modellabhängig — Dach-Erkennung (`roofMaterials`) je Modell prüfen.
- **Top-Level-await** vermeiden (Build-Target es2020) → `init()`-Kapselung.
- **pnpm** nutzen; `esbuild`-Build-Freigabe steht in `pnpm-workspace.yaml`.
