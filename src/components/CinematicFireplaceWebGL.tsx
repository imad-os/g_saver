import React, { useEffect, useRef, useState } from 'react';
import {
  CameraViewMode,
  FireplaceQualityPreset,
  ScreensaverSettings,
} from '../utils/screensaverLogic';
import { getOrCreateFireFlipbookAtlas } from '../utils/openSourceFireVfx';
import stonePlateUrl from '../assets/images/fireplace_stone_plate_1794305469574.jpg';
import oakLogsEmbersUrl from '../assets/images/fireplace_oak_logs_embers_1794305470620.jpg';

interface CinematicFireplaceWebGLProps {
  settings: ScreensaverSettings;
  hardwareTier?: 'low' | 'mid' | 'high';
  isPaused: boolean;
  gamepadAxesRef?: React.MutableRefObject<{ rx: number; ry: number }>;
  orbitOffset?: { x: number; y: number };
  onInteract?: () => void;
  onCanvasInteract?: () => void;
}

interface DiagnosticsMetrics {
  fps: number;
  width: number;
  height: number;
  scale: number;
  particleCount: number;
  webglStatus: string;
  activeQualityLabel: string;
  viewModeLabel: string;
}

const MAX_SPARKS = 240;

/**
 * Exact UV crop rectangles [uvMinX, uvMinY, uvMaxX, uvMaxY] in normalized 16:9 plate space:
 *  - 'wide'   : Full living room & stone fireplace plate [0.000, 0.000, 1.000, 1.000]
 *  - 'fit'    : Balanced framing fitted around fireplace [0.085, 0.085, 0.915, 0.945]
 *  - 'hearth' : Only the hearth stone design & mantel, no outer room wall [0.258, 0.250, 0.742, 0.935]
 *  - 'logs'   : No wall, no outer design — only inside hearth walls, oak logs & fire [0.382, 0.468, 0.618, 0.820]
 */
function resolveViewCrop(viewMode: CameraViewMode): {
  crop: [number, number, number, number];
  modeInt: number;
  resMultiplier: number;
} {
  switch (viewMode) {
    case 'fit':
      return {
        crop: [0.085, 0.085, 0.915, 0.945],
        modeInt: 1,
        resMultiplier: 0.94,
      };
    case 'hearth':
      return {
        crop: [0.258, 0.250, 0.742, 0.935],
        modeInt: 2,
        resMultiplier: 0.88,
      };
    case 'logs':
      return {
        crop: [0.382, 0.468, 0.618, 0.820],
        modeInt: 3,
        resMultiplier: 0.78,
      };
    case 'wide':
    default:
      return {
        crop: [0.0, 0.0, 1.0, 1.0],
        modeInt: 0,
        resMultiplier: 1.0,
      };
  }
}

/**
 * Pass 1 Vertex Shader (GLSL ES 3.00):
 * Remaps fullscreen quad UVs directly to `u_viewCrop` so the GPU NEVER shades off-screen wall/mantel pixels!
 */
const COMPOSITE_VERT_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
uniform vec4 u_viewCrop; // xy = uvMin, zw = uvMax
out vec2 v_uv;

void main() {
  vec2 rawUv = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
  v_uv = mix(u_viewCrop.xy, u_viewCrop.zw, rawUv);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/**
 * Pass 1 Fragment Shader (GLSL ES 3.00):
 * Hybrid Photographic + Open-Source Game VFX & Volumetric Combustion Compositor
 * Optimized for Low-Resource Smart TVs & Multi-Hour Stability:
 *  - u_viewMode:
 *      0 = wide (default)
 *      1 = fit
 *      2 = hearth (hearth design only, no outer wall — skips outer wall shading)
 *      3 = logs (inside hearth & fire only, shows inner firebrick/stone walls texture — skips all exterior lighting/refraction)
 */
const COMPOSITE_FRAG_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_bgTex;
uniform sampler2D u_logsTex;
uniform sampler2D u_flipbookTex;
uniform float u_time;
uniform float u_fireIntensity;
uniform float u_flameHeight;
uniform float u_coalGlow;
uniform float u_smokeAmount;
uniform float u_windDraft;
uniform float u_octaves;
uniform float u_peakLuminance;
uniform int u_colorTempMode;
uniform int u_fireEffectStyle;
uniform int u_viewMode;

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT_MAT = mat2(0.80, -0.60, 0.60, 0.80);

float fbm(vec2 p, float octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    val += amp * noise2D(p * freq);
    p = ROT_MAT * p * 2.03 + vec2(17.1, 31.7);
    amp *= 0.5;
  }
  return val;
}

// Cellular Voronoi distance for glowing log ember cracks (evaluated only on log pixels)
float emberCells(vec2 p, float t) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;
  float cellId = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 rnd = hash22(n + g) * 0.5 + 0.5;
      rnd = 0.5 + 0.38 * sin(t * 0.9 + 6.2831 * rnd);
      vec2 diff = g + rnd - f;
      float d = dot(diff, diff);
      if (d < minDist) {
        minDist = d;
        cellId = rnd.x;
      }
    }
  }
  return (1.0 - sqrt(minDist)) * (0.65 + 0.35 * cellId);
}

// Procedural Inner Hearth Firebrick & Carved Stone Masonry Texture for Inside Firebox Walls
vec3 evaluateInnerHearthWallTexture(vec2 uv, vec3 baseSample, float fireEnergy) {
  // Map firebox interior [0.38..0.62, 0.46..0.82] into masonry course coordinates
  vec2 local = vec2((uv.x - 0.38) / 0.24, (uv.y - 0.46) / 0.36);

  // Subtle perspective arch on side jambs vs back wall
  float sideDist = abs(local.x - 0.5) * 2.0;
  vec2 brickGrid = vec2(local.x * 9.0, local.y * 14.0);
  float row = floor(brickGrid.y);
  // Staggered running-bond masonry offset per row
  brickGrid.x += mod(row, 2.0) * 0.5;

  vec2 cellId = floor(brickGrid);
  vec2 cellUv = fract(brickGrid);

  // Organic hand-chiseled mortar joint lines with subtle heat erosion
  float jitter = (noise2D(brickGrid * 3.5) - 0.5) * 0.08;
  float mortarX = smoothstep(0.04, 0.11, abs(cellUv.x - 0.5) - 0.42 + jitter);
  float mortarY = smoothstep(0.06, 0.16, abs(cellUv.y - 0.5) - 0.38 + jitter);
  float isMortar = clamp(mortarX + mortarY, 0.0, 1.0);

  // Per-stone mineral variation + fine surface grain
  float stoneVar = 0.72 + 0.52 * hash21(cellId);
  float grain = noise2D(local * vec2(65.0, 52.0)) * 0.65 + noise2D(local * 140.0) * 0.35;

  // Base firebrick / dark limestone color with warm soot gradient
  vec3 stoneTone = mix(
    vec3(0.11, 0.075, 0.058),
    vec3(0.22, 0.135, 0.092),
    stoneVar * (0.55 + 0.45 * grain)
  );
  vec3 mortarTone = vec3(0.055, 0.042, 0.036);
  vec3 masonry = mix(stoneTone, mortarTone, isMortar * 0.82);

  // Blend with underlying photographic texture details
  masonry = mix(masonry, baseSample * 0.55 + masonry * 0.65, 0.45);

  // Warm radial firelight grazing the rough inner stone relief
  vec2 lightRel = (local - vec2(0.50, 0.64)) * vec2(1.35, 1.15);
  float radialGlow = exp(-dot(lightRel, lightRel) * 2.1) * fireEnergy;
  float reliefHighlight = (1.0 - isMortar * 0.7) * (0.65 + 0.70 * grain);

  vec3 litWall =
    masonry * (0.42 + 0.35 * (1.0 - sideDist * 0.4)) +
    masonry * vec3(2.4, 0.98, 0.32) * radialGlow * reliefHighlight * 1.65 +
    vec3(0.20, 0.065, 0.012) * radialGlow * reliefHighlight;

  return litWall;
}

