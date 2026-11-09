import React, { useState } from 'react';
import {
  AudioMixChannels,
  ColorTemp,
  DEFAULT_SETTINGS,
  QualityTier,
  SCENE_IDS,
  SCENE_METADATA,
  SceneId,
  ScreensaverSettings,
  SupportedLang,
  TRANSLATIONS,
  buildMyPCHostUrl,
} from '../utils/screensaverLogic';
import { applyScenePreset } from '../utils/mypcBridge';
import {
  Flame,
  Volume2,
  VolumeX,
  Clock,
  ShieldCheck,
  Tv,
  Sliders,
  RotateCcw,
  Maximize2,
  Check,
  Copy,
  CloudRain,
  Sparkles,
  Code2,
  Zap,
  X,
  Film,
  HardDrive,
} from 'lucide-react';
import { VideoSettingsTab } from './VideoSettingsTab';
import { applyVideoPreset } from '../utils/mypcBridge';

export type SettingsTabId = 'visuals' | 'videos' | 'audio' | 'display' | 'mypc';

interface SettingsModalProps {
  settings: ScreensaverSettings;
  lang: SupportedLang;
  hardwareTier: 'low' | 'mid' | 'high';
  activeTab: SettingsTabId;
  setActiveTab: (tab: SettingsTabId) => void;
  onUpdateSettings: (next: ScreensaverSettings) => void;
  onSelectScene: (scene: SceneId) => void;
  onClose: () => void;
  onEnterPureView: () => void;
  onTriggerThunder: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  lang,
  hardwareTier,
  activeTab,
  setActiveTab,
  onUpdateSettings,
  onSelectScene,
  onClose,
  onEnterPureView,
  onTriggerThunder,
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const updateField = <K extends keyof ScreensaverSettings>(
    key: K,
    value: ScreensaverSettings[K]
  ) => {
    onUpdateSettings({
      ...settings,
      [key]: value,
    });
  };

  const updateChannel = (ch: keyof AudioMixChannels, value: number) => {
    onUpdateSettings({
      ...settings,
      audioChannels: {
        ...settings.audioChannels,
        [ch]: value,
      },
    });
  };

  const handleResetDefaults = () => {
    const reset = applyScenePreset(
      { ...DEFAULT_SETTINGS, mode: settings.mode, videos: settings.videos },
      settings.scene
    );
    onUpdateSettings(reset);
  };

  const copyText = (key: string, text: string) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore in sandboxed iframe if clipboard restricted
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : 'https://imad-os.github.io/g_screensaver/';

  const screensaverLaunchUrl = buildMyPCHostUrl(baseUrl, settings, 'screensaver');
  const settingsLaunchUrl = buildMyPCHostUrl(baseUrl, settings, 'settings');
  const previewLaunchUrl = buildMyPCHostUrl(baseUrl, settings, 'preview');

