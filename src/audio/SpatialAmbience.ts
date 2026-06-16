import * as THREE from "three";
import type { GameState } from "../game/GameState";
import { getBuilding } from "../game/config/buildings";
import type { AudioManager } from "./AudioManager";

/**
 * Räumliche Geräuschkulisse pro Spielstand: legt die allgemeine Hof-Kulisse
 * (farm-ambience.mp3) als eine Quelle auf den Schwerpunkt der Tier-Gebäude → je weiter
 * die Kamera vom Hof weg ist, desto leiser. Zusätzlich kommen Tierrufe aus den Ställen,
 * an denen die Tiere stehen, und eine leise Teich-Kulisse (Wasser) mit gelegentlichen
 * Frosch-Rufen über jeden Teich. Alles über THREE.PositionalAudio an Ankern in der Szene
 * → Distanz-Abschwächung und Panning kommen automatisch, der Listener hängt an der Kamera
 * (siehe SceneManager).
 *
 * Liest Positionen direkt aus dem GameState (`ponds`, `buildings`); Anker werden pro
 * Frame leichtgewichtig gegen den Zustand abgeglichen (selbstheilend bei Erweiterung,
 * Umbau oder Abriss). Beim Sitzungswechsel via `dispose()` wieder abgebaut.
 */

// Distanz-/Lautstärke-Parameter (bewusst leise/passiv). „linear" lässt die Lautstärke
// zwischen ref- und maxDistance auf 0 fallen → außerhalb wirklich still.
const POND_REF = 5;
const POND_MAX = 16;
const POND_WATER_VOL = 0.32;
const FROG_MAX = 18;
const FROG_VOL = 0.28;
const BARN_REF = 7;
const BARN_MAX = 28;
const BARN_VOL = 0.7;
// Allgemeine Hof-Kulisse: groß genug, um über den ganzen Hof hörbar zu sein, fällt aber
// zum Karten-Rand (Felder/Teiche) hin auf 0 → „weiter weg = leiser".
const AMBIENCE_REF = 14;
const AMBIENCE_MAX = 50;
const AMBIENCE_VOL = 0.4;

interface PondAnchor {
  key: string;
  obj: THREE.Object3D;
  water: THREE.PositionalAudio | null;
  frogs: THREE.PositionalAudio | null;
}

interface BarnAnchor {
  key: string;
  buildingIndex: number;
  obj: THREE.Object3D;
  call: THREE.PositionalAudio;
}

export class SpatialAmbience {
  private pondAnchors: PondAnchor[] = [];
  private barnAnchors: BarnAnchor[] = [];
  /** Eine Quelle für die allgemeine Hof-Kulisse am Schwerpunkt der Tier-Gebäude. */
  private farmObj: THREE.Object3D | null = null;
  private farmAmbience: THREE.PositionalAudio | null = null;
  private pondSig = "";
  private barnSig = "";
  private farmSig = "";
  private barnTimer = randFloat(8, 20);

  constructor(
    private scene: THREE.Scene,
    private state: GameState,
    private audio: AudioManager,
    private listener: THREE.AudioListener,
  ) {}

  /** Pro Frame aus der Spielschleife aufgerufen. */
  update(dt: number): void {
    this.syncPonds();
    this.syncBarns();
    this.syncFarmAmbience();

    const live = this.audio.isUnlocked;
    if (!live) return;

    // Hof-Kulisse, Teich-Wasser und Frosch-Chor laufen als leise Dauerschleifen, sobald
    // freigeschaltet (Mute regelt der Listener-Master). Einmal starten, danach laufen
    // die Quellen weiter; außerhalb des Radius sind sie ohnehin still (linear-Modell).
    if (this.farmAmbience && !this.farmAmbience.isPlaying) this.farmAmbience.play();
    for (const p of this.pondAnchors) {
      if (p.water && !p.water.isPlaying) p.water.play();
      if (p.frogs && !p.frogs.isPlaying) p.frogs.play();
    }

    // Stall-Tierrufe: gelegentlich aus einem zufälligen Stall mit vorhandenen Tieren.
    this.barnTimer -= dt;
    if (this.barnTimer <= 0) {
      this.barnTimer = randFloat(8, 20);
      this.emitBarnCall();
    }
  }

  private emitBarnCall(): void {
    const withAnimals: { anchor: BarnAnchor; ids: string[] }[] = [];
    for (const anchor of this.barnAnchors) {
      const ids = this.animalsIn(anchor.buildingIndex);
      if (ids.length > 0) withAnimals.push({ anchor, ids });
    }
    const chosen = pick(withAnimals);
    if (!chosen) return;
    const id = pick(chosen.ids);
    const buf = id ? this.audio.buffer(`animals/${id}.mp3`) : null;
    if (!buf) return;
    const src = chosen.anchor.call;
    if (src.isPlaying) src.stop();
    src.setBuffer(buf);
    src.play();
  }

