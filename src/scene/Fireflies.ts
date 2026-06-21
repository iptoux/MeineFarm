import * as THREE from "three";
import { INITIAL_FIELD, type FieldBounds } from "../game/config/chunks";
import type { WeatherKind } from "./Weather";

/**
 * Nacht-Atmosphaere: schwebende Gluehwuermchen ueber dem Farmfeld.
 *
 * Ein einzelnes Points-Draw-Call mit Shader-Puls. Die Positionen werden nur bei
 * Feldgroessen-Aenderung neu gebaut; die Bewegung passiert im Vertex-Shader.
 */

const BASE_COUNT = 90;
const BASE_AREA = (INITIAL_FIELD.maxX - INITIAL_FIELD.minX) * (INITIAL_FIELD.maxZ - INITIAL_FIELD.minZ);
const CAP = 220;
const FIELD_INSET = 4;

export class Fireflies {
  readonly object = new THREE.Group();

  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private opacity = 0;

  constructor() {
    this.mat = makeMaterial();
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.object.add(this.points);
    this.rebuildForField(INITIAL_FIELD);
  }

  rebuildForField(field: FieldBounds): void {
    const width = Math.max(1, field.maxX - field.minX - FIELD_INSET * 2);
    const depth = Math.max(1, field.maxZ - field.minZ - FIELD_INSET * 2);
    const count = Math.min(CAP, Math.round((width * depth * BASE_COUNT) / BASE_AREA));
    const rng = mulberry32(seedFromField(field));

    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const lifts = new Float32Array(count);
    const tones = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const o = i * 3;
      positions[o] = field.minX + FIELD_INSET + rng() * width;
      positions[o + 1] = 0.7 + rng() * 1.9;
      positions[o + 2] = field.minZ + FIELD_INSET + rng() * depth;
      phases[i] = rng() * Math.PI * 2;
      sizes[i] = 1.8 + rng() * 2.4;
      lifts[i] = 0.12 + rng() * 0.28;
      tones[i] = rng();
    }

    this.geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geo.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geo.setAttribute("aLift", new THREE.BufferAttribute(lifts, 1));
    this.geo.setAttribute("aTone", new THREE.BufferAttribute(tones, 1));
    this.geo.computeBoundingSphere();
  }

  update(dt: number, tSec: number, daylight: number, weather: WeatherKind, windStrength: number): void {
    const darkness = THREE.MathUtils.smoothstep(0.82 - THREE.MathUtils.clamp(daylight, 0, 1), 0, 0.72);
    const weatherMul = weather === "clear" ? 1 : weather === "fog" ? 0.65 : weather === "rain" ? 0.22 : 0.06;
    const windMul = THREE.MathUtils.clamp(1.35 - windStrength * 0.22, 0.25, 1);
    const target = darkness * weatherMul * windMul;
    this.opacity += (target - this.opacity) * Math.min(1, dt * 2.4);

    this.points.visible = this.opacity > 0.015;
    this.mat.uniforms.uTime.value = tSec;
    this.mat.uniforms.uOpacity.value = this.opacity;
    this.mat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

function makeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime;
      uniform float uPixelRatio;
      attribute float aPhase;
      attribute float aSize;
      attribute float aLift;
      attribute float aTone;
      varying float vGlow;
      varying float vTone;

      void main() {
        float t = uTime + aPhase;
        vec3 p = position;
        p.x += sin(t * 1.7) * 0.22 + sin(t * 0.37) * 0.34;
        p.z += cos(t * 1.35) * 0.22 + cos(t * 0.29) * 0.32;
        p.y += sin(t * 2.2) * aLift + cos(t * 1.1) * aLift * 0.45;

        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float pulse = 0.5 + 0.5 * sin(t * 5.1) + 0.18 * sin(t * 8.3);
        vGlow = clamp(0.38 + pulse * 0.72, 0.0, 1.0);
        vTone = aTone;
        gl_PointSize = aSize * uPixelRatio * (55.0 / max(-mvPosition.z, 1.0));
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying float vGlow;
      varying float vTone;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float halo = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.16, 0.0, d);
        vec3 gold = vec3(1.0, 0.78, 0.24);
        vec3 lime = vec3(0.58, 1.0, 0.43);
        vec3 color = mix(gold, lime, vTone * 0.55);
        float alpha = (halo * 0.42 + core * 0.85) * vGlow * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color * (0.8 + core * 1.4), alpha);
      }
    `,
  });
}

function seedFromField(f: FieldBounds): number {
  const w = Math.round(f.maxX - f.minX);
  const d = Math.round(f.maxZ - f.minZ);
  return ((w * 2654435761) ^ (d * 1597334677)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