vec3 blackbodyFlameColor(float temp) {
  float t = clamp(temp, 0.0, 1.45);
  vec3 c1 = vec3(0.52, 0.04, 0.005);
  vec3 c2 = vec3(0.98, 0.28, 0.02);
  vec3 c3 = vec3(1.00, 0.72, 0.16);
  vec3 c4 = vec3(1.00, 0.98, 0.88);

  vec3 col = mix(vec3(0.0), c1, smoothstep(0.02, 0.22, t));
  col = mix(col, c2, smoothstep(0.16, 0.50, t));
  col = mix(col, c3, smoothstep(0.44, 0.80, t));
  col = mix(col, c4, smoothstep(0.74, 1.16, t));
  return col;
}

vec4 sampleSubUvFlipbook(vec2 localUv, float frameFloat) {
  if (localUv.x < 0.02 || localUv.x > 0.98 || localUv.y < 0.02 || localUv.y > 0.98) {
    return vec4(0.0);
  }
  float f0 = mod(floor(frameFloat), 64.0);
  float f1 = mod(f0 + 1.0, 64.0);
  float blend = fract(frameFloat);

  vec2 tile0 = vec2(mod(f0, 8.0), floor(f0 / 8.0));
  vec2 tile1 = vec2(mod(f1, 8.0), floor(f1 / 8.0));

  vec2 uv0 = (tile0 + clamp(localUv, 0.03, 0.97)) / 8.0;
  vec2 uv1 = (tile1 + clamp(localUv, 0.03, 0.97)) / 8.0;

  return mix(texture(u_flipbookTex, uv0), texture(u_flipbookTex, uv1), blend);
}

vec3 evaluateGameFlipbookVfx(
  vec2 uv,
  vec2 baseCenter,
  vec2 span,
  float time,
  float wind,
  float fps
) {
  float ny = (baseCenter.y - uv.y) / span.y;
  if (ny < -0.12 || ny > 1.25) return vec3(0.0);
  float nx = (uv.x - baseCenter.x) / span.x;
  if (abs(nx) > 1.35) return vec3(0.0);

  vec3 accum = vec3(0.0);
  // 5 well-spaced Sub-UV flipbook emitters (optimized from 7 for low-resource TV GPUs)
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float emitterX = (fi / 2.0 - 1.0) * 0.70;
    float bell = cos(emitterX * 1.45);
    float w = 0.48 + 0.18 * bell;
    float h = 0.70 + 0.34 * bell;

    float sway =
      sin(ny * 4.5 - time * (3.6 + fi * 0.45) + fi * 1.9) * 0.11 * max(0.0, ny) +
      wind * pow(max(0.0, ny), 1.25) * 0.38;

    float lx = (nx - emitterX - sway) / w + 0.5;
    float ly = 1.0 - (ny + 0.04 * sin(fi * 2.3)) / h;

    float frame = time * (fps + fi * 2.1) + fi * 13.7;
    vec4 sprite = sampleSubUvFlipbook(vec2(lx, ly), frame);
    accum += sprite.rgb * sprite.a * (0.68 + 0.28 * bell);
  }
  return accum;
}

float evaluateWorleyVolumetricFlame(
  vec2 uv,
  vec2 baseCenter,
  vec2 span,
  float time,
  float speed,
  float wind,
  float octaves,
  float phaseSeed
) {
  float ny = (baseCenter.y - uv.y) / span.y;
  if (ny < -0.08 || ny > 1.25) return 0.0;

  float nx = (uv.x - baseCenter.x) / span.x;
  nx -= wind * pow(max(0.0, ny), 1.35) * 0.42;
  if (abs(nx) > 1.35) return 0.0;

  float emitterComb =
    0.62 +
    0.26 * sin(nx * 9.5 + sin(time * 1.5 + phaseSeed) * 1.4) +
    0.22 * cos(nx * 17.0 - time * 2.1 + phaseSeed * 2.1) +
    0.16 * sin(nx * 27.0 + time * 2.9);
  emitterComb = clamp(emitterComb, 0.25, 1.28);

  vec2 p = vec2(nx * 2.65, ny * 2.15 - time * speed);
  float subOct = max(2.0, octaves - 1.0);

  vec2 q = vec2(
    fbm(p + vec2(phaseSeed, time * 0.45), subOct),
    fbm(p + vec2(5.2 + phaseSeed, 1.3 - time * 0.55), subOct)
  );

  vec2 r = vec2(
    fbm(p + 2.40 * q + vec2(1.7 - time * 0.85, 9.2 + phaseSeed), octaves),
    fbm(p + 2.40 * q + vec2(8.3 + time * 0.65, 2.8 - time * 1.35), octaves)
  );

  float f = fbm(p + 1.85 * r, octaves);

  // Fast 2D erosion noise instead of 9-tap Voronoi inside flame loop (saves 18 loop iterations/pixel)
  float erosionBite = noise2D(vec2(nx * 5.2 + q.x, ny * 6.0 - time * speed * 1.2));
  float lateralPinch = 1.0 - smoothstep(0.18, 1.02, abs(nx) + ny * 0.34 + (r.x - 0.5) * 0.42);
  float verticalEnvelope =
    smoothstep(-0.05, 0.10, ny) *
    (1.0 - smoothstep(0.35 * emitterComb, 0.99 * emitterComb, ny + (f - 0.5) * 0.44));

  float rawDensity =
    (f * 0.72 + r.y * 0.38 - pow(max(0.0, ny), 1.25) * (1.0 - erosionBite) * 0.26) *
    lateralPinch *
    verticalEnvelope *
    emitterComb;
  return max(0.0, rawDensity * 1.75 - 0.14);
}

float evaluateFluidRibbonTongues(
  vec2 uv,
  vec2 baseCenter,
  vec2 span,
  float time,
  float wind
) {
  float ny = (baseCenter.y - uv.y) / span.y;
  if (ny < -0.05 || ny > 1.20) return 0.0;
  float nx = (uv.x - baseCenter.x) / span.x;
  if (abs(nx) > 1.30) return 0.0;

  float sum = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float rootX = (fi / 3.5 - 1.0) * 0.78;
    float arch = cos(rootX * 1.35);
    float ribbonH = (0.55 + 0.42 * arch) * (0.88 + 0.16 * sin(time * 3.1 + fi * 2.1));
    if (ny > ribbonH) continue;

    float v = clamp(ny / ribbonH, 0.0, 1.0);
    float curlSway =
      sin(v * 5.2 - time * (4.8 + mod(fi, 3.0) * 1.2) + fi * 1.7) * 0.12 * pow(v, 1.15) +
      cos(v * 8.4 - time * 6.5 + fi) * 0.05 * v +
      wind * pow(v, 1.3) * 0.42;

    float halfW = (0.098 + 0.068 * arch) * pow(1.0 - v * 0.88, 0.75);
    float dist = abs(nx - (rootX + curlSway));
    float tongue = smoothstep(halfW, halfW * 0.15, dist) * sin(pow(v, 0.65) * 3.14159);
    sum += tongue * (0.56 + 0.25 * arch);
  }
  return clamp(sum, 0.0, 1.35);
}

