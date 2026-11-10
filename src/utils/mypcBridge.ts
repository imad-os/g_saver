import {
  DEFAULT_SETTINGS,
  ScreensaverSettings,
  SupportedLang,
  TRANSLATIONS,
  sanitizeSettings,
  parseLaunchOverrides,
  SceneId,
  isValidSceneId,
  SCENE_METADATA,
} from './screensaverLogic';

export interface MyPCInfo {
  standalone: boolean;
  lang: SupportedLang;
  rtl: boolean;
  volume: { music: number; sfx: number };
  profile: { id: string; name: string };
  quality: { tier: 'low' | 'mid' | 'high' };
  app: { id: string };
  bridges?: { net?: number; ai?: number; mic?: number; drive?: number };
}

export interface MyPCPadInfo {
  dev: string;
  name: string;
  standard: boolean;
  buttons: number;
  axes: number;
}

export interface MyPCDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string | number;
  modifiedTime?: string;
  thumbnailLink?: string;
  iconLink?: string;
  videoMediaMetadata?: {
    width?: number;
    height?: number;
    durationMillis?: string | number;
  };
}

export interface MyPCDriveStatus {
  configured: boolean;
  signedIn: boolean;
  needsSignIn?: boolean;
  allowed?: boolean;
  account: { email?: string; name?: string; picture?: string } | null;
  full?: boolean;
  picker?: boolean;
}

export interface MyPCDriveStreamHandle {
  url: string;
  mode: 'worker' | 'blob';
  close: () => void;
}

export interface MyPCGlobal {
  apiLevel?: number;
  app_config?: Record<string, unknown>;
  launch?: { link?: string; app?: string; path?: string; title?: string; text?: string; at?: number } | null;
  init: (handlers: {
    onInit: (info: MyPCInfo) => void;
    onStart: () => void;
    onPause: () => void;
    onResume: () => void;
    onDestroy: () => void;
    onInput?: (action: string, pressed: boolean, repeat: boolean, dev: string) => void;
    onMenu?: (id: string) => void;
    onVolume?: (v: { music: number; sfx: number }) => void;
    onLaunch?: (launch: { path?: string; link?: string }) => void;
    ownMenu?: boolean;
    pad?: boolean | Record<string, unknown>;
  }) => void;
  ready: () => void;
  progress: (p: number) => void;
  fail: (reason: string) => void;
  report?: (error: unknown, data?: unknown) => void;
  isDown: (action: string) => boolean;
  save: (key: string, value: unknown) => void;
  load: <T>(key: string, defaultVal: T) => T;
  announce: (text: string) => void;
  setMenu: (items: { id: string; label: string }[]) => void;
  pause: () => void;
  exit: () => void;
  info: () => MyPCInfo;
  gamepad?: {
    on: (
      event: 'button' | 'axes' | 'pads',
      cb: (...args: any[]) => void
    ) => void;
    pressed: (btnIndex: number, dev?: string) => boolean;
    value: (btnIndex: number, dev?: string) => number;
    axis: (axisIndex: number, dev?: string) => number;
    name: (btnIndex: number) => string;
    pads: () => MyPCPadInfo[];
  };
  bluetooth?: {
    on: (event: 'status' | 'reading' | 'device-found', cb: (data: any) => void) => void;
    capabilities: () => Promise<any>;
    startTest: () => Promise<void>;
    stopTest: () => Promise<void>;
    disconnect: () => Promise<void>;
  };
  drive?: {
    FOLDER?: string;
    status: () => Promise<MyPCDriveStatus>;
    signIn: () => Promise<{ email?: string; name?: string; picture?: string }>;
    addFiles: () => Promise<void>;
    list: (opts?: {
      folder?: string;
      place?: 'all' | 'starred' | 'recent' | 'images' | 'videos' | 'audio' | 'documents' | 'folders' | 'trash';
      search?: string;
      q?: string;
      orderBy?: string;
      pageSize?: number;
      pageToken?: string;
    }) => Promise<{ files: MyPCDriveFile[]; next?: string }>;
    get: (id: string) => Promise<MyPCDriveFile>;
    stream: (
      fileOrId: MyPCDriveFile | string,
      opts?: {
        worker?: string;
        onProgress?: (p: number) => void;
        max?: number;
      }
    ) => Promise<MyPCDriveStreamHandle>;
  };
  text?: {
    open: (opts: {
      value?: string;
      kind?: 'text' | 'multi' | 'password' | 'url' | 'email' | 'number' | 'search' | 'name';
      label?: string;
      max?: number;
      onInput?: (val: string) => void;
      onSend?: (val: string) => void;
    }) => void;
    close: () => void;
    active: () => boolean;
  };
}

