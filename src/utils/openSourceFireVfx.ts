export type FireEffectStyle =
  | 'game_flipbook'
  | 'volumetric_shader'
  | 'fluid_ribbons'
  | 'roaring_bonfire';

export interface FireEffectStyleMeta {
  id: FireEffectStyle;
  name: string;
  badge: string;
  openSourceEngine: string;
  description: string;
}

export const FIRE_EFFECT_STYLES: FireEffectStyleMeta[] = [
  {
    id: 'game_flipbook',
    name: 'Game Engine 64-Frame Flipbook VFX',
    badge: 'Game Flipbook VFX',
    openSourceEngine: 'MIT/CC0 8×8 Sub-UV Flipbook Billboards + Additive HDR Bloom',
    description:
      'Multi-emitter 64-frame Sub-UV fire sprite billboards anchored along log crevices with detaching flame tips and HDR bloom, just like Unreal & Unity particle systems.',
  },
  {
    id: 'volumetric_shader',
    name: 'Open-Source 3D Worley-Curl Shader',
    badge: '3D Volumetric Shader',
    openSourceEngine: 'MIT WebGL Volumetric Fire (Simplex Curl + Worley Cellular Erosion)',
    description:
      'Rising Worley cellular bubbles carve crisp, curling, detaching flame tongues out of a Planckian blackbody thermal core.',
  },
  {
    id: 'fluid_ribbons',
    name: 'Curl-Vortex Fluid Flame Tongues',
    badge: 'Curl-Vortex Fluid',
    openSourceEngine: 'CC0 Divergence-Free Curl-Noise Bezier Flame Ribbons',
    description:
      'Articulated Bezier flame tongues driven by curl-noise velocity fields that whip, split, and merge with incandescent white-gold cores.',
  },
  {
    id: 'roaring_bonfire',
    name: 'Roaring Hybrid Game VFX Overdrive',
    badge: 'Roaring Hybrid VFX',
    openSourceEngine: 'Combined Sub-UV Flipbook + Volumetric Shader + Vortex Sparks',
    description:
      'Combines 64-frame game flipbook billboards, Worley-eroded volumetric tongues, and dense swirling ember showers for maximum visual impact.',
  },
];

let cachedFlipbookAtlas: HTMLCanvasElement | null = null;

function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm3(x: number, y: number): number {
  let v = 0;
  let amp = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < 3; i++) {
    v += amp * valueNoise(px, py);
    const nx = px * 1.62 - py * 1.21 + 11.3;
    const ny = px * 1.21 + py * 1.62 + 23.7;
    px = nx;
    py = ny;
    amp *= 0.5;
  }
  return v;
}

/**
 * Generates and caches a 512x512 (8x8 = 64 frames, 64x64 per frame) seamless looping
 * Game Engine Sub-UV Fire Flipbook Sprite Atlas with multi-tongue forked flame geometry,
 * Worley-like cellular erosion, and Planckian blackbody color grading.
 */
