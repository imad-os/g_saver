import React, { useEffect, useRef, useState } from 'react';
import {
  ScreensaverSettings,
  ScreensaverVideoItem,
  evaluateVideoSizeNotice,
  parseVideoUri,
} from '../utils/screensaverLogic';
import {
  MyPCDriveFile,
  MyPCDriveStreamHandle,
  getMyPC,
} from '../utils/mypcBridge';
import { HardDrive, AlertTriangle, Loader2, Film, ExternalLink } from 'lucide-react';

interface VideoBackdropPlayerProps {
  settings: ScreensaverSettings;
  activeVideo: ScreensaverVideoItem | null;
  isPaused: boolean;
  isPureView: boolean;
  orbitOffset: { x: number; y: number };
  onVideoMetadataResolved?: (videoId: string, patch: Partial<ScreensaverVideoItem>) => void;
  onOpenVideoSettings?: () => void;
  onInteract?: () => void;
}

export const VideoBackdropPlayer: React.FC<VideoBackdropPlayerProps> = ({
  settings,
  activeVideo,
  isPaused,
  isPureView,
  orbitOffset,
  onVideoMetadataResolved,
  onOpenVideoSettings,
  onInteract,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamHandleRef = useRef<MyPCDriveStreamHandle | null>(null);

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<'worker' | 'blob' | 'direct' | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isVideoReady, setIsVideoReady] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsDriveSignIn, setNeedsDriveSignIn] = useState<boolean>(false);

  // Resolve URI via MyPC.drive.stream or direct URL whenever activeVideo changes
  useEffect(() => {
    let cancelled = false;

    const cleanupStream = () => {
      if (streamHandleRef.current) {
        try {
          streamHandleRef.current.close();
        } catch {
          // ignore
        }
        streamHandleRef.current = null;
      }
    };

    cleanupStream();
    setResolvedUrl(null);
    setStreamMode(null);
    setLoadProgress(null);
    setIsVideoReady(false);
    setErrorMsg(null);
    setNeedsDriveSignIn(false);

    if (!activeVideo || !activeVideo.uri) {
      return cleanupStream;
    }

    const parsed = parseVideoUri(activeVideo.uri);

    if (parsed.source === 'url' && parsed.url) {
      setResolvedUrl(parsed.url);
      setStreamMode('direct');
      setIsBuffering(true);
      return cleanupStream;
    }

    if (parsed.source === 'drive' && parsed.driveFileId) {
      const fileId = parsed.driveFileId;
      const mypc = getMyPC();

      if (!mypc.drive || (typeof mypc.apiLevel === 'number' && mypc.apiLevel < 14)) {
        setErrorMsg(
          'MyPC Drive (API Level 14) is required to stream Google Drive videos. Showing fallback scene plate.'
        );
        return cleanupStream;
      }

      setIsBuffering(true);

      (async () => {
        try {
          const st = await mypc.drive!.status();
          if (cancelled) return;

          if (!st.configured) {
            setErrorMsg(
              'Google Drive is not configured in MyPC App Store Manager yet. Showing fallback scene plate.'
            );
            setIsBuffering(false);
            return;
          }

          if (!st.signedIn) {
            setNeedsDriveSignIn(true);
            setErrorMsg('Sign in to MyPC Google Drive to stream this video.');
            setIsBuffering(false);
            return;
          }

          // Fetch Drive file metadata first so MyPC.drive.stream knows exact size & mimeType for Range requests
          let driveFile: MyPCDriveFile = {
            id: fileId,
            name: activeVideo.title || 'video.mp4',
            mimeType: activeVideo.mimeType || 'video/mp4',
            size: activeVideo.sizeBytes ? String(activeVideo.sizeBytes) : undefined,
          };

          try {
            const meta = await mypc.drive!.get(fileId);
            if (cancelled) return;
            if (meta && meta.id) {
              driveFile = meta;
              const numSize = Number(meta.size);
              const resLabel =
                meta.videoMediaMetadata?.width && meta.videoMediaMetadata?.height
                  ? `${meta.videoMediaMetadata.width}x${meta.videoMediaMetadata.height}`
                  : undefined;
              if (numSize > 0 && numSize !== activeVideo.sizeBytes) {
                onVideoMetadataResolved?.(activeVideo.id, {
                  sizeBytes: numSize,
                  mimeType: meta.mimeType || activeVideo.mimeType,
                  resolution: resLabel || activeVideo.resolution,
                });
              }
            }
          } catch {
            // If get(id) fails, proceed with stream(driveFile) directly
          }

          const handle = await mypc.drive!.stream(driveFile, {
            worker: 'sw.js',
            onProgress(p: number) {
              if (!cancelled) {
                setLoadProgress(Math.round(p * 100));
              }
            },
          });

          if (cancelled) {
            handle.close();
            return;
          }

          streamHandleRef.current = handle;
          setStreamMode(handle.mode);
          setResolvedUrl(handle.url);
        } catch (err: any) {
          if (cancelled) return;
          const code = err?.code || '';
          if (code === 'signed-out' || code === 'reauth') {
            setNeedsDriveSignIn(true);
            setErrorMsg('MyPC Google Drive session expired. Please sign in to stream video.');
          } else if (code === 'denied') {
            setErrorMsg('Google Drive permission was declined for this profile.');
          } else if (code === 'not-found') {
            setErrorMsg(`Drive video file "${fileId}" not found or not shared with this account.`);
          } else if (code === 'too-big') {
            setErrorMsg('Video file exceeds MyPC Drive maximum streaming size limit.');
          } else {
            setErrorMsg(err?.message || 'Unable to stream video from MyPC Drive.');
          }
          setIsBuffering(false);
        }
      })();
    }

    return () => {
      cancelled = true;
      cleanupStream();
    };
  }, [activeVideo?.id, activeVideo?.uri]);

  // Sync volume, mute, playbackRate, and pause state with <video> element
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeVideo) return;

    const shouldPlayVideoAudio =
      settings.masterAudio &&
      (activeVideo.audioMode === 'video' || activeVideo.audioMode === 'both') &&
      activeVideo.videoVolume > 0.01;

    v.muted = !shouldPlayVideoAudio || isPaused;
    v.volume = shouldPlayVideoAudio
      ? Math.max(0, Math.min(1, activeVideo.videoVolume * settings.masterVolume))
      : 0;
    v.playbackRate = activeVideo.playbackRate || 1.0;

    if (isPaused) {
      v.pause();
    } else if (resolvedUrl && v.paused) {
      v.play().catch(() => {
        // If browser autoplay policy blocks unmuted playback prior to gesture, fall back to muted play
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }, [
    activeVideo,
    isPaused,
    resolvedUrl,
    settings.masterAudio,
    settings.masterVolume,
  ]);

  if (!activeVideo) return null;

  const sizeNotice = evaluateVideoSizeNotice(activeVideo.sizeBytes);

  const handleSignInClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const mypc = getMyPC();
    if (!mypc.drive) return;
    try {
      await mypc.drive.signIn();
      setNeedsDriveSignIn(false);
      setErrorMsg(null);
      // Trigger re-resolve by toggling state
      if (onVideoMetadataResolved) {
        onVideoMetadataResolved(activeVideo.id, {});
      }
    } catch {
      // User cancelled or sign-in unavailable
    }
  };

  return (
    <div
      onClick={onInteract}
      className="fixed inset-0 z-10 pointer-events-auto overflow-hidden"
    >
      {/* Hardware-Accelerated Fullscreen Video Plane */}
      {resolvedUrl && (
        <video
          ref={videoRef}
          src={resolvedUrl}
          autoPlay
          loop={activeVideo.loop !== false}
          playsInline
          onCanPlay={() => {
            setIsBuffering(false);
            setIsVideoReady(true);
            setLoadProgress(null);
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setIsVideoReady(true);
          }}
          onError={() => {
            setIsBuffering(false);
            setIsVideoReady(false);
            setErrorMsg(
              'Video stream could not be decoded. Verify the URI is a valid MP4/WebM file or MyPC Drive video ID.'
            );
          }}
          style={{
            objectFit: activeVideo.objectFit || 'cover',
            transform: settings.burnInProtection
              ? `translate3d(${orbitOffset.x * 0.4}px, ${orbitOffset.y * 0.4}px, 0) scale(1.03)`
              : undefined,
          }}
          className={`w-screen h-screen transition-opacity duration-700 ${
            isVideoReady ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Night Shift Color Temperature & OLED Peak Luminance Cap over Video */}
      {isVideoReady && settings.colorTemp !== 'natural' && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundColor:
              settings.colorTemp === 'warm2700k'
                ? 'rgba(251, 146, 60, 0.08)'
                : settings.colorTemp === 'candle2000k'
                ? 'rgba(234, 88, 12, 0.15)'
                : 'rgba(15, 23, 42, 0.32)',
          }}
        />
      )}

      {isVideoReady && settings.peakLuminance < 100 && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundColor: `rgba(0, 0, 0, ${Math.max(
              0,
              Math.min(0.65, (100 - settings.peakLuminance) / 100)
            ).toFixed(3)})`,
          }}
        />
      )}

      {/* Non-Intrusive Buffering / MyPC Drive Status Pill (Hidden in Pure View once playing) */}
      {!isPureView && (isBuffering || errorMsg || sizeNotice.tier === 'large') && (
        <div className="fixed top-24 right-8 z-30 max-w-md flex flex-col gap-2 pointer-events-auto">
          {isBuffering && (
            <div
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-amber-500/40 text-xs text-stone-200 shadow-xl"
              style={{ backgroundColor: 'rgba(15, 12, 10, 0.90)' }}
            >
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-stone-100 truncate">
                  Loading Video: {activeVideo.title}
                </div>
                <div className="text-[11px] text-stone-400">
                  {streamMode === 'worker'
                    ? 'MyPC Drive · Streaming 2 MB Range Chunks (sw.js)'
                    : loadProgress !== null
                    ? `MyPC Drive · Buffering (${loadProgress}%)`
                    : 'Initializing hardware video decoder...'}
                </div>
              </div>
            </div>
          )}

          {sizeNotice.tier === 'large' && !errorMsg && (
            <div
              className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-amber-500/50 text-xs text-amber-200 shadow-lg"
              style={{ backgroundColor: 'rgba(28, 18, 10, 0.92)' }}
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{sizeNotice.badgeText}:</span>{' '}
                <span className="text-stone-300">{sizeNotice.noticeText}</span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              className="flex flex-col gap-2.5 p-3.5 rounded-xl border border-rose-500/50 text-xs text-stone-200 shadow-xl"
              style={{ backgroundColor: 'rgba(24, 12, 14, 0.94)' }}
            >
              <div className="flex items-start gap-2.5">
                <HardDrive className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-rose-300">
                    {activeVideo.title} — Stream Notice
                  </div>
                  <p className="text-stone-300 mt-0.5 leading-relaxed">{errorMsg}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {needsDriveSignIn && (
                  <button
                    type="button"
                    onClick={handleSignInClick}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs"
                  >
                    Sign in to MyPC Drive
                  </button>
                )}
                {onOpenVideoSettings && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenVideoSettings();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs border border-stone-700"
                  >
                    <Film className="w-3.5 h-3.5 text-amber-400" />
                    <span>Manage Videos</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
