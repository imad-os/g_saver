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
  Info,
  RefreshCw,
  Smartphone,
  LogIn,
  Sparkles,
} from 'lucide-react';

interface VideoSettingsTabProps {
  settings: ScreensaverSettings;
  lang: SupportedLang;
  onUpdateSettings: (next: ScreensaverSettings) => void;
}

const VERIFIED_PRESET_VIDEOS = [
  {
    id: 'preset_hearth_cc0',
    title: 'Hearth Fireplace Loop',
    uri: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Fantastic-fireplace-fire-chimney-hearth-_background_-_texture_-_motion_graphics_-_free_video_library.webm',
    type: 'hearth' as SceneId,
    sizeBytes: 19112791,
    badge: '18.2 MB · 1080p Loop',
  },
  {
    id: 'preset_cinematic_cc0',
    title: 'Stone Fireplace Logs',
    uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/0/04/Fireplace_1_2021-02-14.webm/Fireplace_1_2021-02-14.webm.720p.vp9.webm',
    type: 'cinematic' as SceneId,
    sizeBytes: 14500000,
    badge: '14 MB · HD Loop',
  },
  {
    id: 'preset_rain_cc0',
    title: 'Raindrops on Window',
    uri: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/9/90/Radevormwald_-_Raindrops_on_a_window_11_%281%29_ies.webm/Radevormwald_-_Raindrops_on_a_window_11_%281%29_ies.webm.720p.vp9.webm',
    type: 'rain' as SceneId,
    sizeBytes: 18400000,
    badge: '17.5 MB · HD Loop',
  },
];