export function getOrCreateFireFlipbookAtlas(): HTMLCanvasElement {
  if (cachedFlipbookAtlas) return cachedFlipbookAtlas;

  const atlasSize = 512;
  const grid = 8;
  const tileSize = atlasSize / grid; // 64
  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cachedFlipbookAtlas = canvas;
    return canvas;
  }

  const imgData = ctx.createImageData(atlasSize, atlasSize);
  const data = imgData.data;

  for (let frame = 0; frame < 64; frame++) {
    const col = frame % grid;
    const row = Math.floor(frame / grid);
    const ox = col * tileSize;
    const oy = row * tileSize;
    const phase = (frame / 64) * Math.PI * 2;
    const cosP = Math.cos(phase);
    const sinP = Math.sin(phase);

    for (let py = 0; py < tileSize; py++) {
      // ny: 0 at bottom of flame tile, 1 at top tip
      const ny = 1.0 - py / (tileSize - 1);
      // Soft feather at the bottom & top so sprite never has a hard oval bottom edge
      const verticalEnv = Math.pow(Math.sin(ny * Math.PI), 1.35) * (1.0 - Math.pow(ny, 2.6) * 0.45);
      if (verticalEnv <= 0.01) continue;

      for (let px = 0; px < tileSize; px++) {
        const nx = (px / (tileSize - 1)) * 2.0 - 1.0;

        // Multi-forked S-curve whip so each tile contains 3 twisting flame tongues instead of a single oval
        const swayMain =
          Math.sin(ny * 4.8 - phase * 2.0) * 0.24 * Math.pow(ny, 1.1) +
          Math.cos(ny * 8.2 + phase) * 0.10 * ny;
        const localX = nx - swayMain;

        const widthEnv = Math.max(0.08, (1.0 - ny * 0.68) * Math.sin(Math.min(1, ny * 1.2) * Math.PI * 0.85 + 0.15));
        const radialDist = Math.abs(localX) / widthEnv;
        if (radialDist > 1.25) continue;

        // Fork modulation into 3 distinct flame licks across X
        const forkComb =
          0.62 +
          0.38 * Math.cos(localX * 7.5 + Math.sin(ny * 5.0 - phase) * 1.4) +
          0.25 * Math.sin(localX * 13.0 + phase * 2.0);

        const advX = localX * 3.8 + cosP * 0.9;
        const advY = ny * 5.2 - (frame / 64) * 5.2 + sinP * 0.5;
        const advYWrap = ny * 5.2 - ((frame / 64 + 0.5) % 1) * 5.2;
        const blend = 0.5 - 0.5 * Math.cos((frame / 64) * Math.PI * 2);

        const n1 = fbm3(advX, advY);
        const n2 = fbm3(advX + 7.4, advYWrap + 3.1);
        const turb = n1 * (1 - blend) + n2 * blend;

        // High-contrast cellular erosion carves sharp concave flame tongues
        const erosion = fbm3(localX * 6.4 - sinP * 1.2, ny * 7.2 - cosP * 1.4);
        const coreShape = Math.pow(Math.max(0, 1.0 - radialDist * radialDist), 1.45);

        let heat =
          coreShape * verticalEnv * forkComb * (0.45 + 0.95 * Math.pow(turb, 1.35)) -
          Math.pow(ny, 1.15) * Math.pow(erosion, 1.25) * 0.62;
        heat = Math.max(0, Math.min(1.25, heat * 1.75));

        if (heat <= 0.03) continue;

        // Planckian blackbody color ramp (deep crimson -> rich orange -> gold -> white-hot core)
        let r = 0;
        let g = 0;
        let b = 0;
        if (heat < 0.35) {
          const t = heat / 0.35;
          r = Math.round(220 * t);
          g = Math.round(32 * t * t);
          b = Math.round(4 * t);
        } else if (heat < 0.72) {
          const t = (heat - 0.35) / 0.37;
          r = Math.round(220 + 35 * t);
          g = Math.round(32 + 152 * t);
          b = Math.round(4 + 28 * t);
        } else {
          const t = Math.min(1, (heat - 0.72) / 0.45);
          r = 255;
          g = Math.round(184 + 68 * t);
          b = Math.round(32 + 190 * t * t);
        }

        // Premultiply RGB by alpha and keep alpha soft so additive ('lighter') blending never shows sprite bounds
        const alphaNorm = Math.pow(Math.min(1, heat * 0.95), 1.35);
        const alpha = Math.min(255, Math.round(alphaNorm * 255));
        const idx = ((oy + py) * atlasSize + (ox + px)) * 4;
        data[idx + 0] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = alpha;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  cachedFlipbookAtlas = canvas;
  return canvas;
}

/**
 * Renders Open-Source & Game-Engine Fire Visual Effects onto a 2D Canvas for the Home Fireplace ('hearth') scene.
 * Uses hardware-accelerated additive ('lighter') blending and anchors emitters directly inside the log crevices
 * so flames dance naturally out of the burning wood without oval artifacts.
 */
export function renderCanvasGameFireVfx(
  ctx: CanvasRenderingContext2D,
  simTime: number,
  cx: number,
  cy: number,
  spreadX: number,
  fireIntensity: number,
  flameHeight: number,
  coalGlow: number,
  windSpeed: number,
  style: FireEffectStyle
): void {
  const atlas = getOrCreateFireFlipbookAtlas();
  const tileSize = atlas.width / 8;
  const hScale = Math.max(0.4, Math.min(1.5, flameHeight));
  const fPower = Math.max(0.25, Math.min(1.6, fireIntensity));
  const windTilt = (windSpeed - 0.35) * 28;

  // Anchor slightly higher inside the actual burning log crevices of the hearth plate (behind the iron grate)
  const logBedY = cy - 22;
  const logSpreadX = spreadX * 0.78;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 1. Game Flipbook Sub-UV Billboards
  if (style === 'game_flipbook' || style === 'roaring_bonfire' || style === 'volumetric_shader') {
    const emitterCount = style === 'roaring_bonfire' ? 14 : style === 'game_flipbook' ? 11 : 8;
    const fps = style === 'roaring_bonfire' ? 28 : 24;

    for (let i = 0; i < emitterCount; i++) {
      const normX = (i / (emitterCount - 1)) * 2 - 1; // -1..1 across log crevices
      const bell = Math.max(0.25, Math.cos(normX * Math.PI * 0.48));
      const seed = i * 13.37 + Math.sin(i * 7.1) * 5.0;

      const rate = 0.75 + (i % 4) * 0.16;
      const life = (simTime * rate + seed) % 1;
      const frameIdx = Math.floor(((simTime * fps + i * 9.3) % 64 + 64) % 64);
      const sx = (frameIdx % 8) * tileSize;
      const sy = Math.floor(frameIdx / 8) * tileSize;

      const emitterX =
        cx +
        normX * logSpreadX +
        Math.sin(simTime * 3.6 + seed) * 7 +
        windTilt * Math.pow(life, 1.2);
      const emitterY =
        logBedY -
        Math.abs(normX) * 8 -
        life * (48 + bell * 46) * hScale;

      const spriteW = (46 + bell * 44) * (1.0 - life * 0.28) * Math.sqrt(fPower);
      const spriteH = (74 + bell * 72) * (0.85 + Math.sin(life * Math.PI) * 0.35) * hScale;

      const alphaEnvelope = Math.sin(Math.pow(life, 0.7) * Math.PI);
      ctx.globalAlpha = Math.min(
        0.52,
        alphaEnvelope * (style === 'roaring_bonfire' ? 0.42 : 0.34) * Math.min(1.25, fPower) * bell
      );

      ctx.drawImage(
        atlas,
        sx,
        sy,
        tileSize,
        tileSize,
        emitterX - spriteW * 0.5,
        emitterY - spriteH * 0.65,
        spriteW,
        spriteH
      );
    }
  }

  // 2. Articulated Curl-Vortex Bezier Flame Tongues (wispy licking tongues)
  if (style === 'fluid_ribbons' || style === 'roaring_bonfire' || style === 'volumetric_shader') {
    const ribbonCount = style === 'fluid_ribbons' ? 16 : 10;

    for (let i = 0; i < ribbonCount; i++) {
      const u = (i / (ribbonCount - 1)) * 2 - 1;
      const arch = Math.max(0.2, Math.cos(u * Math.PI * 0.48));
      const phase = simTime * (5.4 + (i % 4) * 1.1) + i * 2.39;

      const baseX = cx + u * logSpreadX * 0.92 + Math.sin(phase * 0.5) * 5;
      const baseY = logBedY + 6 + Math.cos(i * 3.1) * 5;
      const tongueH = (52 + arch * 74 + Math.sin(phase * 0.7) * 16) * hScale * Math.min(1.25, fPower);
      const baseW = (8 + arch * 12) * Math.min(1.2, fPower);

      const midSway = Math.sin(phase) * (10 + arch * 9) + windTilt * 0.45;
      const tipSway = Math.cos(phase * 1.15 - 0.8) * (18 + arch * 12) + windTilt * 0.95;

      const tipX = baseX + tipSway;
      const tipY = baseY - tongueH;

      ctx.globalAlpha = (style === 'fluid_ribbons' ? 0.32 : 0.22) * arch * Math.min(1.2, fPower);
      ctx.fillStyle = i % 3 === 0 ? '#fde68a' : i % 2 === 0 ? '#fb923c' : '#ea580c';

      ctx.beginPath();
      ctx.moveTo(baseX - baseW, baseY);
      ctx.quadraticCurveTo(
        baseX - baseW * 0.35 + midSway,
        baseY - tongueH * 0.52,
        tipX,
        tipY
      );
      ctx.quadraticCurveTo(
        baseX + baseW * 0.35 + midSway * 0.85,
        baseY - tongueH * 0.48,
        baseX + baseW,
        baseY
      );
      ctx.closePath();
      ctx.fill();
    }
  }

  // 3. Incandescent Coal Bed Crevice Pulses (zero per-frame gradient allocation)
  const coalClusters = 10;
  for (let c = 0; c < coalClusters; c++) {
    const u = (c / (coalClusters - 1)) * 2 - 1;
    const pulse = 0.5 + 0.5 * Math.sin(simTime * (3.4 + (c % 4) * 0.8) + c * 1.9);
    const coalX = cx + u * logSpreadX * 0.85 + Math.cos(c * 4.3) * 6;
    const coalY = cy + 8 + Math.sin(c * 2.7) * 6;
    const r = (8 + (c % 3) * 4) * coalGlow * pulse;

    ctx.globalAlpha = Math.min(0.38, 0.22 * coalGlow * pulse);
    ctx.fillStyle = c % 2 === 0 ? '#fdba74' : '#f97316';
    ctx.beginPath();
    ctx.arc(coalX, coalY, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
