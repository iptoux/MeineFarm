import * as THREE from "three";
import type { BuildingDef } from "../game/config/buildings";

export interface Building {
  group: THREE.Group;
  /** Welt-Positionen der Slot-Plätze auf dem Boden (Reihenfolge = lokaler Slot-Index). */
  slotPositions: THREE.Vector3[];
  /** Dach-Platten — können beim Nah-Zoomen ausgeblendet werden. */
  roofMeshes: THREE.Mesh[];
}

export const FLOOR_TOP_Y = 0.3;

/**
 * Stall-/Scheunen-Mesh aus Primitiven: Bodenplatte, drei niedrige Wände (Front
 * offen), Eck-Pfeiler und ein Giebeldach. Größe/Dachfarbe kommen aus `def`,
 * platziert wird am Welt-Punkt `pos`. Liefert das Slot-Raster in Welt-Koordinaten.
 */
export function createBuilding(
  def: BuildingDef,
  pos: { x: number; z: number },
  rotation = 0,
): Building {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = rotation;

  const woodDark = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
  const woodLight = new THREE.MeshStandardMaterial({ color: 0xb5895a, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: def.roofColor, roughness: 0.8, transparent: true });

  const W = def.width;
  const D = def.depth;
  const wallH = 1.6;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, FLOOR_TOP_Y, D), woodLight);
  floor.position.y = FLOOR_TOP_Y / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const back = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, 0.3), woodDark);
  back.position.set(0, FLOOR_TOP_Y + wallH / 2, -D / 2);
  back.castShadow = true;
  group.add(back);

  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, wallH, D), woodDark);
    side.position.set((sx * W) / 2, FLOOR_TOP_Y + wallH / 2, 0);
    side.castShadow = true;
    group.add(side);
  }

  const pillarH = 3;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, pillarH, 0.4), woodDark);
      pillar.position.set((sx * (W - 0.4)) / 2, FLOOR_TOP_Y + pillarH / 2, (sz * (D - 0.4)) / 2);
      pillar.castShadow = true;
      group.add(pillar);
    }
  }

  // Giebeldach aus zwei geneigten Platten, die sich am First (z=0) treffen.
  const eaveY = FLOOR_TOP_Y + pillarH;
  const roofRise = 2.2;
  const halfD = D / 2;
  const slopeLen = Math.hypot(halfD, roofRise);
  const theta = Math.atan2(roofRise, halfD);
  const centerY = (eaveY + eaveY + roofRise) / 2;
  const roofLen = W + 1.2;
  const slabDepth = slopeLen + 0.3;

  const roofMeshes: THREE.Mesh[] = [];
  for (const side of [1, -1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.18, slabDepth), roofMat);
    slab.position.set(0, centerY, (side * halfD) / 2);
    slab.rotation.x = side * theta;
    slab.castShadow = true;
    group.add(slab);
    roofMeshes.push(slab);
  }

  return { group, slotPositions: computeSlotPositions(def, pos, rotation), roofMeshes };
}

/**
 * Baut ein Gebäude aus einem fertig normalisierten glTF-Modell-Klon. Slot-Raster
 * wie bei den Primitiven; die „roofMeshes" (beim Nah-Zoom auszublenden) sind
 * entweder alle Meshes (`fadeAll`) oder die mit Dach-Material.
 */
export function createModelBuilding(
  def: BuildingDef,
  pos: { x: number; z: number },
  rotation: number,
  model: THREE.Object3D,
): Building {
  const group = new THREE.Group();
  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = rotation;
  group.add(model);

  const roofMeshes: THREE.Mesh[] = [];
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const matName = ((o.material as THREE.Material)?.name ?? "").toLowerCase();
    const isFade =
      def.fadeAll ||
      def.roofMaterials?.some((n) => n.toLowerCase() === matName) ||
      /roof/.test(matName);
    if (isFade) roofMeshes.push(o);
  });

  // Slot-Höhe auf den tatsächlichen Modell-Innenboden setzen (Modelle haben einen
  // erhöhten Boden — sonst versinken Marker/Tiere). Per Raycast von oben den
  // untersten Treffer (= Erdgeschoss-Boden) nehmen.
  const slotPositions = computeSlotPositions(def, pos, rotation);
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const sp of slotPositions) {
    ray.set(new THREE.Vector3(sp.x, 100, sp.z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(model, true);
    if (hits.length > 0) sp.y = hits[hits.length - 1].point.y + 0.02;
  }

  return { group, slotPositions, roofMeshes };
}

/** Slot-Raster: 4 Spalten, Reihen = ceil(N/4), an die Grundfläche angepasst und gedreht. */
function computeSlotPositions(
  def: BuildingDef,
  pos: { x: number; z: number },
  rotation: number,
): THREE.Vector3[] {
  const W = def.width;
  const D = def.depth;
  const cols = 4;
  const rows = Math.ceil(def.slotCount / cols);
  const mX = def.slotInset ?? 1.7; // Rand-Abstand x
  const mZ = def.slotInset ?? 2.2; // Rand-Abstand z
  const xStart = -(W / 2 - mX);
  const xGap = (W - 2 * mX) / (cols - 1);
  const zFront = D / 2 - mZ; // vordere (offene) Reihe zuerst
  const rowGap = rows > 1 ? (D - 2 * mZ) / (rows - 1) : 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < def.slotCount; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const lx = xStart + c * xGap;
    const lz = zFront - r * rowGap;
    positions.push(
      new THREE.Vector3(pos.x + lx * cos - lz * sin, FLOOR_TOP_Y, pos.z + lx * sin + lz * cos),
    );
  }
  return positions;
}
