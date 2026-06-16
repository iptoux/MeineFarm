import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GameState } from "../game/GameState";
import { getBuilding, type BuildingDef } from "../game/config/buildings";

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
  onBuild: (defId: string, x: number, z: number, rotation: number) => void;
  /** Bestehendes Gebäude verschieben (mit aktueller Drehung). */
  onMove: (buildingIndex: number, x: number, z: number, rotation: number) => void;
}

/** Abstand, in dem Zaun-Enden beim Platzieren aneinander einrasten. */
const SNAP_DIST = 2.5;

/** Echter Zaun: Deko ohne Slots, aber kein Feld (Felder snappen nicht). */
function isFence(def: BuildingDef): boolean {
  return def.slotCount === 0 && !def.isField;
}

/** Eng packbar (Zaun oder Feld): darf ohne Mindestabstand dicht anschließen. */
function isTightPackable(def: BuildingDef): boolean {
  return isFence(def) || !!def.isField;
}

/**
 * Platzierungs-Modus für neue UND bestehende Gebäude: zeigt eine durchscheinende
 * Silhouette, die dem Boden-Cursor folgt (grün = ok, rot = nicht), und bestätigt
 * per Linksklick. Rechtsklick/ESC bricht ab. Kamera-Steuerung ist solange aus.
 */
