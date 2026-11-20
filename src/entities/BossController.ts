import * as THREE from 'three';
import type { BossEvent, BossId } from '../levels/LevelSchema';
import type { HomingTarget, ProjectilePool } from './ProjectilePool';
import type { EnemyFactory } from './EnemyFactory';

export interface BossPart extends HomingTarget {
  id: number;
  name: string;
  mesh: THREE.Object3D;
  hp: number;
  maxHp: number;
  radius: number;
  alive: boolean;
  isCore: boolean;
  isReflectShield?: boolean; // Octa-Core Sentinel prism shields (block normal shots, shatter on reflected shots!)
  isSerpentSegment?: boolean; // Solaris Leviathan body segments
  hitFlashTimer: number;
  originalMats: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

const WHITE_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xffffff).multiplyScalar(3.4),
  toneMapped: false,
});

const SHIELD_BLOCK_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x00f0ff).multiplyScalar(2.8),
  wireframe: true,
  toneMapped: false,
});

let nextPartId = 50000;

export class BossController {
  public active = false;
  public bossId: BossId = 'aegis_dreadnought';
  public displayName = '';
  public phase = 1;
  public maxPhases = 2;
  public totalHp = 0;
  public maxTotalHp = 950;
  public fightElapsedSec = 0;
  public readonly root = new THREE.Group();
  public readonly parts: BossPart[] = [];

  // Sweeping Laser Beam
  public sweepBeamActive = false;
  public sweepAxis: 'horizontal' | 'vertical' = 'horizontal';
  public sweepBeamPos = 0;
  private sweepBeamDir = 1;
  private sweepBeamMesh: THREE.Mesh | null = null;
  private sweepBeamTimer = 0;
  private sweepDuration = 2.0;

  // Telegraph Charge Orb
  private chargeOrb: THREE.Mesh | null = null;
  private chargeTimer = 0;
  private pendingAttack: (() => void) | null = null;

  // Boss-specific animated visual elements
  private blastDoorLeft: THREE.Mesh | null = null;
  private blastDoorRight: THREE.Mesh | null = null;
  private coreShieldDome: THREE.Mesh | null = null; // Aegis core shield projected by the 2 wing turrets
  private haloRings: THREE.Object3D[] = [];
  private serpentSegments: THREE.Object3D[] = [];
  private serpentMats: THREE.MeshStandardMaterial[] = [];
  private destroyedSegmentsCount = 0;

