import * as THREE from "three";
import type { GameState, PlacedBuilding } from "../game/GameState";
import type { FieldBounds } from "../game/config/chunks";
import { getBuilding } from "../game/config/buildings";
import { SCARECROW_RADIUS } from "../game/config/fields";
import type { AnimalModels } from "./AnimalModels";

/**
 * Wenige Vögel, die auf Wolkenhöhe in wechselnde Richtungen über den Hof fliegen
 * (reine Deko, nicht im Spielstand). Gelegentlich stößt ein Vogel zu einem Feld
 * mit Ernte herab und pickt daran (mindert den Ertrag), sofern keine Vogelscheuche
 * in der Nähe steht – dann meidet er das Feld bzw. flieht. Pro Session erzeugt,
 * liest direkt aus dem GameState und wird beim Sitzungswechsel entfernt.
 */

/** Flughöhe beim Streifen (unter den Wolken bei y=28). */
const CRUISE_Y = 22;
/** Tiefe beim Picken über einem Feld. */
const PECK_Y = 3;
/** Linearer Höhengewinn beim Wegfliegen (Welt-Einheiten/s) — sanfter Steigflug statt Hochschießen. */
const CLIMB_RATE = 3.5;
/** Rand um die Feldgrenzen, an dem die Vögel auf die Gegenseite wrappen. */
const WRAP_MARGIN = 16;
/** Gleichzeitig erlaubte Raids. */
const MAX_CONCURRENT_RAIDS = 2;

/**
 * Yaw-Korrektur je Vogel-Modell (Radiant): die Bewegung richtet die +z-Achse in
 * Flugrichtung aus; Modelle, deren „Vorderseite" nach −z zeigt, müssen um π gedreht
 * werden, sonst fliegen sie rückwärts.
 */
const BIRD_YAW_OFFSET: Record<string, number> = {
  flying_bird: Math.PI,
  bird: Math.PI,
};

/**
 * Auswahlgewichte je Vogel-Modell: der Schwarm (`bird`) erscheint häufiger als die
 * Einzelvögel (`simple_bird`, `flying_bird`).
 */
const BIRD_WEIGHTS: Record<string, number> = {
  bird: 3,
  simple_bird: 2,
  flying_bird: 3,
};

/** Gewichtete Zufallswahl einer geladenen Vogel-ID (Schwärme bevorzugt). */
function weightedBirdId(ids: string[]): string {
  const total = ids.reduce((s, id) => s + (BIRD_WEIGHTS[id] ?? 1), 0);
  let r = Math.random() * total;
  for (const id of ids) {
    r -= BIRD_WEIGHTS[id] ?? 1;
    if (r <= 0) return id;
  }
  return ids[ids.length - 1];
}

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}

/** Helfer/Umgebung, die jeder Vogel pro Frame vom Manager bekommt. */
interface BirdContext {
  bounds: FieldBounds;
  /** Lohnendes, ungeschütztes Feld zum Raid (oder null); reserviert es zugleich. */
  requestRaid: () => PlacedBuilding | null;
  /** Gibt ein Raid-Ziel wieder frei (Raid beendet/abgebrochen). */
  endRaid: (b: PlacedBuilding) => void;
  /** Steht eine Vogelscheuche im Schutzradius des Feldes? */
  isProtected: (b: PlacedBuilding) => boolean;
  /** Existiert das Feld noch und trägt Ernte (Wachstum/Reif)? */
  stillTasty: (b: PlacedBuilding) => boolean;
  /** Ernteschaden anrichten. */
  peck: (b: PlacedBuilding, dt: number) => void;
}

export class BirdManager {
  private birds: Bird[] = [];
  private raidCooldown = randFloat(4, 10);
  private activeRaids = 0;
  private targeted = new Set<PlacedBuilding>();

  constructor(
    private scene: THREE.Scene,
    private state: GameState,
    models: AnimalModels,
  ) {
    const ids = models.birdIds();
    if (ids.length === 0) return;
    const count = randInt(3, 5);
    for (let i = 0; i < count; i++) {
      const id = weightedBirdId(ids);
      const model = models.get(id);
      if (!model) continue;
      const bird = new Bird(model, models.getClips(id), this.state.field, BIRD_YAW_OFFSET[id] ?? 0);
      this.scene.add(bird.object);
      this.birds.push(bird);
    }
  }

