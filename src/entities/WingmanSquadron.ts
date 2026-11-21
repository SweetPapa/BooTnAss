import * as THREE from 'three';
import type { EnemyEntity, EnemyFactory } from './EnemyFactory';
import type { ProjectilePool } from './ProjectilePool';
import type { BossController } from './BossController';
import type { ObstacleFactory } from './ObstacleFactory';
import type { TrackCurve } from '../levels/TrackCurve';

export type WingmanId = 'blitz' | 'tank';

export interface WingmanHudEntry {
  id: WingmanId;
  callsign: string;
  hpPct: number;
  underAttack: boolean;
  ejected: boolean;
  accentColor: string;
}

export interface WingmanDistressTarget {
  allyId: WingmanId;
  callsign: string;
  worldPos: THREE.Vector3;
}

export interface WingmanCallbacks {
  onNeedHelp: (allyId: WingmanId, callsign: string) => void;
  onSaved: (allyId: WingmanId, callsign: string, pos: THREE.Vector3) => void;
  onEjected: (allyId: WingmanId, callsign: string, pos: THREE.Vector3) => void;
  onSpark: (pos: THREE.Vector3, colorHex: number) => void;
  onTrail?: (pos: THREE.Vector3, colorHex: number, size: number) => void;
}

type WingmanManeuver =
  | 'formation'
  | 'intercept'
  | 'cross_swoop'
  | 'boost_surge'
  | 'loop_orbit'
  | 'boss_strafe';

interface WingmanShip {
  id: WingmanId;
  callsign: string;
  accentHex: number;
  accentCss: string;
  root: THREE.Group;
  mesh: THREE.Group;
  thrusters: THREE.Mesh[];
  hp: number;
  maxHp: number;
  alive: boolean;
  ejected: boolean;
  ejectTimer: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  vel: THREE.Vector3;
  maneuver: WingmanManeuver;
  maneuverTimer: number;
  maneuverDuration: number;
  maneuverSide: number;
  maneuverSeed: number;
  interceptTarget: EnemyEntity | null;
  rollSpinTimer: number;
  rollSpinDuration: number;
  rollSpinDir: number;
  dodgeCooldown: number;
  bankSmooth: number;
  pitchSmooth: number;
  yawSmooth: number;
  fireCooldown: number;
  burstRemaining: number;
  muzzleToggle: number;
  trailTimer: number;
  damageSparkTimer: number;
  healFlashTimer: number;
  pursuer: EnemyEntity | null;
  helpCalledForPursuer: boolean;
}

const HAZARD_OBSTACLES = new Set([
  'arch_gate',
  'crystal_cluster',
  'laser_bar',
  'monolith_pillar',
  'rogue_asteroid',
  'spinner_cross',
  'debris_field',
]);

export class WingmanSquadron {
  public deployed = false;
  public arrivalActive = false;
  public arrivalElapsed = 0;
  public readonly arrivalDuration = 5.2;

  private readonly scene: THREE.Scene;
  private readonly ships: WingmanShip[] = [];
  private age = 0;
  private pursuitSpawnTimer = 9.0;
  private arrivalSalvoFired = false;
  private lastStuntActive = false;
  private readonly tmpCurve = { dx: 0, dy: 0 };
  private readonly tmpTargetPos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public deploy(cinematic: boolean): void {
    this.clear();
    this.deployed = true;
    this.age = 0;
    this.pursuitSpawnTimer = 10.5;
    this.arrivalSalvoFired = false;
    this.lastStuntActive = false;

    const blitz = this.createShip('blitz', 'BLITZ', 0x00ff88, '#00ff88', -6.8, 1.4, -14.5, -1);
    const tank = this.createShip('tank', 'TANK', 0xffd447, '#ffd447', 6.8, -0.8, -16.0, 1);
    this.ships.push(blitz, tank);

    if (cinematic) {
      this.arrivalActive = true;
      this.arrivalElapsed = 0;
      // Start behind the camera so they streak dramatically past both wingtips!
      blitz.root.position.set(-14, -4, 18);
      tank.root.position.set(14, -3, 21);
    } else {
      this.arrivalActive = false;
      this.arrivalElapsed = this.arrivalDuration;
      // Warp in beside the player cleanly at Sector 3 start with immediate momentum!
      blitz.root.position.set(-9.5, 2.4, 8);
      blitz.vel.set(2, -1, -24);
      tank.root.position.set(9.5, -1.4, 10);
      tank.vel.set(-2, 1, -24);
      this.triggerRoll(blitz, 0.7, 1);
      this.triggerRoll(tank, 0.75, -1);
    }
  }

