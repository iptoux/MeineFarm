/**
 * Audio: Hintergrundmusik (Loop) + Effekt-Sounds.
 * Browser blockieren Autoplay bis zur ersten Nutzergeste → Musik startet erst
 * nach dem ersten Klick/Tastendruck. Stummschalten per toggleMute().
 */
export class AudioManager {
  private music: HTMLAudioElement;
  /** Leise Bauernhof-Geräuschkulisse, läuft zusätzlich zur Musik im Loop. */
  private ambience: HTMLAudioElement;
  private muted = false;
  private unlocked = false;

  constructor() {
    this.music = new Audio("/sounds/farm-music.mp3");
    this.music.loop = true;
    this.music.volume = 0.3;

    this.ambience = new Audio("/sounds/farm-ambience.mp3");
    this.ambience.loop = true;
    this.ambience.volume = 0.18;

    const unlock = () => {
      this.unlocked = true;
      if (!this.muted) {
        void this.music.play().catch(() => {});
        void this.ambience.play().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
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

  get isMuted(): boolean {
    return this.muted;
  }

  /** Schaltet Ton an/aus; gibt den neuen Mute-Zustand zurück. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.music.pause();
      this.ambience.pause();
    } else if (this.unlocked) {
      void this.music.play().catch(() => {});
      void this.ambience.play().catch(() => {});
    }
    return this.muted;
  }
}
