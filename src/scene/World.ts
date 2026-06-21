import * as THREE from "three";
import type { GameState } from "../game/GameState";
import { POND_RADIUS } from "../game/GameState";
import { getAnimal } from "../game/config/animals";
import { getBuilding } from "../game/config/buildings";
import { ROAD_TILE, getRoad, roadCellCenter, worldToCell } from "../game/config/roads";
import { tickPending } from "../game/economy";
import { NEUTRAL_WEATHER_FACTOR, WEATHER_GROWTH_FACTOR } from "../game/config/fields";
import type { WeatherKind } from "./Weather";
import { createBuilding, createModelBuilding } from "./Building";
import { SlotEntity, type PickData } from "./SlotEntity";
import { FieldEntity } from "./FieldEntity";
import type { AnimalModels } from "./AnimalModels";
import type { Grass } from "./Grass";
import type { Trees } from "./Trees";

/** Kleiner Zusatzabstand zur Gebäudewand (der Büschel-Radius wird separat addiert). */
const GRASS_BUILD_MARGIN = 0.1;
/** Höhe, auf der Teiche liegen (knapp über dem Boden, gegen Z-Fighting). */
const POND_Y = 0.01;
/** Radius der Wasserfläche im Steinring (etwas kleiner als der Footprint). */
const WATER_RADIUS = POND_RADIUS - 2.0;
/** Höhe der Wasseroberfläche im Becken. */
const WATER_Y = 0.18;

/**
 * Verwaltet die sichtbare Welt: Gebäude-Meshes + ihre Slot-Entities und die
 * dekorativen Straßen-Kacheln, abgeleitet aus dem GameState. Slot-Entities liegen
 * flach (globaler Index via `state.slotBase` + lokal). Strukturelle Änderungen
 * (bauen, bewegen, drehen, entfernen) lösen `rebuild()` aus.
 */
export class World {
  private entities: SlotEntity[] = [];
  /** Feld-Entities, indexiert nach Gebäude-Index (nur für def.isField). */
  private fieldEntities = new Map<number, FieldEntity>();
  private buildingGroups: THREE.Group[] = [];
  private buildingMeshes: THREE.Mesh[] = [];
  /** Animations-Mixer je Gebäude-Index (Windmühlen-Flügel/Türen). */
  private buildingMixers: (THREE.AnimationMixer | null)[] = [];
  /** Tür-Umschalter je Gebäude-Index (nur Gebäude mit „Door"-Clips). */
  private doorToggles = new Map<number, () => void>();
  /** Fenster-/Glow-Materialien aller Gebäude (Leuchten nachts). */
  private glowMaterials: THREE.MeshStandardMaterial[] = [];
  private roadGroup = new THREE.Group();
  private roadGeo = new THREE.BoxGeometry(ROAD_TILE, 0.08, ROAD_TILE);
  private roadMats = new Map<string, THREE.MeshStandardMaterial>();
  private pondGroup = new THREE.Group();
  /** Geteilte Animations-Uniforms der Wasserflächen (uTime + Windstärke). */
  private waterUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
  private waterGeo = makeWaterGeometry(WATER_RADIUS);
  private waterMat = makeWaterMaterial(this.waterUniforms);
  /** Dach-Platten zum Ausblenden beim Zoom — Array-Referenz bleibt stabil. */
  readonly roofMeshes: THREE.Mesh[] = [];

  constructor(
    private scene: THREE.Scene,
    private state: GameState,
    private models: AnimalModels,
    private grass?: Grass,
    private trees?: Trees,
  ) {
    this.scene.add(this.roadGroup);
    this.scene.add(this.pondGroup);
    this.rebuild();
  }