  update(dt: number): void {
    if (this.birds.length === 0) return;
    this.raidCooldown -= dt;

    const ctx: BirdContext = {
      bounds: this.state.field,
      requestRaid: () => this.requestRaid(),
      endRaid: (b) => this.endRaid(b),
      isProtected: (b) => this.isProtected(b),
      stillTasty: (b) => this.stillTasty(b),
      peck: (b, d) => this.state.peckField(b, d),
    };
    for (const bird of this.birds) bird.update(dt, ctx);
  }

  dispose(): void {
    for (const b of this.birds) this.scene.remove(b.object);
    this.birds = [];
    this.targeted.clear();
    this.activeRaids = 0;
  }

  /** Sucht ein lohnendes, ungeschütztes, noch nicht angepeiltes Feld (respektiert Limits). */
  private requestRaid(): PlacedBuilding | null {
    if (this.raidCooldown > 0 || this.activeRaids >= MAX_CONCURRENT_RAIDS) return null;
    const candidates = this.state.buildings.filter(
      (b) =>
        getBuilding(b.defId)?.isField &&
        (b.field?.state === "growing" || b.field?.state === "ready") &&
        !this.targeted.has(b) &&
        !this.isProtected(b),
    );
    if (candidates.length === 0) return null;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    this.targeted.add(target);
    this.activeRaids++;
    this.raidCooldown = randFloat(10, 22);
    return target;
  }

  private endRaid(b: PlacedBuilding): void {
    if (this.targeted.delete(b)) this.activeRaids = Math.max(0, this.activeRaids - 1);
  }

  private isProtected(b: PlacedBuilding): boolean {
    return this.state.buildings.some(
      (s) => s.defId === "vogelscheuche" && Math.hypot(s.x - b.x, s.z - b.z) <= SCARECROW_RADIUS,
    );
  }

  private stillTasty(b: PlacedBuilding): boolean {
    return (
      this.state.buildings.includes(b) &&
      (b.field?.state === "growing" || b.field?.state === "ready")
    );
  }
}

type BirdPhase = "cruise" | "descend" | "peck" | "ascend";

class Bird {
  readonly object: THREE.Object3D;
  private mixer: THREE.AnimationMixer | null = null;

  private phase: BirdPhase = "cruise";
  private heading: number;
  private speed: number;
  private turnTimer = randFloat(2, 5);
  private raidWishTimer = randFloat(2, 6);
  private peckTimer = 0;
  private circle = Math.random() * Math.PI * 2;
  private target: PlacedBuilding | null = null;

  constructor(
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    bounds: FieldBounds,
    private yawOffset = 0,
  ) {
    this.object = model;
    this.heading = Math.random() * Math.PI * 2;
    this.speed = randFloat(6, 9);

    // Zufälliger Startpunkt innerhalb der Feldgrenzen, auf Reiseflughöhe.
    const x = randFloat(bounds.minX, bounds.maxX);
    const z = randFloat(bounds.minZ, bounds.maxZ);
    this.object.position.set(x, CRUISE_Y, z);

    const clip = pickFlyClip(clips);
    if (clip) {
      this.mixer = new THREE.AnimationMixer(this.object);
      const action = this.mixer.clipAction(clip);
      action.play();
    }
  }

  update(dt: number, ctx: BirdContext): void {
    this.mixer?.update(dt);
    switch (this.phase) {
      case "cruise":
        this.cruise(dt, ctx);
        break;
      case "descend":
        this.descend(dt, ctx);
        break;
      case "peck":
        this.peck(dt, ctx);
        break;
      case "ascend":
        this.ascend(dt, ctx);
        break;
    }
  }

  private cruise(dt: number, ctx: BirdContext): void {
    // Gelegentlich die Richtung leicht ändern.
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.heading += randFloat(-0.7, 0.7);
      this.turnTimer = randFloat(2, 5);
    }
    this.flyHorizontal(dt, this.speed);
    this.approachY(CRUISE_Y, dt, 4);
    this.wrap(ctx.bounds);

