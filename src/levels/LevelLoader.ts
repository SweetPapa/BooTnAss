import yaml from 'js-yaml';
import { LevelSchema, type LevelConfig, type TimelineEvent } from './LevelSchema';

export interface LevelLoadError {
  file: string;
  message: string;
}

export interface LoadedLevelsResult {
  levels: LevelConfig[];
  errors: LevelLoadError[];
}

// Auto-discover every YAML level placed in src/levels/data/
const rawLevelModules = import.meta.glob('./data/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function loadAllLevels(): LoadedLevelsResult {
  const levels: LevelConfig[] = [];
  const errors: LevelLoadError[] = [];

  const sortedPaths = Object.keys(rawLevelModules).sort();
  for (const filePath of sortedPaths) {
    const raw = rawLevelModules[filePath];
    try {
      const parsed = yaml.load(raw);
      const res = LevelSchema.safeParse(parsed);
      if (!res.success) {
        const details = res.error.issues
          .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('\n');
        errors.push({
          file: filePath,
          message: `Zod Schema Validation Failed:\n${details}`,
        });
      } else {
        // Ensure timeline is sorted by atDistance
        res.data.timeline.sort((a, b) => a.atDistance - b.atDistance);
        levels.push(res.data);
      }
    } catch (err) {
      errors.push({
        file: filePath,
        message: `YAML Parse Error:\n${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { levels, errors };
}

export class LevelTimelineDriver {
  public level: LevelConfig;
  public distance = 0;
  private nextEventIndex = 0;

  constructor(level: LevelConfig, startDistance = 0) {
    this.level = level;
    this.distance = Math.max(0, startDistance);
    // Advance pointer past events before startDistance (except boss if near it)
    while (
      this.nextEventIndex < this.level.timeline.length &&
      this.level.timeline[this.nextEventIndex].atDistance < this.distance
    ) {
      this.nextEventIndex++;
    }
  }

  public advance(dt: number, speed: number, onEvent: (ev: TimelineEvent) => void): void {
    this.distance += speed * dt;
    while (
      this.nextEventIndex < this.level.timeline.length &&
      this.level.timeline[this.nextEventIndex].atDistance <= this.distance
    ) {
      onEvent(this.level.timeline[this.nextEventIndex]);
      this.nextEventIndex++;
    }
  }

  public get progress(): number {
    return Math.min(1, this.distance / this.level.length);
  }
}