void main() {
  vec2 uv = v_uv;
  float t = u_time;

  // Firebox opening geometry in normalized 16:9 plate space
  // In 'logs' mode (u_viewMode == 3), the entire viewport is inside the hearth firebox!
  float fireboxMask = 1.0;
  if (u_viewMode != 3) {
    float fireboxMaskX =
      smoothstep(0.378, 0.394, uv.x) * (1.0 - smoothstep(0.606, 0.622, uv.x));
    float fireboxMaskY =
      smoothstep(0.460, 0.478, uv.y) * (1.0 - smoothstep(0.812, 0.826, uv.y));
    fireboxMask = fireboxMaskX * fireboxMaskY;
  }

  // --- 1. HEAT REFRACTION (Skipped in 'logs' mode to save GPU work) ---
  vec2 refractedBgUv = uv;
  if (u_viewMode != 3) {
    float heatZoneX = smoothstep(0.39, 0.44, uv.x) * (1.0 - smoothstep(0.56, 0.61, uv.x));
    float heatZoneY = smoothstep(0.34, 0.46, uv.y) * (1.0 - smoothstep(0.56, 0.68, uv.y));
    float heatMask = heatZoneX * heatZoneY * clamp(u_fireIntensity, 0.3, 1.4);
    if (heatMask > 0.001) {
      vec2 heatNoise = vec2(
        noise2D(uv * vec2(28.0, 18.0) + vec2(0.0, -t * 3.8)) - 0.5,
        noise2D(uv * vec2(24.0, 22.0) + vec2(13.4, -t * 4.4)) - 0.5
      );
      refractedBgUv += heatNoise * vec2(0.0016, 0.0022) * heatMask;
    }
  }

  vec3 bgCol = texture(u_bgTex, refractedBgUv).rgb;

  // Only dim outer living-room walls in 'wide' or 'fit' modes
  if (u_viewMode < 2) {
    float outerRoomDim = smoothstep(0.24, 0.47, abs(uv.x - 0.5));
    bgCol *= mix(1.0, 0.64, outerRoomDim);
  }

  // --- 2. GLOBAL FLICKER HARMONICS ---
  float flickerLow =
    0.90 +
    0.08 * sin(t * 2.17) +
    0.06 * sin(t * 3.83 + 1.2) +
    0.05 * cos(t * 6.41 + 2.7);
  float flickerHigh =
    1.0 +
    0.06 * sin(t * 11.3) * cos(t * 7.9) +
    0.04 * sin(t * 17.7 + 0.6);
  float totalFireEnergy = u_fireIntensity * flickerLow * flickerHigh;

  // Render detailed inner hearth firebrick / carved stone wall texture inside the firebox cavity
  float innerCavity = (u_viewMode == 3)
    ? 1.0
    : smoothstep(0.386, 0.410, uv.x) *
      (1.0 - smoothstep(0.590, 0.614, uv.x)) *
      smoothstep(0.468, 0.500, uv.y) *
      (1.0 - smoothstep(0.790, 0.820, uv.y));

  if (innerCavity > 0.001) {
    vec3 innerWallCol = evaluateInnerHearthWallTexture(uv, bgCol, totalFireEnergy);
    bgCol = mix(bgCol, innerWallCol, innerCavity);
  }

  vec3 sceneCol = bgCol;

  // Evaluate firebox combustion, oak logs, embers, and smoke only inside fireboxMask
  if (fireboxMask > 0.001) {
    // --- 3. FOREGROUND OAK LOGS & GLOWING EMBER BED SAMPLING ---
    vec2 logsUv = vec2(
      (uv.x - 0.382) / (0.618 - 0.382),
      (uv.y - 0.555) / (0.822 - 0.555)
    );
    bool inLogsBounds =
      logsUv.x >= 0.0 && logsUv.x <= 1.0 && logsUv.y >= 0.0 && logsUv.y <= 1.0;

    vec3 logsSample = vec3(0.0);
    if (inLogsBounds) {
      logsSample = texture(u_logsTex, logsUv).rgb;
    }

    float logLuma = dot(logsSample, vec3(0.299, 0.587, 0.114));
    vec2 logsCentered = (logsUv - vec2(0.50, 0.58)) * vec2(1.92, 2.05);
    float radialLogMask = 1.0 - smoothstep(0.68, 1.02, length(logsCentered));
    float edgeNoise = (noise2D(logsUv * vec2(16.0, 12.0)) - 0.5) * 0.12;
    float logEdgeFade =
      clamp(radialLogMask + edgeNoise, 0.0, 1.0) *
      smoothstep(0.04, 0.24, logsUv.y) *
      (1.0 - smoothstep(0.90, 0.995, logsUv.y));

    float logOcclusionMask = smoothstep(0.04, 0.15, logLuma) * logEdgeFade * fireboxMask;
    float logRedness = max(0.0, logsSample.r - logsSample.b * 1.25);
    float logCrackMask = smoothstep(0.08, 0.48, logRedness) * logOcclusionMask;

    float upperLogPorosity = smoothstep(0.46, 0.10, logsUv.y);
    float solidBarkMask =
      clamp(logOcclusionMask * (1.0 - upperLogPorosity * 0.62) - logCrackMask * 0.72, 0.0, 1.0);

    // --- 4. EVALUATE SELECTED OPEN-SOURCE / GAME ENGINE FIRE VFX ---
    float hScale = clamp(u_flameHeight, 0.45, 1.40);
    float firePow = clamp(u_fireIntensity, 0.25, 1.55);

    vec3 rearFlameCol = vec3(0.0);
    vec3 frontFlameCol = vec3(0.0);
    float combinedFlameDensity = 0.0;

    // Mode 0 ('game_flipbook') or Mode 3 ('roaring_bonfire'): 64-Frame Sub-UV Game Flipbook Billboards
    if (u_fireEffectStyle == 0 || u_fireEffectStyle == 3) {
      vec3 flipRear = evaluateGameFlipbookVfx(
        uv,
        vec2(0.500, 0.742),
        vec2(0.112, 0.295 * hScale),
        t,
        u_windDraft,
        24.0
      );
      vec3 flipFront = evaluateGameFlipbookVfx(
        uv,
        vec2(0.502, 0.736),
        vec2(0.102, 0.265 * hScale),
        t + 11.7,
        u_windDraft * 0.9,
        27.0
      );
      float boost = u_fireEffectStyle == 3 ? 1.15 : 1.42;
      rearFlameCol += flipRear * firePow * flickerLow * boost;
      frontFlameCol += flipFront * firePow * flickerHigh * boost;
      combinedFlameDensity += dot(flipRear + flipFront, vec3(0.333)) * 0.95;

      // Fast lightweight thermal core glow for Mode 0 (avoids running 6-octave FBM in flipbook mode!)
      if (u_fireEffectStyle == 0) {
        vec2 coreRel = (uv - vec2(0.500, 0.715)) / vec2(0.095, 0.145 * hScale);
        float coreGlow = exp(-dot(coreRel, coreRel) * 1.8) * firePow * flickerLow * 0.55;
        rearFlameCol += blackbodyFlameColor(coreGlow);
      }
    }

    // Mode 1 ('volumetric_shader') or Mode 3 ('roaring_bonfire')
    if (u_fireEffectStyle == 1 || u_fireEffectStyle == 3) {
      float volWeight = (u_fireEffectStyle == 1) ? 1.45 : 0.72;
      float rearD = evaluateWorleyVolumetricFlame(
        uv,
        vec2(0.500, 0.746),
        vec2(0.108, 0.295 * hScale),
        t,
        1.62,
        u_windDraft,
        u_octaves,
        1.37
      ) * fireboxMask * firePow * volWeight;

      float frontD = evaluateWorleyVolumetricFlame(
        uv,
        vec2(0.502, 0.738),
        vec2(0.098, 0.265 * hScale),
        t + 19.4,
        1.98,
        u_windDraft * 0.95,
        u_octaves,
        8.13
      ) * fireboxMask * firePow * volWeight;

      rearFlameCol += blackbodyFlameColor(rearD * 0.98 * flickerLow);
      frontFlameCol += blackbodyFlameColor(frontD * 1.12 * flickerHigh);
      combinedFlameDensity += (rearD + frontD) * 0.65;
    }

    // Mode 2 ('fluid_ribbons') or Mode 3 ('roaring_bonfire')
    if (u_fireEffectStyle == 2 || u_fireEffectStyle == 3) {
      float ribWeight = (u_fireEffectStyle == 2) ? 1.38 : 0.65;
      float ribRear = evaluateFluidRibbonTongues(
        uv,
        vec2(0.500, 0.744),
        vec2(0.106, 0.290 * hScale),
        t,
        u_windDraft
      ) * fireboxMask * firePow * ribWeight;

      float ribFront = evaluateFluidRibbonTongues(
        uv,
        vec2(0.502, 0.736),
        vec2(0.096, 0.260 * hScale),
        t + 7.9,
        u_windDraft * 0.9
      ) * fireboxMask * firePow * ribWeight;

      rearFlameCol += blackbodyFlameColor(ribRear * 1.05 * flickerLow);
      frontFlameCol += blackbodyFlameColor(ribFront * 1.18 * flickerHigh);
      combinedFlameDensity += (ribRear + ribFront) * 0.75;
    }

    // --- 5. SUBTLE TURBULENT WOODSMOKE PLUME ---
    float smokeRegion =
      smoothstep(0.395, 0.445, uv.x) *
      (1.0 - smoothstep(0.555, 0.605, uv.x)) *
      smoothstep(0.468, 0.500, uv.y) *
      (1.0 - smoothstep(0.575, 0.655, uv.y));
    if (smokeRegion > 0.001 && u_smokeAmount > 0.01) {
      vec2 smokeUv = vec2(uv.x * 6.0 - u_windDraft * (0.72 - uv.y) * 1.5, uv.y * 5.0 - t * 0.52);
      float smokeNoise = fbm(smokeUv, 2.0);
      float smokeAlpha =
        smokeRegion *
        smoothstep(0.38, 0.82, smokeNoise) *
        0.14 *
        clamp(u_smokeAmount, 0.0, 1.2);
      vec3 smokeTint = mix(vec3(0.16, 0.13, 0.12), vec3(0.38, 0.22, 0.11), flickerLow * 0.65);
      sceneCol = mix(sceneCol, smokeTint, smokeAlpha);
    }

    // Add Rear Flame Sheet behind/above the logs
    float rearOcclusion = 1.0 - solidBarkMask * 0.78;
    sceneCol += rearFlameCol * rearOcclusion;

    // --- 6. GLOWING LOG CRACKS & CELLULAR EMBER BED ANIMATION ---
    if (logOcclusionMask > 0.001) {
      float emberRegionMask = smoothstep(0.45, 0.86, logsUv.y) * logOcclusionMask;
      float cellPulse = 0.5;
      // Only run 9-tap Voronoi emberCells where cracks or ember bed actually exist!
      if (logCrackMask > 0.015 || emberRegionMask > 0.02) {
        cellPulse = emberCells(uv * vec2(115.0, 145.0), t * 1.35);
      }
      float slowHeatWave =
        0.76 +
        0.24 * noise2D(uv * 18.0 + vec2(t * 0.42, -t * 0.31)) +
        0.16 * sin(t * 2.9 + uv.x * 24.0);

      float coalIntensity = clamp(u_coalGlow, 0.2, 1.45) * slowHeatWave;
      float dynamicEmberHeat =
        logCrackMask * (0.88 + 0.58 * cellPulse) * coalIntensity +
        emberRegionMask * pow(cellPulse, 2.0) * 0.48 * coalIntensity;

      vec3 emissiveCrackCol = blackbodyFlameColor(clamp(dynamicEmberHeat * 1.02, 0.0, 1.25));
      float localFlameLight = clamp(combinedFlameDensity * 0.85, 0.0, 1.6);

      float charFactor = mix(0.24, 0.68, smoothstep(0.15, 0.65, logsUv.y));
      vec3 charredWoodBase = logsSample * charFactor;
      vec3 litBarkCol =
        charredWoodBase * (0.50 + 0.50 * flickerLow) +
        charredWoodBase * vec3(1.55, 0.65, 0.18) * (0.35 + localFlameLight * 1.15);

      vec3 animatedLogsCol = mix(
        litBarkCol,
        max(litBarkCol, emissiveCrackCol),
        clamp(logCrackMask * 1.40 + emberRegionMask * 0.52, 0.0, 1.0)
      );

      sceneCol = mix(sceneCol, animatedLogsCol, logOcclusionMask);
    }

    // Composite Foreground Flame Tongues
    float frontLum = dot(frontFlameCol, vec3(0.333));
    float frontAlpha = clamp(frontLum * 0.85, 0.0, 0.92);
    sceneCol = sceneCol * (1.0 - frontAlpha * 0.32) + frontFlameCol * 0.96;
  }

  // --- 7. DYNAMIC ENVIRONMENTAL LIGHTING ON OUTER STONE JAMBS, MANTEL & FLOOR ---
  // Completely skipped in 'logs' mode (u_viewMode == 3) because outer stone design is not visible!
  if (u_viewMode != 3) {
    vec2 fireOrigin = vec2(0.500, 0.695);
    vec2 dVec = (uv - fireOrigin) * vec2(1.777, 1.0);
    float dist = length(dVec);

    float jambMask =
      smoothstep(0.28, 0.42, uv.x) *
      (1.0 - smoothstep(0.58, 0.72, uv.x)) *
      smoothstep(0.36, 0.48, uv.y) *
      (1.0 - smoothstep(0.82, 0.92, uv.y));
    float jambLight = exp(-dist * 4.0) * jambMask * totalFireEnergy;

    float mantelMask =
      smoothstep(0.31, 0.40, uv.x) *
      (1.0 - smoothstep(0.60, 0.69, uv.x)) *
      smoothstep(0.34, 0.44, uv.y) *
      (1.0 - smoothstep(0.465, 0.49, uv.y));
    float mantelLight = mantelMask * (0.45 + 0.55 * flickerHigh) * totalFireEnergy * 0.45;

    float hearthFloorMask =
      smoothstep(0.24, 0.38, uv.x) *
      (1.0 - smoothstep(0.62, 0.76, uv.x)) *
      smoothstep(0.785, 0.825, uv.y) *
      (1.0 - smoothstep(0.94, 0.985, uv.y));
    float floorDistX = abs(uv.x - 0.50);
    float floorFalloff = exp(-floorDistX * 6.2) * exp(-(uv.y - 0.80) * 7.2);
    float hearthLight = hearthFloorMask * floorFalloff * totalFireEnergy * 0.82;

    float stoneLuma = dot(bgCol, vec3(0.333));
    float stoneRelief = smoothstep(0.02, 0.45, stoneLuma);
    vec3 fireLightTint = vec3(1.00, 0.48, 0.14);

    sceneCol +=
      bgCol * fireLightTint * (jambLight * 1.48 + mantelLight * 1.18) * (0.45 + 0.55 * stoneRelief) +
      fireLightTint * hearthLight * (0.20 + 0.80 * stoneRelief);
  }

  // --- 8. COLOR TEMPERATURE & PEAK LUMINANCE CAP ---
  if (u_colorTempMode == 1) {
    sceneCol *= vec3(1.04, 0.96, 0.86);
  } else if (u_colorTempMode == 2) {
    sceneCol *= vec3(1.08, 0.90, 0.74);
  } else if (u_colorTempMode == 3) {
    sceneCol *= vec3(0.72, 0.76, 0.88);
  }

  sceneCol = (sceneCol * (2.51 * sceneCol + 0.03)) / (sceneCol * (2.43 * sceneCol + 0.59) + 0.14);
  sceneCol *= clamp(u_peakLuminance, 0.4, 1.0);

  outColor = vec4(clamp(sceneCol, 0.0, 1.0), 1.0);
}
`;

/**
 * Pass 2 Vertex Shader (GLSL ES 3.00):
 * GPU-Driven Batched Spark Particle System mapped through `u_viewCrop`
 */
const SPARK_VERT_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec4 a_spark0; // x: spawnX, y: spawnY, z: speed, w: lifeOffset
layout(location = 1) in vec4 a_spark1; // x: driftFreq, y: driftAmp, z: sizePx, w: seed

uniform float u_time;
uniform float u_fireIntensity;
uniform float u_windDraft;
uniform float u_resolutionScale;
uniform vec4 u_viewCrop;

out float v_ageNorm;
out float v_seed;

void main() {
  float cycleDuration = 2.4 + fract(a_spark1.w * 7.13) * 2.8;
  float rawTime = u_time * a_spark0.z + a_spark0.w * cycleDuration;
  float ageNorm = fract(rawTime / cycleDuration);
  v_ageNorm = ageNorm;
  v_seed = a_spark1.w;

  float startX = a_spark0.x;
  float startY = a_spark0.y;

  float riseDist = (0.14 + 0.19 * fract(a_spark1.w * 3.7)) * clamp(u_fireIntensity, 0.5, 1.35);
  float curY = startY - pow(ageNorm, 0.88) * riseDist;

  float wave1 = sin(ageNorm * a_spark1.x + a_spark1.w * 19.0 + u_time * 1.7);
  float wave2 = cos(ageNorm * a_spark1.x * 1.8 - a_spark1.w * 11.0);
  float driftX =
    (wave1 * 0.65 + wave2 * 0.35) * a_spark1.y * pow(ageNorm, 0.7) +
    u_windDraft * ageNorm * 0.045;
  float curX = startX + driftX;

  // Confine strictly to firebox opening
  if (curY < 0.475 || curX < 0.39 || curX > 0.61) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  // Remap world plate UV [curX, curY] through active u_viewCrop into screen UV [0..1]
  vec2 viewUv = (vec2(curX, curY) - u_viewCrop.xy) / (u_viewCrop.zw - u_viewCrop.xy);
  vec2 clipPos = vec2(viewUv.x * 2.0 - 1.0, 1.0 - viewUv.y * 2.0);

  gl_Position = vec4(clipPos, 0.0, 1.0);
  float sizeEnvelope = sin(ageNorm * 3.14159265);
  float zoomMag = 1.0 / max(0.24, u_viewCrop.z - u_viewCrop.x);
  gl_PointSize = max(1.5, a_spark1.z * sizeEnvelope * u_resolutionScale * min(1.85, sqrt(zoomMag)));
}
`;

