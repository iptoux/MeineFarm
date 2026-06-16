import * as THREE from "three";
import type { CloudManager } from "./Clouds";
import type { RainSystem } from "./Rain";
import type { SkyManager } from "./Sky";
import type { AudioManager } from "../audio/AudioManager";

/**
 * Wetter-Schicht über dem Tag/Nacht-Zyklus. Vier Lagen – Sonnenschein, Regen,
 * Gewitter, Nebel – mit weichen Übergängen. Pro Tag ändert sich das Wetter
 * höchstens einmal (also max. 2 Lagen pro Tag).
 *
 * Wichtig: `SkyManager.apply()` überschreibt jeden Frame die Lichtstärken und
 * die Fog-Farbe. Der WeatherManager läuft deshalb NACH `sky.update()` und
 * *moduliert* diese Werte (Licht multiplizieren, Fog tönen/verengen) – dasselbe
 * Muster, mit dem der Sky bereits die Szenen-Lichter steuert.
 */

export const WEATHER_KINDS = ["clear", "rain", "storm", "fog"] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

interface WeatherParams {
  density: number; // 0..1 → Wolken-Pool-Füllung
  cloudColor: THREE.Color;
  cloudOpacity: number;
  dimFactor: number; // ×Lichtstärken
  overcast: number; // 0..1 → Himmel-Eintrübung
  exposure: number; // Tone-Mapping-Belichtung (dunkler = düsterer)
  fogNear: number;
  fogFar: number;
  fogTint: THREE.Color;
  fogTintAmount: number;
  rainIntensity: number; // 0..1
  windMul: number;
  lightning: boolean;
}

function params(p: {
  density: number;
  cloudColor: number;
  cloudOpacity: number;
  dimFactor: number;
  overcast: number;
  exposure: number;
  fogNear: number;
  fogFar: number;
  fogTint: number;
  fogTintAmount: number;
  rainIntensity: number;
  windMul: number;
  lightning: boolean;
}): WeatherParams {
  return {
    ...p,
    cloudColor: new THREE.Color(p.cloudColor),
    fogTint: new THREE.Color(p.fogTint),
  };
}

/** Basis-Belichtung des Renderers (aus SceneManager) – Referenz für klares Wetter. */
const BASE_EXPOSURE = 0.85;

const PARAMS: Record<WeatherKind, WeatherParams> = {
  clear: params({ density: 0.25, cloudColor: 0xffffff, cloudOpacity: 0.95, dimFactor: 1.0, overcast: 0, exposure: 0.85, fogNear: 70, fogFar: 180, fogTint: 0xffffff, fogTintAmount: 0, rainIntensity: 0, windMul: 1.0, lightning: false }),
  rain: params({ density: 0.75, cloudColor: 0xb9c2cc, cloudOpacity: 0.98, dimFactor: 0.72, overcast: 0.7, exposure: 0.62, fogNear: 55, fogFar: 140, fogTint: 0x8a94a0, fogTintAmount: 0.25, rainIntensity: 0.7, windMul: 1.4, lightning: false }),
  storm: params({ density: 1.0, cloudColor: 0x6f7782, cloudOpacity: 1.0, dimFactor: 0.5, overcast: 1.0, exposure: 0.45, fogNear: 45, fogFar: 110, fogTint: 0x5d646e, fogTintAmount: 0.4, rainIntensity: 1.0, windMul: 2.4, lightning: true }),
  fog: params({ density: 0.55, cloudColor: 0xd8dde2, cloudOpacity: 0.85, dimFactor: 0.8, overcast: 0.85, exposure: 0.7, fogNear: 20, fogFar: 70, fogTint: 0xc7ccd1, fogTintAmount: 0.6, rainIntensity: 0, windMul: 0.4, lightning: false }),
};

/** Auswahlgewichte für das nächste Wetter: Sonne häufig, Nebel selten, Gewitter wieder spürbar. */
const NEXT_WEIGHTS: Record<WeatherKind, number> = { clear: 5, fog: 1, rain: 3, storm: 2 };
/** Anteil der Tage mit einem Wechsel. */
const CHANGE_CHANCE = 0.5;
/** Breite des Übergangsfensters als Bruchteil eines Tages (~18 s bei DAY_LENGTH_SEC=360). */
const TRANSITION_WIDTH = 0.05;

interface DaySchedule {
  start: WeatherKind;
  end: WeatherKind;
  /** Tageszeit-Mitte des Übergangs in [0.30,0.70], oder null = kein Wechsel. */
  changeAt: number | null;
}

interface Deps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sky: SkyManager;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  clouds: CloudManager;
  rain: RainSystem;
  audio?: AudioManager;
}

