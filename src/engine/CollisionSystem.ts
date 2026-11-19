import * as THREE from 'three';
import type { PlayerShip } from '../entities/PlayerShip';
import type { Projectile, ProjectilePool } from '../entities/ProjectilePool';
import type { EnemyEntity, EnemyFactory } from '../entities/EnemyFactory';
import type { ObstacleEntity, ObstacleFactory } from '../entities/ObstacleFactory';
import type { BossController, BossPart } from '../entities/BossController';

export interface CollisionCallbacks {
  onEnemyHit: (enemy: EnemyEntity, pos: THREE.Vector3) => void;
  onEnemyKilled: (enemy: EnemyEntity, pos: THREE.Vector3) => void;
  onCrystalDestroyed: (obs: ObstacleEntity, pos: THREE.Vector3) => void;
  onBossPartHit: (
    part: BossPart,
    pos: THREE.Vector3,
    phaseBreak: boolean,
    bossDefeated: boolean,
    partDestroyed: boolean
  ) => void;
  onPlayerDamaged: (amount: number, pos: THREE.Vector3, source: 'projectile' | 'obstacle' | 'beam' | 'enemy') => void;
  onDeflectShot: (proj: Projectile) => void;
  onBoostRing: (obs: ObstacleEntity) => void;
  onSlalomGate: (obs: ObstacleEntity) => void;
  onWeaponCrate: (obs: ObstacleEntity) => void;
}

const _ab = new THREE.Vector3();
const _ap = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _partPos = new THREE.Vector3();

function distSqPointToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  _ab.subVectors(b, a);
  _ap.subVectors(p, a);
  const abLenSq = _ab.lengthSq();
  if (abLenSq < 1e-6) return p.distanceToSquared(a);
  const t = THREE.MathUtils.clamp(_ap.dot(_ab) / abLenSq, 0, 1);
  _closest.copy(a).addScaledVector(_ab, t);
  return p.distanceToSquared(_closest);
}

