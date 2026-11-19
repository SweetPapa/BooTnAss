import type { GamePhase, GameState } from '../engine/GameState';
import type { LevelConfig } from '../levels/LevelSchema';
import type { LevelLoadError } from '../levels/LevelLoader';

export interface StoryCrawlData {
  episode: string;
  title: string;
  subtitle: string;
  speed: number;
  paragraphs: string[];
}

export interface HudCallbacks {
  onBootStart: () => void;
  onCrawlFinished: () => void;
  onStartCampaign: () => void;
  onOpenLevelSelect: () => void;
  onReplayCrawl: () => void;
  onSelectLevel: (index: number) => void;
  onBackToTitle: () => void;
  onNextLevel: () => void;
  onRetryLevel: () => void;
  onRetryBoss: () => void;
  onResume: () => void;
  onToggleMouseAim: () => void;
  onToggleMute: () => void;
  onToggleNintendoLayout: () => void;
  onTestRumble: () => string;
  onUiHover: () => void;
  onUiConfirm: () => void;
  onPlayCrawlVO: () => void;
}

export interface ReticleScreenState {
  nearX: number;
  nearY: number;
  farX: number;
  farY: number;
  charging: boolean;
  lockPoints: Array<{ x: number; y: number }>;
}

export interface LoadoutHudState {
  weaponMode: 'twin' | 'spread' | 'gatling';
  weaponTimer: number;
  novaBombs: number;
  gamepadConnected: boolean;
}

export type CommsSpeaker = 'commander' | 'wingman' | 'boss' | 'grunt' | 'mechanic';

const LEVEL_ART_MAP: Record<string, string> = {
  'neon-canyon': '/assets/art/level-01.jpg',
  'prism-belt': '/assets/art/level-02.jpg',
  'hyper-spire': '/assets/art/level-03.jpg',
};

export class HUD {
  private readonly root: HTMLElement;
  private readonly cb: HudCallbacks;

  // Persistent HUD DOM refs during Playing
  private hudLayer: HTMLElement | null = null;
  private shieldFill: HTMLElement | null = null;
  private shieldVal: HTMLElement | null = null;
  private boostFill: HTMLElement | null = null;
  private scoreEl: HTMLElement | null = null;
  private comboEl: HTMLElement | null = null;
  private comboDecayFill: HTMLElement | null = null;
  private progressFill: HTMLElement | null = null;
  private levelNameEl: HTMLElement | null = null;
  private bossWrap: HTMLElement | null = null;
  private bossNameEl: HTMLElement | null = null;
  private bossPhaseEl: HTMLElement | null = null;
  private bossHpFill: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private commsBox: HTMLElement | null = null;
  private commsImg: HTMLImageElement | null = null;
  private commsSpeakerEl: HTMLElement | null = null;
  private commsMsgEl: HTMLElement | null = null;
  private reticleNear: HTMLElement | null = null;
  private reticleFar: HTMLElement | null = null;
  private lockContainer: HTMLElement | null = null;
  private damageFlashEl: HTMLElement | null = null;
  private energyVignetteEl: HTMLElement | null = null;
  private popupContainer: HTMLElement | null = null;
  private hitConfirmTimer = 0;
  private activeCutsceneDone: (() => void) | null = null;
  private activeCutsceneEl: HTMLElement | null = null;

  public playCutscene(videoId: string, muted: boolean, onDone: () => void): void {
    this.skipActiveCutscene(false);

    const overlay = document.createElement('div');
    overlay.className = 'cutscene-overlay interactive';
    overlay.innerHTML = `
      <video class="cutscene-video" playsinline autoplay ${muted ? 'muted' : ''}>
        <source src="/assets/video/${videoId}.mp4" type="video/mp4" />
      </video>
      <div class="cutscene-skip-bar">
        <button id="btn-cutscene-skip" class="neon-btn small">SKIP [SPACE / A]</button>
      </div>
    `;
    this.root.appendChild(overlay);
    this.activeCutsceneEl = overlay;
    this.activeCutsceneDone = onDone;

    const video = overlay.querySelector('video') as HTMLVideoElement;
    const finish = () => this.skipActiveCutscene(true);

    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    overlay.querySelector('#btn-cutscene-skip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      finish();
    });

