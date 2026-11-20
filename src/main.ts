import '@fontsource/orbitron/500.css';
import '@fontsource/orbitron/700.css';
import '@fontsource/orbitron/900.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './style.css';
import * as THREE from 'three';
import { Renderer } from './render/Renderer';
import { GameState } from './engine/GameState';
import { DesktopBridge } from './engine/DesktopBridge';
import { MetaProgression } from './engine/MetaProgression';
import { InputManager } from './engine/InputManager';
import { AudioSynth, type VoicePriority } from './engine/AudioSynth';
import { ParticlePool } from './engine/ParticlePool';
import { CollisionSystem } from './engine/CollisionSystem';
import { PlayerShip } from './entities/PlayerShip';
import { ProjectilePool, type HomingTarget } from './entities/ProjectilePool';
import { EnemyFactory } from './entities/EnemyFactory';
import { ObstacleFactory } from './entities/ObstacleFactory';
import { BossController } from './entities/BossController';
import { WingmanSquadron, type WingmanCallbacks } from './entities/WingmanSquadron';
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
  pilotDeath: [
    { voId: 'pilot-death-1', speaker: 'wingman', text: "MAYDAY! MAYDAY! I'M GOING DOWN! NOOOOOOOOO! TELL MY MOM I BEAT MY HIGH SCORE!!" },
    { voId: 'pilot-death-2', speaker: 'wingman', text: "WHOA-WHOA-WHOA, I'M SPINNING OUT! NOOOOOOOOO! NOT MY SPACE TACOS!!" },
    { voId: 'pilot-death-3', speaker: 'wingman', text: "CRITICAL FAILURE! EJECT! WHY IS THE EJECT BUTTON STUCK?! NOOOOOOOOO!!" },
    { voId: 'pilot-death-4', speaker: 'wingman', text: "OH CRAP! BOTH ENGINES ARE ON FIRE! NOOOOOOOOO! I JUST WAXED THIS STARFIGHTER!!" },
  ],
  bossDeath: [
    { voId: 'boss-death-1', speaker: 'boss', text: "SYSTEM FAILURE! MY SHINY METAL ASS! YOU ACTUALLY PUT BOOT IN MY ASS! NOOOOOOOOO!" },
    { voId: 'boss-death-2', speaker: 'boss', text: "CRITICAL MELTDOWN! IMPOSSIBLE! TELL THE ALIEN EMPEROR I TRIED! NOOOOOOOOO!" },
    { voId: 'boss-death-3', speaker: 'boss', text: "ERROR 404! ASS KICKED BEYOND REPAIR! SELF-DESTRUCTING! NOOOOOOOOO!" },
  ],
  gruntPanic: [
    { voId: 'grunt-panic-1', speaker: 'grunt', text: "WAIT A SECOND! HE JUST BLEW THE BOSS'S ARMOR OFF! WE ARE ALL GONNA DIE!" },
    { voId: 'grunt-panic-2', speaker: 'grunt', text: "WHO HIRED THIS CRAZY HUMAN?! RUN FOR THE ESCAPE PODS!" },
    { voId: 'grunt-panic-3', speaker: 'grunt', text: "HE'S BOUNCING OUR OWN LASERS BACK AT US! I QUIT! I'M GOING BACK TO SPACE COLLEGE!" },
  ],
  zorpSupply: [
    { voId: 'zorp-supply-1', speaker: 'mechanic', text: "Zorp Express delivery! Catch that glowing shield ring before the boss eats you!" },
    { voId: 'zorp-supply-2', speaker: 'mechanic', text: "Incoming care package! Fresh weapon crate comin' down the lane—grab it!" },
    { voId: 'zorp-supply-3', speaker: 'mechanic', text: "Look alive, hotshot! Tossed you some shiny boss-busting upgrades!" },
  ],
  novaBomb: [
    { voId: 'nova-bomb-1', speaker: 'wingman', text: "Nova bomb away! Say goodnight, space clowns!" },
    { voId: 'nova-bomb-2', speaker: 'commander', text: "Clearing the whole dang screen! Taste pure neon sunshine, losers!" },
  ],
  squadS3Start: [
    { voId: 'squad-s3-start', speaker: 'tank', text: "Full squadron locked in for the final spire! Stay on our wings, keep the bogeys off our tails, and let's end this!" },
  ],
  blitzHelp: [
    { voId: 'blitz-help-1', speaker: 'blitz', text: "Uh, little help here?! Got a crazy alien glued to my tailpipe—blast him off me!" },
    { voId: 'blitz-help-2', speaker: 'blitz', text: "Whoa! Bogey on my six! My shields are sizzling—shoot this guy before I'm toast!" },
  ],
  tankHelp: [
    { voId: 'tank-help-1', speaker: 'tank', text: "Hey hotshot, I got a pest chewing my rear armor! Peel this scrap heap off my tail!" },
    { voId: 'tank-help-2', speaker: 'tank', text: "Taking heavy fire on the right flank! Clear this bogey off me or I'm losing an engine!" },
  ],
  blitzSaved: [
    { voId: 'blitz-saved-1', speaker: 'blitz', text: "Wooo! Thanks legend! Owe you a triple space burrito after this sector!" },
    { voId: 'blitz-saved-2', speaker: 'blitz', text: "Clean shot! Thought my wingtip was a goner—back in formation!" },
  ],
  tankSaved: [
    { voId: 'tank-saved-1', speaker: 'tank', text: "Ha! Nice shooting, kid! Sending a little shield juice your way!" },
    { voId: 'tank-saved-2', speaker: 'tank', text: "Scratch one bogey! Now that's how a real wingman flies—much obliged!" },
  ],
  blitzKill: [
    { voId: 'blitz-kill-1', speaker: 'blitz', text: "Booyah! Blitz just vaporized one! Try to keep up, ace!" },
    { voId: 'blitz-kill-2', speaker: 'blitz', text: "Left lane cleared! Leaving the big ugly ones for you!" },
  ],
  tankKill: [
    { voId: 'tank-kill-1', speaker: 'tank', text: "Heavy cannons speaking! That scrap bucket just met its maker!" },
    { voId: 'tank-kill-2', speaker: 'tank', text: "Boom! Tank clears the corridor—keep pushing forward!" },
  ],
  blitzEject: [
    { voId: 'blitz-eject', speaker: 'blitz', text: "Engines fried! Ejecting! Don't worry, my escape pod has snacks—finish 'em for me!" },
  ],
  tankEject: [
    { voId: 'tank-eject', speaker: 'tank', text: "Hull breached! Bailing out! My ship's cooked—put extra boot in their ass for me, kid!" },
  ],
};

class BootNAssGame {
  private readonly renderer: Renderer;
  private readonly state = new GameState();
  private readonly meta = new MetaProgression();
  private readonly input = new InputManager();
  private readonly audio = new AudioSynth();
  private readonly particles: ParticlePool;
  private readonly collisions = new CollisionSystem();
  private readonly player: PlayerShip;
  private readonly projectiles: ProjectilePool;
  private readonly enemies: EnemyFactory;
  private readonly obstacles: ObstacleFactory;
  private readonly boss: BossController;
  private readonly squadron: WingmanSquadron;
  private readonly env: EnvironmentRig;
  private readonly trackCurve = new TrackCurve();
  private readonly hud: HUD;

  private levels: LevelConfig[] = [];
  private timeline: LevelTimelineDriver | null = null;
  private storyData: StoryCrawlData | null = null;

  // Boss checkpoint tracking — if you lose at the boss, retry starts right at the boss!
  private bossCheckpointDist: number | null = null;
  private skipNextBossCutscene = false;

  // Wingman squadron cutscene & banter pacing
  private arrivalBlitzSpoke = false;
  private arrivalTankSpoke = false;
  private allyHelpCooldown = 0;

  // Sector 1 gimmick: Turbo Gate Streak chains!
  private turboStreakCount = 0;
  private turboStreakTimer = 0;

  // True Fisher-Yates shuffle bags (ZERO repeats until every line in a category has played!)
  private shuffleBags = new Map<string, number[]>();
  private casualBanterCooldown = 0;

  // Opening crawl audio auto-start flag
  private crawlAudioStarted = false;

  // Cutscene anti-accidental-skip state (1.0s lockout + 0.6s hold-to-skip)
  private cutsceneLockoutTimer = 0;
  private cutsceneSkipHoldTimer = 0;

  // Sector 1 contextual onboarding prompts (first 25s only)
  private sectorElapsedTime = 0;
  private promptBoostShown = false;
  private promptRollShown = false;
  private promptBombShown = false;
  private activeTutorialPrompt: 'boost' | 'roll' | 'bomb' | null = null;

  // Game feel ("Juice"), Cinematic Sequences & Arcade Racer Turbo
  private hitstopTimer = 0;
  private screenShake = 0;
  private turboBoostTimer = 0;
  private lowShieldWarned = false;
  private bossClearDelay = 0;
  private bossVictoryElapsed = 0;
  private playerDying = false;
  private warpEntryTimer = 0;
  private multiKillCount = 0;
  private multiKillWindow = 0;
  private criticalBeepTimer = 0;
  private criticalSparkTimer = 0;

