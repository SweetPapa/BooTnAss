import './style.css';
import * as THREE from 'three';
import { Renderer } from './render/Renderer';
import { GameState } from './engine/GameState';
import { InputManager } from './engine/InputManager';
import { AudioSynth } from './engine/AudioSynth';
import { ParticlePool } from './engine/ParticlePool';
import { CollisionSystem } from './engine/CollisionSystem';
import { PlayerShip } from './entities/PlayerShip';
import { ProjectilePool, type HomingTarget } from './entities/ProjectilePool';
import { EnemyFactory } from './entities/EnemyFactory';
import { ObstacleFactory } from './entities/ObstacleFactory';
import { BossController } from './entities/BossController';
import { loadAllLevels, LevelTimelineDriver } from './levels/LevelLoader';
import { EnvironmentRig } from './levels/EnvironmentRig';
import { TrackCurve } from './levels/TrackCurve';
import { HUD, type CommsSpeaker, type StoryCrawlData } from './ui/HUD';
import type { LevelConfig, TimelineEvent } from './levels/LevelSchema';

const LEVEL_MUSIC_MAP: Record<string, string> = {
  'neon-canyon': 'level-01-neon-canyon',
  'prism-belt': 'level-02-prism-belt',
  'hyper-spire': 'level-03-hyper-spire',
};

const BOSS_CUTSCENE_MAP: Record<string, string> = {
  aegis_dreadnought: 'boss-01-aegis',
  octa_core_sentinel: 'boss-02-sentinel',
  solaris_leviathan: 'boss-03-leviathan',
};

const FIXED_DT = 1 / 60;

interface BanterLine {
  voId: string;
  speaker: CommsSpeaker;
  text: string;
}

const BANTER: Record<string, BanterLine[]> = {
  missionStart: [
    { voId: 'mission-start-1', speaker: 'commander', text: "Alright rookie, the aliens came to put boot in ass. Let's return the favor!" },
    { voId: 'mission-start-2', speaker: 'wingman', text: "All thrusters locked! Try not to fly into a giant rock in the first ten seconds!" },
    { voId: 'mission-start-3', speaker: 'commander', text: "Zero insurance on this starfighter and the galaxy's counting on you. Punch it!" },
    { voId: 'mission-start-4', speaker: 'wingman', text: "Hostiles ahead! Keep your eyes open, dodge the red stuff, and blast everything that moves!" },
    { voId: 'mission-start-5', speaker: 'commander', text: "Welcome to the Neon Frontier! Time to chew bubblegum and kick alien ass—and we're all out of gum!" },
  ],
  streak: [
    { voId: 'streak-1', speaker: 'wingman', text: "Boom! That whole squadron just got deleted! Keep tearing 'em up!" },
    { voId: 'streak-2', speaker: 'commander', text: "Sweet mother of lasers! You're shredding 'em like cheap cardboard!" },
    { voId: 'streak-3', speaker: 'grunt', text: "AAAH! MOMMY! THIS HUMAN IS INSANE! RETREAT!!" },
    { voId: 'streak-4', speaker: 'commander', text: "Now that is what I call express delivery of boot to ass! Keep firing!" },
    { voId: 'streak-5', speaker: 'wingman', text: "Clean sweep! Look at those explosions—pure arcade perfection!" },
  ],
  overdrive: [
    { voId: 'overdrive-1', speaker: 'wingman', text: "Ten-x combo! Triple plasma overdrive online—unleash hell!" },
    { voId: 'overdrive-2', speaker: 'commander', text: "Overdrive unlocked! Whip out the triple cannons and light up the sky!" },
    { voId: 'overdrive-3', speaker: 'wingman', text: "Ten-x multiplier! Weapons at maximum power—melt their faces off!" },
    { voId: 'overdrive-4', speaker: 'commander', text: "Maximum overdrive! You are officially a certified one-man armada!" },
  ],
  barrelRoll: [
    { voId: 'barrel-roll-1', speaker: 'wingman', text: "Nice barrel roll! You slapped that plasma right back in their face!" },
    { voId: 'barrel-roll-2', speaker: 'commander', text: "Do a barrel roll! Return to sender, alien scum!" },
    { voId: 'barrel-roll-3', speaker: 'grunt', text: "HEY! THAT WAS MY LASER! STOP BOUNCING IT BACK!" },
    { voId: 'barrel-roll-4', speaker: 'commander', text: "Ha! Bounced that laser right back down their exhaust pipe!" },
    { voId: 'barrel-roll-5', speaker: 'wingman', text: "Clean spin! Not a scratch on the paint!" },
  ],
  playerHit: [
    { voId: 'player-hit-1', speaker: 'commander', text: "Ow! Quit eating rocks with your face, rookie! Use your thrusters!" },
    { voId: 'player-hit-2', speaker: 'wingman', text: "Whoa, watch it! The glowing red things are bad—steer around 'em!" },
    { voId: 'player-hit-3', speaker: 'commander', text: "Hey! That hull paint cost more than your salary! Steer the ship!" },
    { voId: 'player-hit-4', speaker: 'wingman', text: "Ouch! Did you just headbutt a laser beam? That's not how you dodge!" },
    { voId: 'player-hit-5', speaker: 'commander', text: "My grandma flies smoother than that and she only drove a golf cart!" },
  ],
  ringPickup: [
    { voId: 'ring-pickup-1', speaker: 'wingman', text: "Right through the gate! Shields up, turbo engaged!" },
    { voId: 'ring-pickup-2', speaker: 'commander', text: "Threaded the needle like a pro! Hit the gas and hug those turns!" },
    { voId: 'ring-pickup-3', speaker: 'wingman', text: "Turbo boost online! Now that's some serious space racing!" },
    { voId: 'ring-pickup-4', speaker: 'commander', text: "Pure racing perfection! Burn some cosmic rubber!" },
  ],
  lowShield: [
    { voId: 'low-shield-1', speaker: 'commander', text: "Your shields are thinner than cheap hotel toilet paper! Grab a gold ring!" },
    { voId: 'low-shield-2', speaker: 'wingman', text: "Hull's barely holding together! Fly through a gold ring before we blow!" },
    { voId: 'low-shield-3', speaker: 'commander', text: "Red alert! One more hit and we're space confetti! Find a shield ring!" },
  ],
  bossWarning: [
    { voId: 'boss-warning-1', speaker: 'commander', text: "Holy mother of god, look at the size of that metal monster! Blast its glowy bits off!" },
    { voId: 'boss-warning-2', speaker: 'wingman', text: "Massive dreadnought dead ahead! Target the glowing weak points and stay sharp!" },
  ],
  bossBootNAss: [
    { voId: 'boss-bootnass-1', speaker: 'boss', text: "I'MMA PUT BOOT N ASS!! I'MMA PUT BOOT N ASS!!" },
    { voId: 'boss-bootnass-2', speaker: 'boss', text: "WARNING!! I'MMA PUT BOOT N ASS!! PREPARE FOR BOOT N ASS!!" },
    { voId: 'boss-bootnass-3', speaker: 'boss', text: "INITIATING MAXIMUM PAIN!! I'MMA PUT BOOT N ASS!!" },
    { voId: 'boss-bootnass-4', speaker: 'boss', text: "ERROR!! ERROR!! I'MMA PUT BOOT N ASS RIGHT NOW!!" },
  ],
  bossTaunt: [
    { voId: 'boss-taunt-1', speaker: 'boss', text: "How adorable. You brought a tiny pew-pew toy to a dreadnought fight. I'MMA PUT BOOT N ASS!" },
    { voId: 'boss-taunt-2', speaker: 'boss', text: "Scanning your cockpit. Massive ego, microscopic shields. I'MMA PUT BOOT N ASS!" },
    { voId: 'boss-taunt-3', speaker: 'boss', text: "Full laser sweep engaged! Dance for me, tiny human! I'MMA PUT BOOT N ASS!" },
  ],
  bossPhase2: [
    { voId: 'boss-phase2-1', speaker: 'wingman', text: "Armor shredded! Its central core is wide open—blast it to kingdom come!" },
    { voId: 'boss-phase2-2', speaker: 'commander', text: "You blew its armor right off! Shove a quad-lock missile straight into the reactor!" },
    { voId: 'boss-phase2-3', speaker: 'wingman', text: "Ooh, he's furious now! Watch those sweeping beams and finish him!" },
  ],
  levelClear: [
    { voId: 'level-clear-1', speaker: 'commander', text: "Boom! Smoked 'em! First round of space tacos is on me, legend!" },
    { voId: 'level-clear-2', speaker: 'wingman', text: "Target obliterated! You officially put boot in that alien ass!" },
    { voId: 'level-clear-3', speaker: 'commander', text: "Sector cleared! That giant robot didn't know what hit its shiny metal ass!" },
  ],
  gameOver: [
    { voId: 'game-over-1', speaker: 'commander', text: "Well crap, that's coming out of your paycheck. Rebuilding the ship now!" },
    { voId: 'game-over-2', speaker: 'wingman', text: "Blown to space dust! Shake it off, pilot, and get back in there!" },
    { voId: 'game-over-3', speaker: 'boss', text: "MISSION COMPLETE. I PUT BOOT N ASS. TRY AGAIN, HUMAN." },
  ],
};

