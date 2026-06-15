import * as THREE from "three";

/** Große grüne Bodenfläche, die Schatten empfängt. */
export function createGround(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(120, 120);
  const material = new THREE.MeshStandardMaterial({ color: 0x4f9e3a, roughness: 1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