  // Dynamic corridor hazards & weapon crates + mid-boss tactical supply drops!
  private ambientHazardTimer = 2.0;
  private ambientCycle = 0;
  private bossSupplyTimer = 8.0;
  private bossSupplyCycle = 0;
  private bossPartsDestroyedCount = 0;
  private attractDist = 0;

  // Charge Lock-On state (supports Shift/LT OR holding primary Fire for 1.0s!)
  private lockedTargets: HomingTarget[] = [];
  private lockScanCooldown = 0;
  private fireHoldTimer = 0;

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
    this.squadron = new WingmanSquadron(this.renderer.scene);
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
      onOpenHangar: (returnTo) => {
        this.audio.unlock();
        this.hud.setHangarReturnTarget(returnTo);
        this.state.phase = 'Hangar';
        this.hud.renderPhase('Hangar', this.state, this.levels);
      },
      onBuyUpgrade: (key) => {
        if (this.meta.buyUpgrade(key)) {
          this.audio.playPowerup();
          this.input.rumble(0.4, 0.5, 110);
          this.hud.renderPhase('Hangar', this.state, this.levels);
        }
      },
      onResetSave: () => {
        this.meta.resetSave();
        this.audio.playUiConfirm();
        if (this.state.phase === 'Hangar') {
          this.hud.renderPhase('Hangar', this.state, this.levels);
        }
      },
      onSelectDifficulty: (diff) => {
        this.state.difficulty = diff;
        this.state.saveSettings();
        this.hud.renderPhase('Title', this.state, this.levels);
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
        const level = this.levels[this.state.currentLevelIndex];
        const bossEv = level?.timeline.find((e) => e.type === 'boss');
        const targetDist = this.bossCheckpointDist ?? bossEv?.atDistance ?? 0;
        if (targetDist > 0) {
          this.bossCheckpointDist = targetDist;
          this.startLevel(this.state.currentLevelIndex, Math.max(0, targetDist - 20), true);
        } else {
          this.startLevel(this.state.currentLevelIndex, 0, false);
        }
      },
      onResume: () => {
        if (this.state.phase === 'Paused') {
          this.state.phase = 'Playing';
          this.hud.removePauseOverlay();
        }
      },
      onToggleMouseAim: () => {
        this.state.mouseAimEnabled = !this.state.mouseAimEnabled;
        this.state.saveSettings();
        if (this.state.phase === 'Title' && document.getElementById('btn-start')) {
          this.hud.renderPhase('Title', this.state, this.levels);
        }
      },
      onToggleMute: () => {
        this.state.muted = !this.state.muted;
        this.state.saveSettings();
        this.audio.setMuted(this.state.muted);
        if (this.state.phase === 'Title' && document.getElementById('btn-start')) {
          this.hud.renderPhase('Title', this.state, this.levels);
        }
      },
      onToggleFullscreen: () => {
        void DesktopBridge.toggleFullscreen();
      },
      onQuitDesktop: () => {
        void DesktopBridge.quitApp();
      },
      onToggleNintendoLayout: () => {
        this.input.setNintendoLayout(!this.input.nintendoFaceLayout);
        this.hud.setControllerInfo(
          this.input.gamepadConnected,
          this.input.gamepadProfile,
          this.input.gamepadName,
          this.input.nintendoFaceLayout
        );
        if (this.state.phase === 'Title' && document.getElementById('btn-start')) {
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
      if (e.code === 'F11') {
        e.preventDefault();
        void DesktopBridge.toggleFullscreen();
        return;
      }
      if (this.hud.isCutscenePlaying) {
        // Cutscene skip is strictly Hold-to-Skip (0.6s after 1.0s lockout) handled in step()
        if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
          e.preventDefault();
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
          this.state.saveSettings();
        } else if (e.code === 'KeyN') {
          this.state.muted = !this.state.muted;
          this.state.saveSettings();
          this.audio.setMuted(this.state.muted);
        }
      }
    });

    this.audio.setMuted(this.state.muted);
    this.hud.setMetaProgression(this.meta);
    void this.boot();
  }

  private playCutsceneThen(videoId: string, onDone: () => void, fallbackUrl?: string): void {
    this.audio.stopMusicTrack();
    this.audio.stopVO();
    this.cutsceneLockoutTimer = 1.0; // 1.0s input lockout prevents accidental launch-button skips!
    this.cutsceneSkipHoldTimer = 0;
    this.hud.playCutscene(videoId, this.state.muted, onDone, fallbackUrl);
    this.hud.updateCutsceneSkipUI(true, 0);
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
    const list = BANTER[category];
    if (!list || list.length === 0) return;

    if (!priority) {
      if (this.casualBanterCooldown > 0) return;
      if (Math.random() > chance) return;
    }

    // Pick a line from the shuffle bag that isn't currently on 12s per-line cooldown
    let chosen: BanterLine | null = null;
    for (let attempt = 0; attempt < list.length; attempt++) {
      const idx = this.drawFromShuffleBag(category, list.length);
      const candidate = list[idx];
      if (!this.audio.isLineOnCooldown(candidate.voId, 12000)) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) return;

    // Single-channel priority: Boss (3) > Wingman/Commander/Squadron (2) > System/Grunt (1)
    const voicePriority: VoicePriority =
      chosen.speaker === 'boss'
        ? 3
        : chosen.speaker === 'wingman' ||
            chosen.speaker === 'commander' ||
            chosen.speaker === 'blitz' ||
            chosen.speaker === 'tank'
          ? 2
          : 1;

    const line = chosen;
    const queued = this.audio.enqueueVO(
      line.voId,
      priority ? (Math.max(voicePriority, 2) as VoicePriority) : voicePriority,
      line.speaker !== 'boss',
      () => {
        this.hud.showComms(line.speaker, line.text, duration);
      },
      false
    );
    if (queued && !priority) {
      this.casualBanterCooldown = 6.0;
    }
  }

  /** Immediately interrupts routine chatter for dramatic set-piece moments (pilot death scream, boss meltdown)! */
  private playDramaticBanter(category: keyof typeof BANTER, duration = 4.0): void {
    const list = BANTER[category];
    if (!list || list.length === 0) return;
    const idx = this.drawFromShuffleBag(category, list.length);
    const line = list[idx];
    this.audio.stopVO();
    this.hud.showComms(line.speaker, line.text, duration);
    void this.audio.playVO(line.voId, false, true);
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
    this.hud.preloadCutscene('intro-launch');
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

  private startLevel(index: number, startDist: number, isBossRetry = false): void {
    const level = this.levels[index];
    if (!level) return;

    this.clearEntities();
    this.state.currentLevelIndex = index;
    this.state.resetLevelStats(this.meta.maxShield);
    this.state.phase = 'Playing';
    this.skipNextBossCutscene = isBossRetry;
    if (!isBossRetry && startDist === 0) {
      this.bossCheckpointDist = null;
    }
    this.lowShieldWarned = false;
    this.bossClearDelay = 0;
    this.bossVictoryElapsed = 0;
    this.playerDying = false;
    this.warpEntryTimer = isBossRetry ? 0.65 : 1.15;
    this.multiKillCount = 0;
    this.multiKillWindow = 0;
    this.criticalBeepTimer = 0;
    this.criticalSparkTimer = 0;
    this.hitstopTimer = 0;
    this.screenShake = 0;
    this.turboBoostTimer = 0;
    this.turboStreakCount = 0;
    this.turboStreakTimer = 0;
    this.arrivalBlitzSpoke = false;
    this.arrivalTankSpoke = false;
    this.allyHelpCooldown = 0;
    this.casualBanterCooldown = 4.0;
    this.ambientHazardTimer = isBossRetry ? 99 : 1.6;
    this.ambientCycle = 0;
    this.bossSupplyTimer = 8.5;
    this.bossSupplyCycle = 0;
    this.bossPartsDestroyedCount = 0;
    this.lockedTargets = [];
    this.fireHoldTimer = 0;

    // Reset Sector 1 onboarding prompts
    this.sectorElapsedTime = 0;
    this.promptBoostShown = false;
    this.promptRollShown = false;
    this.promptBombShown = false;
    this.activeTutorialPrompt = null;

    // Preload this sector's boss cutscene + gameover/victory so there is ZERO black flash!
    const bossEv = level.timeline.find((e) => e.type === 'boss');
    if (bossEv && bossEv.type === 'boss') {
      const bossVid = BOSS_CUTSCENE_MAP[bossEv.bossId];
      if (bossVid) this.hud.preloadCutscene(bossVid);
    }
    this.hud.preloadCutscene('gameover-eject');
    if (index === this.levels.length - 1) {
      this.hud.preloadCutscene('victory-ending');
    }

    this.player.reset();
    this.player.applyMetaUpgrades({
      maxShield: this.meta.maxShield,
      shieldRegenPerSec: this.meta.shieldRegenPerSec,
      boostDrainMult: this.meta.boostDrainMult,
      boostRechargeMult: this.meta.boostRechargeMult,
      barrelRollDurationBonus: this.meta.barrelRollDurationBonus,
    });
    this.trackCurve.reset();
    this.env.applyEnvironment(level.environment);
    this.timeline = new LevelTimelineDriver(level, startDist);
    this.hud.setBossCheckpoint(this.bossCheckpointDist !== null);

    // If retrying Boss 2 or Boss 3 (or jumping past the ally arrival point), deploy Blitz & Tank with you!
    if (
      (isBossRetry && index >= 1) ||
      (startDist > 0 && level.timeline.some((e) => e.type === 'allies_arrive' && e.atDistance < startDist))
    ) {
      this.squadron.deploy(false);
    }

    this.hud.renderPhase('Playing', this.state, this.levels);
    this.hud.setCriticalHull(false, false);
    this.player.setEntryZOffset(isBossRetry ? 8 : 11);
    this.audio.playWarpEntry();
    if (isBossRetry || (startDist > 0 && this.bossCheckpointDist !== null)) {
      this.hud.showBanner('BOSS CHECKPOINT // ROUND TWO!', 2.4);
      this.hud.showArcadeStamp('ROUND TWO // ENGAGE!', 'warp');
      this.audio.playMusicTrack('boss-battle', true, 0.44, 0.78);
    } else {
      this.hud.showBanner(level.name, 2.8);
      this.hud.showArcadeStamp(`HYPER-WARP // ${level.name}`, 'warp');
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
    this.squadron.clear();
    this.hud.showSquadronArrival(false);
    this.lockedTargets = [];
  }

  private getWingmanCallbacks(): WingmanCallbacks {
    return {
      onNeedHelp: (allyId, callsign) => {
        if (this.allyHelpCooldown <= 0) {
          this.allyHelpCooldown = 14.0;
          this.hud.showBanner(`BOGEY ON ${callsign}'S TAIL // SHOOT IT DOWN!`, 2.2);
          this.playCategoryBanter(allyId === 'blitz' ? 'blitzHelp' : 'tankHelp', 3.6, true);
        }
      },
      onSaved: (allyId, callsign, pos) => {
        const pts = this.state.addBonusScore(600);
        this.player.heal(10);
        this.audio.playRingPickup();
        this.input.rumble(0.3, 0.4, 110);
        this.particles.spawnShockwave(pos, allyId === 'blitz' ? 0x00ff88 : 0xffd447, 11, 0.4);
        const sp = this.projectToScreen(pos);
        this.hud.spawnFloatingText(sp.x, sp.y, `SAVED ${callsign}! +${pts}`, allyId === 'blitz' ? '#00ff88' : '#ffd447');
        this.hud.showArcadeStamp(`SAVED ${callsign}! +10 SHIELD`, 'clear');
        this.playCategoryBanter(allyId === 'blitz' ? 'blitzSaved' : 'tankSaved', 3.5, false, 1.0);
      },
      onEjected: (allyId, callsign, pos) => {
        this.audio.playExplosion(false);
        this.particles.burst(pos, 26, 0xff5500, 22, 1.15, 0.62);
        this.particles.spawnShockwave(pos, 0xff4422, 11, 0.42);
        this.hud.showBanner(`${callsign} EJECTED // HOLD THE LINE!`, 2.6);
        this.playCategoryBanter(allyId === 'blitz' ? 'blitzEject' : 'tankEject', 4.0, true);
      },
      onSpark: (pos, colorHex) => {
        this.particles.burst(pos, 4, colorHex, 9, 0.45, 0.22);
      },
      onTrail: (pos, colorHex, size) => {
        this.particles.spawnTrail(pos, colorHex, size, 0.22);
      },
    };
  }

  private triggerNovaBomb(): void {
    if (this.player.novaBombs <= 0) return;
    this.player.novaBombs -= 1;
    this.audio.playNovaBomb();
    this.input.rumble(1.0, 0.8, 350);
    this.screenShake = 1.4;
    this.hitstopTimer = 0.06;
    this.hud.triggerScreenFlash('nova');
    this.hud.showArcadeStamp('NOVA DETONATION!!', 'kill');
    this.playCategoryBanter('novaBomb', 3.4, true);
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
    const wingCb = this.getWingmanCallbacks();
    for (const e of this.enemies.enemies) {
      if (e.alive && e.mesh.position.z > -150) {
        const killed = this.enemies.damageEnemy(e, 140);
        if (killed) {
          this.state.registerKill(e.scoreValue);
          this.registerMultiKill();
          this.squadron.notifyPlayerKilledEnemy(e, wingCb);
          this.particles.burst(e.mesh.position, 22, 0xffd447, 24, 1.2, 0.65);
        }
      }
    }

    // Chunk active boss parts!
    if (this.boss.active) {
      for (const part of this.boss.getTargetableParts()) {
        const res = this.boss.damagePart(part, 115);
        this.particles.burst(res.pos, 18, 0xffd447, 24, 1.2, 0.55);
        if (res.bossDefeated) {
          this.handleBossDefeated();
          break;
        }
      }
    }
  }

  private registerMultiKill(): void {
    this.multiKillCount += 1;
    this.multiKillWindow = 1.25;
    if (this.multiKillCount === 3) {
      this.state.addBonusScore(300);
      this.hud.showArcadeStamp('TRIPLE KILL! +300', 'kill');
    } else if (this.multiKillCount === 4) {
      this.state.addBonusScore(500);
      this.hud.showArcadeStamp('QUAD KILL!! +500', 'kill');
    } else if (this.multiKillCount === 5) {
      this.state.addBonusScore(800);
      this.hud.showArcadeStamp('MEGA KILL!! +800', 'kill');
    } else if (this.multiKillCount === 7) {
      this.state.addBonusScore(1500);
      this.hud.showArcadeStamp('BOOT N ASS RAMPAGE!!!', 'kill');
    }
  }

  private startPlayerDeathScene(): void {
    if (this.playerDying) return;
    this.playerDying = true;
    this.lockedTargets = [];
    this.audio.stopMusicTrack();
    this.audio.playShipPowerDown();
    this.player.startDeathSpiral();
    this.input.rumble(0.95, 0.9, 500);
    this.screenShake = 1.5;
    this.hud.setCriticalHull(true, true);
    this.hud.updateWingmanHud(false, [], []);
    this.hud.showBanner('MAYDAY! MAYDAY! HULL INTEGRITY ZERO!', 2.5);
    this.hud.showArcadeStamp('MAYDAY // HULL BREACH!', 'death');
    this.playDramaticBanter('pilotDeath', 3.6);
  }

  private handleBossDefeated(): void {
    this.state.stats.bossClearTimeSec = Math.max(1, this.boss.fightElapsedSec);
    this.hitstopTimer = 0.12;
    this.state.addBonusScore(4000);
    this.audio.playExplosion(true);
    this.input.rumble(1.0, 0.9, 450);
    this.hud.triggerScreenFlash('gold');
    this.hud.setCriticalHull(false, false);
    this.hud.updateWingmanHud(false, [], []);

    // Vaporize all remaining enemy shots & escorts into golden sparkles (zero post-mortem cheap hits!)
    for (const p of this.projectiles.projectiles) {
      if (p.active && p.kind === 'enemy_plasma') {
        p.active = false;
        this.particles.burst(p.pos, 5, 0xffd447, 14, 0.7, 0.35);
      }
    }
    for (const e of this.enemies.enemies) {
      if (e.alive) {
        this.enemies.damageEnemy(e, 999);
        this.particles.burst(e.mesh.position, 18, 0xffaa22, 20, 1.0, 0.55);
      }
    }

    this.screenShake = 1.4;
    this.bossClearDelay = 3.1;
    this.bossVictoryElapsed = 0;
    this.bossCheckpointDist = null;
    this.hud.setBossCheckpoint(false);
    this.audio.setMusicState(false);
    this.hud.showBanner('REACTOR CRITICAL // CHAIN MELTDOWN!', 2.2);
    this.playDramaticBanter('bossDeath', 3.4);
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

    // Pause simulation cleanly while a fullscreen cutscene plays.
    // 1.0s input lockout + Hold [SPACE / A / Click] for 0.6s to skip!
    if (this.hud.isCutscenePlaying) {
      if (this.cutsceneLockoutTimer > 0) {
        this.cutsceneLockoutTimer = Math.max(0, this.cutsceneLockoutTimer - dt);
        this.cutsceneSkipHoldTimer = 0;
        this.hud.updateCutsceneSkipUI(true, 0);
      } else {
        const holding = input.skipHeld || this.hud.isCutsceneMouseSkipHeld();
        if (holding) {
          this.cutsceneSkipHoldTimer += dt;
          this.hud.updateCutsceneSkipUI(false, this.cutsceneSkipHoldTimer / 0.6);
          if (this.cutsceneSkipHoldTimer >= 0.6) {
            this.hud.skipActiveCutscene(true);
          }
        } else {
          this.cutsceneSkipHoldTimer = Math.max(0, this.cutsceneSkipHoldTimer - dt * 2.5);
          this.hud.updateCutsceneSkipUI(false, this.cutsceneSkipHoldTimer / 0.6);
        }
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
      // 100% Native Gamepad Menu Navigation across Boot, Crawl, Title, Hangar, Sector Select, Pause, Clear, GameOver, Victory!
      if (input.menuNavX !== 0 || input.menuNavY !== 0) {
        const delta = input.menuNavY !== 0 ? input.menuNavY : input.menuNavX;
        if (this.state.phase !== 'Boot' && this.state.phase !== 'Crawl') {
          this.hud.navigateMenu(delta);
        }
      }

      if (input.menuBackPressed) {
        if (this.state.phase === 'LevelSelect' || this.state.phase === 'Hangar') {
          this.enterTitle();
          return;
        }
        if (this.state.phase === 'Title' && !document.getElementById('btn-start')) {
          this.hud.renderPhase('Title', this.state, this.levels);
          return;
        }
        if (this.state.phase === 'Paused') {
          this.state.phase = 'Playing';
          this.hud.removePauseOverlay();
          return;
        }
      }

      if (input.menuConfirmPressed) {
        this.audio.unlock();
        if (this.state.phase === 'Boot') {
          this.handleBootStart();
          return;
        } else if (this.state.phase === 'Crawl') {
          this.enterTitle();
          return;
        } else {
          if (this.hud.activateFocusedMenuButton()) return;
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

    if (input.pausePressed && !this.playerDying && this.bossClearDelay <= 0 && !this.squadron.arrivalActive) {
      this.state.phase = 'Paused';
      this.hud.renderPhase('Paused', this.state, this.levels);
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }
    if (this.casualBanterCooldown > 0) this.casualBanterCooldown -= dt;
    if (this.allyHelpCooldown > 0) this.allyHelpCooldown -= dt;
    if (this.turboBoostTimer > 0) this.turboBoostTimer -= dt;
    if (this.turboStreakTimer > 0) {
      this.turboStreakTimer -= dt;
      if (this.turboStreakTimer <= 0) this.turboStreakCount = 0;
    }
    if (this.multiKillWindow > 0) {
      this.multiKillWindow -= dt;
      if (this.multiKillWindow <= 0) this.multiKillCount = 0;
    }

    const level = this.levels[this.state.currentLevelIndex];

    // === CINEMATIC PLAYER DEATH SPIRAL & 3D SHIP EXPLOSION SEQUENCE (2.55s before Eject Cutscene!) ===
    if (this.playerDying) {
      const slowSpeed = level.baseSpeed * 0.42;
      this.env.update(dt, slowSpeed, false, this.trackCurve);
      this.projectiles.update(dt);
      this.particles.update(dt, slowSpeed);

      const phase = this.player.updateDeathSequence(
        dt,
        slowSpeed,
        (pos, big) => {
          this.particles.burst(pos, big ? 16 : 8, 0xff5511, big ? 18 : 12, big ? 1.15 : 0.75, 0.42);
          this.particles.burst(pos, big ? 8 : 4, 0xffd447, 14, 0.75, 0.32);
          if (big && Math.random() < 0.35) {
            this.audio.playExplosion(false);
            this.screenShake = Math.max(this.screenShake, 0.9);
          }
        },
        (boomPos) => {
          // CATASTROPHIC SHIP DETONATION!
          this.audio.playShipDetonate();
          this.input.rumble(1.0, 1.0, 520);
          this.screenShake = 2.2;
          this.hud.triggerScreenFlash('death');
          this.hud.showArcadeStamp('SHIP DESTROYED // EJECTING!', 'death');
          this.particles.burst(boomPos, 70, 0xff4400, 34, 1.75, 1.15);
          this.particles.burst(boomPos, 45, 0xffd447, 28, 1.35, 0.95);
          this.particles.burst(boomPos, 28, 0x00f0ff, 26, 1.1, 0.8);
          this.particles.spawnShockwave(boomPos, 0xffffff, 24, 0.48);
          this.particles.spawnShockwave(boomPos, 0xffaa22, 34, 0.75);
          this.particles.spawnShockwave(boomPos, 0xff2244, 42, 0.95);
        }
      );

      // Dramatic tracking camera orbiting the burning/exploding starfighter!
      const cam = this.renderer.camera;
      const targetCamX = this.player.root.position.x * 0.65 + Math.sin(performance.now() * 0.0022) * 2.5;
      const targetCamY = this.player.root.position.y * 0.55 + 2.2;
      cam.position.x += (targetCamX - cam.position.x) * Math.min(1, dt * 5);
      cam.position.y += (targetCamY - cam.position.y) * Math.min(1, dt * 5);
      cam.position.z += (11.5 - cam.position.z) * Math.min(1, dt * 3);
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 2.1);
        const s = this.screenShake * 0.85;
        cam.position.x += (Math.random() - 0.5) * s;
        cam.position.y += (Math.random() - 0.5) * s;
      }
      cam.lookAt(this.player.root.position.x, this.player.root.position.y, this.player.root.position.z - 2);
      cam.fov += (74 - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();

      this.hud.updatePlayingHud(
        dt,
        this.state,
        0,
        this.player.boostMeter,
        this.timeline ? this.timeline.progress : 0,
        { active: false, name: '', phase: 1, hpPct: 0 },
        { nearX: -999, nearY: -999, farX: -999, farY: -999, charging: false, lockPoints: [] },
        {
          weaponMode: this.player.weaponMode,
          weaponTimer: this.player.weaponTimer,
          novaBombs: this.player.novaBombs,
          gamepadConnected: input.gamepadConnected,
        }
      );

      if (phase === 'done') {
        this.playerDying = false;
        this.hud.setCriticalHull(false, false);
        this.state.phase = 'GameOver';
        this.hud.setBossCheckpoint(this.bossCheckpointDist !== null);
        this.playCutsceneThen('gameover-eject', () => {
          this.hud.renderPhase('GameOver', this.state, this.levels);
          this.playCategoryBanter('gameOver', 4.0, true);
        });
      }
      return;
    }

    // === EPIC BOSS CHAIN-REACTION MELTDOWN & VICTORY FLYBY SEQUENCE (3.1s!) ===
    if (this.bossClearDelay > 0) {
      this.bossClearDelay -= dt;
      this.bossVictoryElapsed += dt;
      const flybySpeed = level.baseSpeed * 1.32;
      this.trackCurve.update(dt, this.timeline ? this.timeline.distance : 0, this.state.currentLevelIndex, false);
      this.env.update(dt, flybySpeed, true, this.trackCurve);
      this.player.updateVictoryFlyby(dt, flybySpeed, this.bossVictoryElapsed);
      this.squadron.updateVictoryFormation(
        dt,
        this.player.root.position,
        this.bossVictoryElapsed,
        (pos, colorHex, size) => this.particles.spawnTrail(pos, colorHex, size, 0.25)
      );
      this.projectiles.update(dt);
      this.particles.update(dt, flybySpeed);

      if (Math.random() < 0.85) {
        const pPos = this.player.root.position.clone().add(new THREE.Vector3(0, 0, 2.0));
        this.particles.spawnTrail(pPos, 0xffd447, 0.45, 0.28);
      }

      this.boss.updateDeathMeltdown(
        dt,
        (boomPos, intensity) => {
          this.audio.playBossChainBoom(intensity);
          this.input.rumble(0.45 + intensity * 0.4, 0.4 + intensity * 0.4, 110);
          this.screenShake = Math.max(this.screenShake, 0.65 + intensity * 0.65);
          this.particles.burst(boomPos, 24, 0xff5500, 24, 1.4, 0.72);
          this.particles.burst(boomPos, 14, 0xffd447, 18, 1.1, 0.55);
          this.particles.spawnShockwave(boomPos, 0xffaa22, 12 + intensity * 12, 0.42);
        },
        (finalPos) => {
          // FINAL SUPERNOVA BOSS DETONATION!
          this.audio.playShipDetonate();
          this.input.rumble(1.0, 1.0, 520);
          this.screenShake = 2.1;
          this.hud.triggerScreenFlash('white');
          this.hud.showBanner('TARGET OBLITERATED // SECTOR CLEAR!', 2.6);
          this.hud.showArcadeStamp('TARGET OBLITERATED!!', 'clear');
          this.particles.burst(finalPos, 90, 0xffd447, 42, 2.2, 1.35);
          this.particles.burst(finalPos, 65, 0x00f0ff, 36, 1.8, 1.15);
          this.particles.burst(finalPos, 45, 0xff3355, 34, 1.7, 1.05);
          this.particles.spawnShockwave(finalPos, 0xffffff, 38, 0.55);
          this.particles.spawnShockwave(finalPos, 0x00f0ff, 52, 0.92);
          this.playCategoryBanter('levelClear', 4.2, true);
        }
      );

      // Heroic sweeping victory follow camera!
      const cam = this.renderer.camera;
      const sweepAngle = Math.min(1, this.bossVictoryElapsed / 2.8);
      const camTargetX = this.player.root.position.x * 0.4 + Math.sin(sweepAngle * Math.PI) * 3.8;
      const camTargetY = this.player.root.position.y * 0.35 + 1.4;
      cam.position.x += (camTargetX - cam.position.x) * Math.min(1, dt * 4.5);
      cam.position.y += (camTargetY - cam.position.y) * Math.min(1, dt * 4.5);
      cam.position.z = THREE.MathUtils.lerp(cam.position.z, 12.2, dt * 2.5);
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 2.4);
        const s = this.screenShake * 0.78;
        cam.position.x += (Math.random() - 0.5) * s;
        cam.position.y += (Math.random() - 0.5) * s;
      }
      cam.fov += (75 - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
      cam.lookAt(this.player.root.position.x * 0.25, this.player.root.position.y * 0.25, -45);

      this.hud.updatePlayingHud(
        dt,
        this.state,
        (this.player.shield / this.player.maxShield) * 100,
        this.player.boostMeter,
        1,
        { active: false, name: '', phase: 2, hpPct: 0 },
        { nearX: -999, nearY: -999, farX: -999, farY: -999, charging: false, lockPoints: [] },
        {
          weaponMode: this.player.weaponMode,
          weaponTimer: this.player.weaponTimer,
          novaBombs: this.player.novaBombs,
          gamepadConnected: input.gamepadConnected,
        }
      );

      if (this.bossClearDelay <= 0 && this.state.phase === 'Playing') {
        this.state.stats.shieldRemaining = this.player.shield;
        const { totalLevelScore, bootBucksEarned } = this.state.computeRank();
        this.state.stats.bootBucksEarned = bootBucksEarned;
        this.meta.addBootBucks(bootBucksEarned);
        this.state.totalCampaignScore += totalLevelScore;

        const isFinalSector = this.state.currentLevelIndex >= this.levels.length - 1;
        if (isFinalSector) {
          this.state.phase = 'Victory';
          this.playCutsceneThen(
            'victory-ending',
            () => {
              this.audio.playMusicTrack('victory-fanfare', true, 0.52);
              this.hud.renderPhase('Victory', this.state, this.levels);
            },
            '/assets/videos/victory_cutscene.mp4'
          );
        } else {
          this.state.phase = 'LevelClear';
          this.audio.playMusicTrack('victory-fanfare', true, 0.52);
          this.hud.renderPhase('LevelClear', this.state, this.levels);
        }
      }
      return;
    }

    // === REAL-TIME IN-GAME SQUADRON ARRIVAL CUTSCENE (Sector 2 Midpoint — 5.2s!) ===
    if (this.squadron.arrivalActive) {
      const slowSpeed = level.baseSpeed * 0.56;
      const distNow = this.timeline ? this.timeline.distance : 0;
      this.trackCurve.update(dt, distNow, this.state.currentLevelIndex, false);
      this.env.update(dt, slowSpeed, true, this.trackCurve);

      // Smooth cinematic player auto-glide safely in center-low
      this.player.root.position.x = THREE.MathUtils.lerp(this.player.root.position.x, 0, Math.min(1, dt * 4));
      this.player.root.position.y = THREE.MathUtils.lerp(this.player.root.position.y, -0.7, Math.min(1, dt * 4));
      this.player.root.rotation.z = THREE.MathUtils.lerp(this.player.root.rotation.z, Math.sin(this.squadron.arrivalElapsed * 2.2) * 0.14, Math.min(1, dt * 5));
      this.player.setEntryZOffset(0);

      // Timed Blitz & Tank arrival dialogue over the live 3D fly-past!
      if (!this.arrivalBlitzSpoke && this.squadron.arrivalElapsed >= 0.35) {
        this.arrivalBlitzSpoke = true;
        this.audio.stopVO();
        this.hud.showComms(
          'blitz',
          "Yo! Sorry we bailed earlier—turns out those tin cans blew up our favorite space taco stand! Blitz on your left wing!",
          2.6
        );
        void this.audio.playVO('blitz-arrive', false, true);
      }
      if (!this.arrivalTankSpoke && this.squadron.arrivalElapsed >= 2.8) {
        this.arrivalTankSpoke = true;
        this.audio.stopVO();
        this.hud.showComms(
          'tank',
          "Tank locked and loaded on your right! Nobody wrecks Taco Nebula and gets away with it—let's put boot in ass!",
          2.7
        );
        void this.audio.playVO('tank-arrive', false, true);
      }

      const arrivalDone = this.squadron.updateArrivalCinematic(
        dt,
        this.enemies,
        this.projectiles,
        (boomPos, colorHex) => {
          this.audio.playWarpEntry();
          this.input.rumble(0.45, 0.45, 130);
          this.screenShake = Math.max(this.screenShake, 0.45);
          this.particles.spawnShockwave(boomPos, colorHex, 16, 0.48);
          this.particles.burst(boomPos, 18, colorHex, 20, 0.9, 0.45);
        },
        (pos, colorHex, size) => this.particles.spawnTrail(pos, colorHex, size, 0.24)
      );

      this.projectiles.update(dt);
      this.particles.update(dt, slowSpeed);
      this.audio.updateMusic(dt);

      // Heroic wide dynamic showcase camera watching Blitz & Tank streak past!
      const cam = this.renderer.camera;
      const p = Math.min(1, this.squadron.arrivalElapsed / this.squadron.arrivalDuration);
      const targetCamX = Math.sin(p * Math.PI) * 2.6;
      const targetCamY = 1.6 + Math.sin(p * Math.PI * 2) * 0.45;
      cam.position.x += (targetCamX - cam.position.x) * Math.min(1, dt * 4.5);
      cam.position.y += (targetCamY - cam.position.y) * Math.min(1, dt * 4.5);
      cam.position.z = THREE.MathUtils.lerp(cam.position.z, 15.8, dt * 3);
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 2.4);
        const s = this.screenShake * 0.6;
        cam.position.x += (Math.random() - 0.5) * s;
        cam.position.y += (Math.random() - 0.5) * s;
      }
      cam.fov += (72 - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
      cam.lookAt(0, 0.2, -26);

      this.hud.updatePlayingHud(
        dt,
        this.state,
        (this.player.shield / this.player.maxShield) * 100,
        this.player.boostMeter,
        this.timeline ? this.timeline.progress : 0,
        { active: false, name: '', phase: 1, hpPct: 0 },
        { nearX: -999, nearY: -999, farX: -999, farY: -999, charging: false, lockPoints: [] },
        {
          weaponMode: this.player.weaponMode,
          weaponTimer: this.player.weaponTimer,
          novaBombs: this.player.novaBombs,
          gamepadConnected: input.gamepadConnected,
        }
      );

      if (arrivalDone) {
        this.hud.showSquadronArrival(false);
        this.hud.showBanner('SQUADRON FORMED // PROTECT BLITZ & TANK!', 2.6);
        this.hud.showArcadeStamp('WINGMEN ONLINE!', 'warp');
      }
      return;
    }

    // Hyper-Warp Sector Entry Zoom-In (first 1.15s of sector!)
    if (this.warpEntryTimer > 0) {
      this.warpEntryTimer = Math.max(0, this.warpEntryTimer - dt);
      const t = this.warpEntryTimer / 1.15;
      this.player.setEntryZOffset(t * t * 11);
      if (Math.random() < 0.8) {
        const pPos = this.player.root.position.clone().add(new THREE.Vector3(0, 0, 2.2));
        this.particles.spawnTrail(pPos, 0x00f0ff, 0.55, 0.25);
      }
    } else {
      this.player.setEntryZOffset(0);
    }

    const currentDist = this.timeline ? this.timeline.distance : 0;
    this.trackCurve.update(dt, currentDist, this.state.currentLevelIndex, this.boss.active);

    const isSuperBoost =
      this.player.isBoosting ||
      this.turboBoostTimer > 0 ||
      this.warpEntryTimer > 0.25 ||
      this.trackCurve.stuntSpeedMult > 1.12;
    const speedMult = this.turboBoostTimer > 0 ? 1.52 : this.player.isBoosting ? 1.45 : this.player.isBraking ? 0.65 : 1.08;
    const railSpeed = level.baseSpeed * speedMult * this.trackCurve.stuntSpeedMult;

    // 1. Update Player (+ Somersault Backflip & Nova Bomb!)
    const { startedBoost, startedRoll, startedSomersault } = this.player.update(
      dt,
      input,
      railSpeed,
      this.state.mouseAimEnabled
    );
    if (startedBoost) {
      this.audio.playBoost();
      if (this.activeTutorialPrompt === 'boost') {
        this.hud.hideTutorialPrompt();
        this.activeTutorialPrompt = null;
      }
    }
    if (startedRoll) {
      this.audio.playBarrelRoll();
      this.input.rumble(0.25, 0.3, 80);
      if (this.activeTutorialPrompt === 'roll') {
        this.hud.hideTutorialPrompt();
        this.activeTutorialPrompt = null;
      }
    }
    if (startedSomersault) {
      this.audio.playSomersault();
      this.input.rumble(0.55, 0.45, 160);
      this.particles.spawnShockwave(this.player.position.clone(), 0xffd447, 16, 0.45);
      for (const p of this.projectiles.projectiles) {
        if (p.active && p.kind === 'enemy_plasma' && p.pos.distanceTo(this.player.position) < 20) {
          p.active = false;
          this.particles.burst(p.pos, 6, 0x00f0ff, 14, 0.7, 0.28);
        }
      }
    }
    if (input.novaBombPressed) {
      this.triggerNovaBomb();
      if (this.activeTutorialPrompt === 'bomb') {
        this.hud.hideTutorialPrompt();
        this.activeTutorialPrompt = null;
      }
    }

    // Contextual Sector 1 Onboarding Prompts (first 25 seconds of Sector 1 only!)
    this.sectorElapsedTime += dt;
    if (this.state.currentLevelIndex === 0 && this.sectorElapsedTime <= 25 && !this.boss.active) {
      if (!this.promptBoostShown && this.sectorElapsedTime >= 2.8) {
        const hasGateOrRing = this.obstacles.obstacles.some(
          (o) => o.alive && (o.kind === 'boost_ring' || o.kind === 'slalom_gate')
        );
        if (hasGateOrRing || this.sectorElapsedTime >= 4.2) {
          this.promptBoostShown = true;
          this.activeTutorialPrompt = 'boost';
          this.hud.showTutorialPrompt('HOLD [RT / SHIFT / F] — BOOST', 5.0);
        }
      } else if (!this.promptRollShown && this.sectorElapsedTime >= 8.5) {
        const enemyFired = this.projectiles.projectiles.some(
          (p) => p.active && p.kind === 'enemy_plasma'
        );
        if (enemyFired) {
          this.promptRollShown = true;
          this.activeTutorialPrompt = 'roll';
          this.hud.showTutorialPrompt('TAP [LB/RB / Q/E] — BARREL ROLL (DEFLECT)', 5.0);
        }
      } else if (!this.promptBombShown && this.sectorElapsedTime >= 15.0) {
        const aliveEnemies = this.enemies.enemies.filter((e) => e.alive).length;
        if (aliveEnemies >= 3) {
          this.promptBombShown = true;
          this.activeTutorialPrompt = 'bomb';
          this.hud.showTutorialPrompt('PRESS [X / B] — NOVA SMART BOMB', 5.0);
        }
      }
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

    // 3. Charge Lock-On Missiles (Hold Shift/LT OR Hold Primary Fire for 1.0s to charge Twin-Boot Homing Missiles!)
    const prevFireCharged = this.fireHoldTimer >= 1.0;
    if (input.fire) {
      this.fireHoldTimer += dt;
    } else {
      this.fireHoldTimer = 0;
    }
    const fireChargeActive = this.fireHoldTimer >= 1.0;
    const fireChargeReleased = prevFireCharged && !input.fire;
    this.updateLockOn(
      dt,
      input.chargeLock || fireChargeActive,
      input.chargeReleased || fireChargeReleased
    );

    // 4. Advance Level Timeline + Escalating Obstacle Intensity (or Mid-Boss Tactical Supply Drops!)
    const diffCfg = this.state.difficultyConfig;
    if (this.timeline && !this.boss.active && this.bossClearDelay <= 0) {
      this.timeline.advance(dt, railSpeed, (ev) => this.handleTimelineEvent(ev, level));

      const lvlIdx = this.state.currentLevelIndex;
      const interval = lvlIdx === 0 ? 2.25 : lvlIdx === 1 ? 1.85 : 1.5;
      const maxObstacles = lvlIdx === 0 ? 5 : lvlIdx === 1 ? 6 : 7;
      this.ambientHazardTimer -= dt;
      if (this.ambientHazardTimer <= 0) {
        this.ambientHazardTimer = interval;
        if (this.obstacles.obstacles.length < maxObstacles) {
          this.spawnAmbientCorridorObject(level);
        }
      }
    } else if (this.boss.active && this.bossClearDelay <= 0) {
      // Zorp Tactical Supply Drops during Boss Battles — grab Shield Rings & Weapon Crates mid-fight!
      this.bossSupplyTimer -= dt;
      if (this.bossSupplyTimer <= 0) {
        const supplyCd =
          this.state.difficulty === 'rookie' ? 8.8 : this.state.difficulty === 'ace' ? 10.2 : 11.8;
        this.bossSupplyTimer = supplyCd;
        this.spawnBossSupplyDrop(level);
      }
    }

    // Dynamic ship accent lighting + Turbo screen-edge energy glow + Critical Hull tension!
    this.player.setAccentState(this.state.isOverdrive, this.turboBoostTimer > 0);
    this.hud.setTurboGlow(this.turboBoostTimer > 0);
    const shieldPctNow = (this.player.shield / Math.max(1, this.player.maxShield)) * 100;
    const isCritical = shieldPctNow > 0 && shieldPctNow <= 25;
    this.hud.setCriticalHull(isCritical, false);
    if (isCritical) {
      this.criticalSparkTimer -= dt;
      if (this.criticalSparkTimer <= 0) {
        this.criticalSparkTimer = 0.14;
        const dmgPos = this.player.root.position.clone().add(new THREE.Vector3(-1.1, 0.15, 0.9));
        this.particles.burst(dmgPos, 4, 0xff4411, 10, 0.55, 0.28);
      }
      this.criticalBeepTimer -= dt;
      if (this.criticalBeepTimer <= 0) {
        this.criticalBeepTimer = 1.75;
        this.audio.playLowShieldBeep();
      }
    } else {
      this.criticalBeepTimer = 0;
    }

    // 5. Update World, Enemies, Obstacles, Boss, Projectiles, Particles (scaled by Difficulty!)
    this.env.update(dt, railSpeed, isSuperBoost, this.trackCurve);
    this.enemies.update(
      dt,
      railSpeed,
      this.player.position,
      this.projectiles,
      diffCfg.enemyFireRateMult,
      diffCfg.projectileSpeedMult,
      diffCfg.damageTakenMult
    );
    this.obstacles.update(dt, railSpeed, this.trackCurve);
    this.boss.update(
      dt,
      this.player.position,
      this.player.velocity,
      this.projectiles,
      this.enemies,
      diffCfg.bossAggressionMult,
      diffCfg.bulletDensityMult,
      diffCfg.projectileSpeedMult,
      diffCfg.damageTakenMult,
      diffCfg.enemyHpMult,
      () => {
        this.audio.playBossAlarm();
        this.hud.showBanner("I'MMA PUT BOOT N ASS // LASER SWEEP!", 1.8);
        this.playCategoryBanter('bossBootNAss', 3.4, false, 1.0);
      },
      (sparkPos) => {
        this.particles.burst(sparkPos, 6, 0xffaa22, 14, 0.7, 0.35);
      }
    );
    const wingmanCb = this.getWingmanCallbacks();
    this.squadron.update(
      dt,
      this.player.position,
      this.enemies,
      this.obstacles,
      this.projectiles,
      this.boss,
      this.trackCurve,
      diffCfg.damageTakenMult,
      wingmanCb
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
          this.registerMultiKill();
          this.squadron.notifyPlayerKilledEnemy(e, wingmanCb);
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

          // Shooting down boss escorts has a 40% chance to drop a Golden Shield Ring!
          if (this.boss.active && pos.z < -18 && Math.random() < 0.4) {
            this.spawnBossPickupAt(level, 'boost_ring', pos.x, pos.y, pos.z, 30);
          }
        },
        onAllyEnemyKilled: (_e, pos, allyId) => {
          // Subtle balanced visual/audio feedback so allied kills feel helpful without cluttering the screen!
          this.state.addBonusScore(50);
          this.particles.burst(pos, 12, allyId === 'blitz' ? 0x00ff88 : 0xffd447, 16, 0.85, 0.44);
          this.particles.burst(pos, 8, 0xff6622, 14, 0.75, 0.38);
          this.playCategoryBanter(allyId === 'blitz' ? 'blitzKill' : 'tankKill', 2.9, false, 0.16);
        },
        onCrystalDestroyed: (obs, pos) => {
          this.state.registerHit();
          const pts = this.state.addBonusScore(250);
          this.audio.playExplosion(false);
          this.hud.triggerHitMarker();
          this.particles.burst(pos, 26, 0x00ffd5, 25, 1.25, 0.72);
          this.particles.spawnShockwave(pos, 0x00ffd5, 7.5, 0.34);
          const sp = this.projectToScreen(pos);
          // Sector 2 Gimmick: Prism Shield Shards restore hull & wingman shields!
          if (level.id === 'prism-belt' && obs.kind === 'crystal_cluster') {
            this.player.heal(5);
            this.squadron.healSquad(6);
            this.hud.spawnFloatingText(sp.x, sp.y, `SHIELD SHARD +5 // +${pts}`, '#00ffd5');
          } else {
            this.hud.spawnFloatingText(sp.x, sp.y, `SHATTER +${pts}`, '#00ffd5');
          }
          this.screenShake = Math.max(this.screenShake, 0.26);
        },
        onBossPartHit: (_part, pos, phaseBreak, bossDefeated, partDestroyed, blocked, shatteredShield) => {
          if (blocked) {
            this.audio.playDeflect();
            this.particles.burst(pos, 8, 0x00f0ff, 14, 0.7, 0.28);
            const sp = this.projectToScreen(pos);
            const hint =
              this.boss.bossId === 'octa_core_sentinel'
                ? 'REFLECT ORBS!'
                : this.boss.bossId === 'solaris_leviathan'
                  ? 'BLAST SEGMENTS!'
                  : 'SHIELDED!';
            this.hud.spawnFloatingText(sp.x, sp.y, hint, '#00f0ff');
            return;
          }

          this.state.registerHit();
          this.audio.playHitTick();
          this.particles.burst(pos, 8, 0xffd447, 16, 0.8, 0.32);

          if (shatteredShield) {
            this.bossPartsDestroyedCount += 1;
            this.state.addBonusScore(1200);
            this.audio.playExplosion(true);
            this.input.rumble(0.85, 0.7, 220);
            this.particles.burst(pos, 42, 0x00ffd5, 32, 1.6, 0.9);
            this.particles.spawnShockwave(pos, 0x00ffd5, 16, 0.52);
            const sp = this.projectToScreen(pos);
            this.hud.spawnFloatingText(sp.x, sp.y, 'PRISM SHATTERED!! +1200', '#00ffd5');
            this.screenShake = Math.max(this.screenShake, 0.85);
            // Shattering a Prism Shield ejects a Weapon Crate or Shield Ring!
            const dropKind =
              this.player.shield < this.player.maxShield * 0.65 || this.bossPartsDestroyedCount % 2 === 0
                ? 'boost_ring'
                : 'weapon_crate';
            this.spawnBossPickupAt(level, dropKind, pos.x, pos.y, pos.z, 28);
          } else if (partDestroyed) {
            this.bossPartsDestroyedCount += 1;
            this.state.addBonusScore(800);
            this.audio.playExplosion(true);
            this.input.rumble(0.7, 0.5, 200);
            this.particles.burst(pos, 36, 0xff4422, 30, 1.5, 0.85);
            this.particles.spawnShockwave(pos, 0xff4422, 13, 0.48);
            this.screenShake = Math.max(this.screenShake, 0.7);
            // Destroying turrets / serpent segments rewards you with tactical mid-fight pickups!
            const shouldDrop =
              this.boss.bossId !== 'solaris_leviathan' || this.bossPartsDestroyedCount % 2 === 1;
            if (shouldDrop && !bossDefeated) {
              const dropKind =
                this.player.shield < this.player.maxShield * 0.65 || this.bossPartsDestroyedCount % 2 === 0
                  ? 'boost_ring'
                  : 'weapon_crate';
              this.spawnBossPickupAt(level, dropKind, pos.x, pos.y, pos.z, 28);
            }
          }

          if (phaseBreak && !bossDefeated) {
            this.hitstopTimer = 0.11;
            this.audio.playExplosion(true);
            this.input.rumble(0.95, 0.8, 320);
            this.hud.triggerScreenFlash('gold');
            this.hud.showArcadeStamp('PHASE 2 // CORE EXPOSED!', 'clear');
            this.particles.spawnShockwave(this.boss.root.position.clone(), 0xffd447, 26, 0.7);
            this.screenShake = 1.1;
            this.hud.showBanner("PHASE 2 // I'MMA PUT BOOT N ASS!", 2.8);
            this.playCategoryBanter('bossBootNAss', 3.8, true);
            window.setTimeout(() => {
              if (this.boss.active && this.state.phase === 'Playing') {
                this.playCategoryBanter(Math.random() < 0.55 ? 'gruntPanic' : 'bossPhase2', 4.0, false, 1.0);
              }
            }, 3900);
          }

          if (bossDefeated) {
            this.handleBossDefeated();
          }
        },
        onPlayerDamaged: (amt, pos, source) => {
          this.state.stats.hullDamageTaken += amt;
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
            this.startPlayerDeathScene();
          }
        },
        onGraze: (pos) => {
          const pts = this.state.addBonusScore(75);
          this.audio.playGraze();
          this.particles.burst(pos, 7, 0x00f0ff, 14, 0.55, 0.24);
          const sp = this.projectToScreen(pos);
          this.hud.spawnFloatingText(sp.x, sp.y - 14, `GRAZE! +${pts}`, '#00ffd5');
        },
        onDeflectShot: (proj) => {
          this.state.stats.deflections += 1;
          this.state.addBonusScore(140);
          this.audio.playDeflect();
          this.input.rumble(0.35, 0.45, 90);
          this.particles.burst(proj.pos, 14, 0x00f0ff, 18, 0.8, 0.35);
          this.particles.spawnShockwave(proj.pos, 0x00f0ff, 5.5, 0.25);

          const reflectDir = this.getReflectAimDirection(proj.pos);
          this.projectiles.spawnPlayerBolt(
            proj.pos,
            reflectDir,
            true,
            true,
            this.meta.reflectedDamageMult
          );
          const sp = this.projectToScreen(proj.pos);
          this.hud.spawnFloatingText(sp.x, sp.y, 'DEFLECT!', '#00f0ff');
          if (this.state.stats.deflections === 3 || this.state.stats.deflections === 7) {
            this.playCategoryBanter('gruntPanic', 3.6, false, 0.9);
          } else {
            this.playCategoryBanter('barrelRoll', 3.4, false, 0.35);
          }
        },
        onBoostRing: (obs) => {
          this.state.stats.ringsCollected += 1;
          const healAmt = this.state.difficultyConfig.ringHealAmount;
          this.player.heal(healAmt);
          this.squadron.healSquad(12);
          this.lowShieldWarned = this.player.shield <= 30;
          const pts = this.state.addBonusScore(300);
          this.audio.playRingPickup();
          this.particles.burst(obs.mesh.position, 18, 0xffd447, 16, 0.9, 0.5);
          this.particles.spawnShockwave(obs.mesh.position, 0xffd447, 9, 0.38);
          const sp = this.projectToScreen(obs.mesh.position);
          this.hud.spawnFloatingText(sp.x, sp.y, `SHIELD +${healAmt} // +${pts}`, '#ffd447');
          this.playCategoryBanter('ringPickup', 3.0, false, 0.35);
        },
        onSlalomGate: (obs) => {
          this.state.stats.turboGatesHit += 1;
          this.turboStreakCount += 1;
          this.turboStreakTimer = 9.0;
          const streakMult = Math.min(5, this.turboStreakCount);
          this.turboBoostTimer = Math.min(3.0, 1.5 + streakMult * 0.3);
          this.player.heal(Math.max(4, Math.round(this.state.difficultyConfig.ringHealAmount * 0.5)));
          const pts = this.state.addBonusScore(500 * streakMult);
          this.audio.playBoost();
          this.audio.playRingPickup();
          this.input.rumble(0.35, 0.45, 130);
          this.particles.burst(obs.mesh.position, 22, 0x00ff88, 22, 1.0, 0.55);
          this.particles.spawnShockwave(obs.mesh.position, 0x00ff88, 12, 0.42);
          const sp = this.projectToScreen(obs.mesh.position);

          // Sector 3 Gimmick: Overclock Warp Gates heal the whole squadron + surge weapons!
          if (level.id === 'hyper-spire') {
            this.squadron.healSquad(16);
            const nextMode = this.player.weaponMode === 'spread' ? 'spread' : 'gatling';
            this.player.grantWeaponUpgrade(nextMode, Math.max(this.player.weaponTimer + 4.5, 6.5));
            this.hud.spawnFloatingText(sp.x, sp.y, `OVERCLOCK +${pts}!`, '#ffd447');
            this.hud.showBanner('OVERCLOCK WARP // SQUAD HEALED + WEAPONS SURGED!', 1.5);
          } else {
            this.squadron.healSquad(8);
            const label = streakMult >= 2 ? `TURBO CHAIN x${streakMult}! +${pts}` : `TURBO +${pts}!`;
            this.hud.spawnFloatingText(sp.x, sp.y, label, '#00ff88');
            this.hud.showBanner(
              streakMult >= 2 ? `TURBO GATE STREAK x${streakMult} // +${pts}` : `TURBO GATE // +${pts}`,
              1.2
            );
          }
        },
        onWeaponCrate: (obs) => {
          this.audio.playPowerup();
          this.input.rumble(0.45, 0.6, 150);
          this.particles.burst(obs.mesh.position, 26, 0xd946ff, 22, 1.1, 0.55);
          this.particles.spawnShockwave(obs.mesh.position, 0xd946ff, 12, 0.42);
          const dur = this.meta.weaponDurationSec;
          const pick = Math.floor(Math.random() * 3);
          if (pick === 0) {
            this.player.grantWeaponUpgrade('spread', dur);
            this.hud.showBanner('UPGRADE // 5-WAY SPREAD LASER!', 2.2);
            this.hud.showComms('mechanic', 'Zorp special! 5-Way Spread Laser installed—fry those tin cans!', 3.2);
          } else if (pick === 1) {
            this.player.grantWeaponUpgrade('gatling', dur);
            this.hud.showBanner('UPGRADE // HYPER GATLING CANNONS!', 2.2);
            this.hud.showComms('mechanic', 'Hyper Gatling online! Hold the trigger and watch the fireworks!', 3.2);
          } else {
            this.player.addNovaBomb();
            this.hud.showBanner('UPGRADE // +1 NOVA SMART BOMB [B/X]!', 2.2);
            this.hud.showComms('mechanic', 'Fresh Nova Smart Bomb loaded! Press B or X to clear the whole screen!', 3.2);
          }
        },
      },
      {
        deflectRadiusBonus: this.meta.deflectRadiusBonus,
        pickupRadiusMult: this.meta.pickupRadiusMult,
        damageTakenMult: diffCfg.damageTakenMult,
      }
    );

    // 8. Camera Spring Tracking + Space-Coaster Banking + Hyper-Warp FOV Punch + Screen Shake
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

    const targetFov =
      (this.warpEntryTimer > 0.25 ? 88 : isSuperBoost ? 78 : this.player.isBraking ? 55 : 65) +
      this.trackCurve.stuntFovBonus;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 6);
    cam.updateProjectionMatrix();

    cam.lookAt(
      this.player.position.x * 0.3 + this.trackCurve.curveX * 0.32,
      this.player.position.y * 0.25 + this.trackCurve.curveY * 0.22 + this.trackCurve.cameraPitchOffset * 28,
      -45
    );
    cam.rotation.z += this.trackCurve.bankRoll;

    // 9. Project Reticle, Lock-On Brackets & Wingman Distress Markers
    const { near, far } = this.player.getReticleWorldPoints();
    const nearScreen = this.projectToScreen(near);
    const farScreen = this.projectToScreen(far);
    const tmpPos = new THREE.Vector3();
    const lockPoints = this.lockedTargets
      .filter((t) => t.alive)
      .map((t) => this.projectToScreen(t.getPosition(tmpPos)));

    const wingHud = this.squadron.getHudState();
    const distressPoints = wingHud.distressTargets.map((t) => {
      const p = t.worldPos.clone().project(cam);
      return {
        callsign: t.callsign,
        x: (p.x * 0.5 + 0.5) * window.innerWidth,
        y: (-p.y * 0.5 + 0.5) * window.innerHeight,
        inFront: p.z < 1,
      };
    });
    this.hud.updateWingmanHud(wingHud.deployed, wingHud.allies, distressPoints);

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

  private spawnBossPickupAt(
    level: LevelConfig,
    kind: 'boost_ring' | 'weapon_crate',
    x: number,
    y: number,
    z: number,
    speed: number
  ): void {
    const cx = THREE.MathUtils.clamp(x, -8.5, 8.5);
    const cy = THREE.MathUtils.clamp(y, -4.5, 4.5);
    this.obstacles.spawn(
      {
        atDistance: 0,
        type: 'obstacle',
        kind,
        position: { x: cx, y: cy },
        scale: kind === 'boost_ring' ? 1.2 : 1.05,
        rotationSpeed: kind === 'weapon_crate' ? 1.4 : 0,
      },
      level.environment.primaryColor,
      level.environment.secondaryColor,
      { startZ: Math.min(-35, z), speedOverride: speed }
    );
  }

  private spawnBossSupplyDrop(level: LevelConfig): void {
    this.bossSupplyCycle += 1;
    const lowShield = this.player.shield < this.player.maxShield * 0.62;
    const dropKind: 'boost_ring' | 'weapon_crate' =
      lowShield || this.bossSupplyCycle % 2 === 0 ? 'boost_ring' : 'weapon_crate';

    const sx = (Math.random() - 0.5) * 11;
    const sy = (Math.random() - 0.5) * 5.2;
    this.spawnBossPickupAt(level, dropKind, sx, sy, -120, 38);

    // If shield is critically low (< 35%), Zorp drops a bonus twin shield ring!
    if (this.player.shield < this.player.maxShield * 0.35 && dropKind === 'boost_ring') {
      this.spawnBossPickupAt(level, 'boost_ring', -sx * 0.6, -sy * 0.5, -138, 38);
    }

    if (dropKind === 'weapon_crate') {
      this.hud.showBanner('ZORP SUPPLY DROP // GRAB WEAPON UPGRADE!', 2.0);
    } else {
      this.hud.showBanner('ZORP SUPPLY DROP // GRAB SHIELD RING!', 2.0);
    }
    this.playCategoryBanter('zorpSupply', 3.4, false, 0.75);
  }

  private spawnAmbientCorridorObject(level: LevelConfig): void {
    this.ambientCycle++;
    const roll = this.ambientCycle % 7;
    const pCol = level.environment.primaryColor;
    const sCol = level.environment.secondaryColor;

    if (roll === 0 || roll === 5) {
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
          rotationSpeed: (Math.random() < 0.5 ? 1 : -1) * (1.1 + this.state.currentLevelIndex * 0.25),
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
      this.enemies.spawnWave(ev, this.state.difficultyConfig.enemyHpMult);
    } else if (ev.type === 'obstacle') {
      this.obstacles.spawn(ev, level.environment.primaryColor, level.environment.secondaryColor);
    } else if (ev.type === 'track_stunt') {
      this.trackCurve.triggerStunt(ev.stunt, ev.duration);
      this.audio.playWarpEntry();
      this.input.rumble(0.42, 0.52, 180);
      const stampMap = {
        loop: '360° NEON LOOP!',
        corkscrew: 'GRAVITY CORKSCREW!',
        dive: 'HYPER-PLUNGE DIVE!',
        slalom_wave: 'HIGH-G S-CHICANE!',
      };
      const stamp = stampMap[ev.stunt];
      this.hud.showBanner(ev.label ?? stamp, 2.2);
      this.hud.showArcadeStamp(stamp, 'warp');
    } else if (ev.type === 'allies_arrive') {
      this.squadron.deploy(ev.cinematic);
      if (ev.cinematic) {
        this.arrivalBlitzSpoke = false;
        this.arrivalTankSpoke = false;
        this.hud.showSquadronArrival(true);
        this.audio.playWarpEntry();
        this.input.rumble(0.65, 0.55, 240);
        // Clear immediate enemy plasma so the arrival showcase stays cinematic & fair
        for (const p of this.projectiles.projectiles) {
          if (p.active && p.kind === 'enemy_plasma') {
            p.active = false;
          }
        }
      } else {
        this.audio.playWarpEntry();
        this.hud.showBanner('FULL SQUADRON DEPLOYED // BLITZ & TANK ON WING!', 2.8);
        this.playCategoryBanter('squadS3Start', 4.2, true);
      }
    } else if (ev.type === 'boss') {
      // Record boss checkpoint so losing at the boss restarts RIGHT HERE!
      this.bossCheckpointDist = ev.atDistance;
      this.hud.setBossCheckpoint(true);
      const bossVideo = BOSS_CUTSCENE_MAP[ev.bossId];
      const launchBossFight = () => {
        this.bossSupplyTimer = 7.5;
        this.bossSupplyCycle = 0;
        this.bossPartsDestroyedCount = 0;
        this.boss.spawn(ev, this.state.difficultyConfig.bossHpMult);
        this.audio.playMusicTrack('boss-battle', true, 0.44, 0.78);
        this.audio.playBossAlarm();
        this.hud.showBanner(`WARNING // ${ev.name} — I'MMA PUT BOOT N ASS!`, 3.2);
        this.playCategoryBanter('bossBootNAss', 4.2, true);
      };
      if (bossVideo && !this.skipNextBossCutscene) {
        this.playCutsceneThen(bossVideo, launchBossFight);
      } else {
        this.skipNextBossCutscene = false;
        launchBossFight();
      }
    }
  }

  private getReflectAimDirection(origin: THREE.Vector3): THREE.Vector3 {
    const baseDir = this.player.aimDir.clone().normalize();
    let bestDir = baseDir;
    let bestScore = -1;

    // During a boss fight, barrel-roll deflections snap reliably back into boss weak points / prism shields!
    if (this.boss.active) {
      const pPos = new THREE.Vector3();
      const toTarget = new THREE.Vector3();
      for (const part of this.boss.getReflectTargetParts()) {
        part.getPosition(pPos);
        toTarget.subVectors(pPos, origin).normalize();
        const score = baseDir.dot(toTarget);
        if (score > bestScore) {
          bestScore = score;
          bestDir = toTarget.clone();
        }
      }
      if (bestScore > 0.45) return bestDir;
    }

    // Otherwise lock onto the nearest enemy in a generous forward cone!
    let bestDot = 0.78;
    const toTarget = new THREE.Vector3();
    for (const e of this.enemies.enemies) {
      if (e.alive && e.mesh.position.z < -6 && e.mesh.position.z > -155) {
        toTarget.subVectors(e.mesh.position, origin).normalize();
        const dot = baseDir.dot(toTarget);
        if (dot > bestDot) {
          bestDot = dot;
          bestDir = toTarget.clone();
        }
      }
    }
    return bestDir;
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
      const maxLocks = this.meta.maxLockTargets;
      if (this.lockScanCooldown <= 0 && this.lockedTargets.length < maxLocks) {
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

new BootNAssGame();