export class CollisionSystem {
  public resolve(
    player: PlayerShip,
    projectiles: ProjectilePool,
    enemies: EnemyFactory,
    obstacles: ObstacleFactory,
    boss: BossController,
    cb: CollisionCallbacks
  ): void {
    const playerPos = player.position;
    const playerRadius = 1.55;
    const deflectRadius = 3.25;

    // 1. Projectiles vs Targets
    for (const proj of projectiles.projectiles) {
      if (!proj.active) continue;

      if (proj.kind === 'enemy_plasma') {
        if (player.isBarrelRolling) {
          const r = deflectRadius + proj.radius;
          if (distSqPointToSegment(playerPos, proj.prevPos, proj.pos) <= r * r) {
            proj.active = false;
            cb.onDeflectShot(proj);
            continue;
          }
        }

        const r = playerRadius + proj.radius;
        if (distSqPointToSegment(playerPos, proj.prevPos, proj.pos) <= r * r) {
          proj.active = false;
          if (player.takeDamage(proj.damage)) {
            cb.onPlayerDamaged(proj.damage, playerPos, 'projectile');
          }
        }
        continue;
      }

      // Player projectiles vs Enemies
      let consumed = false;
      for (const e of enemies.enemies) {
        if (!e.alive) continue;
        const r = e.radius + proj.radius;
        if (distSqPointToSegment(e.mesh.position, proj.prevPos, proj.pos) <= r * r) {
          proj.active = false;
          consumed = true;
          const killed = enemies.damageEnemy(e, proj.damage);
          if (killed) {
            cb.onEnemyKilled(e, e.mesh.position.clone());
          } else {
            cb.onEnemyHit(e, proj.pos.clone());
          }
          break;
        }
      }
      if (consumed) continue;

      // Player projectiles vs Destructible Crystal Clusters, Rogue Asteroids & Debris Fields
      for (const obs of obstacles.obstacles) {
        if (!obs.alive || !obs.destructible) continue;
        const r = obs.hitRadius + proj.radius;
        if (distSqPointToSegment(obs.mesh.position, proj.prevPos, proj.pos) <= r * r) {
          proj.active = false;
          consumed = true;
          const broken = obstacles.damageCrystal(obs, proj.damage);
          if (broken) {
            cb.onCrystalDestroyed(obs, obs.mesh.position.clone());
          }
          break;
        }
      }
      if (consumed) continue;

      // Player projectiles vs Boss Parts
      if (boss.active) {
        for (const part of boss.parts) {
          if (!part.alive) continue;
          part.getPosition(_partPos);
          const r = part.radius + proj.radius;
          if (distSqPointToSegment(_partPos, proj.prevPos, proj.pos) <= r * r) {
            proj.active = false;
            const res = boss.damagePart(part, proj.damage);
            cb.onBossPartHit(part, res.pos, res.phaseBreak, res.bossDefeated, res.partDestroyed);
            break;
          }
        }
      }
    }

    // 2. Player vs Enemies (ramming)
    for (const e of enemies.enemies) {
      if (!e.alive) continue;
      const dz = Math.abs(e.mesh.position.z - playerPos.z);
      if (dz < 2.6) {
        const dist = e.mesh.position.distanceTo(playerPos);
        if (dist < e.radius + playerRadius) {
          if (player.takeDamage(18)) {
            cb.onPlayerDamaged(18, playerPos, 'enemy');
          }
          enemies.damageEnemy(e, 999);
          cb.onEnemyKilled(e, e.mesh.position.clone());
        }
      }
    }

    // 3. Player vs Obstacles, Boost Rings & Racing Slalom Gates
    for (const obs of obstacles.obstacles) {
      if (!obs.alive) continue;
      const pos = obs.logicalPos;
      const dz = Math.abs(pos.z - playerPos.z);
      if (dz > 3.2) continue;

      if (obs.kind === 'boost_ring') {
        if (obs.triggered) continue;
        const dxy = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
        if (dxy < obs.hitRadius) {
          obs.triggered = true;
          cb.onBoostRing(obs);
        }
      } else if (obs.kind === 'slalom_gate') {
        if (obs.triggered) continue;
        const dx = Math.abs(playerPos.x - pos.x);
        const dy = Math.abs(playerPos.y - pos.y);
        if (dx < 3.6 * obs.scale && dy < 3.8 * obs.scale) {
          obs.triggered = true;
          cb.onSlalomGate(obs);
        }
      } else if (obs.kind === 'weapon_crate') {
        if (obs.triggered) continue;
        const dxy = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
        if (dxy < obs.hitRadius + 1.1) {
          obs.triggered = true;
          obs.alive = false;
          obs.mesh.visible = false;
          cb.onWeaponCrate(obs);
        }
      } else if (
        obs.kind === 'crystal_cluster' ||
        obs.kind === 'rogue_asteroid' ||
        obs.kind === 'debris_field'
      ) {
        const dxy = Math.hypot(playerPos.x - pos.x, playerPos.y - pos.y);
        if (dxy < obs.hitRadius + 1.05) {
          if (player.takeDamage(22)) {
            cb.onPlayerDamaged(22, playerPos, 'obstacle');
          }
          obstacles.damageCrystal(obs, 999);
          cb.onCrystalDestroyed(obs, obs.mesh.position.clone());
        }
      } else if (obs.kind === 'monolith_pillar' && obs.halfExtents) {
        const dx = Math.abs(playerPos.x - pos.x);
        if (dx < obs.halfExtents.x + 1.15) {
          if (player.takeDamage(24)) {
            cb.onPlayerDamaged(24, playerPos, 'obstacle');
          }
        }
      } else if (obs.kind === 'arch_gate') {
        const dx = Math.abs(playerPos.x - pos.x);
        const dy = playerPos.y - pos.y;
        const gap = 3.8 * obs.scale;
        const hitPillar = dx > gap - 0.7 * obs.scale && dx < gap + 2.6 * obs.scale;
        const hitTop = dx < gap + 2.6 * obs.scale && dy > 3.1 * obs.scale && dy < 6.0 * obs.scale;
        if (hitPillar || hitTop) {
          if (player.takeDamage(22)) {
            cb.onPlayerDamaged(22, playerPos, 'obstacle');
          }
        }
      } else if (obs.kind === 'laser_bar' && obs.halfExtents) {
        const rx = playerPos.x - pos.x;
        const ry = playerPos.y - pos.y;
        const cos = Math.cos(-obs.mesh.rotation.z);
        const sin = Math.sin(-obs.mesh.rotation.z);
        const lx = rx * cos - ry * sin;
        const ly = rx * sin + ry * cos;
        if (Math.abs(lx) < obs.halfExtents.x + 0.9 && Math.abs(ly) < obs.halfExtents.y + 0.75) {
          if (player.takeDamage(24)) {
            cb.onPlayerDamaged(24, playerPos, 'beam');
          }
        }
      } else if (obs.kind === 'spinner_cross' && obs.halfExtents) {
        const rx = playerPos.x - pos.x;
        const ry = playerPos.y - pos.y;
        const cos = Math.cos(-obs.mesh.rotation.z);
        const sin = Math.sin(-obs.mesh.rotation.z);
        const lx = rx * cos - ry * sin;
        const ly = rx * sin + ry * cos;
        const hitBlade1 = Math.abs(lx) < obs.halfExtents.x + 0.8 && Math.abs(ly) < obs.halfExtents.y + 0.65;
        const hitBlade2 = Math.abs(ly) < obs.halfExtents.x + 0.8 && Math.abs(lx) < obs.halfExtents.y + 0.65;
        if (hitBlade1 || hitBlade2) {
          if (player.takeDamage(24)) {
            cb.onPlayerDamaged(24, playerPos, 'beam');
          }
        }
      }
    }

    // 4. Player vs Boss Sweeping Laser Walls (Horizontal AND Vertical sweeps!)
    if (boss.active && boss.sweepBeamActive) {
      if (boss.sweepAxis === 'horizontal' && Math.abs(playerPos.y - boss.sweepBeamPos) < 1.55) {
        if (player.takeDamage(20)) {
          cb.onPlayerDamaged(20, playerPos, 'beam');
        }
      } else if (boss.sweepAxis === 'vertical' && Math.abs(playerPos.x - boss.sweepBeamPos) < 1.75) {
        if (player.takeDamage(20)) {
          cb.onPlayerDamaged(20, playerPos, 'beam');
        }
      }
    }
  }
}
