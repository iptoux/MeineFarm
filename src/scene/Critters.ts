import * as THREE from "three";
import type { GameState, PlacedBuilding } from "../game/GameState";
import { getBuilding } from "../game/config/buildings";
import { roadCellCenter, ROAD_TILE } from "../game/config/roads";
import type { AnimalModels } from "./AnimalModels";
import { FLOOR_TOP_Y } from "./Building";

/**
 * Lebendige Deko-Tiere, die nicht zum Spielzustand gehören: ein streunender
 * Hund, der den Hof durchstreift (mit Pathfinding um/ in Gebäude), und
 * gelegentliche Frösche, die über eine Straße hüpfen. Pro Spielstand erzeugt,
 * liest direkt aus dem GameState (Gebäude-Footprints, Straßen) und wird beim
 * Sitzungswechsel wieder aus der Szene entfernt.
 */

/** Halbe Kantenlänge des begehbaren Bereichs (x/z). */
const AREA = 40;
/** Zellgröße des Navigationsgitters. */
const CELL = 2;
const GRID_N = Math.ceil((2 * AREA) / CELL);
/** Halbe Breite der „Tür"-Öffnung an der offenen Gebäudevorderseite. */
const DOOR_HALF = 1.8;

export class CritterManager {
  private dog: Dog | null = null;
  private frogs: Frog[] = [];
  private frogTimer = randFloat(8, 20);
  private hearts: HeartBurst;

  constructor(
    private scene: THREE.Scene,
    private state: GameState,
    private models: AnimalModels,
  ) {
    const model = models.get("shiba");
    if (model) this.dog = new Dog(scene, state, model, models.getClips("shiba"));
    this.hearts = new HeartBurst(scene, models.getHeart());
  }

  update(dt: number): void {
    this.dog?.update(dt);
    this.hearts.update(dt);
    this.updateFrogs(dt);
  }

  /** Anklickbare Meshes des Hundes (für den Picker). */
  dogPickables(): THREE.Object3D[] {
    return this.dog ? this.dog.pickMeshes() : [];
  }

  /**
   * Friert den Hund ein (Auswahl), lässt ihn zur Kamera blicken und liefert seine
   * Welt-Kopfposition (für die Kamerafahrt).
   */
  selectDog(cameraPos: THREE.Vector3): THREE.Vector3 | null {
    if (!this.dog) return null;
    this.dog.setSelected(true);
    this.dog.faceTowards(cameraPos);
    return this.dog.headWorldPos();
  }

  /** Hebt die Auswahl auf — der Hund läuft wieder los. */
  deselectDog(): void {
    this.dog?.setSelected(false);
  }

  feedDog(): void {
    this.dog?.feed();
  }

  petDog(): void {
    if (!this.dog) return;
    this.dog.pet();
    this.hearts.spawn(this.dog.headWorldPos());
  }

  playWithDog(): void {
    this.dog?.play();
  }

  private updateFrogs(dt: number): void {
    for (let i = this.frogs.length - 1; i >= 0; i--) {
      if (this.frogs[i].update(dt)) {
        this.scene.remove(this.frogs[i].object);
        this.frogs.splice(i, 1);
      }
    }

    this.frogTimer -= dt;
    if (this.frogTimer > 0) return;
    this.frogTimer = randFloat(20, 45);

    // Selten, nur über vorhandene Straßen und maximal zwei gleichzeitig.
    if (this.frogs.length >= 2 || this.state.roads.length === 0) return;
    const model = this.models.get("frog");
    if (!model) return;
    const frog = Frog.tryCreate(this.state, model, this.models.getClips("frog"));
    if (frog) {
      this.scene.add(frog.object);
      this.frogs.push(frog);
    }
  }

  dispose(): void {
    if (this.dog) this.scene.remove(this.dog.object);
    for (const f of this.frogs) this.scene.remove(f.object);
    this.hearts.dispose();
    this.frogs = [];
    this.dog = null;
  }
}

// ---------------------------------------------------------------------------
// Herzen (Streichel-Effekt)
// ---------------------------------------------------------------------------

