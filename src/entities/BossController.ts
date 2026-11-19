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
  hitFlashTimer: number;
  originalMats: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
}

const WHITE_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xffffff).multiplyScalar(3.6),
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
  public readonly root = new THREE.Group();
  public readonly parts: BossPart[] = [];

  // Dual-axis Sweeping Laser Beam (Horizontal or Vertical!)
  public sweepBeamActive = false;
  public sweepAxis: 'horizontal' | 'vertical' = 'horizontal';
  public sweepBeamPos = 0;
  private sweepBeamDir = 1;
  private sweepBeamMesh: THREE.Mesh | null = null;
  private sweepBeamTimer = 0;
  private sweepDuration = 2.0;

  // Telegraph Charge Orb before big attacks
  private chargeOrb: THREE.Mesh | null = null;
  private chargeTimer = 0;
  private pendingAttack: (() => void) | null = null;

  // Boss-specific animated sub-parts
  private blastDoorLeft: THREE.Mesh | null = null;
  private blastDoorRight: THREE.Mesh | null = null;
  private haloRings: THREE.Object3D[] = [];
  private serpentSegments: THREE.Object3D[] = [];

  private readonly scene: THREE.Scene;
  private age = 0;
  private attackTimer = 1.4;
  private spiralCounter = 0;
  private droneTimer = 4.5;
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
    this.age = 0;
    this.attackTimer = 1.4;
    this.spiralCounter = 0;
    this.droneTimer = 4.5;
    this.entered = false;
    this.sweepBeamActive = false;
    this.chargeTimer = 0;
    this.pendingAttack = null;

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

    // Telegraphing charge-up orb in front of boss core
    const chargeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd447).multiplyScalar(3.8),
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
      color: new THREE.Color(0xff2a85).multiplyScalar(3.6),
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
    isCore: boolean
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

  private buildAegisDreadnought(totalHp: number): void {
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x161d38,
      metalness: 0.65,
      roughness: 0.3,
      flatShading: true,
    });
    const darkArmor = new THREE.MeshStandardMaterial({
      color: 0x0c1022,
      metalness: 0.75,
      roughness: 0.25,
      flatShading: true,
    });
    const cyanTrim = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 3.0,
      flatShading: true,
    });
    const crimsonGlow = new THREE.MeshStandardMaterial({
      color: 0xff2a85,
      emissive: new THREE.Color(0xff2a85),
      emissiveIntensity: 3.5,
      flatShading: true,
    });
    const solarCore = new THREE.MeshStandardMaterial({
      color: 0xffd447,
      emissive: new THREE.Color(0xffaa00),
      emissiveIntensity: 4.0,
      flatShading: true,
    });

    // Colossal twin-deck battlecruiser chassis
    const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(22, 3.6, 9), hullMat);
    this.root.add(mainDeck);

    // Swept forward battle-wings
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

    // Armored command citadel tower
    const citadel = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.4, 5.2), darkArmor);
    citadel.position.set(0, 3.2, -0.8);
    this.root.add(citadel);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.55, 5.45), crimsonGlow);
    visor.position.set(0, 3.6, -0.7);
    this.root.add(visor);

    // Glowing ribs across hull
    const rib = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.35, 9.3), cyanTrim);
    this.root.add(rib);

    // Animated blast doors that slide open in Phase 2!
    const doorGeo = new THREE.BoxGeometry(3.2, 3.8, 1.0);
    this.blastDoorLeft = new THREE.Mesh(doorGeo, darkArmor);
    this.blastDoorLeft.position.set(-1.6, 0, 4.7);
    this.blastDoorRight = new THREE.Mesh(doorGeo, darkArmor);
    this.blastDoorRight.position.set(1.6, 0, 4.7);
    this.root.add(this.blastDoorLeft, this.blastDoorRight);

    // Spinning gyro halo behind boss
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(9.2, 0.28, 6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00f0ff).multiplyScalar(2.4), wireframe: true, toneMapped: false })
    );
    halo.position.set(0, 0, -4.5);
    this.root.add(halo);
    this.haloRings.push(halo);

    // 4 Articulated Wing Turrets (Phase 1)
    const turretHp = Math.round((totalHp * 0.45) / 4);
    const positions = [
      [-9.5, -0.8, 4.5],
      [-5.2, 1.9, 4.4],
      [5.2, 1.9, 4.4],
      [9.5, -0.8, 4.5],
    ];
    positions.forEach(([x, y, z], idx) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(x, y, z);
      const pod = new THREE.Mesh(new THREE.OctahedronGeometry(1.55, 0), crimsonGlow);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.22, 6, 8), darkArmor);
      const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.2, 6), cyanTrim);
      barrelL.rotation.x = Math.PI / 2;
      barrelL.position.set(-0.55, 0, 1.1);
      const barrelR = barrelL.clone();
      barrelR.position.x = 0.55;
      tGroup.add(pod, cage, barrelL, barrelR);
      this.root.add(tGroup);
      this.registerPart(`turret_${idx}`, tGroup, turretHp, 2.35, false);
    });

    // Central Singularity Reactor Core (Phase 2)
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0, 3.8);
    const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.45, 0), solarCore);
    const coreGyro = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.18, 6, 16), crimsonGlow);
    coreGroup.add(coreMesh, coreGyro);
    this.root.add(coreGroup);
    this.registerPart('reactor_core', coreGroup, Math.round(totalHp * 0.55), 3.1, true);
  }

  private buildOctaCoreSentinel(totalHp: number): void {
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x13223e,
      metalness: 0.7,
      roughness: 0.22,
      flatShading: true,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x00ffd5,
      emissive: new THREE.Color(0x00ffd5),
      emissiveIntensity: 3.3,
      flatShading: true,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xc84bff,
      emissive: new THREE.Color(0xc84bff),
      emissiveIntensity: 4.0,
      flatShading: true,
    });

    // Nested counter-rotating holographic god-halos
    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(10.5, 0.22, 6, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00ffd5).multiplyScalar(2.6), wireframe: true, toneMapped: false })
    );
    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(8.0, 0.25, 6, 20),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc84bff).multiplyScalar(2.8), wireframe: true, toneMapped: false })
    );
    this.root.add(halo1, halo2);
    this.haloRings.push(halo1, halo2);

    // Central crystalline eye core
    const coreGroup = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(3.8, 0), coreMat);
    const wire = new THREE.Mesh(
      new THREE.OctahedronGeometry(4.25, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00f0ff).multiplyScalar(2.6), wireframe: true, toneMapped: false })
    );
    coreGroup.add(core, wire);
    this.root.add(coreGroup);
    this.registerPart('sentinel_core', coreGroup, Math.round(totalHp * 0.55), 3.8, true);

    // 4 Heavy Orbiting Prism Shields
    const plateHp = Math.round((totalHp * 0.45) / 4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pGroup = new THREE.Group();
      pGroup.position.set(Math.cos(a) * 7.2, Math.sin(a) * 4.8, 2.4);
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.9, 6), plateMat);
      shield.rotation.x = Math.PI / 2;
      const glow = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 6, 6), edgeMat);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.4, 4), edgeMat);
      spike.rotation.x = Math.PI / 2;
      spike.position.z = 1.4;
      pGroup.add(shield, glow, spike);
      this.root.add(pGroup);
      this.registerPart(`shield_plate_${i}`, pGroup, plateHp, 2.6, false);
    }
  }

  private buildSolarisLeviathan(totalHp: number): void {
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x221712,
      metalness: 0.75,
      roughness: 0.22,
      flatShading: true,
    });
    const solarGlow = new THREE.MeshStandardMaterial({
      color: 0xffd447,
      emissive: new THREE.Color(0xffaa00),
      emissiveIntensity: 4.0,
      flatShading: true,
    });
    const crimsonPod = new THREE.MeshStandardMaterial({
      color: 0xff2a85,
      emissive: new THREE.Color(0xff2a85),
      emissiveIntensity: 3.6,
      flatShading: true,
    });

    // 7 Undulating Cyber-Serpent Spine Segments with Dorsal Fins!
    for (let s = 0; s < 7; s++) {
      const segGroup = new THREE.Group();
      segGroup.position.set(0, 0, -s * 4.6);
      const rad = Math.max(1.2, 3.1 - s * 0.28);
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(rad, 0), obsidianMat);
      body.scale.set(1.65, 0.95, 1.35);
      const fin = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.45, rad * 1.9, 3), solarGlow);
      fin.position.set(0, rad * 1.1, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.3, 0.14, 6, 12), s % 2 === 0 ? solarGlow : crimsonPod);
      segGroup.add(body, fin, ring);
      this.root.add(segGroup);
      this.serpentSegments.push(segGroup);
    }

    // Twin Sweeping Scythe Wings
    for (const side of [-1, 1]) {
      const scythe = new THREE.Mesh(new THREE.BoxGeometry(11, 0.55, 2.8), obsidianMat);
      scythe.position.set(side * 8.2, 0.5, -1.5);
      scythe.rotation.z = side * 0.22;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.2, 0.45), solarGlow);
      edge.position.set(side * 8.2, 0.5, 0.1);
      edge.rotation.z = side * 0.22;
      this.root.add(scythe, edge);
    }

    // 4 Crimson Flank Pods (Phase 1)
    const podHp = Math.round((totalHp * 0.45) / 4);
    const coords = [
      [-8.0, 2.5, 1.6],
      [8.0, 2.5, 1.6],
      [-8.0, -2.5, 1.6],
      [8.0, -2.5, 1.6],
    ];
    coords.forEach(([x, y, z], idx) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const pod = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 0), crimsonPod);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.18, 6, 10), solarGlow);
      g.add(pod, halo);
      this.root.add(g);
      this.registerPart(`flank_pod_${idx}`, g, podHp, 2.5, false);
    });

    // Solaris Maw Core (Phase 2)
    const coreG = new THREE.Group();
    coreG.position.set(0, 0, 3.6);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.8, 1), solarGlow);
    const mawRing = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.25, 6, 16), crimsonPod);
    coreG.add(core, mawRing);
    this.root.add(coreG);
    this.registerPart('solaris_core', coreG, Math.round(totalHp * 0.55), 3.4, true);
  }

  public getTargetableParts(): BossPart[] {
    if (!this.active) return [];
    const nonCoresAlive = this.parts.filter((p) => !p.isCore && p.alive);
    if (this.phase === 1 && nonCoresAlive.length > 0 && this.bossId !== 'octa_core_sentinel') {
      return nonCoresAlive;
    }
    return this.parts.filter((p) => p.alive);
  }

  public damagePart(
    part: BossPart,
    dmg: number
  ): { partDestroyed: boolean; phaseBreak: boolean; bossDefeated: boolean; pos: THREE.Vector3 } {
    const pos = new THREE.Vector3();
    part.getPosition(pos);

    if (!this.active || !part.alive) {
      return { partDestroyed: false, phaseBreak: false, bossDefeated: false, pos };
    }

    const nonCoresAlive = this.parts.some((p) => !p.isCore && p.alive);
    const actualDmg =
      part.isCore && nonCoresAlive && this.bossId !== 'octa_core_sentinel' ? dmg * 0.12 : dmg;

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
    }

    this.totalHp = this.parts.reduce((acc, p) => acc + Math.max(0, p.hp), 0);

    let phaseBreak = false;
    const allSubPartsDown = !this.parts.some((p) => !p.isCore && p.alive);
    if (this.phase === 1 && (allSubPartsDown || this.totalHp <= this.maxTotalHp * 0.52)) {
      this.phase = 2;
      phaseBreak = true;
      this.attackTimer = 0.9;
    }

    const core = this.parts.find((p) => p.isCore);
    const bossDefeated = this.totalHp <= 0 || (core !== undefined && !core.alive);
    if (bossDefeated) {
      this.active = false;
      this.sweepBeamActive = false;
      if (this.sweepBeamMesh) this.sweepBeamMesh.visible = false;
      this.scene.remove(this.root);
    }

    return { partDestroyed, phaseBreak, bossDefeated, pos };
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    projectiles: ProjectilePool,
    enemies: EnemyFactory,
    onTelegraph?: () => void
  ): void {
    if (!this.active) return;

    this.age += dt;

    // Dramatic entrance to Z = -52
    if (!this.entered) {
      this.root.position.z = THREE.MathUtils.lerp(this.root.position.z, -52, Math.min(1, dt * 2.5));
      if (this.root.position.z > -54) this.entered = true;
    } else {
      const ampX = this.phase === 2 ? 7.2 : 4.5;
      const ampY = this.phase === 2 ? 3.2 : 1.7;
      const speedX = this.phase === 2 ? 1.45 : 0.85;
      this.root.position.x = Math.sin(this.age * speedX) * ampX;
      this.root.position.y = 0.6 + Math.cos(this.age * 1.1) * ampY;
      this.root.rotation.z = Math.cos(this.age * speedX) * (this.phase === 2 ? 0.14 : 0.06);
    }

    // Animate blast doors sliding open in Phase 2 (Aegis Dreadnought)
    if (this.blastDoorLeft && this.blastDoorRight) {
      const targetX = this.phase === 2 ? 5.2 : 1.6;
      this.blastDoorLeft.position.x = THREE.MathUtils.lerp(this.blastDoorLeft.position.x, -targetX, dt * 3.5);
      this.blastDoorRight.position.x = THREE.MathUtils.lerp(this.blastDoorRight.position.x, targetX, dt * 3.5);
    }

    // Spin holographic halos
    this.haloRings.forEach((h, i) => {
      h.rotation.z += dt * (i % 2 === 0 ? 1.1 : -1.5) * (this.phase === 2 ? 1.8 : 1.0);
      h.rotation.y += dt * (i % 2 === 0 ? 0.45 : -0.6);
    });

    // Undulate Solaris Leviathan serpent spine in 3D!
    this.serpentSegments.forEach((seg, idx) => {
      if (idx === 0) return;
      seg.position.x = Math.sin(this.age * 3.2 - idx * 0.7) * (idx * 0.9);
      seg.position.y = Math.cos(this.age * 2.4 - idx * 0.6) * (idx * 0.45);
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

      if (this.bossId === 'octa_core_sentinel' && !p.isCore && p.alive) {
        const orbitSpeed = this.phase === 2 ? 2.2 : 1.15;
        const radiusX = this.phase === 2 ? 9.0 : 6.8;
        const radiusY = this.phase === 2 ? 5.6 : 4.5;
        const a = this.age * orbitSpeed + (i * Math.PI) / 2;
        p.mesh.position.set(Math.cos(a) * radiusX, Math.sin(a) * radiusY, 2.4);
        p.mesh.rotation.z = a;
      } else if (p.isCore && p.alive) {
        p.mesh.rotation.y += dt * (this.phase === 2 ? 4.2 : 1.5);
        p.mesh.rotation.x += dt * 1.1;
      }
    }

    // Telegraphing charge orb countdown
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

    // Sweeping laser beam update (Horizontal OR Vertical!)
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

    // Slightly harder, tighter multi-pattern attack cadence!
    this.attackTimer -= dt;
    if (this.attackTimer <= 0 && this.chargeTimer <= 0) {
      this.triggerBossAttack(playerPos, playerVel, projectiles, onTelegraph);
      this.attackTimer = this.phase === 2 ? 0.88 : 1.24;
    }

    // Escort reinforcements in Phase 2 for ALL bosses!
    if (this.phase === 2) {
      this.droneTimer -= dt;
      if (this.droneTimer <= 0) {
        this.droneTimer = this.bossId === 'solaris_leviathan' ? 4.2 : 5.0;
        const escortKind = this.bossId === 'aegis_dreadnought' ? 'scout' : 'interceptor';
        enemies.spawnSingle(escortKind, -9.5, 3.2, -105, 'swoop_pass', 1.15, 0);
        enemies.spawnSingle(escortKind, 9.5, -2.5, -105, 'swoop_pass', 1.15, 1.5);
      }
    }
  }

  private triggerBossAttack(
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    projectiles: ProjectilePool,
    onTelegraph?: () => void
  ): void {
    this.spiralCounter++;
    const origin = new THREE.Vector3();
    // Predict player position slightly for real challenge
    const leadPos = playerPos.clone().addScaledVector(playerVel, this.phase === 2 ? 0.32 : 0.16);

    // Every 3rd attack in Phase 2 (or 4th in Phase 1 for Leviathan): telegraphed Sweeping Laser Wall!
    const doSweep =
      !this.sweepBeamActive &&
      ((this.phase === 2 && this.spiralCounter % 3 === 0) ||
        (this.bossId === 'solaris_leviathan' && this.spiralCounter % 4 === 0));

    if (doSweep) {
      this.chargeTimer = 0.65;
      if (onTelegraph) onTelegraph();
      this.pendingAttack = () => {
        this.sweepBeamActive = true;
        this.sweepAxis = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        this.sweepBeamDir = Math.random() < 0.5 ? 1 : -1;
        this.sweepDuration = this.phase === 2 ? 1.55 : 1.9;
        this.sweepBeamTimer = this.sweepDuration;
      };
      return;
    }

    if (this.bossId === 'aegis_dreadnought') {
      if (this.phase === 1) {
        // Aimed volley from every alive turret + center spread
        for (const p of this.parts) {
          if (!p.alive || p.isCore) continue;
          p.getPosition(origin);
          const dir = new THREE.Vector3().subVectors(leadPos, origin).normalize();
          projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(72), 14, 0.92);
        }
      } else {
        // Phase 2: 5-shot fan + radial ring!
        const core = this.parts.find((p) => p.isCore);
        if (core) core.getPosition(origin);
        else this.root.getWorldPosition(origin);

        for (let k = -2; k <= 2; k++) {
          const target = leadPos.clone().add(new THREE.Vector3(k * 2.8, Math.abs(k) * 0.6, 0));
          const dir = target.sub(origin).normalize();
          projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(78), 15, 1.0);
        }
      }
      return;
    }

    if (this.bossId === 'octa_core_sentinel') {
      this.root.getWorldPosition(origin);
      const count = this.phase === 2 ? 14 : 9;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + this.age * 1.4;
        const vel = new THREE.Vector3(Math.cos(a) * 18, Math.sin(a) * 12, 66);
        projectiles.spawnEnemyPlasma(origin, vel, 14, 0.95);
      }
      // Plus twin high-speed aimed lances
      for (const offset of [-1.8, 1.8]) {
        const aimed = leadPos
          .clone()
          .add(new THREE.Vector3(offset, 0, 0))
          .sub(origin)
          .normalize()
          .multiplyScalar(86);
        projectiles.spawnEnemyPlasma(origin, aimed, 16, 1.05);
      }
      return;
    }

    // solaris_leviathan — brutal bullet-hell serpent!
    this.root.getWorldPosition(origin);
    if (this.phase === 1) {
      for (const p of this.parts) {
        if (!p.alive || p.isCore) continue;
        p.getPosition(origin);
        for (const spread of [-1.6, 1.6]) {
          const dir = leadPos.clone().add(new THREE.Vector3(spread, 0, 0)).sub(origin).normalize();
          projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(76), 15, 0.95);
        }
      }
    } else {
      // Spiral + 7-shot barrage (perfect for barrel-roll deflection!)
      for (let k = -3; k <= 3; k++) {
        const target = leadPos.clone().add(new THREE.Vector3(k * 2.2, Math.sin(k + this.age) * 1.8, 0));
        const dir = target.sub(origin).normalize();
        projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(82), 16, 1.05);
      }
    }
  }

  public clear(): void {
    this.active = false;
    this.sweepBeamActive = false;
    this.chargeTimer = 0;
    this.pendingAttack = null;
    this.blastDoorLeft = null;
    this.blastDoorRight = null;
    this.haloRings = [];
    this.serpentSegments = [];
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
