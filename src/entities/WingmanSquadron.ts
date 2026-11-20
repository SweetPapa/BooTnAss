import * as THREE from 'three';
import type { EnemyEntity, EnemyFactory } from './EnemyFactory';
import type { ProjectilePool } from './ProjectilePool';
import type { BossController } from './BossController';

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
}

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
  fireCooldown: number;
  damageSparkTimer: number;
  healFlashTimer: number;
  pursuer: EnemyEntity | null;
  helpCalledForPursuer: boolean;
}

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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public deploy(cinematic: boolean): void {
    this.clear();
    this.deployed = true;
    this.age = 0;
    this.pursuitSpawnTimer = 10.5;
    this.arrivalSalvoFired = false;

    const blitz = this.createShip('blitz', 'BLITZ', 0x00ff88, '#00ff88', -6.8, 1.5, -13.5);
    const tank = this.createShip('tank', 'TANK', 0xffd447, '#ffd447', 6.8, -0.8, -15.0);
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
      // Warp in beside the player cleanly at Sector 3 start!
      blitz.root.position.set(-9, 2.2, 8);
      tank.root.position.set(9, -1.2, 10);
    }
  }

  private createShip(
    id: WingmanId,
    callsign: string,
    accentHex: number,
    accentCss: string,
    baseX: number,
    baseY: number,
    baseZ: number
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
      fireCooldown: 0.5,
      damageSparkTimer: 0,
      healFlashTimer: 0,
      pursuer: null,
      helpCalledForPursuer: false,
    };
  }

  /**
   * Runs the 5.2s real-time 3D Wingman Arrival Cutscene (Sector 2 midpoint!).
   */
  public updateArrivalCinematic(
    dt: number,
    enemies: EnemyFactory,
    projectiles: ProjectilePool,
    onPassByBoom: (pos: THREE.Vector3, colorHex: number) => void
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
        THREE.MathUtils.lerp(-14, -4.6, easeOut) + Math.sin(t * 2.2) * 0.8,
        THREE.MathUtils.lerp(-3.5, 1.3, easeOut) + Math.cos(t * 2.6) * 0.4,
        THREE.MathUtils.lerp(16, -15.5, easeOut)
      );
      tank.root.position.set(
        THREE.MathUtils.lerp(14, 4.8, easeOut) - Math.sin(t * 2.0) * 0.8,
        THREE.MathUtils.lerp(-2.8, -0.4, easeOut) + Math.sin(t * 2.4) * 0.4,
        THREE.MathUtils.lerp(20, -17.0, easeOut)
      );

      // Phase 2 (1.5s -> 2.7s): Synchronized twin show-off barrel rolls!
      const rollP = THREE.MathUtils.clamp((t - 1.45) / 0.85, 0, 1);
      const rollAngle = rollP > 0 && rollP < 1 ? rollP * Math.PI * 2 : 0;
      blitz.mesh.rotation.set(0.06, 0, -0.25 + rollAngle);
      tank.mesh.rotation.set(0.04, 0, 0.25 - rollAngle);

      // Fire celebratory emerald & gold opening salvo into any enemies ahead!
      if (!this.arrivalSalvoFired && t >= 2.25) {
        this.arrivalSalvoFired = true;
        for (const s of [blitz, tank]) {
          for (let k = -1; k <= 1; k++) {
            const dir = new THREE.Vector3(k * 0.08, 0, -1).normalize();
            projectiles.spawnAllyBolt(s.root.position.clone(), dir, s.id, 18);
          }
        }
        // Clear immediate ambush foes cleanly
        for (const e of enemies.enemies) {
          if (e.alive && e.mesh.position.z > -120) {
            enemies.damageEnemy(e, 28);
          }
        }
      }

      // Flare thrusters
      for (const s of [blitz, tank]) {
        for (const fl of s.thrusters) {
          fl.scale.set(1.2, 1.2, 2.2 + Math.sin(t * 36) * 0.35);
        }
      }
    }

    if (this.arrivalElapsed >= this.arrivalDuration) {
      this.arrivalActive = false;
      return true; // finished!
    }
    return false;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    enemies: EnemyFactory,
    projectiles: ProjectilePool,
    boss: BossController,
    difficultyDmgMult: number,
    cb: WingmanCallbacks
  ): void {
    if (!this.deployed || this.arrivalActive) return;
    this.age += dt;

    // Periodically assign an enemy bogey to chase one of the living wingmen (creating fun "SAVE ME!" moments!)
    const activePursuits = this.ships.filter((s) => s.alive && s.pursuer && s.pursuer.alive).length;
    if (activePursuits === 0 && !boss.dying) {
      this.pursuitSpawnTimer -= dt;
      if (this.pursuitSpawnTimer <= 0) {
        const aliveAllies = this.ships.filter((s) => s.alive && !s.ejected);
        const candidates = enemies.enemies.filter(
          (e) =>
            e.alive &&
            !e.pursuingAlly &&
            e.kind !== 'turret' &&
            e.mesh.position.z < -26 &&
            e.mesh.position.z > -135
        );
        if (aliveAllies.length > 0 && candidates.length > 0) {
          const targetAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
          const chaser = candidates[0];
          chaser.pursuingAlly = targetAlly.id;
          targetAlly.pursuer = chaser;
          targetAlly.helpCalledForPursuer = false;
          this.pursuitSpawnTimer = 14.5;
        } else {
          this.pursuitSpawnTimer = 2.0;
        }
      }
    }

    for (const s of this.ships) {
      // Animate ejected wingman peeling up & away cleanly
      if (s.ejected) {
        if (s.root.visible) {
          s.ejectTimer += dt;
          s.root.position.x += (s.id === 'blitz' ? -14 : 14) * dt;
          s.root.position.y += 9 * dt;
          s.root.position.z -= 18 * dt;
          s.mesh.rotation.z += dt * 7;
          if (Math.random() < 0.4) cb.onSpark(s.root.position.clone(), 0xff5511);
          if (s.ejectTimer > 2.4) s.root.visible = false;
        }
        continue;
      }

      if (!s.alive) continue;

      // Clean up dead/gone pursuer
      if (s.pursuer && !s.pursuer.alive) {
        s.pursuer = null;
        s.helpCalledForPursuer = false;
      }

      // Compute smooth flanking formation target ahead of player
      const waveX = Math.sin(this.age * (s.id === 'blitz' ? 1.55 : 1.1) + (s.id === 'blitz' ? 0 : 2.1)) * 2.6;
      const waveY = Math.cos(this.age * 1.25 + (s.id === 'blitz' ? 0 : 1.5)) * 1.3;
      const panicShakeX = s.pursuer ? Math.sin(this.age * 7.5) * 1.8 : 0;
      const desiredX = THREE.MathUtils.clamp(playerPos.x * 0.45 + s.baseX + waveX + panicShakeX, -10.5, 10.5);
      const desiredY = THREE.MathUtils.clamp(playerPos.y * 0.4 + s.baseY + waveY, -5.2, 5.5);
      const desiredZ = boss.active ? s.baseZ + 2.5 : s.baseZ;

      const prevX = s.root.position.x;
      s.root.position.x = THREE.MathUtils.lerp(s.root.position.x, desiredX, Math.min(1, dt * 3.4));
      s.root.position.y = THREE.MathUtils.lerp(s.root.position.y, desiredY, Math.min(1, dt * 3.4));
      s.root.position.z = THREE.MathUtils.lerp(s.root.position.z, desiredZ, Math.min(1, dt * 3.0));

      const vx = (s.root.position.x - prevX) / Math.max(0.001, dt);
      s.mesh.rotation.z = THREE.MathUtils.lerp(s.mesh.rotation.z, THREE.MathUtils.clamp(-vx * 0.055, -0.65, 0.65), dt * 8);
      s.mesh.rotation.x = THREE.MathUtils.lerp(s.mesh.rotation.x, (desiredY - s.root.position.y) * 0.06, dt * 6);

      // Thruster flicker
      const flZ = 1.15 + Math.sin(this.age * 32 + (s.id === 'blitz' ? 0 : 2)) * 0.22;
      for (const fl of s.thrusters) fl.scale.set(1, 1, flZ);

      // If pursued by a bogey, steer the bogey behind this ally so the player can shoot it down!
      if (s.pursuer && s.pursuer.alive) {
        const ch = s.pursuer;
        const chTargetX = s.root.position.x + Math.sin(this.age * 3.8) * 2.2;
        const chTargetY = s.root.position.y + 0.6 + Math.cos(this.age * 3.1) * 1.1;
        const chTargetZ = s.root.position.z - 12.5;
        ch.mesh.position.x = THREE.MathUtils.lerp(ch.mesh.position.x, chTargetX, Math.min(1, dt * 4.2));
        ch.mesh.position.y = THREE.MathUtils.lerp(ch.mesh.position.y, chTargetY, Math.min(1, dt * 4.2));
        ch.mesh.position.z = THREE.MathUtils.lerp(ch.mesh.position.z, chTargetZ, Math.min(1, dt * 3.5));
        ch.mesh.rotation.z = Math.sin(this.age * 5) * 0.45;

        // Once bogey gets close, ally calls for help & steadily takes damage until you rescue them!
        if (ch.mesh.position.z > -46) {
          if (!s.helpCalledForPursuer) {
            s.helpCalledForPursuer = true;
            cb.onNeedHelp(s.id, s.callsign);
          }
          const dps = 5.4 * Math.min(1.3, difficultyDmgMult);
          s.hp = Math.max(0, s.hp - dps * dt);
          s.damageSparkTimer -= dt;
          if (s.damageSparkTimer <= 0) {
            s.damageSparkTimer = 0.24;
            cb.onSpark(s.root.position.clone(), 0xff6622);
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

      // Passive light ambient wear during boss fights if boss is firing heavily
      if (boss.active && boss.sweepBeamActive) {
        s.hp = Math.max(12, s.hp - 1.2 * dt);
      }

      // Allied Firing AI: engage enemies ahead (never shooting own pursuer — that's the player's save!)
      s.fireCooldown -= dt;
      if (s.fireCooldown <= 0) {
        const target = this.pickTargetFor(s, enemies, boss);
        if (target) {
          const dir = target.clone().sub(s.root.position).normalize();
          const dmg = s.id === 'tank' ? 15 : 10;
          projectiles.spawnAllyBolt(s.root.position.clone(), dir, s.id, dmg);
          s.fireCooldown = s.id === 'blitz' ? 0.36 : 0.54;
        } else {
          s.fireCooldown = 0.25;
        }
      }

      if (s.healFlashTimer > 0) {
        s.healFlashTimer -= dt;
        if (Math.random() < 0.35) cb.onSpark(s.root.position.clone(), s.accentHex);
      }
    }
  }

  private pickTargetFor(
    ship: WingmanShip,
    enemies: EnemyFactory,
    boss: BossController
  ): THREE.Vector3 | null {
    // Prefer enemies ahead on their side of the corridor (not chasing them)
    let bestPos: THREE.Vector3 | null = null;
    let bestScore = Infinity;

    for (const e of enemies.enemies) {
      if (!e.alive) continue;
      if (e.pursuingAlly === ship.id) continue;
      if (e.mesh.position.z > ship.root.position.z - 10 || e.mesh.position.z < -145) continue;
      const dist = e.mesh.position.distanceTo(ship.root.position);
      // Slight lane bias so Blitz clears left & Tank clears right!
      const sidePenalty =
        (ship.id === 'blitz' && e.mesh.position.x > 4) || (ship.id === 'tank' && e.mesh.position.x < -4)
          ? 24
          : 0;
      if (dist + sidePenalty < bestScore) {
        bestScore = dist + sidePenalty;
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