const HEART_LIFETIME = 1.1; // Sekunden

/** Kleine 3D-Herzen, die beim Streicheln über dem Hund aufsteigen und verblassen. */
class HeartBurst {
  private hearts: { obj: THREE.Object3D; vel: THREE.Vector3; life: number }[] = [];

  constructor(
    private scene: THREE.Scene,
    private template: THREE.Object3D | null,
  ) {}

  spawn(pos: THREE.Vector3, count = 5): void {
    if (!this.template) return;
    for (let i = 0; i < count; i++) {
      const obj = this.template.clone(true);
      obj.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.2, pos.z + (Math.random() - 0.5) * 0.4);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6);
      this.scene.add(obj);
      this.hearts.push({ obj, vel, life: HEART_LIFETIME });
    }
  }

  update(dt: number): void {
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.life -= dt;
      if (h.life <= 0) {
        this.scene.remove(h.obj);
        this.hearts.splice(i, 1);
        continue;
      }
      h.obj.position.addScaledVector(h.vel, dt);
      h.obj.rotation.y += dt * 2;
      // Sanft einploppen und wieder schrumpfen (sin-Hüllkurve über die Lebenszeit).
      const t = h.life / HEART_LIFETIME;
      h.obj.scale.setScalar(Math.max(0.01, Math.sin(t * Math.PI)));
    }
  }

  dispose(): void {
    for (const h of this.hearts) this.scene.remove(h.obj);
    this.hearts = [];
  }
}

// ---------------------------------------------------------------------------
// Hund
// ---------------------------------------------------------------------------

type DogState = "walk" | "pause" | "action";

/** Höhe der Hunde-Schnauze über dem Boden (Modell auf Größe 2.0 normalisiert). */
const DOG_HEAD_Y = 1.3;

class Dog {
  readonly object: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private walkAction: THREE.AnimationAction | null;
  private gallopAction: THREE.AnimationAction | null;
  private pauseActions: THREE.AnimationAction[] = [];
  private feedAction: THREE.AnimationAction | null;
  private petAction: THREE.AnimationAction | null;
  private playAction: THREE.AnimationAction | null;
  private current: THREE.AnimationAction | null = null;

  private state: DogState = "pause";
  private path: THREE.Vector2[] = [];
  private speed = 2.2;
  private pauseTimer = randFloat(1, 3);
  private actionTimer = 0;
  private heading = 0;
  private yCurrent = 0;
  /** Angeklickt/ausgewählt: Hund bleibt stehen, bis wieder deselektiert wird. */
  private selected = false;
  /** Ziel-Blickrichtung (zur Kamera), solange ausgewählt; null = keine. */
  private faceTarget: number | null = null;
  private pickMeshCache: THREE.Object3D[] | null = null;

  constructor(
    scene: THREE.Scene,
    private gameState: GameState,
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
  ) {
    this.object = model;
    const start = this.freePoint();
    this.object.position.set(start.x, 0, start.y);
    scene.add(this.object);

    this.mixer = new THREE.AnimationMixer(this.object);
    this.walkAction = makeAction(this.mixer, clips, ["walk"]);
    this.gallopAction = makeAction(this.mixer, clips, ["gallop"]);
    for (const needles of [["idle_2_headlow"], ["eating"], ["idle_2"], ["idle"]]) {
      const a = makeAction(this.mixer, clips, needles);
      if (a) this.pauseActions.push(a);
    }
    // Aktions-Animationen. Achtung: clipAction liefert pro Clip dieselbe Instanz
    // wie die Pause-Idles → der Loop-Modus wird daher pro switchTo() gesetzt,
    // nicht hier (sonst würden geteilte Idle-Clips nicht mehr loopen).
    this.feedAction = makeAction(this.mixer, clips, ["eating"]);
    this.petAction = makeAction(this.mixer, clips, ["idle_2_headlow", "idle_2"]);
    this.playAction = makeAction(this.mixer, clips, ["jump_toidle", "gallop_jump"]);
    this.switchTo(this.pauseActions[this.pauseActions.length - 1] ?? this.walkAction);
  }

