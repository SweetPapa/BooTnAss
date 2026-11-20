import * as THREE from 'three';
import type { EnemyKind, WaveEvent } from '../levels/LevelSchema';
import type { HomingTarget, ProjectilePool } from './ProjectilePool';

let nextEnemyId = 1;

export interface EnemyEntity extends HomingTarget {
  id: number;
  kind: EnemyKind;
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  radius: number;
  scoreValue: number;
  alive: boolean;
  behavior: WaveEvent['behavior'];
  fireRate: number;
  fireTimer: number;
  age: number;
  phaseOffset: number;
  baseX: number;
  baseY: number;
  speedZ: number;
  hitFlashTimer: number;
  originalMats: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

const WHITE_FLASH_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xffffff).multiplyScalar(2.8),
  toneMapped: false,
});

export class EnemyFactory {
  public readonly enemies: EnemyEntity[] = [];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnWave(wave: WaveEvent, hpMult = 1.0): void {
    const count = wave.count;
    // Synchronized squadron phase so the entire formation moves as one crisp, organized unit!
    const squadronPhase = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const offset = this.computeFormationOffset(wave.formation, i, count);
      const startX = THREE.MathUtils.clamp(wave.spawnOffset.x + offset.x, -11.5, 11.5);
      const startY = THREE.MathUtils.clamp(wave.spawnOffset.y + offset.y, -6.0, 6.0);
      const startZ = -170 - offset.z;

      // Organized staggered firing so squadrons open fire quickly in crisp volleys
      const entity = this.spawnSingle(
        wave.enemy,
        startX,
        startY,
        startZ,
        wave.behavior,
        wave.fireRate,
        squadronPhase + (wave.formation === 'spiral' ? i * 0.45 : 0),
        hpMult
      );
      entity.fireTimer = wave.fireRate > 0 ? 0.75 + i * 0.22 : 999;
    }
  }

  public spawnSingle(
    kind: EnemyKind,
    x: number,
    y: number,
    z: number,
    behavior: WaveEvent['behavior'],
    fireRate: number,
    phaseOffset = 0,
    hpMult = 1.0
  ): EnemyEntity {
    const { group, hp: baseHp, radius, scoreValue, speedZ } = this.buildMesh(kind);
    const hp = Math.round(baseHp * hpMult);
    group.position.set(x, y, z);
    this.scene.add(group);

    const originalMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        originalMats.set(obj, obj.material);
      }
    });

    const entity: EnemyEntity = {
      id: nextEnemyId++,
      kind,
      mesh: group,
      hp,
      maxHp: hp,
      radius,
      scoreValue,
      alive: true,
      behavior,
      fireRate,
      fireTimer: fireRate > 0 ? 0.9 : 999,
      age: 0,
      phaseOffset,
      baseX: x,
      baseY: y,
      speedZ,
      hitFlashTimer: 0,
      originalMats,
      getPosition(out: THREE.Vector3) {
        return out.copy(group.position);
      },
    };

    this.enemies.push(entity);
    return entity;
  }

  private computeFormationOffset(
    formation: WaveEvent['formation'],
    i: number,
    count: number
  ): { x: number; y: number; z: number } {
    const center = (count - 1) / 2;
    const d = i - center;
    switch (formation) {
      case 'line':
        // Crisp horizontal firing wall
        return { x: d * 3.6, y: 0, z: 0 };
      case 'v_shape':
        // Classic V-echelon attack formation
        return { x: d * 3.2, y: -Math.abs(d) * 0.45, z: Math.abs(d) * 6.5 };
      case 'spiral': {
        const angle = (i / Math.max(1, count)) * Math.PI * 2;
        return { x: Math.cos(angle) * 4.8, y: Math.sin(angle) * 3.0, z: i * 5.5 };
      }
      case 'flanking': {
        // Organized twin pincer columns (left wing + right wing)
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        return { x: side * 6.2, y: (row - 1) * 2.2, z: row * 9 };
      }
    }
  }

  private buildMesh(kind: EnemyKind): {
    group: THREE.Group;
    hp: number;
    radius: number;
    scoreValue: number;
    speedZ: number;
  } {
    const group = new THREE.Group();

    // High-contrast bright titanium-silver hull + blazing orange-red weak cores
    // so every enemy silhouette POPS unmistakably against the dark space/canyon!
    const brightArmor = new THREE.MeshStandardMaterial({
      color: 0xe2ebff,
      metalness: 0.25,
      roughness: 0.35,
      flatShading: true,
    });
    const crimsonPlate = new THREE.MeshStandardMaterial({
      color: 0xcc1e3d,
      metalness: 0.3,
      roughness: 0.3,
      flatShading: true,
    });
    const coreGlow = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 2.2,
      flatShading: true,
    });
    const yellowEye = new THREE.MeshStandardMaterial({
      color: 0xffe033,
      emissive: new THREE.Color(0xffcc00),
      emissiveIntensity: 2.2,
      flatShading: true,
    });

    if (kind === 'scout') {
      // Crisp bright dart fighter with crimson delta wings
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.1, 4), brightArmor);
      body.rotation.x = Math.PI / 2;
      body.rotation.z = Math.PI / 4;
      group.add(body);

      const wing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 1.05), crimsonPlate);
      wing.position.set(0, 0, -0.2);
      group.add(wing);

      const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), yellowEye);
      eye.position.set(0, 0.22, 0.85);
      group.add(eye);

      return { group, hp: 28, radius: 1.7, scoreValue: 150, speedZ: 29 };
    }

    if (kind === 'weaver') {
      // High-contrast white/crimson twin-blade craft
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), coreGlow);
      core.scale.set(0.9, 0.7, 1.5);
      group.add(core);

      const finL = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.0, 3), brightArmor);
      finL.rotation.z = Math.PI / 2;
      finL.position.set(-1.95, 0, 0);
      group.add(finL);

      const finR = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.0, 3), brightArmor);
      finR.rotation.z = -Math.PI / 2;
      finR.position.set(1.95, 0, 0);
      group.add(finR);

      return { group, hp: 44, radius: 2.0, scoreValue: 250, speedZ: 25 };
    }

    if (kind === 'turret') {
      // Bold armored white hex-ring gun platform with glowing orange center
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.42, 6, 6), brightArmor);
      group.add(ring);

      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), coreGlow);
      group.add(core);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.7, 6), crimsonPlate);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, 1.0);
      group.add(barrel);

      return { group, hp: 75, radius: 2.25, scoreValue: 350, speedZ: 16 };
    }

    // interceptor — striking forward-swept crimson & white ace
    const hull = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), brightArmor);
    hull.scale.set(1.25, 0.6, 2.4);
    group.add(hull);

    const wingGeo = new THREE.BoxGeometry(2.2, 0.16, 0.75);
    const wl = new THREE.Mesh(wingGeo, crimsonPlate);
    wl.position.set(-1.85, 0, 0.65);
    wl.rotation.y = 0.55;
    group.add(wl);

    const wr = new THREE.Mesh(wingGeo, crimsonPlate);
    wr.position.set(1.85, 0, 0.65);
    wr.rotation.y = -0.55;
    group.add(wr);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), yellowEye);
    core.position.set(0, 0.3, 0.5);
    group.add(core);

    return { group, hp: 58, radius: 2.1, scoreValue: 400, speedZ: 35 };
  }

  public damageEnemy(enemy: EnemyEntity, amount: number): boolean {
    if (!enemy.alive) return false;
    enemy.hp -= amount;
    enemy.hitFlashTimer = 0.055;
    enemy.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = WHITE_FLASH_MAT;
      }
    });

    if (enemy.hp <= 0) {
      enemy.alive = false;
      this.scene.remove(enemy.mesh);
      return true;
    }
    return false;
  }

  public update(
    dt: number,
    railSpeed: number,
    playerPos: THREE.Vector3,
    projectiles: ProjectilePool,
    fireRateMult = 1.0,
    projSpeedMult = 1.0,
    damageMult = 1.0
  ): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        this.enemies.splice(i, 1);
        continue;
      }

      e.age += dt;

      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        if (e.hitFlashTimer <= 0) {
          e.originalMats.forEach((mat, mesh) => {
            mesh.material = mat;
          });
        }
      }

      const pos = e.mesh.position;
      if (e.behavior === 'straight') {
        pos.z += (e.speedZ + railSpeed * 0.28) * dt;
      } else if (e.behavior === 'sine_weave') {
        // Synchronized smooth squadron sine wave
        pos.z += (e.speedZ + railSpeed * 0.28) * dt;
        pos.x = e.baseX + Math.sin(e.age * 2.4 + e.phaseOffset) * 3.8;
        pos.y = e.baseY + Math.cos(e.age * 1.7 + e.phaseOffset) * 1.6;
        e.mesh.rotation.z = Math.cos(e.age * 2.4 + e.phaseOffset) * 0.36;
      } else if (e.behavior === 'swoop_pass') {
        // Aggressive coordinated bank toward player flight lane
        pos.z += (e.speedZ + railSpeed * 0.34) * dt;
        if (pos.z > -95 && pos.z < -20) {
          pos.x += (playerPos.x * 0.65 - pos.x) * dt * 0.68;
          pos.y += (playerPos.y * 0.65 - pos.y) * dt * 0.68;
        }
        e.mesh.rotation.z = Math.sin(e.age * 2.8 + e.phaseOffset) * 0.3;
      } else if (e.behavior === 'hover_fire') {
        // Holds aggressive firing line at Z = -52
        if (pos.z < -52) {
          pos.z += (e.speedZ + railSpeed * 0.5) * dt;
        } else if (e.age > 8.5) {
          pos.z += (e.speedZ + railSpeed * 0.58) * dt;
        } else {
          pos.x = e.baseX + Math.sin(e.age * 1.65 + e.phaseOffset) * 2.2;
          pos.y = e.baseY + Math.sin(e.age * 1.2 + e.phaseOffset) * 1.1;
        }
      }

      if (e.kind === 'turret') {
        e.mesh.rotation.z += dt * 1.9;
      }

      if (e.fireRate > 0 && pos.z > -140 && pos.z < -20) {
        e.fireTimer -= dt * fireRateMult;
        if (e.fireTimer <= 0) {
          e.fireTimer = 1 / e.fireRate;
          const baseSpeed = e.kind === 'interceptor' ? 74 : 62;
          const shotSpeed = baseSpeed * projSpeedMult;
          const shotDmg = Math.round(12 * damageMult);

          if (e.kind === 'turret') {
            // Clean 3-way turret spread fan on ACE/MAX (twin spread on ROOKIE)
            const fan = fireRateMult >= 1.15 ? [-1, 0, 1] : [-0.8, 0.8];
            for (const k of fan) {
              const target = playerPos.clone().add(new THREE.Vector3(k * 3.1, 0, 0));
              const dir = target.sub(pos).normalize();
              projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(shotSpeed), shotDmg, 0.88);
            }
          } else if (e.kind === 'interceptor') {
            // Twin rapid interceptor bolts
            for (const side of [-1, 1]) {
              const target = playerPos.clone().add(new THREE.Vector3(side * 1.4, 0, 0));
              const dir = target.sub(pos).normalize();
              projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(shotSpeed), shotDmg, 0.84);
            }
          } else {
            const dir = new THREE.Vector3().subVectors(playerPos, pos).normalize();
            projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(shotSpeed), shotDmg, 0.86);
          }
        }
      }

      // Cull before camera near-plane frustum (camera z=14)
      if (pos.z > 10.0) {
        e.alive = false;
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
      }
    }
  }

  public clear(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.mesh);
    }
    this.enemies.length = 0;
  }
}