  const currentSceneMeta = SCENE_METADATA[settings.scene];
  const activeVideo = settings.activeVideoId
    ? settings.videos.find((v) => v.id === settings.activeVideoId) || null
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.hud.settings}
      className="fixed inset-0 z-40 flex items-center justify-center p-4 md:p-8 pointer-events-auto"
      style={{ backgroundColor: 'rgba(6, 5, 4, 0.72)' }}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl border border-stone-700/80 shadow-2xl overflow-hidden text-stone-100"
        style={{ backgroundColor: 'rgba(15, 12, 10, 0.96)' }}
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Flame className="w-6 h-6" />
            </div>
            <div>
              <h2
                className="text-xl md:text-2xl font-semibold tracking-tight text-stone-100"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {t.appName} — {t.hud.settings}
              </h2>
              <p className="text-xs md:text-sm text-stone-400">
                {activeVideo
                  ? `Video Active: ${activeVideo.title} (${t.scenes[activeVideo.type].badge})`
                  : `${t.scenes[settings.scene].name} · ${currentSceneMeta.tempLabel}`}{' '}
                · TV GPU Tier:{' '}
                <span className="font-mono text-amber-400 uppercase">{hardwareTier}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium bg-stone-800/90 hover:bg-stone-700 text-stone-200 border border-stone-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 transition-transform whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t.controls.resetDefaults}</span>
            </button>

            <button
              type="button"
              onClick={onEnterPureView}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium bg-stone-800/90 hover:bg-stone-700 text-amber-300 border border-amber-500/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 transition-transform whitespace-nowrap shrink-0"
            >
              <Maximize2 className="w-4 h-4" />
              <span>{t.controls.launchPureScreensaver}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={t.controls.closeSettings}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white transition-transform whitespace-nowrap shrink-0"
            >
              <X className="w-4 h-4" />
              <span>{t.controls.closeSettings}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Settings Categories"
          className="flex items-center gap-2 px-6 py-3 bg-stone-900/90 border-b border-stone-800 overflow-x-auto"
        >
          {(
            [
              { id: 'visuals', label: t.tabs.visuals, icon: Sliders },
              { id: 'videos', label: t.tabs.videos, icon: Film },
              { id: 'audio', label: t.tabs.audio, icon: Volume2 },
              { id: 'display', label: t.tabs.display, icon: Clock },
              { id: 'mypc', label: t.tabs.mypc, icon: Code2 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow-md scale-[1.02]'
                    : 'bg-stone-800/70 text-stone-300 hover:bg-stone-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.id === 'videos' && settings.videos.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      isActive ? 'bg-stone-950 text-amber-400' : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {settings.videos.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'videos' && (
            <VideoSettingsTab
              settings={settings}
              lang={lang}
              onUpdateSettings={onUpdateSettings}
            />
          )}

          {activeTab === 'visuals' && (
            <div className="space-y-6">
              {/* Quick MyPC Drive Video Banner & Selector inside Visuals Tab */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-stone-900/90 border border-stone-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-stone-100">
                      MyPC Drive 4K Video Screensaver Support
                    </div>
                    <p className="text-xs text-stone-400">
                      {activeVideo
                        ? `Currently playing video "${activeVideo.title}" (${activeVideo.uri}). Recommended video size: < 80 MB.`
                        : 'Stream 4K fireplace, campfire, or rain videos from MyPC Google Drive or MyPC.app_config.videos (Recommended size: < 80 MB).'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {settings.videos.map((v) => {
                    const isVidActive = settings.activeVideoId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() =>
                          onUpdateSettings(applyVideoPreset(settings, isVidActive ? null : v.id))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          isVidActive
                            ? 'bg-amber-500 text-stone-950 border-amber-400'
                            : 'bg-stone-800 text-stone-200 border-stone-700 hover:bg-stone-700'
                        }`}
                      >
                        {isVidActive ? `Playing: ${v.title}` : `Play: ${v.title}`}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setActiveTab('videos')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-stone-950 transition-colors"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Manage Videos &amp; MyPC Drive</span>
                  </button>
                </div>
              </div>

              {/* 6 Scene Selection Cards */}
              <div>
                <h3 className="text-sm font-semibold text-stone-300 mb-3">
                  Select Ambient Screensaver Scene
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {SCENE_IDS.map((sceneId) => {
                    const isSelected = settings.scene === sceneId && !settings.activeVideoId;
                    const sceneInfo = t.scenes[sceneId];
                    const meta = SCENE_METADATA[sceneId];
                    return (
                      <button
                        key={sceneId}
                        type="button"
                        onClick={() => onSelectScene(sceneId)}
                        className={`text-left p-4 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 ${
                          isSelected
                            ? 'bg-stone-800/95 border-amber-400 ring-2 ring-amber-400/50'
                            : 'bg-stone-900/80 border-stone-800 hover:border-stone-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span
                            className="text-base font-semibold text-stone-100"
                            style={{ fontFamily: 'Outfit, sans-serif' }}
                          >
                            {sceneInfo.name}
                          </span>
                          <span
                            className="text-xs font-mono font-medium"
                            style={{ color: meta.accent }}
                          >
                            {isSelected ? 'ACTIVE' : sceneInfo.badge}
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed">
                          {sceneInfo.subtitle}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Real-Time Physics & Shader Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-stone-800">
                <div className="space-y-4 bg-stone-900/60 p-5 rounded-xl border border-stone-800/90">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                    <Flame className="w-4 h-4" />
                    <span>Combustion, Embers &amp; Thermal Physics</span>
                  </div>

                  {/* Fire Intensity */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-fire-intensity" className="text-stone-300 font-medium">
                        {t.controls.fireIntensity}
                      </label>
                      <span className="font-mono tabular-nums text-amber-400">
                        {Math.round(settings.fireIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-fire-intensity"
                      type="range"
                      min="0.2"
                      max="1.5"
                      step="0.05"
                      value={settings.fireIntensity}
                      onChange={(e) => updateField('fireIntensity', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Ember Density */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-ember-density" className="text-stone-300 font-medium">
                        {t.controls.emberDensity}
                      </label>
                      <span className="font-mono tabular-nums text-amber-400">
                        {Math.round(settings.emberDensity * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-ember-density"
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.05"
                      value={settings.emberDensity}
                      onChange={(e) => updateField('emberDensity', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Flame Height */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-flame-height" className="text-stone-300 font-medium">
                        {t.controls.flameHeight}
                      </label>
                      <span className="font-mono tabular-nums text-amber-400">
                        {Math.round(settings.flameHeight * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-flame-height"
                      type="range"
                      min="0.3"
                      max="1.4"
                      step="0.05"
                      value={settings.flameHeight}
                      onChange={(e) => updateField('flameHeight', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Coal Bed Glow */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-coal-glow" className="text-stone-300 font-medium">
                        {t.controls.coalGlow}
                      </label>
                      <span className="font-mono tabular-nums text-amber-400">
                        {Math.round(settings.coalGlow * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-coal-glow"
                      type="range"
                      min="0.2"
                      max="1.4"
                      step="0.05"
                      value={settings.coalGlow}
                      onChange={(e) => updateField('coalGlow', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Woodsmoke Density */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-smoke-amount" className="text-stone-300 font-medium">
                        {t.controls.smokeAmount}
                      </label>
                      <span className="font-mono tabular-nums text-amber-400">
                        {Math.round(settings.smokeAmount * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-smoke-amount"
                      type="range"
                      min="0"
                      max="1.2"
                      step="0.05"
                      value={settings.smokeAmount}
                      onChange={(e) => updateField('smokeAmount', parseFloat(e.target.value))}
                      className="w-full accent-amber-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Weather, Rain & TV GPU Quality */}
                <div className="space-y-4 bg-stone-900/60 p-5 rounded-xl border border-stone-800/90">
                  <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                    <CloudRain className="w-4 h-4" />
                    <span>Atmosphere, Rain Refraction &amp; Tizen GPU Optimization</span>
                  </div>

                  {/* Rain Downpour */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-rain-intensity" className="text-stone-300 font-medium">
                        {t.controls.rainIntensity}
                      </label>
                      <span className="font-mono tabular-nums text-sky-400">
                        {Math.round(settings.rainIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-rain-intensity"
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.05"
                      value={settings.rainIntensity}
                      onChange={(e) => updateField('rainIntensity', parseFloat(e.target.value))}
                      className="w-full accent-sky-400 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Wind Speed */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-wind-speed" className="text-stone-300 font-medium">
                        {t.controls.windSpeed}
                      </label>
                      <span className="font-mono tabular-nums text-sky-400">
                        {Math.round(settings.windSpeed * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-wind-speed"
                      type="range"
                      min="0"
                      max="1.2"
                      step="0.05"
                      value={settings.windSpeed}
                      onChange={(e) => updateField('windSpeed', parseFloat(e.target.value))}
                      className="w-full accent-sky-400 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Lightning Frequency */}
                  <div>
                    <div className="flex justify-between text-xs md:text-sm mb-1.5">
                      <label htmlFor="slider-lightning-freq" className="text-stone-300 font-medium">
                        {t.controls.lightningFreq}
                      </label>
                      <span className="font-mono tabular-nums text-sky-400">
                        {Math.round(settings.lightningFreq * 100)}%
                      </span>
                    </div>
                    <input
                      id="slider-lightning-freq"
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.05"
                      value={settings.lightningFreq}
                      onChange={(e) => updateField('lightningFreq', parseFloat(e.target.value))}
                      className="w-full accent-sky-400 h-2 bg-stone-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Refractive Windowpane Droplets Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs md:text-sm text-stone-300 font-medium">
                      {t.controls.glassDroplets}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.glassDroplets}
                      aria-label={t.controls.glassDroplets}
                      onClick={() => updateField('glassDroplets', !settings.glassDroplets)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        settings.glassDroplets
                          ? 'bg-sky-500 text-stone-950'
                          : 'bg-stone-800 text-stone-400'
                      }`}
                    >
                      {settings.glassDroplets ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {/* TV GPU Quality Tier */}
                  <div className="pt-2 border-t border-stone-800">
                    <span className="block text-xs md:text-sm text-stone-300 font-medium mb-2">
                      {t.controls.qualityTier}
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {(['auto', 'low', 'mid', 'high'] as QualityTier[]).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => updateField('qualityTier', tier)}
                          className={`py-2 px-2.5 rounded-lg text-xs font-semibold uppercase transition-colors ${
                            settings.qualityTier === tier
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-6">
              {/* Top Master Audio & Open-Source CC0 Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-900/70 p-5 rounded-xl border border-stone-800">
                <div className="flex items-center justify-between md:border-r md:border-stone-800 md:pr-4">
                  <div>
                    <div className="text-sm font-semibold text-stone-100">
                      {t.controls.masterAudio}
                    </div>
                    <div className="text-xs text-stone-400">
                      Zero MIDI · 48kHz Acoustic PCM + CC0
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField('masterAudio', !settings.masterAudio)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold ${
                      settings.masterAudio
                        ? 'bg-emerald-500 text-stone-950'
                        : 'bg-stone-800 text-stone-300'
                    }`}
                  >
                    {settings.masterAudio ? (
                      <>
                        <Volume2 className="w-4 h-4" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <VolumeX className="w-4 h-4" />
                        <span>Muted</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="md:border-r md:border-stone-800 md:px-4">
                  <div className="flex justify-between text-xs md:text-sm mb-1.5">
                    <label htmlFor="slider-master-volume" className="text-stone-200 font-medium">
                      {t.controls.masterVolume}
                    </label>
                    <span className="font-mono tabular-nums text-amber-400">
                      {Math.round(settings.masterVolume * 100)}%
                    </span>
                  </div>
                  <input
                    id="slider-master-volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={settings.masterVolume}
                    onChange={(e) => updateField('masterVolume', parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between md:pl-2">
                  <div>
                    <div className="text-sm font-semibold text-stone-100">
                      {t.controls.openSourceStreams}
                    </div>
                    <div className="text-xs text-stone-400">
                      Wikimedia Commons CC0 OGG
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField('openSourceStreams', !settings.openSourceStreams)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold ${
                      settings.openSourceStreams
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.openSourceStreams ? 'Enabled' : 'PCM Only'}
                  </button>
                </div>
              </div>

              {/* 6-Channel Independent Spatial Audio Mixer */}
              <div className="bg-stone-900/60 p-5 rounded-xl border border-stone-800 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-stone-200">
                    6-Channel Natural Soundscape Mixer (Layer Fire + Rain + Thunder + Wind)
                  </h3>
                  <button
                    type="button"
                    onClick={onTriggerThunder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Test Rolling Thunder</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {(Object.keys(settings.audioChannels) as (keyof AudioMixChannels)[]).map(
                    (chKey) => {
                      const val = settings.audioChannels[chKey];
                      return (
                        <div key={chKey}>
                          <div className="flex justify-between text-xs md:text-sm mb-1.5">
                            <label
                              htmlFor={`audio-ch-${chKey}`}
                              className="text-stone-300 font-medium"
                            >
                              {t.channels[chKey]}
                            </label>
                            <span className="font-mono tabular-nums text-amber-400">
                              {Math.round(val * 100)}%
                            </span>
                          </div>
                          <input
                            id={`audio-ch-${chKey}`}
                            type="range"
                            min="0"
                            max="1"
                            step="0.02"
                            value={val}
                            onChange={(e) => updateChannel(chKey, parseFloat(e.target.value))}
                            className="w-full accent-amber-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                          />
                        </div>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Open-Source Audio Asset Provenance */}
              <div className="bg-stone-900/50 p-4 rounded-xl border border-stone-800/80">
                <div className="text-xs font-semibold text-stone-300 mb-2">
                  Open-Source Field Recording Assets &amp; Acoustic Architecture (MIDI Strictly Forbidden)
                </div>
                <div className="space-y-1.5">
                  {currentSceneMeta.openSourceAssets.map((asset, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400"
                    >
                      <span>{asset.label}</span>
                      <span className="font-mono text-stone-500">
                        {asset.license} · {asset.url.split('/').pop()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Clock & Timers */}
              <div className="bg-stone-900/60 p-5 rounded-xl border border-stone-800 space-y-4">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <Clock className="w-4 h-4" />
                  <span>10-Foot TV Clock, Auto-Cycle &amp; Sleep Timer</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs md:text-sm text-stone-300 font-medium">
                    {t.controls.showClock}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('showClock', !settings.showClock)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      settings.showClock
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.showClock ? 'Shown' : 'Hidden'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs md:text-sm text-stone-300 font-medium">
                    {t.controls.clockFormat}
                  </span>
                  <div className="flex gap-2">
                    {(['24h', '12h'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => updateField('clockFormat', fmt)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                          settings.clockFormat === fmt
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-800 text-stone-300'
                        }`}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs md:text-sm text-stone-300 font-medium">
                    {t.controls.showSeconds}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('showSeconds', !settings.showSeconds)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      settings.showSeconds
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.showSeconds ? 'Shown' : 'Hidden'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs md:text-sm text-stone-300 font-medium">
                    {t.controls.showDate}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('showDate', !settings.showDate)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      settings.showDate
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.showDate ? 'Shown' : 'Hidden'}
                  </button>
                </div>

                {/* Auto-Cycle Interval */}
                <div className="pt-2 border-t border-stone-800">
                  <span className="block text-xs md:text-sm text-stone-300 font-medium mb-2">
                    {t.controls.autoCycleMinutes}
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {[0, 1, 5, 15, 30].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => updateField('autoCycleMinutes', mins)}
                        className={`py-1.5 rounded-lg text-xs font-semibold ${
                          settings.autoCycleMinutes === mins
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-800 text-stone-300'
                        }`}
                      >
                        {mins === 0 ? 'Off' : `${mins}m`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sleep Timer */}
                <div>
                  <span className="block text-xs md:text-sm text-stone-300 font-medium mb-2">
                    {t.controls.sleepTimerMinutes}
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {[0, 15, 30, 60, 120].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => updateField('sleepTimerMinutes', mins)}
                        className={`py-1.5 rounded-lg text-xs font-semibold ${
                          settings.sleepTimerMinutes === mins
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-800 text-stone-300'
                        }`}
                      >
                        {mins === 0 ? 'Off' : `${mins}m`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* OLED Care & Color Temperature */}
              <div className="bg-stone-900/60 p-5 rounded-xl border border-stone-800 space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Samsung TV OLED Protection &amp; Night Shift</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs md:text-sm text-stone-300 font-medium">
                    {t.controls.burnInProtection}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('burnInProtection', !settings.burnInProtection)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                      settings.burnInProtection
                        ? 'bg-emerald-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.burnInProtection ? 'Active' : 'Off'}
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-xs md:text-sm mb-1.5">
                    <label htmlFor="slider-orbit-range" className="text-stone-300 font-medium">
                      {t.controls.pixelOrbitRange}
                    </label>
                    <span className="font-mono tabular-nums text-emerald-400">
                      ±{settings.pixelOrbitRange}px
                    </span>
                  </div>
                  <input
                    id="slider-orbit-range"
                    type="range"
                    min="0"
                    max="28"
                    step="2"
                    value={settings.pixelOrbitRange}
                    onChange={(e) => updateField('pixelOrbitRange', parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs md:text-sm mb-1.5">
                    <label htmlFor="slider-peak-lum" className="text-stone-300 font-medium">
                      {t.controls.peakLuminance}
                    </label>
                    <span className="font-mono tabular-nums text-emerald-400">
                      {settings.peakLuminance}%
                    </span>
                  </div>
                  <input
                    id="slider-peak-lum"
                    type="range"
                    min="40"
                    max="100"
                    step="5"
                    value={settings.peakLuminance}
                    onChange={(e) => updateField('peakLuminance', parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 h-2 bg-stone-800 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Color Temperature */}
                <div className="pt-2 border-t border-stone-800">
                  <span className="block text-xs md:text-sm text-stone-300 font-medium mb-2">
                    {t.controls.colorTemp}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'natural', label: 'Natural Studio' },
                        { id: 'warm2700k', label: 'Warm 2700K' },
                        { id: 'candle2000k', label: 'Candle 2000K' },
                        { id: 'midnight', label: 'Midnight Dim' },
                      ] as { id: ColorTemp; label: string }[]
                    ).map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => updateField('colorTemp', ct.id)}
                        className={`py-2 px-3 rounded-lg text-xs font-semibold ${
                          settings.colorTemp === ct.id
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-800 text-stone-300'
                        }`}
                      >
                        {ct.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'mypc' && (
            <div className="space-y-5">
              <div className="bg-stone-900/70 p-5 rounded-xl border border-stone-800 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <Tv className="w-4 h-4" />
                  <span>MyPC OS Screensaver Settings Integration (Ready for Control Panel)</span>
                </div>
                <p className="text-xs md:text-sm text-stone-300 leading-relaxed">
                  This app is built natively on the <strong>My PC SDK v1</strong> and supports three
                  flexible invocation modes from your MyPC Screensaver Settings page: URL query
                  parameters, <code className="text-amber-300">MyPC.app_config</code> /{' '}
                  <code className="text-amber-300">MyPC.launch</code> deep links, and live{' '}
                  <code className="text-amber-300">postMessage</code> updates.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  {/* URL 1: Fullscreen Screensaver Mode */}
                  <div className="p-3.5 rounded-lg bg-stone-950 border border-stone-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-400">
                        1. Idle Screensaver Launch URL
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText('ssUrl', screensaverLaunchUrl)}
                        className="flex items-center gap-1 text-xs text-stone-300 hover:text-white"
                      >
                        {copiedKey === 'ssUrl' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey === 'ssUrl' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-stone-400 break-all bg-stone-900 p-2 rounded">
                      {screensaverLaunchUrl}
                    </div>
                  </div>

                  {/* URL 2: Open Built-in Settings Page Directly */}
                  <div className="p-3.5 rounded-lg bg-stone-950 border border-stone-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-sky-400">
                        2. Open Settings Page Directly
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText('cfgUrl', settingsLaunchUrl)}
                        className="flex items-center gap-1 text-xs text-stone-300 hover:text-white"
                      >
                        {copiedKey === 'cfgUrl' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey === 'cfgUrl' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-stone-400 break-all bg-stone-900 p-2 rounded">
                      {settingsLaunchUrl}
                    </div>
                  </div>

                  {/* URL 3: Silent Preview Iframe */}
                  <div className="p-3.5 rounded-lg bg-stone-950 border border-stone-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-400">
                        3. Control Panel Mini-Preview
                      </span>
                      <button
                        type="button"
                        onClick={() => copyText('prevUrl', previewLaunchUrl + '&mute=1')}
                        className="flex items-center gap-1 text-xs text-stone-300 hover:text-white"
                      >
                        {copiedKey === 'prevUrl' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedKey === 'prevUrl' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-stone-400 break-all bg-stone-900 p-2 rounded">
                      {previewLaunchUrl}&amp;mute=1
                    </div>
                  </div>
                </div>
              </div>

              {/* PostMessage & Deep Link Code Reference */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-200">
                      Live postMessage API (From MyPC Settings Page to Iframe)
                    </span>
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <pre className="text-[11px] font-mono text-stone-300 bg-stone-950 p-3 rounded-lg overflow-x-auto">
{`// Dynamically change scene or open settings from MyPC:
screensaverFrame.contentWindow.postMessage({
  mypc_screensaver: 1,
  type: 'applySettings', // or 'openSettings' | 'closeSettings'
  settings: {
    scene: '${settings.scene}',
    fireIntensity: ${settings.fireIntensity},
    clockFormat: '${settings.clockFormat}'
  }
}, '*');`}
                  </pre>
                </div>

                <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-200">
                      Current Exportable MyPC.app_config JSON
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyText('jsonCfg', JSON.stringify(settings, null, 2))
                      }
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                    >
                      {copiedKey === 'jsonCfg' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === 'jsonCfg' ? 'Copied JSON' : 'Copy JSON'}</span>
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-stone-300 bg-stone-950 p-3 rounded-lg max-h-36 overflow-y-auto">
                    {JSON.stringify(
                      {
                        scene: settings.scene,
                        clockFormat: settings.clockFormat,
                        fireIntensity: settings.fireIntensity,
                        emberDensity: settings.emberDensity,
                        rainIntensity: settings.rainIntensity,
                        burnInProtection: settings.burnInProtection,
                        videos:
                          settings.videos.length > 0
                            ? settings.videos.map((v) => ({
                                uri: v.uri,
                                title: v.title,
                                type: v.type,
                                audioMode: v.audioMode,
                                sizeMb: v.sizeBytes
                                  ? Math.round(v.sizeBytes / (1024 * 1024))
                                  : 48,
                              }))
                            : {
                                uri: 'drive://YOUR_DRIVE_FILE_ID',
                                title: 'fire 4k',
                                type: 'hearth',
                                audioMode: 'both',
                                sizeMb: 48,
                              },
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