  update(dt: number): void {
    this.mixer.update(dt);

    if (this.state === "action") {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) this.endAction();
      return;
    }

    // Ausgewählt → eingefroren: nur Idle, dabei sanft zur Kamera drehen.
    if (this.selected) {
      if (this.faceTarget !== null) {
        this.heading = lerpAngle(this.heading, this.faceTarget, Math.min(1, dt * 6));
        this.object.rotation.y = this.heading;
      }
      return;
    }

    if (this.state === "pause") {
      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0) this.startWalk();
      return;
    }

    this.followPath(dt);
  }

  // --- Auswahl / Aktionen --------------------------------------------------

  /** Anklickbare Meshes (gecacht; setzt einmalig das Picker-`userData`). */
  pickMeshes(): THREE.Object3D[] {
    if (!this.pickMeshCache) {
      const meshes: THREE.Object3D[] = [];
      this.object.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.userData = { kind: "dog" };
          meshes.push(o);
        }
      });
      this.pickMeshCache = meshes;
    }
    return this.pickMeshCache;
  }

  /** Welt-Position der Schnauze (für Kamerafokus und Herzen). */
  headWorldPos(): THREE.Vector3 {
    return new THREE.Vector3(this.object.position.x, this.object.position.y + DOG_HEAD_Y, this.object.position.z);
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    if (selected) {
      this.path = [];
      if (this.state !== "action") {
        this.state = "pause";
        this.switchTo(this.idleAction());
      }
    } else {
      this.faceTarget = null;
      if (this.state !== "action") this.beginPause();
    }
  }

  /** Lässt den Hund (sanft) zu einem Weltpunkt blicken (z.B. zur Kamera). */
  faceTowards(point: THREE.Vector3): void {
    this.faceTarget = Math.atan2(point.x - this.object.position.x, point.z - this.object.position.z);
  }

  feed(): void {
    this.triggerAction(this.feedAction);
  }

  pet(): void {
    this.triggerAction(this.petAction);
  }

  play(): void {
    this.triggerAction(this.playAction);
  }

  /** Startet eine einmalige Aktions-Animation (unterbricht Laufen/Idle). */
  private triggerAction(action: THREE.AnimationAction | null): void {
    if (!action) return;
    this.path = [];
    this.state = "action";
    this.switchTo(action, true);
    const dur = action.getClip().duration;
    this.actionTimer = Math.min(dur > 0 ? dur : 2.5, 2.5);
  }

  /** Nach einer Aktion: bei Auswahl ruhig stehen bleiben, sonst weiterstreunen. */
  private endAction(): void {
    if (this.selected) {
      this.state = "pause";
      this.switchTo(this.idleAction());
    } else {
      this.beginPause();
    }
  }

  /** Ruhige Idle-Animation (Fallback: Laufen). */
  private idleAction(): THREE.AnimationAction | null {
    return this.pauseActions[this.pauseActions.length - 1] ?? this.walkAction;
  }

  /** Sucht ein neues Ziel und plant den Weg dorthin. */
  private startWalk(): void {
    const from = new THREE.Vector2(this.object.position.x, this.object.position.z);
    // Selten ein Punkt im Inneren eines Gebäudes („Besuch"), sonst freies Gras.
    const goal = Math.random() < 0.22 ? this.buildingVisitPoint() : this.freePoint();
    const path = planPath(this.gameState.buildings, from, goal);
    if (!path || path.length === 0) {
      this.pauseTimer = randFloat(0.5, 1.5); // nichts gefunden → kurz warten, neu versuchen
      return;
    }
    this.path = path;
    const dist = from.distanceTo(goal);
    const gallop = dist > 18 && this.gallopAction !== null;
    this.speed = gallop ? 5 : 2.2;
    this.switchTo(gallop ? this.gallopAction! : this.walkAction ?? this.current);
    this.state = "walk";
  }

  private followPath(dt: number): void {
    const pos = this.object.position;
    const target = this.path[0];
    const dx = target.x - pos.x;
    const dz = target.y - pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.5) {
      this.path.shift();
      if (this.path.length === 0) this.beginPause();
      return;
    }

    const step = Math.min(this.speed * dt, dist);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;

    // Sanft in Laufrichtung drehen.
    const targetHeading = Math.atan2(dx, dz);
    this.heading = lerpAngle(this.heading, targetHeading, Math.min(1, dt * 6));
    this.object.rotation.y = this.heading;

    // Höhe: im Gebäude-Footprint auf dem erhöhten Boden, sonst auf y=0.
    const targetY = insideAnyBuilding(this.gameState.buildings, pos.x, pos.z) ? FLOOR_TOP_Y : 0;
    this.yCurrent += (targetY - this.yCurrent) * Math.min(1, dt * 5);
    pos.y = this.yCurrent;
  }

  private beginPause(): void {
    this.state = "pause";
    this.pauseTimer = randFloat(2.5, 6);
    if (this.pauseActions.length > 0) {
      this.switchTo(this.pauseActions[Math.floor(Math.random() * this.pauseActions.length)]);
    }
  }

  private switchTo(next: THREE.AnimationAction | null, force = false): void {
    if (!next) return;
    if (next === this.current && !force) return;
    // `force` = einmalige Aktion (am Ende stehen bleiben); sonst Endlos-Loop.
    // Wird pro Aufruf gesetzt, weil Aktions-/Idle-Clips dieselbe Instanz teilen.
    if (force) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.reset();
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, 0.3, false);
    this.current = next;
  }

  /** Zufälliger, nicht von Gebäuden belegter Punkt im Feld. */
  private freePoint(): THREE.Vector2 {
    for (let i = 0; i < 30; i++) {
      const p = new THREE.Vector2(THREE.MathUtils.randFloatSpread(2 * AREA), THREE.MathUtils.randFloatSpread(2 * AREA));
      if (!blockedByBuildings(this.gameState.buildings, p.x, p.y)) return p;
    }
    return new THREE.Vector2(0, 12);
  }

  /** Mittelpunkt eines zufälligen Stalls (Ziel für einen „Besuch"); sonst freier Punkt. */
  private buildingVisitPoint(): THREE.Vector2 {
    const barns = this.gameState.buildings.filter((b) => (getBuilding(b.defId)?.slotCount ?? 0) > 0);
    if (barns.length === 0) return this.freePoint();
    const b = barns[Math.floor(Math.random() * barns.length)];
    return new THREE.Vector2(b.x, b.z);
  }
}