declare global {
  interface Window {
    MyPC?: MyPCGlobal;
    MyPCScreensaver?: {
      getSettings: () => ScreensaverSettings;
      updateSettings: (partial: Partial<ScreensaverSettings>) => void;
      setScene: (scene: SceneId) => void;
      openSettings: () => void;
      closeSettings: () => void;
    };
  }
}

const STORAGE_KEY = 'hearth_horizon_settings_v1';

/**
 * Ensures window.MyPC exists even if the external GitHub Pages script is unreachable offline.
 * When online, https://imad-os.github.io/g/sdk/mypc-sdk.js is loaded first in index.html.
 */
export function getMyPC(): MyPCGlobal {
  if (typeof window !== 'undefined' && window.MyPC) {
    return window.MyPC;
  }

  // Offline / fallback shim if CDN was unreachable
  const defaultInfo: MyPCInfo = {
    standalone: true,
    lang: 'en',
    rtl: false,
    volume: { music: 0.85, sfx: 0.85 },
    profile: { id: 'local', name: 'MyPC User' },
    quality: { tier: 'high' },
    app: { id: 'hearth-horizon' },
  };

  let initHandlers: Parameters<MyPCGlobal['init']>[0] | null = null;

  const fallback: MyPCGlobal = {
    apiLevel: 15,
    app_config: {},
    launch: null,
    init(handlers) {
      initHandlers = handlers;
      setTimeout(() => {
        handlers.onInit(defaultInfo);
      }, 0);
    },
    ready() {
      if (initHandlers) {
        setTimeout(() => {
          initHandlers?.onStart();
        }, 0);
      }
    },
    progress() {},
    fail(reason) {
      console.error('MyPC fail:', reason);
    },
    report(err) {
      console.warn('MyPC report:', err);
    },
    isDown() {
      return false;
    },
    save(key, value) {
      try {
        localStorage.setItem(`mypc_fallback_${key}`, JSON.stringify(value));
      } catch {
        // ignore quota errors
      }
    },
    load(key, defaultVal) {
      try {
        const raw = localStorage.getItem(`mypc_fallback_${key}`);
        return raw ? JSON.parse(raw) : defaultVal;
      } catch {
        return defaultVal;
      }
    },
    announce() {},
    setMenu() {},
    pause() {
      initHandlers?.onPause();
    },
    exit() {
      initHandlers?.onDestroy();
    },
    info() {
      return defaultInfo;
    },
    gamepad: {
      on() {},
      pressed() {
        return false;
      },
      value() {
        return 0;
      },
      axis() {
        return 0;
      },
      name(i) {
        const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start'];
        return names[i] || `Button${i}`;
      },
      pads() {
        return [];
      },
    },
  };

  if (typeof window !== 'undefined') {
    window.MyPC = fallback;
  }
  return fallback;
}