export const VideoSettingsTab: React.FC<VideoSettingsTabProps> = ({
  settings,
  lang,
  onUpdateSettings,
}) => {
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

  const [newTitle, setNewTitle] = useState<string>('Fire 4K');
  const [newUri, setNewUri] = useState<string>('');
  const [newType, setNewType] = useState<SceneId>(settings.scene);
  const [newAudioMode, setNewAudioMode] = useState<VideoAudioMode>('both');
  const [copiedConfig, setCopiedConfig] = useState<boolean>(false);

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
        pageSize: 40,
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
      // Leave sizeBytes undefined until resolved from MyPC.drive.get so Range headers are 100% accurate
      sizeBytes: undefined,
      mimeType: cleanUri.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4',
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
    const guessedType: SceneId =
      lower.includes('cinematic') || lower.includes('stone')
        ? 'cinematic'
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

  const activeOrFirstVideo =
    settings.videos.find((v) => v.id === settings.activeVideoId) || settings.videos[0];

  const appConfigSnippet = JSON.stringify(
    {
      videos: activeOrFirstVideo
        ? {
            uri: activeOrFirstVideo.uri,
            title: activeOrFirstVideo.title,
            type: activeOrFirstVideo.type,
            audioMode: activeOrFirstVideo.audioMode,
          }
        : {
            uri: 'drive://YOUR_GOOGLE_DRIVE_FILE_ID',
            title: 'fire 4k',
            type: 'hearth',
            audioMode: 'both',
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
    <div className="space-y-4">
      {/* Compact 1-Line Smart TV Video Size Notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/35 rounded-xl px-4 py-3 text-xs text-stone-200">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong className="text-amber-300">Smart TV Video Size Notice:</strong> Select MP4/WebM
            loops under <strong>80 MB</strong> (15–65 MB ideal) so videos cache in TV RAM for
            continuous multi-hour playback without network stalls.
          </span>
        </div>
        {settings.activeVideoId && (
          <button
            type="button"
            onClick={() => onUpdateSettings(applyVideoPreset(settings, null))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-stone-950 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Stop Video (Use Built-In Fireplace)</span>
          </button>
        )}
      </div>

      {/* 1-Click Verified Ambient Video Loops */}
      <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-2.5">
        <div className="text-xs font-semibold text-amber-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>Quick-Start Ambient Video Loops (1-Click TV Remote Ready)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {VERIFIED_PRESET_VIDEOS.map((preset) => {
            const isCurrent = settings.activeVideoId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  const existing = settings.videos.find((v) => v.id === preset.id);
                  if (existing) {
                    const patched = settings.videos.map((v) =>
                      v.id === preset.id ? { ...v, uri: preset.uri } : v
                    );
                    onUpdateSettings(
                      applyVideoPreset(
                        { ...settings, videos: patched },
                        isCurrent ? null : existing.id
                      )
                    );
                    return;
                  }
                  const item: ScreensaverVideoItem = {
                    id: preset.id,
                    uri: preset.uri,
                    title: preset.title,
                    type: preset.type,
                    audioMode: 'both',
                    videoVolume: 0.85,
                    overlayEffects: false,
                    playbackRate: 1.0,
                    objectFit: 'cover',
                    loop: true,
                    sizeBytes: preset.sizeBytes,
                    mimeType: 'video/webm',
                  };
                  onUpdateSettings(
                    applyVideoPreset(
                      { ...settings, videos: [...settings.videos, item] },
                      item.id
                    )
                  );
                }}
                className={`text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                  isCurrent
                    ? 'bg-amber-500 text-stone-950 border-amber-300 font-semibold'
                    : 'bg-stone-950/90 hover:bg-stone-800 text-stone-200 border-stone-800'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{preset.title}</div>
                  <div
                    className={`text-[11px] font-mono ${
                      isCurrent ? 'text-stone-900' : 'text-emerald-400'
                    }`}
                  >
                    {preset.badge}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 ${
                    isCurrent ? 'bg-stone-950 text-amber-400' : 'bg-stone-800 text-amber-300'
                  }`}
                >
                  {isCurrent ? 'Playing' : 'Play'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Saved Videos List (if any) */}
      {settings.videos.length > 0 && (
        <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-2.5">
          <div className="text-xs font-semibold text-stone-200 flex items-center gap-2">
            <Film className="w-4 h-4 text-amber-400" />
            <span>Saved Videos ({settings.videos.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {settings.videos.map((vid) => {
              const isActive = settings.activeVideoId === vid.id;
              const notice = evaluateVideoSizeNotice(vid.sizeBytes);
              return (
                <div
                  key={vid.id}
                  className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 ${
                    isActive
                      ? 'bg-stone-800/95 border-amber-400'
                      : 'bg-stone-950/80 border-stone-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs md:text-sm font-semibold text-stone-100 truncate">
                        {vid.title}
                      </div>
                      <div className="text-[11px] font-mono text-stone-400 truncate">
                        {notice.badgeText} · {t.scenes[vid.type]?.badge || vid.type}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSettings(applyVideoPreset(settings, isActive ? null : vid.id))
                        }
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                          isActive
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
                        }`}
                      >
                        <Play className="w-3 h-3" />
                        <span>{isActive ? 'Playing' : 'Play'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveVideo(vid.id)}
                        aria-label={`Remove ${vid.title}`}
                        className="p-1.5 rounded-lg bg-stone-900 hover:bg-rose-500/20 text-stone-400 hover:text-rose-300 border border-stone-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-800/80 text-xs">
                    <select
                      aria-label={`${vid.title} scene style`}
                      value={vid.type}
                      onChange={(e) =>
                        handleUpdateVideoItem(vid.id, { type: e.target.value as SceneId })
                      }
                      className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-xs text-stone-200"
                    >
                      {SCENE_IDS.map((sc) => (
                        <option key={sc} value={sc}>
                          {t.scenes[sc].badge}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${vid.title} audio mode`}
                      value={vid.audioMode}
                      onChange={(e) =>
                        handleUpdateVideoItem(vid.id, {
                          audioMode: e.target.value as VideoAudioMode,
                        })
                      }
                      className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-xs text-stone-200"
                    >
                      <option value="both">Video + Acoustic Sound</option>
                      <option value="soundscape">Acoustic Sound Only</option>
                      <option value="video">Video Audio Only</option>
                      <option value="mute">Muted</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Video + MyPC Google Drive Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form
          onSubmit={handleAddCustomVideo}
          className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 space-y-3"
        >
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs md:text-sm">
            <Plus className="w-4 h-4" />
            <span>Add Video (MyPC Drive ID or Direct URL)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="video-title-input" className="block text-xs text-stone-400 mb-1">
                Title
              </label>
              <input
                id="video-title-input"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="fire 4k"
                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100"
              />
            </div>

            <div>
              <label htmlFor="video-type-select" className="block text-xs text-stone-400 mb-1">
                Sound Preset
              </label>
              <select
                id="video-type-select"
                value={newType}
                onChange={(e) => setNewType(e.target.value as SceneId)}
                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100"
              >
                {SCENE_IDS.map((sc) => (
                  <option key={sc} value={sc}>
                    {t.scenes[sc].badge}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="video-uri-input" className="block text-xs text-stone-400 mb-1">
              MyPC Drive URI (<code className="text-amber-300">drive://FILE_ID</code>) or Video URL
            </label>
            <input
              id="video-uri-input"
              type="text"
              value={newUri}
              onChange={(e) => setNewUri(e.target.value)}
              placeholder="drive://1AbCdEf... or https://.../fire.mp4"
              className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-1.5 text-xs font-mono text-stone-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              id="video-audio-select"
              aria-label="Audio Mode"
              value={newAudioMode}
              onChange={(e) => setNewAudioMode(e.target.value as VideoAudioMode)}
              className="bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-2 text-xs text-stone-100"
            >
              <option value="both">Video + Acoustic Mix</option>
              <option value="soundscape">Acoustic Mix Only</option>
              <option value="video">Video Audio Only</option>
              <option value="mute">Muted</option>
            </select>

            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950"
            >
              <Plus className="w-4 h-4" />
              <span>Add &amp; Play Video</span>
            </button>
          </div>
        </form>

        {/* MyPC Google Drive Video Picker & Compact Config Snippet */}
        <div className="bg-stone-900/60 p-4 rounded-xl border border-stone-800 flex flex-col justify-between space-y-3">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs md:text-sm">
                <HardDrive className="w-4 h-4" />
                <span>MyPC Google Drive Videos</span>
              </div>
              {driveStatus?.signedIn && (
                <div className="flex items-center gap-1.5">
                  {driveStatus.picker && (
                    <button
                      type="button"
                      onClick={handleDriveAddFilesFromPhone}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Phone</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => loadDriveVideos()}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-stone-800 text-stone-200"
                  >
                    <RefreshCw className={`w-3 h-3 ${driveLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              )}
            </div>

            {!driveSupported || !driveStatus?.configured ? (
              <p className="text-xs text-stone-400 bg-stone-950/80 p-3 rounded-lg border border-stone-800">
                Sign in under <strong>MyPC Control Panel &gt; Google Drive</strong> to browse your
                Drive videos directly, or paste a <code className="text-amber-300">drive://ID</code>{' '}
                URI on the left.
              </p>
            ) : !driveStatus.signedIn ? (
              <div className="flex items-center justify-between gap-2 bg-stone-950/80 p-3 rounded-lg border border-stone-800">
                <span className="text-xs text-stone-300">Sign in to browse Google Drive videos</span>
                <button
                  type="button"
                  onClick={handleDriveSignIn}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 text-stone-950"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    placeholder="Filter Drive videos..."
                    className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={() => loadDriveVideos(driveSearch)}
                    className="px-2.5 py-1 rounded-lg bg-stone-800 text-xs text-stone-200"
                  >
                    Search
                  </button>
                </div>
                {driveError && <div className="text-xs text-rose-400">{driveError}</div>}
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {driveFiles.map((file) => {
                    const fNotice = evaluateVideoSizeNotice(Number(file.size));
                    return (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-stone-950 border border-stone-800"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-stone-200 truncate">
                            {file.name}
                          </div>
                          <div className="text-[10px] font-mono text-stone-400">
                            {fNotice.badgeText}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePickDriveFile(file)}
                          className="px-2.5 py-1 rounded bg-amber-500 text-stone-950 text-xs font-semibold shrink-0"
                        >
                          Play
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-stone-800 flex items-center justify-between gap-2">
            <code className="text-[11px] font-mono text-stone-400 truncate">
              {appConfigSnippet.replace(/\s+/g, ' ')}
            </code>
            <button
              type="button"
              onClick={copyConfigJson}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 shrink-0"
            >
              {copiedConfig ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedConfig ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