const SPARK_FRAG_SHADER = `#version 300 es
precision highp float;

in float v_ageNorm;
in float v_seed;
out vec4 outColor;

uniform float u_peakLuminance;

void main() {
  vec2 pt = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(pt, pt);
  if (r2 > 1.0) discard;

  float radialFalloff = exp(-r2 * 3.2);
  float lifeFade = smoothstep(0.0, 0.12, v_ageNorm) * (1.0 - smoothstep(0.65, 1.0, v_ageNorm));

  vec3 hotCol = vec3(1.00, 0.92, 0.62);
  vec3 midCol = vec3(1.00, 0.44, 0.08);
  vec3 coolCol = vec3(0.68, 0.08, 0.01);

  vec3 sparkCol = mix(hotCol, midCol, smoothstep(0.05, 0.48, v_ageNorm));
  sparkCol = mix(sparkCol, coolCol, smoothstep(0.45, 0.92, v_ageNorm));

  float twinkle = 0.78 + 0.22 * sin(v_ageNorm * 28.0 + v_seed * 41.0);
  float alpha = radialFalloff * lifeFade * twinkle;

  outColor = vec4(sparkCol * alpha * u_peakLuminance, alpha);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('WebGL2 Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('WebGL2 Program link error:', gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

function buildSparkAttributes(maxSparks: number): Float32Array {
  const data = new Float32Array(maxSparks * 8);
  for (let i = 0; i < maxSparks; i++) {
    const idx = i * 8;
    const h1 = ((i * 0.61803398875) % 1 + 1) % 1;
    const h2 = ((i * 0.38196601125) % 1 + 1) % 1;
    const h3 = ((i * 0.75487766624) % 1 + 1) % 1;
    const h4 = ((i * 0.56984029099) % 1 + 1) % 1;

    data[idx + 0] = 0.425 + h1 * 0.15;
    data[idx + 1] = 0.685 + h2 * 0.095;
    data[idx + 2] = 0.75 + h3 * 0.7;
    data[idx + 3] = h4;

    data[idx + 4] = 5.0 + h2 * 8.0;
    data[idx + 5] = 0.008 + h3 * 0.024;
    data[idx + 6] = 4.5 + h1 * 6.5;
    data[idx + 7] = h4 * 100.0 + i * 0.13;
  }
  return data;
}

const CinematicFireplaceWebGLInner: React.FC<CinematicFireplaceWebGLProps> = ({
  settings,
  hardwareTier = 'high',
  isPaused,
  gamepadAxesRef,
  orbitOffset = { x: 0, y: 0 },
  onInteract,
  onCanvasInteract,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef<ScreensaverSettings>(settings);
  const hardwareTierRef = useRef<'low' | 'mid' | 'high'>(hardwareTier);
  const isPausedRef = useRef<boolean>(isPaused);

  const [diagnostics, setDiagnostics] = useState<DiagnosticsMetrics>({
    fps: 60,
    width: 1920,
    height: 1080,
    scale: 1.0,
    particleCount: 220,
    webglStatus: 'WebGL2 ES 3.00 Active',
    activeQualityLabel: 'Maximum (100%)',
    viewModeLabel: 'wide',
  });

  useEffect(() => {
    settingsRef.current = settings;
    hardwareTierRef.current = hardwareTier;
  }, [settings, hardwareTier]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    let compositeProg: WebGLProgram | null = null;
    let sparkProg: WebGLProgram | null = null;
    let quadVao: WebGLVertexArrayObject | null = null;
    let quadVbo: WebGLBuffer | null = null;
    let sparkVao: WebGLVertexArrayObject | null = null;
    let sparkVbo: WebGLBuffer | null = null;
    let bgTex: WebGLTexture | null = null;
    let logsTex: WebGLTexture | null = null;
    let flipbookTex: WebGLTexture | null = null;

    let rafId = 0;
    let timerId = 0;
    let isContextLost = false;
    let isSoftwareGl = false;
    let simTimeSec = 0;
    let lastFrameTs = 0;

    // Adaptive quality tracking for low-resource TVs & automatic mode
    let dynamicScale = 1.0;
    let frameCount = 0;
    let fpsAccumMs = 0;
    let currentMeasuredFps = 60;

    let uBgTexLoc: WebGLUniformLocation | null = null;
    let uLogsTexLoc: WebGLUniformLocation | null = null;
    let uFlipbookTexLoc: WebGLUniformLocation | null = null;
    let uTimeLoc: WebGLUniformLocation | null = null;
    let uFireIntensityLoc: WebGLUniformLocation | null = null;
    let uFlameHeightLoc: WebGLUniformLocation | null = null;
    let uCoalGlowLoc: WebGLUniformLocation | null = null;
    let uSmokeAmountLoc: WebGLUniformLocation | null = null;
    let uWindDraftLoc: WebGLUniformLocation | null = null;
    let uOctavesLoc: WebGLUniformLocation | null = null;
    let uPeakLumLoc: WebGLUniformLocation | null = null;
    let uColorTempLoc: WebGLUniformLocation | null = null;
    let uFireEffectStyleLoc: WebGLUniformLocation | null = null;
    let uViewModeLoc: WebGLUniformLocation | null = null;
    let uViewCropLoc: WebGLUniformLocation | null = null;

    let uSparkTimeLoc: WebGLUniformLocation | null = null;
    let uSparkFireLoc: WebGLUniformLocation | null = null;
    let uSparkWindLoc: WebGLUniformLocation | null = null;
    let uSparkScaleLoc: WebGLUniformLocation | null = null;
    let uSparkPeakLumLoc: WebGLUniformLocation | null = null;
    let uSparkViewCropLoc: WebGLUniformLocation | null = null;

    const resolvePresetParams = (
      preset: FireplaceQualityPreset,
      viewMode: CameraViewMode
    ): {
      scale: number;
      octaves: number;
      sparks: number;
      label: string;
      crop: [number, number, number, number];
      modeInt: number;
    } => {
      const viewCfg = resolveViewCrop(viewMode);
      const isLowTv =
        hardwareTierRef.current === 'low' || settingsRef.current.qualityTier === 'low';
      const swMult = isSoftwareGl ? 0.5 : isLowTv ? 0.68 : 1.0;
      const viewResMult = viewCfg.resMultiplier;

      if (preset === 'high' || isLowTv) {
        return {
          scale: Math.max(0.45, 0.82 * swMult * viewResMult * dynamicScale),
          octaves: isSoftwareGl || isLowTv ? 3.0 : 4.0,
          sparks: isLowTv ? 90 : 140,
          label: isLowTv ? 'TV Eco Optimized' : `High (${viewMode.toUpperCase()})`,
          crop: viewCfg.crop,
          modeInt: viewCfg.modeInt,
        };
      }
      if (preset === 'automatic') {
        const oct = dynamicScale >= 0.92 ? 5.0 : dynamicScale >= 0.78 ? 4.0 : 3.0;
        const spk = dynamicScale >= 0.92 ? 200 : dynamicScale >= 0.78 ? 135 : 85;
        return {
          scale: Math.max(0.45, dynamicScale * swMult * viewResMult),
          octaves: isSoftwareGl ? Math.min(3.0, oct) : oct,
          sparks: spk,
          label: `Auto (${Math.round(dynamicScale * viewResMult * 100)}%)`,
          crop: viewCfg.crop,
          modeInt: viewCfg.modeInt,
        };
      }
      // Default: 'maximum' (still respects viewResMult & adaptive dynamicScale if FPS dips on TV)
      return {
        scale: Math.max(0.48, 1.0 * swMult * viewResMult * dynamicScale),
        octaves: isSoftwareGl ? 3.0 : 5.0,
        sparks: viewMode === 'logs' ? 165 : 220,
        label: `Max · ${viewMode.toUpperCase()} (${Math.round(viewResMult * dynamicScale * 100)}%)`,
        crop: viewCfg.crop,
        modeInt: viewCfg.modeInt,
      };
    };

    const syncCanvasDimensions = (scaleFactor: number) => {
      if (!canvas || !gl) return;
      const vw = Math.min(1920, Math.max(640, window.innerWidth || 1920));
      const vh = Math.min(1080, Math.max(360, window.innerHeight || 1080));
      const targetW = Math.round(vw * scaleFactor);
      const targetH = Math.round(vh * scaleFactor);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        gl.viewport(0, 0, targetW, targetH);
      }
    };

    const createPlaceholderTexture = (
      context: WebGL2RenderingContext,
      r: number,
      g: number,
      b: number
    ): WebGLTexture | null => {
      const tex = context.createTexture();
      if (!tex) return null;
      context.bindTexture(context.TEXTURE_2D, tex);
      const pixel = new Uint8Array([r, g, b, 255]);
      context.texImage2D(
        context.TEXTURE_2D,
        0,
        context.RGBA,
        1,
        1,
        0,
        context.RGBA,
        context.UNSIGNED_BYTE,
        pixel
      );
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
      context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
      return tex;
    };

    const loadPhotographicTexture = (
      context: WebGL2RenderingContext,
      tex: WebGLTexture | null,
      srcUrl: string
    ) => {
      if (!tex) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        img.onload = null;
        if (isContextLost || !gl) return;
        context.bindTexture(context.TEXTURE_2D, tex);
        context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, 0);
        context.texImage2D(
          context.TEXTURE_2D,
          0,
          context.RGBA,
          context.RGBA,
          context.UNSIGNED_BYTE,
          img
        );
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
        context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
      };
      img.src = srcUrl;
    };

    const cleanupWebGLResources = () => {
      if (!gl) return;
      if (quadVao) gl.deleteVertexArray(quadVao);
      if (quadVbo) gl.deleteBuffer(quadVbo);
      if (sparkVao) gl.deleteVertexArray(sparkVao);
      if (sparkVbo) gl.deleteBuffer(sparkVbo);
      if (bgTex) gl.deleteTexture(bgTex);
      if (logsTex) gl.deleteTexture(logsTex);
      if (flipbookTex) gl.deleteTexture(flipbookTex);
      if (compositeProg) gl.deleteProgram(compositeProg);
      if (sparkProg) gl.deleteProgram(sparkProg);

      quadVao = null;
      quadVbo = null;
      sparkVao = null;
      sparkVbo = null;
      bgTex = null;
      logsTex = null;
      flipbookTex = null;
      compositeProg = null;
      sparkProg = null;
    };

    const initWebGLPipeline = (): boolean => {
      gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });

      if (!gl) {
        setDiagnostics((prev) => ({
          ...prev,
          webglStatus: 'WebGL2 Unavailable',
        }));
        return false;
      }

      const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererStr = String(
        (dbgExt ? gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) : '') ||
          gl.getParameter(gl.RENDERER) ||
          ''
      );
      isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererStr);

      compositeProg = createProgram(gl, COMPOSITE_VERT_SHADER, COMPOSITE_FRAG_SHADER);
      sparkProg = createProgram(gl, SPARK_VERT_SHADER, SPARK_FRAG_SHADER);
      if (!compositeProg || !sparkProg) {
        setDiagnostics((prev) => ({
          ...prev,
          webglStatus: 'Shader Compile Error',
        }));
        return false;
      }

      quadVao = gl.createVertexArray();
      quadVbo = gl.createBuffer();
      gl.bindVertexArray(quadVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
      const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      sparkVao = gl.createVertexArray();
      sparkVbo = gl.createBuffer();
      gl.bindVertexArray(sparkVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, sparkVbo);
      const sparkData = buildSparkAttributes(MAX_SPARKS);
      gl.bufferData(gl.ARRAY_BUFFER, sparkData, gl.STATIC_DRAW);

      const stride = 8 * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 4 * 4);

      gl.bindVertexArray(null);

      uBgTexLoc = gl.getUniformLocation(compositeProg, 'u_bgTex');
      uLogsTexLoc = gl.getUniformLocation(compositeProg, 'u_logsTex');
      uFlipbookTexLoc = gl.getUniformLocation(compositeProg, 'u_flipbookTex');
      uTimeLoc = gl.getUniformLocation(compositeProg, 'u_time');
      uFireIntensityLoc = gl.getUniformLocation(compositeProg, 'u_fireIntensity');
      uFlameHeightLoc = gl.getUniformLocation(compositeProg, 'u_flameHeight');
      uCoalGlowLoc = gl.getUniformLocation(compositeProg, 'u_coalGlow');
      uSmokeAmountLoc = gl.getUniformLocation(compositeProg, 'u_smokeAmount');
      uWindDraftLoc = gl.getUniformLocation(compositeProg, 'u_windDraft');
      uOctavesLoc = gl.getUniformLocation(compositeProg, 'u_octaves');
      uPeakLumLoc = gl.getUniformLocation(compositeProg, 'u_peakLuminance');
      uColorTempLoc = gl.getUniformLocation(compositeProg, 'u_colorTempMode');
      uFireEffectStyleLoc = gl.getUniformLocation(compositeProg, 'u_fireEffectStyle');
      uViewModeLoc = gl.getUniformLocation(compositeProg, 'u_viewMode');
      uViewCropLoc = gl.getUniformLocation(compositeProg, 'u_viewCrop');

      uSparkTimeLoc = gl.getUniformLocation(sparkProg, 'u_time');
      uSparkFireLoc = gl.getUniformLocation(sparkProg, 'u_fireIntensity');
      uSparkWindLoc = gl.getUniformLocation(sparkProg, 'u_windDraft');
      uSparkScaleLoc = gl.getUniformLocation(sparkProg, 'u_resolutionScale');
      uSparkPeakLumLoc = gl.getUniformLocation(sparkProg, 'u_peakLuminance');
      uSparkViewCropLoc = gl.getUniformLocation(sparkProg, 'u_viewCrop');

      bgTex = createPlaceholderTexture(gl, 18, 14, 12);
      logsTex = createPlaceholderTexture(gl, 0, 0, 0);
      loadPhotographicTexture(gl, bgTex, stonePlateUrl);
      loadPhotographicTexture(gl, logsTex, oakLogsEmbersUrl);

      const flipbookCanvas = getOrCreateFireFlipbookAtlas();
      flipbookTex = gl.createTexture();
      if (flipbookTex) {
        gl.bindTexture(gl.TEXTURE_2D, flipbookTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          flipbookCanvas
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }

      const preset = resolvePresetParams(
        settingsRef.current.fireplaceQuality,
        settingsRef.current.viewMode || 'wide'
      );
      syncCanvasDimensions(preset.scale);

      return true;
    };

    let disposed = false;
    const scheduleNextFrame = () => {
      if (disposed || isContextLost) return;
      timerId = window.setTimeout(() => {
        if (!disposed && !isContextLost) {
          rafId = window.requestAnimationFrame(renderFrame);
        }
      }, isSoftwareGl ? 24 : 15);
    };

    const renderFrame = (ts: number) => {
      if (disposed) return;
      if (isPausedRef.current || isContextLost || !gl || !compositeProg || !sparkProg) {
        lastFrameTs = ts;
        scheduleNextFrame();
        return;
      }

      if (lastFrameTs === 0) lastFrameTs = ts;
      const dtMs = Math.min(100, Math.max(0, ts - lastFrameTs));
      lastFrameTs = ts;

      // Wrap simTimeSec cleanly at 3600s (1 hour) so float32 precision in GLSL sin/fract/noise
      // stays 100% sharp even after 12+ hours of continuous TV operation!
      simTimeSec = (simTimeSec + dtMs * 0.001) % 3600.0;

      const st = settingsRef.current;
      const viewMode = st.viewMode || 'wide';
      const preset = resolvePresetParams(st.fireplaceQuality, viewMode);

      frameCount++;
      fpsAccumMs += dtMs;
      if (frameCount >= 40) {
        currentMeasuredFps = Math.min(
          60,
          Math.max(1, Math.round((frameCount * 1000) / Math.max(1, fpsAccumMs)))
        );
        frameCount = 0;
        fpsAccumMs = 0;

        // Automatic thermal/FPS guard on all presets so low-resource TVs never stutter
        if (currentMeasuredFps < 38 && dynamicScale > 0.65) {
          dynamicScale = Math.max(0.65, Math.round((dynamicScale - 0.12) * 100) / 100);
        } else if (
          st.fireplaceQuality === 'automatic' &&
          currentMeasuredFps >= 56 &&
          dynamicScale < 1.0
        ) {
          dynamicScale = Math.min(1.0, Math.round((dynamicScale + 0.1) * 100) / 100);
        }

        if (st.showDiagnostics) {
          const updatedPreset = resolvePresetParams(st.fireplaceQuality, viewMode);
          const activeSparks = Math.min(
            MAX_SPARKS,
            Math.round(updatedPreset.sparks * Math.min(1.3, st.emberDensity))
          );
          setDiagnostics({
            fps: currentMeasuredFps,
            width: canvas.width,
            height: canvas.height,
            scale: updatedPreset.scale,
            particleCount: activeSparks,
            webglStatus: isContextLost ? 'Context Lost' : 'WebGL2 ES 3.00 Active',
            activeQualityLabel: updatedPreset.label,
            viewModeLabel: viewMode,
          });
        }
      }

      syncCanvasDimensions(preset.scale);

      const padRx = gamepadAxesRef?.current ? gamepadAxesRef.current.rx : 0;
      const padRy = gamepadAxesRef?.current ? gamepadAxesRef.current.ry : 0;
      const effectiveFire = Math.max(0.25, Math.min(1.5, st.fireIntensity - padRy * 0.25));
      const effectiveWind = (st.windSpeed - 0.35) * 0.45 + padRx * 0.35;
      const peakLum = Math.max(0.4, Math.min(1.0, st.peakLuminance / 100));
      const tempMode =
        st.colorTemp === 'warm2700k'
          ? 1
          : st.colorTemp === 'candle2000k'
          ? 2
          : st.colorTemp === 'midnight'
          ? 3
          : 0;
      const styleMode =
        st.fireEffectStyle === 'volumetric_shader'
          ? 1
          : st.fireEffectStyle === 'fluid_ribbons'
          ? 2
          : st.fireEffectStyle === 'roaring_bonfire'
          ? 3
          : 0;

      // --- PASS 1: Draw Fullscreen Composite Fireplace Scene ---
      gl.disable(gl.BLEND);
      gl.useProgram(compositeProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bgTex);
      gl.uniform1i(uBgTexLoc, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, logsTex);
      gl.uniform1i(uLogsTexLoc, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, flipbookTex);
      gl.uniform1i(uFlipbookTexLoc, 2);

      gl.uniform1f(uTimeLoc, simTimeSec);
      gl.uniform1f(uFireIntensityLoc, effectiveFire);
      gl.uniform1f(uFlameHeightLoc, st.flameHeight);
      gl.uniform1f(uCoalGlowLoc, st.coalGlow);
      gl.uniform1f(uSmokeAmountLoc, st.smokeAmount);
      gl.uniform1f(uWindDraftLoc, effectiveWind);
      gl.uniform1f(uOctavesLoc, preset.octaves);
      gl.uniform1f(uPeakLumLoc, peakLum);
      gl.uniform1i(uColorTempLoc, tempMode);
      gl.uniform1i(uFireEffectStyleLoc, styleMode);
      gl.uniform1i(uViewModeLoc, preset.modeInt);
      gl.uniform4f(
        uViewCropLoc,
        preset.crop[0],
        preset.crop[1],
        preset.crop[2],
        preset.crop[3]
      );

      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // --- PASS 2: Draw GPU Batched Rising Sparks ---
      const activeSparkCount = Math.min(
        MAX_SPARKS,
        Math.max(0, Math.round(preset.sparks * Math.min(1.3, st.emberDensity)))
      );

      if (activeSparkCount > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(sparkProg);

        gl.uniform1f(uSparkTimeLoc, simTimeSec);
        gl.uniform1f(uSparkFireLoc, effectiveFire);
        gl.uniform1f(uSparkWindLoc, effectiveWind);
        gl.uniform1f(uSparkScaleLoc, preset.scale);
        gl.uniform1f(uSparkPeakLumLoc, peakLum);
        gl.uniform4f(
          uSparkViewCropLoc,
          preset.crop[0],
          preset.crop[1],
          preset.crop[2],
          preset.crop[3]
        );

        gl.bindVertexArray(sparkVao);
        gl.drawArrays(gl.POINTS, 0, activeSparkCount);
        gl.disable(gl.BLEND);
      }

      gl.bindVertexArray(null);
      scheduleNextFrame();
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      isContextLost = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (timerId) window.clearTimeout(timerId);
      rafId = 0;
      timerId = 0;
      setDiagnostics((prev) => ({
        ...prev,
        webglStatus: 'WebGL2 Context Lost (Restoring...)',
      }));
    };

    const handleContextRestored = () => {
      isContextLost = false;
      cleanupWebGLResources();
      if (initWebGLPipeline()) {
        lastFrameTs = 0;
        renderFrame(performance.now());
      }
    };

    const handleResize = () => {
      const preset = resolvePresetParams(
        settingsRef.current.fireplaceQuality,
        settingsRef.current.viewMode || 'wide'
      );
      syncCanvasDimensions(preset.scale);
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
    window.addEventListener('resize', handleResize);

    if (initWebGLPipeline()) {
      renderFrame(performance.now());
    }

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (timerId) window.clearTimeout(timerId);
      canvas.removeEventListener('webglcontextlost', handleContextLost, false);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored, false);
      window.removeEventListener('resize', handleResize);
      cleanupWebGLResources();
    };
  }, [gamepadAxesRef]);

  const tx = settings.burnInProtection ? orbitOffset.x * 0.35 : 0;
  const ty = settings.burnInProtection ? orbitOffset.y * 0.35 : 0;
  const orbitScale = settings.burnInProtection ? 1.02 : 1.0;

  return (
    <div
      onClick={onInteract || onCanvasInteract}
      className="fixed inset-0 z-0 overflow-hidden bg-black pointer-events-auto"
    >
      <canvas
        ref={canvasRef}
        data-testid="cinematic-fireplace-webgl2"
        data-view-mode={settings.viewMode || 'wide'}
        style={{
          transform:
            orbitScale !== 1.0 || tx !== 0 || ty !== 0
              ? `translate3d(${tx}px, ${ty}px, 0) scale(${orbitScale})`
              : undefined,
        }}
        className="block w-screen h-screen object-cover"
      />

      {settings.showDiagnostics && (
        <div
          data-testid="cinematic-fireplace-diagnostics"
          className="fixed bottom-32 left-8 z-30 px-4 py-3 rounded-xl border border-white/15 bg-black/75 text-xs font-mono tabular-nums text-stone-200 pointer-events-none space-y-1 shadow-2xl"
        >
          <div className="text-amber-400 font-semibold">
            Cinematic Fireplace Diagnostics
          </div>
          <div className="flex items-center gap-2">
            <span>FPS: {diagnostics.fps}</span>
            <span>·</span>
            <span>
              Res: {diagnostics.width}×{diagnostics.height} (
              {Math.round(diagnostics.scale * 100)}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>Sparks: {diagnostics.particleCount}</span>
            <span>·</span>
            <span>Preset: {diagnostics.activeQualityLabel}</span>
          </div>
          <div className="text-emerald-400">
            {diagnostics.webglStatus} · View: {diagnostics.viewModeLabel.toUpperCase()} · VFX:{' '}
            {settings.fireEffectStyle}
          </div>
        </div>
      )}
    </div>
  );
};

export const CinematicFireplaceWebGL = React.memo(CinematicFireplaceWebGLInner);
