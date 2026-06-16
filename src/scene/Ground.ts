import * as THREE from "three";
import { INITIAL_FIELD, type FieldBounds, fieldCenter } from "../game/config/chunks";

/** Etwas Überstand über die Feldkante hinaus, damit keine Naht durchblitzt. */
const PAD = 2;
/** Reiner Sicht-Hintergrund ausserhalb der baubaren Flaeche. */
const BACKDROP_PAD = 520;
const BACKDROP_Y = -1.25;

/**
 * Grüne Bodenfläche, die Schatten empfängt und sich an die Spielfeld-Grenzen
 * anpasst. `resize` baut die Plane passend zum (nicht zwingend ursprungs-
 * zentrierten) Feld neu auf.
 */
export class Ground {
  readonly object = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly backdrop: THREE.Mesh;

  constructor() {
    const material = new THREE.MeshStandardMaterial({ color: 0x4f9e3a, roughness: 1 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;

    const backdropMaterial = new THREE.MeshStandardMaterial({
      color: 0x668f49,
      roughness: 1,
      fog: true,
    });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 8, 8), backdropMaterial);
    this.backdrop.rotation.x = -Math.PI / 2;
    this.backdrop.position.y = BACKDROP_Y;
    this.backdrop.receiveShadow = false;

    this.object.add(this.backdrop, this.mesh);
    this.resize(INITIAL_FIELD);
  }

  /** Passt Größe und Mittelpunkt der Bodenfläche an die Feldgrenzen an. */
  resize(f: FieldBounds): void {
    const w = f.maxX - f.minX + 2 * PAD;
    const d = f.maxZ - f.minZ + 2 * PAD;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(w, d);
    const c = fieldCenter(f);
    this.mesh.position.set(c.x, 0, c.z);

    const backdropSize = Math.max(w, d) + BACKDROP_PAD * 2;
    this.backdrop.geometry.dispose();
    this.backdrop.geometry = new THREE.PlaneGeometry(backdropSize, backdropSize, 8, 8);
    this.backdrop.position.set(c.x, BACKDROP_Y, c.z);
  }
}
