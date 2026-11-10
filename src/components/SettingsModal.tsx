import React, { useState } from 'react';
import {
  APP_VERSION,
  AudioMixChannels,
  CAMERA_VIEW_MODES,
  CameraViewMode,
  ColorTemp,
  DEFAULT_SETTINGS,
  FireplaceQualityPreset,
  QualityTier,
  SCENE_IDS,
  SCENE_METADATA,
  SceneId,
  ScreensaverSettings,
  SupportedLang,
  TRANSLATIONS,
  buildMyPCHostUrl,
} from '../utils/screensaverLogic';
import { applyScenePreset, getMyPC } from '../utils/mypcBridge';
import { FIRE_EFFECT_STYLES, FireEffectStyle } from '../utils/openSourceFireVfx';
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
  Sparkles,
  Code2,
  Zap,
  X,
  Film,
  Frame,
} from 'lucide-react';
import { VideoSettingsTab } from './VideoSettingsTab';

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

  const handleSelectViewMode = (modeId: CameraViewMode) => {
    const modeSpec = CAMERA_VIEW_MODES.find((m) => m.id === modeId) || CAMERA_VIEW_MODES[0];
    onUpdateSettings({
      ...settings,
      viewMode: modeSpec.id,
      cameraZoom: modeSpec.equivZoom,
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

  const currentSceneMeta = SCENE_METADATA[settings.scene];
  const activeVideo = settings.activeVideoId
    ? settings.videos.find((v) => v.id === settings.activeVideoId) || null
    : null;
  const activeViewMode =
    CAMERA_VIEW_MODES.find((m) => m.id === (settings.viewMode || 'wide')) || CAMERA_VIEW_MODES[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.hud.settings}
      data-tv-scope="settings-modal"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 md:p-6 pointer-events-auto"
      style={{ backgroundColor: 'rgba(6, 5, 4, 0.78)' }}
    >
      <div
        className="w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl border border-stone-700/80 shadow-2xl overflow-hidden text-stone-100"
        style={{ backgroundColor: 'rgba(14, 12, 10, 0.97)' }}
      >
        {/* Clean Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2
                className="text-lg md:text-xl font-semibold tracking-tight text-stone-100"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                {t.appName}
              </h2>
              <p className="text-xs text-stone-400">
                {activeVideo ? `Video: ${activeVideo.title}` : t.scenes[settings.scene].name}
                {' · '}
                View: <span className="text-amber-300 font-semibold">{activeViewMode.label}</span>
                {' · '}
                <span
                  data-testid="mypc-profile-sync-badge"
                  className="text-emerald-400 font-medium"
                >
                  Saved in MyPC ({getMyPC().info?.()?.profile?.name || 'Profile'})
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.controls.resetDefaults}</span>
            </button>

            <button
              type="button"
              onClick={onEnterPureView}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/30"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{t.hud.pureView}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={t.controls.closeSettings}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950"
            >
              <X className="w-4 h-4" />
              <span>{t.controls.closeSettings}</span>
            </button>
          </div>
        </div>

        {/* Streamlined Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Settings Categories"
          className="flex items-center gap-2 px-5 py-2.5 bg-stone-900/90 border-b border-stone-800 overflow-x-auto"
        >
          {(
            [
              { id: 'visuals', label: 'Scene & View', icon: Sliders },
              { id: 'videos', label: 'Videos (Drive)', icon: Film },
              { id: 'audio', label: 'Sound', icon: Volume2 },
              { id: 'display', label: 'Clock & TV Care', icon: Clock },
              { id: 'mypc', label: 'MyPC Config', icon: Code2 },
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
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow'
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

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'videos' && (
            <VideoSettingsTab
              settings={settings}
              lang={lang}
              onUpdateSettings={onUpdateSettings}
            />
          )}

          {activeTab === 'visuals' && (
            <div className="space-y-5">
              {/* 1. Ambient Scene Picker (Compact 6-Card Grid) */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                    1. Ambient Scene
                  </h3>
                  <span className="text-xs text-stone-400">
                    {currentSceneMeta.tempLabel}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {SCENE_IDS.map((sceneId) => {
                    const isSelected = settings.scene === sceneId && !settings.activeVideoId;
                    const sceneInfo = t.scenes[sceneId];
                    return (
                      <button
                        key={sceneId}
                        type="button"
                        onClick={() => onSelectScene(sceneId)}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-stone-800 border-amber-400 ring-2 ring-amber-400/40'
                            : 'bg-stone-900/80 border-stone-800 hover:border-stone-700'
                        }`}
                      >
                        <div className="text-xs md:text-sm font-semibold text-stone-100 truncate">
                          {sceneInfo.name}
                        </div>
                        <div className="text-[11px] text-amber-400/90 font-mono mt-0.5 truncate">
                          {isSelected ? 'ACTIVE' : sceneInfo.badge}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Camera View Framing Mode (Wide / Fit / Hearth / Logs) + Fire VFX Style */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-3 border-t border-stone-800/80">
                {/* Camera Framing Modes (6 cols) */}
                <div className="lg:col-span-6 bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                      <Frame className="w-4 h-4" />
                      <span>{t.controls.cameraZoom}</span>
                    </div>
                    <span
                      data-testid="settings-view-mode-readout"
                      className="text-xs font-mono font-semibold text-emerald-400"
                    >
                      {activeViewMode.label} ({activeViewMode.gpuOptimizationBadge})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {CAMERA_VIEW_MODES.map((vm) => {
                      const isVmActive = (settings.viewMode || 'wide') === vm.id;
                      return (
                        <button
                          key={vm.id}
                          type="button"
                          data-testid={`view-mode-${vm.id}`}
                          onClick={() => handleSelectViewMode(vm.id)}
                          className={`text-left p-2.5 rounded-xl border transition-all ${
                            isVmActive
                              ? 'bg-stone-800 border-amber-400 ring-2 ring-amber-400/40'
                              : 'bg-stone-950/80 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs md:text-sm font-semibold text-stone-100">
                              {vm.label}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                isVmActive
                                  ? 'bg-amber-500 text-stone-950 font-bold'
                                  : 'bg-stone-800 text-emerald-400'
                              }`}
                            >
                              {vm.gpuOptimizationBadge}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-400 mt-1 line-clamp-2 leading-snug">
                            {vm.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Open-Source & Game Fire VFX Style (6 cols) */}
                <div className="lg:col-span-6 bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                      <Sparkles className="w-4 h-4" />
                      <span>{t.controls.fireEffectStyle}</span>
                    </div>
                    <span className="text-[11px] font-mono text-stone-400">
                      Open-Source Game VFX
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {FIRE_EFFECT_STYLES.map((fx) => {
                      const isFxActive = (settings.fireEffectStyle || 'game_flipbook') === fx.id;
                      return (
                        <button
                          key={fx.id}
                          type="button"
                          data-testid={`fire-vfx-${fx.id}`}
                          onClick={() => updateField('fireEffectStyle', fx.id as FireEffectStyle)}
                          className={`text-left p-2.5 rounded-xl border transition-all ${
                            isFxActive
                              ? 'bg-stone-800 border-amber-400 ring-2 ring-amber-400/40'
                              : 'bg-stone-950/80 border-stone-800 hover:border-stone-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-stone-100 truncate">
                              {fx.badge}
                            </span>
                            {isFxActive && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500 text-stone-950 font-bold">
                                ON
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-400 mt-1 line-clamp-2 leading-snug">
                            {fx.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 3. Essential Scene Intensity & Low-Resource TV GPU Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-stone-800/80">
                {/* Left: Essential Flame / Weather Sliders */}
                <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                    Scene Intensity
                  </div>

                  {/* Fire Intensity */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="slider-fire-intensity" className="text-stone-300 font-medium">
                        {t.controls.fireIntensity}
                      </label>
                      <span className="font-mono text-amber-400">
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

                  {/* Ember & Spark Density */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <label htmlFor="slider-ember-density" className="text-stone-300 font-medium">
                        {t.controls.emberDensity}
                      </label>
                      <span className="font-mono text-amber-400">
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

                  {/* Coal Bed Glow / Rain Downpour */}
                  {settings.scene === 'rain' ? (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <label htmlFor="slider-rain-intensity" className="text-stone-300 font-medium">
                          {t.controls.rainIntensity}
                        </label>
                        <span className="font-mono text-sky-400">
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
                  ) : (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <label htmlFor="slider-coal-glow" className="text-stone-300 font-medium">
                          {t.controls.coalGlow}
                        </label>
                        <span className="font-mono text-amber-400">
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
                  )}
                </div>

                {/* Right: TV GPU Optimization & Diagnostics */}
                <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                      Smart TV GPU Optimization
                    </span>
                    <span className="text-[11px] font-mono text-amber-400">
                      Detected Tier: {hardwareTier.toUpperCase()}
                    </span>
                  </div>

                  <div>
                    <span className="block text-xs text-stone-300 font-medium mb-1.5">
                      {t.controls.qualityTier}
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['auto', 'low', 'mid', 'high'] as QualityTier[]).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => updateField('qualityTier', tier)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold uppercase transition-colors ${
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

                  <div>
                    <span className="block text-xs text-stone-300 font-medium mb-1.5">
                      {t.controls.fireplaceQuality}
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'maximum', label: 'Maximum' },
                          { id: 'high', label: 'High' },
                          { id: 'automatic', label: 'Auto (TV Safe)' },
                        ] as { id: FireplaceQualityPreset; label: string }[]
                      ).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => updateField('fireplaceQuality', preset.id)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
                            settings.fireplaceQuality === preset.id
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-stone-800">
                    <span className="text-xs text-stone-300 font-medium">
                      {t.controls.showDiagnostics}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.showDiagnostics}
                      aria-label={t.controls.showDiagnostics}
                      onClick={() => updateField('showDiagnostics', !settings.showDiagnostics)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        settings.showDiagnostics
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-stone-800 text-stone-400'
                      }`}
                    >
                      {settings.showDiagnostics ? 'Shown' : 'Hidden'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-stone-900/70 p-4 rounded-xl border border-stone-800">
                <div className="flex items-center justify-between md:border-r md:border-stone-800 md:pr-4">
                  <div>
                    <div className="text-sm font-semibold text-stone-100">
                      {t.controls.masterAudio}
                    </div>
                    <div className="text-xs text-stone-400">48kHz Acoustic Soundscape</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField('masterAudio', !settings.masterAudio)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
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
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="slider-master-volume" className="text-stone-200 font-medium">
                      {t.controls.masterVolume}
                    </label>
                    <span className="font-mono text-amber-400">
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
                  <span className="text-xs font-medium text-stone-200">
                    {t.controls.openSourceStreams}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('openSourceStreams', !settings.openSourceStreams)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      settings.openSourceStreams
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.openSourceStreams ? 'Enabled' : 'Synth Only'}
                  </button>
                </div>
              </div>

              <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                    Soundscape Channel Mixer
                  </h3>
                  <button
                    type="button"
                    onClick={onTriggerThunder}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Test Thunder</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                  {(Object.keys(settings.audioChannels) as (keyof AudioMixChannels)[]).map(
                    (chKey) => {
                      const val = settings.audioChannels[chKey];
                      return (
                        <div key={chKey}>
                          <div className="flex justify-between text-xs mb-1">
                            <label
                              htmlFor={`audio-ch-${chKey}`}
                              className="text-stone-300 font-medium"
                            >
                              {t.channels[chKey]}
                            </label>
                            <span className="font-mono text-amber-400">
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
            </div>
          )}

          {activeTab === 'display' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Clock & Timers */}
              <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3.5">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                  <Clock className="w-4 h-4" />
                  <span>TV Clock &amp; Timers</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-300 font-medium">
                    {t.controls.showClock}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('showClock', !settings.showClock)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      settings.showClock
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.showClock ? 'Shown' : 'Hidden'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-300 font-medium">
                    {t.controls.clockFormat}
                  </span>
                  <div className="flex gap-1.5">
                    {(['24h', '12h'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => updateField('clockFormat', fmt)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold ${
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
                  <span className="text-xs text-stone-300 font-medium">
                    {t.controls.showDate}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('showDate', !settings.showDate)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      settings.showDate
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.showDate ? 'Shown' : 'Hidden'}
                  </button>
                </div>

                <div className="pt-2 border-t border-stone-800">
                  <span className="block text-xs text-stone-300 font-medium mb-1.5">
                    {t.controls.autoCycleMinutes}
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
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

                <div>
                  <span className="block text-xs text-stone-300 font-medium mb-1.5">
                    {t.controls.sleepTimerMinutes}
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
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
              <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  <span>TV OLED Protection &amp; Night Shift</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-300 font-medium">
                    {t.controls.burnInProtection}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField('burnInProtection', !settings.burnInProtection)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      settings.burnInProtection
                        ? 'bg-emerald-500 text-stone-950'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {settings.burnInProtection ? 'Active' : 'Off'}
                  </button>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label htmlFor="slider-peak-lum" className="text-stone-300 font-medium">
                      {t.controls.peakLuminance}
                    </label>
                    <span className="font-mono text-emerald-400">
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

                <div className="pt-2 border-t border-stone-800">
                  <span className="block text-xs text-stone-300 font-medium mb-1.5">
                    {t.controls.colorTemp}
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
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
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold ${
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
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-stone-900/70 border border-stone-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-400">
                      Idle Screensaver Launch URL
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
                  <div className="text-[11px] font-mono text-stone-400 break-all bg-stone-950 p-2.5 rounded">
                    {screensaverLaunchUrl}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-stone-900/70 border border-stone-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-sky-400">
                      Direct Settings Launch URL
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
                  <div className="text-[11px] font-mono text-stone-400 break-all bg-stone-950 p-2.5 rounded">
                    {settingsLaunchUrl}
                  </div>
                </div>
              </div>

              <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-200">
                    Exportable MyPC.app_config JSON
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('jsonCfg', JSON.stringify(settings, null, 2))}
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
                <pre className="text-[11px] font-mono text-stone-300 bg-stone-950 p-3 rounded-lg max-h-40 overflow-y-auto">
                  {JSON.stringify(
                    {
                      scene: settings.scene,
                      viewMode: settings.viewMode,
                      fireEffectStyle: settings.fireEffectStyle,
                      fireplaceQuality: settings.fireplaceQuality,
                      clockFormat: settings.clockFormat,
                      fireIntensity: settings.fireIntensity,
                      emberDensity: settings.emberDensity,
                      burnInProtection: settings.burnInProtection,
                      videos: settings.videos.map((v) => ({
                        uri: v.uri,
                        title: v.title,
                        type: v.type,
                        audioMode: v.audioMode,
                      })),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Concise TV Remote / Gamepad Footer */}
        <div className="px-5 py-2.5 bg-stone-950 border-t border-stone-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
          <div className="flex items-center gap-2">
            <Tv className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong className="text-stone-200">TV Remote / Gamepad:</strong> D-Pad Moves Focus · OK/B Selects · Esc/A Closes
            </span>
          </div>
          <span className="font-mono text-stone-500">Hearth &amp; Horizon v{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
};
