export type SceneId = 'hearth' | 'campfire' | 'rain' | 'aurora' | 'ocean' | 'zen';

export type AppMode = 'screensaver' | 'settings' | 'preview';

export type QualityTier = 'auto' | 'low' | 'mid' | 'high';

export type ColorTemp = 'natural' | 'warm2700k' | 'candle2000k' | 'midnight';

export type SupportedLang = 'en' | 'fr' | 'es' | 'ar';

export interface AudioMixChannels {
  hearthRoar: number;      // 0..1 Deep convection draft & fireplace rumble
  woodCrackle: number;     // 0..1 Pine & birch resin snaps and pops
  rainDownpour: number;    // 0..1 Rain on windowpane & foliage
  distantThunder: number;  // 0..1 Rolling low-frequency storm thunder
  nightWind: number;       // 0..1 Breeze through pines & chimney draft
  waterStream: number;     // 0..1 Gentle brook / shore waves
}

export interface ScreensaverSettings {
  scene: SceneId;
  mode: AppMode;
  qualityTier: QualityTier;
  clockFormat: '12h' | '24h';
  showClock: boolean;
  showSeconds: boolean;
  showDate: boolean;
  showAmbientBadge: boolean;
  hudAutoHideSec: number; // 0 = always visible, >0 = hide after N seconds
  burnInProtection: boolean;
  pixelOrbitRange: number; // 0..28 px
  peakLuminance: number; // 40..100 %
  colorTemp: ColorTemp;
  autoCycleMinutes: number; // 0 = off, 1, 5, 15, 30
  sleepTimerMinutes: number; // 0 = off, 15, 30, 60, 120
  // Scene-specific physics & graphics knobs
  fireIntensity: number; // 0.2..1.5
  emberDensity: number; // 0..1.5
  flameHeight: number; // 0.3..1.4
  coalGlow: number; // 0.2..1.4
  smokeAmount: number; // 0..1.2
  rainIntensity: number; // 0..1.5
  windSpeed: number; // 0..1.2
  lightningFreq: number; // 0..1.0
  glassDroplets: boolean;
  starlightDensity: number; // 0.2..1.5
  // Audio settings
  masterAudio: boolean;
  masterVolume: number; // 0..1
  openSourceStreams: boolean; // Use real Wikimedia CC0 field recordings layered with acoustic engine
  audioChannels: AudioMixChannels;
}

export interface SceneMetadata {
  id: SceneId;
  accent: string;
  secondaryAccent: string;
  tempLabel: string;
  defaultAudioMix: AudioMixChannels;
  openSourceAssets: {
    label: string;
    license: string;
    url: string;
  }[];
}

export const SCENE_IDS: SceneId[] = ['hearth', 'campfire', 'rain', 'aurora', 'ocean', 'zen'];

export const SCENE_METADATA: Record<SceneId, SceneMetadata> = {
  hearth: {
    id: 'hearth',
    accent: '#f97316',
    secondaryAccent: '#fbbf24',
    tempLabel: '22.5°C · Parlor Hearth',
    defaultAudioMix: {
      hearthRoar: 0.82,
      woodCrackle: 0.92,
      rainDownpour: 0.18,
      distantThunder: 0.08,
      nightWind: 0.15,
      waterStream: 0.0,
    },
    openSourceAssets: [
      {
        label: 'Wood Fire Crackling Field Recording (Wikimedia Commons OGG)',
        license: 'CC0 / Public Domain',
        url: './audio/fire_crackle.ogg',
      },
      {
        label: 'Open Fireplace Burning Field Recording (Wikimedia Commons OGG)',
        license: 'CC-BY-SA / Free Cultural Work',
        url: './audio/hearth_roar.ogg',
      },
    ],
  },
  campfire: {
    id: 'campfire',
    accent: '#ea580c',
    secondaryAccent: '#fde047',
    tempLabel: '11.0°C · Pine Clearing',
    defaultAudioMix: {
      hearthRoar: 0.72,
      woodCrackle: 0.95,
      rainDownpour: 0.0,
      distantThunder: 0.0,
      nightWind: 0.48,
      waterStream: 0.15,
    },
    openSourceAssets: [
      {
        label: 'Wilderness Wood Fire Crackling Foley (Wikimedia Commons OGG)',
        license: 'CC0 / Public Domain',
        url: './audio/fire_crackle.ogg',
      },
      {
        label: 'Night Wind Field Recording (Wikimedia Commons OGG)',
        license: 'CC-BY-SA / Free Cultural Work',
        url: './audio/night_wind.ogg',
      },
    ],
  },
  rain: {
    id: 'rain',
    accent: '#38bdf8',
    secondaryAccent: '#818cf8',
    tempLabel: '14.2°C · Storm Glass',
    defaultAudioMix: {
      hearthRoar: 0.0,
      woodCrackle: 0.0,
      rainDownpour: 0.92,
      distantThunder: 0.72,
      nightWind: 0.42,
      waterStream: 0.25,
    },
    openSourceAssets: [
      {
        label: 'Rainfall & Storm Field Recording (Wikimedia Commons OGG)',
        license: 'CC0 / Public Domain',
        url: './audio/rain_downpour.ogg',
      },
      {
        label: 'R. Humphries Thunderstorm Recording (FreeSound / Wikimedia OGG)',
        license: 'CC-BY 3.0',
        url: './audio/distant_thunder.ogg',
      },
    ],
  },
  aurora: {
    id: 'aurora',
    accent: '#10b981',
    secondaryAccent: '#a855f7',
    tempLabel: '-4.0°C · Arctic Fjord',
    defaultAudioMix: {
      hearthRoar: 0.0,
      woodCrackle: 0.0,
      rainDownpour: 0.0,
      distantThunder: 0.0,
      nightWind: 0.68,
      waterStream: 0.42,
    },
    openSourceAssets: [
      {
        label: 'Arctic Wind Field Recording (Wikimedia Commons OGG)',
        license: 'Public Domain',
        url: './audio/night_wind.ogg',
      },
    ],
  },
  ocean: {
    id: 'ocean',
    accent: '#06b6d4',
    secondaryAccent: '#3b82f6',
    tempLabel: '18.6°C · Deep Reef',
    defaultAudioMix: {
      hearthRoar: 0.0,
      woodCrackle: 0.0,
      rainDownpour: 0.0,
      distantThunder: 0.0,
      nightWind: 0.12,
      waterStream: 0.90,
    },
    openSourceAssets: [
      {
        label: 'Natural Ocean Waves & Surf Recording (Wikimedia Commons OGG)',
        license: 'CC-BY-SA',
        url: './audio/water_stream.ogg',
      },
    ],
  },
  zen: {
    id: 'zen',
    accent: '#f59e0b',
    secondaryAccent: '#ec4899',
    tempLabel: '19.4°C · Bamboo Pond',
    defaultAudioMix: {
      hearthRoar: 0.0,
      woodCrackle: 0.0,
      rainDownpour: 0.22,
      distantThunder: 0.0,
      nightWind: 0.30,
      waterStream: 0.85,
    },
    openSourceAssets: [
      {
        label: 'Natural Water & Rain Ambience (Wikimedia Commons OGG)',
        license: 'CC-BY-SA',
        url: '/audio/water_stream.ogg',
      },
    ],
  },
};

