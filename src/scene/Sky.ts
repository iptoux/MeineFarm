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
/** Anteil des Zyklus, in dem die Sonne ueber dem Horizont steht (Tag 2x so lang wie Nacht). */
const DAY_FRACTION = 2 / 3;
/** Hoechster Sonnenstand mittags (Grad ueber dem Horizont). */
const MAX_ELEVATION = 60;
const SKY_RADIUS = 1400;
const SKYBOX_URL = "/skybox/farm-lowpoly/panorama.png";
const HORIZON_RADIUS = 360;
const SKY_CLOUD_RADIUS = 470;

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
  private readonly sky: THREE.Mesh;
  private readonly horizon: THREE.Group;
  private readonly skyClouds: THREE.Group;
  private readonly skyCloudMats: THREE.MeshBasicMaterial[];
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
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    this.horizon = makeDistantHorizon(HORIZON_RADIUS);
    scene.add(this.horizon);

    const clouds = makeSkyboxClouds(SKY_CLOUD_RADIUS);
    this.skyClouds = clouds.group;
    this.skyCloudMats = clouds.materials;
    scene.add(this.skyClouds);

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

    this.sky.onBeforeRender = (_renderer, _scene, camera) => {
      this.sky.position.copy(camera.position);
      this.stars.position.copy(camera.position);
      this.skyClouds.position.copy(camera.position);
      this.horizon.position.set(camera.position.x, 0, camera.position.z);
    };

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
    // Tageszeit -> Sonnenphase verzerren, damit der Tag laenger ist als die Nacht.
    // Die Uhrzeit (timeOfDay) laeuft linear weiter; nur der Sonnenbogen wird gestreckt.
    const p = phaseFromTime(this.timeOfDay);
    // Sonnenstand aus der Phase: Horizont bei 0.25/0.75, Hochstand bei 0.5.
    const elevation = MAX_ELEVATION * Math.sin(2 * Math.PI * (p - 0.25));
    const azimuth = p * 360 - 90;
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
    this.horizon.visible = this.daylight > 0.05 || this.dusk > 0.15;
    this.skyClouds.visible = this.horizon.visible;
    for (const mat of this.skyCloudMats) {
      mat.color.copy(SKY_TINT_NIGHT).lerp(new THREE.Color(0xfff1d2), this.daylight);
      mat.color.lerp(SKY_TINT_DUSK, this.dusk * 0.18);
      mat.color.lerp(SKY_TINT_OVERCAST, this.overcast * 0.35);
      mat.opacity = THREE.MathUtils.lerp(0.2, 0.82, this.daylight) * (1 - this.overcast * 0.25);
    }
  }
}

