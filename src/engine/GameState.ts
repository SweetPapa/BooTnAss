export type GamePhase =
  | 'Boot'
  | 'Crawl'
  | 'Title'
  | 'LevelSelect'
  | 'Hangar'
  | 'Playing'
  | 'Paused'
  | 'LevelClear'
  | 'GameOver'
  | 'Victory';

export type DifficultyId = 'rookie' | 'ace' | 'maximum';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  shortBadge: string;
  description: string;
  enemyFireRateMult: number;
  enemyHpMult: number;
  bossHpMult: number;
  bossAggressionMult: number;
  bulletDensityMult: number;
  projectileSpeedMult: number;
  damageTakenMult: number;
  ringHealAmount: number;
  scoreMult: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  rookie: {
    id: 'rookie',
    label: 'ROOKIE',
    shortBadge: 'ROOKIE',
    description: 'Classic arcade challenge, forgiving shields, generous supply drops.',
    enemyFireRateMult: 0.95,
    enemyHpMult: 0.95,
    bossHpMult: 0.8,
    bossAggressionMult: 0.88,
    bulletDensityMult: 0.95,
    projectileSpeedMult: 0.92,
    damageTakenMult: 0.85,
    ringHealAmount: 18,
    scoreMult: 1.0,
  },
  ace: {
    id: 'ace',
    label: 'ACE (RECOMMENDED)',
    shortBadge: 'ACE',
    description: 'Tactical arcade intensity, fierce multi-phase bosses, 1.3x score.',
    enemyFireRateMult: 1.22,
    enemyHpMult: 1.15,
    bossHpMult: 1.05,
    bossAggressionMult: 1.12,
    bulletDensityMult: 1.15,
    projectileSpeedMult: 1.06,
    damageTakenMult: 1.05,
    ringHealAmount: 14,
    scoreMult: 1.3,
  },
  maximum: {
    id: 'maximum',
    label: 'MAXIMUM BOOT-N-ASS',
    shortBadge: 'MAX BNA',
    description: 'Dense bullet curtains, lethal multi-phase bosses, 1.75x score!',
    enemyFireRateMult: 1.6,
    enemyHpMult: 1.45,
    bossHpMult: 1.38,
    bossAggressionMult: 1.38,
    bulletDensityMult: 1.45,
    projectileSpeedMult: 1.22,
    damageTakenMult: 1.35,
    ringHealAmount: 10,
    scoreMult: 1.75,
  },
};

export interface RunStats {
  score: number;
  combo: number;
  comboTimer: number;
  maxCombo: number;
  shotsFired: number;
  shotsHit: number;
  enemiesDestroyed: number;
  deflections: number;
  ringsCollected: number;
  turboGatesHit: number;
  hullDamageTaken: number;
  bossClearTimeSec: number;
  shieldRemaining: number;
  maxShield: number;
  overdriveAnnounced: boolean;
  bootBucksEarned: number;
}

export interface SRankBreakdown {
  rank: 'S' | 'A' | 'B' | 'C';
  shieldBonus: number;
  totalLevelScore: number;
  bootBucksEarned: number;
  criteria: Array<{ label: string; actual: string; target: string; passed: boolean }>;
}

const SETTINGS_KEY = 'bootnass_settings_v1';

export class GameState {
  public phase: GamePhase = 'Boot';
  public currentLevelIndex = 0;
  public totalCampaignScore = 0;
  public sectorRanks: Array<{ sector: number; rank: 'S' | 'A' | 'B' | 'C'; score: number }> = [];
  public difficulty: DifficultyId = 'ace'; // ACE is Recommended Default!
  public mouseAimEnabled = false;
  public muted = false;
  public invertY = false;
  public stickSensitivity = 1.0;
  public deadzone = 0.16;
  public rumbleScale = 1.0;
  public autoFire = false;
  public screenShakeScale = 1.0;
  public nintendoLayoutPref: boolean | null = null;

  public stats: RunStats = this.createFreshStats(100);

  constructor() {
    this.loadSettings();
  }