export const DEFAULT_SETTINGS: ScreensaverSettings = {
  scene: 'hearth',
  mode: 'screensaver',
  qualityTier: 'auto',
  clockFormat: '24h',
  showClock: true,
  showSeconds: false,
  showDate: true,
  showAmbientBadge: true,
  hudAutoHideSec: 12,
  burnInProtection: true,
  pixelOrbitRange: 14,
  peakLuminance: 100,
  colorTemp: 'natural',
  autoCycleMinutes: 0,
  sleepTimerMinutes: 0,
  fireIntensity: 0.9,
  emberDensity: 0.85,
  flameHeight: 0.85,
  coalGlow: 0.9,
  smokeAmount: 0.55,
  rainIntensity: 0.78,
  windSpeed: 0.35,
  lightningFreq: 0.4,
  glassDroplets: true,
  starlightDensity: 0.85,
  masterAudio: true,
  masterVolume: 0.85,
  openSourceStreams: true,
  audioChannels: { ...SCENE_METADATA.hearth.defaultAudioMix },
};

export function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function isValidSceneId(val: unknown): val is SceneId {
  return typeof val === 'string' && (SCENE_IDS as string[]).includes(val);
}

export function sanitizeSettings(
  base: ScreensaverSettings,
  partial?: Record<string, unknown> | null
): ScreensaverSettings {
  if (!partial || typeof partial !== 'object') {
    return { ...base, audioChannels: { ...base.audioChannels } };
  }

  const nextScene = isValidSceneId(partial.scene)
    ? partial.scene
    : isValidSceneId(partial.defaultScene)
    ? (partial.defaultScene as SceneId)
    : base.scene;

  const validModes: AppMode[] = ['screensaver', 'settings', 'preview'];
  const nextMode: AppMode =
    typeof partial.mode === 'string' && validModes.includes(partial.mode as AppMode)
      ? (partial.mode as AppMode)
      : typeof partial.defaultMode === 'string' && validModes.includes(partial.defaultMode as AppMode)
      ? (partial.defaultMode as AppMode)
      : base.mode;

  const validTiers: QualityTier[] = ['auto', 'low', 'mid', 'high'];
  const qualityTier: QualityTier =
    typeof partial.qualityTier === 'string' && validTiers.includes(partial.qualityTier as QualityTier)
      ? (partial.qualityTier as QualityTier)
      : base.qualityTier;

  const validColorTemps: ColorTemp[] = ['natural', 'warm2700k', 'candle2000k', 'midnight'];
  const colorTemp: ColorTemp =
    typeof partial.colorTemp === 'string' && validColorTemps.includes(partial.colorTemp as ColorTemp)
      ? (partial.colorTemp as ColorTemp)
      : base.colorTemp;

  const clockFormat: '12h' | '24h' =
    partial.clockFormat === '12h' || partial.clockFormat === '24h'
      ? partial.clockFormat
      : base.clockFormat;

  const rawChannels =
    partial.audioChannels && typeof partial.audioChannels === 'object'
      ? (partial.audioChannels as Record<string, unknown>)
      : {};

  return {
    scene: nextScene,
    mode: nextMode,
    qualityTier,
    clockFormat,
    showClock: typeof partial.showClock === 'boolean' ? partial.showClock : base.showClock,
    showSeconds: typeof partial.showSeconds === 'boolean' ? partial.showSeconds : base.showSeconds,
    showDate: typeof partial.showDate === 'boolean' ? partial.showDate : base.showDate,
    showAmbientBadge:
      typeof partial.showAmbientBadge === 'boolean' ? partial.showAmbientBadge : base.showAmbientBadge,
    hudAutoHideSec: clampNum(partial.hudAutoHideSec, 0, 120, base.hudAutoHideSec),
    burnInProtection:
      typeof partial.burnInProtection === 'boolean' ? partial.burnInProtection : base.burnInProtection,
    pixelOrbitRange: clampNum(partial.pixelOrbitRange, 0, 28, base.pixelOrbitRange),
    peakLuminance: clampNum(partial.peakLuminance, 40, 100, base.peakLuminance),
    colorTemp,
    autoCycleMinutes: clampNum(partial.autoCycleMinutes, 0, 120, base.autoCycleMinutes),
    sleepTimerMinutes: clampNum(partial.sleepTimerMinutes, 0, 240, base.sleepTimerMinutes),
    fireIntensity: clampNum(partial.fireIntensity, 0.2, 1.5, base.fireIntensity),
    emberDensity: clampNum(partial.emberDensity, 0, 1.5, base.emberDensity),
    flameHeight: clampNum(partial.flameHeight, 0.3, 1.4, base.flameHeight),
    coalGlow: clampNum(partial.coalGlow, 0.2, 1.4, base.coalGlow),
    smokeAmount: clampNum(partial.smokeAmount, 0, 1.2, base.smokeAmount),
    rainIntensity: clampNum(partial.rainIntensity, 0, 1.5, base.rainIntensity),
    windSpeed: clampNum(partial.windSpeed, 0, 1.2, base.windSpeed),
    lightningFreq: clampNum(partial.lightningFreq, 0, 1.0, base.lightningFreq),
    glassDroplets: typeof partial.glassDroplets === 'boolean' ? partial.glassDroplets : base.glassDroplets,
    starlightDensity: clampNum(partial.starlightDensity, 0.2, 1.5, base.starlightDensity),
    masterAudio: typeof partial.masterAudio === 'boolean' ? partial.masterAudio : base.masterAudio,
    masterVolume: clampNum(partial.masterVolume, 0, 1, base.masterVolume),
    openSourceStreams:
      typeof partial.openSourceStreams === 'boolean'
        ? partial.openSourceStreams
        : base.openSourceStreams,
    audioChannels: {
      hearthRoar: clampNum(rawChannels.hearthRoar, 0, 1, base.audioChannels.hearthRoar),
      woodCrackle: clampNum(rawChannels.woodCrackle, 0, 1, base.audioChannels.woodCrackle),
      rainDownpour: clampNum(rawChannels.rainDownpour, 0, 1, base.audioChannels.rainDownpour),
      distantThunder: clampNum(rawChannels.distantThunder, 0, 1, base.audioChannels.distantThunder),
      nightWind: clampNum(rawChannels.nightWind, 0, 1, base.audioChannels.nightWind),
      waterStream: clampNum(rawChannels.waterStream, 0, 1, base.audioChannels.waterStream),
    },
  };
}