export function loadInitialSettings(): {
  settings: ScreensaverSettings;
  pureView: boolean;
} {
  const mypc = getMyPC();
  const profileId = mypc.info?.()?.profile?.id || 'local';

  // 1. Start from defaults
  let merged: ScreensaverSettings = {
    ...DEFAULT_SETTINGS,
    audioChannels: { ...DEFAULT_SETTINGS.audioChannels },
    videos: [...DEFAULT_SETTINGS.videos],
  };

  // 2. Apply MyPC.app_config (from App Store Manager or ?app_config=...)
  if (mypc.app_config && typeof mypc.app_config === 'object') {
    merged = sanitizeSettings(merged, mypc.app_config as Record<string, unknown>);
  }

  // 3. Apply per-profile saved config from MyPC.load('config') and MyPC.load(STORAGE_KEY)
  const savedConfig = mypc.load<Record<string, unknown> | null>('config', null);
  if (savedConfig && typeof savedConfig === 'object') {
    merged = sanitizeSettings(merged, savedConfig);
  }

  const saved = mypc.load<Record<string, unknown> | null>(STORAGE_KEY, null);
  if (saved && typeof saved === 'object') {
    merged = sanitizeSettings(merged, saved);
  } else if (typeof window !== 'undefined') {
    try {
      const rawBackup = localStorage.getItem(`${STORAGE_KEY}_${profileId}`);
      if (rawBackup) {
        const parsedBackup = JSON.parse(rawBackup);
        if (parsedBackup && typeof parsedBackup === 'object') {
          merged = sanitizeSettings(merged, parsedBackup);
        }
      }
    } catch {
      // ignore storage access errors
    }
  }

  // 4. Apply URL query string and MyPC.launch deep link overrides
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const launchPath = mypc.launch?.path || null;
  const overrides = parseLaunchOverrides(search, launchPath);
  merged = sanitizeSettings(merged, overrides as Record<string, unknown>);
  const pureView =
    typeof overrides.pureView === 'boolean' ? overrides.pureView : Boolean(merged.pureView);
  merged = { ...merged, pureView };

  return { settings: merged, pureView };
}

export function persistSettings(settings: ScreensaverSettings): void {
  const mypc = getMyPC();
  const profileId = mypc.info?.()?.profile?.id || 'local';

  // Save full settings & config object to MyPC profile storage
  mypc.save(STORAGE_KEY, settings);
  mypc.save('config', settings);

  // Also mirror to profile-scoped localStorage so synchronous boot before MyPC.init has latest profile state
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_KEY}_${profileId}`, JSON.stringify(settings));
    } catch {
      // ignore quota errors
    }
  }

  // Also notify parent window if embedded in MyPC Screensaver Settings page
  if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage(
        {
          mypc_screensaver: 1,
          type: 'settingsChanged',
          profileId,
          settings,
        },
        '*'
      );
    } catch {
      // ignore cross-origin restrictions
    }
  }
}

export function syncPauseMenuItems(lang: SupportedLang): void {
  const mypc = getMyPC();
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  mypc.setMenu([
    { id: 'settings', label: t.hud.settings },
    { id: 'hearth', label: t.scenes.hearth.badge },
    { id: 'cinematic', label: t.scenes.cinematic.badge },
    { id: 'rain', label: t.scenes.rain.badge },
    { id: 'aurora', label: t.scenes.aurora.badge },
    { id: 'pure', label: t.hud.pureView },
  ]);
}

export function applyScenePreset(
  current: ScreensaverSettings,
  scene: SceneId
): ScreensaverSettings {
  if (!isValidSceneId(scene)) return current;
  const meta = SCENE_METADATA[scene];
  return {
    ...current,
    scene,
    activeVideoId: null,
    audioChannels: { ...meta.defaultAudioMix },
  };
}

export function applyVideoPreset(
  current: ScreensaverSettings,
  videoId: string | null
): ScreensaverSettings {
  if (!videoId) {
    return {
      ...current,
      activeVideoId: null,
    };
  }
  const found = current.videos.find((v) => v.id === videoId);
  if (!found) {
    return {
      ...current,
      activeVideoId: videoId,
    };
  }
  const targetScene: SceneId = isValidSceneId(found.type) ? found.type : current.scene;
  const meta = SCENE_METADATA[targetScene];
  return {
    ...current,
    scene: targetScene,
    activeVideoId: found.id,
    audioChannels: { ...meta.defaultAudioMix },
  };
}
