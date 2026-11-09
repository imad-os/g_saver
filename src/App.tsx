import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  MyPCPadInfo,
  applyScenePreset,
  applyVideoPreset,
  getMyPC,
  loadInitialSettings,
  persistSettings,
  syncPauseMenuItems,
} from './utils/mypcBridge';
import { AcousticAudioEngine } from './utils/acousticAudioEngine';
import { ScreensaverCanvas } from './components/ScreensaverCanvas';
import { VideoBackdropPlayer } from './components/VideoBackdropPlayer';
import { SettingsModal, SettingsTabId } from './components/SettingsModal';
import {
  Flame,
  CloudRain,
  Sparkles,
  Waves,
  Flower2,
  Compass,
  Volume2,
  VolumeX,
  Settings,
  EyeOff,
  Eye,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  ShieldCheck,
  HeartPulse,
  Film,
} from 'lucide-react';

const SCENE_ICONS: Record<SceneId, React.FC<{ className?: string }>> = {
  hearth: Flame,
  campfire: Compass,
  rain: CloudRain,
  aurora: Sparkles,
  ocean: Waves,
  zen: Flower2,
};

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
  const [activeTab, setActiveTab] = useState<SettingsTabId>('visuals');
  const [lang, setLang] = useState<SupportedLang>('en');
  const [hardwareTier, setHardwareTier] = useState<'low' | 'mid' | 'high'>('high');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [connectedPads, setConnectedPads] = useState<MyPCPadInfo[]>([]);
  const [heartRateBpm, setHeartRateBpm] = useState<number | null>(null);
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [orbitOffset, setOrbitOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const settingsRef = useRef<ScreensaverSettings>(settings);
  const isSettingsOpenRef = useRef<boolean>(isSettingsOpen);
  const isPureViewRef = useRef<boolean>(isPureView);
  const audioEngineRef = useRef<AcousticAudioEngine | null>(null);
  const gamepadAxesRef = useRef<{ rx: number; ry: number }>({ rx: 0, ry: 0 });

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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
  }, [isPureView]);

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

  const adjustFireIntensity = useCallback(
    (delta: number) => {
      const curr = settingsRef.current;
      if (curr.scene === 'rain') {
        const nextRain = Math.max(0.1, Math.min(1.5, Math.round((curr.rainIntensity + delta) * 20) / 20));
        handleUpdateSettings({ ...curr, rainIntensity: nextRain });
      } else {
        const nextFire = Math.max(0.2, Math.min(1.5, Math.round((curr.fireIntensity + delta) * 20) / 20));
        handleUpdateSettings({ ...curr, fireIntensity: nextFire });
      }
    },
    [handleUpdateSettings]
  );

  // Initialize My PC SDK v1 once on mount
  useEffect(() => {
    const mypc = getMyPC();
    const audioEngine = new AcousticAudioEngine();
    audioEngineRef.current = audioEngine;

    mypc.init({
      ownMenu: true,
      pad: false,
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
      onInput(action: string, pressed: boolean) {
        if (!pressed) return;
        audioEngine.unlockOnGesture();

        // If in Pure Screensaver View, any action wakes the HUD
        if (isPureViewRef.current && settingsRef.current.mode !== 'preview') {
          setIsPureView(false);
          return;
        }

        if (action === 'menu') {
          setIsSettingsOpen((prev) => !prev);
          return;
        }

        if (isSettingsOpenRef.current) {
          const tabs: SettingsTabId[] = ['visuals', 'videos', 'audio', 'display', 'mypc'];
          if (action === 'cancel') {
            setIsSettingsOpen(false);
          } else if (action === 'left') {
            setActiveTab((curr) => {
              const i = tabs.indexOf(curr);
              return tabs[(i - 1 + tabs.length) % tabs.length];
            });
          } else if (action === 'right') {
            setActiveTab((curr) => {
              const i = tabs.indexOf(curr);
              return tabs[(i + 1) % tabs.length];
            });
          }
          return;
        }

        // Main Screensaver Stage TV Remote / SDK Action Mapping
        if (action === 'left') {
          cycleScene(-1);
        } else if (action === 'right') {
          cycleScene(1);
        } else if (action === 'up') {
          adjustFireIntensity(0.1);
        } else if (action === 'down') {
          adjustFireIntensity(-0.1);
        } else if (action === 'confirm') {
          setIsSettingsOpen(true);
        } else if (action === 'run') {
          setIsPureView((prev) => !prev);
        } else if (action === 'cancel') {
          setIsPureView(true);
        }
      },
    });

    // Gamepad-First API (MyPC.gamepad Section 5)
    if (mypc.gamepad) {
      mypc.gamepad.on('pads', (list: MyPCPadInfo[]) => {
        setConnectedPads(Array.isArray(list) ? [...list] : []);
      });

      mypc.gamepad.on(
        'button',
        (btnIndex: number, pressed: boolean, _value: number, _dev: string, name: string) => {
          if (!pressed) return;
          audioEngine.unlockOnGesture();

          if (name === 'LB' || btnIndex === 4) {
            cycleScene(-1);
          } else if (name === 'RB' || btnIndex === 5) {
            cycleScene(1);
          } else if (name === 'Y' || btnIndex === 3) {
            setIsPureView((prev) => !prev);
          } else if (name === 'X' || btnIndex === 2) {
            const curr = settingsRef.current;
            handleUpdateSettings({ ...curr, masterAudio: !curr.masterAudio });
          } else if (name === 'Start' || name === 'Select' || btnIndex === 9 || btnIndex === 8) {
            setIsSettingsOpen((prev) => !prev);
          }
        }
      );

      mypc.gamepad.on('axes', (axes: number[]) => {
        if (!Array.isArray(axes) || axes.length < 4) return;
        const rx = Math.abs(axes[2]) > 0.15 ? axes[2] : 0;
        const ry = Math.abs(axes[3]) > 0.15 ? axes[3] : 0;
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
  }, [adjustFireIntensity, cycleScene, handleSelectScene, handleUpdateSettings]);

  // Clock, OLED Burn-In Pixel Orbit, Auto-Cycle & Sleep Timer tick
  useEffect(() => {
    const startTs = performance.now();
    const timer = window.setInterval(() => {
      if (isPaused) return;
      setNowDate(new Date());
      const st = settingsRef.current;
      const orbit = computePixelOrbit(
        performance.now(),
        st.burnInProtection,
        st.pixelOrbitRange
      );
      setOrbitOffset(orbit);

      // Sleep timer check
      if (st.sleepTimerMinutes > 0) {
        const elapsedMin = (performance.now() - startTs) / 60000;
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
      onClick={() => audioEngineRef.current?.unlockOnGesture()}
    >
      {/* 1. Full-Viewport Zero-Allocation 60Hz Ambient Canvas */}
      <ScreensaverCanvas
        settings={settings}
        hardwareTier={hardwareTier}
        isPaused={isPaused}
        gamepadAxesRef={gamepadAxesRef}
        onThunderFlash={(intensity) => audioEngineRef.current?.triggerThunderClap(intensity)}
        onCanvasInteract={() => {
          audioEngineRef.current?.unlockOnGesture();
          if (isPureView && settings.mode !== 'preview') {
            setIsPureView(false);
          }
        }}
      />

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
          audioEngineRef.current?.unlockOnGesture();
          if (isPureView && settings.mode !== 'preview') {
            setIsPureView(false);
          }
        }}
      />

      {/* 2. Ambient 10-Foot TV Clock & Scene Telemetry (Protected by OLED Pixel Orbit) */}
      {settings.showClock && (
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

      {/* 4. Wake-HUD Button when in Pure Screensaver Mode */}
      {isPureView && settings.mode !== 'preview' && (
        <div className="fixed bottom-5 right-6 z-20">
          <button
            type="button"
            onClick={() => setIsPureView(false)}
            aria-label="Show Screensaver Controls"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium text-stone-300/80 hover:text-white border border-stone-800/80 hover:border-amber-400/60 transition-opacity opacity-65 hover:opacity-100"
            style={{ backgroundColor: 'rgba(12, 10, 9, 0.72)' }}
          >
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            <span>Show Controls</span>
          </button>
        </div>
      )}

      {/* 5. Bottom Perimeter Scene Dock & Controller Hints (Hidden in Pure View) */}
      {!isPureView && settings.mode !== 'preview' && !isSettingsOpen && (
        <div
          style={{
            transform: `translate3d(${orbitOffset.x * 0.5}px, ${-orbitOffset.y * 0.4}px, 0)`,
          }}
          className="fixed bottom-6 inset-x-6 z-20 flex flex-col items-center pointer-events-none"
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-stone-800/90 p-3 md:p-4 shadow-2xl pointer-events-auto"
            style={{ backgroundColor: 'rgba(12, 10, 9, 0.88)' }}
          >
            {/* Active Scene Title + Quick Intensity Readout */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-stone-800/80">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => cycleScene(-1)}
                  aria-label={t.hud.prevScene}
                  className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1
                    className="text-lg md:text-xl font-semibold text-stone-100"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    {activeVideo ? `${activeVideo.title} (Video)` : t.scenes[settings.scene].name}
                  </h1>
                  <p className="text-xs text-stone-400 line-clamp-1">
                    {activeVideo
                      ? `MyPC Video Stream · ${t.scenes[activeVideo.type].name}`
                      : t.scenes[settings.scene].subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cycleScene(1)}
                  aria-label={t.hud.nextScene}
                  className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Live Intensity Controls */}
              <div className="flex items-center gap-3 text-xs text-stone-300">
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-400">
                    {settings.scene === 'rain' ? 'Rainfall:' : 'Flame:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustFireIntensity(-0.1)}
                    aria-label="Decrease Intensity"
                    className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 font-mono text-stone-200"
                  >
                    -
                  </button>
                  <span className="font-mono tabular-nums text-amber-400 w-10 text-center">
                    {Math.round(
                      (settings.scene === 'rain'
                        ? settings.rainIntensity
                        : settings.fireIntensity) * 100
                    )}
                    %
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustFireIntensity(0.1)}
                    aria-label="Increase Intensity"
                    className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 font-mono text-stone-200"
                  >
                    +
                  </button>
                </div>
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
                    onClick={() => handleSelectScene(sceneId)}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 ${
                      isSelected
                        ? 'bg-amber-500 text-stone-950 shadow-md scale-[1.03]'
                        : 'bg-stone-900/90 text-stone-300 hover:bg-stone-800 hover:text-white border border-stone-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{sceneInfo.badge}</span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Custom Video Pills if videos are configured */}
            {settings.videos.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-2.5 pt-2.5 border-t border-stone-800/70">
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

            {/* Bottom Control Hint Bar (TV Remote & Gamepad First) */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-stone-800/70 text-[11px] text-stone-400">
              <span>{t.hud.remoteHint}</span>
              <span className="flex items-center gap-1.5 text-stone-300">
                <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {connectedPads.length > 0
                    ? `${connectedPads.length} Controller(s) Active · ${t.hud.gamepadHint}`
                    : t.hud.gamepadHint}
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

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
