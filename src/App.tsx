import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CAMERA_VIEW_MODES,
  CameraViewMode,
  ColorTemp,
  SCENE_IDS,
  SCENE_METADATA,
  SceneId,
  ScreensaverSettings,
  SupportedLang,
  TRANSLATIONS,
  computePixelOrbit,
  formatClockTime,
  formatLocalizedDate,
  isValidSceneId,
  sanitizeSettings,
} from './utils/screensaverLogic';
import {
  MyPCInfo,
  applyScenePreset,
  applyVideoPreset,
  getMyPC,
  loadInitialSettings,
  persistSettings,
  syncPauseMenuItems,
} from './utils/mypcBridge';
import {
  NavDirection,
  SpatialRect,
  applyTvFocusToElement,
  cycleSelectElement,
  findNextSpatialTarget,
  queryVisibleFocusableElements,
  stepRangeOrNumberInput,
} from './utils/tvNavigation';
import { AcousticAudioEngine } from './utils/acousticAudioEngine';
import { FIRE_EFFECT_STYLES } from './utils/openSourceFireVfx';
import { ScreensaverCanvas } from './components/ScreensaverCanvas';
import { CinematicFireplaceWebGL } from './components/CinematicFireplaceWebGL';
import { VideoBackdropPlayer } from './components/VideoBackdropPlayer';
import { SettingsModal, SettingsTabId } from './components/SettingsModal';
import {
  Flame,
  CloudRain,
  Sparkles,
  Waves,
  Flower2,
  Volume2,
  VolumeX,
  Settings,
  EyeOff,
  Eye,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  HeartPulse,
  Film,
  Frame,
} from 'lucide-react';

const SCENE_ICONS: Record<SceneId, React.FC<{ className?: string }>> = {
  hearth: Flame,
  cinematic: Flame,
  rain: CloudRain,
  aurora: Sparkles,
  ocean: Waves,
  zen: Flower2,
};

const SETTINGS_TABS: SettingsTabId[] = ['visuals', 'videos', 'audio', 'display', 'mypc'];