// ---------------------------------------------------------------------------
// Frosch
// ---------------------------------------------------------------------------

class Frog {
  private hopFrom = new THREE.Vector2();
  private hopTo = new THREE.Vector2();
  private hopT = 1;
  private hopDur = 0.5;
  private heading = 0;
  private mixer: THREE.AnimationMixer;

  private constructor(
    readonly object: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private waypoints: THREE.Vector2[],
  ) {
    const start = waypoints[0];
    object.position.set(start.x, 0, start.y);
    this.mixer = new THREE.AnimationMixer(object);
    const jump = makeAction(this.mixer, clips, ["jump"]) ?? makeAction(this.mixer, clips, ["idle"]);
    jump?.play();
    this.nextHop();
  }

  /** Erzeugt einen Frosch, der eine zufällige Straße quert; null, wenn keine Straße passt. */
  static tryCreate(state: GameState, model: THREE.Object3D, clips: THREE.AnimationClip[]): Frog | null {
    const road = state.roads[Math.floor(Math.random() * state.roads.length)];
    if (!road) return null;
    const c = roadCellCenter(road.gx, road.gz);

    // Straßenverlauf aus Nachbarzellen: horizontal (x) oder vertikal (z)?
    const horizontal = state.hasRoad(road.gx - 1, road.gz) || state.hasRoad(road.gx + 1, road.gz);
    const along = horizontal ? new THREE.Vector2(1, 0) : new THREE.Vector2(0, 1);
    const perp = new THREE.Vector2(-along.y, along.x);
    const side = Math.random() < 0.5 ? 1 : -1;

    const center = new THREE.Vector2(c.x, c.z);
    const off = ROAD_TILE / 2 + 1.6; // im Gras knapp neben der Straße
    const travel = (1 + Math.floor(Math.random() * 2)) * ROAD_TILE; // 1–2 Kacheln am Verlauf entlang
    const dir = Math.random() < 0.5 ? 1 : -1;

    const waypoints = [
      center.clone().addScaledVector(perp, side * off), // Start im Gras
      center.clone(), // auf die Straße
      center.clone().addScaledVector(along, dir * travel), // ein Stück am Verlauf entlang
      center.clone().addScaledVector(along, dir * travel).addScaledVector(perp, -side * off), // ins Gras der anderen Seite
    ];
    return new Frog(model, clips, waypoints);
  }

