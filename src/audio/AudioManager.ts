import * as THREE from "three";

/**
 * Audio: Hintergrundmusik (Loop) + Effekt-Sounds (global, HTMLAudio) sowie das
 * Fundament für räumliches Spatial-Audio: hält den Listener (an der Kamera), lädt und
 * cached AudioBuffer (für THREE.PositionalAudio) und schaltet beim Stummschalten auch
 * die positionalen Quellen über die Listener-Lautstärke ab.
 * Browser blockieren Autoplay bis zur ersten Nutzergeste → Musik startet erst
 * nach dem ersten Klick/Tastendruck. Stummschalten per toggleMute().
 */
/** Eine wetterabhängige Geräusch-Schleife (z.B. Regen, Sturm/Wind). */
interface WeatherLoop {
  el: HTMLAudioElement;
  /** Aktuelle Stärke [0,1], vom Wetter gesetzt. */
  level: number;
  /** Lautstärke bei voller Stärke. */
  maxVol: number;
}

export class AudioManager {
  private music: HTMLAudioElement;
  /** Wetter-Schleifen (Regen, Sturm/Wind), lautstärkegeregelt nach Wetterstärke. */
  private weatherLoops: WeatherLoop[];
  private rainLoop: WeatherLoop;
  private stormLoop: WeatherLoop;
  private muted = false;
  private unlocked = false;

  /** Geladene AudioBuffer für positionale Quellen (Schlüssel = Pfad ohne `/sounds/`). */
  private buffers = new Map<string, AudioBuffer>();
  private audioLoader = new THREE.AudioLoader();

  constructor(private listener: THREE.AudioListener) {
    this.music = new Audio("/sounds/farm-music.mp3");
    this.music.loop = true;
    this.music.volume = 0.3;

    this.rainLoop = this.makeWeatherLoop("rain.mp3", 0.45);
    this.stormLoop = this.makeWeatherLoop("storm.mp3", 0.5);
    this.weatherLoops = [this.rainLoop, this.stormLoop];

    const unlock = () => {
      this.unlocked = true;
      // Web-Audio-Kontext des Listeners freischalten (für PositionalAudio).
      void this.listener.context.resume().catch(() => {});
      if (!this.muted) {
        void this.music.play().catch(() => {});
      }
      this.refreshWeatherLoops();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  /**
   * Lädt die AudioBuffer für positionale Quellen vor (Hof-Kulisse + Tierrufe +
   * Teich/Frosch). Fehlende Dateien werden still übersprungen – die jeweilige Quelle
   * bleibt dann einfach lautlos. Spiegelt das parallele Lade-Muster aus `AnimalModels.load()`.
   */
  async load(): Promise<void> {
    const files = ["farm-ambience.mp3", "animals/huhn.mp3", "animals/kuh.mp3", "animals/pferd.mp3", "animals/schaf.mp3", "animals/schwein.mp3", "pond-water.mp3", "frog.mp3"];
    await Promise.all(
      files.map(async (file) => {
        try {
          const buf = await this.audioLoader.loadAsync(`/sounds/${file}`);
          this.buffers.set(file, buf);
        } catch {
          // Datei fehlt/lädt nicht → Quelle bleibt lautlos.
        }
      }),
    );
  }

  /** Geladener AudioBuffer für eine positionale Quelle; null, wenn nicht vorhanden. */
  buffer(file: string): AudioBuffer | null {
    return this.buffers.get(file) ?? null;
  }

  /** Ob die erste Nutzergeste erfolgt ist (Autoplay/Web-Audio freigeschaltet). */
  get isUnlocked(): boolean {
    return this.unlocked;
  }

  private makeWeatherLoop(file: string, maxVol: number): WeatherLoop {
    const el = new Audio(`/sounds/${file}`);
    el.loop = true;
    el.volume = 0;
    return { el, level: 0, maxVol };
  }

  /**
   * Setzt die Wetter-Geräuschpegel (jeweils [0,1]). Regen läuft bei Regen+Sturm,
   * der Sturm/Wind-Loop nur beim Gewitter. Fehlt eine Datei, bleibt es lautlos.
   */
  setWeatherAudio(rainLevel: number, stormLevel: number): void {
    this.rainLoop.level = clamp01(rainLevel);
    this.stormLoop.level = clamp01(stormLevel);
    this.refreshWeatherLoops();
  }

  private refreshWeatherLoops(): void {
    for (const l of this.weatherLoops) {
      const audible = !this.muted && this.unlocked && l.level > 0.01;
      l.el.volume = audible ? l.level * l.maxVol : 0;
      if (audible) {
        if (l.el.paused) void l.el.play().catch(() => {});
      } else if (!l.el.paused) {
        l.el.pause();
      }
    }
  }

  /** Spielt einen Effekt-Sound; überlappt durch frische Audio-Instanzen. */
  private play(file: string, volume: number): void {
    if (this.muted) return;
    const a = new Audio(`/sounds/${file}`);
    a.volume = volume;
    void a.play().catch(() => {});
  }

  playCollect(): void {
    this.play("collect.wav", 0.55);
  }

  playUnlock(): void {
    this.play("unlock.wav", 0.5);
  }

  playPurchase(): void {
    this.play("purchase.wav", 0.55);
  }

  playBuild(): void {
    this.play("build.wav", 0.6);
  }

  /** Leiser Klick beim Straße-Legen. */
  playRoad(): void {
    this.play("build.wav", 0.3);
  }

  /** Tierspezifischer Ruf (Datei `animals/<id>.mp3`); fehlt sie, passiert nichts. */
  playAnimalCall(id: string, volume = 0.5): void {
    this.play(`animals/${id}.mp3`, volume);
  }

  /** Donnerschlag beim Gewitter (Datei `thunder.mp3`); fehlt sie, passiert nichts. */
  playThunder(): void {
    this.play("thunder.mp3", 0.5);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Schaltet Ton an/aus; gibt den neuen Mute-Zustand zurück. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    // Positionale Quellen (PositionalAudio) hängen am Listener-Master.
    this.listener.setMasterVolume(this.muted ? 0 : 1);
    if (this.muted) {
      this.music.pause();
    } else if (this.unlocked) {
      void this.music.play().catch(() => {});
    }
    this.refreshWeatherLoops();
    return this.muted;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