  private readonly scene: THREE.Scene;
  private age = 0;
  private attackTimer = 1.4;
  private spiralCounter = 0;
  private droneTimer = 5.0;
  private entered = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawn(ev: BossEvent): void {
    this.clear();
    this.active = true;
    this.bossId = ev.bossId;
    this.displayName = ev.name;
    this.phase = 1;
    this.maxPhases = ev.phases;
    this.maxTotalHp = ev.hp;
    this.totalHp = ev.hp;
    this.fightElapsedSec = 0;
    this.age = 0;
    this.attackTimer = 1.4;
    this.spiralCounter = 0;
    this.droneTimer = 5.0;
    this.entered = false;
    this.sweepBeamActive = false;
    this.chargeTimer = 0;
    this.pendingAttack = null;
    this.destroyedSegmentsCount = 0;

    this.root.position.set(0, 2.0, -185);
    this.root.rotation.set(0, 0, 0);
    this.scene.add(this.root);

    if (ev.bossId === 'aegis_dreadnought') {
      this.buildAegisDreadnought(ev.hp);
    } else if (ev.bossId === 'octa_core_sentinel') {
      this.buildOctaCoreSentinel(ev.hp);
    } else {
      this.buildSolarisLeviathan(ev.hp);
    }

    // Telegraphing charge-up orb
    const chargeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd447).multiplyScalar(3.4),
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    this.chargeOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), chargeMat);
    this.chargeOrb.position.set(0, 0, 5.2);
    this.chargeOrb.visible = false;
    this.root.add(this.chargeOrb);

    // Sweeping beam mesh
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff2a55).multiplyScalar(3.2),
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    });
    this.sweepBeamMesh = new THREE.Mesh(new THREE.BoxGeometry(36, 1.15, 95), beamMat);
    this.sweepBeamMesh.visible = false;
    this.scene.add(this.sweepBeamMesh);
  }

  private registerPart(
    name: string,
    mesh: THREE.Object3D,
    hp: number,
    radius: number,
    isCore: boolean,
    extras?: { isReflectShield?: boolean; isSerpentSegment?: boolean }
  ): BossPart {
    const originalMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        originalMats.set(obj, obj.material);
      }
    });
    const part: BossPart = {
      id: nextPartId++,
      name,
      mesh,
      hp,
      maxHp: hp,
      radius,
      alive: true,
      isCore,
      isReflectShield: extras?.isReflectShield,
      isSerpentSegment: extras?.isSerpentSegment,
      hitFlashTimer: 0,
      originalMats,
      getPosition(out: THREE.Vector3) {
        mesh.getWorldPosition(out);
        return out;
      },
    };
    this.parts.push(part);
    return part;
  }

  /**
   * SECTOR 1 — AEGIS DREADNOUGHT
   * Two heavy destructible wing turrets (Left/Right) projecting a glowing shield dome over the core.
   * Core takes 25% damage until BOTH wing turrets are destroyed, then opens for 100% damage + horizontal sweeping laser!
   */
  private buildAegisDreadnought(totalHp: number): void {
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x263152,
      metalness: 0.55,
      roughness: 0.32,
      flatShading: true,
    });
    const darkArmor = new THREE.MeshStandardMaterial({
      color: 0x11172b,
      metalness: 0.65,
      roughness: 0.28,
      flatShading: true,
    });
    const cyanTrim = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 2.6,
      flatShading: true,
    });
    const crimsonGlow = new THREE.MeshStandardMaterial({
      color: 0xff3344,
      emissive: new THREE.Color(0xff2a55),
      emissiveIntensity: 3.0,
      flatShading: true,
    });
    const solarCore = new THREE.MeshStandardMaterial({
      color: 0xffd447,
      emissive: new THREE.Color(0xffaa00),
      emissiveIntensity: 3.6,
      flatShading: true,
    });

    // Twin-deck battlecruiser hull
    const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(22, 3.6, 9), hullMat);
    this.root.add(mainDeck);

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.4, 7.5), darkArmor);
      wing.position.set(side * 12.2, -0.4, 1.8);
      wing.rotation.z = side * -0.18;
      wing.rotation.y = side * 0.28;
      this.root.add(wing);

      const blade = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7.5, 4), cyanTrim);
      blade.rotation.x = Math.PI / 2;
      blade.position.set(side * 15.2, -0.8, 5.2);
      this.root.add(blade);
    }

    const citadel = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.4, 5.2), darkArmor);
    citadel.position.set(0, 3.2, -0.8);
    this.root.add(citadel);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.55, 5.45), crimsonGlow);
    visor.position.set(0, 3.6, -0.7);
    this.root.add(visor);

    const rib = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.35, 9.3), cyanTrim);
    this.root.add(rib);

    // Animated blast doors
    const doorGeo = new THREE.BoxGeometry(3.2, 3.8, 1.0);
    this.blastDoorLeft = new THREE.Mesh(doorGeo, darkArmor);
    this.blastDoorLeft.position.set(-1.6, 0, 4.7);
    this.blastDoorRight = new THREE.Mesh(doorGeo, darkArmor);
    this.blastDoorRight.position.set(1.6, 0, 4.7);
    this.root.add(this.blastDoorLeft, this.blastDoorRight);

    // Glowing Core Shield Dome projected by the two wing turrets!
    this.coreShieldDome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.4, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x00f0ff).multiplyScalar(1.8),
        wireframe: true,
        transparent: true,
        opacity: 0.72,
        toneMapped: false,
      })
    );
    this.coreShieldDome.position.set(0, 0, 3.8);
    this.root.add(this.coreShieldDome);

    // TWO Heavy Destructible Wing Turrets (Left & Right)
    const turretHp = Math.round((totalHp * 0.44) / 2);
    const turretCoords = [
      [-9.2, 0.4, 4.8],
      [9.2, 0.4, 4.8],
    ];
    turretCoords.forEach(([x, y, z], idx) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(x, y, z);
      const pod = new THREE.Mesh(new THREE.OctahedronGeometry(1.9, 0), crimsonGlow);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.28, 6, 8), darkArmor);
      const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.8, 6), cyanTrim);
      barrelL.rotation.x = Math.PI / 2;
      barrelL.position.set(-0.75, 0, 1.3);
      const barrelR = barrelL.clone();
      barrelR.position.x = 0.75;
      // Visible energy tether beam connecting turret to central core shield
      const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 8.8, 6), cyanTrim);
      tether.rotation.z = Math.PI / 2;
      tether.position.set(x > 0 ? -4.5 : 4.5, -0.2, -0.6);
      tGroup.add(pod, cage, barrelL, barrelR, tether);
      this.root.add(tGroup);
      this.registerPart(`wing_turret_${idx}`, tGroup, turretHp, 2.75, false);
    });

    // Central Singularity Core
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0, 3.8);
    const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.55, 0), solarCore);
    const coreGyro = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.2, 6, 16), crimsonGlow);
    coreGroup.add(coreMesh, coreGyro);
    this.root.add(coreGroup);
    this.registerPart('reactor_core', coreGroup, Math.round(totalHp * 0.56), 3.1, true);
  }

  /**
   * SECTOR 2 — OCTA-CORE SENTINEL
   * 4 rotating wireframe prism shields that BLOCK normal shots.
   * Thread shots through the gaps to hit the core OR barrel-roll reflect its charged plasma orbs to SHATTER the shields!
   */
  private buildOctaCoreSentinel(totalHp: number): void {
    const wireShieldMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00ffd5).multiplyScalar(2.4),
      wireframe: true,
      toneMapped: false,
    });
    const innerPlateMat = new THREE.MeshStandardMaterial({
      color: 0x132844,
      transparent: true,
      opacity: 0.72,
      metalness: 0.7,
      roughness: 0.2,
      flatShading: true,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xc84bff,
      emissive: new THREE.Color(0xc84bff),
      emissiveIntensity: 3.6,
      flatShading: true,
    });

    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(10.8, 0.2, 6, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00ffd5).multiplyScalar(1.9), wireframe: true, toneMapped: false })
    );
    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(8.2, 0.22, 6, 20),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc84bff).multiplyScalar(2.0), wireframe: true, toneMapped: false })
    );
    this.root.add(halo1, halo2);
    this.haloRings.push(halo1, halo2);

    // Central Octa-Core (vulnerable through gaps in the rotating prism shields!)
    const coreGroup = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(3.8, 0), coreMat);
    const wire = new THREE.Mesh(
      new THREE.OctahedronGeometry(4.25, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd447).multiplyScalar(2.4), wireframe: true, toneMapped: false })
    );
    coreGroup.add(core, wire);
    this.root.add(coreGroup);
    this.registerPart('sentinel_core', coreGroup, Math.round(totalHp * 0.7), 3.9, true);

    // 4 Rotating Wireframe Prism Shields (block normal shots; shatter on reflected plasma orbs!)
    const shieldHp = Math.round((totalHp * 0.3) / 4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pGroup = new THREE.Group();
      pGroup.position.set(Math.cos(a) * 6.8, Math.sin(a) * 4.6, 3.0);
      const prismGeo = new THREE.CylinderGeometry(2.7, 2.7, 1.1, 6);
      prismGeo.rotateX(Math.PI / 2);
      const plate = new THREE.Mesh(prismGeo, innerPlateMat);
      const wireFrame = new THREE.Mesh(prismGeo, wireShieldMat);
      wireFrame.scale.setScalar(1.06);
      pGroup.add(plate, wireFrame);
      this.root.add(pGroup);
      this.registerPart(`prism_shield_${i}`, pGroup, shieldHp, 2.85, false, {
        isReflectShield: true,
      });
    }
  }

  /**
   * SECTOR 3 — SOLARIS LEVIATHAN
   * 7-segment glowing cyber-serpent weaving in a 3D Figure-8 through the Hyper-Grid tunnel!
   * Destroying body segments speeds it up and shifts its color phase; Head becomes vulnerable once 4+ segments are destroyed!
   */
  private buildSolarisLeviathan(totalHp: number): void {
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x261a14,
      metalness: 0.7,
      roughness: 0.25,
      flatShading: true,
    });

    // Head Core (Segment 0 — invulnerable until 4+ body segments are destroyed!)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffd447,
      emissive: new THREE.Color(0xffaa00),
      emissiveIntensity: 3.4,
      flatShading: true,
    });
    this.serpentMats.push(headMat);

    const headGroup = new THREE.Group();
    const headBody = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 1), headMat);
    const headCrown = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.26, 6, 16), obsidianMat);
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.2, 4), headMat);
    hornL.position.set(-2.6, 2.0, 0.8);
    hornL.rotation.z = 0.55;
    const hornR = hornL.clone();
    hornR.position.x = 2.6;
    hornR.rotation.z = -0.55;
    headGroup.add(headBody, headCrown, hornL, hornR);
    this.root.add(headGroup);
    this.serpentSegments.push(headGroup);
    this.registerPart('solaris_head', headGroup, Math.round(totalHp * 0.42), 3.5, true);

    // 6 Destructible Body Segments (Segments 1..6)
    const segHp = Math.round((totalHp * 0.58) / 6);
    for (let s = 1; s <= 6; s++) {
      const segGlow = new THREE.MeshStandardMaterial({
        color: 0xff6622,
        emissive: new THREE.Color(0xff4411),
        emissiveIntensity: 2.9,
        flatShading: true,
      });
      this.serpentMats.push(segGlow);

      const segGroup = new THREE.Group();
      const rad = Math.max(1.6, 2.85 - s * 0.18);
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(rad, 0), obsidianMat);
      body.scale.set(1.4, 1.0, 1.25);
      const coreNode = new THREE.Mesh(new THREE.IcosahedronGeometry(rad * 0.72, 0), segGlow);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.25, 0.16, 6, 12), segGlow);
      segGroup.add(body, coreNode, ring);
      this.root.add(segGroup);
      this.serpentSegments.push(segGroup);
      this.registerPart(`serpent_seg_${s}`, segGroup, segHp, rad * 1.2, false, {
        isSerpentSegment: true,
      });
    }
  }

  public getTargetableParts(): BossPart[] {
    if (!this.active) return [];
    if (this.bossId === 'aegis_dreadnought') {
      const turrets = this.parts.filter((p) => !p.isCore && p.alive);
      return turrets.length > 0 ? turrets : this.parts.filter((p) => p.alive);
    }
    if (this.bossId === 'octa_core_sentinel') {
      return this.parts.filter((p) => p.isCore && p.alive);
    }
    // Solaris Leviathan: target body segments until 4+ destroyed, then head!
    const segs = this.parts.filter((p) => p.isSerpentSegment && p.alive);
    if (this.destroyedSegmentsCount < 4 && segs.length > 0) {
      return segs;
    }
    return this.parts.filter((p) => p.alive);
  }

  public damagePart(
    part: BossPart,
    dmg: number,
    isReflected = false
  ): {
    partDestroyed: boolean;
    phaseBreak: boolean;
    bossDefeated: boolean;
    blocked: boolean;
    shatteredShield: boolean;
    pos: THREE.Vector3;
  } {
    const pos = new THREE.Vector3();
    part.getPosition(pos);

    if (!this.active || !part.alive) {
      return {
        partDestroyed: false,
        phaseBreak: false,
        bossDefeated: false,
        blocked: false,
        shatteredShield: false,
        pos,
      };
    }

    // SECTOR 2 MECHANIC: Octa-Core Sentinel Prism Shields BLOCK normal shots, SHATTER on reflected orbs!
    if (part.isReflectShield) {
      if (!isReflected) {
        part.hitFlashTimer = 0.08;
        part.mesh.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.material = SHIELD_BLOCK_MAT;
        });
        return {
          partDestroyed: false,
          phaseBreak: false,
          bossDefeated: false,
          blocked: true,
          shatteredShield: false,
          pos,
        };
      }
      // Reflected shot SHATTERS the prism shield immediately!
      part.hp = 0;
      part.alive = false;
      part.mesh.visible = false;
      this.totalHp = this.parts.reduce((acc, p) => acc + Math.max(0, p.hp), 0);
      const shieldsLeft = this.parts.filter((p) => p.isReflectShield && p.alive).length;
      const phaseBreak = this.phase === 1 && shieldsLeft <= 2;
      if (phaseBreak) this.phase = 2;
      return {
        partDestroyed: true,
        phaseBreak,
        bossDefeated: false,
        blocked: false,
        shatteredShield: true,
        pos,
      };
    }

    // SECTOR 3 MECHANIC: Solaris Leviathan Head is armored until 4+ body segments are destroyed!
    if (this.bossId === 'solaris_leviathan' && part.isCore && this.destroyedSegmentsCount < 4) {
      part.hitFlashTimer = 0.06;
      part.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.material = SHIELD_BLOCK_MAT;
      });
      return {
        partDestroyed: false,
        phaseBreak: false,
        bossDefeated: false,
        blocked: true,
        shatteredShield: false,
        pos,
      };
    }

    // SECTOR 1 MECHANIC: Aegis Core takes 25% damage until BOTH wing turrets are destroyed!
    let actualDmg = dmg;
    if (this.bossId === 'aegis_dreadnought' && part.isCore) {
      const turretsAlive = this.parts.some((p) => !p.isCore && p.alive);
      if (turretsAlive) {
        actualDmg = dmg * 0.25;
      }
    }

    part.hp = Math.max(0, part.hp - actualDmg);
    part.hitFlashTimer = 0.055;
    part.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.material = WHITE_MAT;
    });

    let partDestroyed = false;
    if (part.hp <= 0) {
      part.alive = false;
      part.mesh.visible = false;
      partDestroyed = true;
      if (part.isSerpentSegment) {
        this.destroyedSegmentsCount += 1;
        this.shiftLeviathanColorPhase();
      }
    }

    this.totalHp = this.parts.reduce((acc, p) => acc + Math.max(0, p.hp), 0);

    // Phase 2 transition logic per boss
    let phaseBreak = false;
    if (this.phase === 1) {
      if (this.bossId === 'aegis_dreadnought') {
        const turretsAlive = this.parts.some((p) => !p.isCore && p.alive);
        if (!turretsAlive) {
          this.phase = 2;
          phaseBreak = true;
          if (this.coreShieldDome) this.coreShieldDome.visible = false;
          this.attackTimer = 0.85;
        }
      } else if (this.bossId === 'octa_core_sentinel') {
        if (this.totalHp <= this.maxTotalHp * 0.55) {
          this.phase = 2;
          phaseBreak = true;
          this.attackTimer = 0.85;
        }
      } else if (this.bossId === 'solaris_leviathan') {
        if (this.destroyedSegmentsCount >= 4) {
          this.phase = 2;
          phaseBreak = true;
          this.attackTimer = 0.8;
        }
      }
    }

    const core = this.parts.find((p) => p.isCore);
    const bossDefeated = this.totalHp <= 0 || (core !== undefined && !core.alive);
    if (bossDefeated) {
      this.active = false;
      this.sweepBeamActive = false;
      if (this.sweepBeamMesh) this.sweepBeamMesh.visible = false;
      this.scene.remove(this.root);
    }

    return {
      partDestroyed,
      phaseBreak,
      bossDefeated,
      blocked: false,
      shatteredShield: false,
      pos,
    };
  }

  private shiftLeviathanColorPhase(): void {
    // Shift serpent emissive color as segments are destroyed: Gold -> Crimson -> Blazing Magenta-White!
    const t = Math.min(1, this.destroyedSegmentsCount / 4);
    const c = new THREE.Color('#ff6622').lerp(new THREE.Color('#ff11aa'), t);
    for (const m of this.serpentMats) {
      m.emissive.copy(c);
      m.emissiveIntensity = 3.0 + t * 1.4;
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    projectiles: ProjectilePool,
    enemies: EnemyFactory,
    aggressionMult = 1.0,
    bulletDensityMult = 1.0,
    onTelegraph?: () => void
  ): void {
    if (!this.active) return;

    this.age += dt;
    this.fightElapsedSec += dt;

    // Entrance to Z = -52
    if (!this.entered) {
      this.root.position.z = THREE.MathUtils.lerp(this.root.position.z, -52, Math.min(1, dt * 2.5));
      if (this.root.position.z > -54) this.entered = true;
    } else if (this.bossId === 'solaris_leviathan') {
      // SECTOR 3: Dramatic Figure-8 Lissajous weave accelerating with every destroyed body segment!
      const speedScale = (1 + this.destroyedSegmentsCount * 0.14) * aggressionMult;
      const t = this.age * 0.95 * speedScale;
      this.root.position.x = Math.sin(t) * 8.6;
      this.root.position.y = Math.sin(t * 2) * 3.8;
      this.root.rotation.z = Math.cos(t) * 0.22;

      // Trailing body segments follow the Figure-8 path with phase lag!
      for (let s = 1; s < this.serpentSegments.length; s++) {
        const seg = this.serpentSegments[s];
        const lag = t - s * 0.36;
        const targetX = Math.sin(lag) * 8.6 - this.root.position.x;
        const targetY = Math.sin(lag * 2) * 3.8 - this.root.position.y;
        seg.position.set(targetX, targetY, -s * 4.4);
        seg.rotation.z = Math.cos(lag) * 0.5;
      }
    } else {
      const ampX = this.phase === 2 ? 7.0 : 4.4;
      const ampY = this.phase === 2 ? 3.0 : 1.6;
      const speedX = (this.phase === 2 ? 1.4 : 0.85) * aggressionMult;
      this.root.position.x = Math.sin(this.age * speedX) * ampX;
      this.root.position.y = 0.6 + Math.cos(this.age * 1.05) * ampY;
      this.root.rotation.z = Math.cos(this.age * speedX) * (this.phase === 2 ? 0.14 : 0.06);
    }

    // Aegis Dreadnought: blast doors & core shield dome
    if (this.blastDoorLeft && this.blastDoorRight) {
      const targetX = this.phase === 2 ? 5.2 : 1.6;
      this.blastDoorLeft.position.x = THREE.MathUtils.lerp(this.blastDoorLeft.position.x, -targetX, dt * 3.5);
      this.blastDoorRight.position.x = THREE.MathUtils.lerp(this.blastDoorRight.position.x, targetX, dt * 3.5);
    }
    if (this.coreShieldDome && this.coreShieldDome.visible) {
      this.coreShieldDome.rotation.y += dt * 1.4;
      this.coreShieldDome.rotation.x += dt * 0.9;
    }

    // Spin holographic halos
    this.haloRings.forEach((h, i) => {
      h.rotation.z += dt * (i % 2 === 0 ? 1.1 : -1.5) * (this.phase === 2 ? 1.8 : 1.0);
      h.rotation.y += dt * (i % 2 === 0 ? 0.45 : -0.6);
    });

    // Animate parts & restore hit flashes
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.hitFlashTimer > 0) {
        p.hitFlashTimer -= dt;
        if (p.hitFlashTimer <= 0) {
          p.originalMats.forEach((mat, mesh) => {
            mesh.material = mat;
          });
        }
      }

      if (this.bossId === 'octa_core_sentinel' && p.isReflectShield && p.alive) {
        const orbitSpeed = (this.phase === 2 ? 1.85 : 1.05) * aggressionMult;
        const radiusX = 6.6;
        const radiusY = 4.6;
        const a = this.age * orbitSpeed + (i * Math.PI) / 2;
        p.mesh.position.set(Math.cos(a) * radiusX, Math.sin(a) * radiusY, 3.0);
        p.mesh.rotation.z = a;
      } else if (p.isCore && p.alive) {
        p.mesh.rotation.y += dt * (this.phase === 2 ? 4.0 : 1.4);
        p.mesh.rotation.x += dt * 1.0;
      }
    }

    // Telegraphing charge orb
    if (this.chargeTimer > 0 && this.chargeOrb) {
      this.chargeTimer -= dt;
      this.chargeOrb.visible = true;
      const pulse = 0.6 + (1 - this.chargeTimer / 0.65) * 1.9 + Math.sin(this.age * 35) * 0.2;
      this.chargeOrb.scale.setScalar(pulse);
      if (this.chargeTimer <= 0) {
        this.chargeOrb.visible = false;
        const fn = this.pendingAttack;
        this.pendingAttack = null;
        if (fn) fn();
      }
    }

    // Sweeping laser beam update
    if (this.sweepBeamActive && this.sweepBeamMesh) {
      this.sweepBeamTimer -= dt;
      const prog = 1 - this.sweepBeamTimer / this.sweepDuration;
      if (this.sweepAxis === 'horizontal') {
        const startY = this.sweepBeamDir > 0 ? -7.2 : 7.2;
        this.sweepBeamPos = THREE.MathUtils.lerp(startY, -startY, prog);
        this.sweepBeamMesh.rotation.z = 0;
        this.sweepBeamMesh.scale.set(1, 1, 1);
        this.sweepBeamMesh.position.set(0, this.sweepBeamPos, -22);
      } else {
        const startX = this.sweepBeamDir > 0 ? -12.5 : 12.5;
        this.sweepBeamPos = THREE.MathUtils.lerp(startX, -startX, prog);
        this.sweepBeamMesh.rotation.z = Math.PI / 2;
        this.sweepBeamMesh.scale.set(0.65, 1.1, 1);
        this.sweepBeamMesh.position.set(this.sweepBeamPos, 0, -22);
      }
      this.sweepBeamMesh.visible = true;
      if (this.sweepBeamTimer <= 0) {
        this.sweepBeamActive = false;
        this.sweepBeamMesh.visible = false;
      }
    }

    if (!this.entered) return;

    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && this.chargeTimer <= 0) {
      this.triggerBossAttack(playerPos, playerVel, projectiles, bulletDensityMult, onTelegraph);
      const baseCd = this.phase === 2 ? 0.92 : 1.28;
      const leviathanBonus =
        this.bossId === 'solaris_leviathan' ? Math.max(0.62, 1 - this.destroyedSegmentsCount * 0.08) : 1;
      this.attackTimer = (baseCd * leviathanBonus) / aggressionMult;
    }

    if (this.phase === 2) {
      this.droneTimer -= dt;
      if (this.droneTimer <= 0) {
        this.droneTimer = 5.4 / aggressionMult;
        const escortKind = this.bossId === 'aegis_dreadnought' ? 'scout' : 'interceptor';
        enemies.spawnSingle(escortKind, -9.5, 3.2, -105, 'swoop_pass', 1.0 * aggressionMult, 0);
        enemies.spawnSingle(escortKind, 9.5, -2.5, -105, 'swoop_pass', 1.0 * aggressionMult, 1.5);
      }
    }
  }

  private triggerBossAttack(
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    projectiles: ProjectilePool,
    bulletDensityMult: number,
    onTelegraph?: () => void
  ): void {
    this.spiralCounter++;
    const origin = new THREE.Vector3();
    const leadPos = playerPos.clone().addScaledVector(playerVel, this.phase === 2 ? 0.3 : 0.14);

    // Aegis Dreadnought Phase 2: ALWAYS horizontal sweeping laser to dodge vertically!
    const doSweep =
      !this.sweepBeamActive &&
      ((this.bossId === 'aegis_dreadnought' && this.phase === 2 && this.spiralCounter % 2 === 0) ||
        (this.bossId === 'solaris_leviathan' && this.phase === 2 && this.spiralCounter % 3 === 0));

    if (doSweep) {
      this.chargeTimer = 0.65;
      if (onTelegraph) onTelegraph();
      this.pendingAttack = () => {
        this.sweepBeamActive = true;
        this.sweepAxis = this.bossId === 'aegis_dreadnought' ? 'horizontal' : Math.random() < 0.5 ? 'horizontal' : 'vertical';
        this.sweepBeamDir = Math.random() < 0.5 ? 1 : -1;
        this.sweepDuration = this.phase === 2 ? 1.65 : 2.0;
        this.sweepBeamTimer = this.sweepDuration;
      };
      return;
    }

    if (this.bossId === 'aegis_dreadnought') {
      if (this.phase === 1) {
        for (const p of this.parts) {
          if (!p.alive || p.isCore) continue;
          p.getPosition(origin);
          const count = bulletDensityMult >= 1.5 ? 3 : 2;
          for (let k = 0; k < count; k++) {
            const spread = (k - (count - 1) / 2) * 2.2;
            const dir = leadPos.clone().add(new THREE.Vector3(spread, 0, 0)).sub(origin).normalize();
            projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(70), 14, 0.92);
          }
        }
      } else {
        const core = this.parts.find((p) => p.isCore);
        if (core) core.getPosition(origin);
        else this.root.getWorldPosition(origin);
        const half = bulletDensityMult >= 1.5 ? 3 : 2;
        for (let k = -half; k <= half; k++) {
          const target = leadPos.clone().add(new THREE.Vector3(k * 2.6, Math.abs(k) * 0.5, 0));
          const dir = target.sub(origin).normalize();
          projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(76), 15, 1.0);
        }
      }
      return;
    }

    if (this.bossId === 'octa_core_sentinel') {
      this.root.getWorldPosition(origin);
      // Fires big bright charged plasma orbs ideal for barrel-roll reflection into its prism shields!
      const aimed = leadPos.clone().sub(origin).normalize().multiplyScalar(68);
      projectiles.spawnEnemyPlasma(origin, aimed, 16, 1.2);

      const ringCount = Math.round((this.phase === 2 ? 11 : 7) * bulletDensityMult);
      for (let i = 0; i < ringCount; i++) {
        const a = (i / ringCount) * Math.PI * 2 + this.age * 1.4;
        const vel = new THREE.Vector3(Math.cos(a) * 16, Math.sin(a) * 11, 62);
        projectiles.spawnEnemyPlasma(origin, vel, 13, 0.92);
      }
      return;
    }

    // Solaris Leviathan: fires from head + alive body segments!
    this.root.getWorldPosition(origin);
    const fanHalf = this.phase === 2 ? (bulletDensityMult >= 1.5 ? 3 : 2) : 1;
    for (let k = -fanHalf; k <= fanHalf; k++) {
      const target = leadPos.clone().add(new THREE.Vector3(k * 2.4, Math.sin(k + this.age) * 1.6, 0));
      const dir = target.sub(origin).normalize();
      projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(78), 15, 1.0);
    }
  }

  public clear(): void {
    this.active = false;
    this.sweepBeamActive = false;
    this.chargeTimer = 0;
    this.pendingAttack = null;
    this.blastDoorLeft = null;
    this.blastDoorRight = null;
    this.coreShieldDome = null;
    this.haloRings = [];
    this.serpentSegments = [];
    this.serpentMats = [];
    this.chargeOrb = null;
    this.scene.remove(this.root);
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
    if (this.sweepBeamMesh) {
      this.scene.remove(this.sweepBeamMesh);
      this.sweepBeamMesh = null;
    }
    this.parts.length = 0;
  }
}