    video.play().catch(() => {
      // Fallback: if unmuted autoplay is blocked, play muted so the cutscene never hangs
      video.muted = true;
      video.play().catch(finish);
    });
  }

  public skipActiveCutscene(invokeCallback = true): void {
    if (this.activeCutsceneEl) {
      const vid = this.activeCutsceneEl.querySelector('video');
      if (vid) {
        vid.pause();
        vid.src = '';
      }
      this.activeCutsceneEl.remove();
      this.activeCutsceneEl = null;
    }
    const cb = this.activeCutsceneDone;
    this.activeCutsceneDone = null;
    if (invokeCallback && cb) cb();
  }

  public get isCutscenePlaying(): boolean {
    return this.activeCutsceneEl !== null;
  }
  private mousePill: HTMLElement | null = null;
  private mutePill: HTMLElement | null = null;
  private weaponPill: HTMLElement | null = null;
  private bombPill: HTMLElement | null = null;
  private padPill: HTMLElement | null = null;
  private hasBossCheckpoint = false;
  private controllerLabel = 'NO CONTROLLER DETECTED (PRESS ANY PAD BUTTON)';
  private nintendoLayout = false;

  public setBossCheckpoint(active: boolean): void {
    this.hasBossCheckpoint = active;
  }

  public setControllerInfo(connected: boolean, profile: string, name: string, nintendoLayout: boolean): void {
    this.nintendoLayout = nintendoLayout;
    if (connected) {
      const shortName = name.length > 34 ? name.slice(0, 34) + '…' : name;
      this.controllerLabel = `🎮 ${profile.toUpperCase()} READY // ${shortName}`;
    } else {
      this.controllerLabel = 'NO CONTROLLER DETECTED (PRESS ANY PAD BUTTON)';
    }
    const labelEl = document.getElementById('pad-status-label');
    if (labelEl) labelEl.textContent = this.controllerLabel;
  }

  private bindArcadeButtonJuice(): void {
    this.root.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('mouseenter', () => this.cb.onUiHover());
      btn.addEventListener('click', () => this.cb.onUiConfirm());
    });
  }

  private bannerTimer = 0;
  private commsTimer = 0;
  private damageFlashTimer = 0;
  private crawlTimeout: number | null = null;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.root = root;
    this.cb = callbacks;
  }

  public async loadStoryFile(): Promise<StoryCrawlData> {
    const fallback: StoryCrawlData = {
      episode: 'TRANSMISSION IV',
      title: 'STARBURST',
      subtitle: 'THE NEON FRONTIER',
      speed: 1.0,
      paragraphs: [
        'Across the Outer Rim, the rogue Hyper-Grid has seized the ancient relay trenches.',
        'Launch the prototype VANGUARD-X interceptor and reclaim the Neon Frontier.',
      ],
    };

    try {
      const res = await fetch('/story.txt', { cache: 'no-cache' });
      if (!res.ok) return fallback;
      const text = await res.text();
      return this.parseStoryText(text, fallback);
    } catch {
      return fallback;
    }
  }

  private parseStoryText(raw: string, fallback: StoryCrawlData): StoryCrawlData {
    const data: StoryCrawlData = { ...fallback, paragraphs: [] };
    const lines = raw.split(/\r?\n/);
    let currentPara: string[] = [];

    const flushPara = () => {
      if (currentPara.length > 0) {
        data.paragraphs.push(currentPara.join(' ').trim());
        currentPara = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) continue;
      if (trimmed === '') {
        flushPara();
        continue;
      }
      if (trimmed.startsWith('EPISODE:')) {
        data.episode = trimmed.slice('EPISODE:'.length).trim();
      } else if (trimmed.startsWith('TITLE:')) {
        data.title = trimmed.slice('TITLE:'.length).trim();
      } else if (trimmed.startsWith('SUBTITLE:')) {
        data.subtitle = trimmed.slice('SUBTITLE:'.length).trim();
      } else if (trimmed.startsWith('SPEED:')) {
        const s = parseFloat(trimmed.slice('SPEED:'.length).trim());
        if (!Number.isNaN(s) && s > 0.2 && s < 4) data.speed = s;
      } else {
        currentPara.push(trimmed);
      }
    }
    flushPara();
    if (data.paragraphs.length === 0) data.paragraphs = fallback.paragraphs;
    return data;
  }

  public showValidationErrors(errors: LevelLoadError[]): void {
    const text = errors.map((e) => `FILE: ${e.file}\n${e.message}`).join('\n\n────────────────────────\n\n');
    this.root.innerHTML = `
      <div class="error-overlay interactive">
        <div class="error-box">
          <h2>LEVEL YAML VALIDATION ERROR</h2>
          <p style="margin-bottom:12px;color:#ffb8c6;">Fix the YAML schema errors below and Vite will hot-reload automatically:</p>
          <pre>${this.escapeHtml(text)}</pre>
        </div>
      </div>
    `;
  }

  public renderPhase(
    phase: GamePhase,
    state: GameState,
    levels: LevelConfig[],
    story?: StoryCrawlData
  ): void {
    if (this.crawlTimeout !== null) {
      window.clearTimeout(this.crawlTimeout);
      this.crawlTimeout = null;
    }

    if (phase === 'Boot') {
      this.renderBootStart();
      return;
    }

    if (phase === 'Crawl' && story) {
      this.renderCrawl(story);
      return;
    }

    if (phase === 'Title') {
      this.renderTitle(state);
      return;
    }

    if (phase === 'LevelSelect') {
      this.renderLevelSelect(levels);
      return;
    }

    if (phase === 'Playing') {
      this.mountPlayingHud(state, levels[state.currentLevelIndex]);
      return;
    }

    if (phase === 'Paused') {
      this.renderPauseOverlay();
      return;
    }

    if (phase === 'LevelClear') {
      this.renderLevelClear(state, levels);
      return;
    }

    if (phase === 'GameOver') {
      this.renderGameOver(state);
      return;
    }

    if (phase === 'Victory') {
      this.renderVictory(state);
    }
  }

  private renderBootStart(): void {
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="title-hero-card">
          <div class="game-logo" style="margin-bottom:8px;">BOOT N ASS</div>
          <div class="game-tagline" style="margin-bottom:38px;">GALACTIC ARCADE SPACE SHOOTER</div>
          <button id="btn-boot-start" class="boot-start-btn">START</button>
          <div style="margin-top:26px;font-family:var(--font-display);font-size:0.82rem;letter-spacing:0.26em;color:rgba(232,246,255,0.68);">
            CLICK START &nbsp;•&nbsp; PRESS SPACE / ENTER &nbsp;•&nbsp; OR CONTROLLER [A]
          </div>
        </div>
      </div>
    `;
    document.getElementById('btn-boot-start')?.addEventListener('click', () => this.cb.onBootStart());
  }

  private renderCrawl(story: StoryCrawlData): void {
    // 48s base duration ensures the 40.1s narration finishes cleanly with theatrical breathing room!
    const durationSec = Math.round(48 / Math.max(0.4, story.speed));
    const paragraphsHtml = story.paragraphs
      .map((p) => `<p class="crawl-paragraph">${this.escapeHtml(p)}</p>`)
      .join('');

    this.root.innerHTML = `
      <div class="crawl-overlay interactive">
        <div class="crawl-stage">
          <div class="crawl-plane">
            <div class="crawl-content" style="--crawl-duration: ${durationSec}s">
              <div class="crawl-episode">${this.escapeHtml(story.episode)}</div>
              <div class="crawl-title">${this.escapeHtml(story.title)}</div>
              <div class="crawl-subtitle">${this.escapeHtml(story.subtitle)}</div>
              ${paragraphsHtml}
            </div>
          </div>
        </div>
        <div class="crawl-hint">CONFIGURABLE VIA public/story.txt &nbsp;|&nbsp; CLICK OR PRESS ANY BUTTON IF AUDIO IS PAUSED</div>
        <div class="crawl-controls">
          <button id="btn-crawl-vo" class="neon-btn small secondary">REPLAY AUDIO</button>
          <button id="btn-crawl-skip" class="neon-btn small">SKIP CRAWL [SPACE / A]</button>
        </div>
      </div>
    `;

    document.getElementById('btn-crawl-skip')?.addEventListener('click', () => {
      this.cb.onCrawlFinished();
    });
    document.getElementById('btn-crawl-vo')?.addEventListener('click', () => {
      this.cb.onPlayCrawlVO();
    });

    this.crawlTimeout = window.setTimeout(() => {
      this.cb.onCrawlFinished();
    }, durationSec * 1000);
  }

  private renderTitle(state: GameState): void {
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="title-hero-card">
          <div class="game-logo">STARBURST</div>
          <div class="game-tagline">ON-RAILS NEON ARCADE SHOOTER</div>
          <div class="menu-actions">
            <button id="btn-start" class="neon-btn">LAUNCH CAMPAIGN</button>
            <button id="btn-levels" class="neon-btn secondary">SELECT SECTOR</button>
            <button id="btn-story" class="neon-btn secondary">OPENING CRAWL</button>
          </div>
          <div class="menu-actions" style="margin-bottom:14px;">
            <button id="btn-mouse-aim" class="neon-btn small secondary">
              MOUSE AIM: ${state.mouseAimEnabled ? 'ON' : 'OFF'}
            </button>
            <button id="btn-mute" class="neon-btn small secondary">
              AUDIO: ${state.muted ? 'MUTED' : 'ON'}
            </button>
            <button id="btn-pad-layout" class="neon-btn small secondary">
              PAD A/B: ${this.nintendoLayout ? '8BITDO / NINTENDO' : 'XBOX / PS'}
            </button>
            <button id="btn-test-rumble" class="neon-btn small secondary">
              TEST RUMBLE
            </button>
          </div>
          <div class="pad-status-bar">
            <span id="pad-status-label">${this.escapeHtml(this.controllerLabel)}</span>
            <span id="rumble-feedback" class="rumble-msg"></span>
          </div>
          <div class="controls-grid">
            <div class="control-item"><span class="control-key">WASD / L-STICK</span> Fly &amp; Bank</div>
            <div class="control-item"><span class="control-key">SPACE / RT / A</span> Rapid Plasma</div>
            <div class="control-item"><span class="control-key">SHIFT / LT / B</span> Quad Lock-On</div>
            <div class="control-item"><span class="control-key">Q/E / LB/RB</span> Barrel Roll Deflect</div>
            <div class="control-item"><span class="control-key">R / Y</span> Somersault EMP Flip</div>
            <div class="control-item"><span class="control-key">B / X</span> Nova Smart Bomb</div>
            <div class="control-item"><span class="control-key">F / L3</span> Boost &nbsp; <span class="control-key">C / R3</span> Brake</div>
            <div class="control-item"><span class="control-key">BLUETOOTH PAD</span> Native Rumble + Sticks</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-start')?.addEventListener('click', () => this.cb.onStartCampaign());
    document.getElementById('btn-levels')?.addEventListener('click', () => this.cb.onOpenLevelSelect());
    document.getElementById('btn-story')?.addEventListener('click', () => this.cb.onReplayCrawl());
    document.getElementById('btn-mouse-aim')?.addEventListener('click', () => this.cb.onToggleMouseAim());
    document.getElementById('btn-mute')?.addEventListener('click', () => this.cb.onToggleMute());
    document.getElementById('btn-pad-layout')?.addEventListener('click', () => this.cb.onToggleNintendoLayout());
    document.getElementById('btn-test-rumble')?.addEventListener('click', () => {
      const msg = this.cb.onTestRumble();
      const el = document.getElementById('rumble-feedback');
      if (el) el.textContent = msg;
    });
    this.bindArcadeButtonJuice();
  }

  private renderLevelSelect(levels: LevelConfig[]): void {
    const cards = levels
      .map((lvl, idx) => {
        const art = LEVEL_ART_MAP[lvl.id];
        const bgStyle = art
          ? `background-image:url('${art}')`
          : `background:linear-gradient(135deg, ${lvl.environment.skyColor}, ${lvl.environment.primaryColor}44, ${lvl.environment.secondaryColor}44)`;
        return `
          <button class="level-card" data-idx="${idx}">
            <div class="level-card-art" style="${bgStyle}"></div>
            <div class="level-card-body">
              <div class="level-card-title">${this.escapeHtml(lvl.name)}</div>
              <div class="level-card-sub">${this.escapeHtml(lvl.subtitle)}</div>
              <div class="level-card-meta">
                <span>THEME: ${lvl.environment.theme.toUpperCase()}</span>
                <span>SPEED: ${lvl.baseSpeed}</span>
              </div>
            </div>
          </button>
        `;
      })
      .join('');

    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="game-logo" style="font-size:2.6rem;margin-bottom:4px;">SELECT SECTOR</div>
        <div class="game-tagline" style="margin-bottom:8px;">DROP ANY .YAML INTO src/levels/data/ TO REGISTER</div>
        <div class="level-grid">${cards}</div>
        <button id="btn-back" class="neon-btn secondary">BACK TO BRIDGE</button>
      </div>
    `;

    this.root.querySelectorAll('.level-card').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number((el as HTMLElement).dataset.idx);
        this.cb.onSelectLevel(idx);
      });
    });
    document.getElementById('btn-back')?.addEventListener('click', () => this.cb.onBackToTitle());
  }

  private mountPlayingHud(state: GameState, level: LevelConfig): void {
    this.root.innerHTML = `
      <div class="hud-layer">
        <div class="damage-flash" id="damage-flash"></div>
        <div class="energy-vignette" id="energy-vignette"></div>
        <div id="popup-container"></div>

        <div class="hud-top-left">
          <div>
            <div class="hud-bar-label"><span>SHIELD</span><span id="hud-shield-val">100%</span></div>
            <div class="hud-bar-track"><div class="hud-bar-fill shield" id="hud-shield-fill" style="width:100%"></div></div>
          </div>
          <div>
            <div class="hud-bar-label"><span>BOOST / BRAKE</span><span>F / C</span></div>
            <div class="hud-bar-track"><div class="hud-bar-fill boost" id="hud-boost-fill" style="width:100%"></div></div>
          </div>
        </div>

        <div class="hud-top-center">
          <div class="hud-level-name" id="hud-level-name">${this.escapeHtml(level.name)}</div>
          <div class="hud-progress-track"><div class="hud-progress-fill" id="hud-progress-fill" style="width:0%"></div></div>
          <div class="boss-hp-wrap" id="boss-hp-wrap" style="display:none;">
            <div class="boss-hp-header">
              <span id="boss-name">BOSS</span>
              <span id="boss-phase">PHASE 1</span>
            </div>
            <div class="boss-hp-track"><div class="boss-hp-fill" id="boss-hp-fill" style="width:100%"></div></div>
          </div>
        </div>

        <div class="hud-top-right">
          <div class="hud-score" id="hud-score">000000</div>
          <div class="hud-combo-wrap">
            <div class="hud-combo" id="hud-combo">1x</div>
            <div class="hud-combo-decay"><div class="hud-combo-decay-fill" id="hud-combo-decay" style="width:0%"></div></div>
          </div>
        </div>

        <div class="hud-banner" id="hud-banner"></div>

        <div class="comms-box" id="comms-box">
          <img class="comms-portrait" id="comms-img" src="/assets/art/portrait-commander.jpg" alt="" />
          <div class="comms-text-wrap">
            <div class="comms-speaker" id="comms-speaker">COMMANDER VEX</div>
            <div class="comms-message" id="comms-msg"></div>
          </div>
        </div>

        <div class="reticle-far" id="reticle-far"></div>
        <div class="reticle-near" id="reticle-near"></div>
        <div id="lock-container"></div>

        <div class="hud-bottom-right interactive">
          <div class="hud-pill active" id="pill-weapon">WPN: TWIN</div>
          <div class="hud-pill active" id="pill-bomb">NOVA [B/X]: 2</div>
          <div class="hud-pill" id="pill-pad" style="display:none;">🎮 PAD READY</div>
          <button class="hud-pill ${state.mouseAimEnabled ? 'active' : ''}" id="pill-mouse">MOUSE [M]</button>
          <button class="hud-pill ${state.muted ? '' : 'active'}" id="pill-mute">AUDIO [N]</button>
        </div>
      </div>
    `;

    this.hudLayer = this.root.querySelector('.hud-layer');
    this.shieldFill = document.getElementById('hud-shield-fill');
    this.shieldVal = document.getElementById('hud-shield-val');
    this.boostFill = document.getElementById('hud-boost-fill');
    this.scoreEl = document.getElementById('hud-score');
    this.comboEl = document.getElementById('hud-combo');
    this.comboDecayFill = document.getElementById('hud-combo-decay');
    this.progressFill = document.getElementById('hud-progress-fill');
    this.levelNameEl = document.getElementById('hud-level-name');
    this.bossWrap = document.getElementById('boss-hp-wrap');
    this.bossNameEl = document.getElementById('boss-name');
    this.bossPhaseEl = document.getElementById('boss-phase');
    this.bossHpFill = document.getElementById('boss-hp-fill');
    this.bannerEl = document.getElementById('hud-banner');
    this.commsBox = document.getElementById('comms-box');
    this.commsImg = document.getElementById('comms-img') as HTMLImageElement | null;
    this.commsSpeakerEl = document.getElementById('comms-speaker');
    this.commsMsgEl = document.getElementById('comms-msg');
    this.reticleNear = document.getElementById('reticle-near');
    this.reticleFar = document.getElementById('reticle-far');
    this.lockContainer = document.getElementById('lock-container');
    this.damageFlashEl = document.getElementById('damage-flash');
    this.energyVignetteEl = document.getElementById('energy-vignette');
    this.popupContainer = document.getElementById('popup-container');
    this.mousePill = document.getElementById('pill-mouse');
    this.mutePill = document.getElementById('pill-mute');
    this.weaponPill = document.getElementById('pill-weapon');
    this.bombPill = document.getElementById('pill-bomb');
    this.padPill = document.getElementById('pill-pad');

    this.mousePill?.addEventListener('click', () => this.cb.onToggleMouseAim());
    this.mutePill?.addEventListener('click', () => this.cb.onToggleMute());
  }

  public updatePlayingHud(
    dt: number,
    state: GameState,
    shieldPct: number,
    boostPct: number,
    progressPct: number,
    bossInfo: { active: boolean; name: string; phase: number; hpPct: number },
    reticle: ReticleScreenState,
    loadout: LoadoutHudState
  ): void {
    if (!this.hudLayer) return;

    if (this.shieldFill && this.shieldVal) {
      const s = Math.max(0, Math.round(shieldPct));
      this.shieldFill.style.width = `${s}%`;
      this.shieldFill.classList.toggle('low', s <= 30);
      this.shieldVal.textContent = `${s}%`;
    }
    if (this.boostFill) {
      this.boostFill.style.width = `${Math.max(0, Math.round(boostPct))}%`;
    }
    if (this.scoreEl) {
      this.scoreEl.textContent = String(state.stats.score).padStart(6, '0');
    }
    if (this.comboEl && this.comboDecayFill) {
      const over = state.isOverdrive;
      this.comboEl.textContent = over ? `${state.stats.combo}x OVERDRIVE` : `${state.stats.combo}x`;
      this.comboEl.classList.toggle('overdrive', over);
      this.comboDecayFill.style.width = `${Math.min(100, (state.stats.comboTimer / 4.0) * 100)}%`;
    }
    if (this.progressFill) {
      this.progressFill.style.width = `${Math.min(100, progressPct * 100)}%`;
    }
    if (this.bossWrap && this.bossNameEl && this.bossPhaseEl && this.bossHpFill) {
      this.bossWrap.style.display = bossInfo.active ? 'block' : 'none';
      if (bossInfo.active) {
        this.bossNameEl.textContent = bossInfo.name;
        this.bossPhaseEl.textContent = `PHASE ${bossInfo.phase}`;
        this.bossHpFill.style.width = `${Math.max(0, Math.min(100, bossInfo.hpPct * 100))}%`;
      }
    }

    // Reticles
    if (this.reticleNear && this.reticleFar) {
      this.reticleNear.style.left = `${reticle.nearX}px`;
      this.reticleNear.style.top = `${reticle.nearY}px`;
      this.reticleNear.classList.toggle('charging', reticle.charging);
      this.reticleFar.style.left = `${reticle.farX}px`;
      this.reticleFar.style.top = `${reticle.farY}px`;
    }

    // Lock-on diamond brackets
    if (this.lockContainer) {
      if (reticle.lockPoints.length === 0) {
        if (this.lockContainer.childElementCount > 0) this.lockContainer.innerHTML = '';
      } else {
        this.lockContainer.innerHTML = reticle.lockPoints
          .map(
            (pt) =>
              `<div class="lock-bracket" style="left:${pt.x.toFixed(1)}px;top:${pt.y.toFixed(1)}px;"></div>`
          )
          .join('');
      }
    }

    // Pills
    this.mousePill?.classList.toggle('active', state.mouseAimEnabled);
    this.mutePill?.classList.toggle('active', !state.muted);
    if (this.weaponPill) {
      const label =
        loadout.weaponMode === 'spread'
          ? `SPREAD 5x (${Math.ceil(loadout.weaponTimer)}s)`
          : loadout.weaponMode === 'gatling'
            ? `GATLING (${Math.ceil(loadout.weaponTimer)}s)`
            : 'WPN: TWIN';
      this.weaponPill.textContent = label;
      this.weaponPill.classList.toggle('active', loadout.weaponMode !== 'twin');
    }
    if (this.bombPill) {
      this.bombPill.textContent = `NOVA [B/X]: ${loadout.novaBombs}`;
      this.bombPill.classList.toggle('active', loadout.novaBombs > 0);
    }
    if (this.padPill) {
      this.padPill.style.display = loadout.gamepadConnected ? 'inline-block' : 'none';
      this.padPill.classList.add('active');
    }

    // Timers
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0 && this.bannerEl) {
        this.bannerEl.classList.remove('visible');
      }
    }
    if (this.commsTimer > 0) {
      this.commsTimer -= dt;
      if (this.commsTimer <= 0 && this.commsBox) {
        this.commsBox.classList.remove('visible');
      }
    }
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= dt;
      if (this.damageFlashTimer <= 0 && this.damageFlashEl) {
        this.damageFlashEl.classList.remove('hit');
      }
    }
    if (this.hitConfirmTimer > 0) {
      this.hitConfirmTimer -= dt;
      if (this.hitConfirmTimer <= 0 && this.reticleNear) {
        this.reticleNear.classList.remove('hit-confirm');
      }
    }
    if (this.energyVignetteEl) {
      this.energyVignetteEl.classList.toggle('overdrive', state.isOverdrive);
    }
    void this.levelNameEl;
  }

  public setTurboGlow(active: boolean): void {
    this.energyVignetteEl?.classList.toggle('turbo', active);
  }

  public triggerHitMarker(): void {
    if (!this.reticleNear) return;
    this.reticleNear.classList.add('hit-confirm');
    this.hitConfirmTimer = 0.09;
  }

  public spawnFloatingText(x: number, y: number, text: string, color = '#ffd447'): void {
    if (!this.popupContainer) return;
    if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) return;
    const el = document.createElement('div');
    el.className = 'float-popup';
    el.style.left = `${x.toFixed(0)}px`;
    el.style.top = `${y.toFixed(0)}px`;
    el.style.color = color;
    el.textContent = text;
    this.popupContainer.appendChild(el);
    window.setTimeout(() => el.remove(), 860);
  }

  public showBanner(text: string, duration = 2.6): void {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add('visible');
    this.bannerTimer = duration;
  }

  public showComms(speaker: CommsSpeaker, message: string, duration = 3.8): void {
    if (!this.commsBox || !this.commsImg || !this.commsSpeakerEl || !this.commsMsgEl) return;

    const meta: Record<CommsSpeaker, { label: string; img: string; isBoss: boolean }> = {
      commander: { label: 'COMMANDER VEX // FLEET OPS', img: '/assets/art/portrait-commander.jpg', isBoss: false },
      wingman: { label: 'ACE PILOT NOVA // WING 2', img: '/assets/art/portrait-wingman.jpg', isBoss: false },
      boss: { label: 'WARLORD CORE // BOOT N ASS', img: '/assets/art/portrait-boss.jpg', isBoss: true },
      grunt: { label: 'ALIEN GRUNT // PANICKING', img: '/assets/art/portrait-grunt.jpg', isBoss: true },
      mechanic: { label: 'ZORP // WEAPONS MECHANIC', img: '/assets/art/portrait-shop.jpg', isBoss: false },
    };

    const m = meta[speaker];
    this.commsImg.src = m.img;
    this.commsSpeakerEl.textContent = m.label;
    this.commsMsgEl.textContent = message;
    this.commsBox.classList.toggle('boss', m.isBoss);
    this.commsBox.classList.add('visible');
    this.commsTimer = duration;
  }

  public triggerDamageFlash(): void {
    if (!this.damageFlashEl) return;
    this.damageFlashEl.classList.add('hit');
    this.damageFlashTimer = 0.22;
  }

  private renderPauseOverlay(): void {
    const existing = document.getElementById('pause-modal');
    if (existing) return;
    const modal = document.createElement('div');
    modal.id = 'pause-modal';
    modal.className = 'menu-screen interactive';
    modal.innerHTML = `
      <div class="tally-card">
        <div class="tally-title">SYSTEMS PAUSED</div>
        <div class="menu-actions" style="margin-bottom:0;">
          <button id="btn-resume" class="neon-btn">RESUME FLIGHT</button>
          <button id="btn-pause-retry" class="neon-btn secondary">RESTART SECTOR</button>
          <button id="btn-pause-menu" class="neon-btn secondary">MAIN BRIDGE</button>
        </div>
      </div>
    `;
    this.root.appendChild(modal);
    document.getElementById('btn-resume')?.addEventListener('click', () => this.cb.onResume());
    document.getElementById('btn-pause-retry')?.addEventListener('click', () => this.cb.onRetryLevel());
    document.getElementById('btn-pause-menu')?.addEventListener('click', () => this.cb.onBackToTitle());
  }

  public removePauseOverlay(): void {
    document.getElementById('pause-modal')?.remove();
  }

  private renderLevelClear(state: GameState, levels: LevelConfig[]): void {
    const { rank, shieldBonus, totalLevelScore } = state.computeRank();
    const hasNext = state.currentLevelIndex + 1 < levels.length;
    const lvl = levels[state.currentLevelIndex];

    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="tally-card">
          <div class="tally-title">SECTOR CLEAR</div>
          <div style="color:var(--gold);letter-spacing:0.2em;margin-bottom:6px;">${this.escapeHtml(lvl.name)}</div>
          <div class="tally-rank">${rank}</div>
          <div class="tally-rows">
            <div class="tally-row"><span>COMBAT SCORE</span><span>${state.stats.score.toLocaleString()}</span></div>
            <div class="tally-row"><span>ACCURACY</span><span>${state.getAccuracyPercent()}%</span></div>
            <div class="tally-row"><span>MAX COMBO</span><span>${state.stats.maxCombo}x</span></div>
            <div class="tally-row"><span>DEFLECTIONS</span><span>${state.stats.deflections}</span></div>
            <div class="tally-row"><span>SHIELD BONUS (${Math.round(state.stats.shieldRemaining)}%)</span><span>+${shieldBonus.toLocaleString()}</span></div>
            <div class="tally-row" style="font-weight:700;"><span>SECTOR TOTAL</span><span>${totalLevelScore.toLocaleString()}</span></div>
          </div>
          <div class="menu-actions" style="margin-bottom:0;">
            ${hasNext ? '<button id="btn-next" class="neon-btn">NEXT SECTOR</button>' : '<button id="btn-next" class="neon-btn">VIEW VICTORY</button>'}
            <button id="btn-retry" class="neon-btn secondary">REPLAY</button>
            <button id="btn-menu" class="neon-btn secondary">BRIDGE</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-next')?.addEventListener('click', () => this.cb.onNextLevel());
    document.getElementById('btn-retry')?.addEventListener('click', () => this.cb.onRetryLevel());
    document.getElementById('btn-menu')?.addEventListener('click', () => this.cb.onBackToTitle());
  }

  private renderGameOver(state: GameState): void {
    const bossBtn = this.hasBossCheckpoint
      ? '<button id="btn-retry-boss" class="neon-btn">RETRY BOSS CHECKPOINT [A]</button>'
      : '';
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="tally-card" style="border-color:var(--crimson);">
          <div class="tally-title" style="color:var(--crimson);">SIGNAL LOST</div>
          <div class="tally-rows">
            <div class="tally-row"><span>SCORE</span><span>${state.stats.score.toLocaleString()}</span></div>
            <div class="tally-row"><span>MAX COMBO</span><span>${state.stats.maxCombo}x</span></div>
            <div class="tally-row"><span>ENEMIES DESTROYED</span><span>${state.stats.enemiesDestroyed}</span></div>
          </div>
          <div class="menu-actions" style="margin-bottom:0;">
            ${bossBtn}
            <button id="btn-retry" class="neon-btn ${this.hasBossCheckpoint ? 'secondary' : ''}">RESTART SECTOR</button>
            <button id="btn-menu" class="neon-btn secondary">MAIN BRIDGE</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('btn-retry-boss')?.addEventListener('click', () => this.cb.onRetryBoss());
    document.getElementById('btn-retry')?.addEventListener('click', () => this.cb.onRetryLevel());
    document.getElementById('btn-menu')?.addEventListener('click', () => this.cb.onBackToTitle());
  }

  private renderVictory(state: GameState): void {
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="tally-card" style="border-color:var(--gold);">
          <div class="tally-title" style="color:var(--gold);">FRONTIER LIBERATED</div>
          <p style="margin-bottom:18px;font-size:1.1rem;color:#dff6ff;">
            The Hyper-Grid core has been shattered. All relay sectors are back under Starfleet control!
          </p>
          <div class="tally-rows">
            <div class="tally-row"><span>TOTAL CAMPAIGN SCORE</span><span>${state.totalCampaignScore.toLocaleString()}</span></div>
          </div>
          <div class="menu-actions" style="margin-bottom:0;">
            <button id="btn-again" class="neon-btn">PLAY AGAIN</button>
            <button id="btn-levels" class="neon-btn secondary">SELECT SECTOR</button>
            <button id="btn-menu" class="neon-btn secondary">MAIN BRIDGE</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('btn-again')?.addEventListener('click', () => this.cb.onStartCampaign());
    document.getElementById('btn-levels')?.addEventListener('click', () => this.cb.onOpenLevelSelect());
    document.getElementById('btn-menu')?.addEventListener('click', () => this.cb.onBackToTitle());
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
