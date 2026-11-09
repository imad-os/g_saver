import { APP_VERSION, AudioMixChannels, ScreensaverSettings } from './screensaverLogic';

type ChannelKey = keyof AudioMixChannels;

const LOCAL_OGG_ASSETS: Record<ChannelKey, string> = {
  hearthRoar: `./audio/hearth_roar.ogg?v=${APP_VERSION}`,
  woodCrackle: `./audio/fire_crackle.ogg?v=${APP_VERSION}`,
  rainDownpour: `./audio/rain_downpour.ogg?v=${APP_VERSION}`,
  distantThunder: `./audio/distant_thunder.ogg?v=${APP_VERSION}`,
  nightWind: `./audio/night_wind.ogg?v=${APP_VERSION}`,
  waterStream: `./audio/water_stream.ogg?v=${APP_VERSION}`,
};

interface ChannelNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Authentic Field-Recording & Zero-Oscillator Acoustic Audio Engine.
 * Streams and decodes the 6 locally bundled open-source field recordings (/audio/*.ogg)
 * through a single Web Audio mixer graph with zero MIDI and zero synthetic sine tones.
 */
export class AcousticAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private channels: Partial<Record<ChannelKey, ChannelNodes>> = {};
  private decodedFieldBuffers: Partial<Record<ChannelKey, AudioBuffer>> = {};
  private isPaused = false;
  private isStarted = false;
  private mypcVolume = { music: 0.85, sfx: 0.85 };
  private currentSettings: ScreensaverSettings | null = null;

  public start(settings: ScreensaverSettings, mypcVol?: { music: number; sfx: number }): void {
    this.currentSettings = settings;
    if (mypcVol) {
      this.mypcVolume = { ...mypcVol };
    }
    if (this.isStarted && this.ctx) {
      this.applySettings(settings);
      return;
    }

    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } })
      .userActivation;
    if (ua && ua.hasBeenActive === false) {
      return;
    }

    this.initAudioContext(settings);
  }

  private initAudioContext(settings: ScreensaverSettings): void {
    if (this.isStarted && this.ctx) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.computeEffectiveMaster(settings);
      this.masterGain.connect(this.ctx.destination);

      // Start immediate broadband turbulence beds (zero sine tones) while real OGG field recordings decode
      this.buildInitialBroadbandChannels(this.ctx, this.masterGain, settings);
      // Asynchronously load & hot-swap in the real microphone-recorded OGG files from /audio/*.ogg
      this.loadRealFieldRecordings(this.ctx);

      this.isStarted = true;
      this.isPaused = false;
    } catch {
      // Will retry on gesture
    }
  }

  public unlockOnGesture(): void {
    if (!this.ctx && this.currentSettings) {
      this.initAudioContext(this.currentSettings);
      return;
    }
    if (this.ctx && this.ctx.state === 'suspended' && !this.isPaused) {
      this.ctx.resume().catch(() => {});
    }
  }

  private async loadRealFieldRecordings(ctx: AudioContext): Promise<void> {
    const keys = Object.keys(LOCAL_OGG_ASSETS) as ChannelKey[];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const url = LOCAL_OGG_ASSETS[k];
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const arrayBuf = await res.arrayBuffer();
        if (!this.ctx || this.ctx !== ctx) return;
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.decodedFieldBuffers[k] = audioBuf;

        // Hot-swap the channel buffer source to the real microphone field recording
        if (this.currentSettings?.openSourceStreams !== false) {
          this.swapChannelBuffer(k, audioBuf);
        }
      } catch {
        // Keep physical broadband buffer if decode fails
      }
    }
  }

  private swapChannelBuffer(key: ChannelKey, newBuffer: AudioBuffer): void {
    if (!this.ctx || !this.masterGain) return;
    const existing = this.channels[key];
    const currentGainVal = existing
      ? existing.gain.gain.value
      : this.currentSettings?.audioChannels[key] ?? 0;

    if (existing) {
      try {
        existing.source.stop();
        existing.source.disconnect();
      } catch {
        // ignore
      }
    }

    const gainNode = existing ? existing.gain : this.ctx.createGain();
    if (!existing) {
      gainNode.gain.value = currentGainVal;
      gainNode.connect(this.masterGain);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = newBuffer;
    source.loop = true;
    source.connect(gainNode);
    source.start(0, Math.random() * Math.max(0.1, newBuffer.duration * 0.5));

    this.channels[key] = { source, gain: gainNode };
  }

  public applySettings(settings: ScreensaverSettings): void {
    this.currentSettings = settings;
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const targetMaster = this.isPaused ? 0 : this.computeEffectiveMaster(settings);
    this.masterGain.gain.setTargetAtTime(targetMaster, now, 0.08);

    const keys: ChannelKey[] = [
      'hearthRoar',
      'woodCrackle',
      'rainDownpour',
      'distantThunder',
      'nightWind',
      'waterStream',
    ];

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const node = this.channels[k];
      if (node) {
        const level = settings.audioChannels[k] ?? 0;
        const intensityMod =
          k === 'hearthRoar' || k === 'woodCrackle'
            ? 0.55 + settings.fireIntensity * 0.45
            : k === 'rainDownpour'
            ? 0.5 + settings.rainIntensity * 0.5
            : 1.0;
        node.gain.gain.setTargetAtTime(Math.min(1, level * intensityMod), now, 0.12);
      }
    }
  }

  public setMyPCVolume(v: { music: number; sfx: number }): void {
    this.mypcVolume = {
      music: typeof v.music === 'number' ? v.music : 0.85,
      sfx: typeof v.sfx === 'number' ? v.sfx : 0.85,
    };
    if (this.currentSettings) {
      this.applySettings(this.currentSettings);
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.ctx && this.masterGain) {
      try {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        if (this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  }

  public resume(): void {
    this.isPaused = false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.currentSettings) {
        this.applySettings(this.currentSettings);
      }
    }
  }

  public destroy(): void {
    this.isPaused = true;
    this.isStarted = false;

    const keys = Object.keys(this.channels) as ChannelKey[];
    for (let i = 0; i < keys.length; i++) {
      const ch = this.channels[keys[i]];
      if (ch) {
        try {
          ch.source.stop();
          ch.source.disconnect();
          ch.gain.disconnect();
        } catch {
          // ignore
        }
      }
    }
    this.channels = {};
    this.decodedFieldBuffers = {};

    if (this.ctx) {
      try {
        this.ctx.close().catch(() => {});
      } catch {
        // ignore
      }
      this.ctx = null;
      this.masterGain = null;
    }
  }

  /**
   * Triggers a real recorded thunder segment (or deep sub-bass broadband rumble) when lightning flashes.
   */
  public triggerThunderClap(intensity = 0.85): void {
    if (!this.ctx && this.currentSettings) {
      this.unlockOnGesture();
    }
    if (
      !this.ctx ||
      !this.masterGain ||
      this.isPaused ||
      !this.currentSettings?.masterAudio ||
      this.ctx.state !== 'running'
    ) {
      return;
    }

    const thunderMix = Math.max(0.35, this.currentSettings.audioChannels.distantThunder);
    const recordedThunder = this.decodedFieldBuffers.distantThunder;

    if (recordedThunder) {
      const src = this.ctx.createBufferSource();
      src.buffer = recordedThunder;
      const g = this.ctx.createGain();
      g.gain.value = Math.min(1, thunderMix * intensity);
      src.connect(g);
      g.connect(this.masterGain);
      const maxOffset = Math.max(0, recordedThunder.duration - 5);
      src.start(0, Math.random() * maxOffset, 4.5);
      return;
    }

    // Fallback broadband low-pass rumble (zero sine tones)
    const sr = this.ctx.sampleRate;
    const dur = 3.5;
    const len = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let b0 = 0,
        b1 = 0,
        b2 = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = Math.random() * 2 - 1;
        b0 = 0.993 * b0 + 0.007 * white;
        b1 = 0.986 * b1 + 0.014 * b0;
        b2 = 0.978 * b2 + 0.022 * b1;
        const env = Math.exp(-t * 1.4) * Math.min(1, t * 12);
        data[i] = b2 * 12.0 * env;
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1, thunderMix * intensity * 0.8);
    src.connect(g);
    g.connect(this.masterGain);
    src.start();
  }

  private computeEffectiveMaster(settings: ScreensaverSettings): number {
    if (!settings.masterAudio) return 0;
    if (settings.activeVideoId) {
      const activeVideo = settings.videos.find((v) => v.id === settings.activeVideoId);
      if (activeVideo && (activeVideo.audioMode === 'video' || activeVideo.audioMode === 'mute')) {
        return 0;
      }
    }
    const hostScale = Math.max(this.mypcVolume.music, this.mypcVolume.sfx, 0.25);
    return Math.max(0, Math.min(1, settings.masterVolume * hostScale));
  }

  /**
   * Builds pure broadband-noise initial buffers (ZERO sine oscillators) that play during the
   * first ~150ms before the real OGG field recordings finish decoding.
   */
  private buildInitialBroadbandChannels(
    ctx: AudioContext,
    destination: GainNode,
    settings: ScreensaverSettings
  ): void {
    const keys: ChannelKey[] = [
      'hearthRoar',
      'woodCrackle',
      'rainDownpour',
      'distantThunder',
      'nightWind',
      'waterStream',
    ];

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const buffer = this.createPureBroadbandBed(ctx, k);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = ctx.createGain();
      gain.gain.value = settings.audioChannels[k] ?? 0;

      source.connect(gain);
      gain.connect(destination);
      source.start(0);

      this.channels[k] = { source, gain };
    }
  }

  private createPureBroadbandBed(ctx: AudioContext, key: ChannelKey): AudioBuffer {
    const sr = ctx.sampleRate;
    const dur = 4.0;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(2, len, sr);
    const coeff =
      key === 'hearthRoar' || key === 'distantThunder'
        ? 0.988
        : key === 'nightWind'
        ? 0.965
        : 0.91;

    for (let ch = 0; ch < 2; ch++) {
      const out = buf.getChannelData(ch);
      let lp1 = 0;
      let lp2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        lp1 = coeff * lp1 + (1 - coeff) * white;
        lp2 = coeff * lp2 + (1 - coeff) * lp1;
        out[i] = lp2 * 0.45;
      }
    }
    return buf;
  }
}