  private createShip(
    id: WingmanId,
    callsign: string,
    accentHex: number,
    accentCss: string,
    baseX: number,
    baseY: number,
    baseZ: number,
    initialSide: number
  ): WingmanShip {
    const root = new THREE.Group();
    const mesh = new THREE.Group();
    root.add(mesh);

    const thrusters: THREE.Mesh[] = [];
    const accentMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: new THREE.Color(accentHex),
      emissiveIntensity: 2.0,
      flatShading: true,
    });
    const whiteArmor = new THREE.MeshStandardMaterial({
      color: 0xdff0ff,
      metalness: 0.35,
      roughness: 0.32,
      flatShading: true,
    });
    const darkTrim = new THREE.MeshStandardMaterial({
      color: id === 'blitz' ? 0x0f2d22 : 0x182a54,
      metalness: 0.55,
      roughness: 0.3,
      flatShading: true,
    });

    if (id === 'blitz') {
      // BLITZ — Sleek emerald & white forward-swept speed striker!
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 2.9, 4), whiteArmor);
      nose.rotation.x = -Math.PI / 2;
      nose.rotation.z = Math.PI / 4;
      nose.scale.set(1.1, 1, 0.55);
      mesh.add(nose);

      const canopy = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), accentMat);
      canopy.scale.set(0.85, 0.5, 2.1);
      canopy.position.set(0, 0.22, -0.1);
      mesh.add(canopy);

      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.85), whiteArmor);
        wing.position.set(side * 1.35, 0, 0.15);
        wing.rotation.y = side * 0.42;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 0.18), accentMat);
        stripe.position.set(side * 1.35, 0.04, 0.25);
        stripe.rotation.y = side * 0.42;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 6), accentMat);
        flame.rotation.x = Math.PI / 2;
        flame.position.set(side * 0.32, 0, 1.55);
        mesh.add(wing, stripe, flame);
        thrusters.push(flame);
      }
    } else {
      // TANK — Chunky cobalt-blue & gold twin-boom heavy gunship!
      const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 2.5), darkTrim);
      mesh.add(fuselage);

      const cockpit = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), accentMat);
      cockpit.scale.set(1.0, 0.6, 1.8);
      cockpit.position.set(0, 0.36, -0.2);
      mesh.add(cockpit);

      for (const side of [-1, 1]) {
        const boom = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 2.9), whiteArmor);
        boom.position.set(side * 1.55, -0.04, 0.1);
        const wingBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 1.05), darkTrim);
        wingBar.position.set(side * 0.95, 0, 0.15);
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.5, 6), accentMat);
        cannon.rotation.x = Math.PI / 2;
        cannon.position.set(side * 1.55, -0.05, -1.6);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.05, 6), accentMat);
        flame.rotation.x = Math.PI / 2;
        flame.position.set(side * 1.55, -0.04, 1.9);
        mesh.add(boom, wingBar, cannon, flame);
        thrusters.push(flame);
      }
    }

    this.scene.add(root);

    return {
      id,
      callsign,
      accentHex,
      accentCss,
      root,
      mesh,
      thrusters,
      hp: 100,
      maxHp: 100,
      alive: true,
      ejected: false,
      ejectTimer: 0,
      baseX,
      baseY,
      baseZ,
      vel: new THREE.Vector3(),
      maneuver: id === 'blitz' ? 'cross_swoop' : 'formation',
      maneuverTimer: id === 'blitz' ? 1.8 : 2.6,
      maneuverDuration: 3.0,
      maneuverSide: initialSide,
      maneuverSeed: id === 'blitz' ? 0.5 : 3.2,
      interceptTarget: null,
      rollSpinTimer: 0,
      rollSpinDuration: 0.6,
      rollSpinDir: 1,
      dodgeCooldown: 0,
      bankSmooth: 0,
      pitchSmooth: 0,
      yawSmooth: 0,
      fireCooldown: 0.45,
      burstRemaining: 0,
      muzzleToggle: 0,
      trailTimer: 0,
      damageSparkTimer: 0,
      healFlashTimer: 0,
      pursuer: null,
      helpCalledForPursuer: false,
    };
  }

  private triggerRoll(ship: WingmanShip, duration = 0.62, dir?: number): void {
    if (ship.rollSpinTimer > 0.12) return;
    ship.rollSpinDuration = duration;
    ship.rollSpinTimer = duration;
    ship.rollSpinDir = dir ?? (Math.random() < 0.5 ? 1 : -1);
  }

  /**
   * Runs the 5.2s real-time 3D Wingman Arrival Cutscene (Sector 2 midpoint!).
   */
  public updateArrivalCinematic(
    dt: number,
    enemies: EnemyFactory,
    projectiles: ProjectilePool,
    onPassByBoom: (pos: THREE.Vector3, colorHex: number) => void,
    onTrail?: (pos: THREE.Vector3, colorHex: number, size: number) => void
  ): boolean {
    if (!this.arrivalActive) return false;
    const prevT = this.arrivalElapsed;
    this.arrivalElapsed += dt;
    const t = this.arrivalElapsed;

    const blitz = this.ships[0];
    const tank = this.ships[1];

    if (prevT < 0.35 && t >= 0.35 && blitz) {
      onPassByBoom(new THREE.Vector3(-4, 0.5, -2), blitz.accentHex);
    }
    if (prevT < 0.65 && t >= 0.65 && tank) {
      onPassByBoom(new THREE.Vector3(4, -0.2, -2), tank.accentHex);
    }

    if (blitz && tank) {
      // Phase 1 (0 -> 1.5s): Rocket past the player from behind camera into dramatic forward showcase!
      const enterP = Math.min(1, t / 1.45);
      const easeOut = 1 - Math.pow(1 - enterP, 3);
      blitz.root.position.set(
        THREE.MathUtils.lerp(-14, -4.6, easeOut) + Math.sin(t * 2.2) * 0.9,
        THREE.MathUtils.lerp(-3.5, 1.3, easeOut) + Math.cos(t * 2.6) * 0.5,
        THREE.MathUtils.lerp(16, -15.5, easeOut)
      );
      tank.root.position.set(
        THREE.MathUtils.lerp(14, 4.8, easeOut) - Math.sin(t * 2.0) * 0.9,
        THREE.MathUtils.lerp(-2.8, -0.4, easeOut) + Math.sin(t * 2.4) * 0.5,
        THREE.MathUtils.lerp(20, -17.0, easeOut)
      );

      // Phase 2 (1.5s -> 2.7s): Synchronized twin show-off barrel rolls!
      const rollP = THREE.MathUtils.clamp((t - 1.45) / 0.85, 0, 1);
      const rollAngle = rollP > 0 && rollP < 1 ? rollP * Math.PI * 2 : 0;
      blitz.mesh.rotation.set(0.06, 0, -0.28 + rollAngle);
      tank.mesh.rotation.set(0.04, 0, 0.28 - rollAngle);

      // Fire celebratory emerald & gold opening salvo into any enemies ahead!
      if (!this.arrivalSalvoFired && t >= 2.25) {
        this.arrivalSalvoFired = true;
        for (const s of [blitz, tank]) {
          for (let k = -1; k <= 1; k++) {
            const dir = new THREE.Vector3(k * 0.08, 0, -1).normalize();
            projectiles.spawnAllyBolt(s.root.position.clone(), dir, s.id, 18);
          }
        }
        for (const e of enemies.enemies) {
          if (e.alive && e.mesh.position.z > -120) {
            enemies.damageEnemy(e, 28);
          }
        }
      }

      // Flare thrusters + glowing contrails during the fly-past!
      for (const s of [blitz, tank]) {
        for (const fl of s.thrusters) {
          fl.scale.set(1.2, 1.2, 2.2 + Math.sin(t * 36) * 0.35);
        }
        if (onTrail && Math.random() < 0.75) {
          onTrail(s.root.position.clone().add(new THREE.Vector3(0, 0, 1.6)), s.accentHex, 0.34);
        }
      }
    }

    if (this.arrivalElapsed >= this.arrivalDuration) {
      this.arrivalActive = false;
      // Launch straight into dynamic maneuvers once control returns!
      if (blitz) {
        blitz.maneuver = 'boost_surge';
        blitz.maneuverDuration = 2.6;
        blitz.maneuverTimer = 2.6;
        blitz.vel.set(-3, 2, -16);
      }
      if (tank) {
        tank.maneuver = 'cross_swoop';
        tank.maneuverDuration = 3.4;
        tank.maneuverTimer = 3.4;
        tank.vel.set(-6, 1, -8);
      }
      return true;
    }
    return false;
  }

  /**
   * Triumphant formation victory pass alongside the player during Boss Chain-Reaction Meltdown!
   */
  public updateVictoryFormation(
    dt: number,
    playerPos: THREE.Vector3,
    elapsed: number,
    onTrail?: (pos: THREE.Vector3, colorHex: number, size: number) => void
  ): void {
    if (!this.deployed) return;
    for (const s of this.ships) {
      if (!s.alive || s.ejected) continue;
      const side = s.id === 'blitz' ? -1 : 1;
      const tx = playerPos.x + side * (5.2 + Math.sin(elapsed * 2.2) * 1.4);
      const ty = playerPos.y + (s.id === 'blitz' ? 1.5 : 0.8) + Math.cos(elapsed * 2.5) * 0.9;
      const tz = -8.5 - Math.sin(elapsed * 1.4) * 3.5;

      s.root.position.x = THREE.MathUtils.lerp(s.root.position.x, tx, Math.min(1, dt * 4.2));
      s.root.position.y = THREE.MathUtils.lerp(s.root.position.y, ty, Math.min(1, dt * 4.2));
      s.root.position.z = THREE.MathUtils.lerp(s.root.position.z, tz, Math.min(1, dt * 3.6));

      // Celebratory victory barrel roll at t=0.6s!
      const rollP = THREE.MathUtils.clamp((elapsed - 0.55) / 0.85, 0, 1);
      const roll = rollP > 0 && rollP < 1 ? rollP * Math.PI * 2 * side : 0;
      s.mesh.rotation.set(0.08, 0, side * -0.22 + roll);

      for (const fl of s.thrusters) fl.scale.set(1.15, 1.15, 2.1 + Math.sin(elapsed * 34) * 0.3);
      if (onTrail && Math.random() < 0.7) {
        onTrail(s.root.position.clone().add(new THREE.Vector3(0, 0, 1.6)), s.accentHex, 0.34);
      }
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    enemies: EnemyFactory,
    obstacles: ObstacleFactory,
    projectiles: ProjectilePool,
    boss: BossController,
    trackCurve: TrackCurve,
    difficultyDmgMult: number,
    cb: WingmanCallbacks
  ): void {
    if (!this.deployed || this.arrivalActive) return;
    this.age += dt;

    // Trigger synchronized show-off rolls & thruster surges whenever a track stunt kicks off!
    const stuntNow = trackCurve.activeStunt !== null;
    if (stuntNow && !this.lastStuntActive) {
      for (const s of this.ships) {
        if (s.alive && !s.ejected && !s.pursuer) {
          this.triggerRoll(s, 0.72, s.id === 'blitz' ? 1 : -1);
          s.maneuver = 'loop_orbit';
          s.maneuverDuration = 3.8;
          s.maneuverTimer = 3.8;
        }
      }
    }
    this.lastStuntActive = stuntNow;

    // Periodically send an enemy bogey (or spawn a fresh ambush interceptor!) to dogfight Blitz or Tank!
    const aliveAllies = this.ships.filter((s) => s.alive && !s.ejected);
    const unchasedAllies = aliveAllies.filter((s) => !s.pursuer || !s.pursuer.alive);
    const activePursuits = aliveAllies.length - unchasedAllies.length;
    if (unchasedAllies.length > 0 && activePursuits < 2 && !boss.dying) {
      this.pursuitSpawnTimer -= dt;
      if (this.pursuitSpawnTimer <= 0) {
        const targetAlly = unchasedAllies[Math.floor(Math.random() * unchasedAllies.length)];
        const candidates = enemies.enemies.filter(
          (e) =>
            e.alive &&
            !e.pursuingAlly &&
            e.behavior !== 'tail_stalker' &&
            (e.kind === 'scout' || e.kind === 'weaver' || e.kind === 'interceptor' || e.kind === 'ace_stalker') &&
            e.mesh.position.z < -24 &&
            e.mesh.position.z > -135
        );
        let chaser: EnemyEntity;
        if (candidates.length > 0) {
          chaser = candidates[0];
        } else {
          // Spawn a dedicated high-speed ambush hunter diving in from the flank!
          const side = targetAlly.id === 'blitz' ? -1 : 1;
          const kind = Math.random() < 0.55 ? 'interceptor' : 'scout';
          chaser = enemies.spawnSingle(kind, side * 11, 4.5, -118, 'swoop_pass', 0.9, Math.random() * 6, 1.0);
        }
        chaser.pursuingAlly = targetAlly.id;
        targetAlly.pursuer = chaser;
        targetAlly.helpCalledForPursuer = false;
        this.pursuitSpawnTimer = activePursuits === 0 ? 8.8 : 13.5;
      }
    }

    for (const s of this.ships) {
      // Animate ejected wingman peeling up & away cleanly
      if (s.ejected) {
        if (s.root.visible) {
          s.ejectTimer += dt;
          s.root.position.x += (s.id === 'blitz' ? -15 : 15) * dt;
          s.root.position.y += 10 * dt;
          s.root.position.z -= 20 * dt;
          s.mesh.rotation.z += dt * 7.5;
          if (Math.random() < 0.4) cb.onSpark(s.root.position.clone(), 0xff5511);
          if (s.ejectTimer > 2.4) s.root.visible = false;
        }
        continue;
      }

      if (!s.alive) continue;

      if (s.dodgeCooldown > 0) s.dodgeCooldown -= dt;
      if (s.rollSpinTimer > 0) s.rollSpinTimer = Math.max(0, s.rollSpinTimer - dt);

      // Clean up dead/gone pursuer
      if (s.pursuer && !s.pursuer.alive) {
        s.pursuer = null;
        s.helpCalledForPursuer = false;
      }

      // Advance autonomous maneuver state machine
      if (!s.pursuer) {
        s.maneuverTimer -= dt;
        const targetGone =
          s.maneuver === 'intercept' &&
          (!s.interceptTarget || !s.interceptTarget.alive || s.interceptTarget.mesh.position.z > -14);
        if (s.maneuverTimer <= 0 || targetGone) {
          this.pickNextManeuver(s, enemies, boss);
        }
      }

      // Compute dynamic 3D flight target based on active maneuver (or frantic pursuer evasion!)
      const desired = this.computeManeuverTarget(s, playerPos, boss, trackCurve);

      // Inertial fighter-jet spring-damper steering (produces sweeping banked curves!)
      const isBlitz = s.id === 'blitz';
      const stiffness = s.pursuer ? (isBlitz ? 14.5 : 11.5) : isBlitz ? 11.5 : 8.5;
      const damping = s.pursuer ? 4.2 : isBlitz ? 4.3 : 3.7;

      let ax = (desired.x - s.root.position.x) * stiffness - s.vel.x * damping;
      let ay = (desired.y - s.root.position.y) * stiffness - s.vel.y * damping;
      let az = (desired.z - s.root.position.z) * (stiffness * 0.72) - s.vel.z * damping;

      // Reactive Hazard Obstacle Avoidance — wingmen actively bank & barrel-roll around pillars, asteroids & laser bars!
      for (const obs of obstacles.obstacles) {
        if (!obs.alive || !HAZARD_OBSTACLES.has(obs.kind)) continue;
        const dz = s.root.position.z - obs.mesh.position.z;
        if (dz < -4 || dz > 30) continue;
        const dx = s.root.position.x - obs.mesh.position.x;
        const dy = s.root.position.y - obs.mesh.position.y;
        const safeR = obs.hitRadius + 3.4;
        const distSq = dx * dx + dy * dy;
        if (distSq < safeR * safeR) {
          const dist = Math.max(0.35, Math.sqrt(distSq));
          const push = ((safeR - dist) / safeR) * 68;
          const nx = dist < 0.6 ? s.maneuverSide : dx / dist;
          const ny = dist < 0.6 ? 0.5 : dy / dist;
          ax += nx * push;
          ay += ny * push * 0.85;
          if (dz < 14 && s.dodgeCooldown <= 0) {
            s.dodgeCooldown = 1.6;
            this.triggerRoll(s, 0.54, nx >= 0 ? -1 : 1);
          }
        }
      }

      // Reactive Incoming Plasma Jink — dodges bright enemy fire with snappy side-slips!
      for (const proj of projectiles.projectiles) {
        if (!proj.active || proj.kind !== 'enemy_plasma') continue;
        const dz = s.root.position.z - proj.pos.z;
        if (dz < -2 || dz > 16) continue;
        const dx = s.root.position.x - proj.pos.x;
        const dy = s.root.position.y - proj.pos.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < 14.5) {
          const d = Math.max(0.4, Math.sqrt(dSq));
          ax += (dx / d) * 42;
          ay += (dy / d) * 32;
          if (dSq < 7.5 && s.dodgeCooldown <= 0) {
            s.dodgeCooldown = 2.0;
            this.triggerRoll(s, 0.52, dx >= 0 ? -1 : 1);
          }
          break;
        }
      }

      // Clean wingman-to-wingman separation so Blitz & Tank scissor over/under each other smoothly!
      for (const other of this.ships) {
        if (other === s || !other.alive || other.ejected) continue;
        const dx = s.root.position.x - other.root.position.x;
        const dy = s.root.position.y - other.root.position.y;
        const dz = s.root.position.z - other.root.position.z;
        const dSq = dx * dx + dy * dy + dz * dz;
        if (dSq < 18 && dSq > 0.01) {
          const d = Math.sqrt(dSq);
          const sep = ((4.25 - d) / 4.25) * 28;
          ax += (dx / d) * sep;
          ay += ((dy / d) + (isBlitz ? 0.35 : -0.35)) * sep;
        }
      }

      // Integrate velocity & position with generous arcade flight bounds (never clips camera near plane!)
      s.vel.x = THREE.MathUtils.clamp(s.vel.x + ax * dt, -26, 26);
      s.vel.y = THREE.MathUtils.clamp(s.vel.y + ay * dt, -18, 18);
      s.vel.z = THREE.MathUtils.clamp(s.vel.z + az * dt, -34, 28);

      s.root.position.x = THREE.MathUtils.clamp(s.root.position.x + s.vel.x * dt, -11.8, 11.8);
      s.root.position.y = THREE.MathUtils.clamp(s.root.position.y + s.vel.y * dt, -5.3, 5.9);
      s.root.position.z = THREE.MathUtils.clamp(s.root.position.z + s.vel.z * dt, -44, -9.5);

      // True velocity-driven 3D fighter attitude (deep wing-over banking, nose pitch, turn-lead yaw + barrel rolls!)
      const targetBank = THREE.MathUtils.clamp(-s.vel.x * 0.056 + trackCurve.bankRoll * 0.52, -1.22, 1.22);
      const targetPitch = THREE.MathUtils.clamp(s.vel.y * 0.044, -0.56, 0.56);
      const targetYaw = THREE.MathUtils.clamp(-s.vel.x * 0.024, -0.44, 0.44);

      s.bankSmooth = THREE.MathUtils.lerp(s.bankSmooth, targetBank, Math.min(1, dt * 9.5));
      s.pitchSmooth = THREE.MathUtils.lerp(s.pitchSmooth, targetPitch, Math.min(1, dt * 8.5));
      s.yawSmooth = THREE.MathUtils.lerp(s.yawSmooth, targetYaw, Math.min(1, dt * 8.0));

      let spinAngle = 0;
      if (s.rollSpinTimer > 0 && s.rollSpinDuration > 0) {
        const p = 1 - s.rollSpinTimer / s.rollSpinDuration;
        const eased = p * p * (3 - 2 * p);
        spinAngle = eased * Math.PI * 2 * s.rollSpinDir;
      }

      s.mesh.rotation.set(s.pitchSmooth, s.yawSmooth, s.bankSmooth + spinAngle);

      // Dynamic afterburner flame scaling (brighter during boost surges, intercepts & hard turns!)
      const speedMag = Math.hypot(s.vel.x, s.vel.y, Math.min(0, s.vel.z));
      const surging = s.maneuver === 'boost_surge' || s.maneuver === 'intercept' || s.vel.z < -8;
      const flZ =
        (surging ? 1.85 : 1.15) +
        Math.min(0.85, speedMag * 0.032) +
        Math.sin(this.age * 34 + s.maneuverSeed) * 0.24;
      for (const fl of s.thrusters) fl.scale.set(surging ? 1.15 : 1, surging ? 1.15 : 1, flZ);

      // Subtle readable thruster contrails that trace their sweeping arcs across the sky!
      s.trailTimer -= dt;
      if (cb.onTrail && s.trailTimer <= 0) {
        s.trailTimer = surging || s.rollSpinTimer > 0 ? 0.038 : 0.068;
        const tailPos = s.root.position.clone().add(new THREE.Vector3(0, 0, 1.55));
        cb.onTrail(tailPos, s.accentHex, surging ? 0.3 : 0.2);
      }

      // If pursued by a bogey, steer the bogey aggressively on their tail across the sky so the player gets an awesome rescue shot!
      if (s.pursuer && s.pursuer.alive) {
        const ch = s.pursuer;
        const chTargetX = THREE.MathUtils.clamp(s.root.position.x - s.vel.x * 0.16 + Math.sin(this.age * 4.4) * 1.9, -9.8, 9.8);
        const chTargetY = THREE.MathUtils.clamp(s.root.position.y - s.vel.y * 0.14 + 0.65 + Math.cos(this.age * 3.7) * 1.1, -4.4, 4.8);
        const chTargetZ = THREE.MathUtils.clamp(s.root.position.z - 10.5 + Math.sin(this.age * 2.4) * 2.5, -42, -17);

        const prevChX = ch.mesh.position.x;
        const prevChY = ch.mesh.position.y;
        ch.mesh.position.x = THREE.MathUtils.lerp(ch.mesh.position.x, chTargetX, Math.min(1, dt * 5.2));
        ch.mesh.position.y = THREE.MathUtils.lerp(ch.mesh.position.y, chTargetY, Math.min(1, dt * 5.2));
        ch.mesh.position.z = THREE.MathUtils.lerp(ch.mesh.position.z, chTargetZ, Math.min(1, dt * 4.4));
        const chVx = (ch.mesh.position.x - prevChX) / Math.max(0.001, dt);
        const chVy = (ch.mesh.position.y - prevChY) / Math.max(0.001, dt);
        ch.mesh.rotation.z = THREE.MathUtils.lerp(ch.mesh.rotation.z, THREE.MathUtils.clamp(-chVx * 0.075, -1.05, 1.05), dt * 8.5);
        ch.mesh.rotation.x = THREE.MathUtils.lerp(ch.mesh.rotation.x, THREE.MathUtils.clamp(chVy * 0.04, -0.45, 0.45), dt * 7);
        ch.mesh.rotation.y = THREE.MathUtils.lerp(ch.mesh.rotation.y, THREE.MathUtils.clamp(-chVx * 0.025, -0.4, 0.4), dt * 7);

        // Bright crimson contrail on chasing hunter so the dogfight pops visually!
        if (cb.onTrail && Math.random() < 0.45) {
          cb.onTrail(ch.mesh.position.clone().add(new THREE.Vector3(0, 0, -1.5)), 0xff2244, 0.24);
        }

        // Once bogey closes in, ally calls for help, pulls desperate barrel rolls & takes fire until rescued!
        if (ch.mesh.position.z > -46) {
          if (!s.helpCalledForPursuer) {
            s.helpCalledForPursuer = true;
            this.triggerRoll(s, 0.56);
            cb.onNeedHelp(s.id, s.callsign);
          }
          const dps = 5.2 * Math.min(1.3, difficultyDmgMult);
          s.hp = Math.max(0, s.hp - dps * dt);
          s.damageSparkTimer -= dt;
          if (s.damageSparkTimer <= 0) {
            s.damageSparkTimer = 0.2;
            // Visible laser dogfight flash halfway between pursuer & ally + hull sparks!
            const mid = ch.mesh.position.clone().lerp(s.root.position, 0.55);
            cb.onSpark(mid, 0xff2244);
            cb.onSpark(s.root.position.clone(), 0xff8822);
          }
          if (s.hp <= 0) {
            s.alive = false;
            s.ejected = true;
            s.ejectTimer = 0;
            ch.pursuingAlly = null;
            s.pursuer = null;
            cb.onEjected(s.id, s.callsign, s.root.position.clone());
            continue;
          }
        }
      }

      // Passive light ambient wear during boss fights if boss is firing sweeping beam
      if (boss.active && boss.sweepBeamActive) {
        s.hp = Math.max(12, s.hp - 1.2 * dt);
      }

      // Allied Firing AI: punchy wingtip/twin-cannon bursts onto enemies ahead (never shooting own pursuer!)
      s.fireCooldown -= dt;
      if (s.fireCooldown <= 0) {
        const target = this.pickTargetFor(s, enemies, boss);
        if (target) {
          const dir = target.clone().sub(s.root.position).normalize();
          const dmg = isBlitz ? 10 : 14;
          s.muzzleToggle = 1 - s.muzzleToggle;
          const sideSign = s.muzzleToggle === 0 ? -1 : 1;

          if (s.id === 'tank' && (s.maneuver === 'intercept' || s.maneuver === 'boss_strafe')) {
            // Tank fires badass twin golden cannon bolts on attack runs!
            const leftM = s.root.position.clone().add(new THREE.Vector3(-1.45, -0.05, -1.6));
            const rightM = s.root.position.clone().add(new THREE.Vector3(1.45, -0.05, -1.6));
            projectiles.spawnAllyBolt(leftM, dir, s.id, dmg * 0.72);
            projectiles.spawnAllyBolt(rightM, dir, s.id, dmg * 0.72);
            s.fireCooldown = 0.56;
          } else {
            const muzzle = s.root.position
              .clone()
              .add(new THREE.Vector3(sideSign * (isBlitz ? 1.1 : 1.45), 0, -1.3));
            projectiles.spawnAllyBolt(muzzle, dir, s.id, dmg);
            if (s.burstRemaining > 0) {
              s.burstRemaining -= 1;
              s.fireCooldown = isBlitz ? 0.14 : 0.22;
            } else {
              s.burstRemaining = s.maneuver === 'intercept' ? 2 : 1;
              s.fireCooldown = isBlitz ? 0.36 : 0.54;
            }
          }
        } else {
          s.fireCooldown = 0.22;
        }
      }

      if (s.healFlashTimer > 0) {
        s.healFlashTimer -= dt;
        if (Math.random() < 0.35) cb.onSpark(s.root.position.clone(), s.accentHex);
      }
    }
  }

  private pickNextManeuver(ship: WingmanShip, enemies: EnemyFactory, boss: BossController): void {
    const isBlitz = ship.id === 'blitz';

    if (boss.active) {
      ship.maneuverSide = Math.random() < 0.65 ? -ship.maneuverSide : ship.maneuverSide;
      const roll = Math.random();
      if (roll < 0.55) {
        ship.maneuver = 'boss_strafe';
        ship.maneuverDuration = 2.8 + Math.random() * 1.4;
      } else if (roll < 0.82) {
        ship.maneuver = 'cross_swoop';
        ship.maneuverDuration = 2.6 + Math.random() * 1.2;
      } else {
        ship.maneuver = 'loop_orbit';
        ship.maneuverDuration = 3.2 + Math.random() * 1.0;
      }
      ship.maneuverTimer = ship.maneuverDuration;
      if (Math.random() < 0.45) this.triggerRoll(ship, 0.58, ship.maneuverSide);
      return;
    }

    // Look for a live enemy ahead to actively intercept & dogfight!
    const interceptCandidates = enemies.enemies.filter(
      (e) =>
        e.alive &&
        e.pursuingAlly !== ship.id &&
        e.mesh.position.z < -22 &&
        e.mesh.position.z > -118
    );

    const r = Math.random();
    if (interceptCandidates.length > 0 && r < (isBlitz ? 0.46 : 0.38)) {
      ship.maneuver = 'intercept';
      ship.interceptTarget = interceptCandidates[Math.floor(Math.random() * interceptCandidates.length)];
      ship.maneuverSide = ship.interceptTarget.mesh.position.x >= 0 ? -1 : 1;
      ship.maneuverDuration = 2.4 + Math.random() * 1.4;
      if (isBlitz && Math.random() < 0.5) this.triggerRoll(ship, 0.54);
    } else if (r < 0.66) {
      ship.maneuver = 'cross_swoop';
      ship.maneuverSide = -ship.maneuverSide;
      ship.maneuverDuration = isBlitz ? 2.5 + Math.random() * 1.1 : 3.1 + Math.random() * 1.2;
      if (Math.random() < 0.45) this.triggerRoll(ship, 0.58, ship.maneuverSide);
    } else if (r < 0.84) {
      ship.maneuver = 'boost_surge';
      ship.maneuverSide = Math.random() < 0.5 ? -1 : 1;
      ship.maneuverDuration = 2.4 + Math.random() * 1.3;
    } else if (r < 0.95) {
      ship.maneuver = 'loop_orbit';
      ship.maneuverSide = -ship.maneuverSide;
      ship.maneuverDuration = 3.2 + Math.random() * 1.2;
      this.triggerRoll(ship, 0.68, ship.maneuverSide);
    } else {
      ship.maneuver = 'formation';
      ship.maneuverDuration = 2.0 + Math.random() * 1.0;
    }
    ship.maneuverTimer = ship.maneuverDuration;
  }

  private computeManeuverTarget(
    s: WingmanShip,
    playerPos: THREE.Vector3,
    boss: BossController,
    trackCurve: TrackCurve
  ): THREE.Vector3 {
    const isBlitz = s.id === 'blitz';
    const progress = 1 - Math.max(0, s.maneuverTimer) / Math.max(0.1, s.maneuverDuration);
    const t = this.age + s.maneuverSeed;

    let tx = s.baseX;
    let ty = s.baseY;
    let tz = s.baseZ;

    if (s.pursuer && s.pursuer.alive) {
      // Dramatic frantic across-the-screen evasive dogfight so the player sees the chase vividly!
      tx = Math.sin(t * 2.25) * 7.8 + Math.cos(t * 4.4) * 1.6;
      ty = Math.cos(t * 2.65) * 3.1 + 0.6;
      tz = -16.5 - Math.sin(t * 1.5) * 5.2;
      if (Math.sin(t * 3.1) > 0.94 && s.dodgeCooldown <= 0) {
        s.dodgeCooldown = 1.8;
        this.triggerRoll(s, 0.52);
      }
    } else if (s.maneuver === 'intercept' && s.interceptTarget && s.interceptTarget.alive) {
      // Dive right onto the enemy's flank deep into the canyon, then peel off sharply!
      const ep = s.interceptTarget.mesh.position;
      const peel = progress > 0.72 ? ((progress - 0.72) / 0.28) * 6.5 * s.maneuverSide : 0;
      tx = THREE.MathUtils.clamp(ep.x + s.maneuverSide * 2.8 + peel, -10.8, 10.8);
      ty = THREE.MathUtils.clamp(ep.y + (isBlitz ? -0.6 : 1.5) + Math.sin(progress * Math.PI) * 1.6, -4.5, 5.2);
      tz = THREE.MathUtils.clamp(ep.z + (isBlitz ? 14 : 18), -38, -13);
    } else if (s.maneuver === 'cross_swoop') {
      // Full-screen sweeping fighter pass from one edge of the canyon across to the opposite side!
      const ease = progress * progress * (3 - 2 * progress);
      const startX = -s.maneuverSide * 10.2;
      const endX = s.maneuverSide * 10.2;
      tx = THREE.MathUtils.lerp(startX, endX, ease);
      const arcSign = isBlitz ? 1 : -1;
      ty = Math.sin(progress * Math.PI) * 4.2 * arcSign + Math.cos(t * 1.8) * 0.9;
      tz = -13.5 - Math.sin(progress * Math.PI) * (isBlitz ? 18 : 13);
    } else if (s.maneuver === 'boost_surge') {
      // High-speed afterburner scout sprint way ahead into the neon canyon, then slingshot back!
      const env = Math.sin(progress * Math.PI);
      tx = s.maneuverSide * (4.5 + Math.cos(progress * Math.PI * 2) * 4.5);
      ty = (isBlitz ? 1.8 : -1.2) + Math.sin(progress * Math.PI * 2) * 2.8;
      tz = -12.5 - env * (isBlitz ? 28 : 21);
    } else if (s.maneuver === 'loop_orbit') {
      // 3D figure-8 / vertical corkscrew aerobatic orbit ahead of the player!
      const angle = progress * Math.PI * 2;
      tx = Math.sin(angle) * 9.4 * s.maneuverSide;
      ty = Math.sin(angle * 2) * 3.8 + 0.5;
      tz = -21.0 + Math.cos(angle) * 8.5;
    } else if (s.maneuver === 'boss_strafe') {
      // Sweeping boss arena flanking attack runs (high-low diagonal passes across the boss!)
      const sweep = Math.sin(progress * Math.PI * 1.5);
      tx = sweep * 9.8 * s.maneuverSide;
      ty = (boss.sweepBeamActive ? 4.4 : Math.cos(progress * Math.PI * 2) * 3.4) * (isBlitz ? 1 : -1);
      tz = -13.5 - Math.sin(progress * Math.PI) * 14.5;
    } else {
      // Dynamic loose combat wing formation weaving actively around the player
      tx = playerPos.x * 0.42 + s.baseX + Math.sin(t * 1.9) * 3.8;
      ty = playerPos.y * 0.35 + s.baseY + Math.cos(t * 1.65) * 2.2;
      tz = s.baseZ - Math.sin(t * 1.3) * 5.5;
    }

    // Blend subtle TrackCurve bend so wingmen carve naturally into every canyon turn, loop & corkscrew!
    trackCurve.offsetAtZ(s.root.position.z, this.tmpCurve);
    tx += THREE.MathUtils.clamp(this.tmpCurve.dx * 0.42, -4.5, 4.5);
    ty += THREE.MathUtils.clamp(this.tmpCurve.dy * 0.35, -3.0, 3.0);

    return this.tmpTargetPos.set(
      THREE.MathUtils.clamp(tx, -11.4, 11.4),
      THREE.MathUtils.clamp(ty, -5.0, 5.6),
      THREE.MathUtils.clamp(tz, -42, -10.5)
    );
  }

  private pickTargetFor(
    ship: WingmanShip,
    enemies: EnemyFactory,
    boss: BossController
  ): THREE.Vector3 | null {
    // Prefer their active intercept target first!
    if (
      ship.interceptTarget &&
      ship.interceptTarget.alive &&
      ship.interceptTarget.pursuingAlly !== ship.id &&
      ship.interceptTarget.mesh.position.z < ship.root.position.z - 8
    ) {
      return ship.interceptTarget.mesh.position;
    }

    let bestPos: THREE.Vector3 | null = null;
    let bestScore = Infinity;

    for (const e of enemies.enemies) {
      if (!e.alive) continue;
      if (e.pursuingAlly === ship.id) continue;
      if (e.mesh.position.z > ship.root.position.z - 8 || e.mesh.position.z < -148) continue;
      const dist = e.mesh.position.distanceTo(ship.root.position);
      if (dist < bestScore) {
        bestScore = dist;
        bestPos = e.mesh.position;
      }
    }
    if (bestPos) return bestPos;

    if (boss.active) {
      const parts = boss.getTargetableParts().filter((p) => p.alive && !p.isReflectShield && p.hp > 30);
      if (parts.length > 0) {
        const p = parts[0];
        return p.getPosition(new THREE.Vector3());
      }
    }
    return null;
  }

  /**
   * Call when the player kills an enemy — checks if they just rescued Blitz or Tank!
   */
  public notifyPlayerKilledEnemy(enemy: EnemyEntity, cb: WingmanCallbacks): boolean {
    if (!this.deployed || !enemy.pursuingAlly) return false;
    const savedShip = this.ships.find((s) => s.id === enemy.pursuingAlly && s.alive);
    enemy.pursuingAlly = null;
    if (!savedShip) return false;

    savedShip.pursuer = null;
    savedShip.helpCalledForPursuer = false;
    savedShip.hp = Math.min(savedShip.maxHp, savedShip.hp + 28);
    savedShip.healFlashTimer = 0.85;
    // Celebratory barrel roll & boost surge after getting rescued!
    this.triggerRoll(savedShip, 0.62);
    savedShip.maneuver = 'boost_surge';
    savedShip.maneuverDuration = 2.4;
    savedShip.maneuverTimer = 2.4;
    cb.onSaved(savedShip.id, savedShip.callsign, savedShip.root.position.clone());
    return true;
  }

  public healSquad(amount: number): void {
    for (const s of this.ships) {
      if (s.alive && !s.ejected) {
        s.hp = Math.min(s.maxHp, s.hp + amount);
        s.healFlashTimer = 0.45;
      }
    }
  }

  public getHudState(): {
    deployed: boolean;
    allies: WingmanHudEntry[];
    distressTargets: WingmanDistressTarget[];
  } {
    const allies: WingmanHudEntry[] = this.ships.map((s) => ({
      id: s.id,
      callsign: s.callsign,
      hpPct: Math.round((s.hp / s.maxHp) * 100),
      underAttack: Boolean(s.alive && s.pursuer && s.pursuer.alive),
      ejected: s.ejected,
      accentColor: s.accentCss,
    }));

    const distressTargets: WingmanDistressTarget[] = [];
    for (const s of this.ships) {
      if (s.alive && s.pursuer && s.pursuer.alive) {
        distressTargets.push({
          allyId: s.id,
          callsign: s.callsign,
          worldPos: s.pursuer.mesh.position.clone(),
        });
      }
    }

    return { deployed: this.deployed, allies, distressTargets };
  }

  public clear(): void {
    for (const s of this.ships) {
      if (s.pursuer) s.pursuer.pursuingAlly = null;
      this.scene.remove(s.root);
    }
    this.ships.length = 0;
    this.deployed = false;
    this.arrivalActive = false;
    this.arrivalElapsed = 0;
  }
}