  /** Gibt true zurück, wenn der Frosch fertig ist (verschwinden). */
  update(dt: number): boolean {
    this.mixer.update(dt);
    this.hopT += dt / this.hopDur;
    if (this.hopT >= 1) {
      this.object.position.set(this.hopTo.x, 0, this.hopTo.y);
      if (this.waypoints.length === 0) return true;
      this.nextHop();
      return false;
    }

    // Bogen: linear in x/z, parabelförmig in y.
    const t = this.hopT;
    this.object.position.x = THREE.MathUtils.lerp(this.hopFrom.x, this.hopTo.x, t);
    this.object.position.z = THREE.MathUtils.lerp(this.hopFrom.y, this.hopTo.y, t);
    this.object.position.y = Math.sin(Math.PI * t) * 0.5;
    this.object.rotation.y = this.heading;
    return false;
  }

  /** Setzt den nächsten Sprung (fester Hüpf-Abstand Richtung nächstem Wegpunkt). */
  private nextHop(): void {
    const pos = new THREE.Vector2(this.object.position.x, this.object.position.z);
    let target = this.waypoints[0];
    const toTarget = target.clone().sub(pos);
    if (toTarget.length() < 0.4) {
      this.waypoints.shift();
      target = this.waypoints[0] ?? target;
    }
    const dir = target.clone().sub(pos);
    const len = dir.length();
    const hop = Math.min(1.3, len);
    if (len > 1e-3) dir.multiplyScalar(hop / len);

    this.hopFrom.copy(pos);
    this.hopTo.copy(pos).add(dir);
    this.hopT = 0;
    this.hopDur = 0.45;
    this.heading = Math.atan2(dir.x, dir.y);
  }
}

// ---------------------------------------------------------------------------
// Pathfinding-Helfer (grobes Belegungsgitter + A*)
// ---------------------------------------------------------------------------

/** Lokale Koordinaten eines Weltpunkts relativ zu einem (gedrehten) Gebäude. */
function toLocal(b: PlacedBuilding, x: number, z: number): { lx: number; lz: number } {
  const cos = Math.cos(b.rotation);
  const sin = Math.sin(b.rotation);
  const dx = x - b.x;
  const dz = z - b.z;
  return { lx: dx * cos + dz * sin, lz: -dx * sin + dz * cos };
}

/**
 * Liegt der Punkt in einem Gebäude-Footprint (und NICHT im vorderen Tür-Korridor
 * eines Stalls)? `cellHalf` weitet die Prüfung auf eine Rasterzelle aus, damit auch
 * dünne Hindernisse (Zäune) zuverlässig blockieren, statt zwischen Zellen zu rutschen.
 */
function blockedByBuildings(buildings: PlacedBuilding[], x: number, z: number, pad = 0.4, cellHalf = 0): boolean {
  for (const b of buildings) {
    const def = getBuilding(b.defId);
    if (!def) continue;
    const { lx, lz } = toLocal(b, x, z);
    if (Math.abs(lx) <= def.width / 2 + pad + cellHalf && Math.abs(lz) <= def.depth / 2 + pad + cellHalf) {
      // Nur Ställe (mit Slots) haben eine offene Vorderseite zum Betreten; Zäune blockieren ganz.
      if (def.slotCount > 0 && lz >= -0.2 && Math.abs(lx) <= DOOR_HALF) continue;
      return true;
    }
  }
  return false;
}

