import { z } from 'zod';

const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex color like #00f0ff');

export const EnvironmentSchema = z.object({
  theme: z.enum(['canyon', 'asteroid_field', 'cyber_spire']),
  skyColor: HexColor,
  fogColor: HexColor,
  fogDensity: z.number().min(0.002).max(0.03),
  primaryColor: HexColor,
  secondaryColor: HexColor,
  ambientIntensity: z.number().min(0.1).max(1.5),
});

export const BannerEventSchema = z.object({
  atDistance: z.number().min(0),
  type: z.literal('banner'),
  text: z.string().min(1).max(80),
});

export const WaveEventSchema = z.object({
  atDistance: z.number().min(0),
  type: z.literal('wave'),
  enemy: z.enum(['scout', 'weaver', 'turret', 'interceptor']),
  formation: z.enum(['line', 'v_shape', 'spiral', 'flanking']),
  count: z.number().int().min(1).max(16),
  spawnOffset: z.object({
    x: z.number().min(-14).max(14),
    y: z.number().min(-8).max(8),
  }),
  behavior: z.enum(['straight', 'sine_weave', 'swoop_pass', 'hover_fire']),
  fireRate: z.number().min(0).max(4),
});

export const ObstacleEventSchema = z.object({
  atDistance: z.number().min(0),
  type: z.literal('obstacle'),
  kind: z.enum([
    'arch_gate',
    'crystal_cluster',
    'laser_bar',
    'boost_ring',
    'monolith_pillar',
    'rogue_asteroid',
    'slalom_gate',
    'spinner_cross',
    'debris_field',
    'weapon_crate',
  ]),
  position: z.object({
    x: z.number().min(-12).max(12),
    y: z.number().min(-7).max(7),
  }),
  scale: z.number().min(0.5).max(3.0).default(1.0),
  rotationSpeed: z.number().min(-3).max(3).default(0),
  driftX: z.number().min(-16).max(16).optional(),
  driftY: z.number().min(-10).max(10).optional(),
});

export const BossEventSchema = z.object({
  atDistance: z.number().min(0),
  type: z.literal('boss'),
  bossId: z.enum(['aegis_dreadnought', 'octa_core_sentinel', 'solaris_leviathan']),
  name: z.string().min(1).max(60),
  hp: z.number().min(200).max(4000),
  phases: z.number().int().min(2).max(3),
});

export const TimelineEventSchema = z.discriminatedUnion('type', [
  BannerEventSchema,
  WaveEventSchema,
  ObstacleEventSchema,
  BossEventSchema,
]);

export const LevelSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Must be kebab-case'),
  name: z.string().min(1),
  subtitle: z.string().min(1),
  baseSpeed: z.number().min(25).max(100),
  length: z.number().min(800).max(20000),
  environment: EnvironmentSchema,
  timeline: z.array(TimelineEventSchema).min(1),
});

export type LevelConfig = z.infer<typeof LevelSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type WaveEvent = z.infer<typeof WaveEventSchema>;
export type ObstacleEvent = z.infer<typeof ObstacleEventSchema>;
export type BossEvent = z.infer<typeof BossEventSchema>;
export type EnemyKind = WaveEvent['enemy'];
export type ObstacleKind = ObstacleEvent['kind'];
export type BossId = BossEvent['bossId'];
