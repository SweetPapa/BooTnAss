export type UpgradeKey =
  | 'turboBoots'
  | 'chromeRollers'
  | 'hullPlating'
  | 'homingMissiles'
  | 'overdriveMagnet';

export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  tagline: string;
  costs: [number, number, number]; // Tier 1, 2, 3
  tierDesc: [string, string, string];
}

export const UPGRADE_DEFS: UpgradeDef[] = [
  {
    key: 'turboBoots',
    name: 'TURBO BOOTS',
    tagline: 'Longer boost duration + faster recharge',
    costs: [350, 750, 1400],
    tierDesc: ['+20% duration, +30% recharge', '+40% duration, +60% recharge', '+65% duration, +100% recharge'],
  },
  {
    key: 'chromeRollers',
    name: 'CHROME ROLLERS',
    tagline: 'Wider deflect window + 2x reflected damage',
    costs: [400, 850, 1500],
    tierDesc: ['+25% deflect radius, 2x dmg', '+50% deflect radius, 2.5x dmg', '+75% deflect radius, 3x dmg'],
  },
  {
    key: 'hullPlating',
    name: 'HULL PLATING',
    tagline: '+25% max shield per tier + passive regen',
    costs: [350, 800, 1450],
    tierDesc: ['125 Max Shield + slow regen', '150 Max Shield + med regen', '175 Max Shield + fast regen'],
  },
  {
    key: 'homingMissiles',
    name: 'TWIN-BOOT MISSILES',
    tagline: 'Hold Fire 1s or LT/Shift to lock 2 / 4 / 6 targets',
    costs: [450, 950, 1650],
    tierDesc: ['Lock up to 2 targets', 'Lock up to 4 targets', 'Lock up to 6 targets!'],
  },
  {
    key: 'overdriveMagnet',
    name: 'OVERDRIVE MAGNET',
    tagline: 'Larger pickup radius + longer weapon power-ups',
    costs: [300, 700, 1300],
    tierDesc: ['+35% magnet, 19s upgrades', '+70% magnet, 23s upgrades', '+110% magnet, 27s upgrades'],
  },
];

export interface SaveData {
  bootBucks: number;
  upgrades: Record<UpgradeKey, number>; // 0..3
}

const SAVE_KEY = 'bootnass_save_v1';

const DEFAULT_SAVE: SaveData = {
  bootBucks: 0,
  upgrades: {
    turboBoots: 0,
    chromeRollers: 0,
    hullPlating: 0,
    homingMissiles: 0,
    overdriveMagnet: 0,
  },
};

export class MetaProgression {
  public data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        bootBucks: typeof parsed.bootBucks === 'number' ? Math.max(0, Math.floor(parsed.bootBucks)) : 0,
        upgrades: {
          turboBoots: this.clampTier(parsed.upgrades?.turboBoots),
          chromeRollers: this.clampTier(parsed.upgrades?.chromeRollers),
          hullPlating: this.clampTier(parsed.upgrades?.hullPlating),
          homingMissiles: this.clampTier(parsed.upgrades?.homingMissiles),
          overdriveMagnet: this.clampTier(parsed.upgrades?.overdriveMagnet),
        },
      };
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }

  private clampTier(v: unknown): number {
    if (typeof v !== 'number' || Number.isNaN(v)) return 0;
    return Math.min(3, Math.max(0, Math.floor(v)));
  }

  public save(): void {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // ignore storage errors
    }
  }

  public addBootBucks(amount: number): number {
    const earned = Math.max(0, Math.round(amount));
    this.data.bootBucks += earned;
    this.save();
    return earned;
  }

  public getTier(key: UpgradeKey): number {
    return this.data.upgrades[key];
  }

  public getNextCost(key: UpgradeKey): number | null {
    const tier = this.data.upgrades[key];
    if (tier >= 3) return null;
    const def = UPGRADE_DEFS.find((d) => d.key === key);
    return def ? def.costs[tier] : null;
  }

  public buyUpgrade(key: UpgradeKey): boolean {
    const cost = this.getNextCost(key);
    if (cost === null || this.data.bootBucks < cost) return false;
    this.data.bootBucks -= cost;
    this.data.upgrades[key] += 1;
    this.save();
    return true;
  }

  public resetSave(): void {
    this.data = structuredClone(DEFAULT_SAVE);
    this.save();
  }

  // Computed Gameplay Modifiers
  public get maxShield(): number {
    return 100 + this.data.upgrades.hullPlating * 25;
  }

  public get shieldRegenPerSec(): number {
    return this.data.upgrades.hullPlating * 1.4;
  }

  public get boostDrainMult(): number {
    return Math.max(0.45, 1 - this.data.upgrades.turboBoots * 0.18);
  }

  public get boostRechargeMult(): number {
    return 1 + this.data.upgrades.turboBoots * 0.34;
  }

  public get deflectRadiusBonus(): number {
    return this.data.upgrades.chromeRollers * 0.8;
  }

  public get barrelRollDurationBonus(): number {
    return this.data.upgrades.chromeRollers * 0.08;
  }

  public get reflectedDamageMult(): number {
    const t = this.data.upgrades.chromeRollers;
    return t === 0 ? 1.0 : t === 1 ? 2.0 : t === 2 ? 2.5 : 3.0;
  }

  public get maxLockTargets(): number {
    const t = this.data.upgrades.homingMissiles;
    return t === 0 ? 2 : t === 1 ? 2 : t === 2 ? 4 : 6;
  }

  public get pickupRadiusMult(): number {
    return 1 + this.data.upgrades.overdriveMagnet * 0.36;
  }

  public get weaponDurationSec(): number {
    return 15 + this.data.upgrades.overdriveMagnet * 4;
  }
}