  /** Verwirft alle Visuals und baut Gebäude + Straßen neu aus dem Zustand auf. */
  rebuild(): void {
    for (const g of this.buildingGroups) this.scene.remove(g);
    for (const e of this.entities) this.scene.remove(e.group);
    for (const fe of this.fieldEntities.values()) {
      this.scene.remove(fe.group);
      fe.dispose();
    }
    this.entities = [];
    this.fieldEntities.clear();
    this.buildingGroups = [];
    this.buildingMeshes = [];
    this.roofMeshes.length = 0; // gleiche Referenz behalten (Zoom-Fade)
    this.buildingMixers = [];
    this.doorToggles.clear();
    this.glowMaterials = [];

    for (let b = 0; b < this.state.buildings.length; b++) this.addBuildingVisuals(b);
    this.rebuildRoads();
    this.rebuildPonds();
  }

  /**
   * Baut die komplette Welt aus der Szene ab und gibt eigene GPU-Ressourcen frei.
   * Boden, Gras, Licht und Himmel (Teil des persistenten Rigs) bleiben erhalten.
   */
  dispose(): void {
    for (const g of this.buildingGroups) this.scene.remove(g);
    for (const e of this.entities) this.scene.remove(e.group);
    for (const fe of this.fieldEntities.values()) {
      this.scene.remove(fe.group);
      fe.dispose();
    }
    this.entities = [];
    this.fieldEntities.clear();
    this.buildingGroups = [];
    this.buildingMeshes = [];
    this.roofMeshes.length = 0;
    this.buildingMixers = [];
    this.doorToggles.clear();
    this.glowMaterials = [];
    this.scene.remove(this.roadGroup);
    this.roadGroup.clear();
    this.roadGeo.dispose();
    for (const mat of this.roadMats.values()) mat.dispose();
    this.roadMats.clear();
    this.scene.remove(this.pondGroup);
    this.pondGroup.clear();
    this.waterGeo.dispose();
    this.waterMat.dispose();
  }