/** Steht der Punkt innerhalb eines Gebäude-Footprints (für die Höhe)? */
function insideAnyBuilding(buildings: PlacedBuilding[], x: number, z: number): boolean {
  for (const b of buildings) {
    const def = getBuilding(b.defId);
    if (!def) continue;
    const { lx, lz } = toLocal(b, x, z);
    if (Math.abs(lx) <= def.width / 2 && Math.abs(lz) <= def.depth / 2) return true;
  }
  return false;
}

function cellToWorld(c: number): number {
  return -AREA + (c + 0.5) * CELL;
}
function worldToCellIdx(w: number): number {
  return THREE.MathUtils.clamp(Math.floor((w + AREA) / CELL), 0, GRID_N - 1);
}

/** A* auf einem groben Gitter; liefert Wegpunkte (Welt-x/z) oder null. */
function planPath(buildings: PlacedBuilding[], from: THREE.Vector2, to: THREE.Vector2): THREE.Vector2[] | null {
  const blocked = new Uint8Array(GRID_N * GRID_N);
  for (let cz = 0; cz < GRID_N; cz++) {
    for (let cx = 0; cx < GRID_N; cx++) {
      if (blockedByBuildings(buildings, cellToWorld(cx), cellToWorld(cz), 0.4, CELL / 2)) blocked[cz * GRID_N + cx] = 1;
    }
  }

  const sx = worldToCellIdx(from.x);
  const sz = worldToCellIdx(from.y);
  const gx = worldToCellIdx(to.x);
  const gz = worldToCellIdx(to.y);
  const startIdx = sz * GRID_N + sx;
  const goalIdx = gz * GRID_N + gx;
  blocked[startIdx] = 0; // Start nie blockiert (Hund könnte am Rand stehen)
  if (blocked[goalIdx]) return null;

  const open: number[] = [startIdx];
  const came = new Map<number, number>();
  const g = new Float32Array(GRID_N * GRID_N).fill(Infinity);
  g[startIdx] = 0;
  const h = (idx: number) => Math.hypot((idx % GRID_N) - gx, Math.floor(idx / GRID_N) - gz);

  while (open.length > 0) {
    // kleinste f-Kosten (lineare Suche – Gitter ist klein)
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      if (g[open[i]] + h(open[i]) < g[open[bi]] + h(open[bi])) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === goalIdx) return reconstruct(came, cur);

    const cx = cur % GRID_N;
    const cz = Math.floor(cur / GRID_N);
    for (const [ox, oz] of NEIGHBORS) {
      const nx = cx + ox;
      const nz = cz + oz;
      if (nx < 0 || nz < 0 || nx >= GRID_N || nz >= GRID_N) continue;
      const ni = nz * GRID_N + nx;
      if (blocked[ni]) continue;
      const cost = ox !== 0 && oz !== 0 ? 1.414 : 1;
      const tentative = g[cur] + cost;
      if (tentative < g[ni]) {
        came.set(ni, cur);
        g[ni] = tentative;
        if (!open.includes(ni)) open.push(ni);
      }
    }
  }
  return null;
}

const NEIGHBORS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function reconstruct(came: Map<number, number>, end: number): THREE.Vector2[] {
  const cells = [end];
  let cur = end;
  while (came.has(cur)) {
    cur = came.get(cur)!;
    cells.unshift(cur);
  }
  // Startzelle weglassen, Rest als Welt-Wegpunkte.
  return cells.slice(1).map((idx) => new THREE.Vector2(cellToWorld(idx % GRID_N), cellToWorld(Math.floor(idx / GRID_N))));
}

// ---------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------

function makeAction(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
  needles: string[],
): THREE.AnimationAction | null {
  for (const needle of needles) {
    const clip =
      clips.find((c) => c.name.toLowerCase() === needle) ??
      clips.find((c) => c.name.toLowerCase().endsWith("|" + needle)) ??
      clips.find((c) => c.name.toLowerCase().includes(needle));
    if (clip) return mixer.clipAction(clip);
  }
  return null;
}

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Kürzeste Winkel-Interpolation (vermeidet 2π-Sprünge). */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}
