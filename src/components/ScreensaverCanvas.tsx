import React, { useEffect, useRef, useState } from 'react';
import {
  APP_VERSION,
  CameraViewMode,
  QualityBudget,
  SceneId,
  ScreensaverSettings,
  resolveQualityBudget,
} from '../utils/screensaverLogic';
import { renderCanvasGameFireVfx } from '../utils/openSourceFireVfx';

import hearthPlateUrl from '../assets/images/scene_hearth_fireplace_1794237280004.jpg';
import rainPlateUrl from '../assets/images/scene_midnight_rain_window_1794237285665.jpg';
import auroraPlateUrl from '../assets/images/scene_aurora_fjord_1794237286746.jpg';
import cinematicPlateUrl from '../assets/images/fireplace_stone_plate_1794305469574.jpg';
import oceanPlateUrl from '../assets/images/scene_deep_ocean_reef_1794237287683.jpg';
import zenPlateUrl from '../assets/images/scene_kyoto_zen_pond_1794237293821.jpg';

interface ScreensaverCanvasProps {
  settings: ScreensaverSettings;
  hardwareTier: 'low' | 'mid' | 'high';
  isPaused: boolean;
  gamepadAxesRef: React.MutableRefObject<{ rx: number; ry: number }>;
  orbitOffset?: { x: number; y: number };
  onThunderFlash?: (intensity: number) => void;
  onCanvasInteract?: () => void;
}

const LOGICAL_W = 960;
const LOGICAL_H = 540;

const SCENE_PLATE_URLS: Record<SceneId, string> = {
  hearth: `${hearthPlateUrl}?v=${APP_VERSION}`,
  cinematic: `${cinematicPlateUrl}?v=${APP_VERSION}`,
  rain: `${rainPlateUrl}?v=${APP_VERSION}`,
  aurora: `${auroraPlateUrl}?v=${APP_VERSION}`,
  ocean: `${oceanPlateUrl}?v=${APP_VERSION}`,
  zen: `${zenPlateUrl}?v=${APP_VERSION}`,
};

// Zero-GC TypedArray pools tuned for 60 FPS lock on Smart TVs
const MAX_EMBERS = 120;
const EMBER_STRIDE = 10; // x, y, prevX, prevY, vx, vy, size, life, maxLife, phase

const MAX_FLAME_RIBBONS = 32;
const RIBBON_STRIDE = 8; // baseX, baseY, height, width, speed, phase, hueType, swayAmp

const MAX_RAIN = 180;
const RAIN_STRIDE = 6; // x, y, vx, vy, len, alpha

const MAX_DROPS = 55;
const DROP_STRIDE = 8; // x, y, vy, radiusX, radiusY, phase, trailLen, pauseTimer

const MAX_RIPPLES = 18;
const RIPPLE_STRIDE = 5; // x, y, radius, maxRadius, alpha

interface LightMaps {
  amberExposure: HTMLCanvasElement;
  coreDodger: HTMLCanvasElement;
  crimsonCoal: HTMLCanvasElement;
  smokeVeil: HTMLCanvasElement;
  cyanCaustic: HTMLCanvasElement;
  glassDroplet: HTMLCanvasElement;
  auroraCurtain: HTMLCanvasElement;
  oceanSunbeam: HTMLCanvasElement;
}

function makeLightMap(size: number, stops: [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const gCtx = c.getContext('2d');
  if (!gCtx) return c;
  const half = size * 0.5;
  const grad = gCtx.createRadialGradient(half, half, 0, half, half, half);
  for (let i = 0; i < stops.length; i++) {
    grad.addColorStop(stops[i][0], stops[i][1]);
  }
  gCtx.fillStyle = grad;
  gCtx.fillRect(0, 0, size, size);
  return c;
}

/**
 * Pre-bakes a refractive water droplet sprite once at init so rendering 55 glass droplets
 * uses fast GPU sprite blits instead of 55 per-frame `ctx.ellipse() + ctx.clip()` stencil passes.
 */
function makeDropletSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 44;
  const g = c.getContext('2d');
  if (!g) return c;

  g.save();
  g.beginPath();
  g.ellipse(16, 22, 12, 17, 0, 0, Math.PI * 2);
  const bodyGrad = g.createRadialGradient(12, 15, 2, 16, 22, 17);
  bodyGrad.addColorStop(0, 'rgba(224, 242, 254, 0.52)');
  bodyGrad.addColorStop(0.55, 'rgba(56, 189, 248, 0.18)');
  bodyGrad.addColorStop(0.88, 'rgba(15, 23, 42, 0.55)');
  bodyGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  g.fillStyle = bodyGrad;
  g.fill();

  g.strokeStyle = 'rgba(15, 23, 42, 0.6)';
  g.lineWidth = 1.4;
  g.stroke();

  // Crisp top-left specular glint
  g.fillStyle = 'rgba(255, 255, 255, 0.85)';
  g.beginPath();
  g.arc(12, 15, 3.2, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return c;
}

function makeAuroraCurtainSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 140;
  const g = c.getContext('2d');
  if (!g) return c;
  const grad = g.createLinearGradient(0, 0, 0, 140);
  grad.addColorStop(0, 'rgba(16, 185, 129, 0)');
  grad.addColorStop(0.5, 'rgba(52, 211, 153, 0.35)');
  grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 140);
  return c;
}

function makeOceanSunbeamSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 140;
  c.height = 480;
  const g = c.getContext('2d');
  if (!g) return c;
  const grad = g.createLinearGradient(0, 0, 0, 480);
  grad.addColorStop(0, 'rgba(186, 230, 253, 0.25)');
  grad.addColorStop(0.65, 'rgba(56, 189, 248, 0.11)');
  grad.addColorStop(1, 'rgba(14, 116, 144, 0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(54, 0);
  g.lineTo(86, 0);
  g.lineTo(138, 480);
  g.lineTo(2, 480);
  g.closePath();
  g.fill();
  return c;
}

function createLightMaps(): LightMaps {
  return {
    amberExposure: makeLightMap(192, [
      [0, 'rgba(255, 165, 75, 0.42)'],
      [0.35, 'rgba(234, 88, 12, 0.22)'],
      [0.7, 'rgba(154, 52, 18, 0.07)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    coreDodger: makeLightMap(96, [
      [0, 'rgba(255, 250, 220, 0.75)'],
      [0.32, 'rgba(251, 191, 36, 0.48)'],
      [0.68, 'rgba(234, 88, 12, 0.18)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    crimsonCoal: makeLightMap(96, [
      [0, 'rgba(251, 146, 60, 0.65)'],
      [0.45, 'rgba(220, 38, 38, 0.35)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    smokeVeil: makeLightMap(128, [
      [0, 'rgba(28, 25, 23, 0.22)'],
      [0.55, 'rgba(18, 16, 15, 0.10)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    cyanCaustic: makeLightMap(64, [
      [0, 'rgba(165, 243, 252, 0.65)'],
      [0.45, 'rgba(56, 189, 248, 0.28)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    glassDroplet: makeDropletSprite(),
    auroraCurtain: makeAuroraCurtainSprite(),
    oceanSunbeam: makeOceanSunbeamSprite(),
  };
}

export const ScreensaverCanvasInner: React.FC<ScreensaverCanvasProps> = ({
  settings,
  hardwareTier,
  isPaused,
  gamepadAxesRef,
  orbitOffset = { x: 0, y: 0 },
  onThunderFlash,
  onCanvasInteract,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef<ScreensaverSettings>(settings);
  const budgetRef = useRef<QualityBudget>(resolveQualityBudget(settings.qualityTier, hardwareTier));
  const isPausedRef = useRef<boolean>(isPaused);
  const onThunderRef = useRef(onThunderFlash);
  const [measuredFps, setMeasuredFps] = useState<number>(60);

  useEffect(() => {
    settingsRef.current = settings;
    budgetRef.current = resolveQualityBudget(settings.qualityTier, hardwareTier);
  }, [settings, hardwareTier]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    onThunderRef.current = onThunderFlash;
  }, [onThunderFlash]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) return;

    const lightMaps = createLightMaps();

    // Lazy-load only the active scene's plate into a 960x540 offscreen canvas
    const plateCanvases: Partial<Record<SceneId, HTMLCanvasElement>> = {};
    const loadingScenes = new Set<SceneId>();

    const ensurePlateLoaded = (sc: SceneId) => {
      if (plateCanvases[sc] || loadingScenes.has(sc)) return;
      loadingScenes.add(sc);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        img.onload = null;
        const off = document.createElement('canvas');
        off.width = LOGICAL_W;
        off.height = LOGICAL_H;
        const oCtx = off.getContext('2d', { alpha: false });
        if (oCtx) {
          oCtx.drawImage(img, 0, 0, LOGICAL_W, LOGICAL_H);
          plateCanvases[sc] = off;
        }
      };
      img.src = SCENE_PLATE_URLS[sc];
    };

    ensurePlateLoaded(settingsRef.current.scene);

    // Zero-GC TypedArray pools
    const embers = new Float32Array(MAX_EMBERS * EMBER_STRIDE);
    const ribbons = new Float32Array(MAX_FLAME_RIBBONS * RIBBON_STRIDE);
    const rain = new Float32Array(MAX_RAIN * RAIN_STRIDE);
    const drops = new Float32Array(MAX_DROPS * DROP_STRIDE);
    const ripples = new Float32Array(MAX_RIPPLES * RIPPLE_STRIDE);

    const getFireOrigin = (_scene: SceneId): { cx: number; cy: number; spreadX: number } => {
      return { cx: 634, cy: 356, spreadX: 92 };
    };

    const spawnEmber = (i: number, randomLife = false) => {
      const idx = i * EMBER_STRIDE;
      const st = settingsRef.current;
      const orig = getFireOrigin(st.scene);
      const x = orig.cx + (Math.random() - 0.5) * orig.spreadX * 1.5;
      const y = orig.cy + (Math.random() - 0.5) * 24;
      const maxLife = 1.2 + Math.random() * 2.4;

      embers[idx + 0] = x;
      embers[idx + 1] = randomLife ? y - Math.random() * 140 : y;
      embers[idx + 2] = x;
      embers[idx + 3] = embers[idx + 1];
      embers[idx + 4] = (Math.random() - 0.5) * 44;
      embers[idx + 5] = -(55 + Math.random() * 115) * (0.65 + st.fireIntensity * 0.45);
      embers[idx + 6] = 1.1 + Math.random() * 1.3;
      embers[idx + 7] = randomLife ? Math.random() * maxLife : 0;
      embers[idx + 8] = maxLife;
      embers[idx + 9] = Math.random() * Math.PI * 2;
    };

    const initFlameRibbons = (scene: SceneId) => {
      const orig = getFireOrigin(scene);
      for (let i = 0; i < MAX_FLAME_RIBBONS; i++) {
        const idx = i * RIBBON_STRIDE;
        const norm = (i / (MAX_FLAME_RIBBONS - 1)) * 2 - 1;
        const centerWeight = 1 - Math.abs(norm) * 0.75;
        ribbons[idx + 0] = orig.cx + norm * orig.spreadX * (0.75 + Math.random() * 0.25);
        ribbons[idx + 1] = orig.cy - 8 + (Math.random() - 0.5) * 18;
        ribbons[idx + 2] = (42 + Math.random() * 68) * centerWeight;
        ribbons[idx + 3] = (10 + Math.random() * 18) * centerWeight;
        ribbons[idx + 4] = 6.5 + Math.random() * 5.5;
        ribbons[idx + 5] = Math.random() * Math.PI * 2;
        ribbons[idx + 6] = centerWeight > 0.65 ? 0 : centerWeight > 0.35 ? 1 : 2;
        ribbons[idx + 7] = 6 + Math.random() * 12;
      }
    };

    const spawnRainStreak = (i: number, randomY = false) => {
      const idx = i * RAIN_STRIDE;
      const wind = settingsRef.current.windSpeed;
      rain[idx + 0] = Math.random() * (LOGICAL_W + 200) - 100;
      rain[idx + 1] = randomY ? Math.random() * LOGICAL_H : -30 - Math.random() * 50;
      rain[idx + 2] = 75 * wind + (Math.random() - 0.5) * 10;
      rain[idx + 3] = 560 + Math.random() * 340;
      rain[idx + 4] = 22 + Math.random() * 32;
      rain[idx + 5] = 0.08 + Math.random() * 0.18;
    };

    const spawnGlassDrop = (i: number, randomY = false) => {
      const idx = i * DROP_STRIDE;
      const minX = settingsRef.current.scene === 'rain' ? 238 : 40;
      const maxX = settingsRef.current.scene === 'rain' ? 912 : LOGICAL_W - 40;
      drops[idx + 0] = minX + Math.random() * (maxX - minX);
      drops[idx + 1] = randomY ? Math.random() * (LOGICAL_H - 40) : -12;
      drops[idx + 2] = 10 + Math.random() * 34;
      const r = 2.4 + Math.random() * 3.8;
      drops[idx + 3] = r;
      drops[idx + 4] = r * (1.25 + Math.random() * 0.45);
      drops[idx + 5] = Math.random() * Math.PI * 2;
      drops[idx + 6] = 18 + Math.random() * 42;
      drops[idx + 7] = Math.random() * 2.2;
    };

    const spawnRipple = (i: number, randomProgress = false) => {
      const idx = i * RIPPLE_STRIDE;
      ripples[idx + 0] = 290 + Math.random() * 560;
      ripples[idx + 1] = 270 + Math.random() * 230;
      const maxR = 24 + Math.random() * 48;
      ripples[idx + 2] = randomProgress ? Math.random() * maxR : 1;
      ripples[idx + 3] = maxR;
      ripples[idx + 4] = 0.35 + Math.random() * 0.35;
    };

    initFlameRibbons(settingsRef.current.scene);
    for (let i = 0; i < MAX_EMBERS; i++) spawnEmber(i, true);
    for (let i = 0; i < MAX_RAIN; i++) spawnRainStreak(i, true);
    for (let i = 0; i < MAX_DROPS; i++) spawnGlassDrop(i, true);
    for (let i = 0; i < MAX_RIPPLES; i++) spawnRipple(i, true);

    let lastScene: SceneId = settingsRef.current.scene;
    let lastTransformKey = '';
    let simTime = 0;
    let lightningFlash = 0;
    let adaptiveResScale = 0.85; // Fast 60 FPS lock scale on TV & PC

    const resolveCanvasCrop = (
      scene: SceneId,
      viewMode: CameraViewMode
    ): { x: number; y: number; w: number; h: number; resMult: number } => {
      if (scene === 'hearth') {
        if (viewMode === 'fit') {
          return { x: 112, y: 36, w: 832, h: 468, resMult: 0.94 };
        }
        if (viewMode === 'hearth') {
          return { x: 384, y: 110, w: 512, h: 288, resMult: 0.85 };
        }
        if (viewMode === 'logs') {
          return { x: 492, y: 222, w: 284, h: 160, resMult: 0.75 };
        }
        return { x: 0, y: 0, w: LOGICAL_W, h: LOGICAL_H, resMult: 1.0 };
      }

      if (viewMode === 'fit') return { x: 56, y: 32, w: 848, h: 477, resMult: 0.94 };
      if (viewMode === 'hearth') return { x: 144, y: 81, w: 672, h: 378, resMult: 0.86 };
      if (viewMode === 'logs') return { x: 240, y: 135, w: 480, h: 270, resMult: 0.76 };
      return { x: 0, y: 0, w: LOGICAL_W, h: LOGICAL_H, resMult: 1.0 };
    };

    const syncViewportAndCrop = (force = false) => {
      const st = settingsRef.current;
      const viewMode = st.viewMode || 'wide';
      const crop = resolveCanvasCrop(st.scene, viewMode);
      const scale = Math.min(1.0, budgetRef.current.resolutionScale * crop.resMult * adaptiveResScale);
      const targetW = Math.max(384, Math.round(LOGICAL_W * scale));
      const targetH = Math.max(216, Math.round(LOGICAL_H * scale));
      const key = `${st.scene}_${viewMode}_${targetW}_${targetH}`;
      if (!force && key === lastTransformKey) return;
      lastTransformKey = key;

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const sx = canvas.width / crop.w;
      const sy = canvas.height / crop.h;
      ctx.setTransform(sx, 0, 0, sy, -crop.x * sx, -crop.y * sy);
    };

    syncViewportAndCrop(true);
    const onResize = () => syncViewportAndCrop(true);
    window.addEventListener('resize', onResize);

    const updateSimulation = (dt: number) => {
      simTime = (simTime + dt) % 3600.0;
      const st = settingsRef.current;
      const budget = budgetRef.current;

      if (lastScene !== st.scene) {
        lastScene = st.scene;
        ensurePlateLoaded(st.scene);
        initFlameRibbons(st.scene);
        for (let i = 0; i < MAX_EMBERS; i++) spawnEmber(i, true);
      }

      const padWind = gamepadAxesRef.current.rx * 35;
      const effectiveWind = st.windSpeed * 45 + padWind;

      if (st.scene === 'hearth') {
        const eCount = Math.min(
          MAX_EMBERS,
          Math.floor(budget.maxEmberParticles * Math.min(1.2, st.emberDensity))
        );
        for (let i = 0; i < eCount; i++) {
          const idx = i * EMBER_STRIDE;
          embers[idx + 7] += dt;
          if (embers[idx + 7] >= embers[idx + 8] || embers[idx + 1] < 40) {
            spawnEmber(i, false);
            continue;
          }
          embers[idx + 2] = embers[idx + 0];
          embers[idx + 3] = embers[idx + 1];

          const curlX =
            Math.sin(simTime * 5.8 + embers[idx + 9]) * 38 +
            Math.cos(embers[idx + 1] * 0.045 + simTime * 3.2) * 24;
          embers[idx + 0] += (embers[idx + 4] + curlX + effectiveWind * 0.5) * dt;
          embers[idx + 1] += embers[idx + 5] * dt;
        }
      }

      if (st.scene === 'rain' || st.audioChannels.rainDownpour > 0.15) {
        const rCount = Math.min(MAX_RAIN, Math.floor(budget.maxRainDrops * st.rainIntensity));
        for (let i = 0; i < rCount; i++) {
          const idx = i * RAIN_STRIDE;
          rain[idx + 0] += (rain[idx + 2] + effectiveWind) * dt;
          rain[idx + 1] += rain[idx + 3] * dt;
          if (rain[idx + 1] > LOGICAL_H) {
            spawnRainStreak(i, false);
          }
        }

        if (st.glassDroplets) {
          const dCount = Math.min(MAX_DROPS, budget.maxGlassDrops);
          for (let i = 0; i < dCount; i++) {
            const idx = i * DROP_STRIDE;
            if (drops[idx + 7] > 0) {
              drops[idx + 7] -= dt;
            } else {
              const surge = 0.25 + 0.75 * Math.pow(Math.sin(simTime * 2.1 + drops[idx + 5]), 4);
              drops[idx + 1] += drops[idx + 2] * surge * dt * st.rainIntensity;
              drops[idx + 0] += Math.sin(simTime * 3.4 + drops[idx + 5]) * 5.2 * dt;
              if (Math.random() < 0.018) {
                drops[idx + 7] = 0.3 + Math.random() * 1.1;
              }
            }
            if (drops[idx + 1] > LOGICAL_H - 18) {
              spawnGlassDrop(i, false);
            }
          }
        }

        if (lightningFlash > 0) {
          lightningFlash = Math.max(0, lightningFlash - dt * 2.4);
        } else if (
          st.scene === 'rain' &&
          st.lightningFreq > 0.05 &&
          Math.random() < st.lightningFreq * 0.006
        ) {
          lightningFlash = 0.65 + Math.random() * 0.35;
          onThunderRef.current?.(lightningFlash);
        }
      }

      if (st.scene === 'zen' || st.scene === 'aurora') {
        for (let i = 0; i < MAX_RIPPLES; i++) {
          const idx = i * RIPPLE_STRIDE;
          ripples[idx + 2] += 14 * dt;
          if (ripples[idx + 2] >= ripples[idx + 3]) {
            spawnRipple(i, false);
          }
        }
      }
    };

    const renderPhotorealisticFire = (
      plate: HTMLCanvasElement,
      st: ScreensaverSettings,
      budget: QualityBudget
    ) => {
      const isHearth = st.scene === 'hearth';
      const orig = getFireOrigin(st.scene);
      const padFireBoost = Math.max(-0.35, -gamepadAxesRef.current.ry * 0.45);
      const firePower = Math.max(0.25, st.fireIntensity + padFireBoost);

      const flicker =
        (0.84 +
          0.09 * Math.sin(simTime * 9.4) +
          0.06 * Math.cos(simTime * 16.8) +
          0.04 * Math.sin(simTime * 27.3)) *
        firePower;

      // 1. Coarse 16px UV heat shimmer bands (12 fast blits instead of 108 2px slices)
      if (budget.enableHeatShimmer && st.viewMode !== 'logs') {
        const zoneX = 495;
        const zoneW = 275;
        const zoneTop = 180;
        const zoneBot = 388;
        const stripH = 16;

        for (let y = zoneTop; y < zoneBot; y += stripH) {
          const vNorm = (y - zoneTop) / (zoneBot - zoneTop);
          const envelope = Math.sin(vNorm * Math.PI);
          const waveX =
            Math.sin(y * 0.075 - simTime * 11.5) * envelope * 3.2 * firePower * st.flameHeight;
          ctx.drawImage(plate, zoneX, y, zoneW, stripH, zoneX + waveX, y, zoneW, stripH);
        }
      }

      // 2. Dynamic Room Illumination & Incandescent Coal Bed
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const viewMode = st.viewMode || 'wide';

      if (viewMode !== 'logs') {
        const roomLightR = 380 * (0.85 + flicker * 0.25);
        ctx.globalAlpha = Math.min(0.85, 0.36 * flicker * st.coalGlow);
        ctx.drawImage(
          lightMaps.amberExposure,
          orig.cx - roomLightR,
          orig.cy - roomLightR * 0.68,
          roomLightR * 2,
          roomLightR * 1.35
        );
      }

      if (isHearth && (viewMode === 'wide' || viewMode === 'fit')) {
        const candleFlicker = 0.7 + 0.3 * Math.sin(simTime * 13.5 + Math.cos(simTime * 6.2));
        ctx.globalAlpha = 0.35 * candleFlicker;
        ctx.drawImage(lightMaps.coreDodger, 608 - 42, 38 - 42, 84, 84);
      }

      const coalPulse = (0.78 + 0.22 * Math.sin(simTime * 5.2)) * st.coalGlow;
      ctx.globalAlpha = Math.min(0.9, 0.55 * coalPulse);
      const coalW = 145;
      ctx.drawImage(lightMaps.crimsonCoal, orig.cx - coalW, orig.cy - 18, coalW * 2, 84);

      // 3. Open-Source & Game-Engine Fire Visual Effects
      renderCanvasGameFireVfx(
        ctx,
        simTime,
        orig.cx,
        orig.cy,
        orig.spreadX,
        firePower,
        st.flameHeight,
        st.coalGlow,
        st.windSpeed + gamepadAxesRef.current.rx * 0.4,
        st.fireEffectStyle || 'game_flipbook'
      );

      // 4. Turbulent Light-Field Nodes
      ctx.globalCompositeOperation = 'lighter';
      const nodeCount = 7;
      const windTilt = (st.windSpeed * 22 + gamepadAxesRef.current.rx * 20) * 0.35;
      const flameCenterY = 286;

      for (let i = 0; i < nodeCount; i++) {
        const idx = i * RIBBON_STRIDE;
        const normX = (i / (nodeCount - 1)) * 2 - 1;
        const pulse =
          0.5 +
          0.5 *
            Math.sin(simTime * ribbons[idx + 4] + ribbons[idx + 5]) *
            Math.cos(simTime * 3.7 + i);
        const rise = (simTime * 0.85 + i * 0.19) % 1;
        const nx =
          orig.cx +
          normX * (orig.spreadX * 0.65) * (1 - rise * 0.45) +
          Math.sin(simTime * 6.5 + i * 1.3) * 10 +
          windTilt * rise;
        const ny = flameCenterY + 32 - rise * 85 * st.flameHeight;
        const radius = (26 + (1 - Math.abs(normX)) * 34) * (1 - rise * 0.45) * firePower;

        ctx.globalAlpha = Math.min(0.45, (1 - rise) * pulse * 0.28 * firePower);
        ctx.drawImage(
          i % 2 === 0 ? lightMaps.coreDodger : lightMaps.crimsonCoal,
          nx - radius,
          ny - radius,
          radius * 2,
          radius * 2
        );
      }

      // 5. Batched Motion-Blurred Micro-Embers (3 batched stroke calls instead of 180 per-ember strokes!)
      const eCount = Math.min(
        MAX_EMBERS,
        Math.floor(budget.maxEmberParticles * Math.min(1.2, st.emberDensity))
      );
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.85;

      const colorBands: [number, number, string][] = [
        [0.0, 0.3, '#fffbeb'],
        [0.3, 0.68, '#fb923c'],
        [0.68, 1.0, '#dc2626'],
      ];

      for (let b = 0; b < 3; b++) {
        const minP = colorBands[b][0];
        const maxP = colorBands[b][1];
        ctx.strokeStyle = colorBands[b][2];
        ctx.beginPath();
        for (let i = 0; i < eCount; i++) {
          const idx = i * EMBER_STRIDE;
          const p = embers[idx + 7] / embers[idx + 8];
          if (p < minP || p >= maxP) continue;
          ctx.moveTo(embers[idx + 2], embers[idx + 3]);
          ctx.lineTo(embers[idx + 0], embers[idx + 1]);
        }
        ctx.stroke();
      }

      ctx.restore();

      // 6. Subtle rising woodsmoke veil
      if (st.smokeAmount > 0.05 && viewMode !== 'logs') {
        ctx.save();
        const smokePuffs = 4;
        for (let s = 0; s < smokePuffs; s++) {
          const cycle = (simTime * 0.22 + s / smokePuffs) % 1;
          const sx =
            orig.cx +
            Math.sin(simTime * 0.8 + s * 1.7) * (25 + cycle * 45) +
            windTilt * cycle * 1.4;
          const sy = orig.cy - 65 - cycle * 195;
          const sr = 48 + cycle * 75;
          ctx.globalAlpha = Math.sin(cycle * Math.PI) * 0.26 * st.smokeAmount;
          ctx.drawImage(lightMaps.smokeVeil, sx - sr, sy - sr, sr * 2, sr * 2);
        }
        ctx.restore();
      }
    };

    const renderPhotorealisticRain = (
      _plate: HTMLCanvasElement,
      st: ScreensaverSettings,
      budget: QualityBudget
    ) => {
      // 1. Sheet lightning flash
      if (lightningFlash > 0.01 && st.scene === 'rain') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(186, 230, 253, ${(lightningFlash * 0.38).toFixed(3)})`;
        ctx.fillRect(225, 0, 710, 280);
        ctx.restore();
      }

      // 2. Batched high-velocity exterior rain streaks (1 stroke call)
      const rCount = Math.min(MAX_RAIN, Math.floor(budget.maxRainDrops * st.rainIntensity));
      const windDx = st.windSpeed * 18;
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.16)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (let i = 0; i < rCount; i++) {
        const idx = i * RAIN_STRIDE;
        const rx = rain[idx + 0];
        const ry = rain[idx + 1];
        const len = rain[idx + 4];
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + windDx, ry + len);
      }
      ctx.stroke();

      // 3. Hardware-Accelerated Pre-Baked Glass Droplet Sprites + Batched Rivulet Trails (zero ctx.clip!)
      if (st.glassDroplets) {
        const dCount = Math.min(MAX_DROPS, budget.maxGlassDrops);

        // Single batched stroke for all wet rivulet trails
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let i = 0; i < dCount; i++) {
          const idx = i * DROP_STRIDE;
          const dx = drops[idx + 0];
          const dy = drops[idx + 1];
          const ry = drops[idx + 4];
          const trail = drops[idx + 6];
          ctx.moveTo(dx, dy - trail);
          ctx.lineTo(dx, dy - ry);
        }
        ctx.stroke();

        // Fast sprite blit for each droplet
        for (let i = 0; i < dCount; i++) {
          const idx = i * DROP_STRIDE;
          const dx = drops[idx + 0];
          const dy = drops[idx + 1];
          const rx = drops[idx + 3];
          const ry = drops[idx + 4];
          ctx.drawImage(lightMaps.glassDroplet, dx - rx, dy - ry, rx * 2, ry * 2);
        }
      }

      ctx.restore();
    };

    const renderPhotorealisticAurora = (plate: HTMLCanvasElement, st: ScreensaverSettings) => {
      // 1. Coarse 12px water-wave refraction bands (21 fast blits instead of 129)
      const waterTop = 282;
      for (let y = waterTop; y < LOGICAL_H; y += 12) {
        const depthNorm = (y - waterTop) / (LOGICAL_H - waterTop);
        const phase = y * 0.22 - simTime * 3.8;
        const dx = Math.sin(phase) * Math.cos(y * 0.07 + simTime * 1.9) * (1.2 + depthNorm * 3.2);
        ctx.drawImage(plate, 0, y, LOGICAL_W, 12, dx, y, LOGICAL_W, 12);
      }

      // 2. Pre-baked aurora curtain blits (zero per-frame createLinearGradient)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let x = 80; x < LOGICAL_W - 80; x += 36) {
        const wave =
          Math.sin(x * 0.008 + simTime * 0.55) * 0.5 +
          Math.cos(x * 0.015 - simTime * 0.38) * 0.5;
        if (wave <= 0) continue;
        ctx.globalAlpha = Math.min(0.45, wave * 0.22 * st.fireIntensity);
        const skyY = 85 + Math.sin(x * 0.006 + simTime * 0.4) * 35;
        ctx.drawImage(lightMaps.auroraCurtain, x, skyY - 55, 38, 140);
      }
      ctx.restore();
    };

    const renderPhotorealisticOcean = (
      plate: HTMLCanvasElement,
      st: ScreensaverSettings,
      budget: QualityBudget
    ) => {
      // 1. Coarse 18px underwater wave refraction bands (30 blits instead of 180)
      if (budget.enableHeatShimmer) {
        for (let y = 0; y < LOGICAL_H; y += 18) {
          const dx = Math.sin(y * 0.045 - simTime * 2.1) * 1.6;
          ctx.drawImage(plate, 0, y, LOGICAL_W, 18, dx, y, LOGICAL_W, 18);
        }
      }

      // 2. Pre-baked volumetric sunbeam sprites (zero per-frame gradient allocation)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let r = -3; r <= 3; r++) {
        const angle = r * 0.12 + Math.sin(simTime * 0.55 + r * 1.4) * 0.025;
        const rayAlpha = (0.16 + 0.1 * Math.sin(simTime * 1.1 + r * 2.1)) * st.fireIntensity;
        ctx.save();
        ctx.translate(518, -10);
        ctx.rotate(angle);
        ctx.globalAlpha = Math.min(0.5, rayAlpha);
        ctx.drawImage(lightMaps.oceanSunbeam, -70, 0, 140, 480);
        ctx.restore();
      }

      // 3. Drifting bioluminescent marine snow
      const count = Math.min(55, Math.floor(budget.maxEmberParticles * st.emberDensity));
      for (let i = 0; i < count; i++) {
        const idx = i * EMBER_STRIDE;
        const bx = (embers[idx + 0] * 1.4 + Math.sin(simTime * 0.8 + i) * 18 + LOGICAL_W) % LOGICAL_W;
        const by = (embers[idx + 1] * 1.3 - simTime * 14 + LOGICAL_H * 100) % LOGICAL_H;
        const pulse = 0.35 + 0.65 * Math.sin(simTime * 2.4 + embers[idx + 9]);
        ctx.globalAlpha = pulse * 0.55;
        ctx.drawImage(lightMaps.cyanCaustic, bx - 5, by - 5, 10, 10);
      }
      ctx.restore();
    };

    const renderPhotorealisticZen = (plate: HTMLCanvasElement, st: ScreensaverSettings) => {
      // 1. Coarse 12px pond water reflection bands (25 blits instead of 151)
      for (let y = 238; y < LOGICAL_H; y += 12) {
        const depth = (y - 238) / (LOGICAL_H - 238);
        const dx = Math.sin(y * 0.25 - simTime * 4.2) * (0.9 + depth * 2.4);
        ctx.drawImage(plate, 260, y, 640, 12, 260 + dx, y, 640, 12);
      }

      // 2. Concentric water surface rings (batched single stroke)
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.16)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const idx = i * RIPPLE_STRIDE;
        const p = ripples[idx + 2] / ripples[idx + 3];
        if (p >= 0.95) continue;
        const rx = ripples[idx + 2];
        const ry = rx * 0.32;
        ctx.moveTo(ripples[idx + 0] + rx, ripples[idx + 1]);
        ctx.ellipse(ripples[idx + 0], ripples[idx + 1], rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.stroke();

      // 3. Warm candle flicker inside stone toro lantern
      ctx.globalCompositeOperation = 'screen';
      const lanternFlicker =
        (0.75 + 0.18 * Math.sin(simTime * 11.2) + 0.07 * Math.cos(simTime * 19.4)) *
        st.fireIntensity;
      ctx.globalAlpha = Math.min(0.85, 0.48 * lanternFlicker);
      ctx.drawImage(lightMaps.coreDodger, 268 - 56, 220 - 56, 112, 112);
      ctx.globalAlpha = Math.min(0.65, 0.28 * lanternFlicker);
      ctx.drawImage(lightMaps.amberExposure, 292 - 64, 435 - 42, 128, 84);
      ctx.restore();
    };

    const drawFrame = () => {
      const st = settingsRef.current;
      const budget = budgetRef.current;
      ensurePlateLoaded(st.scene);
      syncViewportAndCrop(false);
      const plate = plateCanvases[st.scene];

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      if (!plate) {
        ctx.fillStyle = '#080605';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        return;
      }

      // 1. Blit Base Plate
      ctx.drawImage(plate, 0, 0, LOGICAL_W, LOGICAL_H);

      // 2. Apply Scene Passes
      if (st.scene === 'hearth') {
        renderPhotorealisticFire(plate, st, budget);
        if (
          st.audioChannels.rainDownpour > 0.18 &&
          (st.viewMode === 'wide' || st.viewMode === 'fit')
        ) {
          renderPhotorealisticRain(plate, st, budget);
        }
      } else if (st.scene === 'rain') {
        renderPhotorealisticRain(plate, st, budget);
      } else if (st.scene === 'aurora') {
        renderPhotorealisticAurora(plate, st);
      } else if (st.scene === 'ocean') {
        renderPhotorealisticOcean(plate, st, budget);
      } else if (st.scene === 'zen') {
        renderPhotorealisticZen(plate, st);
      }

      // 3. Color Temperature & Peak Luminance
      if (st.colorTemp !== 'natural') {
        ctx.fillStyle =
          st.colorTemp === 'warm2700k'
            ? 'rgba(251, 146, 60, 0.08)'
            : st.colorTemp === 'candle2000k'
            ? 'rgba(234, 88, 12, 0.15)'
            : 'rgba(15, 23, 42, 0.32)';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }

      if (st.peakLuminance < 100) {
        const dimAlpha = Math.max(0, Math.min(0.65, (100 - st.peakLuminance) / 100));
        ctx.fillStyle = `rgba(0, 0, 0, ${dimAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }
    };

    let rafId = 0;
    let lastTs = 0;
    let disposed = false;
    let frameCounter = 0;
    let fpsAccumMs = 0;

    // Pure native 60Hz VSync requestAnimationFrame loop (zero setTimeout throttling!)
    const frame = (ts: number) => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(frame);

      if (isPausedRef.current) {
        lastTs = ts;
        return;
      }
      if (!lastTs) lastTs = ts;
      const deltaMs = Math.min(50, Math.max(1, ts - lastTs));
      lastTs = ts;

      frameCounter++;
      fpsAccumMs += deltaMs;
      if (frameCounter >= 45) {
        const fps = Math.min(60, Math.max(1, Math.round((frameCounter * 1000) / Math.max(1, fpsAccumMs))));
        frameCounter = 0;
        fpsAccumMs = 0;
        if (fps < 55 && adaptiveResScale > 0.55) {
          adaptiveResScale = Math.max(0.55, Math.round((adaptiveResScale - 0.1) * 100) / 100);
          syncViewportAndCrop(true);
        }
        if (settingsRef.current.showDiagnostics) {
          setMeasuredFps(fps);
        }
      }

      updateSimulation(deltaMs * 0.001);
      drawFrame();
    };

    updateSimulation(1 / 60);
    drawFrame();
    rafId = window.requestAnimationFrame(frame);

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, [gamepadAxesRef]);

  const tx = settings.burnInProtection ? orbitOffset.x * 0.35 : 0;
  const ty = settings.burnInProtection ? orbitOffset.y * 0.35 : 0;
  const orbitScale = settings.burnInProtection ? 1.02 : 1.0;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        data-testid="screensaver-canvas"
        data-view-mode={settings.viewMode || 'wide'}
        onClick={onCanvasInteract}
        style={{
          transform:
            orbitScale !== 1.0 || tx !== 0 || ty !== 0
              ? `translate3d(${tx}px, ${ty}px, 0) scale(${orbitScale})`
              : undefined,
        }}
        className="block w-screen h-screen cursor-pointer"
      />
      {settings.showDiagnostics && (
        <div
          data-testid="canvas-diagnostics"
          className="fixed bottom-32 left-8 z-30 px-4 py-2.5 rounded-xl border border-white/15 bg-black/75 text-xs font-mono tabular-nums text-emerald-400 pointer-events-none shadow-2xl"
        >
          FPS: {measuredFps} · Scene: {settings.scene.toUpperCase()} · View:{' '}
          {(settings.viewMode || 'wide').toUpperCase()}
        </div>
      )}
    </div>
  );
};

export const ScreensaverCanvas = React.memo(ScreensaverCanvasInner);
