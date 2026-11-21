export type VoicePriority = 1 | 2 | 3; // 1 = System, 2 = Wingman, 3 = Boss

interface QueuedVoiceLine {
  id: string;
  priority: VoicePriority;
  radioFilter: boolean;
  onStart?: () => void;
}

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private voGain: GainNode | null = null;
  private muted = false;

  // Synthwave pulse sequencer
  private pulseTimer = 0;
  private pulseStep = 0;
  private musicActive = false;
  private bossMode = false;
  private crawlMusicActive = false;
  private crawlTimer = 0;
  private crawlStep = 0;

  // Gapless Web Audio MP3 background music engine (with HTMLAudioElement fallback)
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmBufferCache = new Map<string, AudioBuffer>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmPlayToken = 0;
  private currentTrackId: string | null = null;
  private bgmBaseVolume = 0.42;
  private bgmDuckFactor = 0.72; // Gentle ducking during gameplay so music stays punchy!

  // Single-channel voice queue with priority (Boss > Wingman > System), 1.5s min gap, 12s per-line cooldown
  private voCache = new Map<string, AudioBuffer>();
  private currentVoSource: AudioBufferSourceNode | null = null;
  private voPlaying = false;
  private voLastEndedAt = 0;
  private voPerLineCooldown = new Map<string, number>();
  private voQueue: QueuedVoiceLine | null = null;
  private voGapTimer: number | null = null;

  public isVoPlaying(): boolean {
    return this.voPlaying;
  }

  public isLineOnCooldown(id: string, cooldownMs = 12000): boolean {
    const last = this.voPerLineCooldown.get(id);
    if (last === undefined) return false;
    return performance.now() - last < cooldownMs;
  }

  /**
   * Enqueues a voice line onto the single-channel voice bus.
   * Enforces:
   * - Priority: Boss (3) > Wingman (2) > System (1)
   * - Minimum 1.5s gap between spoken clips
   * - Per-line 12s cooldown so the same clip never loops back-to-back
   */
  public enqueueVO(
    id: string,
    priority: VoicePriority,
    radioFilter = true,
    onStart?: () => void,
    bypassCooldown = false
  ): boolean {
    if (this.muted) return false;
    if (!bypassCooldown && this.isLineOnCooldown(id, 12000)) return false;

    const now = performance.now();
    const gapRemaining = Math.max(0, 1500 - (now - this.voLastEndedAt));

    if (!this.voPlaying && gapRemaining === 0) {
      this.voPerLineCooldown.set(id, now);
      if (onStart) onStart();
      void this.playVO(id, radioFilter, true);
      return true;
    }

    // Replace queued slot only if strictly higher priority (or empty)
    if (!this.voQueue || priority > this.voQueue.priority) {
      this.voQueue = { id, priority, radioFilter, onStart };
      if (!this.voPlaying && gapRemaining > 0) {
        this.scheduleQueueDrain(gapRemaining);
      }
      return true;
    }
    return false;
  }

  private scheduleQueueDrain(delayMs: number): void {
    if (this.voGapTimer !== null) {
      window.clearTimeout(this.voGapTimer);
    }
    this.voGapTimer = window.setTimeout(() => {
      this.voGapTimer = null;
      if (this.voPlaying || !this.voQueue) return;
      const next = this.voQueue;
      this.voQueue = null;
      if (this.isLineOnCooldown(next.id, 12000)) return;
      this.voPerLineCooldown.set(next.id, performance.now());
      if (next.onStart) next.onStart();
      void this.playVO(next.id, next.radioFilter, true);
    }, delayMs);
  }

  public playMusicTrack(trackId: string, loop = true, volume = 0.42, duckFactor = 0.72): void {
    this.musicActive = false;
    this.crawlMusicActive = false;
    this.bgmBaseVolume = volume;
    this.bgmDuckFactor = duckFactor;

    if (
      this.currentTrackId === trackId &&
      (this.bgmSource !== null || (this.bgmAudio && !this.bgmAudio.paused))
    ) {
      this.updateBgmDucking();
      return;
    }

    this.stopMusicTrack();
    this.currentTrackId = trackId;
    const token = ++this.bgmPlayToken;
    this.unlock();

    if (this.ctx && this.bgmGain) {
      void this.startGaplessBgm(trackId, loop, token);
      return;
    }

    this.startFallbackHtmlAudio(trackId, loop);
  }

  private async startGaplessBgm(trackId: string, loop: boolean, token: number): Promise<void> {
    try {
      if (!this.ctx || !this.bgmGain) {
        this.startFallbackHtmlAudio(trackId, loop);
        return;
      }
      let buf = this.bgmBufferCache.get(trackId);
      if (!buf) {
        const res = await fetch(`/assets/music/${trackId}.mp3`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.arrayBuffer();
        if (token !== this.bgmPlayToken || !this.ctx) return;
        buf = await this.ctx.decodeAudioData(arr);
        this.bgmBufferCache.set(trackId, buf);
      }
      if (token !== this.bgmPlayToken || !this.ctx || !this.bgmGain) return;

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      if (loop && buf.duration > 1.0) {
        // Trim LAME MP3 encoder leading/trailing padding frames for 0.000ms gapless looping!
        src.loopStart = 0.03;
        src.loopEnd = Math.max(0.5, buf.duration - 0.045);
      }
      src.connect(this.bgmGain);
      this.bgmSource = src;
      this.updateBgmDucking();
      src.start(0, loop && buf.duration > 1.0 ? 0.03 : 0);
    } catch {
      if (token === this.bgmPlayToken) {
        this.startFallbackHtmlAudio(trackId, loop);
      }
    }
  }

  private startFallbackHtmlAudio(trackId: string, loop: boolean): void {
    const audio = new Audio(`/assets/music/${trackId}.mp3`);
    audio.loop = loop;
    audio.volume = this.muted ? 0 : this.voPlaying ? this.bgmBaseVolume * this.bgmDuckFactor : this.bgmBaseVolume;
    this.bgmAudio = audio;
    audio.play().catch(() => {
      // Will start on next user gesture if autoplay is blocked
    });
  }

  public resumeMusicIfPaused(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.bgmAudio && this.bgmAudio.paused && !this.muted) {
      this.bgmAudio.play().catch(() => {});
    }
  }

  public stopMusicTrack(): void {
    this.bgmPlayToken++;
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch {
        // already stopped
      }
      this.bgmSource = null;
    }
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
    }
    this.currentTrackId = null;
  }

  private updateBgmDucking(): void {
    const targetVol = this.muted
      ? 0
      : this.voPlaying
        ? this.bgmBaseVolume * this.bgmDuckFactor
        : this.bgmBaseVolume;

    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.04);
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = targetVol;
    }
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.42;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.muted ? 0 : this.bgmBaseVolume;
      this.bgmGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.24;
      this.musicGain.connect(this.masterGain);

      this.voGain = this.ctx.createGain();
      this.voGain.gain.value = 1.95; // Punchy, crystal-clear dialogue above music & lasers!
      this.voGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.42, this.ctx.currentTime, 0.03);
    }
    this.updateBgmDucking();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMusicState(active: boolean, boss = false): void {
    this.musicActive = active;
    this.bossMode = boss;
    if (active) this.crawlMusicActive = false;
  }

  public setCrawlMusic(active: boolean): void {
    this.crawlMusicActive = active;
    if (active) {
      this.musicActive = false;
      this.crawlTimer = 0;
      this.crawlStep = 0;
    }
  }

  public updateMusic(dt: number): void {
    if (!this.ctx || !this.musicGain || this.muted) return;

    if (this.crawlMusicActive) {
      this.crawlTimer += dt;
      if (this.crawlTimer >= 0.42) {
        this.crawlTimer -= 0.42;
        this.playCrawlNote(this.crawlStep);
        this.crawlStep = (this.crawlStep + 1) % 16;
      }
      return;
    }

    if (!this.musicActive) return;
    const stepDur = this.bossMode ? 0.125 : 0.145;
    this.pulseTimer += dt;
    if (this.pulseTimer >= stepDur) {
      this.pulseTimer -= stepDur;
      this.playPulseStep(this.pulseStep);
      this.pulseStep = (this.pulseStep + 1) % 16;
    }
  }

  private playCrawlNote(step: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    // Dramatic heroic space-opera brass/synth fanfare progression
    const melody = [110, 110, 164.81, 146.83, 130.81, 123.47, 220, 164.81, 146.83, 130.81, 123.47, 220, 164.81, 146.83, 130.81, 146.83];
    const freq = melody[step % melody.length];

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 0.5, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.38);

    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.42);
    osc2.stop(now + 0.42);

    if (step % 4 === 0) {
      const timp = this.ctx.createOscillator();
      const tg = this.ctx.createGain();
      timp.type = 'sine';
      timp.frequency.setValueAtTime(92, now);
      timp.frequency.exponentialRampToValueAtTime(38, now + 0.25);
      tg.gain.setValueAtTime(0.35, now);
      tg.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      timp.connect(tg);
      tg.connect(this.musicGain);
      timp.start(now);
      timp.stop(now + 0.3);
    }
  }

  public playNovaBomb(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(220, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.85);
    sg.gain.setValueAtTime(0.6, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    sub.connect(sg);
    sg.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.92);
    this.playExplosion(true);
  }

  public playSomersault(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.28);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.55);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  public playUiHover(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.04);
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playUiConfirm(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [523.25, 783.99, 1046.5].forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.045);
      g.gain.setValueAtTime(0.14, now + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.14);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.15);
    });
  }

  public playPowerup(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now + i * 0.06);
      g.gain.setValueAtTime(0.14, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.22);
    });
  }

  private playPulseStep(step: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;

    // Driving synthwave bassline (A minor / F / G / E)
    const bassNotes = this.bossMode
      ? [55, 55, 65.41, 55, 73.42, 55, 61.74, 55, 55, 55, 82.41, 73.42, 65.41, 61.74, 55, 49]
      : [55, 55, 55, 55, 43.65, 43.65, 43.65, 43.65, 49, 49, 49, 49, 65.41, 65.41, 61.74, 55];

    const freq = bassNotes[step % bassNotes.length];
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.bossMode ? 520 : 380, now);
    filter.frequency.exponentialRampToValueAtTime(110, now + 0.12);

    g.gain.setValueAtTime(0.32, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.14);

    // Subtle arpeggio sparkle on offbeats
    if (step % 2 === 0) {
      const arpNotes = this.bossMode
        ? [220, 261.63, 329.63, 392, 440, 392, 329.63, 293.66]
        : [220, 261.63, 329.63, 440, 329.63, 261.63, 293.66, 392];
      const arp = this.ctx.createOscillator();
      const ag = this.ctx.createGain();
      arp.type = 'triangle';
      arp.frequency.setValueAtTime(arpNotes[(step / 2) % arpNotes.length], now);
      ag.gain.setValueAtTime(0.08, now);
      ag.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      arp.connect(ag);
      ag.connect(this.musicGain);
      arp.start(now);
      arp.stop(now + 0.13);
    }

    // Kick on 0, 4, 8, 12
    if (step % 4 === 0) {
      const kick = this.ctx.createOscillator();
      const kg = this.ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(125, now);
      kick.frequency.exponentialRampToValueAtTime(34, now + 0.11);
      kg.gain.setValueAtTime(0.45, now);
      kg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      kick.connect(kg);
      kg.connect(this.musicGain);
      kick.start(now);
      kick.stop(now + 0.13);
    }
  }

  public playLaser(overdrive = false, mode: 'twin' | 'spread' | 'gatling' = 'twin'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const jitter = 0.97 + Math.random() * 0.06;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    if (mode === 'gatling') {
      // Punchy rapid-fire kinetic neon autocannon!
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(780 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(165, now + 0.055);
      g.gain.setValueAtTime(0.11, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.065);
      return;
    }

    if (mode === 'spread') {
      // Wide rich harmonic 5-way spread pulse!
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1180 * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.105);
      g.gain.setValueAtTime(0.14, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      const sub = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(590 * jitter, now);
      sub.frequency.exponentialRampToValueAtTime(140, now + 0.1);
      sg.gain.setValueAtTime(0.11, now);
      sg.gain.exponentialRampToValueAtTime(0.001, now + 0.105);
      osc.connect(g);
      sub.connect(sg);
      g.connect(this.masterGain);
      sg.connect(this.masterGain);
      osc.start(now);
      sub.start(now);
      osc.stop(now + 0.115);
      sub.stop(now + 0.11);
      return;
    }

    osc.type = overdrive ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime((overdrive ? 1280 : 980) * jitter, now);
    osc.frequency.exponentialRampToValueAtTime(overdrive ? 260 : 210, now + 0.085);

    g.gain.setValueAtTime(overdrive ? 0.14 : 0.105, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playLockChirp(lockCount: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const base = 660 + lockCount * 175;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.45, now + 0.075);

    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playMissileLaunch(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.18);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playBarrelRoll(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.34);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.37);
  }

  public playDeflect(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.14);
    osc2.frequency.setValueAtTime(2220, now);
    osc2.frequency.exponentialRampToValueAtTime(980, now + 0.16);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    osc2.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.19);
    osc2.stop(now + 0.19);
  }

  public playHitTick(combo = 1): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const pitchBoost = 1 + Math.min(12, Math.max(0, combo - 1)) * 0.032;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(560 * pitchBoost, now);
    osc.frequency.exponentialRampToValueAtTime(210 * pitchBoost, now + 0.042);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.052);
  }

  public playCrystalShatter(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    [1318.5, 1760, 2349.3].forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.025);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + i * 0.025 + 0.16);
      g.gain.setValueAtTime(0.13, now + i * 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.025 + 0.18);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.025);
      osc.stop(now + i * 0.025 + 0.2);
    });
  }

  public playAirbrake(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playMultiKillStinger(tier: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const chords: number[][] = [
      [523.25, 659.25, 783.99],
      [587.33, 739.99, 880, 1174.66],
      [659.25, 830.61, 987.77, 1318.5],
      [523.25, 659.25, 783.99, 1046.5, 1567.98],
    ];
    const notes = chords[Math.min(chords.length - 1, Math.max(0, tier))];
    notes.forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.038);
      g.gain.setValueAtTime(0.14, now + i * 0.038);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.038 + 0.28);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.038);
      osc.stop(now + i * 0.038 + 0.3);
    });
  }

  public playExplosion(large = false, combo = 1): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const dur = large ? 0.7 : 0.32;
    const harmonic = 1 + Math.min(12, Math.max(0, combo - 1)) * 0.025;

    // Sub-bass boom
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime((large ? 122 : 160) * harmonic, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + dur);
    sg.gain.setValueAtTime(large ? 0.58 : 0.36, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + dur);
    sub.connect(sg);
    sg.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + dur + 0.02);

    // Punchy arcade mid-snap pop so every enemy kill feels crisp & explosive!
    const snap = this.ctx.createOscillator();
    const snapG = this.ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime((large ? 420 : 540) * harmonic, now);
    snap.frequency.exponentialRampToValueAtTime(75, now + 0.14);
    snapG.gain.setValueAtTime(large ? 0.24 : 0.16, now);
    snapG.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    snap.connect(snapG);
    snapG.connect(this.masterGain);
    snap.start(now);
    snap.stop(now + 0.16);

    // Filtered noise burst
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.35);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(large ? 1900 : 1450, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + dur);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(large ? 0.38 : 0.24, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(ng);
    ng.connect(this.masterGain);
    noise.start(now);
  }

  public playRingPickup(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((f, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.055);
      g.gain.setValueAtTime(0.18, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.22);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.23);
    });
  }

  public playPlayerHit(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(55, now + 0.22);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playBoost(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.25);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  public playBossAlarm(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.32;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.linearRampToValueAtTime(280, t + 0.24);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.28);
    }
  }

  /** Dramatic spiraling-out engine power-down whine + urgent cockpit Mayday klaxon! */
  public playShipPowerDown(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    // Falling turbine whine
    const turbine = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    turbine.type = 'sawtooth';
    turbine.frequency.setValueAtTime(640, now);
    turbine.frequency.exponentialRampToValueAtTime(68, now + 1.35);
    tg.gain.setValueAtTime(0.26, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
    turbine.connect(tg);
    tg.connect(this.masterGain);
    turbine.start(now);
    turbine.stop(now + 1.42);

    // Urgent dual-tone cockpit MAYDAY klaxon (4 rapid pulses)
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.28;
      const klax = this.ctx.createOscillator();
      const kg = this.ctx.createGain();
      klax.type = 'square';
      klax.frequency.setValueAtTime(920, t);
      klax.frequency.setValueAtTime(680, t + 0.11);
      kg.gain.setValueAtTime(0.14, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.23);
      klax.connect(kg);
      kg.connect(this.masterGain);
      klax.start(t);
      klax.stop(t + 0.25);
    }
  }

  /** Massive multi-stage player ship detonation! */
  public playShipDetonate(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const dur = 1.35;

    // Deep shattering sub-bass drop
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(18, now + dur);
    sg.gain.setValueAtTime(0.68, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + dur);
    sub.connect(sg);
    sg.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + dur + 0.04);

    // Roaring explosion noise with slow filter sweep
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.pow(1 - i / bufferSize, 1.15);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(95, now + dur);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter);
    filter.connect(ng);
    ng.connect(this.masterGain);
    noise.start(now);
  }

  /** Escalating chain-reaction explosion boom during boss meltdown! */
  public playBossChainBoom(intensity = 1.0): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const dur = 0.25 + intensity * 0.22;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125 + intensity * 55, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + dur);
    g.gain.setValueAtTime(0.32 + intensity * 0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** Crisp electric near-miss GRAZE zing! */
  public playGraze(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1650, now);
    osc.frequency.exponentialRampToValueAtTime(2800, now + 0.08);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  /** Subtle urgent cockpit critical-hull warning ping */
  public playLowShieldBeep(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1040, now);
    osc.frequency.setValueAtTime(780, now + 0.07);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /** Thrilling hyper-warp zoom-in thruster sweep on sector entry! */
  public playWarpEntry(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.45);
    osc.frequency.exponentialRampToValueAtTime(190, now + 0.9);
    osc2.frequency.setValueAtTime(190, now);
    osc2.frequency.exponentialRampToValueAtTime(1240, now + 0.45);
    osc2.frequency.exponentialRampToValueAtTime(380, now + 0.9);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    osc.connect(g);
    osc2.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.96);
    osc2.stop(now + 0.96);
  }

  /**
   * Plays a pre-generated home-lab Kokoro TTS voiceover MP3 with optional sci-fi radio bandpass filter.
   * Never cuts off or plays over an active voiceover unless `forceInterrupt` is true!
   */
  public async playVO(id: string, radioFilter = true, forceInterrupt = false): Promise<boolean> {
    if (this.muted) return false;
    if (this.voPlaying && !forceInterrupt) return false;

    this.unlock();
    if (!this.ctx || !this.voGain) return false;

    // Reserve playback slot immediately so concurrent triggers during fetch don't overlap!
    this.voPlaying = true;

    try {
      let buffer = this.voCache.get(id);
      if (!buffer) {
        const res = await fetch(`/assets/vo/${id}.mp3`);
        if (!res.ok) {
          this.voPlaying = false;
          return false;
        }
        const arr = await res.arrayBuffer();
        buffer = await this.ctx.decodeAudioData(arr);
        this.voCache.set(id, buffer);
      }

      if (this.currentVoSource) {
        try {
          this.currentVoSource.onended = null;
          this.currentVoSource.stop();
        } catch {
          // ignore
        }
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      if (radioFilter) {
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 340;
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3400;
        src.connect(hp);
        hp.connect(lp);
        lp.connect(this.voGain);
      } else {
        src.connect(this.voGain);
      }

      this.currentVoSource = src;
      this.updateBgmDucking();
      src.onended = () => {
        if (this.currentVoSource === src) {
          this.currentVoSource = null;
          this.voPlaying = false;
          this.voLastEndedAt = performance.now();
          this.updateBgmDucking();
          if (this.voQueue) {
            this.scheduleQueueDrain(1500);
          }
        }
      };
      src.start();
      return true;
    } catch {
      this.voPlaying = false;
      this.updateBgmDucking();
      return false;
    }
  }

  private lastAnnouncerAt = 0;

  /**
   * Plays short punchy arcade announcer stingers ("TRIPLE KILL!", "MEGA KILL!") cleanly without interrupting story dialogue.
   */
  public async playAnnouncerStinger(id: string): Promise<void> {
    if (this.muted) return;
    const now = performance.now();
    if (now - this.lastAnnouncerAt < 1800) return;
    this.lastAnnouncerAt = now;
    this.unlock();
    if (!this.ctx || !this.masterGain) return;
    try {
      let buffer = this.voCache.get(id);
      if (!buffer) {
        const res = await fetch(`/assets/vo/${id}.mp3`);
        if (!res.ok) return;
        buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.voCache.set(id, buffer);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const g = this.ctx.createGain();
      g.gain.value = 1.45;
      src.connect(g);
      g.connect(this.masterGain);
      src.start();
    } catch {
      // non-fatal
    }
  }

  public stopVO(): void {
    if (this.voGapTimer !== null) {
      window.clearTimeout(this.voGapTimer);
      this.voGapTimer = null;
    }
    this.voQueue = null;
    if (this.currentVoSource) {
      try {
        this.currentVoSource.onended = null;
        this.currentVoSource.stop();
      } catch {
        // ignore
      }
      this.currentVoSource = null;
    }
    this.voPlaying = false;
    this.updateBgmDucking();
  }
}
