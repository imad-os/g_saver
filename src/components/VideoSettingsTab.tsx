import React, { useEffect, useState } from 'react';
import {
  SCENE_IDS,
  SCENE_METADATA,
  SceneId,
  ScreensaverSettings,
  ScreensaverVideoItem,
  SupportedLang,
  TRANSLATIONS,
  VideoAudioMode,
  evaluateVideoSizeNotice,
  parseVideoUri,
} from '../utils/screensaverLogic';
import {
  MyPCDriveFile,
  MyPCDriveStatus,
  applyVideoPreset,
  getMyPC,
} from '../utils/mypcBridge';
import {
  Film,
  HardDrive,
  Plus,
  Trash2,
  Play,
  Check,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Smartphone,
  LogIn,
  Sparkles,
  Volume2,
} from 'lucide-react';

interface VideoSettingsTabProps {
  settings: ScreensaverSettings;
  lang: SupportedLang;
  onUpdateSettings: (next: ScreensaverSettings) => void;
}

export const VideoSettingsTab: React.FC<VideoSettingsTabProps> = ({
  settings,
  lang,
  onUpdateSettings,
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  // Form state for adding a new video
  const [newTitle, setNewTitle] = useState<string>('Fire 4K');
  const [newUri, setNewUri] = useState<string>('');
  const [newType, setNewType] = useState<SceneId>(settings.scene);
  const [newAudioMode, setNewAudioMode] = useState<VideoAudioMode>('both');
  const [newSizeMb, setNewSizeMb] = useState<string>('48');
  const [copiedConfig, setCopiedConfig] = useState<boolean>(false);

  // MyPC.drive state
  const [driveSupported, setDriveSupported] = useState<boolean>(false);
  const [driveStatus, setDriveStatus] = useState<MyPCDriveStatus | null>(null);
  const [driveFiles, setDriveFiles] = useState<MyPCDriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState<boolean>(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSearch, setDriveSearch] = useState<string>('');

  const checkDriveStatus = async () => {
    const mypc = getMyPC();
    if (!mypc.drive || (typeof mypc.apiLevel === 'number' && mypc.apiLevel < 14)) {
      setDriveSupported(false);
      return;
    }
    setDriveSupported(true);
    try {
      const st = await mypc.drive.status();
      setDriveStatus(st);
      if (st.configured && st.signedIn) {
        loadDriveVideos();
      }
    } catch (err: any) {
      setDriveError(err?.message || 'Could not query MyPC Drive status.');
    }
  };

  const loadDriveVideos = async (searchQuery?: string) => {
    const mypc = getMyPC();
    if (!mypc.drive) return;
    setDriveLoading(true);
    setDriveError(null);
    try {
      const res = await mypc.drive.list({
        place: 'videos',
        pageSize: 50,
        search: searchQuery !== undefined ? searchQuery : driveSearch || undefined,
      });
      setDriveFiles(Array.isArray(res?.files) ? res.files : []);
    } catch (err: any) {
      setDriveError(err?.message || 'Unable to list videos from MyPC Drive.');
    } finally {
      setDriveLoading(false);
    }
  };

  useEffect(() => {
    checkDriveStatus();
  }, []);

  const handleDriveSignIn = async () => {
    const mypc = getMyPC();
    if (!mypc.drive) return;
    setDriveError(null);
    try {
      await mypc.drive.signIn();
      await checkDriveStatus();
    } catch (err: any) {
      if (err?.code !== 'cancelled') {
        setDriveError(err?.message || 'Google Drive sign-in was not completed.');
      }
    }
  };

  const handleDriveAddFilesFromPhone = async () => {
    const mypc = getMyPC();
    if (!mypc.drive) return;
    try {
      await mypc.drive.addFiles();
      await loadDriveVideos();
    } catch {
      // ignore if picker closed
    }
  };

  const handleAddCustomVideo = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUri = newUri.trim();
    if (!cleanUri) return;

    const parsedMb = parseFloat(newSizeMb);
    const sizeBytes =
      Number.isFinite(parsedMb) && parsedMb > 0
        ? Math.round(parsedMb * 1024 * 1024)
        : undefined;

    const id = `vid_${Date.now().toString(36)}`;
    const newItem: ScreensaverVideoItem = {
      id,
      uri: cleanUri,
      title: newTitle.trim() || 'Custom Video',
      type: newType,
      audioMode: newAudioMode,
      videoVolume: 0.85,
      overlayEffects: false,
      playbackRate: 1.0,
      objectFit: 'cover',
      loop: true,
      sizeBytes,
      mimeType: 'video/mp4',
    };

    const nextVideos = [...settings.videos, newItem];
    const nextSettings = applyVideoPreset(
      {
        ...settings,
        videos: nextVideos,
      },
      newItem.id
    );
    onUpdateSettings(nextSettings);
    setNewUri('');
  };

  const handlePickDriveFile = (file: MyPCDriveFile) => {
    const uri = `drive://${file.id}`;
    const existing = settings.videos.find((v) => v.uri === uri || v.id === `drive_${file.id}`);
    if (existing) {
      onUpdateSettings(applyVideoPreset(settings, existing.id));
      return;
    }

    const lower = (file.name || '').toLowerCase();
    const guessedType: SceneId = lower.includes('camp')
      ? 'campfire'
      : lower.includes('rain') || lower.includes('storm')
      ? 'rain'
      : lower.includes('aurora') || lower.includes('arctic')
      ? 'aurora'
      : lower.includes('ocean') || lower.includes('reef') || lower.includes('sea')
      ? 'ocean'
      : lower.includes('zen') || lower.includes('koi')
      ? 'zen'
      : 'hearth';

    const numSize = Number(file.size);
    const resLabel =
      file.videoMediaMetadata?.width && file.videoMediaMetadata?.height
        ? `${file.videoMediaMetadata.width}x${file.videoMediaMetadata.height}`
        : undefined;

    const newItem: ScreensaverVideoItem = {
      id: `drive_${file.id.slice(0, 12)}`,
      uri,
      title: file.name.replace(/\.[a-z0-9]{2,4}$/i, '') || 'Drive Video',
      type: guessedType,
      audioMode: 'both',
      videoVolume: 0.85,
      overlayEffects: false,
      playbackRate: 1.0,
      objectFit: 'cover',
      loop: true,
      sizeBytes: numSize > 0 ? numSize : undefined,
      mimeType: file.mimeType || 'video/mp4',
      resolution: resLabel,
    };

    const nextVideos = [...settings.videos, newItem];
    onUpdateSettings(
      applyVideoPreset(
        {
          ...settings,
          videos: nextVideos,
        },
        newItem.id
      )
    );
  };

  const handleRemoveVideo = (id: string) => {
    const nextVideos = settings.videos.filter((v) => v.id !== id);
    onUpdateSettings({
      ...settings,
      videos: nextVideos,
      activeVideoId: settings.activeVideoId === id ? null : settings.activeVideoId,
    });
  };

  const handleUpdateVideoItem = (id: string, patch: Partial<ScreensaverVideoItem>) => {
    const nextVideos = settings.videos.map((v) => (v.id === id ? { ...v, ...patch } : v));
    let nextSettings: ScreensaverSettings = {
      ...settings,
      videos: nextVideos,
    };
    if (patch.type && settings.activeVideoId === id) {
      nextSettings = {
        ...nextSettings,
        scene: patch.type,
        audioChannels: { ...SCENE_METADATA[patch.type].defaultAudioMix },
      };
    }
    onUpdateSettings(nextSettings);
  };

  // Evaluate preview size notice for the Add Video input
  const previewMb = parseFloat(newSizeMb);
  const previewNotice = evaluateVideoSizeNotice(
    Number.isFinite(previewMb) && previewMb > 0 ? previewMb * 1024 * 1024 : undefined
  );

  // Build app_config JSON snippet matching the user's exact specification
  const activeOrFirstVideo =
    settings.videos.find((v) => v.id === settings.activeVideoId) || settings.videos[0];

  const appConfigSnippet = JSON.stringify(
    {
      videos:
        settings.videos.length === 1 && activeOrFirstVideo
          ? {
              uri: activeOrFirstVideo.uri,
              title: activeOrFirstVideo.title,
              type: activeOrFirstVideo.type,
              audioMode: activeOrFirstVideo.audioMode,
              videoVolume: activeOrFirstVideo.videoVolume,
              playbackRate: activeOrFirstVideo.playbackRate,
              sizeMb: activeOrFirstVideo.sizeBytes
                ? Math.round(activeOrFirstVideo.sizeBytes / (1024 * 1024))
                : 48,
            }
          : settings.videos.length > 1
          ? settings.videos.map((v) => ({
              id: v.id,
              uri: v.uri,
              title: v.title,
              type: v.type,
              audioMode: v.audioMode,
              videoVolume: v.videoVolume,
              playbackRate: v.playbackRate,
              sizeMb: v.sizeBytes ? Math.round(v.sizeBytes / (1024 * 1024)) : undefined,
            }))
          : {
              uri: 'drive://YOUR_GOOGLE_DRIVE_FILE_ID',
              title: 'fire 4k',
              type: 'hearth',
              audioMode: 'both',
              videoVolume: 0.85,
              playbackRate: 1.0,
              sizeMb: 48,
            },
    },
    null,
    2
  );

  const copyConfigJson = () => {
    try {
      navigator.clipboard?.writeText(appConfigSnippet);
    } catch {
      // ignore
    }
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* 1. Prominent Video Size & Smart TV Hardware Notice Banner */}
      <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-amber-300 font-semibold text-sm md:text-base">
            <Info className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Smart TV Video Size Notice &amp; MyPC Drive Streaming Guidelines</span>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            sw.js · 2 MB Range Chunks Enabled
          </span>
        </div>

        <p className="text-xs md:text-sm text-stone-300 leading-relaxed">
          When selecting a 4K or 1080p video from <strong>MyPC Google Drive</strong> (or configuring{' '}
          <code className="text-amber-300">videos</code> in <code className="text-amber-300">MyPC.app_config</code>),
          please choose a file size suited for Samsung Tizen Smart TV memory and Wi-Fi bandwidth:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-stone-950/90 border border-emerald-500/40">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>15 MB – 65 MB (Optimal for TV)</span>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Ideal for seamless 20–60s H.264/HEVC 4K/1080p loops. Starts immediately with minimal TV RAM usage.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-stone-950/90 border border-amber-500/40">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-1">
              <HardDrive className="w-4 h-4" />
              <span>65 MB – 180 MB (Range Stream)</span>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Streams piece-by-piece in 2 MB Range chunks via <code className="text-stone-300">sw.js</code>. If Service Workers are unavailable, the full file buffers in RAM first.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-stone-950/90 border border-rose-500/40">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span>Over 180 MB (Large File Warning)</span>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              Not recommended on low-memory TVs. May cause long initial buffering or out-of-memory pauses in blob fallback mode.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Configured Videos List & Playback Switcher */}
      <div className="bg-stone-900/60 p-5 rounded-xl border border-stone-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm md:text-base font-semibold text-stone-100 flex items-center gap-2">
              <Film className="w-4 h-4 text-amber-400" />
              <span>Configured Screensaver Videos ({settings.videos.length})</span>
            </h3>
            <p className="text-xs text-stone-400">
              Loaded from <code className="text-amber-300">MyPC.app_config.videos</code>, MyPC Drive, or custom URIs.
            </p>
          </div>

          {settings.activeVideoId && (
            <button
              type="button"
              onClick={() => onUpdateSettings(applyVideoPreset(settings, null))}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-amber-300 border border-amber-500/40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Switch Back to Built-in 8K Optical Scene</span>
            </button>
          )}
        </div>

        {settings.videos.length === 0 ? (
          <div className="p-6 rounded-xl bg-stone-950/70 border border-stone-800/80 text-center space-y-2">
            <div className="text-sm font-medium text-stone-300">
              No custom videos configured yet
            </div>
            <p className="text-xs text-stone-400 max-w-xl mx-auto">
              Add a video below using a <strong>MyPC Google Drive URI</strong> (<code className="text-amber-300">drive://FILE_ID</code>), browse your signed-in MyPC Drive videos, or define <code className="text-amber-300">videos</code> in <code className="text-amber-300">MyPC.app_config</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settings.videos.map((vid) => {
              const isActive = settings.activeVideoId === vid.id;
              const notice = evaluateVideoSizeNotice(vid.sizeBytes);
              const parsedUri = parseVideoUri(vid.uri);

              return (
                <div
                  key={vid.id}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isActive
                      ? 'bg-stone-800/95 border-amber-400 ring-2 ring-amber-400/40'
                      : 'bg-stone-950/80 border-stone-800 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-semibold text-stone-100 truncate">
                          {vid.title}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-stone-800 text-amber-300 border border-stone-700">
                          {t.scenes[vid.type]?.badge || vid.type}
                        </span>
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                            notice.tier === 'optimal'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                              : notice.tier === 'moderate'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                              : notice.tier === 'large'
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                              : 'bg-stone-800 text-stone-400 border-stone-700'
                          }`}
                        >
                          {notice.badgeText}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-stone-400 truncate mt-1">
                        {parsedUri.source === 'drive'
                          ? `MyPC Drive ID: ${parsedUri.driveFileId}`
                          : vid.uri}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings(applyVideoPreset(settings, isActive ? null : vid.id))
                        }
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                          isActive
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{isActive ? 'Playing' : 'Play Video'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveVideo(vid.id)}
                        aria-label={`Remove ${vid.title}`}
                        className="p-1.5 rounded-lg bg-stone-900 hover:bg-rose-500/20 text-stone-400 hover:text-rose-300 border border-stone-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Per-Video Specific Settings (Type, Audio Mode, Speed) */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-800/80 text-xs">
                    <div>
                      <label className="block text-[11px] text-stone-400 mb-1">
                        Style / Sound Preset
                      </label>
                      <select
                        value={vid.type}
                        onChange={(e) =>
                          handleUpdateVideoItem(vid.id, { type: e.target.value as SceneId })
                        }
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-200"
                      >
                        {SCENE_IDS.map((sc) => (
                          <option key={sc} value={sc}>
                            {t.scenes[sc].badge}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-stone-400 mb-1">
                        Audio Track Mode
                      </label>
                      <select
                        value={vid.audioMode}
                        onChange={(e) =>
                          handleUpdateVideoItem(vid.id, {
                            audioMode: e.target.value as VideoAudioMode,
                          })
                        }
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-200"
                      >
                        <option value="both">Video + Acoustic Mix</option>
                        <option value="soundscape">Acoustic Mix Only</option>
                        <option value="video">Video Audio Only</option>
                        <option value="mute">Muted</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-stone-400 mb-1">
                        Playback Speed
                      </label>
                      <select
                        value={String(vid.playbackRate)}
                        onChange={(e) =>
                          handleUpdateVideoItem(vid.id, {
                            playbackRate: parseFloat(e.target.value),
                          })
                        }
                        className="w-full bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-200"
                      >
                        <option value="0.5">0.5x Slow Ambient</option>
                        <option value="0.75">0.75x Relaxed</option>
                        <option value="1">1.0x Normal</option>
                        <option value="1.25">1.25x Brisk</option>
                      </select>
                    </div>
                  </div>

                  {/* Size Notice Footnote */}
                  <div className="text-[11px] text-stone-400 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{notice.noticeText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Add Video by MyPC Drive URI / Config Form + Live MyPC Drive Picker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Add Video Entry (URI, Title, Type, Audio Mode, Size Notice) */}
        <form
          onSubmit={handleAddCustomVideo}
          className="bg-stone-900/60 p-5 rounded-xl border border-stone-800 space-y-4"
        >
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <Plus className="w-4 h-4" />
            <span>Add Video (MyPC Drive URI or Direct MP4/WebM)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="video-title-input"
                className="block text-xs text-stone-300 font-medium mb-1"
              >
                Video Title (<code className="text-amber-300">title</code>)
              </label>
              <input
                id="video-title-input"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="fire 4k"
                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs md:text-sm text-stone-100 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label
                htmlFor="video-type-select"
                className="block text-xs text-stone-300 font-medium mb-1"
              >
                Scene Style (<code className="text-amber-300">type</code>)
              </label>
              <select
                id="video-type-select"
                value={newType}
                onChange={(e) => setNewType(e.target.value as SceneId)}
                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs md:text-sm text-stone-100 focus:outline-none focus:border-amber-400"
              >
                {SCENE_IDS.map((sc) => (
                  <option key={sc} value={sc}>
                    {t.scenes[sc].name} ({sc})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="video-uri-input"
              className="block text-xs text-stone-300 font-medium mb-1"
            >
              MyPC Drive URI / File ID or Video URL (<code className="text-amber-300">uri</code>)
            </label>
            <input
              id="video-uri-input"
              type="text"
              value={newUri}
              onChange={(e) => setNewUri(e.target.value)}
              placeholder="drive://1AbCdEfGhIjKlMnOpQrStUvWxYz or https://.../fire4k.mp4"
              className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs md:text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="video-audio-select"
                className="block text-xs text-stone-300 font-medium mb-1"
              >
                Audio Mode (<code className="text-amber-300">audioMode</code>)
              </label>
              <select
                id="video-audio-select"
                value={newAudioMode}
                onChange={(e) => setNewAudioMode(e.target.value as VideoAudioMode)}
                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs md:text-sm text-stone-100 focus:outline-none focus:border-amber-400"
              >
                <option value="both">Video Audio + Acoustic Soundscape</option>
                <option value="soundscape">6-Channel Acoustic Soundscape Only</option>
                <option value="video">Video Embedded Audio Only</option>
                <option value="mute">Silent / Muted</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="video-size-input"
                className="block text-xs text-stone-300 font-medium mb-1"
              >
                Estimated File Size (MB) — Size Check
              </label>
              <input
                id="video-size-input"
                type="number"
                min="1"
                max="2000"
                value={newSizeMb}
                onChange={(e) => setNewSizeMb(e.target.value)}
                placeholder="48"
                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs md:text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Live File Size Evaluation Notice Box */}
          <div
            className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
              previewNotice.tier === 'optimal'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : previewNotice.tier === 'moderate'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : previewNotice.tier === 'large'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                : 'bg-stone-950 border-stone-800 text-stone-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{previewNotice.badgeText}: </span>
              <span>{previewNotice.noticeText}</span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs md:text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add &amp; Play Video Screensaver</span>
          </button>
        </form>

        {/* Right: Browse Videos directly from MyPC Google Drive (MyPC.drive API Level 14) */}
        <div className="bg-stone-900/60 p-5 rounded-xl border border-stone-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                <HardDrive className="w-4 h-4" />
                <span>MyPC Google Drive Video Browser (MyPC.drive)</span>
              </div>

              {driveStatus?.signedIn && (
                <div className="flex items-center gap-2">
                  {driveStatus.picker && (
                    <button
                      type="button"
                      onClick={handleDriveAddFilesFromPhone}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Add from Phone</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => loadDriveVideos()}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${driveLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              )}
            </div>

            {!driveSupported || !driveStatus?.configured ? (
              <div className="p-4 rounded-xl bg-stone-950/90 border border-stone-800 text-xs text-stone-300 space-y-2">
                <div className="font-semibold text-stone-200">
                  MyPC Google Drive Bridge (API Level 14)
                </div>
                <p className="text-stone-400 leading-relaxed">
                  Inside MyPC on your TV or browser, sign in once under{' '}
                  <strong>Control Panel &gt; Google Drive</strong>. Your Drive videos will appear here
                  automatically with their file sizes and can also be referenced in{' '}
                  <code className="text-amber-300">MyPC.app_config</code> via{' '}
                  <code className="text-amber-300">&quot;uri&quot;: &quot;drive://FILE_ID&quot;</code>.
                </p>
              </div>
            ) : !driveStatus.signedIn ? (
              <div className="p-5 rounded-xl bg-stone-950/90 border border-stone-800 text-center space-y-3">
                <div className="text-sm font-semibold text-stone-200">
                  Sign in to MyPC Google Drive
                </div>
                <p className="text-xs text-stone-400">
                  Browse your 4K fireplace, campfire, and rain videos stored in Google Drive and stream them in 2 MB chunks via <code className="text-amber-300">sw.js</code>.
                </p>
                <button
                  type="button"
                  onClick={handleDriveSignIn}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-stone-950"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign in with MyPC Drive</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    placeholder="Filter Drive videos (e.g. fire 4k)..."
                    className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={() => loadDriveVideos(driveSearch)}
                    className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-medium text-stone-200"
                  >
                    Search
                  </button>
                </div>

                {driveError && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg">
                    {driveError}
                  </div>
                )}

                <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                  {driveFiles.length === 0 && !driveLoading ? (
                    <div className="text-xs text-stone-400 p-4 text-center bg-stone-950/60 rounded-lg border border-stone-800">
                      No video files found in MyPC Drive. Upload an MP4/WebM video (recommended &lt; 80 MB) to your Google Drive.
                    </div>
                  ) : (
                    driveFiles.map((file) => {
                      const fNotice = evaluateVideoSizeNotice(Number(file.size));
                      return (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-stone-950 border border-stone-800 hover:border-stone-700"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-stone-200 truncate">
                              {file.name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                  fNotice.tier === 'optimal'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : fNotice.tier === 'moderate'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {fNotice.badgeText}
                              </span>
                              <span className="text-[10px] font-mono text-stone-500 truncate">
                                ID: {file.id}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePickDriveFile(file)}
                            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold shrink-0"
                          >
                            Select
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* App Config JSON Generator for `videos` */}
          <div className="pt-3 border-t border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-200">
                <code className="text-amber-300">MyPC.app_config</code> JSON (<code className="text-amber-300">videos</code>)
              </span>
              <button
                type="button"
                onClick={copyConfigJson}
                className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
              >
                {copiedConfig ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedConfig ? 'Copied JSON' : 'Copy Config'}</span>
              </button>
            </div>
            <pre className="text-[11px] font-mono text-stone-300 bg-stone-950 p-3 rounded-lg border border-stone-800 overflow-x-auto max-h-36">
              {appConfigSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
