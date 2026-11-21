export interface LeaderboardEntry {
  initials: string;
  score: number;
  rank: 'S' | 'A' | 'B' | 'C';
  difficulty: string;
  date: string;
}

const STORAGE_KEY = 'bootnass_leaderboard_v1';
const MAX_ENTRIES = 10;

export class Leaderboard {
  public static load(): LeaderboardEntry[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (e): e is LeaderboardEntry =>
            typeof e === 'object' &&
            e !== null &&
            typeof e.initials === 'string' &&
            typeof e.score === 'number'
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
  }

  public static saveScore(
    rawInitials: string,
    score: number,
    rank: 'S' | 'A' | 'B' | 'C',
    difficulty = 'ARCADE'
  ): LeaderboardEntry[] {
    const cleaned = rawInitials
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3);
    const initials = cleaned.length > 0 ? cleaned.padEnd(3, 'X').slice(0, 3) : 'ACE';

    const entries = this.load();
    entries.push({
      initials,
      score: Math.round(score),
      rank,
      difficulty,
      date: new Date().toLocaleDateString(),
    });
    entries.sort((a, b) => b.score - a.score);
    const top10 = entries.slice(0, MAX_ENTRIES);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(top10));
    } catch {
      // Ignore storage quota errors
    }
    return top10;
  }

  public static computeCampaignRank(
    totalScore: number,
    sectorRanks?: Array<'S' | 'A' | 'B' | 'C'>
  ): 'S' | 'A' | 'B' | 'C' {
    if (sectorRanks && sectorRanks.length > 0) {
      const pts: Record<'S' | 'A' | 'B' | 'C', number> = { S: 4, A: 3, B: 2, C: 1 };
      const avg = sectorRanks.reduce((acc, r) => acc + pts[r], 0) / sectorRanks.length;
      if (avg >= 3.65) return 'S';
      if (avg >= 2.65) return 'A';
      if (avg >= 1.65) return 'B';
      return 'C';
    }
    if (totalScore >= 250000) return 'S';
    if (totalScore >= 140000) return 'A';
    if (totalScore >= 60000) return 'B';
    return 'C';
  }
}