  /** Erzeugt Mesh + Slot-Entities für das Gebäude mit dem gegebenen Index. */
  addBuildingVisuals(buildingIndex: number): void {
    const placed = this.state.buildings[buildingIndex];
    const def = getBuilding(placed.defId);
    if (!def) return;

    // Felder: eigene Entity mit Wachstums-Modell + Kürbis-Blase (keine Slots).
    if (def.isField) {
      const fe = new FieldEntity(buildingIndex, { x: placed.x, z: placed.z }, placed.rotation, this.models);
      this.scene.add(fe.group);
      this.fieldEntities.set(buildingIndex, fe);
      // Anfangszustand sofort darstellen.
      if (placed.field) fe.update(placed.field, 0, 0);
      this.cullGrass();
      return;
    }

    const pos = { x: placed.x, z: placed.z };
    const model = this.models.getBuildingModel(def.id);
    const building = model
      ? createModelBuilding(def, pos, placed.rotation, model, this.models.getBuildingClips(def.id))
      : createBuilding(def, pos, placed.rotation);
    this.scene.add(building.group);
    this.buildingGroups[buildingIndex] = building.group;
    this.buildingMixers[buildingIndex] = building.mixer ?? null;
    if (building.toggleDoors) this.doorToggles.set(buildingIndex, building.toggleDoors);
    if (building.glowMaterials) this.glowMaterials.push(...building.glowMaterials);
    this.roofMeshes.push(...building.roofMeshes);

    building.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData = { kind: "building", buildingIndex } satisfies PickData;
        this.buildingMeshes.push(o);
      }
    });

    const base = this.state.slotBase(buildingIndex);
    building.slotPositions.forEach((pos, local) => {
      const entity = new SlotEntity(base + local, pos, this.models);
      this.scene.add(entity.group);
      this.entities[base + local] = entity;
    });

    this.cullGrass();
  }

  /** Baut die Straßen-Kacheln neu auf (bei jeder Änderung). */
  rebuildRoads(): void {
    this.roadGroup.clear();
    // Volle Kachelgröße (kein Spalt) → benachbarte Kacheln stoßen lückenlos
    // aneinander und wirken wie eine durchgehende Straße.
    for (const r of this.state.roads) {
      const tile = new THREE.Mesh(this.roadGeo, this.roadMaterial(r.type));
      const c = roadCellCenter(r.gx, r.gz);
      tile.position.set(c.x, 0.04, c.z);
      tile.receiveShadow = true;
      this.roadGroup.add(tile);
    }
    this.cullGrass();
  }

  /** Baut die Teich-Modelle aus dem Zustand neu auf (bei Erweiterung/Neuaufbau). */
  rebuildPonds(): void {
    this.pondGroup.clear();
    for (const p of this.state.ponds) {
      const model = this.models.getPond();
      if (model) {
        model.position.set(p.x, POND_Y, p.z);
        this.pondGroup.add(model);
      }
      // Animierte Wasserfläche im Becken (geteilte Geometrie + Material).
      const water = new THREE.Mesh(this.waterGeo, this.waterMat);
      water.position.set(p.x, WATER_Y, p.z);
      water.renderOrder = 1;
      this.pondGroup.add(water);
    }
    this.cullGrass();
  }

  /** Blendet Gras + Bäume unter Gebäuden/Straßen aus (und anderswo wieder ein). */
  cullGrass(): void {
    const occ = (x: number, z: number, r: number): boolean => this.isOccupied(x, z, r);
    this.grass?.setOccupancy(occ);
    this.trees?.setOccupancy(occ);
  }

  /**
   * Überlappt ein Büschel (Mittelpunkt x/z, Radius r) eine Straßen-Kachel oder
   * Gebäude-Grundfläche? Der Radius wird berücksichtigt, damit breite Büschel
   * nicht von außen ins Gebäude/auf die Straße ragen.
   */
  private isOccupied(x: number, z: number, r: number): boolean {
    // Straßen: alle Rasterzellen prüfen, die der Büschel-Umkreis berührt.
    const gxMin = worldToCell(x - r, z).gx;
    const gxMax = worldToCell(x + r, z).gx;
    const gzMin = worldToCell(x, z - r).gz;
    const gzMax = worldToCell(x, z + r).gz;
    for (let gx = gxMin; gx <= gxMax; gx++) {
      for (let gz = gzMin; gz <= gzMax; gz++) {
        if (this.state.hasRoad(gx, gz)) return true;
      }
    }

    for (const b of this.state.buildings) {
      const def = getBuilding(b.defId);
      if (!def) continue;
      // Drehung um 90°/270° tauscht Breite und Tiefe.
      const rotated = Math.abs(Math.sin(b.rotation)) > 0.5;
      const hw = (rotated ? def.depth : def.width) / 2 + GRASS_BUILD_MARGIN + r;
      const hd = (rotated ? def.width : def.depth) / 2 + GRASS_BUILD_MARGIN + r;
      if (Math.abs(x - b.x) <= hw && Math.abs(z - b.z) <= hd) return true;
    }

    // Teiche (kreisförmig): kein Gras/Baum im Wasser.
    for (const p of this.state.ponds) {
      if (Math.hypot(x - p.x, z - p.z) <= POND_RADIUS + r) return true;
    }
    return false;
  }

  /** Material pro Straßentyp (gecacht). */
  private roadMaterial(type: string): THREE.MeshStandardMaterial {
    let mat = this.roadMats.get(type);
    if (!mat) {
      const color = getRoad(type)?.color ?? 0x55524d;
      mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
      this.roadMats.set(type, mat);
    }
    return mat;
  }

  /** Produktion akkumulieren und Darstellung aktualisieren. */
  update(dt: number, tSec: number, windStrength = 1, daylight = 1): void {
    // Wasser-Animation (Wellen + Windreaktion).
    this.waterUniforms.uTime.value = tSec;
    this.waterUniforms.uWind.value = windStrength;

    // Gebäude-Animationen (Windmühlen-Flügel/Flagge/Türen).
    for (const m of this.buildingMixers) m?.update(dt);

    // Fenster leuchten in der Dämmerung/Nacht (daylight 1 = Tag, 0 = Nacht).
    if (this.glowMaterials.length > 0) {
      const night = Math.min(Math.max((0.5 - daylight) / 0.5, 0), 1);
      const intensity = night * 1.5;
      for (const m of this.glowMaterials) m.emissiveIntensity = intensity;
    }
    for (let i = 0; i < this.entities.length; i++) {
      const slot = this.state.slots[i];
      const def = slot.animalId ? getAnimal(slot.animalId) : undefined;
      if (slot.animalId && def) slot.pending = tickPending(def, slot.pending, dt);
      this.entities[i].update(slot, def, dt, tSec);
    }

    // Felder wachsen anhand des aktuellen Wetters und zeigen ihren Zustand.
    if (this.fieldEntities.size > 0) {
      const factor = WEATHER_GROWTH_FACTOR[this.state.weather as WeatherKind] ?? NEUTRAL_WEATHER_FACTOR;
      for (const [index, fe] of this.fieldEntities) {
        const placed = this.state.buildings[index];
        if (!placed?.field) continue;
        this.state.tickField(placed, dt, factor);
        fe.update(placed.field, dt, tSec);
      }
    }
  }

  /** Anklickbare Objekte: Slot-Marker/Blasen, Feld-Basis/Kürbisse, dann Gebäude-Struktur. */
  pickables(): THREE.Object3D[] {
    const fieldPickables: THREE.Object3D[] = [];
    for (const fe of this.fieldEntities.values()) fieldPickables.push(...fe.pickables());
    return [...this.entities.flatMap((e) => e.pickables()), ...fieldPickables, ...this.buildingMeshes];
  }

  /** Öffnet/schließt die Türen eines Gebäudes (falls es welche hat). True = behandelt. */
  toggleBuildingDoors(buildingIndex: number): boolean {
    const toggle = this.doorToggles.get(buildingIndex);
    if (!toggle) return false;
    toggle();
    return true;
  }

  bubbleWorldPos(globalIndex: number): THREE.Vector3 {
    return this.entities[globalIndex].getBubbleWorldPos();
  }

  /** Weltposition der Kürbis-Blase eines Feldes (für den Ernte-Effekt). */
  pumpkinWorldPos(buildingIndex: number): THREE.Vector3 | null {
    return this.fieldEntities.get(buildingIndex)?.getPumpkinWorldPos() ?? null;
  }

  /** Aktuell laufender Animations-Clip eines Tiers (für Tests/Debug). */
  animalClip(globalIndex: number): string | null {
    return this.entities[globalIndex]?.currentClip ?? null;
  }
}