class StarburstGame {
  private readonly renderer: Renderer;
  private readonly state = new GameState();
  private readonly input = new InputManager();
  private readonly audio = new AudioSynth();
  private readonly particles: ParticlePool;
  private readonly collisions = new CollisionSystem();
  private readonly player: PlayerShip;
  private readonly projectiles: ProjectilePool;
  private readonly enemies: EnemyFactory;
  private readonly obstacles: ObstacleFactory;
  private readonly boss: BossController;
  private readonly env: EnvironmentRig;
  private readonly trackCurve = new TrackCurve();
  private readonly hud: HUD;

  private levels: LevelConfig[] = [];
  private timeline: LevelTimelineDriver | null = null;
  private storyData: StoryCrawlData | null = null;

  // Boss checkpoint tracking — if you lose at the boss, retry starts right at the boss!
  private bossCheckpointDist: number | null = null;

  // True Fisher-Yates shuffle bags (ZERO repeats until every line in a category has played!)
  private shuffleBags = new Map<string, number[]>();
  private casualBanterCooldown = 0;

  // Opening crawl audio auto-start flag
  private crawlAudioStarted = false;

  // Game feel ("Juice") + Arcade Racer Turbo
  private hitstopTimer = 0;
  private screenShake = 0;
  private turboBoostTimer = 0;
  private lowShieldWarned = false;
  private bossClearDelay = 0;

  // Dynamic corridor hazards & weapon crates
  private ambientHazardTimer = 2.0;
  private ambientCycle = 0;
  private attractDist = 0;

  // Charge Lock-On state
  private lockedTargets: HomingTarget[] = [];
  private lockScanCooldown = 0;

  // Loop timing
  private lastTime = performance.now();
  private accumulator = 0;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const uiRoot = document.getElementById('ui-root') as HTMLElement;

    this.renderer = new Renderer(canvas);
    this.particles = new ParticlePool(this.renderer.scene);
    this.player = new PlayerShip(this.renderer.scene);
    this.projectiles = new ProjectilePool(this.renderer.scene);
    this.enemies = new EnemyFactory(this.renderer.scene);
    this.obstacles = new ObstacleFactory(this.renderer.scene);
    this.boss = new BossController(this.renderer.scene);
    this.env = new EnvironmentRig(this.renderer.scene);

