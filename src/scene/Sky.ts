import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";

/**
 * Dynamischer atmosphärischer Himmel mit langsamem Tag/Nacht-Zyklus.
 *
 * Die Sonne wandert auf einem Sinus-Bogen über den Himmel; der `Sky`-Shader
 * färbt sich dabei automatisch (Sonnenaufgang/-untergang/Dämmerung). Pro Frame
 * werden Sonnenrichtung, Lichtfarben/-stärken, Fog und ein Sternenfeld an die
 * aktuelle Tageszeit angepasst. Die übergebenen Lichter stammen aus dem
 * SceneManager und werden hier mutiert.
 */

/** Dauer eines vollen Tages in Sekunden (für Sichttests klein setzen). */
const DAY_LENGTH_SEC = 360;
/** Höchster Sonnenstand mittags (Grad über dem Horizont). */
const MAX_ELEVATION = 60;
const SKY_RADIUS = 400;

const FOG_DAY = new THREE.Color(0x9fc9e8);
const FOG_NIGHT = new THREE.Color(0x0b1626);
const FOG_DUSK = new THREE.Color(0xe8a06a);
const SUN_DAY = new THREE.Color(0xffffff);
const SUN_DUSK = new THREE.Color(0xff7a2a);

export class SkyManager {
  /** Tageszeit in [0,1): 0 = Mitternacht, 0.25 = Sonnenaufgang, 0.5 = Mittag. */
  timeOfDay = 0.32;
  /** Zeitraffer-Faktor (1 = Echtzeit gemäß DAY_LENGTH_SEC). */
  speed = 1;

  /** Tageslicht-Faktor [0,1]: 0 = Nacht, 1 = heller Tag (für Wolkenschatten o.ä.). */
  daylight = 1;

  private readonly sky: Sky;
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.PointsMaterial;
  private readonly sunVec = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemi: THREE.HemisphereLight,
    private readonly ambient: THREE.AmbientLight,
  ) {
    this.sky = new Sky();
    this.sky.scale.setScalar(SKY_RADIUS);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 10;
    u.rayleigh.value = 3.5; // mehr Blau-Streuung → satterer Himmel statt blass
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.7;
    scene.add(this.sky);

    this.starMat = new THREE.PointsMaterial({
      color: 0xfdfdff,
      size: 2.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // leuchten gegen den dunklen Nachthimmel
    });
    // Innerhalb der Sky-Box (Halb-Extent ~SKY_RADIUS/2), damit sie nie verdeckt werden.
    this.stars = new THREE.Points(makeStarField(SKY_RADIUS * 0.42), this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.apply();
  }

  /** Rückt die Tageszeit vor und aktualisiert Himmel, Licht, Fog und Sterne. */
  update(dt: number): void {
    this.timeOfDay = (this.timeOfDay + (dt * this.speed) / DAY_LENGTH_SEC) % 1;
    this.apply();
  }

  private apply(): void {
    // Sonnenstand aus der Tageszeit: Horizont bei 0.25/0.75, Hochstand bei 0.5.
    const elevation = MAX_ELEVATION * Math.sin(2 * Math.PI * (this.timeOfDay - 0.25));
    const azimuth = this.timeOfDay * 360 - 90;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunVec.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunVec);

    // Gerichtetes Sonnenlicht folgt der Sonne (Schatten drehen mit).
    this.sun.position.copy(this.sunVec).multiplyScalar(60);

    // Mischfaktoren: Tageslicht und Dämmerungs-Wärme nahe am Horizont.
    const day = THREE.MathUtils.clamp(elevation / 8, 0, 1);
    this.daylight = day;
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(elevation) / 12, 0, 1) * (elevation > -12 ? 1 : 0);

    this.sun.intensity = day * 1.3;
    this.sun.color.copy(SUN_DUSK).lerp(SUN_DAY, THREE.MathUtils.clamp(elevation / 15, 0, 1));

    // Nacht-Minima bewusst niedrig (Exposure ist höher) → Nacht wirkt dunkel,
    // bleibt aber gerade noch lesbar.
    this.hemi.intensity = 0.08 + day * 0.95;
    this.ambient.intensity = 0.07 + day * 0.45;

    // Fog: nachts blau, tagsüber hell, in der Dämmerung warm getönt.
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, day).lerp(FOG_DUSK, dusk * 0.6);
      if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color);
    }

    // Sterne nur nachts sichtbar.
    this.starMat.opacity = THREE.MathUtils.clamp(1 - day * 2.5, 0, 1);
  }
}

/** Zufälliges Sternenfeld auf der oberen Halbkugel einer Kuppel. */
function makeStarField(radius: number): THREE.BufferGeometry {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(Math.random() * 2 - 1, Math.random() * 0.9 + 0.05, Math.random() * 2 - 1).normalize().multiplyScalar(radius);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geo;
}
