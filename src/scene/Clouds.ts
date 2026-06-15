import * as THREE from "three";

/**
 * Locker über den Himmel ziehende Low-Poly-Wolken, jede mit einem weichen
 * Schattenfleck am Boden. Die Schatten sind bewusst gefälschte „Decals" (flache
 * Planes mit radialem Alpha) statt echter Shadow-Map-Schatten – das liest sich
 * sauber als Wolkenschatten, ist performant und entkoppelt vom Sonnenstand.
 * Nachts werden die Schatten ausgeblendet; die Wolken selbst dunkeln über das
 * Szenenlicht automatisch mit ab.
 */

const CLOUD_COUNT = 12;
/** Halber Bereich (x/z), über den Wolken verteilt sind und wrappen. */
const SPREAD = 60;
const CLOUD_HEIGHT = 28;
/** Windgeschwindigkeit (Welt-Einheiten/Sekunde). */
const WIND = new THREE.Vector2(1.1, 0.25);
const SHADOW_MAX_OPACITY = 0.22;

interface Cloud {
  sky: THREE.Group;
  shadow: THREE.Mesh;
  /** Horizontale Halbausdehnung (für das Wrappen am Rand). */
  half: number;
}

export class CloudManager {
  private clouds: Cloud[] = [];
  private shadowTex: THREE.Texture;
  private puffGeo = new THREE.IcosahedronGeometry(1, 1);
  private cloudMat: THREE.MeshStandardMaterial;

  constructor(private scene: THREE.Scene) {
    this.shadowTex = makeRadialTexture();
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.95,
      flatShading: true,
    });

    for (let i = 0; i < CLOUD_COUNT; i++) {
      const cloud = this.makeCloud();
      this.position(cloud, THREE.MathUtils.randFloatSpread(2 * SPREAD), THREE.MathUtils.randFloatSpread(2 * SPREAD));
      this.clouds.push(cloud);
      this.scene.add(cloud.sky, cloud.shadow);
    }
  }

  /** Verschiebt Wolken + Schatten mit dem Wind und blendet Schatten nach Tageslicht. */
  update(dt: number, daylight: number): void {
    const shadowOpacity = SHADOW_MAX_OPACITY * THREE.MathUtils.clamp(daylight, 0, 1);
    for (const c of this.clouds) {
      let x = c.sky.position.x + WIND.x * dt;
      let z = c.sky.position.z + WIND.y * dt;
      // Am Rand auf der Gegenseite neu einsetzen (mit etwas Variation).
      if (x - c.half > SPREAD) x = -SPREAD - c.half;
      if (z - c.half > SPREAD) z = -SPREAD - c.half;
      this.position(c, x, z);
      (c.shadow.material as THREE.MeshBasicMaterial).opacity = shadowOpacity;
    }
  }

  private position(c: Cloud, x: number, z: number): void {
    c.sky.position.set(x, CLOUD_HEIGHT, z);
    c.shadow.position.set(x, 0.06, z);
  }

  private makeCloud(): Cloud {
    const scale = THREE.MathUtils.randFloat(2.2, 4.2);
    const sky = new THREE.Group();
    // Mehrere überlappende, leicht abgeflachte Kugeln ergeben eine bauschige Wolke.
    const puffs = 4 + Math.floor(Math.random() * 3);
    let maxR = 0;
    for (let i = 0; i < puffs; i++) {
      const r = THREE.MathUtils.randFloat(0.7, 1.3) * scale;
      const puff = new THREE.Mesh(this.puffGeo, this.cloudMat);
      puff.scale.set(r, r * 0.62, r);
      const px = THREE.MathUtils.randFloatSpread(2.4 * scale);
      const pz = THREE.MathUtils.randFloatSpread(1.4 * scale);
      puff.position.set(px, THREE.MathUtils.randFloatSpread(0.6 * scale), pz);
      sky.add(puff);
      maxR = Math.max(maxR, Math.abs(px) + r, Math.abs(pz) + r);
    }

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(maxR * 2.4, maxR * 2.4),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        map: this.shadowTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 1;

    return { sky, shadow, half: maxR };
  }
}

/** Weicher runder Alpha-Verlauf (Canvas) für die Schatten-Decals. */
function makeRadialTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