export class PlacementController {
  private mode: Mode | null = null;
  private ghost: THREE.Group | null = null;
  private rotation = 0;
  private padMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35 });
  private boxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22 });
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  /** Letzter aufgelöster Boden-Punkt (nach Snapping) für Tastendreh-Updates. */
  private lastPoint: { x: number; z: number } | null = null;

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
    this.rotation = mode.type === "move" ? this.state.buildings[mode.buildingIndex]?.rotation ?? 0 : 0;
    this.lastPoint = null;
    this.controls.enabled = false;

    const def = mode.def;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.2, def.depth), this.padMat);
    pad.position.y = 0.1;
    g.add(pad);
    const box = new THREE.Mesh(new THREE.BoxGeometry(def.width, 3, def.depth), this.boxMat);
    box.position.y = 1.5;
    g.add(box);
    g.rotation.y = this.rotation;
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
    if (e.key === "Escape") {
      this.cancel();
    } else if (e.key.toLowerCase() === "r") {
      this.rotation = (this.rotation + Math.PI / 2) % (Math.PI * 2);
      this.refreshGhost();
    }
  };

  /** Aktualisiert Drehung/Position/Farbe der Silhouette am zuletzt bekannten Punkt. */
  private refreshGhost(): void {
    if (!this.ghost) return;
    this.ghost.rotation.y = this.rotation;
    if (!this.lastPoint) return;
    const { x, z } = this.lastPoint;
    this.ghost.position.set(x, 0, z);
    const col = this.isValid(x, z) ? VALID : INVALID;
    this.padMat.color.copy(col);
    this.boxMat.color.copy(col);
  }

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
    const p = this.resolvePoint(e);
    if (!p) return;
    this.lastPoint = p;
    this.ghost.position.set(p.x, 0, p.z);
    const col = this.isValid(p.x, p.z) ? VALID : INVALID;
    this.padMat.color.copy(col);
    this.boxMat.color.copy(col);
  };

  private onDown = (e: PointerEvent): void => {
    if (!this.mode || e.button !== 0) return;
    const p = this.resolvePoint(e);
    if (!p || !this.isValid(p.x, p.z)) return;
    if (this.mode.type === "build") this.handlers.onBuild(this.mode.def.id, p.x, p.z, this.rotation);
    else this.handlers.onMove(this.mode.buildingIndex, p.x, p.z, this.rotation);
    this.cancel();
  };

  /** Boden-Punkt unter dem Cursor; bei Zäunen ggf. ans nächste Zaun-Ende gesnappt. */
  private resolvePoint(e: PointerEvent): { x: number; z: number } | null {
    const p = this.groundPoint(e);
    if (!p) return null;
    if (this.mode && isFence(this.mode.def)) {
      const snapped = this.snapFence(p.x, p.z);
      if (snapped) return snapped;
    }
    return { x: p.x, z: p.z };
  }

  /** Sucht das nächste Ende eines bereits platzierten Zauns und rastet daran ein. */
  private snapFence(x: number, z: number): { x: number; z: number } | null {
    if (!this.mode) return null;
    const selfIndex = this.mode.type === "move" ? this.mode.buildingIndex : -1;
    const ghostEnds = fenceEnds(x, z, this.rotation, this.mode.def.width);

    let best: { x: number; z: number } | null = null;
    let bestDist = SNAP_DIST;
    for (let i = 0; i < this.state.buildings.length; i++) {
      if (i === selfIndex) continue;
      const b = this.state.buildings[i];
      const other = getBuilding(b.defId);
      if (!other || !isFence(other)) continue; // nur an andere Zäune snappen
      const otherEnds = fenceEnds(b.x, b.z, b.rotation, other.width);
      for (const ge of ghostEnds) {
        for (const oe of otherEnds) {
          const d = Math.hypot(ge.x - oe.x, ge.z - oe.z);
          if (d < bestDist) {
            bestDist = d;
            best = { x: x + (oe.x - ge.x), z: z + (oe.z - ge.z) };
          }
        }
      }
    }
    return best;
  }

  /** Platzierbar, wenn (beim Bauen) bezahlbar, im Feld und ohne Überschneidung. */
  private isValid(x: number, z: number): boolean {
    if (!this.mode) return false;
    const def = this.mode.def;
    if (this.mode.type === "build" && !this.state.canAfford(def.cost)) return false;

    const [halfW, halfD] = halfExtents(def, this.rotation);
    if (!this.state.inField(x, z, halfW, halfD)) return false;

    const selfIndex = this.mode.type === "move" ? this.mode.buildingIndex : -1;
    for (let i = 0; i < this.state.buildings.length; i++) {
      if (i === selfIndex) continue; // beim Verschieben sich selbst ignorieren
      const b = this.state.buildings[i];
      const other = getBuilding(b.defId);
      if (!other) continue;
      // Zäune (Deko ohne Slots) blockieren sich NICHT gegenseitig: man darf sie frei
      // aneinanderreihen, über Eck setzen oder parallel bauen (Snapping richtet sie aus).
      if (isFence(def) && isFence(other)) continue;
      const [ohw, ohd] = halfExtents(other, b.rotation);
      // Eng packbar (Zaun/Feld): darf dicht anschließen (kein Mindestabstand). So lassen
      // sich Felder Kante an Kante zu einem Acker zusammensetzen, ohne sich zu überlappen.
      const margin = isTightPackable(def) || isTightPackable(other) ? -0.05 : SPACING_MARGIN;
      const minDx = halfW + ohw + margin;
      const minDz = halfD + ohd + margin;
      if (Math.abs(x - b.x) < minDx && Math.abs(z - b.z) < minDz) return false;
    }
    return true;
  }
}

/** Welt-AABB-Halbausdehnungen (Drehung um 90°/270° tauscht Breite/Tiefe). */
function halfExtents(def: BuildingDef, rotation: number): [number, number] {
  const rotated = Math.abs(Math.sin(rotation)) > 0.5;
  return rotated ? [def.depth / 2, def.width / 2] : [def.width / 2, def.depth / 2];
}

/** Die beiden Enden eines Zauns (Längsachse = lokales x) in Welt-Koordinaten. */
function fenceEnds(x: number, z: number, rotation: number, length: number): { x: number; z: number }[] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const hx = (length / 2) * c;
  const hz = (length / 2) * s;
  return [
    { x: x + hx, z: z + hz },
    { x: x - hx, z: z - hz },
  ];
}