export default function App() {
  const initialRef = useRef<{ settings: ScreensaverSettings; pureView: boolean } | null>(null);
  if (!initialRef.current) {
    initialRef.current = loadInitialSettings();
  }

  const [settings, setSettings] = useState<ScreensaverSettings>(initialRef.current.settings);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(
    initialRef.current.settings.mode === 'settings'
  );
  const [isPureView, setIsPureView] = useState<boolean>(initialRef.current.pureView);
  const [activeTab, setActiveTab] = useState<SettingsTabId>(
    initialRef.current.settings.lastSettingsTab || 'visuals'
  );
  const [lang, setLang] = useState<SupportedLang>('en');
  const [hardwareTier, setHardwareTier] = useState<'low' | 'mid' | 'high'>('high');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [heartRateBpm, setHeartRateBpm] = useState<number | null>(null);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [orbitOffset, setOrbitOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const settingsRef = useRef<ScreensaverSettings>(settings);
  const isSettingsOpenRef = useRef<boolean>(isSettingsOpen);
  const isPureViewRef = useRef<boolean>(isPureView);
  const activeTabRef = useRef<SettingsTabId>(activeTab);
  const audioEngineRef = useRef<AcousticAudioEngine | null>(null);
  const gamepadAxesRef = useRef<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const lastActivityTsRef = useRef<number>(performance.now());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    if (settingsRef.current.lastSettingsTab !== activeTab) {
      const updated = { ...settingsRef.current, lastSettingsTab: activeTab };
      settingsRef.current = updated;
      setSettings(updated);
      persistSettings(updated);
    }
  }, [activeTab]);

  useEffect(() => {
    isSettingsOpenRef.current = isSettingsOpen;
    document.body.dataset.state = isSettingsOpen
      ? 'settings'
      : isPureView
      ? 'pure'
      : 'playing';
  }, [isSettingsOpen, isPureView]);

  useEffect(() => {
    isPureViewRef.current = isPureView;
    if (settingsRef.current.pureView !== isPureView) {
      const updated = { ...settingsRef.current, pureView: isPureView };
      settingsRef.current = updated;
      setSettings(updated);
      persistSettings(updated);
    }
  }, [isPureView]);

  // Ensure a valid 3-meter-visible TV focus target is always highlighted whenever view/tab changes
  useEffect(() => {
    if (isPureView && !isSettingsOpen) {
      applyTvFocusToElement(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const scopeSelector = isSettingsOpen
        ? '[data-tv-scope="settings-modal"]'
        : '[data-tv-scope="main-hud"]';
      const scope = document.querySelector<HTMLElement>(scopeSelector);
      if (!scope) return;

      const existing = scope.querySelector<HTMLElement>('[data-tv-focused="true"]');
      if (existing) {
        const rect = existing.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return;
      }

      if (isSettingsOpen) {
        const selectedTab = scope.querySelector<HTMLElement>(
          'button[role="tab"][aria-selected="true"]'
        );
        const focusables = queryVisibleFocusableElements(scope);
        applyTvFocusToElement(selectedTab || focusables[0] || null, false);
      } else {
        const defaultHudBtn =
          scope.querySelector<HTMLElement>('[data-tv-default-hud="true"]') ||
          queryVisibleFocusableElements(scope)[0] ||
          null;
        applyTvFocusToElement(defaultHudBtn, false);
      }
    }, 30);

    return () => window.clearTimeout(timer);
  }, [isSettingsOpen, activeTab, isPureView, settings.scene, settings.activeVideoId]);

  const handleUpdateSettings = useCallback((next: ScreensaverSettings) => {
    setSettings(next);
    settingsRef.current = next;
    persistSettings(next);
    audioEngineRef.current?.unlockOnGesture();
    audioEngineRef.current?.applySettings(next);
  }, []);

  const handleSelectScene = useCallback(
    (sceneId: SceneId) => {
      const updated = applyScenePreset(settingsRef.current, sceneId);
      handleUpdateSettings(updated);
      const mypc = getMyPC();
      const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
      mypc.announce(t.scenes[sceneId].name);
    },
    [handleUpdateSettings, lang]
  );

  const cycleScene = useCallback(
    (delta: number) => {
      const currIdx = SCENE_IDS.indexOf(settingsRef.current.scene);
      const nextIdx = (currIdx + delta + SCENE_IDS.length) % SCENE_IDS.length;
      handleSelectScene(SCENE_IDS[nextIdx]);
    },
    [handleSelectScene]
  );

  const cycleSettingsTab = useCallback((delta: number) => {
    setActiveTab((curr) => {
      const i = SETTINGS_TABS.indexOf(curr);
      const nextTab = SETTINGS_TABS[(i + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length];
      window.setTimeout(() => {
        const scope = document.querySelector<HTMLElement>('[data-tv-scope="settings-modal"]');
        const tabBtn = scope?.querySelector<HTMLElement>(
          'button[role="tab"][aria-selected="true"]'
        );
        if (tabBtn) applyTvFocusToElement(tabBtn, false);
      }, 25);
      return nextTab;
    });
  }, []);

  const adjustFireIntensity = useCallback(
    (delta: number) => {
      const curr = settingsRef.current;
      if (curr.scene === 'rain') {
        const nextRain = Math.max(
          0.1,
          Math.min(1.5, Math.round((curr.rainIntensity + delta) * 20) / 20)
        );
        handleUpdateSettings({ ...curr, rainIntensity: nextRain });
      } else {
        const nextFire = Math.max(
          0.2,
          Math.min(1.5, Math.round((curr.fireIntensity + delta) * 20) / 20)
        );
        handleUpdateSettings({ ...curr, fireIntensity: nextFire });
      }
    },
    [handleUpdateSettings]
  );

  const selectViewMode = useCallback(
    (modeId: CameraViewMode) => {
      const curr = settingsRef.current;
      const spec = CAMERA_VIEW_MODES.find((m) => m.id === modeId) || CAMERA_VIEW_MODES[0];
      handleUpdateSettings({
        ...curr,
        viewMode: spec.id,
        cameraZoom: spec.equivZoom,
      });
      getMyPC().announce(`View: ${spec.label}`);
    },
    [handleUpdateSettings]
  );

  const cycleViewMode = useCallback(() => {
    const curr = settingsRef.current;
    const idx = CAMERA_VIEW_MODES.findIndex((m) => m.id === (curr.viewMode || 'wide'));
    const nextSpec = CAMERA_VIEW_MODES[(idx + 1) % CAMERA_VIEW_MODES.length];
    selectViewMode(nextSpec.id);
  }, [selectViewMode]);

  const cycleFireEffectStyle = useCallback(() => {
    const curr = settingsRef.current;
    const idx = FIRE_EFFECT_STYLES.findIndex((s) => s.id === curr.fireEffectStyle);
    const nextStyle = FIRE_EFFECT_STYLES[(idx + 1) % FIRE_EFFECT_STYLES.length];
    handleUpdateSettings({ ...curr, fireEffectStyle: nextStyle.id });
    getMyPC().announce(nextStyle.name);
  }, [handleUpdateSettings]);

  /**
   * Executes 2D spatial TV navigation (`up`, `down`, `left`, `right`) or `confirm` (OK / Enter / B)
   * across either the open Settings Modal or the Main Screensaver HUD.
   */
  const executeSpatialNavigation = useCallback(
    (action: NavDirection | 'confirm', repeat: boolean) => {
      const scopeSelector = isSettingsOpenRef.current
        ? '[data-tv-scope="settings-modal"]'
        : '[data-tv-scope="main-hud"]';
      const scope = document.querySelector<HTMLElement>(scopeSelector);
      if (!scope) return;

      const focusables = queryVisibleFocusableElements(scope);
      if (focusables.length === 0) return;

      let currentEl = scope.querySelector<HTMLElement>('[data-tv-focused="true"]');
      if (!currentEl || !focusables.includes(currentEl)) {
        currentEl =
          scope.querySelector<HTMLElement>('button[role="tab"][aria-selected="true"]') ||
          scope.querySelector<HTMLElement>('[data-tv-default-hud="true"]') ||
          focusables[0];
        applyTvFocusToElement(currentEl, true);
        if (action !== 'confirm') return;
      }

      const tag = currentEl.tagName.toLowerCase();
      const inputType = (currentEl as HTMLInputElement).type?.toLowerCase();

      // Handle OK / Enter / Space / Gamepad B ('confirm')
      if (action === 'confirm') {
        if (repeat) return; // Do not rapid-fire click when holding OK

        if (tag === 'select') {
          const newLabel = cycleSelectElement(currentEl as HTMLSelectElement, 1);
          getMyPC().announce(newLabel);
          return;
        }

        if (tag === 'input' && (inputType === 'range' || inputType === 'number')) {
          const inp = currentEl as HTMLInputElement;
          const max = inp.max !== '' ? parseFloat(inp.max) : 100;
          const min = inp.min !== '' ? parseFloat(inp.min) : 0;
          const cur = parseFloat(inp.value);
          if (cur >= max) {
            inp.value = String(min);
            stepRangeOrNumberInput(inp, 1);
          } else {
            stepRangeOrNumberInput(inp, 1);
          }
          return;
        }

        if (tag === 'input' && inputType === 'text') {
          const inp = currentEl as HTMLInputElement;
          try {
            inp.focus();
          } catch {
            // ignore
          }
          // Also open MyPC Phone Text bridge (API level 13) if available
          const mypc = getMyPC();
          if (mypc.text?.open) {
            mypc.text.open({
              value: inp.value,
              kind: inp.id.includes('uri') ? 'url' : 'text',
              label: inp.getAttribute('placeholder') || 'Video Input',
              max: 240,
              onInput(val: string) {
                const setter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  'value'
                )?.set;
                if (setter) setter.call(inp, val);
                else inp.value = val;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
              },
              onSend() {
                mypc.text?.close();
              },
            });
          }
          return;
        }

        currentEl.click();
        return;
      }

      // Handle Directional Actions ('left' | 'right' | 'up' | 'down')
      // 1. If focused on a range slider or number input, Left/Right directly adjusts the value!
      if (
        tag === 'input' &&
        (inputType === 'range' || inputType === 'number') &&
        (action === 'left' || action === 'right')
      ) {
        stepRangeOrNumberInput(currentEl as HTMLInputElement, action === 'left' ? -1 : 1);
        return;
      }

      // 2. If focused on a Settings Tab button, Left/Right cycles tabs immediately
      if (
        currentEl.getAttribute('role') === 'tab' &&
        (action === 'left' || action === 'right')
      ) {
        cycleSettingsTab(action === 'left' ? -1 : 1);
        return;
      }

      // 3. General 2D Spatial Nearest-Neighbor Lookup
      const rects: SpatialRect[] = [];
      const idToEl = new Map<string, HTMLElement>();
      let currentRect: SpatialRect | null = null;

      for (let i = 0; i < focusables.length; i++) {
        const el = focusables[i];
        const r = el.getBoundingClientRect();
        const id = `tv_node_${i}`;
        const sr: SpatialRect = {
          id,
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
        };
        rects.push(sr);
        idToEl.set(id, el);
        if (el === currentEl) {
          currentRect = sr;
        }
      }

      if (!currentRect) return;

      const nextId = findNextSpatialTarget(currentRect, rects, action);
      if (!nextId) return;

      const nextEl = idToEl.get(nextId) || null;
      if (nextEl) {
        applyTvFocusToElement(nextEl, true);
        // If navigating onto a Settings Tab button from another tab, activate it
        if (
          currentEl.getAttribute('role') === 'tab' &&
          nextEl.getAttribute('role') === 'tab'
        ) {
          nextEl.click();
        }
      }
    },
    [cycleSettingsTab]
  );

  // Initialize My PC SDK v1 once on mount
  useEffect(() => {
    const mypc = getMyPC();
    const audioEngine = new AcousticAudioEngine();
    audioEngineRef.current = audioEngine;

    mypc.init({
      ownMenu: true,
      pad: true,
      onInit(info: MyPCInfo) {
        const detectedLang: SupportedLang =
          info.lang === 'fr' || info.lang === 'es' || info.lang === 'ar' ? info.lang : 'en';
        setLang(detectedLang);
        if (info.quality?.tier) {
          setHardwareTier(info.quality.tier);
        }
        syncPauseMenuItems(detectedLang);

        // Reload merged settings now that MyPC.app_config and MyPC.load are initialized
        const loaded = loadInitialSettings();
        setSettings(loaded.settings);
        settingsRef.current = loaded.settings;
        persistSettings(loaded.settings);
        if (loaded.settings.lastSettingsTab) {
          setActiveTab(loaded.settings.lastSettingsTab);
        }
        if (loaded.settings.mode === 'settings') {
          setIsSettingsOpen(true);
        }
        if (loaded.pureView) {
          setIsPureView(true);
        }

        mypc.progress(1);
        mypc.ready();
      },
      onStart() {
        setIsPaused(false);
        const info = mypc.info?.();
        audioEngine.start(settingsRef.current, info?.volume);
      },
      onPause() {
        setIsPaused(true);
        audioEngine.pause();
      },
      onResume() {
        setIsPaused(false);
        audioEngine.resume();
      },
      onDestroy() {
        setIsPaused(true);
        audioEngine.destroy();
      },
      onVolume(v: { music: number; sfx: number }) {
        audioEngine.setMyPCVolume(v);
      },
      onLaunch(launch: { path?: string }) {
        if (!launch?.path) return;
        const clean = launch.path.replace(/^[/?#]+/, '').trim();
        if (clean === 'settings') {
          setIsSettingsOpen(true);
          setIsPureView(false);
        } else if (clean.startsWith('video/')) {
          const targetVid = clean.slice('video/'.length).trim();
          if (targetVid) {
            handleUpdateSettings(applyVideoPreset(settingsRef.current, targetVid));
          }
        } else if (clean.startsWith('scene/')) {
          const target = clean.slice('scene/'.length) as SceneId;
          if (isValidSceneId(target)) {
            handleSelectScene(target);
          }
        }
      },
      onMenu(id: string) {
        if (id === 'settings') {
          setIsSettingsOpen(true);
          setIsPureView(false);
        } else if (id === 'pure') {
          setIsPureView((p) => !p);
          setIsSettingsOpen(false);
        } else if (isValidSceneId(id)) {
          handleSelectScene(id);
        }
      },
      onInput(action: string, pressed: boolean, repeat: boolean) {
        if (!pressed) return;
        audioEngine.unlockOnGesture();
        lastActivityTsRef.current = performance.now();

        // Note: On TV Remote, OK sends both 'confirm' and 'jump'. Ignore 'jump' to prevent double click.
        if (action === 'jump') return;

        // 1. Gamepad Start / Select ('menu') toggles Settings from anywhere
        if (action === 'menu') {
          if (!repeat) {
            setIsPureView(false);
            setIsSettingsOpen((prev) => !prev);
          }
          return;
        }

        // 2. If in Pure Fullscreen View (HUD hidden and Settings closed)
        if (
          isPureViewRef.current &&
          !isSettingsOpenRef.current &&
          settingsRef.current.mode !== 'preview'
        ) {
          if (action === 'left') {
            cycleScene(-1);
          } else if (action === 'right') {
            cycleScene(1);
          } else if (action === 'up') {
            adjustFireIntensity(0.1);
          } else if (action === 'down') {
            adjustFireIntensity(-0.1);
          } else if (!repeat) {
            // Pressing OK ('confirm'), B/X/Y ('run'), or Esc/A ('cancel') wakes the HUD controls
            setIsPureView(false);
          }
          return;
        }

        // 3. Cancel (Keyboard Esc/Backspace or Gamepad A right button)
        if (action === 'cancel') {
          if (repeat) return;
          if (isSettingsOpenRef.current) {
            setIsSettingsOpen(false);
          } else {
            setIsPureView(true);
          }
          return;
        }

        // 4. Run (Keyboard Shift/X or Touch Pad X/Y)
        if (action === 'run') {
          if (repeat) return;
          if (!isSettingsOpenRef.current) {
            setIsPureView((prev) => !prev);
          }
          return;
        }

        // 5. Spatial 2D Navigation & Confirm across Settings Modal or Main HUD
        if (
          action === 'left' ||
          action === 'right' ||
          action === 'up' ||
          action === 'down' ||
          action === 'confirm'
        ) {
          executeSpatialNavigation(action, Boolean(repeat));
        }
      },
    });

    // Gamepad-First API (MyPC.gamepad Section 5 — up to 4 controllers pad0..pad3)
    if (mypc.gamepad) {
      mypc.gamepad.on(
        'button',
        (btnIndex: number, pressed: boolean, value: number, _dev: string, name: string) => {
          if (!pressed) return;
          audioEngine.unlockOnGesture();
          lastActivityTsRef.current = performance.now();

          if (name === 'LB' || btnIndex === 4) {
            if (isSettingsOpenRef.current) {
              cycleSettingsTab(-1);
            } else {
              cycleScene(-1);
            }
          } else if (name === 'RB' || btnIndex === 5) {
            if (isSettingsOpenRef.current) {
              cycleSettingsTab(1);
            } else {
              cycleScene(1);
            }
          } else if (name === 'LT' || btnIndex === 6) {
            adjustFireIntensity(-0.1 * Math.max(0.5, value || 1));
          } else if (name === 'RT' || btnIndex === 7) {
            adjustFireIntensity(0.1 * Math.max(0.5, value || 1));
          } else if (name === 'Y' || btnIndex === 3) {
            setIsSettingsOpen(false);
            setIsPureView((prev) => !prev);
          } else if (name === 'X' || btnIndex === 2) {
            const curr = settingsRef.current;
            handleUpdateSettings({ ...curr, masterAudio: !curr.masterAudio });
          } else if (name === 'L3' || btnIndex === 10) {
            const temps: ColorTemp[] = ['natural', 'warm2700k', 'candle2000k', 'midnight'];
            const curr = settingsRef.current;
            const nextTemp = temps[(temps.indexOf(curr.colorTemp) + 1) % temps.length];
            handleUpdateSettings({ ...curr, colorTemp: nextTemp });
          } else if (name === 'R3' || btnIndex === 11) {
            audioEngine.triggerThunderClap(1.0);
          } else if (name === 'Start' || name === 'Select' || btnIndex === 9 || btnIndex === 8) {
            setIsPureView(false);
            setIsSettingsOpen((prev) => !prev);
          }
        }
      );

      mypc.gamepad.on('axes', (axes: number[]) => {
        if (!Array.isArray(axes) || axes.length < 4) return;
        const rx = Math.abs(axes[2]) > 0.15 ? axes[2] : 0;
        const ry = Math.abs(axes[3]) > 0.15 ? axes[3] : 0;
        if (rx !== 0 || ry !== 0) {
          lastActivityTsRef.current = performance.now();
        }
        gamepadAxesRef.current = { rx, ry };
      });
    }

    // Optional Bluetooth Heart-Rate Relaxation Badge on TV (MyPC.bluetooth Section 13)
    if (mypc.bluetooth) {
      mypc.bluetooth.on('reading', (r: { bpm?: number }) => {
        if (r && typeof r.bpm === 'number' && r.bpm > 0) {
          setHeartRateBpm(r.bpm);
        }
      });
    }

    // Expose programmatic API & postMessage bridge for MyPC Screensaver Settings Page
    window.MyPCScreensaver = {
      getSettings: () => settingsRef.current,
      updateSettings: (partial) => {
        const merged = sanitizeSettings(settingsRef.current, partial as Record<string, unknown>);
        handleUpdateSettings(merged);
      },
      setScene: (sceneId) => handleSelectScene(sceneId),
      openSettings: () => {
        setIsPureView(false);
        setIsSettingsOpen(true);
      },
      closeSettings: () => setIsSettingsOpen(false),
    };

    const handlePostMessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== 'object' || d.mypc_screensaver !== 1) return;
      if (d.type === 'applySettings' && d.settings) {
        const merged = sanitizeSettings(settingsRef.current, d.settings);
        handleUpdateSettings(merged);
      } else if (d.type === 'setScene' && isValidSceneId(d.scene)) {
        handleSelectScene(d.scene);
      } else if (d.type === 'openSettings') {
        setIsPureView(false);
        setIsSettingsOpen(true);
      } else if (d.type === 'closeSettings') {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('message', handlePostMessage);

    return () => {
      window.removeEventListener('message', handlePostMessage);
      audioEngine.destroy();
    };
  }, [
    adjustFireIntensity,
    cycleScene,
    cycleSettingsTab,
    executeSpatialNavigation,
    handleSelectScene,
    handleUpdateSettings,
  ]);

  // Clock, OLED Burn-In Pixel Orbit, HUD Auto-Hide & Sleep Timer tick
  // Optimized for multi-hour Smart TV runs: only triggers React state updates when clock text or 0.5px orbit actually changes.
  useEffect(() => {
    const startTs = performance.now();
    const timer = window.setInterval(() => {
      if (isPaused) return;
      const nowPerf = performance.now();
      const st = settingsRef.current;

      const candidateDate = new Date();
      setNowDate((prevDate) => {
        if (st.showSeconds) return candidateDate;
        if (
          prevDate.getMinutes() !== candidateDate.getMinutes() ||
          prevDate.getHours() !== candidateDate.getHours()
        ) {
          return candidateDate;
        }
        return prevDate;
      });

      const rawOrbit = computePixelOrbit(nowPerf, st.burnInProtection, st.pixelOrbitRange);
      const qx = Math.round(rawOrbit.x * 2) / 2;
      const qy = Math.round(rawOrbit.y * 2) / 2;
      setOrbitOffset((prev) => {
        if (Math.abs(prev.x - qx) >= 0.5 || Math.abs(prev.y - qy) >= 0.5) {
          return { x: qx, y: qy };
        }
        return prev;
      });

      // Auto-hide HUD into Pure View after hudAutoHideSec of no remote/gamepad/mouse activity
      if (
        st.hudAutoHideSec > 0 &&
        !isSettingsOpenRef.current &&
        !isPureViewRef.current &&
        st.mode !== 'settings'
      ) {
        const idleSec = (nowPerf - lastActivityTsRef.current) / 1000;
        if (idleSec >= st.hudAutoHideSec) {
          setIsPureView(true);
        }
      }

      // Sleep timer check
      if (st.sleepTimerMinutes > 0) {
        const elapsedMin = (nowPerf - startTs) / 60000;
        if (elapsedMin >= st.sleepTimerMinutes) {
          getMyPC().exit();
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPaused]);

  // Scene Auto-Cycle Carousel
  useEffect(() => {
    if (settings.autoCycleMinutes <= 0 || isPaused) return;
    const ms = settings.autoCycleMinutes * 60 * 1000;
    const cycleTimer = window.setInterval(() => {
      cycleScene(1);
    }, ms);
    return () => window.clearInterval(cycleTimer);
  }, [settings.autoCycleMinutes, isPaused, cycleScene]);

  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const currentSceneMeta = SCENE_METADATA[settings.scene];
  const clockFormatted = formatClockTime(nowDate, settings.clockFormat, settings.showSeconds);
  const dateFormatted = formatLocalizedDate(nowDate, lang);
  const activeVideo = settings.activeVideoId
    ? settings.videos.find(
        (v) => v.id === settings.activeVideoId || v.uri === settings.activeVideoId
      ) || null
    : null;

  return (
    <main
      aria-label={t.appName}
      className="relative w-screen h-screen overflow-hidden bg-black select-none"
      onClick={() => {
        lastActivityTsRef.current = performance.now();
        audioEngineRef.current?.unlockOnGesture();
      }}
    >
      {/* 1. Full-Viewport Zero-Allocation 60Hz Ambient Canvas OR WebGL2 Cinematic Fireplace */}
      {settings.scene === 'cinematic' && !activeVideo ? (
        <CinematicFireplaceWebGL
          settings={settings}
          hardwareTier={hardwareTier}
          isPaused={isPaused}
          gamepadAxesRef={gamepadAxesRef}
          orbitOffset={orbitOffset}
          onCanvasInteract={() => {
            lastActivityTsRef.current = performance.now();
            audioEngineRef.current?.unlockOnGesture();
            if (isPureView && settings.mode !== 'preview') {
              setIsPureView(false);
            }
          }}
        />
      ) : (
        <ScreensaverCanvas
          settings={settings}
          hardwareTier={hardwareTier}
          isPaused={isPaused}
          gamepadAxesRef={gamepadAxesRef}
          orbitOffset={orbitOffset}
          onThunderFlash={(intensity) => audioEngineRef.current?.triggerThunderClap(intensity)}
          onCanvasInteract={() => {
            lastActivityTsRef.current = performance.now();
            audioEngineRef.current?.unlockOnGesture();
            if (isPureView && settings.mode !== 'preview') {
              setIsPureView(false);
            }
          }}
        />
      )}

      {/* 1B. Hardware-Accelerated MyPC Drive & Custom 4K Video Player Layer */}
      <VideoBackdropPlayer
        settings={settings}
        activeVideo={activeVideo}
        isPaused={isPaused}
        isPureView={isPureView}
        orbitOffset={orbitOffset}
        onVideoMetadataResolved={(videoId, patch) => {
          const nextVideos = settingsRef.current.videos.map((v) =>
            v.id === videoId ? { ...v, ...patch } : v
          );
          handleUpdateSettings({ ...settingsRef.current, videos: nextVideos });
        }}
        onOpenVideoSettings={() => {
          setActiveTab('videos');
          setIsSettingsOpen(true);
          setIsPureView(false);
        }}
        onInteract={() => {
          lastActivityTsRef.current = performance.now();
          audioEngineRef.current?.unlockOnGesture();
          if (isPureView && settings.mode !== 'preview') {
            setIsPureView(false);
          }
        }}
      />

      {/* 2. Ambient 10-Foot TV Clock & Scene Telemetry (Protected by OLED Pixel Orbit) */}
      {settings.showClock && !(settings.scene === 'cinematic' && isPureView) && (
        <div
          style={{
            transform: `translate3d(${orbitOffset.x}px, ${orbitOffset.y}px, 0)`,
          }}
          className="fixed top-7 left-8 z-20 pointer-events-none"
        >
          <div className="flex items-baseline gap-2.5">
            <span
              data-testid="ambient-clock"
              className="text-5xl md:text-7xl font-light tracking-tight text-stone-100 tabular-nums"
              style={{
                fontFamily: 'Outfit, sans-serif',
                textShadow: '0 4px 24px rgba(0, 0, 0, 0.85)',
              }}
            >
              {clockFormatted.time}
            </span>
            {clockFormatted.period && (
              <span className="text-lg md:text-2xl font-medium text-amber-400">
                {clockFormatted.period}
              </span>
            )}
          </div>

          <div
            className="flex flex-wrap items-center gap-2 mt-1 text-xs md:text-sm font-medium text-stone-300"
            style={{ textShadow: '0 2px 10px rgba(0, 0, 0, 0.9)' }}
          >
            {settings.showDate && <span>{dateFormatted}</span>}
            {settings.showDate && settings.showAmbientBadge && <span aria-hidden="true">·</span>}
            {settings.showAmbientBadge && (
              <span className="text-amber-300/95">
                {activeVideo
                  ? `${activeVideo.title} · ${currentSceneMeta.tempLabel}`
                  : currentSceneMeta.tempLabel}
              </span>
            )}
            {settings.burnInProtection && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-400/90">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>OLED Orbit</span>
                </span>
              </>
            )}
            {heartRateBpm && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-rose-400 font-mono">
                  <HeartPulse className="w-3.5 h-3.5" />
                  <span>{heartRateBpm} BPM</span>
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 3 & 5. Main Stage Interactive HUD Scope (TV Remote D-Pad + OK / Gamepad / Keyboard) */}
      <div data-tv-scope="main-hud">
        {/* 3. Top-Right Quick Utility Actions (Hidden in Pure View / Preview Mode) */}
        {!isPureView && settings.mode !== 'preview' && (
          <div
            style={{
              transform: `translate3d(${-orbitOffset.x * 0.5}px, ${orbitOffset.y * 0.5}px, 0)`,
            }}
            className="fixed top-7 right-8 z-20 flex items-center gap-2.5"
          >
            {/* Quick Videos & MyPC Drive Button */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('videos');
                setIsSettingsOpen(true);
              }}
              aria-label={t.tabs.videos}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold border border-stone-700/80 text-stone-100 hover:border-amber-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 transition-all whitespace-nowrap shrink-0"
              style={{ backgroundColor: 'rgba(15, 12, 10, 0.85)' }}
            >
              <Film className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline">{t.tabs.videos}</span>
            </button>

            {/* Audio Mute / Unmute Button */}
            <button
              type="button"
              onClick={() =>
                handleUpdateSettings({ ...settings, masterAudio: !settings.masterAudio })
              }
              aria-label={settings.masterAudio ? t.hud.soundOn : t.hud.soundMuted}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold border border-stone-700/80 text-stone-100 hover:border-amber-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 transition-all whitespace-nowrap shrink-0"
              style={{ backgroundColor: 'rgba(15, 12, 10, 0.85)' }}
            >
              {settings.masterAudio ? (
                <Volume2 className="w-4 h-4 text-amber-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-stone-400" />
              )}
              <span className="hidden sm:inline">
                {settings.masterAudio ? t.hud.soundOn : t.hud.soundMuted}
              </span>
            </button>

            {/* Pure Screensaver View Button */}
            <button
              type="button"
              onClick={() => setIsPureView(true)}
              aria-label={t.hud.pureView}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold border border-stone-700/80 text-stone-100 hover:border-amber-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 transition-all whitespace-nowrap shrink-0"
              style={{ backgroundColor: 'rgba(15, 12, 10, 0.85)' }}
            >
              <EyeOff className="w-4 h-4 text-sky-400" />
              <span className="hidden sm:inline">{t.hud.pureView}</span>
            </button>

            {/* Open Screensaver Settings Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label={t.hud.settings}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white transition-all whitespace-nowrap shrink-0"
            >
              <Settings className="w-4 h-4" />
              <span>{t.hud.settings}</span>
            </button>
          </div>
        )}

        {/* 4. Wake-HUD Button when in Pure Screensaver Mode (hidden in Cinematic Fireplace so Pure View is 100% UI-free) */}
        {isPureView && settings.mode !== 'preview' && settings.scene !== 'cinematic' && (
          <div className="fixed bottom-5 right-6 z-20">
            <button
              type="button"
              onClick={() => setIsPureView(false)}
              aria-label="Show Screensaver Controls"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-stone-300/80 hover:text-white border border-stone-800/80 hover:border-amber-400/60 transition-opacity opacity-65 hover:opacity-100"
              style={{ backgroundColor: 'rgba(12, 10, 9, 0.72)' }}
            >
              <Eye className="w-3.5 h-3.5 text-amber-400" />
              <span>Show Controls (Press OK / B)</span>
            </button>
          </div>
        )}

        {/* 5. Streamlined Bottom Dock (Hidden in Pure View) */}
        {!isPureView && settings.mode !== 'preview' && !isSettingsOpen && (
          <div
            style={{
              transform: `translate3d(${orbitOffset.x * 0.5}px, ${-orbitOffset.y * 0.4}px, 0)`,
            }}
            className="fixed bottom-5 inset-x-6 z-20 flex flex-col items-center pointer-events-none"
          >
            <div
              className="w-full max-w-4xl rounded-2xl border border-stone-800/90 p-3 shadow-2xl pointer-events-auto"
              style={{ backgroundColor: 'rgba(12, 10, 9, 0.88)' }}
            >
              {/* Top Row: Active Scene + View Framing Mode + Fire VFX */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-stone-800/80">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => cycleScene(-1)}
                    aria-label={t.hud.prevScene}
                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h1
                      className="text-base md:text-lg font-semibold text-stone-100 leading-tight"
                      style={{ fontFamily: 'Outfit, sans-serif' }}
                    >
                      {activeVideo ? `${activeVideo.title} (Video)` : t.scenes[settings.scene].name}
                    </h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => cycleScene(1)}
                    aria-label={t.hud.nextScene}
                    className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Live Controls: Camera Framing Mode (Wide / Fit / Hearth / Logs) & Fire VFX */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-300">
                  {/* 4-Mode Camera Framing Selector (Wide / Fit / Hearth / Logs) */}
                  <div
                    role="group"
                    aria-label={t.controls.cameraZoom}
                    className="flex items-center gap-1 bg-stone-900/90 p-1 rounded-xl border border-stone-800"
                  >
                    <button
                      type="button"
                      data-testid="hud-view-mode-cycle"
                      onClick={cycleViewMode}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-amber-400 font-semibold hover:bg-stone-800"
                      title="Cycle Camera Framing Mode"
                    >
                      <Frame className="w-3.5 h-3.5" />
                      <span>View:</span>
                    </button>
                    {CAMERA_VIEW_MODES.map((vm) => {
                      const isVmActive = (settings.viewMode || 'wide') === vm.id;
                      return (
                        <button
                          key={vm.id}
                          type="button"
                          data-testid={`hud-view-${vm.id}`}
                          onClick={() => selectViewMode(vm.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            isVmActive
                              ? 'bg-amber-500 text-stone-950'
                              : 'text-stone-300 hover:bg-stone-800 hover:text-white'
                          }`}
                        >
                          {vm.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Fire VFX Style Quick-Switcher when on a fireplace scene */}
                  {(settings.scene === 'hearth' || settings.scene === 'cinematic') && (
                    <button
                      type="button"
                      data-testid="hud-fire-vfx-cycle"
                      onClick={cycleFireEffectStyle}
                      title="Switch Open-Source & Game Fire VFX Engine"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-semibold transition-colors"
                    >
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {FIRE_EFFECT_STYLES.find((s) => s.id === settings.fireEffectStyle)?.badge ||
                          'Game Flipbook VFX'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* 6 Scene Switcher Buttons */}
              <nav
                aria-label="Ambient Scenes"
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2"
              >
                {SCENE_IDS.map((sceneId) => {
                  const Icon = SCENE_ICONS[sceneId];
                  const isSelected = settings.scene === sceneId && !activeVideo;
                  const sceneInfo = t.scenes[sceneId];
                  return (
                    <button
                      key={sceneId}
                      type="button"
                      data-tv-default-hud={isSelected ? 'true' : undefined}
                      onClick={() => handleSelectScene(sceneId)}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 ${
                        isSelected
                          ? 'bg-amber-500 text-stone-950 shadow-md'
                          : 'bg-stone-900/90 text-stone-300 hover:bg-stone-800 hover:text-white border border-stone-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{sceneInfo.badge}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Quick Custom Video Pills if videos are configured */}
              {settings.videos.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-stone-800/70">
                  <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                    <Film className="w-3.5 h-3.5" />
                    <span>Videos:</span>
                  </span>
                  {settings.videos.map((v) => {
                    const isVidSelected = settings.activeVideoId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        data-tv-default-hud={isVidSelected ? 'true' : undefined}
                        onClick={() =>
                          handleUpdateSettings(
                            applyVideoPreset(settings, isVidSelected ? null : v.id)
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          isVidSelected
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                        }`}
                      >
                        {v.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. Full-Featured Screensaver Settings Modal / Page */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          lang={lang}
          hardwareTier={hardwareTier}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onUpdateSettings={handleUpdateSettings}
          onSelectScene={handleSelectScene}
          onClose={() => setIsSettingsOpen(false)}
          onEnterPureView={() => {
            setIsSettingsOpen(false);
            setIsPureView(true);
          }}
          onTriggerThunder={() => {
            audioEngineRef.current?.unlockOnGesture();
            audioEngineRef.current?.triggerThunderClap(1.0);
          }}
        />
      )}
    </main>
  );
}
