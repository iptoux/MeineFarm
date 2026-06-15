import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GameState } from "../game/GameState";
import { getBuilding, type BuildingDef } from "../game/config/buildings";

const FIELD_HALF = 45; // platzierbarer Bereich um den Ursprung
const SPACING_MARGIN = 1.5; // Mindestabstand zwischen Gebäuderändern

const VALID = new THREE.Color(0x4caf50);
const INVALID = new THREE.Color(0xd32f2f);

interface BuildMode {
  type: "build";
  def: BuildingDef;
}
interface MoveMode {
  type: "move";
  def: BuildingDef;
  buildingIndex: number;
}
type Mode = BuildMode | MoveMode;

export interface PlacementHandlers {
  /** Neues Gebäude platzieren. */
  onBuild: (defId: string, x: number, z: number) => void;
  /** Bestehendes Gebäude verschieben. */
  onMove: (buildingIndex: number, x: number, z: number) => void;
}

/**
 * Platzierungs-Modus für neue UND bestehende Gebäude: zeigt eine durchscheinende
 * Silhouette, die dem Boden-Cursor folgt (grün = ok, rot = nicht), und bestätigt
 * per Linksklick. Rechtsklick/ESC bricht ab. Kamera-Steuerung ist solange aus.
 */
export class PlacementController {
  private mode: Mode | null = null;
  private ghost: THREE.Group | null = null;
  private padMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 });
  private boxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22 });
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private dom: HTMLElement,
    private controls: OrbitControls,
    private state: GameState,
    private handlers: PlacementHandlers,
  ) {}

  get active(): boolean {
    return this.mode !== null;
  }

  /** Startet die Platzierung eines neuen Gebäudes. */
  begin(def: BuildingDef): void {
    this.start({ type: "build", def });
  }

  /** Startet das Verschieben eines bestehenden Gebäudes. */
  beginMove(buildingIndex: number): void {
    const placed = this.state.buildings[buildingIndex];
    const def = placed && getBuilding(placed.defId);
    if (!def) return;
    this.start({ type: "move", def, buildingIndex });
  }

  private start(mode: Mode): void {
    if (this.active) this.cancel();
    this.mode = mode;
    this.controls.enabled = false;

    const def = mode.def;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.2, def.depth), this.padMat);
    pad.position.y = 0.1;
    g.add(pad);
    const box = new THREE.Mesh(new THREE.BoxGeometry(def.width, 3, def.depth), this.boxMat);
    box.position.y = 1.5;
    g.add(box);
    this.ghost = g;
    this.scene.add(g);

    this.dom.addEventListener("pointermove", this.onMove);
    this.dom.addEventListener("pointerdown", this.onDown);
    window.addEventListener("keydown", this.onKey);
    this.dom.addEventListener("contextmenu", this.onContext);
  }

  cancel(): void {
    if (!this.active) return;
    this.mode = null;
    this.controls.enabled = true;
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
    this.dom.removeEventListener("pointermove", this.onMove);
    this.dom.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("keydown", this.onKey);
    this.dom.removeEventListener("contextmenu", this.onContext);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.cancel();
  };

  private onContext = (e: MouseEvent): void => {
    e.preventDefault();
    this.cancel();
  };

  private groundPoint(e: PointerEvent): THREE.Vector3 | null {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.mode || !this.ghost) return;
    const p = this.groundPoint(e);
    if (!p) return;
    this.ghost.position.set(p.x, 0, p.z);
    const col = this.isValid(p.x, p.z) ? VALID : INVALID;
    this.padMat.color.copy(col);
    this.boxMat.color.copy(col);
  };

  private onDown = (e: PointerEvent): void => {
    if (!this.mode || e.button !== 0) return;
    const p = this.groundPoint(e);
    if (!p || !this.isValid(p.x, p.z)) return;
    if (this.mode.type === "build") this.handlers.onBuild(this.mode.def.id, p.x, p.z);
    else this.handlers.onMove(this.mode.buildingIndex, p.x, p.z);
    this.cancel();
  };

  /** Platzierbar, wenn (beim Bauen) bezahlbar, im Feld und ohne Überschneidung. */
  private isValid(x: number, z: number): boolean {
    if (!this.mode) return false;
    const def = this.mode.def;
    if (this.mode.type === "build" && !this.state.canAfford(def.cost)) return false;

    const halfW = def.width / 2;
    const halfD = def.depth / 2;
    if (Math.abs(x) + halfW > FIELD_HALF || Math.abs(z) + halfD > FIELD_HALF) return false;

    const selfIndex = this.mode.type === "move" ? this.mode.buildingIndex : -1;
    for (let i = 0; i < this.state.buildings.length; i++) {
      if (i === selfIndex) continue; // beim Verschieben sich selbst ignorieren
      const b = this.state.buildings[i];
      const other = getBuilding(b.defId);
      if (!other) continue;
      const minDx = halfW + other.width / 2 + SPACING_MARGIN;
      const minDz = halfD + other.depth / 2 + SPACING_MARGIN;
      if (Math.abs(x - b.x) < minDx && Math.abs(z - b.z) < minDz) return false;
    }
    return true;
  }
}
