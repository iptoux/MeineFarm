import * as THREE from "three";

/**
 * Geteilter Wind-Vertex-Shader für Gras und Bäume: Vertices oberhalb der Wurzel
 * schwingen, die Wurzel bleibt fix. Die Auslenkung ist höhenmaskiert (smoothstep)
 * und pro Instanz phasenverschoben (aus der Instanz-Weltposition), damit nicht
 * alle Büschel/Kronen synchron wippen.
 *
 * Zwei geteilte Uniforms:
 *  - `uTime`  — Gesamtzeit (alle Wind-Materialien teilen sie sich),
 *  - `uWind`  — Stärke-Multiplikator (vom Wetter gesetzt: ruhig ~0.4, Sturm ~2.4).
 *
 * Effektive Auslenkung = `amplitude * uWind`.
 */
export function applyWind(
  material: THREE.Material,
  uTime: { value: number },
  uWind: { value: number },
  height: number,
  amplitude: number,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uWind = uWind;
    shader.uniforms.uHeight = { value: height };
    shader.uniforms.uAmp = { value: amplitude };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform float uTime;
         uniform float uWind;
         uniform float uHeight;
         uniform float uAmp;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         {
           #ifdef USE_INSTANCING
             vec3 instPos = instanceMatrix[3].xyz;
           #else
             vec3 instPos = vec3(0.0);
           #endif
           float phase = instPos.x * 0.35 + instPos.z * 0.35;
           float mask = smoothstep(0.0, uHeight, position.y);
           float w = sin(uTime * 1.6 + phase) * 0.6 + sin(uTime * 0.7 + phase * 1.7) * 0.4;
           float amp = uAmp * uWind;
           transformed.x += w * mask * amp;
           transformed.z += w * mask * amp * 0.4;
         }`,
      );
  };
  material.needsUpdate = true;
}
