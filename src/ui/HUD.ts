import { DIFFICULTIES, type DifficultyId, type GamePhase, type GameState } from '../engine/GameState';
import { DesktopBridge } from '../engine/DesktopBridge';
import type { LevelConfig } from '../levels/LevelSchema';
import type { LevelLoadError } from '../levels/LevelLoader';
import { Leaderboard } from '../engine/Leaderboard';
import { UPGRADE_DEFS, type MetaProgression, type UpgradeKey } from '../engine/MetaProgression';
import type { WingmanHudEntry } from '../entities/WingmanSquadron';

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
  onOpenHangar: (returnTo: 'Title' | 'NextSector') => void;
  onBuyUpgrade: (key: UpgradeKey) => void;
  onResetSave: () => void;
  onSelectDifficulty: (diff: DifficultyId) => void;
  onReplayCrawl: () => void;
  onSelectLevel: (index: number) => void;
  onBackToTitle: () => void;
  onNextLevel: () => void;
  onRetryLevel: () => void;
  onRetryBoss: () => void;
  onResume: () => void;
  onToggleMouseAim: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onQuitDesktop: () => void;
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

export type CommsSpeaker = 'commander' | 'wingman' | 'boss' | 'grunt' | 'mechanic' | 'blitz' | 'tank';

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
  private bossHpLag: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private commsBox: HTMLElement | null = null;
  private commsImg: HTMLImageElement | null = null;
  private commsSpeakerEl: HTMLElement | null = null;
  private commsMsgEl: HTMLElement | null = null;
  private reticleNear: HTMLElement | null = null;
  private reticleFar: HTMLElement | null = null;
  private lockContainer: HTMLElement | null = null;
  private damageFlashEl: HTMLElement | null = null;
  private screenFlashEl: HTMLElement | null = null;
  private stampLayerEl: HTMLElement | null = null;
  private energyVignetteEl: HTMLElement | null = null;
  private wingmanWrapEl: HTMLElement | null = null;
  private distressLayerEl: HTMLElement | null = null;
  private cinemaTopEl: HTMLElement | null = null;
  private cinemaBotEl: HTMLElement | null = null;
  private squadArrivalEl: HTMLElement | null = null;
  private tailgaterAlertEl: HTMLElement | null = null;
  private tailgaterHeadEl: HTMLElement | null = null;
  private tailgaterHintEl: HTMLElement | null = null;
  private tailgaterHpEl: HTMLElement | null = null;
  private wingmanRowEls = new Map<string, { row: HTMLElement; status: HTMLElement; fill: HTMLElement }>();
  private distressMarkerEls = new Map<string, HTMLElement>();
  private popupContainer: HTMLElement | null = null;
  private hitConfirmTimer = 0;
  private activeCutsceneDone: (() => void) | null = null;
  private activeCutsceneEl: HTMLElement | null = null;
  private cutsceneSkipFillEl: HTMLElement | null = null;
  private cutsceneSkipPillEl: HTMLElement | null = null;
  private cutsceneMouseHeld = false;
  private preloadedVideos = new Map<string, HTMLVideoElement>();
  private tutorialPromptEl: HTMLElement | null = null;
  private tutorialTimer = 0;

  /**
   * Preloads a cutscene video off-DOM so boss intros start instantaneously with zero black flash!
   */
  public preloadCutscene(videoId: string): void {
    if (this.preloadedVideos.has(videoId)) return;
    const vid = document.createElement('video');
    vid.preload = 'auto';
    vid.playsInline = true;
    vid.muted = true;
    vid.src = `/assets/video/${videoId}.mp4`;
    vid.load();
    this.preloadedVideos.set(videoId, vid);
  }

  public playCutscene(videoId: string, muted: boolean, onDone: () => void, fallbackUrl?: string): void {
    this.skipActiveCutscene(false);
    this.cutsceneMouseHeld = false;

    const overlay = document.createElement('div');
    overlay.className = 'cutscene-overlay interactive';
    overlay.innerHTML = `
      <div class="cutscene-glitch-veil" id="cutscene-veil">INCOMING TRANSMISSION // SYNCING...</div>
      <div class="cutscene-skip-bar">
        <div id="btn-cutscene-skip" class="cutscene-skip-pill locked">
          <div class="cutscene-skip-fill" id="cutscene-skip-fill"></div>
          <span class="cutscene-skip-label">HOLD [SPACE / A] TO SKIP</span>
        </div>
      </div>
    `;

    // Reuse preloaded video element if available (zero decode delay!)
    const cached = this.preloadedVideos.get(videoId);
    const video = cached ?? document.createElement('video');
    video.className = 'cutscene-video';
    video.playsInline = true;
    video.autoplay = true;
    video.muted = muted;
    if (!cached) {
      video.src = `/assets/video/${videoId}.mp4`;
    } else {
      video.currentTime = 0;
    }

    overlay.prepend(video);
    this.root.appendChild(overlay);
    this.activeCutsceneEl = overlay;
    this.activeCutsceneDone = onDone;
    this.cutsceneSkipPillEl = overlay.querySelector('#btn-cutscene-skip');
    this.cutsceneSkipFillEl = overlay.querySelector('#cutscene-skip-fill');

    const veil = overlay.querySelector('#cutscene-veil') as HTMLElement | null;
    const liftVeil = () => {
      if (!veil) return;
      veil.classList.add('fade-out');
      window.setTimeout(() => veil.remove(), 340);
    };

    const finish = () => this.skipActiveCutscene(true);

    let triedFallback = false;
    const onError = () => {
      if (!triedFallback && fallbackUrl) {
        triedFallback = true;
        video.src = fallbackUrl;
        video.load();
        video.play().catch(finish);
        return;
      }
      // Graceful synthwave celebration fallback if video asset is missing
      if (veil) {
        veil.textContent = 'FRONTIER LIBERATED // VICTORY!';
        window.setTimeout(finish, 1800);
      } else {
        finish();
      }
    };

    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('error', onError);
    if (video.readyState >= 2) {
      window.setTimeout(liftVeil, 180);
    } else {
      video.addEventListener('loadeddata', () => window.setTimeout(liftVeil, 120), { once: true });
      window.setTimeout(liftVeil, 420);
    }

    // Mouse hold on skip pill also fills the 0.6s skip bar
    this.cutsceneSkipPillEl?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.cutsceneMouseHeld = true;
    });
    window.addEventListener('pointerup', this.onCutscenePointerUp);

    video.play().catch(() => {
      video.muted = true;
      video.play().catch(onError);
    });
  }

  private onCutscenePointerUp = (): void => {
    this.cutsceneMouseHeld = false;
  };

  public isCutsceneMouseSkipHeld(): boolean {
    return this.cutsceneMouseHeld;
  }

  public updateCutsceneSkipUI(locked: boolean, progress01: number): void {
    if (this.cutsceneSkipPillEl) {
      this.cutsceneSkipPillEl.classList.toggle('locked', locked);
    }
    if (this.cutsceneSkipFillEl) {
      this.cutsceneSkipFillEl.style.width = `${Math.min(100, Math.max(0, progress01 * 100)).toFixed(1)}%`;
    }
  }

  public skipActiveCutscene(invokeCallback = true): void {
    window.removeEventListener('pointerup', this.onCutscenePointerUp);
    this.cutsceneMouseHeld = false;
    if (this.activeCutsceneEl) {
      const vid = this.activeCutsceneEl.querySelector('video');
      if (vid) {
        vid.pause();
        // Detach from DOM without destroying preloaded cache
        vid.remove();
      }
      this.activeCutsceneEl.remove();
      this.activeCutsceneEl = null;
      this.cutsceneSkipFillEl = null;
      this.cutsceneSkipPillEl = null;
    }
    const cb = this.activeCutsceneDone;
    this.activeCutsceneDone = null;
    if (invokeCallback && cb) cb();
  }

  public get isCutscenePlaying(): boolean {
    return this.activeCutsceneEl !== null;
  }

  public showTutorialPrompt(text: string, duration = 5.0): void {
    if (!this.tutorialPromptEl) return;
    this.tutorialPromptEl.textContent = text;
    this.tutorialPromptEl.classList.add('visible');
    this.tutorialTimer = duration;
  }

  public hideTutorialPrompt(): void {
    if (!this.tutorialPromptEl) return;
    this.tutorialPromptEl.classList.remove('visible');
    this.tutorialTimer = 0;
  }
  private mousePill: HTMLElement | null = null;
  private mutePill: HTMLElement | null = null;
  private weaponPill: HTMLElement | null = null;
  private bombPill: HTMLElement | null = null;
  private padPill: HTMLElement | null = null;
  private hasBossCheckpoint = false;
  private controllerLabel = 'NO CONTROLLER DETECTED (PRESS ANY PAD BUTTON)';
  private nintendoLayout = false;
  private focusedButtonIdx = 0;
  private hangarReturnTarget: 'Title' | 'NextSector' = 'Title';
  private metaRef: MetaProgression | null = null;

  public setMetaProgression(meta: MetaProgression): void {
    this.metaRef = meta;
  }

  public setHangarReturnTarget(target: 'Title' | 'NextSector'): void {
    this.hangarReturnTarget = target;
  }

  /**
   * 100% Gamepad Navigation across EVERY menu screen!
   */
  public navigateMenu(delta: number): void {
    const buttons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    if (buttons.length === 0) return;
    buttons.forEach((b) => b.classList.remove('gamepad-focus'));
    this.focusedButtonIdx = (this.focusedButtonIdx + delta + buttons.length) % buttons.length;
    const target = buttons[this.focusedButtonIdx];
    target.classList.add('gamepad-focus');
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    this.cb.onUiHover();
  }

  public activateFocusedMenuButton(): boolean {
    const buttons = Array.from(
      this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    if (buttons.length === 0) return false;
    const idx = Math.min(Math.max(0, this.focusedButtonIdx), buttons.length - 1);
    const target = buttons[idx];
    if (!target) return false;
    target.click();
    return true;
  }

  private resetMenuFocus(): void {
    this.focusedButtonIdx = 0;
    const first = this.root.querySelector<HTMLButtonElement>('button:not(:disabled)');
    if (first) first.classList.add('gamepad-focus');
  }

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
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    buttons.forEach((btn, idx) => {
      btn.addEventListener('mouseenter', () => {
        buttons.forEach((b) => b.classList.remove('gamepad-focus'));
        btn.classList.add('gamepad-focus');
        this.focusedButtonIdx = idx;
        this.cb.onUiHover();
      });
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
      episode: 'EMERGENCY BROADCAST',
      title: 'BOOT N ASS',
      subtitle: 'GALACTIC RED ALERT',
      speed: 1.0,
      paragraphs: [
        'An armada of trash-talking space robots has invaded the Neon Frontier.',
        'Lock on. Barrel roll. Put boot in their ass first.',
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

    if (phase === 'Hangar') {
      this.renderHangar(state);
      return;
    }

    if (phase === 'Playing') {
      this.mountPlayingHud(state, levels[state.currentLevelIndex]);
      return;
    }

    if (phase === 'Paused') {
      this.renderPauseOverlay(state);
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
    const isDesktop = DesktopBridge.isDesktop;
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="title-hero-card">
          <div class="game-logo" style="margin-bottom:8px;">BOOT N ASS</div>
          <div class="game-tagline" style="margin-bottom:36px;">GALACTIC ARCADE SPACE SHOOTER</div>
          <button id="btn-boot-start" class="boot-start-btn">PRESS START</button>
          <div style="margin-top:26px;font-family:var(--font-display);font-size:0.8rem;letter-spacing:0.24em;color:rgba(232,246,255,0.68);">
            CLICK START &nbsp;•&nbsp; SPACE / ENTER &nbsp;•&nbsp; CONTROLLER [A]
          </div>
        </div>
        <div class="desktop-status-corner">
          <span>${isDesktop ? 'DESKTOP EDITION' : 'ARCADE WEB EDITION'} &nbsp;•&nbsp; F11 FULLSCREEN</span>
          <span>v1.0.0 &nbsp;•&nbsp; SWEET PAPA TECHNOLOGIES</span>
        </div>
      </div>
    `;
    document.getElementById('btn-boot-start')?.addEventListener('click', () => this.cb.onBootStart());
    this.bindArcadeButtonJuice();
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
        <div class="crawl-hint">INCOMING TRANSMISSION &nbsp;|&nbsp; PRESS [SPACE / A] TO SKIP</div>
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
    const diffCfg = state.difficultyConfig;
    const bucks = this.metaRef ? this.metaRef.data.bootBucks : 0;
    const isDesktop = DesktopBridge.isDesktop;

    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="title-panel">
          <div class="game-logo" style="font-size:clamp(2.8rem, 7vw, 5.2rem);">BOOT N ASS</div>
          <div class="title-meta-row">
            <span class="meta-chip">ON-RAILS NEON SPACE SHOOTER</span>
            <span class="meta-chip gold">${bucks.toLocaleString()} BOOT BUCKS</span>
          </div>

          <div class="difficulty-bar" style="margin-bottom:8px;">
            <button class="diff-pill ${state.difficulty === 'rookie' ? 'active' : ''}" data-diff="rookie">ROOKIE</button>
            <button class="diff-pill ${state.difficulty === 'ace' ? 'active' : ''}" data-diff="ace">ACE ★</button>
            <button class="diff-pill ${state.difficulty === 'maximum' ? 'active' : ''}" data-diff="maximum">MAXIMUM BOOT-N-ASS</button>
          </div>
          <div class="diff-desc" style="margin-bottom:20px;">${this.escapeHtml(diffCfg.description)}</div>

          <button id="btn-start" class="neon-btn primary-launch-btn">LAUNCH CAMPAIGN</button>

          <div class="menu-grid-2x2">
            <button id="btn-hangar" class="neon-btn secondary">ZORP'S HANGAR (${bucks.toLocaleString()} BB)</button>
            <button id="btn-levels" class="neon-btn secondary">SELECT SECTOR</button>
            <button id="btn-leaderboard" class="neon-btn secondary">LEADERBOARD</button>
            <button id="btn-options" class="neon-btn secondary">OPTIONS &amp; CONTROLS</button>
          </div>

          <div class="menu-footer-row">
            <button id="btn-story" class="neon-btn small secondary">OPENING CRAWL</button>
            <button id="btn-fullscreen" class="neon-btn small secondary">FULLSCREEN [F11]</button>
            <button id="btn-mute" class="neon-btn small secondary">AUDIO: ${state.muted ? 'MUTED' : 'ON'}</button>
            ${isDesktop ? '<button id="btn-quit" class="neon-btn small secondary danger-subtle">QUIT TO DESKTOP</button>' : ''}
          </div>
        </div>
        <div class="desktop-status-corner">
          <span id="pad-status-label">${this.escapeHtml(this.controllerLabel)}</span>
          <span>v1.0.0 &nbsp;•&nbsp; ${isDesktop ? 'DESKTOP EDITION' : 'ARCADE WEB'}</span>
        </div>
      </div>
    `;

    this.root.querySelectorAll<HTMLButtonElement>('.diff-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.diff as DifficultyId;
        if (d) this.cb.onSelectDifficulty(d);
      });
    });
    document.getElementById('btn-start')?.addEventListener('click', () => this.cb.onStartCampaign());
    document.getElementById('btn-hangar')?.addEventListener('click', () => this.cb.onOpenHangar('Title'));
    document.getElementById('btn-levels')?.addEventListener('click', () => this.cb.onOpenLevelSelect());
    document.getElementById('btn-leaderboard')?.addEventListener('click', () => this.renderLeaderboardModal(state));
    document.getElementById('btn-options')?.addEventListener('click', () => this.renderOptionsModal(state));
    document.getElementById('btn-story')?.addEventListener('click', () => this.cb.onReplayCrawl());
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => this.cb.onToggleFullscreen());
    document.getElementById('btn-mute')?.addEventListener('click', () => this.cb.onToggleMute());
    document.getElementById('btn-quit')?.addEventListener('click', () => this.cb.onQuitDesktop());
    this.bindArcadeButtonJuice();

    // Default gamepad focus to LAUNCH CAMPAIGN
    const launchBtn = document.getElementById('btn-start') as HTMLButtonElement | null;
    if (launchBtn) {
      const all = Array.from(this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      this.focusedButtonIdx = Math.max(0, all.indexOf(launchBtn));
      launchBtn.classList.add('gamepad-focus');
    }
  }

  private renderOptionsModal(state: GameState): void {
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="options-modal-card">
          <div class="tally-title" style="margin-bottom:4px;">OPTIONS &amp; FLIGHT CONTROLS</div>
          <div style="color:var(--cyan);font-size:0.85rem;letter-spacing:0.14em;margin-bottom:10px;">SETTINGS SAVE AUTOMATICALLY</div>

          <div class="options-grid">
            <button id="opt-mute" class="neon-btn small secondary">AUDIO: ${state.muted ? 'MUTED' : 'ON'}</button>
            <button id="opt-mouse" class="neon-btn small secondary">MOUSE AIM: ${state.mouseAimEnabled ? 'ON' : 'OFF'}</button>
            <button id="opt-fullscreen" class="neon-btn small secondary">TOGGLE FULLSCREEN [F11]</button>
            <button id="opt-pad-layout" class="neon-btn small secondary">
              PAD A/B: ${this.nintendoLayout ? 'SWAPPED (EAST=FIRE)' : 'STANDARD (SOUTH=FIRE)'}
            </button>
            <button id="opt-rumble" class="neon-btn small secondary">TEST CONTROLLER RUMBLE</button>
            <button id="opt-reset" class="neon-btn small secondary danger-subtle">RESET SAVE DATA</button>
          </div>

          <div class="pad-status-bar" style="margin-bottom:16px;">
            <span id="pad-status-label">${this.escapeHtml(this.controllerLabel)}</span>
            <span id="rumble-feedback" class="rumble-msg"></span>
          </div>

          <div class="controls-grid" style="margin-bottom:20px;">
            <div class="control-item"><span class="control-key">WASD / L-STICK</span> Fly &amp; Bank</div>
            <div class="control-item"><span class="control-key">SPACE / RT / A</span> Rapid Plasma</div>
            <div class="control-item"><span class="control-key">SHIFT / LT / B</span> Homing Lock-On</div>
            <div class="control-item"><span class="control-key">Q/E / LB/RB</span> Barrel Roll Deflect</div>
            <div class="control-item"><span class="control-key">R / W×2 / Y</span> Somersault Backflip</div>
            <div class="control-item"><span class="control-key">B / X</span> Nova Smart Bomb</div>
            <div class="control-item"><span class="control-key">F / L3</span> Boost &nbsp; <span class="control-key">C / R3 / LB+RB</span> Brake</div>
            <div class="control-item"><span class="control-key">ESC / START</span> Pause &nbsp; <span class="control-key">F11</span> Fullscreen</div>
          </div>

          <button id="opt-back" class="neon-btn">BACK TO BRIDGE</button>
        </div>
      </div>
    `;

    document.getElementById('opt-mute')?.addEventListener('click', () => {
      this.cb.onToggleMute();
      this.renderOptionsModal(state);
    });
    document.getElementById('opt-mouse')?.addEventListener('click', () => {
      this.cb.onToggleMouseAim();
      this.renderOptionsModal(state);
    });
    document.getElementById('opt-fullscreen')?.addEventListener('click', () => this.cb.onToggleFullscreen());
    document.getElementById('opt-pad-layout')?.addEventListener('click', () => {
      this.cb.onToggleNintendoLayout();
      this.renderOptionsModal(state);
    });
    document.getElementById('opt-rumble')?.addEventListener('click', () => {
      const msg = this.cb.onTestRumble();
      const el = document.getElementById('rumble-feedback');
      if (el) el.textContent = msg;
    });
    document.getElementById('opt-reset')?.addEventListener('click', () => {
      if (window.confirm('Reset all Boot Bucks & Hangar upgrades to zero?')) {
        this.cb.onResetSave();
        this.renderOptionsModal(state);
      }
    });
    document.getElementById('opt-back')?.addEventListener('click', () => this.renderTitle(state));
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
  }

  private renderHangar(state: GameState): void {
    const meta = this.metaRef;
    if (!meta) return;
    const bucks = meta.data.bootBucks;

    const cards = UPGRADE_DEFS.map((u) => {
      const tier = meta.getTier(u.key);
      const nextCost = meta.getNextCost(u.key);
      const canBuy = nextCost !== null && bucks >= nextCost;
      const pips = [0, 1, 2]
        .map((i) => `<span class="tier-pip ${i < tier ? 'filled' : ''}"></span>`)
        .join('');
      const nextLabel = nextCost === null ? 'MAXED OUT' : u.tierDesc[tier];
      const costLabel = nextCost === null ? '★ MAX ★' : `${nextCost} BB`;

      return `
        <button class="upgrade-card" data-upgrade="${u.key}" ${!canBuy ? 'disabled' : ''}>
          <div>
            <div class="upgrade-card-top">
              <span class="upgrade-name">${u.name}</span>
              <div class="tier-pips">${pips}</div>
            </div>
            <div class="upgrade-tagline">${u.tagline}</div>
          </div>
          <div class="upgrade-footer">
            <span class="upgrade-next">${nextLabel}</span>
            <span class="upgrade-cost">${costLabel}</span>
          </div>
        </button>
      `;
    }).join('');

    const continueBtn =
      this.hangarReturnTarget === 'NextSector'
        ? '<button id="btn-hangar-next" class="neon-btn">LAUNCH NEXT SECTOR</button>'
        : '<button id="btn-hangar-back" class="neon-btn">BACK TO BRIDGE</button>';

    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="hangar-wrap">
          <div class="hangar-header">
            <div class="hangar-zorp">
              <img src="/assets/art/portrait-shop.jpg" alt="Zorp" />
              <div>
                <div style="font-family:var(--font-display);font-size:1.35rem;font-weight:900;color:var(--cyan);letter-spacing:0.15em;">ZORP'S HANGAR // SHIP UPGRADES</div>
                <div style="color:rgba(232,246,255,0.78);font-size:0.95rem;">Spend Boot Bucks to permanently upgrade Vanguard-X across runs!</div>
              </div>
            </div>
            <div class="boot-bucks-badge">BOOT BUCKS: ${bucks.toLocaleString()} BB</div>
          </div>
          <div class="hangar-grid">${cards}</div>
          <div class="menu-actions" style="margin-bottom:0;justify-content:space-between;">
            <button id="btn-reset-save" class="neon-btn small secondary" style="border-color:var(--crimson);color:#ff99aa;">RESET SAVE</button>
            <div style="display:flex;gap:12px;">
              ${continueBtn}
            </div>
          </div>
        </div>
      </div>
    `;

    this.root.querySelectorAll<HTMLButtonElement>('.upgrade-card').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.upgrade as UpgradeKey;
        if (key) this.cb.onBuyUpgrade(key);
      });
    });

    document.getElementById('btn-hangar-next')?.addEventListener('click', () => this.cb.onNextLevel());
    document.getElementById('btn-hangar-back')?.addEventListener('click', () => this.cb.onBackToTitle());
    document.getElementById('btn-reset-save')?.addEventListener('click', () => {
      if (window.confirm('Reset all Boot Bucks and Hangar upgrades back to Tier 0?')) {
        this.cb.onResetSave();
      }
    });
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
    void state;
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
        <div class="game-tagline" style="margin-bottom:8px;">CHOOSE YOUR DEPLOYMENT CORRIDOR</div>
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
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
  }

  private mountPlayingHud(state: GameState, level: LevelConfig): void {
    this.root.innerHTML = `
      <div class="hud-layer">
        <div class="damage-flash" id="damage-flash"></div>
        <div class="screen-flash" id="screen-flash"></div>
        <div class="energy-vignette" id="energy-vignette"></div>
        <div class="cinema-bar top" id="cinema-bar-top"></div>
        <div class="cinema-bar bottom" id="cinema-bar-bot"></div>
        <div class="squad-arrival-card" id="squad-arrival-card">
          <img class="squad-arrival-portrait blitz" src="/assets/art/portrait-blitz.jpg" alt="BLITZ" />
          <div class="squad-arrival-center">
            <div class="squad-arrival-kicker">REINFORCEMENTS ARRIVED!</div>
            <div class="squad-arrival-title">BLITZ &amp; TANK</div>
            <div class="squad-arrival-sub">ALLIED WINGMEN JOIN THE FIGHT • WATCH THEIR SIX!</div>
          </div>
          <img class="squad-arrival-portrait tank" src="/assets/art/portrait-tank.jpg" alt="TANK" />
        </div>
        <div class="arcade-stamp-layer" id="arcade-stamp-layer"></div>
        <div id="distress-layer"></div>
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
          <div class="wingman-hud-wrap" id="wingman-hud-wrap"></div>
        </div>

        <div class="hud-top-center">
          <div class="hud-level-name" id="hud-level-name">${this.escapeHtml(level.name)}</div>
          <div class="hud-progress-track"><div class="hud-progress-fill" id="hud-progress-fill" style="width:0%"></div></div>
          <div class="boss-hp-wrap" id="boss-hp-wrap" style="display:none;">
            <div class="boss-hp-header">
              <span id="boss-name">BOSS</span>
              <span id="boss-phase">PHASE 1</span>
            </div>
            <div class="boss-hp-track">
              <div class="boss-hp-lag" id="boss-hp-lag" style="width:100%"></div>
              <div class="boss-hp-fill" id="boss-hp-fill" style="width:100%"></div>
              <div class="boss-hp-notch"></div>
            </div>
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
        <div class="tutorial-prompt" id="tutorial-prompt"></div>
        <div class="tailgater-alert" id="tailgater-alert">
          <div class="tailgater-alert-head" id="tailgater-head">▲ TAILGATER ON YOUR SIX! ▲</div>
          <div class="tailgater-hp-track"><div class="tailgater-hp-fill" id="tailgater-hp" style="width:100%"></div></div>
          <div class="tailgater-alert-hint" id="tailgater-hint">TAP [R / W×2 / Y] BACKFLIP • HOLD [C / LB+RB] BRAKE</div>
        </div>

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
    this.bossHpLag = document.getElementById('boss-hp-lag');
    this.bannerEl = document.getElementById('hud-banner');
    this.tutorialPromptEl = document.getElementById('tutorial-prompt');
    this.commsBox = document.getElementById('comms-box');
    this.commsImg = document.getElementById('comms-img') as HTMLImageElement | null;
    this.commsSpeakerEl = document.getElementById('comms-speaker');
    this.commsMsgEl = document.getElementById('comms-msg');
    this.reticleNear = document.getElementById('reticle-near');
    this.reticleFar = document.getElementById('reticle-far');
    this.lockContainer = document.getElementById('lock-container');
    this.damageFlashEl = document.getElementById('damage-flash');
    this.screenFlashEl = document.getElementById('screen-flash');
    this.stampLayerEl = document.getElementById('arcade-stamp-layer');
    this.energyVignetteEl = document.getElementById('energy-vignette');
    this.wingmanWrapEl = document.getElementById('wingman-hud-wrap');
    this.distressLayerEl = document.getElementById('distress-layer');
    this.wingmanRowEls.clear();
    this.distressMarkerEls.clear();
    this.cinemaTopEl = document.getElementById('cinema-bar-top');
    this.cinemaBotEl = document.getElementById('cinema-bar-bot');
    this.squadArrivalEl = document.getElementById('squad-arrival-card');
    this.tailgaterAlertEl = document.getElementById('tailgater-alert');
    this.tailgaterHeadEl = document.getElementById('tailgater-head');
    this.tailgaterHintEl = document.getElementById('tailgater-hint');
    this.tailgaterHpEl = document.getElementById('tailgater-hp');
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
        const w = `${Math.max(0, Math.min(100, bossInfo.hpPct * 100))}%`;
        this.bossNameEl.textContent = bossInfo.name;
        this.bossPhaseEl.textContent = `PHASE ${bossInfo.phase}`;
        this.bossHpFill.style.width = w;
        if (this.bossHpLag) this.bossHpLag.style.width = w;
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
    if (this.tutorialTimer > 0) {
      this.tutorialTimer -= dt;
      if (this.tutorialTimer <= 0 && this.tutorialPromptEl) {
        this.tutorialPromptEl.classList.remove('visible');
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

  public setCriticalHull(critical: boolean, mayday = false): void {
    this.energyVignetteEl?.classList.toggle('critical-hull', critical && !mayday);
    this.energyVignetteEl?.classList.toggle('mayday', mayday);
  }

  public triggerScreenFlash(kind: 'white' | 'death' | 'nova' | 'gold'): void {
    if (!this.screenFlashEl) return;
    this.screenFlashEl.className = `screen-flash ${kind} active`;
    // Force reflow so rapid consecutive flashes re-trigger cleanly
    void this.screenFlashEl.offsetWidth;
    requestAnimationFrame(() => {
      this.screenFlashEl?.classList.remove('active');
    });
  }

  public showArcadeStamp(text: string, variant: 'kill' | 'death' | 'clear' | 'warp'): void {
    if (!this.stampLayerEl) return;
    const el = document.createElement('div');
    el.className = `arcade-stamp ${variant}`;
    el.textContent = text;
    this.stampLayerEl.innerHTML = '';
    this.stampLayerEl.appendChild(el);
    window.setTimeout(() => {
      if (el.parentNode === this.stampLayerEl) el.remove();
    }, 1500);
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

  public showSquadronArrival(active: boolean): void {
    this.cinemaTopEl?.classList.toggle('active', active);
    this.cinemaBotEl?.classList.toggle('active', active);
    this.squadArrivalEl?.classList.toggle('visible', active);
  }

  public updateTailgaterHud(
    onTail: boolean,
    tailSide: -1 | 1,
    hpPct: number,
    gamepadConnected: boolean
  ): void {
    if (!this.tailgaterAlertEl) return;
    this.tailgaterAlertEl.classList.toggle('visible', onTail);
    if (!onTail) return;
    if (this.tailgaterHeadEl) {
      this.tailgaterHeadEl.textContent =
        tailSide < 0 ? '◄◄ TAILGATER ON LEFT SIX! ◄◄' : '►► TAILGATER ON RIGHT SIX! ►►';
    }
    if (this.tailgaterHpEl) {
      this.tailgaterHpEl.style.width = `${Math.max(0, Math.min(100, hpPct))}%`;
    }
    if (this.tailgaterHintEl) {
      this.tailgaterHintEl.textContent = gamepadConnected
        ? 'PRESS [Y] SOMERSAULT BACKFLIP  •  HOLD [LB+RB / R3] AIRBRAKE'
        : 'PRESS [R / W×2] SOMERSAULT BACKFLIP  •  HOLD [C] AIRBRAKE';
    }
  }

  public updateWingmanHud(
    deployed: boolean,
    allies: WingmanHudEntry[],
    distressScreenPoints: Array<{
      key?: string;
      callsign: string;
      label?: string;
      reversed?: boolean;
      x: number;
      y: number;
      inFront: boolean;
    }>
  ): void {
    if (this.wingmanWrapEl) {
      const show = deployed && allies.length > 0;
      this.wingmanWrapEl.classList.toggle('visible', show);
      if (show) {
        if (this.wingmanRowEls.size === 0) {
          this.wingmanWrapEl.innerHTML = '<div class="wingman-hud-title">SQUADRON WINGMEN</div>';
          for (const a of allies) {
            const row = document.createElement('div');
            row.className = 'wingman-row';
            row.innerHTML = `
              <div class="wingman-row-head"><span>${a.callsign}</span><span class="wingman-status">100%</span></div>
              <div class="wingman-bar-track"><div class="wingman-bar-fill"></div></div>
            `;
            this.wingmanWrapEl.appendChild(row);
            const status = row.querySelector('.wingman-status') as HTMLElement;
            const fill = row.querySelector('.wingman-bar-fill') as HTMLElement;
            this.wingmanRowEls.set(a.id, { row, status, fill });
          }
        }
        for (const a of allies) {
          const refs = this.wingmanRowEls.get(a.id);
          if (!refs) continue;
          refs.row.classList.toggle('ejected', a.ejected);
          refs.row.classList.toggle('danger', a.underAttack);
          refs.status.textContent = a.ejected ? 'EJECTED' : a.underAttack ? 'HELP!' : `${a.hpPct}%`;
          const barColor = a.underAttack ? '#ff5522' : a.accentColor;
          refs.fill.style.width = `${a.ejected ? 0 : a.hpPct}%`;
          refs.fill.style.background = barColor;
          refs.fill.style.boxShadow = `0 0 8px ${barColor}`;
        }
      } else if (this.wingmanRowEls.size > 0) {
        this.wingmanWrapEl.innerHTML = '';
        this.wingmanRowEls.clear();
      }
    }

    if (this.distressLayerEl) {
      const visible = distressScreenPoints.filter(
        (p) => p.inFront && p.x > 20 && p.x < window.innerWidth - 20 && p.y > 20 && p.y < window.innerHeight - 20
      );
      const activeKeys = new Set(visible.map((p) => p.key ?? p.callsign));
      for (const [key, el] of this.distressMarkerEls.entries()) {
        if (!activeKeys.has(key)) {
          el.remove();
          this.distressMarkerEls.delete(key);
        }
      }
      for (const p of visible) {
        const key = p.key ?? p.callsign;
        const tagText = p.label ?? `HELP ${p.callsign}!`;
        let marker = this.distressMarkerEls.get(key);
        if (!marker) {
          marker = document.createElement('div');
          marker.className = 'distress-marker';
          marker.innerHTML = `<div class="distress-box"></div><div class="distress-tag">${tagText}</div>`;
          this.distressLayerEl.appendChild(marker);
          this.distressMarkerEls.set(key, marker);
        }
        marker.classList.toggle('reversed', Boolean(p.reversed));
        const tagEl = marker.querySelector('.distress-tag');
        if (tagEl && tagEl.textContent !== tagText) tagEl.textContent = tagText;
        marker.style.left = `${p.x.toFixed(0)}px`;
        marker.style.top = `${p.y.toFixed(0)}px`;
      }
    }
  }

  public showComms(speaker: CommsSpeaker, message: string, duration = 3.8): void {
    if (!this.commsBox || !this.commsImg || !this.commsSpeakerEl || !this.commsMsgEl) return;

    const meta: Record<CommsSpeaker, { label: string; img: string; isBoss: boolean }> = {
      commander: { label: 'COMMANDER VEX // FLEET OPS', img: '/assets/art/portrait-commander.jpg', isBoss: false },
      wingman: { label: 'ACE PILOT NOVA // WING 2', img: '/assets/art/portrait-wingman.jpg', isBoss: false },
      boss: { label: 'WARLORD CORE // BOOT N ASS', img: '/assets/art/portrait-boss.jpg', isBoss: true },
      grunt: { label: 'ALIEN GRUNT // PANICKING', img: '/assets/art/portrait-grunt.jpg', isBoss: true },
      mechanic: { label: 'ZORP // WEAPONS MECHANIC', img: '/assets/art/portrait-shop.jpg', isBoss: false },
      blitz: { label: 'BLITZ // LEFT WING STRIKER', img: '/assets/art/portrait-blitz.jpg', isBoss: false },
      tank: { label: 'TANK // RIGHT WING GUNSHIP', img: '/assets/art/portrait-tank.jpg', isBoss: false },
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

  private renderPauseOverlay(state?: GameState): void {
    const existing = document.getElementById('pause-modal');
    if (existing) existing.remove();
    const isDesktop = DesktopBridge.isDesktop;
    const modal = document.createElement('div');
    modal.id = 'pause-modal';
    modal.className = 'menu-screen interactive';
    modal.innerHTML = `
      <div class="tally-card" style="max-width:440px;">
        <div class="tally-title">SYSTEMS PAUSED</div>
        <div class="pause-stack">
          <button id="btn-resume" class="neon-btn">RESUME FLIGHT</button>
          <button id="btn-pause-retry" class="neon-btn secondary">RESTART SECTOR</button>
          <button id="btn-pause-fs" class="neon-btn small secondary">TOGGLE FULLSCREEN [F11]</button>
          <button id="btn-pause-mute" class="neon-btn small secondary">AUDIO: ${state?.muted ? 'MUTED' : 'ON'}</button>
          <button id="btn-pause-menu" class="neon-btn secondary">MAIN BRIDGE</button>
          ${isDesktop ? '<button id="btn-pause-quit" class="neon-btn small secondary danger-subtle">QUIT TO DESKTOP</button>' : ''}
        </div>
      </div>
    `;
    this.root.appendChild(modal);
    document.getElementById('btn-resume')?.addEventListener('click', () => this.cb.onResume());
    document.getElementById('btn-pause-retry')?.addEventListener('click', () => this.cb.onRetryLevel());
    document.getElementById('btn-pause-fs')?.addEventListener('click', () => this.cb.onToggleFullscreen());
    document.getElementById('btn-pause-mute')?.addEventListener('click', () => {
      this.cb.onToggleMute();
      this.renderPauseOverlay(state);
    });
    document.getElementById('btn-pause-menu')?.addEventListener('click', () => this.cb.onBackToTitle());
    document.getElementById('btn-pause-quit')?.addEventListener('click', () => this.cb.onQuitDesktop());
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
  }

  public removePauseOverlay(): void {
    document.getElementById('pause-modal')?.remove();
  }

  private renderLevelClear(state: GameState, levels: LevelConfig[]): void {
    const breakdown = state.computeRank();
    const hasNext = state.currentLevelIndex + 1 < levels.length;
    const lvl = levels[state.currentLevelIndex];

    const criteriaHtml = breakdown.criteria
      .map(
        (c) => `
        <div class="srank-item ${c.passed ? 'pass' : 'fail'}">
          <span>${c.passed ? '✓' : '✗'} ${c.label} (${c.target})</span>
          <span style="font-family:var(--font-display);">${c.actual}</span>
        </div>`
      )
      .join('');

    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="tally-card" style="max-width:600px;">
          <div class="tally-title">SECTOR CLEAR</div>
          <div style="color:var(--gold);letter-spacing:0.2em;margin-bottom:4px;">${this.escapeHtml(lvl.name)} &nbsp;•&nbsp; ${state.difficultyConfig.shortBadge}</div>
          <div class="tally-rank">${breakdown.rank}</div>
          <div class="tally-rows" style="margin-bottom:10px;">
            <div class="tally-row"><span>COMBAT SCORE</span><span>${state.stats.score.toLocaleString()}</span></div>
            <div class="tally-row"><span>SHIELD BONUS</span><span>+${breakdown.shieldBonus.toLocaleString()}</span></div>
            <div class="tally-row" style="font-weight:700;"><span>SECTOR TOTAL</span><span>${breakdown.totalLevelScore.toLocaleString()}</span></div>
            <div class="tally-row" style="color:var(--gold);font-weight:700;"><span>BOOT BUCKS EARNED</span><span>+${breakdown.bootBucksEarned.toLocaleString()} BB</span></div>
          </div>
          <div class="srank-checklist">
            <div class="srank-title">S-RANK TARGET BREAKDOWN</div>
            ${criteriaHtml}
          </div>
          <div class="menu-actions" style="margin-bottom:0;">
            ${hasNext ? '<button id="btn-clear-hangar" class="neon-btn">HANGAR UPGRADES</button>' : ''}
            ${hasNext ? '<button id="btn-next" class="neon-btn secondary">NEXT SECTOR</button>' : '<button id="btn-next" class="neon-btn">VIEW VICTORY</button>'}
            <button id="btn-retry" class="neon-btn secondary">REPLAY</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-clear-hangar')?.addEventListener('click', () => this.cb.onOpenHangar('NextSector'));
    document.getElementById('btn-next')?.addEventListener('click', () => this.cb.onNextLevel());
    document.getElementById('btn-retry')?.addEventListener('click', () => this.cb.onRetryLevel());
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
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
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
  }

  private renderLeaderboardTableHtml(): string {
    const entries = Leaderboard.load();
    if (entries.length === 0) {
      return '<p style="color:rgba(232,246,255,0.65);margin:16px 0;">No campaign scores recorded yet. Beat Sector 3 to claim #1!</p>';
    }
    const rows = entries
      .map(
        (e, idx) => `
        <tr>
          <td>#${idx + 1}</td>
          <td>${this.escapeHtml(e.initials)}</td>
          <td>${e.score.toLocaleString()}</td>
          <td>${e.rank}</td>
          <td>${this.escapeHtml(e.difficulty)}</td>
        </tr>`
      )
      .join('');
    return `
      <table class="leaderboard-table">
        <thead>
          <tr><th>#</th><th>PILOT</th><th>SCORE</th><th>RANK</th><th>MODE</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private renderLeaderboardModal(state: GameState): void {
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="tally-card" style="border-color:var(--gold);max-width:620px;">
          <div class="tally-title" style="color:var(--gold);">TOP 10 ARCADE PILOTS</div>
          ${this.renderLeaderboardTableHtml()}
          <div class="menu-actions" style="margin-bottom:0;">
            <button id="btn-lb-back" class="neon-btn secondary">BACK TO BRIDGE</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('btn-lb-back')?.addEventListener('click', () => this.renderTitle(state));
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
  }

  private renderVictory(state: GameState): void {
    const campaignRank = Leaderboard.computeCampaignRank(state.totalCampaignScore);
    this.root.innerHTML = `
      <div class="menu-screen interactive">
        <div class="title-backdrop" style="background-image:url('/assets/art/title-hero.jpg')"></div>
        <div class="tally-card" style="border-color:var(--gold);max-width:640px;">
          <div class="tally-title" style="color:var(--gold);">FRONTIER LIBERATED</div>
          <div class="tally-rank" style="font-size:3.8rem;margin:2px 0 10px;">${campaignRank}</div>
          <p style="margin-bottom:14px;font-size:1.05rem;color:#dff6ff;">
            The Hyper-Grid core has been shattered. Enter your 3-letter arcade initials!
          </p>
          <div class="tally-rows" style="margin-bottom:10px;">
            <div class="tally-row"><span>TOTAL CAMPAIGN SCORE</span><span>${state.totalCampaignScore.toLocaleString()}</span></div>
          </div>
          <div class="initials-form" id="initials-form">
            <input id="initials-input" class="initials-input" type="text" maxlength="3" placeholder="ACE" value="ACE" />
            <button id="btn-save-score" class="neon-btn small">SAVE SCORE</button>
          </div>
          <div id="victory-leaderboard-wrap">${this.renderLeaderboardTableHtml()}</div>
          <div class="menu-actions" style="margin-bottom:0;">
            <button id="btn-again" class="neon-btn">PLAY AGAIN</button>
            <button id="btn-levels" class="neon-btn secondary">SELECT SECTOR</button>
            <button id="btn-menu" class="neon-btn secondary">MAIN BRIDGE</button>
          </div>
        </div>
      </div>
    `;

    const inputEl = document.getElementById('initials-input') as HTMLInputElement | null;
    const saveBtn = document.getElementById('btn-save-score') as HTMLButtonElement | null;
    const lbWrap = document.getElementById('victory-leaderboard-wrap');
    let saved = false;

    const commitScore = () => {
      if (saved) return;
      saved = true;
      const initials = inputEl?.value.trim() || 'ACE';
      Leaderboard.saveScore(
        initials,
        state.totalCampaignScore,
        campaignRank,
        state.difficultyConfig.shortBadge
      );
      if (lbWrap) lbWrap.innerHTML = this.renderLeaderboardTableHtml();
      const form = document.getElementById('initials-form');
      if (form) {
        form.innerHTML = `<span style="font-family:var(--font-display);color:var(--gold);letter-spacing:0.18em;">★ SCORE SAVED AS ${this.escapeHtml(initials.toUpperCase().slice(0, 3) || 'ACE')} ★</span>`;
      }
    };

    saveBtn?.addEventListener('click', commitScore);
    inputEl?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commitScore();
    });

    document.getElementById('btn-again')?.addEventListener('click', () => {
      if (!saved) commitScore();
      this.cb.onStartCampaign();
    });
    document.getElementById('btn-levels')?.addEventListener('click', () => {
      if (!saved) commitScore();
      this.cb.onOpenLevelSelect();
    });
    document.getElementById('btn-menu')?.addEventListener('click', () => {
      if (!saved) commitScore();
      this.cb.onBackToTitle();
    });
    this.bindArcadeButtonJuice();
    this.resetMenuFocus();
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
