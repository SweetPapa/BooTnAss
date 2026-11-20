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
  bossAggressionMult: number;
  bulletDensityMult: number;
  ringHealAmount: number;
  scoreMult: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  rookie: {
    id: 'rookie',
    label: 'ROOKIE',
    shortBadge: 'ROOKIE',
    description: 'Forgiving shields, classic arcade pace.',
    enemyFireRateMult: 0.9,
    bossAggressionMult: 0.9,
    bulletDensityMult: 1.0,
    ringHealAmount: 18,
    scoreMult: 1.0,
  },
  ace: {
    id: 'ace',
    label: 'ACE (RECOMMENDED)',
    shortBadge: 'ACE',
    description: '+35% enemy fire rate, faster boss phases, tighter shields.',
    enemyFireRateMult: 1.35,
    bossAggressionMult: 1.2,
    bulletDensityMult: 1.25,
    ringHealAmount: 12,
    scoreMult: 1.2,
  },
  maximum: {
    id: 'maximum',
    label: 'MAXIMUM BOOT-N-ASS',
    shortBadge: 'MAX BNA',
    description: 'Bullet-hell density, 2x aggression, 1.5x score multiplier!',
    enemyFireRateMult: 2.0,
    bossAggressionMult: 1.45,
    bulletDensityMult: 1.65,
    ringHealAmount: 10,
    scoreMult: 1.5,
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

export class GameState {
  public phase: GamePhase = 'Boot';
  public currentLevelIndex = 0;
  public totalCampaignScore = 0;
  public difficulty: DifficultyId = 'ace'; // ACE is Recommended Default!
  public mouseAimEnabled = false;
  public muted = false;

  public stats: RunStats = this.createFreshStats(100);

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
    const bossTime = Math.round(this.stats.bossClearTimeSec);

    const cAcc = accuracy >= 60;
    const cHull = hullDmgPct < 25;
    const cGates = gates >= 2;
    const cBoss = bossTime > 0 ? bossTime <= 45 : true;

    const passedCount = [cAcc, cHull, cGates, cBoss].filter(Boolean).length;

    const shieldPct = Math.round((this.stats.shieldRemaining / Math.max(1, this.stats.maxShield)) * 100);
    const shieldBonus = Math.round(shieldPct * 25 * this.difficultyConfig.scoreMult);
    const totalLevelScore = this.stats.score + shieldBonus;
    const bootBucksEarned = Math.max(150, Math.round(totalLevelScore / 18));

    let rank: 'S' | 'A' | 'B' | 'C' = 'C';
    if (passedCount === 4) rank = 'S';
    else if (passedCount === 3) rank = 'A';
    else if (passedCount >= 2 || totalLevelScore >= 5000) rank = 'B';

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
          actual: bossTime > 0 ? `${bossTime}s` : '—',
          target: '<= 45s',
          passed: cBoss,
        },
      ],
    };
  }
}
