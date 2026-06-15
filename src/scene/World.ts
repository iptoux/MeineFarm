import * as THREE from "three";
import type { GameState } from "../game/GameState";
import { getAnimal } from "../game/config/animals";
import { getBuilding } from "../game/config/buildings";
import { ROAD_TILE, getRoad, roadCellCenter, worldToCell } from "../game/config/roads";
import { tickPending } from "../game/economy";
import { createBuilding, createModelBuilding } from "./Building";
import { SlotEntity, type PickData } from "./SlotEntity";
import type { AnimalModels } from "./AnimalModels";
import type { Grass } from "./Grass";

/** Kleiner Zusatzabstand zur Gebäudewand (der Büschel-Radius wird separat addiert). */
const GRASS_BUILD_MARGIN = 0.1;

/**
 * Verwaltet die sichtbare Welt: Gebäude-Meshes + ihre Slot-Entities und die
 * dekorativen Straßen-Kacheln, abgeleitet aus dem GameState. Slot-Entities liegen
 * flach (globaler Index via `state.slotBase` + lokal). Strukturelle Änderungen
 * (bauen, bewegen, drehen, entfernen) lösen `rebuild()` aus.
 */
export class World {
  private entities: SlotEntity[] = [];
  private buildingGroups: THREE.Group[] = [];
  private buildingMeshes: THREE.Mesh[] = [];
  private roadGroup = new THREE.Group();
  private roadGeo = new THREE.BoxGeometry(ROAD_TILE, 0.08, ROAD_TILE);
  private roadMats = new Map<string, THREE.MeshStandardMaterial>();
  /** Dach-Platten zum Ausblenden beim Zoom — Array-Referenz bleibt stabil. */
  readonly roofMeshes: THREE.Mesh[] = [];

  constructor(
    private scene: THREE.Scene,
    private state: GameState,
    private models: AnimalModels,
    private grass?: Grass,
  ) {
    this.scene.add(this.roadGroup);
    this.rebuild();
  }

  /** Verwirft alle Visuals und baut Gebäude + Straßen neu aus dem Zustand auf. */
  rebuild(): void {
    for (const g of this.buildingGroups) this.scene.remove(g);
    for (const e of this.entities) this.scene.remove(e.group);
    this.entities = [];
    this.buildingGroups = [];
    this.buildingMeshes = [];
    this.roofMeshes.length = 0; // gleiche Referenz behalten (Zoom-Fade)

    for (let b = 0; b < this.state.buildings.length; b++) this.addBuildingVisuals(b);
    this.rebuildRoads();
  }

  /**
   * Baut die komplette Welt aus der Szene ab und gibt eigene GPU-Ressourcen frei.
   * Boden, Gras, Licht und Himmel (Teil des persistenten Rigs) bleiben erhalten.
   */
  dispose(): void {
    for (const g of this.buildingGroups) this.scene.remove(g);
    for (const e of this.entities) this.scene.remove(e.group);
    this.entities = [];
    this.buildingGroups = [];
    this.buildingMeshes = [];
    this.roofMeshes.length = 0;
    this.scene.remove(this.roadGroup);
    this.roadGroup.clear();
    this.roadGeo.dispose();
    for (const mat of this.roadMats.values()) mat.dispose();
    this.roadMats.clear();
  }

  /** Erzeugt Mesh + Slot-Entities für das Gebäude mit dem gegebenen Index. */
  addBuildingVisuals(buildingIndex: number): void {
    const placed = this.state.buildings[buildingIndex];
    const def = getBuilding(placed.defId);
    if (!def) return;

    const pos = { x: placed.x, z: placed.z };
    const model = this.models.getBuildingModel(def.id);
    const building = model
      ? createModelBuilding(def, pos, placed.rotation, model)
      : createBuilding(def, pos, placed.rotation);
    this.scene.add(building.group);
    this.buildingGroups[buildingIndex] = building.group;
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

  /** Blendet Gras unter Gebäuden/Straßen aus (und anderswo wieder ein). */
  private cullGrass(): void {
    this.grass?.setOccupancy((x, z, r) => this.isOccupied(x, z, r));
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
  update(dt: number, tSec: number): void {
    for (let i = 0; i < this.entities.length; i++) {
      const slot = this.state.slots[i];
      const def = slot.animalId ? getAnimal(slot.animalId) : undefined;
      if (slot.animalId && def) slot.pending = tickPending(def, slot.pending, dt);
      this.entities[i].update(slot, def, dt, tSec);
    }
  }

  /** Anklickbare Objekte: zuerst Slot-Marker/Blasen, dann Gebäude-Struktur. */
  pickables(): THREE.Object3D[] {
    return [...this.entities.flatMap((e) => e.pickables()), ...this.buildingMeshes];
  }

  bubbleWorldPos(globalIndex: number): THREE.Vector3 {
    return this.entities[globalIndex].getBubbleWorldPos();
  }

  /** Aktuell laufender Animations-Clip eines Tiers (für Tests/Debug). */
  animalClip(globalIndex: number): string | null {
    return this.entities[globalIndex]?.currentClip ?? null;
  }
}