function makeDistantHorizon(radius: number): THREE.Group {
  const group = new THREE.Group();
  group.renderOrder = -900;

  const mountainBack = new THREE.MeshBasicMaterial({
    color: 0x948daa,
    depthWrite: false,
    fog: false,
    opacity: 0.78,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const mountainFront = new THREE.MeshBasicMaterial({
    color: 0xa99470,
    depthWrite: false,
    fog: false,
    opacity: 0.72,
    side: THREE.DoubleSide,
    transparent: true,
  });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const width = THREE.MathUtils.degToRad(8 + ((i * 17) % 7));
    const height = 5.2 + ((i * 11) % 5) * 0.7;
    const base = -7.8 + ((i * 5) % 4) * 0.2;
    group.add(makeHorizonTriangle(radius, a, width, base, height, mountainBack, -8));
  }

  for (let i = 0; i < 20; i++) {
    const a = ((i + 0.35) / 20) * Math.PI * 2;
    const width = THREE.MathUtils.degToRad(12 + ((i * 13) % 9));
    const height = 2.6 + ((i * 7) % 5) * 0.4;
    group.add(makeHorizonTriangle(radius * 0.94, a, width, -5.4, height, mountainFront, -6));
  }

  return group;
}

function makeSkyboxClouds(radius: number): { group: THREE.Group; materials: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  group.renderOrder = -960;
  const materials: THREE.MeshBasicMaterial[] = [];
  const specs = [
    { a: 0.08, y: 68, w: 46, h: 12 },
    { a: 0.22, y: 112, w: 72, h: 18 },
    { a: 0.36, y: 82, w: 58, h: 14 },
    { a: 0.51, y: 128, w: 50, h: 11 },
    { a: 0.64, y: 92, w: 76, h: 17 },
    { a: 0.79, y: 118, w: 60, h: 15 },
    { a: 0.91, y: 72, w: 54, h: 13 },
  ];

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff1d2,
      depthWrite: false,
      fog: false,
      opacity: 0.78,
      side: THREE.DoubleSide,
      transparent: true,
    });
    materials.push(mat);
    const cloud = makeLowPolyCloud(s.w, s.h, mat);
    const angle = s.a * Math.PI * 2;
    cloud.position.set(Math.sin(angle) * radius, s.y, Math.cos(angle) * radius);
    cloud.lookAt(0, s.y, 0);
    cloud.rotateZ((i % 2 === 0 ? -1 : 1) * THREE.MathUtils.degToRad(2 + (i % 3)));
    cloud.frustumCulled = false;
    cloud.renderOrder = -960;
    group.add(cloud);
  }

  return { group, materials };
}

function makeLowPolyCloud(width: number, height: number, material: THREE.Material): THREE.Mesh {
  const hw = width / 2;
  const hh = height / 2;
  const points = [
    new THREE.Vector2(-hw, -hh * 0.2),
    new THREE.Vector2(-hw * 0.82, hh * 0.55),
    new THREE.Vector2(-hw * 0.48, hh * 0.95),
    new THREE.Vector2(-hw * 0.15, hh * 0.62),
    new THREE.Vector2(hw * 0.12, hh),
    new THREE.Vector2(hw * 0.48, hh * 0.72),
    new THREE.Vector2(hw * 0.86, hh * 0.35),
    new THREE.Vector2(hw, -hh * 0.15),
    new THREE.Vector2(hw * 0.38, -hh * 0.52),
    new THREE.Vector2(-hw * 0.28, -hh * 0.45),
  ];
  return new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(points)), material);
}

function makeHorizonTriangle(
  radius: number,
  angle: number,
  width: number,
  baseY: number,
  height: number,
  material: THREE.Material,
  renderOrder: number,
): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const left = pointOnCircle(radius, angle - width / 2, baseY);
  const right = pointOnCircle(radius, angle + width / 2, baseY);
  const peak = pointOnCircle(radius, angle, baseY + height);
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([left.x, left.y, left.z, right.x, right.y, right.z, peak.x, peak.y, peak.z], 3),
  );
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}

function pointOnCircle(radius: number, angle: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
}

/**
 * Verzerrt die lineare Tageszeit `t` [0,1) in eine Sonnenphase `p` [0,1), sodass der
 * Tag (Sonne ueber Horizont, p in (0.25,0.75)) `DAY_FRACTION` des Zyklus einnimmt und
 * die Nacht den Rest. Stueckweise linear, stetig & monoton. Mittag (p=0.5) bleibt bei
 * t=0.5, daher zeigt die Uhr weiter 12:00 zum Sonnenhochstand.
 */
function phaseFromTime(t: number): number {
  const nightHalf = (1 - DAY_FRACTION) / 2; // halbe Nacht je Seite (vor Aufgang / nach Untergang)
  if (t < nightHalf) return (t / nightHalf) * 0.25; // Nacht bis Sonnenaufgang
  if (t < nightHalf + DAY_FRACTION) {
    return 0.25 + ((t - nightHalf) / DAY_FRACTION) * 0.5; // Tag
  }
  return 0.75 + ((t - nightHalf - DAY_FRACTION) / nightHalf) * 0.25; // Nacht nach Untergang
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
