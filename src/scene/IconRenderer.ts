import * as THREE from "three";

/**
 * Rendert ein (auf Größe ~1, am Ursprung zentriertes) 3D-Modell einmalig zu
 * einer transparenten PNG-Data-URL — für statische HUD-Icons.
 */
export function renderIcon(object: THREE.Object3D, size = 96): string {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.4));
  const dir = new THREE.DirectionalLight(0xffffff, 1.3);
  dir.position.set(2, 3, 2);
  scene.add(dir);
  scene.add(object);

  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  cam.position.set(1.2, 1.0, 1.7);
  cam.lookAt(0, 0, 0);

  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL("image/png");
  renderer.dispose();
  return url;
}
