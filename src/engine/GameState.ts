export type GamePhase =
  | 'Boot'
  | 'Crawl'
  | 'Title'
  | 'LevelSelect'
  | 'Playing'
  | 'Paused'
  | 'LevelClear'
  | 'GameOver'
  | 'Victory';

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
  shieldRemaining: number;
  overdriveAnnounced: boolean;
}

export class GameState {
  public phase: GamePhase = 'Crawl';
  public currentLevelIndex = 0;
  public totalCampaignScore = 0;
  public mouseAimEnabled = false;
  public muted = false;

  public stats: RunStats = this.createFreshStats();

  public createFreshStats(): RunStats {
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
      shieldRemaining: 100,
      overdriveAnnounced: false,
    };
  }

  public resetLevelStats(): void {
    this.stats = this.createFreshStats();
  }

  public registerKill(basePoints: number): { points: number; enteredOverdrive: boolean } {
    const prevCombo = this.stats.combo;
    this.stats.enemiesDestroyed += 1;
    this.stats.combo = Math.min(16, this.stats.combo + 1);
    this.stats.comboTimer = 4.0;
    if (this.stats.combo > this.stats.maxCombo) {
      this.stats.maxCombo = this.stats.combo;
    }
    const points = Math.round(basePoints * this.stats.combo);
    this.stats.score += points;

    const enteredOverdrive = prevCombo < 10 && this.stats.combo >= 10 && !this.stats.overdriveAnnounced;
    if (enteredOverdrive) {
      this.stats.overdriveAnnounced = true;
    }
    return { points, enteredOverdrive };
  }

  public addBonusScore(basePoints: number): number {
    const points = Math.round(basePoints * Math.max(1, this.stats.combo));
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

  public computeRank(): { rank: 'S' | 'A' | 'B' | 'C'; shieldBonus: number; totalLevelScore: number } {
    const accuracy = this.getAccuracyPercent();
    const shieldBonus = Math.round(this.stats.shieldRemaining * 25);
    const totalLevelScore = this.stats.score + shieldBonus;
    let rank: 'S' | 'A' | 'B' | 'C' = 'C';
    if (this.stats.maxCombo >= 10 && this.stats.shieldRemaining >= 65 && accuracy >= 35) {
      rank = 'S';
    } else if (this.stats.maxCombo >= 6 && this.stats.shieldRemaining >= 40) {
      rank = 'A';
    } else if (this.stats.shieldRemaining >= 20 || this.stats.score >= 4000) {
      rank = 'B';
    }
    return { rank, shieldBonus, totalLevelScore };
  }
}
