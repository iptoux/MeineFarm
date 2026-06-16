import * as THREE from "three";

/**
 * Dynamischer Bild-Himmel mit langsamem Tag/Nacht-Zyklus.
 *
 * Die sichtbare Skybox ist ein Low-Poly-Panorama auf einer innen gerenderten
 * Kugel. Der Tag/Nacht-Zyklus bleibt prozedural: Pro Frame werden
 * Sonnenrichtung, Lichtfarben/-staerken, Fog, Skybox-Tint und ein Sternenfeld an
 * die aktuelle Tageszeit angepasst. Die uebergebenen Lichter stammen aus dem
 * SceneManager und werden hier mutiert.
 */

/** Dauer eines vollen Tages in Sekunden (fuer Sichttests klein setzen). */
const DAY_LENGTH_SEC = 360;
/** Hoechster Sonnenstand mittags (Grad ueber dem Horizont). */
const MAX_ELEVATION = 60;
const SKY_RADIUS = 400;
const SKYBOX_URL = "/skybox/farm-lowpoly/panorama.png";

const FOG_DAY = new THREE.Color(0x9fc9e8);
const FOG_NIGHT = new THREE.Color(0x0b1626);
const FOG_DUSK = new THREE.Color(0xe8a06a);
const SUN_DAY = new THREE.Color(0xffffff);
const SUN_DUSK = new THREE.Color(0xff7a2a);
const SKY_TINT_DAY = new THREE.Color(0xffffff);
const SKY_TINT_NIGHT = new THREE.Color(0x14213a);
const SKY_TINT_DUSK = new THREE.Color(0xffd0a3);
const SKY_TINT_OVERCAST = new THREE.Color(0xaeb8c2);

export class SkyManager {
  /** Tageszeit in [0,1): 0 = Mitternacht, 0.25 = Sonnenaufgang, 0.5 = Mittag. */
  timeOfDay = 0.32;
  /** Zeitraffer-Faktor (1 = Echtzeit gemaess DAY_LENGTH_SEC). */
  speed = 1;

  /** Tageslicht-Faktor [0,1]: 0 = Nacht, 1 = heller Tag (fuer Wolkenschatten o.ae.). */
  daylight = 1;

  /** Normierte Sonnenrichtung (vom Boden zur Sonne) - fuer korrekt geneigte Wolkenschatten. */
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  readonly ready: Promise<void>;

  private readonly skyMat: THREE.MeshBasicMaterial;
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.PointsMaterial;
  private readonly sunVec = new THREE.Vector3();
  private readonly skyTint = new THREE.Color();
  private overcast = 0;
  private dusk = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemi: THREE.HemisphereLight,
    private readonly ambient: THREE.AmbientLight,
  ) {
    this.skyMat = new THREE.MeshBasicMaterial({
      color: SKY_TINT_DAY,
      depthWrite: false,
      fog: false,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    scene.add(sky);

    this.starMat = new THREE.PointsMaterial({
      color: 0xfdfdff,
      size: 2.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // leuchten gegen den dunklen Nachthimmel
    });
    // Innerhalb der Sky-Kugel, damit sie nie verdeckt werden.
    this.stars = new THREE.Points(makeStarField(SKY_RADIUS * 0.42), this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.ready = this.loadSkybox();
    this.apply();
  }

  /** Rueckt die Tageszeit vor und aktualisiert Himmel, Licht, Fog und Sterne. */
  update(dt: number): void {
    this.timeOfDay = (this.timeOfDay + (dt * this.speed) / DAY_LENGTH_SEC) % 1;
    this.apply();
  }

  /**
   * Truebt den Bildhimmel ein (0 = klar, 1 = milchig-grau).
   * Vom WeatherManager nach `update()` gesetzt. `apply()` schreibt die
   * Tageszeit-Tint, danach mischt diese Methode Wettergrau hinein.
   */
  setOvercast(amount: number): void {
    this.overcast = THREE.MathUtils.clamp(amount, 0, 1);
    this.updateSkyTint();
  }

  private apply(): void {
    // Sonnenstand aus der Tageszeit: Horizont bei 0.25/0.75, Hochstand bei 0.5.
    const elevation = MAX_ELEVATION * Math.sin(2 * Math.PI * (this.timeOfDay - 0.25));
    const azimuth = this.timeOfDay * 360 - 90;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunVec.setFromSphericalCoords(1, phi, theta);
    this.sunDir.copy(this.sunVec); // Einheitsvektor fuer Wolkenschatten-Neigung

    // Gerichtetes Sonnenlicht folgt der Sonne (Schatten drehen mit).
    this.sun.position.copy(this.sunVec).multiplyScalar(60);

    // Mischfaktoren: Tageslicht und Daemmerungs-Waerme nahe am Horizont.
    const day = THREE.MathUtils.clamp(elevation / 8, 0, 1);
    this.daylight = day;
    this.dusk = THREE.MathUtils.clamp(1 - Math.abs(elevation) / 12, 0, 1) * (elevation > -12 ? 1 : 0);

    this.sun.intensity = day * 1.3;
    this.sun.color.copy(SUN_DUSK).lerp(SUN_DAY, THREE.MathUtils.clamp(elevation / 15, 0, 1));

    // Nacht-Minima bewusst niedrig (Exposure ist hoeher) -> Nacht bleibt lesbar.
    this.hemi.intensity = 0.08 + day * 0.95;
    this.ambient.intensity = 0.07 + day * 0.45;

    // Fog: nachts blau, tagsueber hell, in der Daemmerung warm getoent.
    const fog = this.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, day).lerp(FOG_DUSK, this.dusk * 0.6);
      if (this.scene.background instanceof THREE.Color) this.scene.background.copy(fog.color);
    }

    this.updateSkyTint();

    // Sterne nur nachts sichtbar.
    this.starMat.opacity = THREE.MathUtils.clamp(1 - day * 2.5, 0, 1);
  }

  private async loadSkybox(): Promise<void> {
    const tex = await new THREE.TextureLoader().loadAsync(SKYBOX_URL);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    this.skyMat.map = tex;
    this.skyMat.needsUpdate = true;
  }

  private updateSkyTint(): void {
    this.skyTint.copy(SKY_TINT_NIGHT).lerp(SKY_TINT_DAY, this.daylight);
    this.skyTint.lerp(SKY_TINT_DUSK, this.dusk * 0.22);
    this.skyTint.lerp(SKY_TINT_OVERCAST, this.overcast * 0.45);
    this.skyMat.color.copy(this.skyTint);
  }
}

/** Zufaelliges Sternenfeld auf der oberen Halbkugel einer Kuppel. */
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