/** Streckung der Wasserfläche zur Ellipse (x = länger, z = etwas schmaler). */
const WATER_OVAL_X = 1.60;
const WATER_OVAL_Z = 1.15;

/** Flach in der XZ-Ebene liegende, ovale Wasserfläche. */
function makeWaterGeometry(radius: number): THREE.CircleGeometry {
  const geo = new THREE.CircleGeometry(radius, 40);
  geo.rotateX(-Math.PI / 2); // in die XZ-Ebene legen (Normale +y)
  geo.scale(WATER_OVAL_X, 1, WATER_OVAL_Z); // rund → oval
  return geo;
}

/**
 * Stilisierte Low-Poly-Wasseroberfläche: leichte Wellen im Vertex-Shader (zeitlich
 * animiert, Amplitude/Tempo steigen mit dem Wind), schimmernder Blauverlauf je nach
 * Wellenhöhe. Halbtransparent. `uTime`/`uWind` werden pro Frame von `World.update` gesetzt.
 */
function makeWaterMaterial(uniforms: { uTime: { value: number }; uWind: { value: number } }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      uniform float uTime;
      uniform float uWind;
      varying float vH;
      void main() {
        vec3 p = position;
        float amp = 0.06 * (1.0 + uWind * 0.9);
        float spd = 1.2 + uWind * 0.6;
        float w = sin(p.x * 1.1 + uTime * spd) * amp + cos(p.z * 1.4 + uTime * spd * 0.8) * amp;
        p.y += w;
        vH = w / max(amp, 0.0001);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying float vH;
      void main() {
        vec3 deep = vec3(0.09, 0.32, 0.52);
        vec3 shallow = vec3(0.24, 0.56, 0.78);
        vec3 col = mix(deep, shallow, clamp(vH * 0.5 + 0.5, 0.0, 1.0));
        gl_FragColor = vec4(col, 0.88);
      }
    `,
  });
}
