import React, { useEffect, useRef, useState } from 'react';
import {
  CAMERA_VIEW_MODES,
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

const VideoBackdropPlayerInner: React.FC<VideoBackdropPlayerProps> = ({
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
  const fallbackAttemptedRef = useRef<boolean>(false);
  const resolvedDriveFileRef = useRef<MyPCDriveFile | null>(null);

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
    fallbackAttemptedRef.current = false;
    resolvedDriveFileRef.current = null;

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
          'MyPC Drive (API Level 14) is required to stream Google Drive videos. Showing fallback scene.'
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
              'Google Drive is not configured in MyPC App Store Manager yet. Showing fallback scene.'
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

          // IMPORTANT: Never initialize `size` from an estimated UI input!
          // Passing a wrong `size` causes MyPC.drive.stream's Service Worker to fail with 416 Range Not Satisfiable
          // after the first 2 MB (~3-5 seconds of playback). Only set `size` if `mypc.drive.get` returns a real size.
          let driveFile: MyPCDriveFile = {
            id: fileId,
            name: activeVideo.title || 'video.mp4',
            mimeType: activeVideo.mimeType || 'video/mp4',
          };

          let verifiedBytes = 0;
          try {
            const meta = await mypc.drive!.get(fileId);
            if (cancelled) return;
            if (meta && meta.id) {
              driveFile = meta;
              const numSize = Number(meta.size);
              if (numSize > 0) {
                verifiedBytes = numSize;
              }
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
            // Proceed without size so MyPC.drive.read discovers the exact total from Content-Range
          }

          resolvedDriveFileRef.current = driveFile;

          // For screensaver loops <= 95 MB (or when size is unknown), prefer local Blob streaming first:
          // downloading once into a local `blob:` URL guarantees 10+ hours of continuous looping with ZERO
          // network requests, ZERO 2 MB chunk boundary drops, and ZERO OAuth token expiration mid-loop!
          const preferBlobForMultiHourLoop =
            verifiedBytes === 0 || verifiedBytes <= 95 * 1024 * 1024;

          let handle: MyPCDriveStreamHandle;
          if (preferBlobForMultiHourLoop) {
            try {
              handle = await mypc.drive!.stream(driveFile, {
                onProgress(p: number) {
                  if (!cancelled) {
                    setLoadProgress(Math.round(p * 100));
                  }
                },
              });
            } catch {
              // If full blob download fails (e.g. file is larger than expected), fall back to sw.js range worker
              handle = await mypc.drive!.stream(driveFile, {
                worker: 'sw.js',
                onProgress(p: number) {
                  if (!cancelled) {
                    setLoadProgress(Math.round(p * 100));
                  }
                },
              });
            }
          } else {
            handle = await mypc.drive!.stream(driveFile, {
              worker: 'sw.js',
              onProgress(p: number) {
                if (!cancelled) {
                  setLoadProgress(Math.round(p * 100));
                }
              },
            });
          }

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
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }, [
    activeVideo?.id,
    activeVideo?.audioMode,
    activeVideo?.videoVolume,
    activeVideo?.playbackRate,
    isPaused,
    resolvedUrl,
    settings.masterAudio,
    settings.masterVolume,
  ]);

  // Multi-hour playback watchdog: ensures video never stays stalled or paused at loop boundaries
  useEffect(() => {
    if (!resolvedUrl || isPaused || errorMsg) return;
    const watchdog = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || isPaused) return;
      if (v.ended && activeVideo?.loop !== false) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else if (v.paused && v.readyState >= 2) {
        v.play().catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
      }
    }, 2500);
    return () => window.clearInterval(watchdog);
  }, [resolvedUrl, isPaused, errorMsg, activeVideo?.loop]);

  if (!activeVideo) return null;

  const sizeNotice = evaluateVideoSizeNotice(activeVideo.sizeBytes);

  const handleVideoStreamError = async () => {
    // If worker mode failed mid-stream (e.g. after the first 2MB chunk), automatically switch to blob mode!
    const mypc = getMyPC();
    if (
      streamMode === 'worker' &&
      !fallbackAttemptedRef.current &&
      resolvedDriveFileRef.current &&
      mypc.drive
    ) {
      fallbackAttemptedRef.current = true;
      setIsBuffering(true);
      setErrorMsg(null);
      try {
        if (streamHandleRef.current) {
          streamHandleRef.current.close();
          streamHandleRef.current = null;
        }
        const blobHandle = await mypc.drive.stream(resolvedDriveFileRef.current, {
          onProgress(p: number) {
            setLoadProgress(Math.round(p * 100));
          },
        });
        streamHandleRef.current = blobHandle;
        setStreamMode(blobHandle.mode);
        setResolvedUrl(blobHandle.url);
        return;
      } catch {
        // Proceed to error message below
      }
    }

    setIsBuffering(false);
    setIsVideoReady(false);
    setErrorMsg(
      'Video stream interrupted or could not be decoded. Verify the URI is a valid MP4/WebM file or MyPC Drive video ID.'
    );
  };

  const handleSignInClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const mypc = getMyPC();
    if (!mypc.drive) return;
    try {
      await mypc.drive.signIn();
      setNeedsDriveSignIn(false);
      setErrorMsg(null);
      if (onVideoMetadataResolved) {
        onVideoMetadataResolved(activeVideo.id, {});
      }
    } catch {
      // User cancelled or sign-in unavailable
    }
  };

  const activeViewOpt =
    CAMERA_VIEW_MODES.find((m) => m.id === settings.viewMode) || CAMERA_VIEW_MODES[0];

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
          preload="auto"
          onCanPlay={() => {
            setIsBuffering(false);
            setIsVideoReady(true);
            setLoadProgress(null);
            const v = videoRef.current;
            if (v && v.paused && !isPaused) {
              v.play().catch(() => {
                v.muted = true;
                v.play().catch(() => {});
              });
            }
          }}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setIsVideoReady(true);
            setErrorMsg(null);
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (!v || activeVideo.loop === false) return;
            // Seamless loop wrap slightly before EOF to prevent hardware decoder freeze on Smart TVs
            if (v.duration > 2.0 && v.currentTime >= v.duration - 0.12) {
              v.currentTime = 0.01;
              if (v.paused && !isPaused) {
                v.play().catch(() => {});
              }
            }
          }}
          onEnded={() => {
            const v = videoRef.current;
            if (v && activeVideo.loop !== false && !isPaused) {
              v.currentTime = 0;
              v.play().catch(() => {});
            }
          }}
          onStalled={() => {
            const v = videoRef.current;
            if (v && !isPaused && v.readyState >= 2) {
              v.play().catch(() => {});
            }
          }}
          onError={handleVideoStreamError}
          style={{
            objectFit: activeVideo.objectFit || 'cover',
            transform: (() => {
              const zoomScale =
                activeViewOpt.equivZoom * (settings.burnInProtection ? 1.03 : 1.0);
              const tx = settings.burnInProtection ? orbitOffset.x * 0.4 : 0;
              const ty = settings.burnInProtection ? orbitOffset.y * 0.4 : 0;
              return zoomScale !== 1.0 || tx !== 0 || ty !== 0
                ? `translate3d(${tx}px, ${ty}px, 0) scale(${zoomScale.toFixed(3)})`
                : undefined;
            })(),
            transformOrigin: '50% 58%',
          }}
          className={`w-screen h-screen transition-opacity duration-500 ${
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
                  {loadProgress !== null
                    ? `MyPC Drive · Caching for Seamless Loop (${loadProgress}%)`
                    : streamMode === 'worker'
                    ? 'MyPC Drive · Streaming 2 MB Range Chunks (sw.js)'
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

export const VideoBackdropPlayer = React.memo(VideoBackdropPlayerInner);