  /** AnimalIds der belegten Slots eines Stalls. */
  private animalsIn(buildingIndex: number): string[] {
    const def = getBuilding(this.state.buildings[buildingIndex]?.defId ?? "");
    const count = def?.slotCount ?? 0;
    const base = this.state.slotBase(buildingIndex);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = this.state.slots[base + i]?.animalId;
      if (id) ids.push(id);
    }
    return ids;
  }

  // --- Anker-Abgleich -------------------------------------------------------

  private syncPonds(): void {
    const sig = this.state.ponds.map((p) => `${p.x},${p.z}`).join("|");
    if (sig === this.pondSig) return;
    this.pondSig = sig;

    for (const a of this.pondAnchors) this.removeAnchor(a.obj, a.water, a.frogs);
    this.pondAnchors = this.state.ponds.map((p) => {
      const obj = new THREE.Object3D();
      obj.position.set(p.x, 0, p.z);
      this.scene.add(obj);

      const water = this.makeLoop("pond-water.mp3", POND_REF, POND_MAX, POND_WATER_VOL, obj);
      const frogs = this.makeLoop("frog.mp3", POND_REF, FROG_MAX, FROG_VOL, obj);

      return { key: `${p.x},${p.z}`, obj, water, frogs };
    });
  }

  private syncBarns(): void {
    const barns: { index: number; x: number; z: number }[] = [];
    this.state.buildings.forEach((b, i) => {
      if ((getBuilding(b.defId)?.slotCount ?? 0) > 0) barns.push({ index: i, x: b.x, z: b.z });
    });
    const sig = barns.map((b) => `${b.index}:${b.x},${b.z}`).join("|");
    if (sig === this.barnSig) return;
    this.barnSig = sig;

    for (const a of this.barnAnchors) this.removeAnchor(a.obj, a.call);
    this.barnAnchors = barns.map((b) => {
      const obj = new THREE.Object3D();
      obj.position.set(b.x, 0, b.z);
      this.scene.add(obj);
      const call = this.makeSource(BARN_REF, BARN_MAX, BARN_VOL);
      obj.add(call);
      return { key: `${b.index}`, buildingIndex: b.index, obj, call };
    });
  }

  /**
   * Hält die Hof-Kulisse als eine Quelle am Schwerpunkt aller Tier-Gebäude. Verschiebt
   * nur den Anker, wenn sich die Gebäude ändern (kein Neustart der Schleife → kein
   * Knacksen). Ohne Tier-Gebäude verstummt die Kulisse.
   */
  private syncFarmAmbience(): void {
    const barns = this.state.buildings.filter(
      (b) => (getBuilding(b.defId)?.slotCount ?? 0) > 0,
    );
    const sig = barns.map((b) => `${b.x},${b.z}`).join("|");
    if (sig === this.farmSig) return;
    this.farmSig = sig;

    if (barns.length === 0) {
      if (this.farmObj) {
        this.removeAnchor(this.farmObj, this.farmAmbience);
        this.farmObj = null;
        this.farmAmbience = null;
      }
      return;
    }

    const cx = barns.reduce((s, b) => s + b.x, 0) / barns.length;
    const cz = barns.reduce((s, b) => s + b.z, 0) / barns.length;
    if (!this.farmObj) {
      this.farmObj = new THREE.Object3D();
      this.scene.add(this.farmObj);
      this.farmAmbience = this.makeLoop(
        "farm-ambience.mp3",
        AMBIENCE_REF,
        AMBIENCE_MAX,
        AMBIENCE_VOL,
        this.farmObj,
      );
    }
    this.farmObj.position.set(cx, 0, cz);
  }

  private makeSource(refDist: number, maxDist: number, volume: number): THREE.PositionalAudio {
    const src = new THREE.PositionalAudio(this.listener);
    src.setDistanceModel("linear");
    src.setRefDistance(refDist);
    src.setMaxDistance(maxDist);
    src.setRolloffFactor(1);
    src.setVolume(volume);
    return src;
  }

  /** Erzeugt eine an `obj` befestigte Dauerschleife; null, wenn der Buffer fehlt. */
  private makeLoop(
    file: string,
    refDist: number,
    maxDist: number,
    volume: number,
    obj: THREE.Object3D,
  ): THREE.PositionalAudio | null {
    const buf = this.audio.buffer(file);
    if (!buf) return null;
    const src = this.makeSource(refDist, maxDist, volume);
    src.setBuffer(buf);
    src.setLoop(true);
    obj.add(src);
    return src;
  }

  private removeAnchor(obj: THREE.Object3D, ...sources: (THREE.PositionalAudio | null)[]): void {
    for (const s of sources) {
      if (!s) continue;
      if (s.isPlaying) s.stop();
      s.disconnect();
    }
    this.scene.remove(obj);
  }

  dispose(): void {
    for (const a of this.pondAnchors) this.removeAnchor(a.obj, a.water, a.frogs);
    for (const a of this.barnAnchors) this.removeAnchor(a.obj, a.call);
    if (this.farmObj) this.removeAnchor(this.farmObj, this.farmAmbience);
    this.pondAnchors = [];
    this.barnAnchors = [];
    this.farmObj = null;
    this.farmAmbience = null;
    this.pondSig = "";
    this.barnSig = "";
    this.farmSig = "";
  }
}

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