    this.hud = new HUD(uiRoot, {
      onBootStart: () => this.handleBootStart(),
      onCrawlFinished: () => this.enterTitle(),
      onStartCampaign: () => {
        this.audio.unlock();
        this.state.totalCampaignScore = 0;
        this.bossCheckpointDist = null;
        this.playCutsceneThen('intro-launch', () => this.startLevel(0, 0));
      },
      onOpenLevelSelect: () => {
        this.audio.unlock();
        this.state.phase = 'LevelSelect';
        this.hud.renderPhase('LevelSelect', this.state, this.levels);
      },
      onReplayCrawl: () => {
        this.audio.unlock();
        this.enterCrawl();
      },
      onSelectLevel: (idx) => {
        this.audio.unlock();
        this.bossCheckpointDist = null;
        this.startLevel(idx, 0);
      },
      onBackToTitle: () => this.enterTitle(),
      onNextLevel: () => {
        this.bossCheckpointDist = null;
        const nextIdx = this.state.currentLevelIndex + 1;
        if (nextIdx < this.levels.length) {
          this.startLevel(nextIdx, 0);
        } else {
          this.playCutsceneThen('victory-ending', () => {
            this.state.phase = 'Victory';
            this.audio.playMusicTrack('victory-fanfare', true, 0.55);
            this.hud.renderPhase('Victory', this.state, this.levels);
          });
        }
      },
      onRetryLevel: () => {
        this.bossCheckpointDist = null;
        this.startLevel(this.state.currentLevelIndex, 0);
      },
      onRetryBoss: () => {
        const dist = this.bossCheckpointDist ?? 0;
        this.startLevel(this.state.currentLevelIndex, Math.max(0, dist - 140));
      },
      onResume: () => {
        if (this.state.phase === 'Paused') {
          this.state.phase = 'Playing';
          this.hud.removePauseOverlay();
        }
      },
      onToggleMouseAim: () => {
        this.state.mouseAimEnabled = !this.state.mouseAimEnabled;
        if (this.state.phase === 'Title') {
          this.hud.renderPhase('Title', this.state, this.levels);
        }
      },
      onToggleMute: () => {
        this.state.muted = !this.state.muted;
        this.audio.setMuted(this.state.muted);
        if (this.state.phase === 'Title') {
          this.hud.renderPhase('Title', this.state, this.levels);
        }
      },
      onToggleNintendoLayout: () => {
        this.input.setNintendoLayout(!this.input.nintendoFaceLayout);
        this.hud.setControllerInfo(
          this.input.gamepadConnected,
          this.input.gamepadProfile,
          this.input.gamepadName,
          this.input.nintendoFaceLayout
        );
        if (this.state.phase === 'Title') {
          this.hud.renderPhase('Title', this.state, this.levels);
        }
      },
      onTestRumble: () => {
        if (!this.input.gamepadConnected) {
          return 'PRESS A BUTTON ON YOUR PAD FIRST!';
        }
        const ok = this.input.rumble(0.9, 0.7, 280);
        return ok
          ? '💥 RUMBLE FIRED!'
          : 'NO BROWSER RUMBLE ACTUATOR (TIP: PAIR 8BITDO IN X-INPUT MODE: START+X)';
      },
      onUiHover: () => this.audio.playUiHover(),
      onUiConfirm: () => {
        this.audio.unlock();
        this.audio.playUiConfirm();
      },
      onPlayCrawlVO: () => {
        this.startCrawlAudio(true);
      },
    });

    // Unlock crawl audio on first user gesture if browser autoplay initially paused AudioContext
    const unlockCrawlGesture = () => {
      this.audio.resumeMusicIfPaused();
      if (this.state.phase === 'Crawl' && !this.crawlAudioStarted) {
        this.startCrawlAudio(false);
      }
    };
    window.addEventListener('pointerdown', unlockCrawlGesture);