/**
 * Parses URL query string and MyPC launch path into partial settings overrides.
 * Supports MyPC Screensaver Settings host integration:
 *   ?scene=campfire&mode=settings&clock=12h&quality=high&fire=1.1&rain=0.8&orbit=1&autostart=1
 */
export function parseLaunchOverrides(
  searchStr: string,
  launchPath?: string | null
): Partial<ScreensaverSettings> & { pureView?: boolean } {
  const out: Partial<ScreensaverSettings> & { pureView?: boolean } = {};
  const params = new URLSearchParams(searchStr.startsWith('?') ? searchStr.slice(1) : searchStr);

  const sceneParam = params.get('scene') || params.get('style');
  if (isValidSceneId(sceneParam)) {
    out.scene = sceneParam;
    out.audioChannels = { ...SCENE_METADATA[sceneParam].defaultAudioMix };
  }

  const modeParam = params.get('mode');
  if (modeParam === 'settings' || params.get('settings') === '1' || params.get('config') === '1') {
    out.mode = 'settings';
  } else if (modeParam === 'preview' || params.get('preview') === '1') {
    out.mode = 'preview';
    out.pureView = true;
  } else if (modeParam === 'screensaver') {
    out.mode = 'screensaver';
  }

  if (params.get('autostart') === '1' || params.get('pure') === '1') {
    out.pureView = params.get('pure') === '1';
  }

  const clockParam = params.get('clock');
  if (clockParam === '12h' || clockParam === '24h') {
    out.clockFormat = clockParam;
  } else if (clockParam === '0' || clockParam === 'off') {
    out.showClock = false;
  }

  const qualityParam = params.get('quality');
  if (qualityParam === 'low' || qualityParam === 'mid' || qualityParam === 'high' || qualityParam === 'auto') {
    out.qualityTier = qualityParam;
  }

  if (params.has('fire')) out.fireIntensity = clampNum(params.get('fire'), 0.2, 1.5, 0.9);
  if (params.has('embers')) out.emberDensity = clampNum(params.get('embers'), 0, 1.5, 0.85);
  if (params.has('rain')) out.rainIntensity = clampNum(params.get('rain'), 0, 1.5, 0.78);
  if (params.has('wind')) out.windSpeed = clampNum(params.get('wind'), 0, 1.2, 0.35);
  if (params.has('orbit')) out.burnInProtection = params.get('orbit') !== '0' && params.get('orbit') !== 'false';
  if (params.has('mute')) out.masterAudio = params.get('mute') !== '1' && params.get('mute') !== 'true';

  // Deep link path from MyPC.launch (e.g. "scene/campfire", "settings", "preview/rain")
  if (launchPath && typeof launchPath === 'string') {
    const clean = launchPath.replace(/^[/?#]+/, '').trim();
    if (clean === 'settings' || clean.startsWith('settings/')) {
      out.mode = 'settings';
    } else if (clean.startsWith('scene/')) {
      const target = clean.slice('scene/'.length).split('?')[0];
      if (isValidSceneId(target)) {
        out.scene = target;
        out.audioChannels = { ...SCENE_METADATA[target].defaultAudioMix };
      }
    } else if (clean.startsWith('preview/')) {
      const target = clean.slice('preview/'.length).split('?')[0];
      out.mode = 'preview';
      out.pureView = true;
      if (isValidSceneId(target)) {
        out.scene = target;
      }
    } else if (isValidSceneId(clean)) {
      out.scene = clean;
      out.audioChannels = { ...SCENE_METADATA[clean].defaultAudioMix };
    }
  }

  return out;
}

export interface QualityBudget {
  tier: 'low' | 'mid' | 'high';
  resolutionScale: number;
  maxFlameParticles: number;
  maxEmberParticles: number;
  maxSmokeParticles: number;
  maxRainDrops: number;
  maxGlassDrops: number;
  maxStars: number;
  enableHeatShimmer: boolean;
  enableSecondaryGlow: boolean;
}

export function resolveQualityBudget(
  settingTier: QualityTier,
  hardwareTier: 'low' | 'mid' | 'high' = 'high'
): QualityBudget {
  const effective = settingTier === 'auto' ? hardwareTier : settingTier;
  if (effective === 'low') {
    return {
      tier: 'low',
      resolutionScale: 0.65,
      maxFlameParticles: 70,
      maxEmberParticles: 45,
      maxSmokeParticles: 18,
      maxRainDrops: 90,
      maxGlassDrops: 28,
      maxStars: 60,
      enableHeatShimmer: false,
      enableSecondaryGlow: false,
    };
  }
  if (effective === 'mid') {
    return {
      tier: 'mid',
      resolutionScale: 0.85,
      maxFlameParticles: 130,
      maxEmberParticles: 85,
      maxSmokeParticles: 32,
      maxRainDrops: 180,
      maxGlassDrops: 55,
      maxStars: 110,
      enableHeatShimmer: true,
      enableSecondaryGlow: true,
    };
  }
  return {
    tier: 'high',
    resolutionScale: 1.0,
    maxFlameParticles: 210,
    maxEmberParticles: 140,
    maxSmokeParticles: 48,
    maxRainDrops: 280,
    maxGlassDrops: 90,
    maxStars: 180,
    enableHeatShimmer: true,
    enableSecondaryGlow: true,
  };
}

/**
 * Computes smooth Lissajous pixel-orbit offset to prevent OLED burn-in on Smart TVs.
 */
export function computePixelOrbit(
  timestampMs: number,
  enabled: boolean,
  rangePx: number
): { x: number; y: number } {
  if (!enabled || rangePx <= 0) return { x: 0, y: 0 };
  const r = Math.min(28, Math.max(0, rangePx));
  // Period ~ 180 seconds on X, ~ 240 seconds on Y
  const t = timestampMs * 0.001;
  const x = Math.round(Math.sin(t * 0.0349) * r * 10) / 10;
  const y = Math.round(Math.cos(t * 0.0261) * (r * 0.75) * 10) / 10;
  return { x, y };
}

export function formatClockTime(
  date: Date,
  format: '12h' | '24h',
  showSeconds: boolean
): { time: string; period: string } {
  const hours24 = date.getHours();
  const mins = String(date.getMinutes()).padStart(2, '0');
  const secs = String(date.getSeconds()).padStart(2, '0');

  if (format === '12h') {
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const h12 = hours24 % 12 || 12;
    const hStr = String(h12).padStart(2, '0');
    return {
      time: showSeconds ? `${hStr}:${mins}:${secs}` : `${hStr}:${mins}`,
      period,
    };
  }

  const hStr = String(hours24).padStart(2, '0');
  return {
    time: showSeconds ? `${hStr}:${mins}:${secs}` : `${hStr}:${mins}`,
    period: '',
  };
}

export function formatLocalizedDate(date: Date, lang: SupportedLang): string {
  const localeMap: Record<SupportedLang, string> = {
    en: 'en-US',
    fr: 'fr-FR',
    es: 'es-ES',
    ar: 'ar-EG',
  };
  try {
    return new Intl.DateTimeFormat(localeMap[lang] || 'en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

export function buildMyPCHostUrl(
  baseUrl: string,
  settings: ScreensaverSettings,
  targetMode: AppMode = settings.mode
): string {
  const cleanBase = baseUrl.split('?')[0];
  const params = new URLSearchParams();
  params.set('scene', settings.scene);
  params.set('mode', targetMode);
  params.set('clock', settings.showClock ? settings.clockFormat : 'off');
  params.set('quality', settings.qualityTier);
  params.set('fire', settings.fireIntensity.toFixed(2));
  params.set('embers', settings.emberDensity.toFixed(2));
  params.set('rain', settings.rainIntensity.toFixed(2));
  params.set('orbit', settings.burnInProtection ? '1' : '0');
  return `${cleanBase}?${params.toString()}`;
}

export interface TranslationStrings {
  appName: string;
  appSubtitle: string;
  scenes: Record<SceneId, { name: string; subtitle: string; badge: string }>;
  hud: {
    settings: string;
    pureView: string;
    soundOn: string;
    soundMuted: string;
    nextScene: string;
    prevScene: string;
    sleepTimer: string;
    autoCycle: string;
    oledProtected: string;
    remoteHint: string;
    gamepadHint: string;
    pressAnyKeyToWakeHud: string;
  };
  tabs: {
    visuals: string;
    audio: string;
    display: string;
    mypc: string;
  };
  controls: {
    closeSettings: string;
    resetDefaults: string;
    launchPureScreensaver: string;
    qualityTier: string;
    fireIntensity: string;
    emberDensity: string;
    flameHeight: string;
    coalGlow: string;
    smokeAmount: string;
    rainIntensity: string;
    windSpeed: string;
    lightningFreq: string;
    glassDroplets: string;
    masterAudio: string;
    masterVolume: string;
    openSourceStreams: string;
    showClock: string;
    clockFormat: string;
    showSeconds: string;
    showDate: string;
    burnInProtection: string;
    pixelOrbitRange: string;
    peakLuminance: string;
    colorTemp: string;
    autoCycleMinutes: string;
    sleepTimerMinutes: string;
    hudAutoHideSec: string;
  };
  channels: Record<keyof AudioMixChannels, string>;
}

export const TRANSLATIONS: Record<SupportedLang, TranslationStrings> = {
  en: {
    appName: 'Hearth & Horizon',
    appSubtitle: 'MyPC Ambient Screensaver Suite',
    scenes: {
      hearth: {
        name: 'Grand Hearth Fireplace',
        subtitle: 'Herringbone brick parlor fireplace with crackling oak logs & glowing coal bed',
        badge: 'Home Fireplace',
      },
      campfire: {
        name: 'Wilderness Fire Camp',
        subtitle: 'Roaring pine clearing campfire under Milky Way stars with buoyant rising embers',
        badge: 'Fire Camp',
      },
      rain: {
        name: 'Midnight Rain & Glass',
        subtitle: 'Refractive raindrops sliding down warm parlor glass with bokeh streetlamps & thunder',
        badge: 'Storm & Rain',
      },
      aurora: {
        name: 'Aurora Borealis Fjord',
        subtitle: 'Solar emerald & violet curtains mirrored across still arctic mountain waters',
        badge: 'Arctic Sky',
      },
      ocean: {
        name: 'Bioluminescent Reef',
        subtitle: 'Deep indigo sunbeam caustics, pulsing jellyfish & drifting luminous plankton',
        badge: 'Deep Ocean',
      },
      zen: {
        name: 'Kyoto Zen Koi Pond',
        subtitle: 'Warm stone lanterns, fluid swimming koi, sakura petals & bamboo breeze',
        badge: 'Zen Garden',
      },
    },
    hud: {
      settings: 'Screensaver Settings',
      pureView: 'Pure View (Hide UI)',
      soundOn: 'Acoustic Audio On',
      soundMuted: 'Audio Muted',
      nextScene: 'Next Scene',
      prevScene: 'Prev Scene',
      sleepTimer: 'Sleep Timer',
      autoCycle: 'Auto-Cycle',
      oledProtected: 'OLED Pixel Orbit Active',
      remoteHint: 'TV Remote: Left/Right Scene · Up/Down Intensity · OK Settings',
      gamepadHint: 'Gamepad: LB/RB Scene · Right Stick Flame & Wind · Y Pure View · Start Settings',
      pressAnyKeyToWakeHud: 'Pure Screensaver Mode · Press OK, B, or move cursor to show controls',
    },
    tabs: {
      visuals: 'Scene & Graphics',
      audio: 'Soundscape Mixer',
      display: 'Clock & OLED Care',
      mypc: 'MyPC Integration',
    },
    controls: {
      closeSettings: 'Resume Screensaver',
      resetDefaults: 'Reset Scene Defaults',
      launchPureScreensaver: 'Enter Pure Fullscreen View',
      qualityTier: 'TV GPU Quality Preset',
      fireIntensity: 'Fire & Combustion Intensity',
      emberDensity: 'Rising Sparks & Ember Density',
      flameHeight: 'Flame Draft Height',
      coalGlow: 'Incandescent Coal Bed Glow',
      smokeAmount: 'Woodsmoke Plume Density',
      rainIntensity: 'Rainfall Downpour Rate',
      windSpeed: 'Wind Gust Velocity',
      lightningFreq: 'Distant Thunder & Lightning',
      glassDroplets: 'Refractive Windowpane Droplets',
      masterAudio: 'Master Soundscape Engine',
      masterVolume: 'Master Volume Level',
      openSourceStreams: 'Layer Open-Source CC0 Field Recordings',
      showClock: 'Display Ambient TV Clock',
      clockFormat: 'Time Format (12h / 24h)',
      showSeconds: 'Show Ticking Seconds',
      showDate: 'Show Localized Date & Day',
      burnInProtection: 'OLED Burn-In Pixel Orbit',
      pixelOrbitRange: 'Pixel Orbit Shift Radius',
      peakLuminance: 'Peak TV Luminance Cap',
      colorTemp: 'Night Shift Color Temperature',
      autoCycleMinutes: 'Auto-Cycle Scenes Interval',
      sleepTimerMinutes: 'TV Sleep Timer (Auto-Exit)',
      hudAutoHideSec: 'HUD Auto-Hide Timeout',
    },
    channels: {
      hearthRoar: 'Deep Hearth Convection & Draft Roar',
      woodCrackle: 'Oak & Birch Log Snaps & Crackling',
      rainDownpour: 'Rain Patter on Glass & Eaves',
      distantThunder: 'Rolling Sub-Bass Storm Thunder',
      nightWind: 'Pine Forest Breeze & Chimney Wind',
      waterStream: 'Gentle Brook & Shore Waves',
    },
  },
  fr: {
    appName: 'Foyer & Horizon',
    appSubtitle: 'Suite Économiseur d’Écran MyPC',
    scenes: {
      hearth: {
        name: 'Grand Foyer de Maison',
        subtitle: 'Cheminée en briques avec bûches de chêne crépitantes et braises ardentes',
        badge: 'Feu de Maison',
      },
      campfire: {
        name: 'Feu de Camp Sauvage',
        subtitle: 'Feu de camp sous la Voie Lactée avec étincelles ascendantes en forêt de pins',
        badge: 'Feu de Camp',
      },
      rain: {
        name: 'Pluie de Minuit & Vitre',
        subtitle: 'Gouttes réfractives sur la vitre, bokeh urbain chaleureux et orage lointain',
        badge: 'Pluie & Orage',
      },
      aurora: {
        name: 'Fjord des Aurores Boréales',
        subtitle: 'Voiles solaires émeraude et violets reflétés sur les eaux calmes de l’Arctique',
        badge: 'Aurore Polaire',
      },
      ocean: {
        name: 'Récif Bioluminescent',
        subtitle: 'Rayons sous-marins profonds, méduses lumineuses et plancton dérivant',
        badge: 'Océan Profond',
      },
      zen: {
        name: 'Bassin Koi Zen de Kyoto',
        subtitle: 'Lanternes de pierre, carpes koi fluides, pétales de cerisier et bambous',
        badge: 'Jardin Zen',
      },
    },
    hud: {
      settings: 'Paramètres',
      pureView: 'Vue Pure (Masquer UI)',
      soundOn: 'Audio Acoustique Actif',
      soundMuted: 'Audio Muet',
      nextScene: 'Scène Suivante',
      prevScene: 'Scène Précédente',
      sleepTimer: 'Mise en veille',
      autoCycle: 'Rotation Auto',
      oledProtected: 'Protection OLED Active',
      remoteHint: 'Télécommande : Gauche/Droite Scène · Haut/Bas Intensité · OK Paramètres',
      gamepadHint: 'Manette : LB/RB Scène · Stick Droit Flamme · Y Vue Pure · Start Paramètres',
      pressAnyKeyToWakeHud: 'Mode Économiseur Pur · Appuyez sur OK ou B pour afficher les contrôles',
    },
    tabs: {
      visuals: 'Scène & Graphismes',
      audio: 'Mixeur Sonore',
      display: 'Horloge & OLED',
      mypc: 'Intégration MyPC',
    },
    controls: {
      closeSettings: 'Reprendre l’économiseur',
      resetDefaults: 'Réinitialiser',
      launchPureScreensaver: 'Mode Plein Écran Pur',
      qualityTier: 'Qualité Graphique TV',
      fireIntensity: 'Intensité du Feu',
      emberDensity: 'Densité des Braises',
      flameHeight: 'Hauteur des Flammes',
      coalGlow: 'Lueur du Lit de Charbon',
      smokeAmount: 'Fumée de Bois',
      rainIntensity: 'Intensité de la Pluie',
      windSpeed: 'Vitesse du Vent',
      lightningFreq: 'Fréquence des Éclairs',
      glassDroplets: 'Gouttes sur la Vitre',
      masterAudio: 'Moteur Audio Principal',
      masterVolume: 'Volume Général',
      openSourceStreams: 'Enregistrements CC0 Open-Source',
      showClock: 'Afficher l’Horloge TV',
      clockFormat: 'Format de l’Heure',
      showSeconds: 'Afficher les Secondes',
      showDate: 'Afficher la Date',
      burnInProtection: 'Orbite Pixels Anti-Marquage OLED',
      pixelOrbitRange: 'Rayon d’Orbite des Pixels',
      peakLuminance: 'Luminosité Maximale TV',
      colorTemp: 'Température de Couleur Nocturne',
      autoCycleMinutes: 'Intervalle de Rotation des Scènes',
      sleepTimerMinutes: 'Minuterie d’Arrêt Auto',
      hudAutoHideSec: 'Masquage Auto de l’Interface',
    },
    channels: {
      hearthRoar: 'Tirage et Souffle Profond du Foyer',
      woodCrackle: 'Crépitement des Bûches de Chêne',
      rainDownpour: 'Pluie sur la Vitre et les Toits',
      distantThunder: 'Tonnerre Lointain',
      nightWind: 'Vent Nocturne dans les Pins',
      waterStream: 'Ruisseau Calme et Vagues',
    },
  },
  es: {
    appName: 'Hogar y Horizonte',
    appSubtitle: 'Salvapantallas Ambiental para MyPC',
    scenes: {
      hearth: {
        name: 'Chimenea de Casa Clásica',
        subtitle: 'Hogar de ladrillo con troncos de roble crepitantes y brasas encendidas',
        badge: 'Chimenea de Casa',
      },
      campfire: {
        name: 'Fogata de Campamento',
        subtitle: 'Fogata bajo las estrellas con chispas ascendentes en un claro del bosque',
        badge: 'Fogata',
      },
      rain: {
        name: 'Lluvia de Medianoche',
        subtitle: 'Gotas refractivas deslizándose por el cristal con luces bokeh y truenos',
        badge: 'Lluvia Nocturna',
      },
      aurora: {
        name: 'Fiordo de Aurora Boreal',
        subtitle: 'Cortinas solares esmeralda y violeta reflejadas en aguas árticas',
        badge: 'Aurora Polar',
      },
      ocean: {
        name: 'Arrecife Bioluminiscente',
        subtitle: 'Rayos de luz submarinos, medusas brillantes y plancton luminoso',
        badge: 'Océano Profundo',
      },
      zen: {
        name: 'Estanque Koi Zen de Kioto',
        subtitle: 'Linternas de piedra, peces koi fluidos, pétalos de cerezo y brisa',
        badge: 'Jardín Zen',
      },
    },
    hud: {
      settings: 'Ajustes',
      pureView: 'Vista Pura (Sin UI)',
      soundOn: 'Audio Acústico Activo',
      soundMuted: 'Audio Silenciado',
      nextScene: 'Siguiente Escena',
      prevScene: 'Escena Anterior',
      sleepTimer: 'Temporizador',
      autoCycle: 'Ciclo Automático',
      oledProtected: 'Órbita OLED Activa',
      remoteHint: 'Mando TV: Izq/Der Escena · Arriba/Abajo Intensidad · OK Ajustes',
      gamepadHint: 'Mando: LB/RB Escena · Stick Der Fuego · Y Vista Pura · Start Ajustes',
      pressAnyKeyToWakeHud: 'Modo Salvapantallas Puro · Pulsa OK o B para mostrar controles',
    },
    tabs: {
      visuals: 'Escena y Gráficos',
      audio: 'Mezclador de Sonido',
      display: 'Reloj y Cuidado OLED',
      mypc: 'Integración MyPC',
    },
    controls: {
      closeSettings: 'Volver al Salvapantallas',
      resetDefaults: 'Restaurar Valores',
      launchPureScreensaver: 'Modo Pantalla Completa Pura',
      qualityTier: 'Calidad Gráfica de TV',
      fireIntensity: 'Intensidad del Fuego',
      emberDensity: 'Densidad de Chispas y Brasas',
      flameHeight: 'Altura de las Llamas',
      coalGlow: 'Brillo de las Brasas',
      smokeAmount: 'Humo de Leña',
      rainIntensity: 'Intensidad de la Lluvia',
      windSpeed: 'Velocidad del Viento',
      lightningFreq: 'Frecuencia de Relámpagos',
      glassDroplets: 'Gotas en el Cristal',
      masterAudio: 'Motor de Audio Principal',
      masterVolume: 'Volumen Maestro',
      openSourceStreams: 'Grabaciones de Campo CC0 Open-Source',
      showClock: 'Mostrar Reloj en Pantalla',
      clockFormat: 'Formato de Hora',
      showSeconds: 'Mostrar Segundos',
      showDate: 'Mostrar Fecha',
      burnInProtection: 'Órbita de Píxeles OLED',
      pixelOrbitRange: 'Radio de Órbita de Píxeles',
      peakLuminance: 'Brillo Máximo de TV',
      colorTemp: 'Temperatura de Color Nocturna',
      autoCycleMinutes: 'Rotación Automática de Escenas',
      sleepTimerMinutes: 'Temporizador de Apagado',
      hudAutoHideSec: 'Ocultar Controles Automáticamente',
    },
    channels: {
      hearthRoar: 'Tiro Profundo y Rugido de la Chimenea',
      woodCrackle: 'Crepitar de Troncos de Roble y Abedul',
      rainDownpour: 'Lluvia sobre el Cristal y Tejados',
      distantThunder: 'Truenos Lejanos de Tormenta',
      nightWind: 'Brisa Nocturna entre los Pinos',
      waterStream: 'Arroyo Suave y Olas',
    },
  },
  ar: {
    appName: 'الموقد والأفق',
    appSubtitle: 'شاشة توقف محيطية لنظام MyPC',
    scenes: {
      hearth: {
        name: 'موقد المنزل الكلاسيكي',
        subtitle: 'مدفأة منزلية من الطوب والحجر مع حطب البلوط المتقد والجمر المتوهج',
        badge: 'مدفأة منزلية',
      },
      campfire: {
        name: 'نار المخيم البري',
        subtitle: 'نار مخيم متوهجة تحت نجوم درب التبانة مع شرارات متصاعدة في غابة الصنوبر',
        badge: 'نار المخيم',
      },
      rain: {
        name: 'مطر منتصف الليل والنافذة',
        subtitle: 'قطرات مطر تنساب على الزجاج الدافئ مع أضواء المدينة البعيدة والرعد',
        badge: 'مطر وعاصفة',
      },
      aurora: {
        name: 'شفق قطبي فوق المضيق',
        subtitle: 'ستائر الشفق القطبي الزمردية والبنفسجية المنعكسة على المياه الهادئة',
        badge: 'الشفق القطبي',
      },
      ocean: {
        name: 'الشعاب المضيئة حيوياً',
        subtitle: 'أشعة الشمس في أعماق المحيط مع قناديل البحر والعوالق المضيئة',
        badge: 'أعماق المحيط',
      },
      zen: {
        name: 'حديقة كوي اليابانية الهادئة',
        subtitle: 'فوانيس حجرية دافئة وأسماك كوي تسبح بهدوء مع بتلات الكرز',
        badge: 'حديقة زن',
      },
    },
    hud: {
      settings: 'إعدادات شاشة التوقف',
      pureView: 'عرض نقي (إخفاء الواجهة)',
      soundOn: 'الصوت المحيطي مفعل',
      soundMuted: 'الصوت مكتوم',
      nextScene: 'المشهد التالي',
      prevScene: 'المشهد السابق',
      sleepTimer: 'مؤقت النوم',
      autoCycle: 'تبديل تلقائي',
      oledProtected: 'حماية شاشة OLED مفعلة',
      remoteHint: 'جهاز التحكم: يمين/يسار للمشهد · أعلى/أسفل للشدة · موافق للإعدادات',
      gamepadHint: 'يد التحكم: LB/RB للمشهد · العصا اليمنى للنار · Y عرض نقي · Start للإعدادات',
      pressAnyKeyToWakeHud: 'وضع شاشة التوقف النقي · اضغط موافق لإظهار عناصر التحكم',
    },
    tabs: {
      visuals: 'المشهد والرسوميات',
      audio: 'مازج الصوت الطبيعي',
      display: 'الساعة وحماية OLED',
      mypc: 'ربط إعدادات MyPC',
    },
    controls: {
      closeSettings: 'العودة إلى شاشة التوقف',
      resetDefaults: 'إعادة الضبط الافتراضي',
      launchPureScreensaver: 'تشغيل العرض النقي الكامل',
      qualityTier: 'جودة رسوميات التلفاز',
      fireIntensity: 'شدة اللهب والنار',
      emberDensity: 'كثافة الشرارات والجمر',
      flameHeight: 'ارتفاع ألسنة اللهب',
      coalGlow: 'توهج طبقة الفحم والجمر',
      smokeAmount: 'كثافة دخان الحطب',
      rainIntensity: 'غزارة هطول المطر',
      windSpeed: 'سرعة هبات الرياح',
      lightningFreq: 'تكرار البرق والرعد',
      glassDroplets: 'قطرات المطر على الزجاج',
      masterAudio: 'محرك الصوت الطبيعي',
      masterVolume: 'مستوى الصوت الرئيسي',
      openSourceStreams: 'دمج تسجيلات طبيعية مفتوحة المصدر CC0',
      showClock: 'إظهار الساعة المحيطية',
      clockFormat: 'نظام الوقت (12 / 24 ساعة)',
      showSeconds: 'إظهار الثواني',
      showDate: 'إظهار التاريخ واليوم',
      burnInProtection: 'إزاحة البكسل لحماية شاشات OLED',
      pixelOrbitRange: 'نطاق حركة البكسل',
      peakLuminance: 'الحد الأقصى لسطوع الشاشة',
      colorTemp: 'درجة حرارة اللون الليلي',
      autoCycleMinutes: 'فترة التبديل التلقائي للمشاهد',
      sleepTimerMinutes: 'مؤقت الإيقاف التلقائي',
      hudAutoHideSec: 'وقت إخفاء الواجهة تلقائياً',
    },
    channels: {
      hearthRoar: 'هدير الموقد وتيار الهواء الدافئ',
      woodCrackle: 'فرقعة حطب البلوط والصنوبر',
      rainDownpour: 'قطرات المطر على النافذة',
      distantThunder: 'هزيم الرعد البعيد',
      nightWind: 'نسيم الليل بين أشجار الصنوبر',
      waterStream: 'خرير الجدول وأمواج الشاطئ',
    },
  },
};
