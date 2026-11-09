import React, { useEffect, useRef } from 'react';
import {
  QualityBudget,
  SceneId,
  ScreensaverSettings,
  resolveQualityBudget,
} from '../utils/screensaverLogic';

import hearthPlateUrl from '../assets/images/scene_hearth_fireplace_1794237280004.jpg';
import campfirePlateUrl from '../assets/images/scene_wilderness_campfire_1794237282609.jpg';
import rainPlateUrl from '../assets/images/scene_midnight_rain_window_1794237285665.jpg';
import auroraPlateUrl from '../assets/images/scene_aurora_fjord_1794237286746.jpg';
import oceanPlateUrl from '../assets/images/scene_deep_ocean_reef_1794237287683.jpg';
import zenPlateUrl from '../assets/images/scene_kyoto_zen_pond_1794237293821.jpg';

interface ScreensaverCanvasProps {
  settings: ScreensaverSettings;
  hardwareTier: 'low' | 'mid' | 'high';
  isPaused: boolean;
  gamepadAxesRef: React.MutableRefObject<{ rx: number; ry: number }>;
  onThunderFlash?: (intensity: number) => void;
  onCanvasInteract?: () => void;
}

const LOGICAL_W = 960;
const LOGICAL_H = 540;

const SCENE_PLATE_URLS: Record<SceneId, string> = {
  hearth: hearthPlateUrl,
  campfire: campfirePlateUrl,
  rain: rainPlateUrl,
  aurora: auroraPlateUrl,
  ocean: oceanPlateUrl,
  zen: zenPlateUrl,
};

// Zero-GC TypedArray pools
const MAX_EMBERS = 180;
const EMBER_STRIDE = 10; // x, y, prevX, prevY, vx, vy, size, life, maxLife, phase

const MAX_FLAME_RIBBONS = 45;
const RIBBON_STRIDE = 8; // baseX, baseY, height, width, speed, phase, hueType, swayAmp

const MAX_RAIN = 280;
const RAIN_STRIDE = 6; // x, y, vx, vy, len, alpha

const MAX_DROPS = 95;
const DROP_STRIDE = 8; // x, y, vy, radiusX, radiusY, phase, trailLen, pauseTimer

const MAX_RIPPLES = 24;
const RIPPLE_STRIDE = 5; // x, y, radius, maxRadius, alpha

