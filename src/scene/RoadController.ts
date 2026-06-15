import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GameState } from "../game/GameState";
import { ROAD_TILE, getRoad, type RoadDef, roadCellCenter, worldToCell } from "../game/config/roads";

const PLACE = new THREE.Color(0x4caf50); // setzbar
const REMOVE = new THREE.Color(0xe0a020); // über bestehender Kachel → entfernen
const BLOCKED = new THREE.Color(0xd32f2f); // zu teuer

export interface RoadHandlers {
  /** Nach jeder Änderung (Straßen neu rendern). */
  onChanged: () => void;
  /** Erfolgreich eine Kachel gesetzt (für Sound). */
  onPlaced: () => void;
}

/**
 * Straßen-Bau-Modus: bleibt aktiv für mehrere Kacheln. Eine Silhouetten-Kachel
 * rastet am Gitter ein; Linksklick setzt (leere Zelle) bzw. entfernt (belegte
 * Zelle). Rechtsklick/ESC beendet. Kamera-Steuerung ist solange deaktiviert.
 */
export class RoadController {
  private activeFlag = false;
  private roadDef: RoadDef | null = null;
  private ghost: THREE.Mesh;
  private ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45 });
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private dom: HTMLElement,
    private controls: OrbitControls,
    private state: GameState,
    private handlers: RoadHandlers,
  ) {
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(ROAD_TILE, 0.12, ROAD_TILE), this.ghostMat);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  get active(): boolean {
    return this.activeFlag;
  }

  begin(roadId: string): void {
    const def = getRoad(roadId);
    if (!def || this.activeFlag) return;
    this.roadDef = def;
    this.activeFlag = true;
    this.controls.enabled = false;
    this.ghost.visible = true;
    this.dom.addEventListener("pointermove", this.onMove);
    this.dom.addEventListener("pointerdown", this.onDown);
    window.addEventListener("keydown", this.onKey);
    this.dom.addEventListener("contextmenu", this.onContext);
  }

  cancel(): void {
    if (!this.activeFlag) return;
    this.activeFlag = false;
    this.controls.enabled = true;
    this.ghost.visible = false;
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

  private cellAt(e: PointerEvent): { gx: number; gz: number } | null {
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    return worldToCell(hit.x, hit.z);
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.roadDef) return;
    const cell = this.cellAt(e);
    if (!cell) return;
    const c = roadCellCenter(cell.gx, cell.gz);
    this.ghost.position.set(c.x, 0.06, c.z);
    if (this.state.hasRoad(cell.gx, cell.gz)) this.ghostMat.color.copy(REMOVE);
    else if (!this.state.roadCellInField(cell.gx, cell.gz)) this.ghostMat.color.copy(BLOCKED);
    else this.ghostMat.color.copy(this.state.canAfford(this.roadDef.cost) ? PLACE : BLOCKED);
  };

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.roadDef) return;
    const cell = this.cellAt(e);
    if (!cell) return;
    if (this.state.hasRoad(cell.gx, cell.gz)) {
      this.state.removeRoad(cell.gx, cell.gz);
      this.handlers.onChanged();
    } else if (!this.state.roadCellInField(cell.gx, cell.gz)) {
      return; // außerhalb des Spielfelds → nicht baubar
    } else if (this.state.addRoad(cell.gx, cell.gz, this.roadDef.id)) {
      this.handlers.onChanged();
      this.handlers.onPlaced();
    }
  };
}