function smoothstep(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function weightedPick(exclude: WeatherKind): WeatherKind {
  const kinds = (Object.keys(NEXT_WEIGHTS) as WeatherKind[]).filter((k) => k !== exclude);
  const total = kinds.reduce((s, k) => s + NEXT_WEIGHTS[k], 0);
  let r = Math.random() * total;
  for (const k of kinds) {
    r -= NEXT_WEIGHTS[k];
    if (r <= 0) return k;
  }
  return kinds[kinds.length - 1];
}

export class WeatherManager {
  current: WeatherKind = "clear";
  target: WeatherKind = "clear";
  transition = 0;
  thunderEnabled = true;

  private schedule: DaySchedule = { start: "clear", end: "clear", changeAt: null };
  private lastTimeOfDay = -1;
  private readonly cur: WeatherParams = params({ density: 0.25, cloudColor: 0xffffff, cloudOpacity: 0.95, dimFactor: 1, overcast: 0, exposure: 0.85, fogNear: 70, fogFar: 180, fogTint: 0xffffff, fogTintAmount: 0, rainIntensity: 0, windMul: 1, lightning: false });

  // Ad-hoc-Übergang (per setWeather ohne immediate): überlagert den Tagesplan.
  private override: { from: WeatherKind; to: WeatherKind; t: number; dur: number } | null = null;

  // Blitz/Donner
  private flashTimer = 0;
  private flashEnv = 0; // aktuelle Blitz-Hüllkurve [0,1]
  private pendingThunder: number | null = null;

  constructor(private readonly deps: Deps) {}

  /** Aktuelle Wind-Stärke (geglätteter Wetter-Multiplikator: ruhig ~0.4, Sturm ~2.4). */
  get windStrength(): number {
    return this.cur.windMul;
  }

  setWeather(kind: WeatherKind, immediate = false): void {
    if (immediate) {
      this.schedule = { start: kind, end: kind, changeAt: null };
      this.override = null;
      this.transition = 0;
      this.current = this.target = kind;
    } else {
      this.override = { from: this.target, to: kind, t: 0, dur: 4 };
    }
  }

  update(dt: number, timeOfDay: number, daylight: number): void {
    // --- Tageswechsel erkennen (Wrap von ~0.99 → 0) ---
    if (this.lastTimeOfDay < 0) {
      this.lastTimeOfDay = timeOfDay; // Erststart: kein Fehl-Wrap
    } else if (timeOfDay < this.lastTimeOfDay) {
      this.rollNewDay();
    }
    this.lastTimeOfDay = timeOfDay;

    // --- from/to/transition bestimmen ---
    let fromKind: WeatherKind;
    let toKind: WeatherKind;
    let t: number;

    if (this.override) {
      this.override.t = Math.min(1, this.override.t + dt / this.override.dur);
      fromKind = this.override.from;
      toKind = this.override.to;
      t = this.override.t;
      if (t >= 1) {
        // Übergang abgeschlossen → als stabiles Tageswetter übernehmen.
        this.schedule = { start: toKind, end: toKind, changeAt: null };
        this.override = null;
      }
    } else {
      const s = this.schedule;
      if (s.changeAt == null) {
        fromKind = toKind = s.start;
        t = 0;
      } else {
        const half = TRANSITION_WIDTH / 2;
        if (timeOfDay < s.changeAt - half) {
          fromKind = toKind = s.start;
          t = 0;
        } else if (timeOfDay > s.changeAt + half) {
          fromKind = toKind = s.end;
          t = 1;
        } else {
          fromKind = s.start;
          toKind = s.end;
          t = (timeOfDay - (s.changeAt - half)) / TRANSITION_WIDTH;
        }
      }
    }

    this.current = fromKind;
    this.target = toKind;
    this.transition = t;

    // --- Parameter mischen (geglättet) ---
    this.lerpParams(PARAMS[fromKind], PARAMS[toKind], smoothstep(t));

    // --- Anwenden ---
    this.apply(dt, daylight);
  }

  private rollNewDay(): void {
    const start = this.schedule.end; // gestern → heute, nahtlos
    // Nach einem Gewitter klart es immer auf: kein Regen/Nebel/Sturm direkt danach.
    if (start === "storm") {
      this.schedule = { start, end: "clear", changeAt: THREE.MathUtils.randFloat(0.3, 0.7) };
      return;
    }
    if (Math.random() < CHANGE_CHANCE) {
      const end = weightedPick(start);
      const changeAt = THREE.MathUtils.randFloat(0.3, 0.7);
      this.schedule = { start, end, changeAt };
    } else {
      this.schedule = { start, end: start, changeAt: null };
    }
  }

  private lerpParams(a: WeatherParams, b: WeatherParams, t: number): void {
    const c = this.cur;
    c.density = THREE.MathUtils.lerp(a.density, b.density, t);
    c.cloudColor.copy(a.cloudColor).lerp(b.cloudColor, t);
    c.cloudOpacity = THREE.MathUtils.lerp(a.cloudOpacity, b.cloudOpacity, t);
    c.dimFactor = THREE.MathUtils.lerp(a.dimFactor, b.dimFactor, t);
    c.overcast = THREE.MathUtils.lerp(a.overcast, b.overcast, t);
    c.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);
    c.fogNear = THREE.MathUtils.lerp(a.fogNear, b.fogNear, t);
    c.fogFar = THREE.MathUtils.lerp(a.fogFar, b.fogFar, t);
    c.fogTint.copy(a.fogTint).lerp(b.fogTint, t);
    c.fogTintAmount = THREE.MathUtils.lerp(a.fogTintAmount, b.fogTintAmount, t);
    c.rainIntensity = THREE.MathUtils.lerp(a.rainIntensity, b.rainIntensity, t);
    c.windMul = THREE.MathUtils.lerp(a.windMul, b.windMul, t);
    // „Storminess": Anteil Gewitter im aktuellen Mix (für Blitzwahrscheinlichkeit).
    c.lightning = a.lightning || b.lightning;
  }

  private get stormness(): number {
    const a = this.current === "storm" ? 1 - this.transition : 0;
    const b = this.target === "storm" ? this.transition : 0;
    return a + b;
  }

  private apply(dt: number, daylight: number): void {
    const c = this.cur;
    const { sun, hemi, ambient, scene, clouds, rain, sky, renderer } = this.deps;

    // Nacht-Schutz: nachts weniger dimmen, damit Sturm lesbar bleibt.
    const day = THREE.MathUtils.clamp(daylight, 0, 1);
    const dim = THREE.MathUtils.lerp(1, c.dimFactor, day);

    sun.intensity *= dim;
    hemi.intensity *= dim;
    ambient.intensity *= dim;

    // Himmel eintrüben + Belichtung absenken (düsterer bei Regen/Sturm/Nebel).
    // Nachts nicht zusätzlich abdunkeln – die Nacht ist über das Licht schon dunkel.
    sky.setOvercast(c.overcast * day);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(BASE_EXPOSURE, c.exposure, day);

    // Fog: Sky hat Farbe gesetzt → wir tönen & verengen darauf.
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = c.fogNear;
      fog.far = c.fogFar;
      fog.color.lerp(c.fogTint, c.fogTintAmount);
      if (scene.background instanceof THREE.Color) scene.background.copy(fog.color);
    }

    clouds.applyWeather(c.cloudColor, c.cloudOpacity, c.density);
    clouds.setWind(c.windMul);

    rain.setIntensity(c.rainIntensity);
    rain.setWind(1.1 * c.windMul * 1.5, 0.25 * c.windMul * 1.5);

    // Geräuschkulisse: Regen-Loop bei Regen+Sturm, Sturm/Wind-Loop nur beim Gewitter.
    this.deps.audio?.setWeatherAudio(c.rainIntensity, this.stormness);

    // --- Blitz & Donner (nur bei Gewitter) ---
    this.updateLightning(dt, hemi, ambient);
  }

  private updateLightning(dt: number, hemi: THREE.HemisphereLight, ambient: THREE.AmbientLight): void {
    const storm = this.stormness;

    // Hüllkurve abklingen lassen (schneller Decay → kurzer Flash).
    if (this.flashEnv > 0) {
      this.flashEnv = Math.max(0, this.flashEnv - dt * 8);
      const boost = this.flashEnv * 2.0;
      hemi.intensity += boost;
      ambient.intensity += boost;
    }

    if (!this.thunderEnabled || storm < 0.5) {
      this.flashTimer = 0;
      this.pendingThunder = null;
      return;
    }

    // Nächsten Blitz auslösen.
    this.flashTimer -= dt;
    if (this.flashTimer <= 0) {
      this.flashEnv = 1;
      // Intervall kürzer je stärker das Gewitter.
      this.flashTimer = THREE.MathUtils.randFloat(4, 12) / Math.max(0.5, storm);
      // Donner mit Entfernungs-Verzögerung.
      this.pendingThunder = THREE.MathUtils.randFloat(0.3, 2.0);
    }

    if (this.pendingThunder != null) {
      this.pendingThunder -= dt;
      if (this.pendingThunder <= 0) {
        this.pendingThunder = null;
        this.deps.audio?.playThunder();
      }
    }
  }
}