    // Ab und zu einen Raid versuchen.
    this.raidWishTimer -= dt;
    if (this.raidWishTimer <= 0) {
      this.raidWishTimer = randFloat(3, 8);
      const target = ctx.requestRaid();
      if (target) {
        this.target = target;
        this.phase = "descend";
      }
    }
  }

  private descend(dt: number, ctx: BirdContext): void {
    const b = this.target;
    if (!b || ctx.isProtected(b) || !ctx.stillTasty(b)) return this.flee(ctx);

    const reached = this.moveToward(b.x, b.z, dt, 11);
    this.approachY(PECK_Y, dt, 5);
    if (reached && Math.abs(this.object.position.y - PECK_Y) < 1.2) {
      this.phase = "peck";
      this.peckTimer = randFloat(4, 7);
    }
  }

  private peck(dt: number, ctx: BirdContext): void {
    const b = this.target;
    if (!b || ctx.isProtected(b) || !ctx.stillTasty(b)) return this.flee(ctx);

    // Tief um das Feldzentrum kreisen und dabei picken.
    this.circle += dt * 1.6;
    const r = 2.2;
    const tx = b.x + Math.cos(this.circle) * r;
    const tz = b.z + Math.sin(this.circle) * r;
    this.moveToward(tx, tz, dt, 6);
    this.approachY(PECK_Y, dt, 5);
    ctx.peck(b, dt);

    this.peckTimer -= dt;
    if (this.peckTimer <= 0) this.flee(ctx);
  }

  private ascend(dt: number, ctx: BirdContext): void {
    // Flach nach außen weggleiten und dabei gleichmäßig (linear) steigen.
    this.flyHorizontal(dt, this.speed);
    const pos = this.object.position;
    pos.y = Math.min(CRUISE_Y, pos.y + CLIMB_RATE * dt);
    this.wrap(ctx.bounds);
    if (CRUISE_Y - pos.y < 0.6) this.phase = "cruise";
  }

  /** Raid abbrechen/beenden: vom Feld weg ausrichten, Ziel freigeben und wegsteigen. */
  private flee(ctx: BirdContext): void {
    if (this.target) {
      // Abflug-Richtung vom Feldzentrum weg, damit der Vogel nach außen weggleitet.
      const pos = this.object.position;
      this.heading = Math.atan2(pos.x - this.target.x, pos.z - this.target.z);
      ctx.endRaid(this.target);
    }
    this.target = null;
    this.phase = "ascend";
  }

  // --- Bewegungs-Helfer ---------------------------------------------------

  private flyHorizontal(dt: number, speed: number): void {
    const vx = Math.sin(this.heading);
    const vz = Math.cos(this.heading);
    this.object.position.x += vx * speed * dt;
    this.object.position.z += vz * speed * dt;
    this.object.rotation.y = Math.atan2(vx, vz) + this.yawOffset;
  }

  /** Bewegt sich horizontal zum Ziel; gibt true zurück, wenn nah genug. */
  private moveToward(tx: number, tz: number, dt: number, speed: number): boolean {
    const pos = this.object.position;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) {
      const step = Math.min(speed * dt, dist);
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      this.heading = Math.atan2(dx, dz);
      this.object.rotation.y = this.heading + this.yawOffset;
    }
    return dist < 1.5;
  }

  private approachY(targetY: number, dt: number, rate: number): void {
    const pos = this.object.position;
    pos.y += (targetY - pos.y) * Math.min(1, dt * rate);
  }

  /** Am Feldrand (+Margin) auf die Gegenseite versetzen, damit Vögel im Bild bleiben. */
  private wrap(b: FieldBounds): void {
    const pos = this.object.position;
    if (pos.x < b.minX - WRAP_MARGIN) pos.x = b.maxX + WRAP_MARGIN;
    else if (pos.x > b.maxX + WRAP_MARGIN) pos.x = b.minX - WRAP_MARGIN;
    if (pos.z < b.minZ - WRAP_MARGIN) pos.z = b.maxZ + WRAP_MARGIN;
    else if (pos.z > b.maxZ + WRAP_MARGIN) pos.z = b.minZ - WRAP_MARGIN;
  }
}

/** Sucht einen Flug-/Flatter-Clip (sonst den ersten Clip). */
function pickFlyClip(clips: THREE.AnimationClip[]): THREE.AnimationClip | null {
  if (clips.length === 0) return null;
  const l = (c: THREE.AnimationClip) => c.name.toLowerCase();
  return (
    clips.find((c) => /fly|flap|wing|glide/.test(l(c))) ??
    clips.find((c) => !/death|hit/.test(l(c))) ??
    clips[0]
  );
}