    window.addEventListener('keydown', (e) => {
      if (this.hud.isCutscenePlaying) {
        if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
          e.preventDefault();
          this.hud.skipActiveCutscene(true);
        }
        return;
      }
      if (this.state.phase === 'Boot') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          this.handleBootStart();
        }
        return;
      }
      if (this.state.phase === 'Crawl') {
        if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
          e.preventDefault();
          this.enterTitle();
        } else if (!this.crawlAudioStarted) {
          this.startCrawlAudio(false);
        }
      } else if (this.state.phase === 'Playing') {
        if (e.code === 'KeyM') {
          this.state.mouseAimEnabled = !this.state.mouseAimEnabled;
        } else if (e.code === 'KeyN') {
          this.state.muted = !this.state.muted;
          this.audio.setMuted(this.state.muted);
        }
      }
    });

    void this.boot();
  }

  private playCutsceneThen(videoId: string, onDone: () => void): void {
    this.audio.stopMusicTrack();
    this.audio.stopVO();
    this.hud.playCutscene(videoId, this.state.muted, onDone);
  }

  private startCrawlAudio(forceRestart: boolean): void {
    this.audio.unlock();
    // Keep crawl BG music lower so the opening narration is super clear over the rolling credits
    this.audio.playMusicTrack('crawl-theme', true, 0.22, 0.65);
    this.crawlAudioStarted = true;
    void this.audio.playVO('crawl-narration', false, forceRestart);
  }

  /**
   * Draws from a Fisher-Yates shuffle bag so dialogue NEVER repeats until every line in the category has played.
   */
  private drawFromShuffleBag(category: string, length: number): number {
    let bag = this.shuffleBags.get(category);
    if (!bag || bag.length === 0) {
      bag = Array.from({ length }, (_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this.shuffleBags.set(category, bag);
    }
    return bag.pop()!;
  }

  private playCategoryBanter(
    category: keyof typeof BANTER,
    duration = 4.2,
    priority = false,
    chance = 1.0
  ): void {
    // Never interrupt active VO unless priority event; keep casual banter spaced out and fresh!
    if (!priority) {
      if (this.audio.isVoPlaying()) return;
      if (this.casualBanterCooldown > 0) return;
      if (Math.random() > chance) return;
    }

    const list = BANTER[category];
    if (!list || list.length === 0) return;

    const idx = this.drawFromShuffleBag(category, list.length);
    const line = list[idx];
    if (!priority) {
      this.casualBanterCooldown = 7.5;
    }
    this.hud.showComms(line.speaker, line.text, duration);
    void this.audio.playVO(line.voId, line.speaker !== 'boss', priority);
  }

  private handleBootStart(): void {
    this.audio.unlock();
    const params = new URLSearchParams(window.location.search);
    const paramLevel = params.get('level');
    const paramDist = Number(params.get('startDist') ?? '0');
    const skipCrawl = params.get('skipCrawl') === '1';

    if (paramLevel) {
      const idx = this.levels.findIndex((l) => l.id === paramLevel);
      if (idx >= 0) {
        this.startLevel(idx, Number.isFinite(paramDist) ? paramDist : 0);
        return;
      }
    }
    if (skipCrawl) {
      this.enterTitle();
    } else {
      this.enterCrawl();
    }
  }

  private async boot(): Promise<void> {
    const loaded = loadAllLevels();
    if (loaded.errors.length > 0) {
      this.hud.showValidationErrors(loaded.errors);
      return;
    }
    this.levels = loaded.levels;

    if (this.levels.length > 0) {
      this.env.applyEnvironment(this.levels[0].environment);
    }

    this.storyData = await this.hud.loadStoryFile();

    // Always start with the big arcade START button so window focus & audio are 100% unlocked!
    this.state.phase = 'Boot';
    this.player.reset();
    this.player.root.visible = true;
    this.hud.renderPhase('Boot', this.state, this.levels);

    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  private enterCrawl(): void {
    this.audio.setMusicState(false);
    this.audio.stopVO();
    this.crawlAudioStarted = false;
    this.state.phase = 'Crawl';
    this.player.root.visible = false;
    if (this.storyData) {
      this.hud.renderPhase('Crawl', this.state, this.levels, this.storyData);
    }
    // Attempt immediate auto-play of narration & crawl BG music!
    this.startCrawlAudio(true);
  }

  private enterTitle(): void {
    this.audio.stopVO();
    this.audio.playMusicTrack('title-theme', true, 0.48);
    this.clearEntities();
    this.state.phase = 'Title';
    this.player.reset();
    this.player.root.visible = true;
    this.hud.renderPhase('Title', this.state, this.levels);
  }

  private startLevel(index: number, startDist: number): void {
    const level = this.levels[index];
    if (!level) return;

    this.clearEntities();
    this.state.currentLevelIndex = index;
    this.state.resetLevelStats();
    this.state.phase = 'Playing';
    this.lowShieldWarned = false;
    this.bossClearDelay = 0;
    this.hitstopTimer = 0;
    this.screenShake = 0;
    this.turboBoostTimer = 0;
    this.casualBanterCooldown = 4.0;
    this.ambientHazardTimer = 1.6;
    this.ambientCycle = 0;
    this.lockedTargets = [];

    this.player.reset();
    this.trackCurve.reset();
    this.env.applyEnvironment(level.environment);
    this.timeline = new LevelTimelineDriver(level, startDist);
    this.hud.setBossCheckpoint(this.bossCheckpointDist !== null);

    this.hud.renderPhase('Playing', this.state, this.levels);
    if (startDist > 0 && this.bossCheckpointDist !== null) {
      this.hud.showBanner('BOSS CHECKPOINT // ROUND TWO!', 2.4);
      this.audio.playMusicTrack('boss-battle', true, 0.44, 0.78);
    } else {
      this.hud.showBanner(level.name, 2.8);
      const track =
        LEVEL_MUSIC_MAP[level.id] ??
        ['level-01-neon-canyon', 'level-02-prism-belt', 'level-03-hyper-spire'][index % 3];
      this.audio.playMusicTrack(track, true, 0.42, 0.78);
      this.playCategoryBanter('missionStart', 4.4, true);
    }
  }

  private clearEntities(): void {
    this.enemies.clear();
    this.obstacles.clear();
    this.projectiles.clear();
    this.particles.clear();
    this.boss.clear();
    this.lockedTargets = [];
  }

  private triggerNovaBomb(): void {
    if (this.player.novaBombs <= 0) return;
    this.player.novaBombs -= 1;
    this.audio.playNovaBomb();
    this.input.rumble(1.0, 0.8, 350);
    this.screenShake = 1.4;
    this.hitstopTimer = 0.06;
    this.particles.spawnShockwave(this.player.position.clone(), 0x00f0ff, 38, 0.75);
    this.particles.spawnShockwave(this.player.position.clone(), 0xffd447, 28, 0.55);
    this.hud.showBanner('NOVA SMART BOMB DETONATED!', 1.8);

    // Vaporize ALL enemy projectiles on screen!
    for (const p of this.projectiles.projectiles) {
      if (p.active && p.kind === 'enemy_plasma') {
        p.active = false;
        this.particles.burst(p.pos, 4, 0x00f0ff, 12, 0.6, 0.25);
      }
    }

    // Blast all active enemies on screen!
    for (const e of this.enemies.enemies) {
      if (e.alive && e.mesh.position.z > -150) {
        const killed = this.enemies.damageEnemy(e, 140);
        if (killed) {
          this.state.registerKill(e.scoreValue);
          this.particles.burst(e.mesh.position, 22, 0xffd447, 24, 1.2, 0.65);
        }
      }
    }

    // Chunk active boss parts!
    if (this.boss.active) {
      for (const part of this.boss.getTargetableParts()) {
        const res = this.boss.damagePart(part, 75);
        this.particles.burst(res.pos, 18, 0xffd447, 24, 1.2, 0.55);
        if (res.bossDefeated) {
          this.handleBossDefeated();
          break;
        }
      }
    }
  }

  private handleBossDefeated(): void {
    this.hitstopTimer = 0.11;
    this.state.addBonusScore(4000);
    this.audio.playExplosion(true);
    this.input.rumble(1.0, 0.9, 450);
    this.particles.burst(this.boss.root.position.clone(), 70, 0xffd447, 38, 2.0, 1.2);
    this.particles.burst(this.boss.root.position.clone(), 50, 0x00f0ff, 32, 1.6, 1.0);
    this.particles.spawnShockwave(this.boss.root.position.clone(), 0x00f0ff, 34, 0.85);
    this.screenShake = 1.5;
    this.bossClearDelay = 2.6;
    this.bossCheckpointDist = null;
    this.hud.setBossCheckpoint(false);
    this.audio.setMusicState(false);
    this.hud.showBanner('TARGET OBLITERATED // SECTOR CLEAR', 2.6);
    this.playCategoryBanter('levelClear', 4.2, true);
  }

  private loop = (now: number): void => {
    const rawDt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.accumulator += rawDt;

    while (this.accumulator >= FIXED_DT) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    this.renderer.render();
    requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    const input = this.input.poll();

    // Pause simulation cleanly while a fullscreen cutscene plays; Controller A / Start skips!
    if (this.hud.isCutscenePlaying) {
      if (input.menuConfirmPressed || input.pausePressed) {
        this.hud.skipActiveCutscene(true);
      }
      return;
    }

    // Keep Title Screen live controller status updated whenever you press a button on your Bluetooth pad!
    this.hud.setControllerInfo(
      input.gamepadConnected,
      input.gamepadProfile,
      input.gamepadName,
      this.input.nintendoFaceLayout
    );

    if (this.state.phase !== 'Playing') {
      // Allow native Bluetooth Controller A/Start button to navigate Crawl, Title, Pause, LevelClear, GameOver!
      if (input.menuConfirmPressed) {
        this.audio.unlock();
        if (this.state.phase === 'Boot') {
          this.handleBootStart();
          return;
        } else if (this.state.phase === 'Crawl') {
          this.enterTitle();
          return;
        } else if (this.state.phase === 'Title') {
          this.state.totalCampaignScore = 0;
          this.bossCheckpointDist = null;
          this.startLevel(0, 0);
          return;
        } else if (this.state.phase === 'Paused') {
          this.state.phase = 'Playing';
          this.hud.removePauseOverlay();
          return;
        } else if (this.state.phase === 'GameOver') {
          if (this.bossCheckpointDist !== null) {
            this.startLevel(this.state.currentLevelIndex, Math.max(0, this.bossCheckpointDist - 140));
          } else {
            this.startLevel(this.state.currentLevelIndex, 0);
          }
          return;
        } else if (this.state.phase === 'LevelClear') {
          const nextIdx = this.state.currentLevelIndex + 1;
          if (nextIdx < this.levels.length) this.startLevel(nextIdx, 0);
          else {
            this.state.phase = 'Victory';
            this.hud.renderPhase('Victory', this.state, this.levels);
          }
          return;
        }
      }

      if (this.state.phase === 'Paused' && input.pausePressed) {
        this.state.phase = 'Playing';
        this.hud.removePauseOverlay();
        return;
      }

      if (this.state.phase !== 'Paused') {
        const t = performance.now() * 0.001;
        this.attractDist += 42 * dt;
        this.trackCurve.update(dt, this.attractDist, 0, false);
        this.env.update(dt, 42, false, this.trackCurve);
        this.particles.update(dt, 42);
        this.audio.updateMusic(dt);
        this.player.root.position.set(Math.sin(t * 0.7) * 3.5, Math.cos(t * 0.9) * 1.4, 0);
        this.player.root.rotation.set(0, 0, -Math.cos(t * 0.7) * 0.22 + this.trackCurve.bankRoll * 0.6);
        this.renderer.camera.position.lerp(new THREE.Vector3(0, 2.5, 14), dt * 3);
        this.renderer.camera.lookAt(this.trackCurve.curveX * 0.35, this.trackCurve.curveY * 0.25, -40);
        this.renderer.camera.rotation.z = this.trackCurve.bankRoll * 0.65;
      }
      return;
    }

    if (input.pausePressed) {
      this.state.phase = 'Paused';
      this.hud.renderPhase('Paused', this.state, this.levels);
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }
    if (this.casualBanterCooldown > 0) this.casualBanterCooldown -= dt;
    if (this.turboBoostTimer > 0) this.turboBoostTimer -= dt;

    const level = this.levels[this.state.currentLevelIndex];
    const isSuperBoost = this.player.isBoosting || this.turboBoostTimer > 0;
    const speedMult = this.turboBoostTimer > 0 ? 1.52 : this.player.isBoosting ? 1.45 : this.player.isBraking ? 0.65 : 1.08;
    const railSpeed = level.baseSpeed * speedMult;

    const currentDist = this.timeline ? this.timeline.distance : 0;
    this.trackCurve.update(dt, currentDist, this.state.currentLevelIndex, this.boss.active);

    // 1. Update Player (+ Somersault Backflip & Nova Bomb!)
    const { startedBoost, startedRoll, startedSomersault } = this.player.update(
      dt,
      input,
      railSpeed,
      this.state.mouseAimEnabled
    );
    if (startedBoost) this.audio.playBoost();
    if (startedRoll) {
      this.audio.playBarrelRoll();
      this.input.rumble(0.25, 0.3, 80);
    }
    if (startedSomersault) {
      this.audio.playSomersault();
      this.input.rumble(0.55, 0.45, 160);
      this.particles.spawnShockwave(this.player.position.clone(), 0xffd447, 16, 0.45);
      // EMP pulse clears nearby enemy bullets!
      for (const p of this.projectiles.projectiles) {
        if (p.active && p.kind === 'enemy_plasma' && p.pos.distanceTo(this.player.position) < 20) {
          p.active = false;
          this.particles.burst(p.pos, 6, 0x00f0ff, 14, 0.7, 0.28);
        }
      }
    }
    if (input.novaBombPressed) {
      this.triggerNovaBomb();
    }

    if (Math.random() < (isSuperBoost ? 0.92 : 0.48)) {
      const pPos = this.player.position.clone().add(new THREE.Vector3(0, 0, 2.0));
      this.particles.spawnTrail(pPos, isSuperBoost ? 0xffd447 : 0x00f0ff, 0.36, 0.22);
    }

    // 2. Rapid-Fire Plasma (Twin / Overdrive Triple / 5-Way Spread / Hyper Gatling!)
    if (input.fire && this.player.fireCooldown <= 0) {
      this.audio.unlock();
      const overdrive = this.state.isOverdrive;
      const mode = this.player.weaponMode;
      this.player.fireCooldown =
        mode === 'gatling' ? 0.052 : mode === 'spread' ? 0.13 : overdrive ? 0.082 : 0.092;

      const [mLeft, mRight] = this.player.getCannonMuzzles();
      const fireDir = this.getAimAssistedDirection();

      if (mode === 'spread') {
        const centerM = this.player.position.clone().add(new THREE.Vector3(0, 0.05, -1.0));
        for (let k = -2; k <= 2; k++) {
          const spreadDir = fireDir.clone().add(new THREE.Vector3(k * 0.095, Math.abs(k) * 0.015, 0)).normalize();
          this.projectiles.spawnPlayerBolt(centerM, spreadDir, true, false);
        }
        this.state.stats.shotsFired += 5;
      } else {
        this.projectiles.spawnPlayerBolt(mLeft, fireDir, overdrive || mode === 'gatling', false);
        this.projectiles.spawnPlayerBolt(mRight, fireDir, overdrive || mode === 'gatling', false);
        this.state.stats.shotsFired += 2;
        if (overdrive) {
          const centerM = this.player.position.clone().add(new THREE.Vector3(0, 0.1, -1.2));
          this.projectiles.spawnPlayerBolt(centerM, fireDir, true, false);
          this.state.stats.shotsFired += 1;
        }
      }
      this.audio.playLaser(overdrive || mode !== 'twin');
    }

    // 3. Charge Lock-On Missiles
    this.updateLockOn(dt, input.chargeLock, input.chargeReleased);

    // 4. Advance Level Timeline + Escalating Obstacle Intensity (L1/L2 more intense, L3 highest!)
    if (this.timeline && !this.boss.active && this.bossClearDelay <= 0) {
      this.timeline.advance(dt, railSpeed, (ev) => this.handleTimelineEvent(ev, level));

      const lvlIdx = this.state.currentLevelIndex;
      const interval = lvlIdx === 0 ? 3.2 : lvlIdx === 1 ? 2.55 : 2.0;
      const maxObstacles = lvlIdx === 0 ? 4 : lvlIdx === 1 ? 5 : 6;
      this.ambientHazardTimer -= dt;
      if (this.ambientHazardTimer <= 0) {
        this.ambientHazardTimer = interval;
        if (this.obstacles.obstacles.length < maxObstacles) {
          this.spawnAmbientCorridorObject(level);
        }
      }
    }

    // Dynamic ship accent lighting + Turbo screen-edge energy glow
    this.player.setAccentState(this.state.isOverdrive, this.turboBoostTimer > 0);
    this.hud.setTurboGlow(this.turboBoostTimer > 0);

    // 5. Update World, Enemies, Obstacles, Boss, Projectiles, Particles
    this.env.update(dt, railSpeed, isSuperBoost, this.trackCurve);
    this.enemies.update(dt, railSpeed, this.player.position, this.projectiles);
    this.obstacles.update(dt, railSpeed, this.trackCurve);
    this.boss.update(
      dt,
      this.player.position,
      this.player.velocity,
      this.projectiles,
      this.enemies,
      () => {
        this.audio.playBossAlarm();
        this.hud.showBanner("I'MMA PUT BOOT N ASS // LASER SWEEP!", 1.8);
        this.playCategoryBanter('bossBootNAss', 3.4, false, 1.0);
      }
    );
    this.projectiles.update(dt, (pos) => {
      this.particles.spawnTrail(pos, 0xffd447, 0.42, 0.24);
    });
    this.particles.update(dt, railSpeed);
    this.state.updateComboTimer(dt);
    this.audio.updateMusic(dt);

    // 6. Collisions & Juice
    this.collisions.resolve(
      this.player,
      this.projectiles,
      this.enemies,
      this.obstacles,
      this.boss,
      {
        onEnemyHit: (_e, pos) => {
          this.state.registerHit();
          this.audio.playHitTick();
          this.hud.triggerHitMarker();
          this.particles.burst(pos, 5, 0x00f0ff, 12, 0.6, 0.25);
        },
        onEnemyKilled: (e, pos) => {
          this.state.registerHit();
          const { points, enteredOverdrive } = this.state.registerKill(e.scoreValue);
          this.audio.playExplosion(false);
          this.hud.triggerHitMarker();
          this.input.rumble(0.22, 0.35, 75);
          this.particles.burst(pos, 24, 0xff5500, 22, 1.15, 0.62);
          this.particles.burst(pos, 10, 0xffd447, 16, 0.85, 0.45);
          this.particles.spawnShockwave(pos, 0xff7722, 6.5, 0.3);
          const sp = this.projectToScreen(pos);
          this.hud.spawnFloatingText(sp.x, sp.y, `+${points.toLocaleString()}`, this.state.isOverdrive ? '#ffd447' : '#00f0ff');
          this.screenShake = Math.max(this.screenShake, 0.28);
          if (enteredOverdrive) {
            this.hud.showBanner('10x OVERDRIVE // TRIPLE PLASMA', 2.2);
            this.playCategoryBanter('overdrive', 3.8, false, 0.85);
          } else if (this.state.stats.combo === 6 || this.state.stats.combo === 12) {
            this.playCategoryBanter('streak', 3.4, false, 0.55);
          }
        },
        onCrystalDestroyed: (_obs, pos) => {
          this.state.registerHit();
          const pts = this.state.addBonusScore(250);
          this.audio.playExplosion(false);
          this.hud.triggerHitMarker();
          this.particles.burst(pos, 26, 0x00ffd5, 25, 1.25, 0.72);
          this.particles.spawnShockwave(pos, 0x00ffd5, 7.5, 0.34);
          const sp = this.projectToScreen(pos);
          this.hud.spawnFloatingText(sp.x, sp.y, `SHATTER +${pts}`, '#00ffd5');
          this.screenShake = Math.max(this.screenShake, 0.26);
        },
        onBossPartHit: (_part, pos, phaseBreak, bossDefeated, partDestroyed) => {
          this.state.registerHit();
          this.audio.playHitTick();
          this.particles.burst(pos, 8, 0xffd447, 16, 0.8, 0.32);

          if (partDestroyed) {
            this.state.addBonusScore(800);
            this.audio.playExplosion(true);
            this.input.rumble(0.7, 0.5, 200);
            this.particles.burst(pos, 36, 0xff4422, 30, 1.5, 0.85);
            this.particles.spawnShockwave(pos, 0xff4422, 13, 0.48);
            this.screenShake = Math.max(this.screenShake, 0.7);
          }

          if (phaseBreak && !bossDefeated) {
            this.hitstopTimer = 0.085;
            this.audio.playExplosion(true);
            this.input.rumble(0.95, 0.8, 320);
            this.particles.spawnShockwave(this.boss.root.position.clone(), 0xffd447, 26, 0.7);
            this.screenShake = 1.1;
            this.hud.showBanner("PHASE 2 // I'MMA PUT BOOT N ASS!", 2.8);
            this.playCategoryBanter('bossBootNAss', 3.8, true);
            window.setTimeout(() => {
              if (this.boss.active && this.state.phase === 'Playing') {
                this.playCategoryBanter('bossPhase2', 4.0, false, 1.0);
              }
            }, 4100);
          }

          if (bossDefeated) {
            this.handleBossDefeated();
          }
        },
        onPlayerDamaged: (_amt, pos, source) => {
          this.state.resetCombo();
          this.audio.playPlayerHit();
          this.input.rumble(0.85, 0.65, 220);
          this.hud.triggerDamageFlash();
          this.particles.burst(pos, 18, 0xff3355, 20, 1.0, 0.48);
          this.screenShake = Math.max(this.screenShake, source === 'obstacle' ? 0.95 : 0.72);

          if (this.player.shield <= 30 && this.player.shield > 0 && !this.lowShieldWarned) {
            this.lowShieldWarned = true;
            this.playCategoryBanter('lowShield', 4.2, false, 0.85);
          } else if (this.player.shield > 0) {
            // Only speak on ~38% of hits (and never overlap) to stay fresh & funny!
            this.playCategoryBanter('playerHit', 3.6, false, 0.38);
          }

          if (this.player.shield <= 0) {
            this.state.phase = 'GameOver';
            this.audio.stopMusicTrack();
            this.audio.playExplosion(true);
            this.hud.setBossCheckpoint(this.bossCheckpointDist !== null);
            this.playCutsceneThen('gameover-eject', () => {
              this.hud.renderPhase('GameOver', this.state, this.levels);
              this.playCategoryBanter('gameOver', 4.0, true);
            });
          }
        },
        onDeflectShot: (proj) => {
          this.state.stats.deflections += 1;
          this.state.addBonusScore(140);
          this.audio.playDeflect();
          this.input.rumble(0.35, 0.45, 90);
          this.particles.burst(proj.pos, 14, 0x00f0ff, 18, 0.8, 0.35);
          this.particles.spawnShockwave(proj.pos, 0x00f0ff, 5.5, 0.25);

          const reflectDir = this.getAimAssistedDirection();
          this.projectiles.spawnPlayerBolt(proj.pos, reflectDir, true, true);
          const sp = this.projectToScreen(proj.pos);
          this.hud.spawnFloatingText(sp.x, sp.y, 'DEFLECT!', '#00f0ff');
          this.playCategoryBanter('barrelRoll', 3.4, false, 0.35);
        },
        onBoostRing: (obs) => {
          this.state.stats.ringsCollected += 1;
          this.player.heal(15);
          this.lowShieldWarned = this.player.shield <= 30;
          const pts = this.state.addBonusScore(300);
          this.audio.playRingPickup();
          this.particles.burst(obs.mesh.position, 18, 0xffd447, 16, 0.9, 0.5);
          this.particles.spawnShockwave(obs.mesh.position, 0xffd447, 9, 0.38);
          const sp = this.projectToScreen(obs.mesh.position);
          this.hud.spawnFloatingText(sp.x, sp.y, `SHIELD +15% // +${pts}`, '#ffd447');
          this.playCategoryBanter('ringPickup', 3.0, false, 0.35);
        },
        onSlalomGate: (obs) => {
          this.turboBoostTimer = 1.5;
          this.player.heal(8);
          const pts = this.state.addBonusScore(500);
          this.audio.playBoost();
          this.audio.playRingPickup();
          this.input.rumble(0.3, 0.4, 120);
          this.particles.burst(obs.mesh.position, 22, 0x00ff88, 22, 1.0, 0.55);
          this.particles.spawnShockwave(obs.mesh.position, 0x00ff88, 12, 0.42);
          const sp = this.projectToScreen(obs.mesh.position);
          this.hud.spawnFloatingText(sp.x, sp.y, `TURBO +${pts}!`, '#00ff88');
          this.hud.showBanner('TURBO GATE // +500', 1.1);
        },
        onWeaponCrate: (obs) => {
          this.audio.playPowerup();
          this.input.rumble(0.45, 0.6, 150);
          this.particles.burst(obs.mesh.position, 26, 0xd946ff, 22, 1.1, 0.55);
          this.particles.spawnShockwave(obs.mesh.position, 0xd946ff, 12, 0.42);
          const pick = Math.floor(Math.random() * 3);
          if (pick === 0) {
            this.player.grantWeaponUpgrade('spread', 15);
            this.hud.showBanner('UPGRADE // 5-WAY SPREAD LASER!', 2.2);
            this.hud.showComms('mechanic', 'Zorp special! 5-Way Spread Laser installed—fry those tin cans!', 3.2);
          } else if (pick === 1) {
            this.player.grantWeaponUpgrade('gatling', 15);
            this.hud.showBanner('UPGRADE // HYPER GATLING CANNONS!', 2.2);
            this.hud.showComms('mechanic', 'Hyper Gatling online! Hold the trigger and watch the fireworks!', 3.2);
          } else {
            this.player.addNovaBomb();
            this.hud.showBanner('UPGRADE // +1 NOVA SMART BOMB [B/X]!', 2.2);
            this.hud.showComms('mechanic', 'Fresh Nova Smart Bomb loaded! Press B or X to clear the whole screen!', 3.2);
          }
        },
      }
    );

    // 7. Boss Defeat -> Level Clear (with Victory Fanfare music!)
    if (this.bossClearDelay > 0) {
      this.bossClearDelay -= dt;
      if (this.bossClearDelay <= 0 && this.state.phase === 'Playing') {
        this.state.stats.shieldRemaining = this.player.shield;
        const { totalLevelScore } = this.state.computeRank();
        this.state.totalCampaignScore += totalLevelScore;
        this.state.phase = 'LevelClear';
        this.audio.playMusicTrack('victory-fanfare', true, 0.52);
        this.hud.renderPhase('LevelClear', this.state, this.levels);
        return;
      }
    }

    // 8. Camera Spring Tracking + Space-Coaster Banking + FOV Punch + Screen Shake
    const camTargetX = this.player.position.x * 0.42;
    const camTargetY = this.player.position.y * 0.38 + 2.1;
    const cam = this.renderer.camera;
    cam.position.x += (camTargetX - cam.position.x) * Math.min(1, dt * 6.5);
    cam.position.y += (camTargetY - cam.position.y) * Math.min(1, dt * 6.5);
    cam.position.z = 14;

    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 2.8);
      const s = this.screenShake * 0.72;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }

    const targetFov = isSuperBoost ? 78 : this.player.isBraking ? 55 : 65;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();

    cam.lookAt(
      this.player.position.x * 0.3 + this.trackCurve.curveX * 0.32,
      this.player.position.y * 0.25 + this.trackCurve.curveY * 0.22,
      -45
    );
    cam.rotation.z += this.trackCurve.bankRoll * 0.85;

    // 9. Project Reticle & Lock-On Brackets
    const { near, far } = this.player.getReticleWorldPoints();
    const nearScreen = this.projectToScreen(near);
    const farScreen = this.projectToScreen(far);
    const tmpPos = new THREE.Vector3();
    const lockPoints = this.lockedTargets
      .filter((t) => t.alive)
      .map((t) => this.projectToScreen(t.getPosition(tmpPos)));

    this.state.stats.shieldRemaining = this.player.shield;
    this.hud.updatePlayingHud(
      dt,
      this.state,
      (this.player.shield / this.player.maxShield) * 100,
      this.player.boostMeter,
      this.timeline ? this.timeline.progress : 0,
      {
        active: this.boss.active,
        name: this.boss.displayName,
        phase: this.boss.phase,
        hpPct: this.boss.maxTotalHp > 0 ? this.boss.totalHp / this.boss.maxTotalHp : 0,
      },
      {
        nearX: nearScreen.x,
        nearY: nearScreen.y,
        farX: farScreen.x,
        farY: farScreen.y,
        charging: input.chargeLock,
        lockPoints,
      },
      {
        weaponMode: this.player.weaponMode,
        weaponTimer: this.player.weaponTimer,
        novaBombs: this.player.novaBombs,
        gamepadConnected: input.gamepadConnected,
      }
    );
  }

  private spawnAmbientCorridorObject(level: LevelConfig): void {
    this.ambientCycle++;
    const roll = this.ambientCycle % 6;
    const pCol = level.environment.primaryColor;
    const sCol = level.environment.secondaryColor;

    if (roll === 0) {
      const fromLeft = Math.random() < 0.5;
      this.obstacles.spawn(
        {
          atDistance: 0,
          type: 'obstacle',
          kind: 'rogue_asteroid',
          position: { x: fromLeft ? -11 : 11, y: (Math.random() - 0.5) * 6.5 },
          scale: 0.95 + Math.random() * 0.45,
          rotationSpeed: (Math.random() - 0.5) * 2.0,
          driftX: (fromLeft ? 1 : -1) * (3.8 + Math.random() * 2.8),
          driftY: (Math.random() - 0.5) * 1.4,
        },
        pCol,
        sCol
      );
    } else if (roll === 1) {
      const gateX = THREE.MathUtils.clamp(this.trackCurve.curveX * 0.35 + (Math.random() - 0.5) * 5, -7, 7);
      const gateY = (Math.random() - 0.5) * 4.5;
      this.obstacles.spawn(
        {
          atDistance: 0,
          type: 'obstacle',
          kind: 'slalom_gate',
          position: { x: gateX, y: gateY },
          scale: 1.05,
          rotationSpeed: 0,
        },
        pCol,
        sCol
      );
    } else if (roll === 2) {
      this.obstacles.spawn(
        {
          atDistance: 0,
          type: 'obstacle',
          kind: 'debris_field',
          position: { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 4.5 },
          scale: 1.0 + Math.random() * 0.3,
          rotationSpeed: 0.8,
        },
        pCol,
        sCol
      );
    } else if (roll === 3) {
      this.obstacles.spawn(
        {
          atDistance: 0,
          type: 'obstacle',
          kind: 'monolith_pillar',
          position: { x: (Math.random() - 0.5) * 8, y: 0 },
          scale: 1.0 + Math.random() * 0.3,
          rotationSpeed: 0,
        },
        pCol,
        sCol
      );
    } else if (roll === 4) {
      this.obstacles.spawn(
        {
          atDistance: 0,
          type: 'obstacle',
          kind: 'spinner_cross',
          position: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2.5 },
          scale: 0.95 + Math.random() * 0.25,
          rotationSpeed: (Math.random() < 0.5 ? 1 : -1) * (1.0 + this.state.currentLevelIndex * 0.25),
        },
        pCol,
        sCol
      );
    } else {
      // Collectible floating Weapon Upgrade / Nova Bomb crate!
      this.obstacles.spawn(
        {
          atDistance: 0,
          type: 'obstacle',
          kind: 'weapon_crate',
          position: { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 4 },
          scale: 1.0,
          rotationSpeed: 1.2,
        },
        pCol,
        sCol
      );
    }
  }

  private handleTimelineEvent(ev: TimelineEvent, level: LevelConfig): void {
    if (ev.type === 'banner') {
      this.hud.showBanner(ev.text, 2.6);
      if (ev.text.includes('WARNING') || ev.text.includes('BOSS') || ev.text.includes('SIGNATURE')) {
        this.audio.playBossAlarm();
        this.playCategoryBanter('bossWarning', 4.2, true);
      }
    } else if (ev.type === 'wave') {
      this.enemies.spawnWave(ev);
    } else if (ev.type === 'obstacle') {
      this.obstacles.spawn(ev, level.environment.primaryColor, level.environment.secondaryColor);
    } else if (ev.type === 'boss') {
      // Record boss checkpoint so losing at the boss restarts RIGHT HERE!
      this.bossCheckpointDist = ev.atDistance;
      this.hud.setBossCheckpoint(true);
      const bossVideo = BOSS_CUTSCENE_MAP[ev.bossId];
      const launchBossFight = () => {
        this.boss.spawn(ev);
        this.audio.playMusicTrack('boss-battle', true, 0.44, 0.78);
        this.audio.playBossAlarm();
        this.hud.showBanner(`WARNING // ${ev.name} — I'MMA PUT BOOT N ASS!`, 3.2);
        this.playCategoryBanter('bossBootNAss', 4.2, true);
      };
      if (bossVideo) {
        this.playCutsceneThen(bossVideo, launchBossFight);
      } else {
        launchBossFight();
      }
    }
  }

  private getAimAssistedDirection(): THREE.Vector3 {
    const baseDir = this.player.aimDir.clone().normalize();
    const origin = this.player.position;
    let bestDir = baseDir;
    let bestDot = 0.965;

    const candidates: THREE.Vector3[] = [];
    for (const e of this.enemies.enemies) {
      if (e.alive && e.mesh.position.z < -8 && e.mesh.position.z > -150) {
        candidates.push(e.mesh.position);
      }
    }
    if (this.boss.active) {
      const pPos = new THREE.Vector3();
      for (const part of this.boss.getTargetableParts()) {
        part.getPosition(pPos);
        candidates.push(pPos.clone());
      }
    }

    const toTarget = new THREE.Vector3();
    for (const pos of candidates) {
      toTarget.subVectors(pos, origin).normalize();
      const dot = baseDir.dot(toTarget);
      if (dot > bestDot) {
        bestDot = dot;
        bestDir = toTarget.clone();
      }
    }
    return bestDir;
  }

  private updateLockOn(dt: number, charging: boolean, released: boolean): void {
    this.lockedTargets = this.lockedTargets.filter((t) => t.alive);

    if (charging) {
      this.lockScanCooldown -= dt;
      if (this.lockScanCooldown <= 0 && this.lockedTargets.length < 4) {
        const candidate = this.findNextLockCandidate();
        if (candidate) {
          this.lockedTargets.push(candidate);
          this.audio.playLockChirp(this.lockedTargets.length);
          this.lockScanCooldown = 0.14;
        }
      }
    }

    if (released && this.lockedTargets.length > 0) {
      this.audio.playMissileLaunch();
      this.input.rumble(0.4, 0.35, 130);
      const count = this.lockedTargets.length;
      this.lockedTargets.forEach((target, i) => {
        const spreadX = (i - (count - 1) / 2) * 14;
        const spreadY = (i % 2 === 0 ? 1 : -1) * 7;
        const initVel = new THREE.Vector3(spreadX, spreadY, -55);
        this.projectiles.spawnHomingMissile(this.player.position.clone(), initVel, target);
        this.state.stats.shotsFired += 1;
      });
      this.lockedTargets = [];
    } else if (!charging) {
      this.lockedTargets = [];
    }
  }

  private findNextLockCandidate(): HomingTarget | null {
    const lockedIds = new Set(this.lockedTargets.map((t) => t.id));
    const baseDir = this.player.aimDir;
    const origin = this.player.position;
    const tmp = new THREE.Vector3();
    const toTarget = new THREE.Vector3();

    let best: HomingTarget | null = null;
    let bestDot = 0.88;

    const pool: HomingTarget[] = [...this.enemies.enemies, ...this.boss.getTargetableParts()];
    for (const t of pool) {
      if (!t.alive || lockedIds.has(t.id)) continue;
      t.getPosition(tmp);
      if (tmp.z > -10 || tmp.z < -165) continue;
      toTarget.subVectors(tmp, origin).normalize();
      const dot = baseDir.dot(toTarget);
      if (dot > bestDot) {
        bestDot = dot;
        best = t;
      }
    }
    return best;
  }

  private projectToScreen(worldPos: THREE.Vector3): { x: number; y: number } {
    const p = worldPos.clone().project(this.renderer.camera);
    return {
      x: (p.x * 0.5 + 0.5) * window.innerWidth,
      y: (-p.y * 0.5 + 0.5) * window.innerHeight,
    };
  }
}

new StarburstGame();