  public loadSettings(): void {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        difficulty: DifficultyId;
        mouseAimEnabled: boolean;
        muted: boolean;
        invertY: boolean;
        stickSensitivity: number;
        deadzone: number;
        rumbleScale: number;
        autoFire: boolean;
        screenShakeScale: number;
        nintendoLayoutPref: boolean | null;
      }>;
      if (parsed.difficulty && parsed.difficulty in DIFFICULTIES) {
        this.difficulty = parsed.difficulty;
      }
      if (typeof parsed.mouseAimEnabled === 'boolean') this.mouseAimEnabled = parsed.mouseAimEnabled;
      if (typeof parsed.muted === 'boolean') this.muted = parsed.muted;
      if (typeof parsed.invertY === 'boolean') this.invertY = parsed.invertY;
      if (typeof parsed.stickSensitivity === 'number' && parsed.stickSensitivity >= 0.5 && parsed.stickSensitivity <= 2.0) {
        this.stickSensitivity = parsed.stickSensitivity;
      }
      if (typeof parsed.deadzone === 'number' && parsed.deadzone >= 0.05 && parsed.deadzone <= 0.35) {
        this.deadzone = parsed.deadzone;
      }
      if (typeof parsed.rumbleScale === 'number' && parsed.rumbleScale >= 0 && parsed.rumbleScale <= 1) {
        this.rumbleScale = parsed.rumbleScale;
      }
      if (typeof parsed.autoFire === 'boolean') this.autoFire = parsed.autoFire;
      if (typeof parsed.screenShakeScale === 'number' && parsed.screenShakeScale >= 0 && parsed.screenShakeScale <= 1) {
        this.screenShakeScale = parsed.screenShakeScale;
      }
      if (typeof parsed.nintendoLayoutPref === 'boolean') {
        this.nintendoLayoutPref = parsed.nintendoLayoutPref;
      }
    } catch {
      // ignore storage errors
    }
  }

  public saveSettings(): void {
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          difficulty: this.difficulty,
          mouseAimEnabled: this.mouseAimEnabled,
          muted: this.muted,
          invertY: this.invertY,
          stickSensitivity: this.stickSensitivity,
          deadzone: this.deadzone,
          rumbleScale: this.rumbleScale,
          autoFire: this.autoFire,
          screenShakeScale: this.screenShakeScale,
          nintendoLayoutPref: this.nintendoLayoutPref,
        })
      );
    } catch {
      // ignore storage errors
    }
  }

  public get difficultyConfig(): DifficultyConfig {
    return DIFFICULTIES[this.difficulty];
  }

  public createFreshStats(maxShield = 100): RunStats {
    return {
      score: 0,
      combo: 1,
      comboTimer: 0,
      maxCombo: 1,
      shotsFired: 0,
      shotsHit: 0,
      enemiesDestroyed: 0,
      deflections: 0,
      ringsCollected: 0,
      turboGatesHit: 0,
      hullDamageTaken: 0,
      bossClearTimeSec: 0,
      shieldRemaining: maxShield,
      maxShield,
      overdriveAnnounced: false,
      bootBucksEarned: 0,
    };
  }

  public resetCampaign(): void {
    this.totalCampaignScore = 0;
    this.sectorRanks = [];
  }

  public recordSectorResult(sector: number, rank: 'S' | 'A' | 'B' | 'C', score: number): void {
    const existing = this.sectorRanks.find((r) => r.sector === sector);
    if (existing) {
      existing.rank = rank;
      existing.score = score;
    } else {
      this.sectorRanks.push({ sector, rank, score });
      this.sectorRanks.sort((a, b) => a.sector - b.sector);
    }
    this.totalCampaignScore = this.sectorRanks.reduce((sum, r) => sum + r.score, 0);
  }

  public resetLevelStats(maxShield = 100): void {
    this.stats = this.createFreshStats(maxShield);
  }

  public registerKill(basePoints: number): { points: number; enteredOverdrive: boolean } {
    const prevCombo = this.stats.combo;
    this.stats.enemiesDestroyed += 1;
    this.stats.combo = Math.min(16, this.stats.combo + 1);
    this.stats.comboTimer = 4.0;
    if (this.stats.combo > this.stats.maxCombo) {
      this.stats.maxCombo = this.stats.combo;
    }
    const points = Math.round(basePoints * this.stats.combo * this.difficultyConfig.scoreMult);
    this.stats.score += points;

    const enteredOverdrive =
      prevCombo < 10 && this.stats.combo >= 10 && !this.stats.overdriveAnnounced;
    if (enteredOverdrive) {
      this.stats.overdriveAnnounced = true;
    }
    return { points, enteredOverdrive };
  }

  public addBonusScore(basePoints: number): number {
    const points = Math.round(
      basePoints * Math.max(1, this.stats.combo) * this.difficultyConfig.scoreMult
    );
    this.stats.score += points;
    this.stats.comboTimer = Math.max(this.stats.comboTimer, 3.0);
    return points;
  }

  public registerHit(): void {
    this.stats.shotsHit += 1;
    this.stats.comboTimer = Math.max(this.stats.comboTimer, 2.5);
  }

  public resetCombo(): void {
    this.stats.combo = 1;
    this.stats.comboTimer = 0;
    this.stats.overdriveAnnounced = false;
  }

  public updateComboTimer(dt: number): void {
    if (this.stats.combo > 1) {
      this.stats.comboTimer -= dt;
      if (this.stats.comboTimer <= 0) {
        this.resetCombo();
      }
    }
  }

  public get isOverdrive(): boolean {
    return this.stats.combo >= 10;
  }

  public getAccuracyPercent(): number {
    if (this.stats.shotsFired === 0) return 100;
    return Math.min(100, Math.round((this.stats.shotsHit / this.stats.shotsFired) * 100));
  }

  public getHullDamagePercent(): number {
    if (this.stats.maxShield <= 0) return 0;
    return Math.round((this.stats.hullDamageTaken / this.stats.maxShield) * 100);
  }

  public computeRank(): SRankBreakdown {
    const accuracy = this.getAccuracyPercent();
    const hullDmgPct = this.getHullDamagePercent();
    const gates = this.stats.turboGatesHit;
    const bossTime = this.stats.bossClearTimeSec > 0 ? Math.round(this.stats.bossClearTimeSec * 10) / 10 : 0;

    const cAcc = accuracy >= 60;
    const cHull = hullDmgPct < 25;
    const cGates = gates >= 2;
    const cBoss = bossTime > 0 && bossTime <= 75;

    const passedCount = [cAcc, cHull, cGates, cBoss].filter(Boolean).length;

    const shieldPct = Math.round((this.stats.shieldRemaining / Math.max(1, this.stats.maxShield)) * 100);
    const shieldBonus = Math.round(shieldPct * 25 * this.difficultyConfig.scoreMult);
    const totalLevelScore = this.stats.score + shieldBonus;
    const bootBucksEarned = Math.max(150, Math.round(totalLevelScore / 18));

    let rank: 'S' | 'A' | 'B' | 'C' = 'C';
    if (passedCount === 4) rank = 'S';
    else if (passedCount === 3) rank = 'A';
    else if (passedCount >= 2) rank = 'B';

    return {
      rank,
      shieldBonus,
      totalLevelScore,
      bootBucksEarned,
      criteria: [
        { label: 'ACCURACY', actual: `${accuracy}%`, target: '>= 60%', passed: cAcc },
        { label: 'HULL DAMAGE', actual: `${hullDmgPct}%`, target: '< 25%', passed: cHull },
        { label: 'TURBO GATES HIT', actual: `${gates}`, target: '>= 2', passed: cGates },
        {
          label: 'BOSS CLEAR TIME',
          actual: bossTime > 0 ? `${bossTime.toFixed(1)}s` : '—',
          target: '<= 75s',
          passed: cBoss,
        },
      ],
    };
  }
}
