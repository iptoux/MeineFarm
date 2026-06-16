import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { FieldBounds } from "../game/config/chunks";

/** Radius um den Kamera-Zielpunkt, innerhalb dessen Dächer beim Zoom ausblenden. */
const FADE_RADIUS = 10;

/**
 * Kapselt Renderer, Scene, Kamera, Steuerung und Licht.
 * Stellt scene/camera/renderer für andere Module bereit und rendert pro Frame.
 */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  /** Lichter werden vom SkyManager pro Frame an die Tageszeit angepasst. */
  readonly hemi!: THREE.HemisphereLight;
  readonly ambient!: THREE.AmbientLight;
  readonly sun!: THREE.DirectionalLight;

  /** Geschwindigkeit der WASD-Bewegung (Welt-Einheiten/Sekunde). */
  private panSpeed = 12;
  private keys = new Set<string>();
  private fadeMeshes: THREE.Mesh[] = [];
  private tmpFade = new THREE.Vector3();
  private lastTime = performance.now();
  /** Begrenzung für den Kamera-Zielpunkt (Spielfeld + Rand); null = unbegrenzt. */
  private panBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.scene.background = new THREE.Color(0x87ceeb); // Himmelblau (Fallback, vom Sky überdeckt)
    // Dunst am Horizont: blendet die Bodenkante zum Himmel über. Farbe animiert
    // der SkyManager pro Frame an die Tageszeit.
    this.scene.fog = new THREE.Fog(0x87ceeb, 70, 180);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(9, 6, 14);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tone-Mapping für saubere Farbverläufe des atmosphärischen Sky.
    // Neutral (Khronos PBR) entsättigt weniger als ACES → der Himmel bleibt
    // satt blau statt blass auszuwaschen.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.85;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 40;
    // Vertikalen Kamerawinkel begrenzen: nicht unter die Map (Horizont) und nicht
    // senkrecht von oben über die Stern-Kuppel hinaus schauen.
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.18;
    // Pan (rechte Maustaste) entlang des Bodens statt der Bildschirmebene → der
    // Blickpunkt driftet nicht in die Höhe (kein Blick unter die Map).
    this.controls.screenSpacePanning = false;
    this.controls.target.set(0, 1.2, 0);

    this.setupLights();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  /** Registriert Meshes (z.B. Dach), die beim Nah-Zoomen transparent werden. */
  setFadeOnZoom(meshes: THREE.Mesh[]): void {
    this.fadeMeshes = meshes;
  }

  /** Begrenzt das Kamera-Panning auf das Spielfeld (mit etwas Rand). */
  setPanBounds(f: FieldBounds): void {
    const pad = 8;
    this.panBounds = { minX: f.minX - pad, maxX: f.maxX + pad, minZ: f.minZ - pad, maxZ: f.maxZ + pad };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k === "w" || k === "a" || k === "s" || k === "d") this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  /** WASD verschiebt Kamera + Zielpunkt entlang des Bodens (Panning). */
  private updatePan(dt: number): void {
    if (this.keys.size === 0) return;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();

    const move = new THREE.Vector3();
    if (this.keys.has("w")) move.add(forward);
    if (this.keys.has("s")) move.sub(forward);
    if (this.keys.has("d")) move.add(right);
    if (this.keys.has("a")) move.sub(right);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(this.panSpeed * dt);

    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  /**
   * Hält den Kamera-Zielpunkt im Feld (mit Rand) – gilt für WASD- UND OrbitControls-
   * Pan (rechte Maustaste). Die Kamera wird um dieselbe Korrektur mitgezogen, damit
   * Blickrichtung/Zoom erhalten bleiben.
   */
  private clampPan(): void {
    const b = this.panBounds;
    if (!b) return;
    const t = this.controls.target;
    const cx = THREE.MathUtils.clamp(t.x, b.minX, b.maxX);
    const cz = THREE.MathUtils.clamp(t.z, b.minZ, b.maxZ);
    if (cx === t.x && cz === t.z) return;
    this.camera.position.x += cx - t.x;
    this.camera.position.z += cz - t.z;
    t.x = cx;
    t.z = cz;
  }

  /**
   * Blendet Dächer beim Nah-Zoomen aus – aber nur die des fokussierten Gebäudes
   * (nahe am Kamera-Zielpunkt), nicht entfernte Gebäude. Bei vollem Zoom geht die
   * Deckkraft auf 0, damit das Dach sauber verschwindet statt als (rötlich
   * durchscheinender) Geist stehen zu bleiben.
   */
  private updateFade(): void {
    if (this.fadeMeshes.length === 0) return;
    const dist = this.controls.getDistance();
    // weit (>=14) volldeckend, nah (<=8) ganz transparent
    const zoomT = THREE.MathUtils.clamp((dist - 8) / (14 - 8), 0, 1);
    const tx = this.controls.target.x;
    const tz = this.controls.target.z;
    for (const mesh of this.fadeMeshes) {
      mesh.getWorldPosition(this.tmpFade);
      const horiz = Math.hypot(this.tmpFade.x - tx, this.tmpFade.z - tz);
      // Nur das fokussierte Gebäude (Dach nahe am Zielpunkt) ausblenden.
      const opacity = horiz <= FADE_RADIUS ? zoomT : 1;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = opacity;
      mat.depthWrite = opacity > 0.95;
      mesh.visible = opacity > 0.02;
    }
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x4a7d3a, 1.0);
    this.scene.add(hemi);
    (this as { hemi: THREE.HemisphereLight }).hemi = hemi;

    // Sanftes Fülllicht, damit das Stallinnere im Dachschatten lesbar bleibt
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambient);
    (this as { ambient: THREE.AmbientLight }).ambient = ambient;

    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(12, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 25;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.far = 60;
    // Sonne folgt der Tageszeit -> Schatten-Frustum dem Kamerafokus nachführen.
    sun.target.position.set(0, 0, 0);
    this.scene.add(sun.target);
    this.scene.add(sun);
    (this as { sun: THREE.DirectionalLight }).sun = sun;
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  render(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.updatePan(dt);
    this.updateFade();
    this.controls.update();
    this.clampPan(); // nach update(): auch OrbitControls-Pan (rechte Maustaste) begrenzen
    this.renderer.render(this.scene, this.camera);
  }
}
