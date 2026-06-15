import * as THREE from "three";

interface Coin {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const LIFETIME = 0.7; // Sekunden

/**
 * Kleiner 3D-Münz-Funkeneffekt beim Einsammeln: ein paar goldene Münzen
 * springen hoch, fallen leicht und schrumpfen, dann verschwinden sie.
 */
export class CoinBurst {
  private coins: Coin[] = [];
  private geo = new THREE.SphereGeometry(0.12, 8, 6);
  private mat = new THREE.MeshStandardMaterial({
    color: 0xffe600,
    emissive: 0x553300,
    metalness: 0.7,
    roughness: 0.3,
  });

  constructor(private scene: THREE.Scene) {}

  spawn(pos: THREE.Vector3, count = 7): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.copy(pos);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        2.5 + Math.random() * 2,
        (Math.random() - 0.5) * 2.5,
      );
      this.scene.add(mesh);
      this.coins.push({ mesh, vel, life: LIFETIME });
    }
  }

  update(dt: number): void {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        continue;
      }
      c.vel.y -= 9 * dt; // leichte Schwerkraft
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.y += dt * 8;
      c.mesh.scale.setScalar(Math.max(0.01, c.life / LIFETIME));
    }
  }
}