interface LightMaps {
  amberExposure: HTMLCanvasElement;
  coreDodger: HTMLCanvasElement;
  crimsonCoal: HTMLCanvasElement;
  smokeVeil: HTMLCanvasElement;
  cyanCaustic: HTMLCanvasElement;
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

function createLightMaps(): LightMaps {
  return {
    amberExposure: makeLightMap(256, [
      [0, 'rgba(255, 165, 75, 0.42)'],
      [0.35, 'rgba(234, 88, 12, 0.22)'],
      [0.7, 'rgba(154, 52, 18, 0.07)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    coreDodger: makeLightMap(128, [
      [0, 'rgba(255, 250, 220, 0.75)'],
      [0.32, 'rgba(251, 191, 36, 0.48)'],
      [0.68, 'rgba(234, 88, 12, 0.18)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    crimsonCoal: makeLightMap(128, [
      [0, 'rgba(251, 146, 60, 0.65)'],
      [0.45, 'rgba(220, 38, 38, 0.35)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    smokeVeil: makeLightMap(160, [
      [0, 'rgba(28, 25, 23, 0.22)'],
      [0.55, 'rgba(18, 16, 15, 0.10)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
    cyanCaustic: makeLightMap(128, [
      [0, 'rgba(165, 243, 252, 0.65)'],
      [0.45, 'rgba(56, 189, 248, 0.28)'],
      [1, 'rgba(0, 0, 0, 0)'],
    ]),
  };
}

export const ScreensaverCanvas: React.FC<ScreensaverCanvasProps> = ({
  settings,
  hardwareTier,
  isPaused,
  gamepadAxesRef,
  onThunderFlash,
  onCanvasInteract,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const settingsRef = useRef<ScreensaverSettings>(settings);
  const budgetRef = useRef<QualityBudget>(resolveQualityBudget(settings.qualityTier, hardwareTier));
  const isPausedRef = useRef<boolean>(isPaused);
  const onThunderRef = useRef(onThunderFlash);

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
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const lightMaps = createLightMaps();

    // Preload all 6 photorealistic 8K cinema plates into pre-scaled 960x540 offscreen buffers
    const plateCanvases: Partial<Record<SceneId, HTMLCanvasElement>> = {};
    const sceneKeys: SceneId[] = ['hearth', 'campfire', 'rain', 'aurora', 'ocean', 'zen'];

    sceneKeys.forEach((sc) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = SCENE_PLATE_URLS[sc];
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = LOGICAL_W;
        off.height = LOGICAL_H;
        const oCtx = off.getContext('2d');
        if (oCtx) {
          oCtx.drawImage(img, 0, 0, LOGICAL_W, LOGICAL_H);
          plateCanvases[sc] = off;
        }
      };
    });

    // Zero-GC TypedArray pools
    const embers = new Float32Array(MAX_EMBERS * EMBER_STRIDE);
    const ribbons = new Float32Array(MAX_FLAME_RIBBONS * RIBBON_STRIDE);
    const rain = new Float32Array(MAX_RAIN * RAIN_STRIDE);
    const drops = new Float32Array(MAX_DROPS * DROP_STRIDE);
    const ripples = new Float32Array(MAX_RIPPLES * RIPPLE_STRIDE);

    const getFireOrigin = (scene: SceneId): { cx: number; cy: number; spreadX: number } => {
      if (scene === 'hearth') {
        // Calibrated to the exact firebox grate & logs in scene_hearth_fireplace
        return { cx: 634, cy: 356, spreadX: 92 };
      }
      // Calibrated to the exact stone ring & logs in scene_wilderness_campfire
      return { cx: 498, cy: 386, spreadX: 68 };
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
      embers[idx + 6] = 0.7 + Math.random() * 1.35; // Razor-sharp pinpoint micro-spark size
      embers[idx + 7] = randomLife ? Math.random() * maxLife : 0;
      embers[idx + 8] = maxLife;
      embers[idx + 9] = Math.random() * Math.PI * 2;
    };

    const initFlameRibbons = (scene: SceneId) => {
      const orig = getFireOrigin(scene);
      for (let i = 0; i < MAX_FLAME_RIBBONS; i++) {
        const idx = i * RIBBON_STRIDE;
        const norm = (i / (MAX_FLAME_RIBBONS - 1)) * 2 - 1; // -1..1
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
      // Confine window droplets to the glass pane area (x: 235..915 in rain scene)
      const minX = settingsRef.current.scene === 'rain' ? 238 : 40;
      const maxX = settingsRef.current.scene === 'rain' ? 912 : LOGICAL_W - 40;
      drops[idx + 0] = minX + Math.random() * (maxX - minX);
      drops[idx + 1] = randomY ? Math.random() * (LOGICAL_H - 40) : -12;
      drops[idx + 2] = 10 + Math.random() * 34;
      const r = 2.2 + Math.random() * 4.2;
      drops[idx + 3] = r;
      drops[idx + 4] = r * (1.25 + Math.random() * 0.45);
      drops[idx + 5] = Math.random() * Math.PI * 2;
      drops[idx + 6] = 18 + Math.random() * 45;
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
    let simTime = 0;
    let lightningFlash = 0;

    const handleResize = () => {
      const scale = budgetRef.current.resolutionScale;
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
      const targetW = Math.max(480, Math.round(window.innerWidth * dpr));
      const targetH = Math.max(270, Math.round(window.innerHeight * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(canvas.width / LOGICAL_W, 0, 0, canvas.height / LOGICAL_H, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const updateSimulation = (dt: number) => {
      simTime += dt;
      const st = settingsRef.current;
      const budget = budgetRef.current;

      if (lastScene !== st.scene) {
        lastScene = st.scene;
        initFlameRibbons(st.scene);
        for (let i = 0; i < MAX_EMBERS; i++) spawnEmber(i, true);
      }

      const padWind = gamepadAxesRef.current.rx * 35;
      const effectiveWind = st.windSpeed * 45 + padWind;

      if (st.scene === 'hearth' || st.scene === 'campfire') {
        const eCount = Math.min(
          MAX_EMBERS,
          Math.floor(budget.maxEmberParticles * Math.min(1.4, st.emberDensity))
        );
        for (let i = 0; i < eCount; i++) {
          const idx = i * EMBER_STRIDE;
          embers[idx + 7] += dt;
          if (embers[idx + 7] >= embers[idx + 8] || embers[idx + 1] < 40) {
            spawnEmber(i, false);
            continue;
          }
          // Store previous position for realistic camera-shutter motion blur streak
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
              // Realistic stick-slip surface tension physics on glass
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

    /**
     * Real-time scanline UV displacement shader pass: warps the actual photographic flames & heat
     * column so the photograph's fire dances, licks upward, and refracts at 60Hz.
     */
    const renderPhotorealisticFire = (
      plate: HTMLCanvasElement,
      st: ScreensaverSettings,
      budget: QualityBudget
    ) => {
      const isHearth = st.scene === 'hearth';
      const orig = getFireOrigin(st.scene);
      const padFireBoost = Math.max(-0.35, -gamepadAxesRef.current.ry * 0.45);
      const firePower = Math.max(0.25, st.fireIntensity + padFireBoost);

      // Multi-frequency organic combustion flicker
      const flicker =
        (0.84 +
          0.09 * Math.sin(simTime * 9.4) +
          0.06 * Math.cos(simTime * 16.8) +
          0.04 * Math.sin(simTime * 27.3)) *
        firePower;

      // 1. Real-Time UV Scanline Heat & Flame Displacement over the active fire zone
      if (budget.enableHeatShimmer) {
        const zoneX = isHearth ? 495 : 375;
        const zoneW = isHearth ? 275 : 245;
        const zoneTop = isHearth ? 175 : 205;
        const zoneBot = isHearth ? 392 : 418;
        const stripH = 2;

        for (let y = zoneTop; y < zoneBot; y += stripH) {
          const vNorm = (y - zoneTop) / (zoneBot - zoneTop); // 0 at top of plume, 1 at logs
          const envelope = Math.sin(vNorm * Math.PI);
          const waveX =
            (Math.sin(y * 0.085 - simTime * 12.5) * 0.65 +
              Math.cos(y * 0.042 - simTime * 7.8) * 0.35) *
            envelope *
            4.2 *
            firePower *
            st.flameHeight;
          const waveY =
            Math.sin(y * 0.06 - simTime * 10.2) * envelope * 2.4 * firePower * st.flameHeight;

          ctx.drawImage(
            plate,
            zoneX,
            Math.max(0, y + waveY),
            zoneW,
            stripH,
            zoneX + waveX,
            y,
            zoneW,
            stripH
          );
        }
      }

      // 2. Dynamic Room / Clearing Illumination & Incandescent Coal Bed Exposure ('screen' & 'color-dodge')
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // Wide ambient warm light cast across the stone hearth, floor, armchair / clearing stones
      const roomLightR = (isHearth ? 390 : 350) * (0.85 + flicker * 0.25);
      ctx.globalAlpha = Math.min(0.85, 0.36 * flicker * st.coalGlow);
      ctx.drawImage(
        lightMaps.amberExposure,
        orig.cx - roomLightR,
        orig.cy - roomLightR * 0.68,
        roomLightR * 2,
        roomLightR * 1.35
      );

      // Mantelpiece candle flicker in Hearth scene (calibrated to x=608, y=38 on plate)
      if (isHearth) {
        const candleFlicker = 0.7 + 0.3 * Math.sin(simTime * 13.5 + Math.cos(simTime * 6.2));
        ctx.globalAlpha = 0.35 * candleFlicker;
        ctx.drawImage(lightMaps.coreDodger, 608 - 42, 38 - 42, 84, 84);
      }

      // Deep breathing incandescent coal bed under the logs
      const coalPulse = (0.78 + 0.22 * Math.sin(simTime * 5.2)) * st.coalGlow;
      ctx.globalAlpha = Math.min(0.9, 0.55 * coalPulse);
      const coalW = isHearth ? 145 : 95;
      ctx.drawImage(
        lightMaps.crimsonCoal,
        orig.cx - coalW,
        orig.cy - 18,
        coalW * 2,
        84
      );

      // 3. Multi-Octave Turbulent Light-Field Nodes (color-dodge & screen modulation of real photographic flames & coals)
      ctx.globalCompositeOperation = 'color-dodge';
      const nodeCount = budget.tier === 'low' ? 10 : 18;
      const windTilt =
        (st.windSpeed * 22 + gamepadAxesRef.current.rx * 20) * (isHearth ? 0.35 : 0.75);
      const flameCenterY = isHearth ? 286 : 334;

      for (let i = 0; i < nodeCount; i++) {
        const idx = i * RIBBON_STRIDE;
        const normX = (i / (nodeCount - 1)) * 2 - 1; // -1..1
        const pulse =
          0.5 +
          0.5 *
            Math.sin(simTime * ribbons[idx + 4] + ribbons[idx + 5]) *
            Math.cos(simTime * 3.7 + i);
        const rise = ((simTime * 0.85 + i * 0.19) % 1);
        const nx =
          orig.cx +
          normX * (orig.spreadX * 0.65) * (1 - rise * 0.45) +
          Math.sin(simTime * 6.5 + i * 1.3) * 10 +
          windTilt * rise;
        const ny = flameCenterY + 32 - rise * (isHearth ? 85 : 95) * st.flameHeight;
        const radius = (26 + (1 - Math.abs(normX)) * 34) * (1 - rise * 0.45) * firePower;

        ctx.globalAlpha = Math.min(0.55, (1 - rise) * pulse * 0.34 * firePower);
        ctx.drawImage(
          i % 2 === 0 ? lightMaps.coreDodger : lightMaps.crimsonCoal,
          nx - radius,
          ny - radius,
          radius * 2,
          radius * 2
        );
      }

      ctx.globalCompositeOperation = 'screen';

      // 4. Pinpoint Motion-Blurred Micro-Embers (Realistic 1px glowing sparks with velocity streaks)
      const eCount = Math.min(
        MAX_EMBERS,
        Math.floor(budget.maxEmberParticles * Math.min(1.4, st.emberDensity))
      );
      ctx.lineCap = 'round';
      for (let i = 0; i < eCount; i++) {
        const idx = i * EMBER_STRIDE;
        const p = embers[idx + 7] / embers[idx + 8];
        const flickerSpark = 0.5 + 0.5 * Math.sin(simTime * 22 + embers[idx + 9]);
        const alpha = Math.pow(1 - p, 1.2) * flickerSpark;
        if (alpha <= 0.03) continue;

        const x = embers[idx + 0];
        const y = embers[idx + 1];
        const px = embers[idx + 2];
        const py = embers[idx + 3];
        const sz = embers[idx + 6];

        ctx.globalAlpha = alpha;
        ctx.strokeStyle =
          p < 0.28
            ? '#fffbeb'
            : p < 0.65
            ? '#fb923c'
            : '#dc2626';
        ctx.lineWidth = sz;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      ctx.restore();

      // 5. Subtle rising translucent woodsmoke veil above campfire
      if (st.smokeAmount > 0.05) {
        ctx.save();
        const smokePuffs = 6;
        for (let s = 0; s < smokePuffs; s++) {
          const cycle = ((simTime * 0.22 + s / smokePuffs) % 1);
          const sx =
            orig.cx +
            Math.sin(simTime * 0.8 + s * 1.7) * (25 + cycle * 45) +
            windTilt * cycle * 1.4;
          const sy = orig.cy - 65 - cycle * 195;
          const sr = 48 + cycle * 75;
          ctx.globalAlpha = Math.sin(cycle * Math.PI) * 0.28 * st.smokeAmount;
          ctx.drawImage(lightMaps.smokeVeil, sx - sr, sy - sr, sr * 2, sr * 2);
        }
        ctx.restore();
      }
    };

    /**
     * Renders true optical lens-refracting raindrops on the windowpane by sampling magnified
     * patches of the underlying 8K night window plate, plus exterior rain sheets and lightning.
     */
    const renderPhotorealisticRain = (
      plate: HTMLCanvasElement,
      st: ScreensaverSettings,
      budget: QualityBudget
    ) => {
      // 1. Sheet lightning illuminating the storm clouds at the top of the window
      if (lightningFlash > 0.01 && st.scene === 'rain') {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const skyGrad = ctx.createLinearGradient(0, 0, 0, 280);
        skyGrad.addColorStop(0, `rgba(224, 242, 254, ${lightningFlash * 0.55})`);
        skyGrad.addColorStop(0.6, `rgba(147, 197, 253, ${lightningFlash * 0.22})`);
        skyGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(225, 0, 710, 280);
        ctx.restore();
      }

      // 2. High-velocity exterior rain streaks
      const rCount = Math.min(MAX_RAIN, Math.floor(budget.maxRainDrops * st.rainIntensity));
      const windDx = st.windSpeed * 18;
      ctx.save();
      if (st.scene === 'rain') {
        ctx.beginPath();
        ctx.rect(228, 0, 704, 520);
        ctx.clip();
      }
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

      // 3. True Optical Lens-Refracting Glass Droplets
      if (st.glassDroplets) {
        const dCount = Math.min(MAX_DROPS, budget.maxGlassDrops);
        for (let i = 0; i < dCount; i++) {
          const idx = i * DROP_STRIDE;
          const dx = drops[idx + 0];
          const dy = drops[idx + 1];
          const rx = drops[idx + 3];
          const ry = drops[idx + 4];
          const trail = drops[idx + 6];

          // Faint wet rivulet trail above the sliding droplet
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
          ctx.lineWidth = rx * 0.55;
          ctx.beginPath();
          ctx.moveTo(dx, dy - trail);
          ctx.lineTo(dx, dy - ry);
          ctx.stroke();

          // Refracted magnified background patch inside the water bead
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
          ctx.clip();

          const sampleX = Math.max(0, Math.min(LOGICAL_W - 24, dx - rx * 2.2));
          const sampleY = Math.max(0, Math.min(LOGICAL_H - 24, dy - ry * 2.2));
          ctx.drawImage(
            plate,
            sampleX,
            sampleY,
            rx * 4.4,
            ry * 4.4,
            dx - rx,
            dy - ry,
            rx * 2,
            ry * 2
          );

          // Crisp Fresnel rim shadow + top-left specular glint
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.beginPath();
          ctx.arc(dx - rx * 0.32, dy - ry * 0.35, Math.max(0.7, rx * 0.26), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.restore();
    };

    /**
     * Real-time fjord water mirror ripple displacement & solar curtain undulation.
     */
    const renderPhotorealisticAurora = (
      plate: HTMLCanvasElement,
      st: ScreensaverSettings
    ) => {
      // 1. Horizontal scanline water-wave refraction across the glassy fjord (y: 282..540)
      const waterTop = 282;
      for (let y = waterTop; y < LOGICAL_H; y += 2) {
        const depthNorm = (y - waterTop) / (LOGICAL_H - waterTop);
        const phase = y * 0.22 - simTime * 3.8;
        const dx = Math.sin(phase) * Math.cos(y * 0.07 + simTime * 1.9) * (1.2 + depthNorm * 3.2);
        ctx.drawImage(plate, 0, y, LOGICAL_W, 2, dx, y, LOGICAL_W, 2);
      }

      // 2. Subtle undulating solar aurora luminance curtains in sky & water reflection
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let x = 80; x < LOGICAL_W - 80; x += 28) {
        const wave =
          Math.sin(x * 0.008 + simTime * 0.55) * 0.5 +
          Math.cos(x * 0.015 - simTime * 0.38) * 0.5;
        if (wave <= 0) continue;
        const alpha = wave * 0.065 * st.fireIntensity;
        const skyY = 85 + Math.sin(x * 0.006 + simTime * 0.4) * 35;

        const g = ctx.createLinearGradient(x, skyY - 55, x, skyY + 75);
        g.addColorStop(0, 'rgba(16, 185, 129, 0)');
        g.addColorStop(0.5, `rgba(52, 211, 153, ${alpha.toFixed(3)})`);
        g.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, skyY - 55, 30, 130);
      }
      ctx.restore();
    };

    /**
     * Real-time underwater caustic sunbeams & current distortion for Deep Ocean Reef.
     */
    const renderPhotorealisticOcean = (
      plate: HTMLCanvasElement,
      st: ScreensaverSettings,
      budget: QualityBudget
    ) => {
      // 1. Subtle underwater optical wave refraction
      if (budget.enableHeatShimmer) {
        for (let y = 0; y < LOGICAL_H; y += 3) {
          const dx = Math.sin(y * 0.045 - simTime * 2.1) * 1.6;
          ctx.drawImage(plate, 0, y, LOGICAL_W, 3, dx, y, LOGICAL_W, 3);
        }
      }

      // 2. Shimmering volumetric sunbeam rays piercing down from (x=518, y=0)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let r = -4; r <= 4; r++) {
        const angle = r * 0.11 + Math.sin(simTime * 0.55 + r * 1.4) * 0.025;
        const rayAlpha = (0.045 + 0.03 * Math.sin(simTime * 1.1 + r * 2.1)) * st.fireIntensity;
        ctx.save();
        ctx.translate(518, -10);
        ctx.rotate(angle);
        const grad = ctx.createLinearGradient(0, 0, 0, 480);
        grad.addColorStop(0, `rgba(186, 230, 253, ${rayAlpha.toFixed(3)})`);
        grad.addColorStop(0.65, `rgba(56, 189, 248, ${(rayAlpha * 0.45).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(14, 116, 144, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        ctx.lineTo(16, 0);
        ctx.lineTo(68, 480);
        ctx.lineTo(-68, 480);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 3. Tiny drifting bioluminescent marine snow & micro-bubbles
      const count = Math.min(80, Math.floor(budget.maxEmberParticles * st.emberDensity));
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

    /**
     * Real-time pond water reflection ripples & stone toro lantern candle flicker for Kyoto Zen Pond.
     */
    const renderPhotorealisticZen = (
      plate: HTMLCanvasElement,
      st: ScreensaverSettings
    ) => {
      // 1. Pond water reflection wave refraction (y: 235..540, x: 260..900)
      for (let y = 238; y < LOGICAL_H; y += 2) {
        const depth = (y - 238) / (LOGICAL_H - 238);
        const dx = Math.sin(y * 0.25 - simTime * 4.2) * (0.9 + depth * 2.4);
        ctx.drawImage(plate, 260, y, 640, 2, 260 + dx, y, 640, 2);
      }

      // 2. Concentric water surface rings on pond
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.14)';
      ctx.lineWidth = 1.0;
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const idx = i * RIPPLE_STRIDE;
        const p = ripples[idx + 2] / ripples[idx + 3];
        const alpha = (1 - p) * ripples[idx + 4] * 0.32;
        if (alpha <= 0.01) continue;
        ctx.strokeStyle = `rgba(226, 232, 240, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(
          ripples[idx + 0],
          ripples[idx + 1],
          ripples[idx + 2],
          ripples[idx + 2] * 0.32,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }

      // 3. Warm candle flicker inside the stone toro lantern (x=268, y=220) & water reflection (x=292, y=435)
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
      const plate = plateCanvases[st.scene];

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      if (!plate) {
        // Dark fallback while image decodes on first millisecond
        ctx.fillStyle = '#080605';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        return;
      }

      // 1. Blit 8K Photorealistic Cinema Base Plate
      ctx.drawImage(plate, 0, 0, LOGICAL_W, LOGICAL_H);

      // 2. Apply Real-Time Physical Shader & Particle Passes
      if (st.scene === 'hearth' || st.scene === 'campfire') {
        renderPhotorealisticFire(plate, st, budget);
        if (st.audioChannels.rainDownpour > 0.18) {
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

      // 3. Apply Night Shift Color Temperature & OLED Peak Luminance Cap
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
    let timerId = 0;
    let lastTs = 0;
    let accumulator = 0;
    let disposed = false;
    const STEP_MS = 1000 / 60;
    const STEP_SEC = 1 / 60;

    const scheduleNext = () => {
      if (disposed) return;
      timerId = window.setTimeout(() => {
        if (!disposed) {
          rafId = requestAnimationFrame(frame);
        }
      }, 20);
    };

    const frame = (ts: number) => {
      if (disposed) return;
      if (isPausedRef.current) {
        lastTs = ts;
        scheduleNext();
        return;
      }
      if (!lastTs) lastTs = ts;
      const deltaMs = Math.min(250, ts - lastTs);
      lastTs = ts;
      accumulator += deltaMs;

      while (accumulator >= STEP_MS) {
        updateSimulation(STEP_SEC);
        accumulator -= STEP_MS;
      }
      drawFrame();
      scheduleNext();
    };

    updateSimulation(STEP_SEC);
    drawFrame();
    scheduleNext();

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (timerId) window.clearTimeout(timerId);
      window.removeEventListener('resize', handleResize);
    };
  }, [gamepadAxesRef]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="screensaver-canvas"
      onClick={onCanvasInteract}
      className="block w-screen h-screen cursor-pointer"
    />
  );
};
