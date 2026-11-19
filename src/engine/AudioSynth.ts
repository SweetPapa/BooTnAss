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

  // Real MP3 background music engine
  private bgmAudio: HTMLAudioElement | null = null;
  private currentTrackId: string | null = null;
  private bgmBaseVolume = 0.42;
  private bgmDuckFactor = 0.72; // Gentle ducking during gameplay so music stays punchy!

  // Cached voiceover AudioBuffers
  private voCache = new Map<string, AudioBuffer>();
  private currentVoSource: AudioBufferSourceNode | null = null;
  private voPlaying = false;

  public isVoPlaying(): boolean {
    return this.voPlaying;
  }

  public playMusicTrack(trackId: string, loop = true, volume = 0.42, duckFactor = 0.72): void {
    this.musicActive = false;
    this.crawlMusicActive = false;
    this.bgmBaseVolume = volume;
    this.bgmDuckFactor = duckFactor;

    if (this.currentTrackId === trackId && this.bgmAudio && !this.bgmAudio.paused) {
      this.updateBgmDucking();
      return;
    }

    this.stopMusicTrack();
    this.currentTrackId = trackId;
    const audio = new Audio(`/assets/music/${trackId}.mp3`);
    audio.loop = loop;
    audio.volume = this.muted ? 0 : this.voPlaying ? volume * duckFactor : volume;
    this.bgmAudio = audio;
    audio.play().catch(() => {
      // Will start on next user gesture if autoplay is blocked
    });
  }

  public resumeMusicIfPaused(): void {
    if (this.bgmAudio && this.bgmAudio.paused && !this.muted) {
      this.bgmAudio.play().catch(() => {});
    }
  }

  public stopMusicTrack(): void {
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.currentTime = 0;
      this.bgmAudio = null;
    }
    this.currentTrackId = null;
  }

  private updateBgmDucking(): void {
    if (!this.bgmAudio) return;
    if (this.muted) {
      this.bgmAudio.volume = 0;
    } else {
      this.bgmAudio.volume = this.voPlaying
        ? this.bgmBaseVolume * this.bgmDuckFactor
        : this.bgmBaseVolume;
    }
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.42;
      this.masterGain.connect(this.ctx.destination);

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

  public playLaser(overdrive = false): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = overdrive ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(overdrive ? 1280 : 980, now);
    osc.frequency.exponentialRampToValueAtTime(overdrive ? 260 : 210, now + 0.085);

    g.gain.setValueAtTime(overdrive ? 0.15 : 0.11, now);
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

  public playHitTick(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playExplosion(large = false): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const dur = large ? 0.65 : 0.28;

    // Sub-bass boom
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(large ? 115 : 150, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + dur);
    sg.gain.setValueAtTime(large ? 0.55 : 0.34, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + dur);
    sub.connect(sg);
    sg.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + dur + 0.02);

    // Filtered noise burst
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.4);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(large ? 1600 : 1200, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + dur);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(large ? 0.36 : 0.22, now);
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
          this.updateBgmDucking();
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

  public stopVO(): void {
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
