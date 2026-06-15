import * as THREE from "three";
import type { GameState } from "../game/GameState";
import { fieldCenter, type FieldBounds, type FieldEdge } from "../game/config/chunks";

const AFFORD = new THREE.Color(0x4caf50); // bezahlbar
const BLOCKED = new THREE.Color(0xd32f2f); // zu teuer
/** Abstand der Pads von der Feldkante; Kantenlänge eines Pads. */
const GAP = 5;
const PAD_SIZE = 9;

export interface FieldExpansionHandlers {
  /** Nach erfolgreicher Erweiterung (View neu aufbauen + Sound). */
  onExpanded: () => void;
}

interface Pad {
  edge: FieldEdge;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

/**
 * Vier „+"-Pads an den Feldkanten. Klick kauft eine Erweiterung (steigende Kosten)
 * und vergrößert das Spielfeld in Richtung dieser Kante. Pads liegen flach am
 * Boden, sind grün (bezahlbar) bzw. rot (zu teuer) und verschwinden am Limit.
 */
export class FieldExpansion {
  private group = new THREE.Group();
  private pads: Pad[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private unsubscribe: () => void;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private dom: HTMLElement,
    private state: GameState,
    private handlers: FieldExpansionHandlers,
    /** Pausiert die Pads, solange Bau-/Straßenmodus aktiv ist. */
    private isBusy: () => boolean,
    signal: AbortSignal,
  ) {
    const tex = makePlusTexture();
    const geo = new THREE.PlaneGeometry(PAD_SIZE, PAD_SIZE);
    for (const edge of ["minX", "maxX", "minZ", "maxZ"] as FieldEdge[]) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.pads.push({ edge, mesh, mat });
    }
    this.scene.add(this.group);

    this.dom.addEventListener("pointerdown", this.onDown, { signal });
    // Farben aktualisieren, wenn sich Geld/Feld ändern.
    this.unsubscribe = this.state.onChange(() => this.refresh());
    this.reposition(this.state.field);
  }

  /** Setzt die Pads an die aktuellen Feldkanten und aktualisiert Farben/Sichtbarkeit. */
  reposition(f: FieldBounds): void {
    const c = fieldCenter(f);
    for (const p of this.pads) {
      const m = p.mesh;
      if (p.edge === "maxX") m.position.set(f.maxX + GAP, 0.12, c.z);
      else if (p.edge === "minX") m.position.set(f.minX - GAP, 0.12, c.z);
      else if (p.edge === "maxZ") m.position.set(c.x, 0.12, f.maxZ + GAP);
      else m.position.set(c.x, 0.12, f.minZ - GAP);
    }
    this.refresh();
  }

  /** Aktualisiert Farbe (bezahlbar/zu teuer) und blendet Pads am Limit aus. */
  private refresh(): void {
    for (const p of this.pads) {
      const cost = this.state.expandCost(p.edge);
      if (cost === null) {
        p.mesh.visible = false; // Achse am Maximum
        continue;
      }
      p.mesh.visible = true;
      p.mat.color.copy(this.state.canAfford(cost) ? AFFORD : BLOCKED);
    }
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.isBusy()) return;
    const rect = this.dom.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.pads.filter((p) => p.mesh.visible).map((p) => p.mesh),
      false,
    );
    if (hits.length === 0) return;
    const pad = this.pads.find((p) => p.mesh === hits[0].object);
    if (pad && this.state.expandField(pad.edge)) {
      this.handlers.onExpanded();
    }
  };

  dispose(): void {
    this.unsubscribe();
    this.scene.remove(this.group);
    for (const p of this.pads) p.mat.dispose();
    this.pads[0]?.mesh.geometry.dispose();
  }
}

/** Weißes „+"-Symbol auf transparentem Grund (per Canvas) zum Einfärben. */
function makePlusTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // weicher runder Hintergrund
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
  ctx.fill();
  // dunkles Plus
  ctx.strokeStyle = "rgba(20,40,20,0.95)";
  ctx.lineWidth = size * 0.12;
  ctx.lineCap = "round";
  const a = size * 0.3;
  const b = size * 0.7;
  ctx.beginPath();
  ctx.moveTo(size / 2, a);
  ctx.lineTo(size / 2, b);
  ctx.moveTo(a, size / 2);
  ctx.lineTo(b, size / 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
