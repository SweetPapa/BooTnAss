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
  isReflectShield?: boolean;
  isSerpentSegment?: boolean;
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
  public dying = false;
  public bossId: BossId = 'aegis_dreadnought';
  public displayName = '';
  public phase = 1;
  public maxPhases = 2;
  public totalHp = 0;
  public maxTotalHp = 950;
  public fightElapsedSec = 0;
  public phaseShiftInvulnTimer = 0;
  public readonly root = new THREE.Group();
  public readonly parts: BossPart[] = [];

  // Signature Laser Hazards: Horizontal Sweep, Vertical Sweep, or Rotating X-Cross Cage!
  public sweepBeamActive = false;
  public sweepAxis: 'horizontal' | 'vertical' | 'cross' = 'horizontal';
  public sweepBeamPos = 0;
  public sweepCrossAngle = 0;
  private sweepBeamDir = 1;
  private sweepBeamGroup: THREE.Group | null = null;
  private sweepBar1: THREE.Mesh | null = null;
  private sweepBar2: THREE.Mesh | null = null;
  private sweepBeamTimer = 0;
  private sweepDuration = 2.0;

  // Crisp 0.65s Visual Warning Sightline + Charge Orb before mega-attacks!
  private chargeOrb: THREE.Mesh | null = null;
  private telegraphLine: THREE.Mesh | null = null;
  private chargeTimer = 0;
  private pendingAttack: (() => void) | null = null;

  // Boss-specific articulated visual elements
  private blastDoorLeft: THREE.Mesh | null = null;
  private blastDoorRight: THREE.Mesh | null = null;
  private coreShieldDome: THREE.Mesh | null = null;
  private phaseShiftDome: THREE.Mesh | null = null;
  private coreLight: THREE.PointLight | null = null;
  private aegisTurrets: THREE.Object3D[] = [];
  private aegisThrusters: THREE.Mesh[] = [];
  private sentinelEye: THREE.Object3D | null = null;
  private haloRings: THREE.Object3D[] = [];
  private serpentSegments: THREE.Object3D[] = [];
  private serpentMats: THREE.MeshStandardMaterial[] = [];
  private leviathanUpperJaw: THREE.Object3D | null = null;
  private leviathanLowerJaw: THREE.Object3D | null = null;
  private destroyedSegmentsCount = 0;
  private sparkTimer = 0;
  private deathTimer = 0;
  private deathBoomTimer = 0;

  private readonly scene: THREE.Scene;
  private age = 0;
  private attackTimer = 1.4;
  private attackPatternIdx = 0;
  private droneTimer = 5.2;
  private entered = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawn(ev: BossEvent, hpMult = 1.0): void {
    this.clear();
    const scaledHp = Math.round(ev.hp * hpMult);
    this.active = true;
    this.dying = false;
    this.deathTimer = 0;
    this.deathBoomTimer = 0;
    this.bossId = ev.bossId;
    this.displayName = ev.name;
    this.phase = 1;
    this.maxPhases = ev.phases;
    this.maxTotalHp = scaledHp;
    this.totalHp = scaledHp;
    this.fightElapsedSec = 0;
    this.phaseShiftInvulnTimer = 0;
    this.age = 0;
    this.attackTimer = 0.85;
    this.attackPatternIdx = 0;
    this.droneTimer = 4.5;
    this.entered = false;
    this.sweepBeamActive = false;
    this.chargeTimer = 0;
    this.pendingAttack = null;
    this.destroyedSegmentsCount = 0;
    this.sparkTimer = 0;

    this.root.position.set(0, 2.0, -185);
    this.root.rotation.set(0, 0, 0);
    this.scene.add(this.root);

    // Dynamic PointLight on Boss Core so it illuminates its own armor & nearby space!
    const lightCol =
      ev.bossId === 'aegis_dreadnought'
        ? 0x00f0ff
        : ev.bossId === 'octa_core_sentinel'
          ? 0xc84bff
          : 0xffaa00;
    this.coreLight = new THREE.PointLight(lightCol, 12, 48);
    this.coreLight.position.set(0, 0, 6);
    this.root.add(this.coreLight);

    if (ev.bossId === 'aegis_dreadnought') {
      this.buildAegisDreadnought(scaledHp);
    } else if (ev.bossId === 'octa_core_sentinel') {
      this.buildOctaCoreSentinel(scaledHp);
    } else {
      this.buildSolarisLeviathan(scaledHp);
    }

    // Telegraphing charge-up orb
    const chargeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd447).multiplyScalar(3.4),
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    });
    this.chargeOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), chargeMat);
    this.chargeOrb.position.set(0, 0, 5.4);
    this.chargeOrb.visible = false;
    this.root.add(this.chargeOrb);

    // Thin pulsing warning laser sightline (length 56 centered at z=-24: Boss -52 -> +4, safely 10 units in front of camera!)
    const teleMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd447).multiplyScalar(2.6),
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
      depthWrite: false,
    });
    this.telegraphLine = new THREE.Mesh(new THREE.BoxGeometry(36, 0.2, 56), teleMat);
    this.telegraphLine.visible = false;
    this.scene.add(this.telegraphLine);

    // Dual-bar Laser Group (runs cleanly from Boss z=-52 through Player z=0 to z=+4, NEVER slicing into camera lens!)
    this.sweepBeamGroup = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff2a55).multiplyScalar(3.0),
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      depthWrite: false,
    });
    const coreBeamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffffff).multiplyScalar(2.6),
      toneMapped: false,
    });

    this.sweepBar1 = new THREE.Mesh(new THREE.BoxGeometry(36, 1.05, 56), beamMat);
    const inner1 = new THREE.Mesh(new THREE.BoxGeometry(36, 0.34, 56.2), coreBeamMat);
    this.sweepBar1.add(inner1);

    this.sweepBar2 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 24, 56), beamMat);
    const inner2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 24, 56.2), coreBeamMat);
    this.sweepBar2.add(inner2);
    this.sweepBar2.visible = false;

    this.sweepBeamGroup.add(this.sweepBar1, this.sweepBar2);
    this.sweepBeamGroup.visible = false;
    this.scene.add(this.sweepBeamGroup);
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
   * Armored twin-deck orbital battlecruiser with glowing bridge spire, side sponsons,
   * twin ion exhausts, 2 player-tracking wing turrets projecting a double Core Shield Dome!
   */
  private buildAegisDreadnought(totalHp: number): void {
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x2a375c,
      metalness: 0.6,
      roughness: 0.3,
      flatShading: true,
    });
    const darkArmor = new THREE.MeshStandardMaterial({
      color: 0x121930,
      metalness: 0.7,
      roughness: 0.25,
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
    const wireTrim = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00f0ff).multiplyScalar(1.3),
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });

    // Main armored carrier chassis + subtle wireframe edge definition
    const mainGeo = new THREE.BoxGeometry(22, 3.8, 9.5);
    const mainDeck = new THREE.Mesh(mainGeo, hullMat);
    const mainWire = new THREE.Mesh(mainGeo, wireTrim);
    mainWire.scale.setScalar(1.01);
    this.root.add(mainDeck, mainWire);

    // Swept forward heavy battle-wings + armored sponsons + plasma blades + rear ion thrusters
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.5, 8.0), darkArmor);
      wing.position.set(side * 12.6, -0.4, 1.8);
      wing.rotation.z = side * -0.18;
      wing.rotation.y = side * 0.28;
      this.root.add(wing);

      const sponson = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 6.2), hullMat);
      sponson.position.set(side * 14.5, -0.5, 2.4);
      this.root.add(sponson);

      const blade = new THREE.Mesh(new THREE.ConeGeometry(1.4, 8.2, 4), cyanTrim);
      blade.rotation.x = Math.PI / 2;
      blade.position.set(side * 15.8, -0.8, 5.8);
      this.root.add(blade);

      // Pulsing ion thruster flames on flanks
      const flame = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.2, 6), cyanTrim);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(side * 8.2, -0.6, -6.4);
      this.root.add(flame);
      this.aegisThrusters.push(flame);
    }

    // Command Citadel Tower + Sensor Spire Antenna + Glowing Red Visor
    const citadel = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.6, 5.4), darkArmor);
    citadel.position.set(0, 3.4, -0.8);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.65, 5.65), crimsonGlow);
    visor.position.set(0, 3.8, -0.7);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 4.5, 4), cyanTrim);
    spire.position.set(0, 7.0, -1.2);
    const dish = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.14, 6, 12), cyanTrim);
    dish.position.set(0, 5.8, -1.2);
    dish.rotation.x = Math.PI / 2;
    this.root.add(citadel, visor, spire, dish);
    this.haloRings.push(dish);

    // Glowing hull ribs
    const rib = new THREE.Mesh(new THREE.BoxGeometry(22.6, 0.38, 9.8), cyanTrim);
    this.root.add(rib);

    // Animated blast doors
    const doorGeo = new THREE.BoxGeometry(3.4, 4.0, 1.1);
    this.blastDoorLeft = new THREE.Mesh(doorGeo, darkArmor);
    this.blastDoorLeft.position.set(-1.7, 0, 4.9);
    this.blastDoorRight = new THREE.Mesh(doorGeo, darkArmor);
    this.blastDoorRight.position.set(1.7, 0, 4.9);
    this.root.add(this.blastDoorLeft, this.blastDoorRight);

    // Double-layered glowing Core Shield Dome projected by the 2 Wing Turrets
    this.coreShieldDome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.6, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x00f0ff).multiplyScalar(1.9),
        wireframe: true,
        transparent: true,
        opacity: 0.78,
        toneMapped: false,
      })
    );
    this.coreShieldDome.position.set(0, 0, 3.8);
    this.root.add(this.coreShieldDome);

    // TWO Heavy Articulated Wing Turrets (Left & Right) that track the player!
    const turretHp = Math.round((totalHp * 0.44) / 2);
    const turretCoords = [
      [-9.2, 0.4, 4.8],
      [9.2, 0.4, 4.8],
    ];
    turretCoords.forEach(([x, y, z], idx) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(x, y, z);

      const swivel = new THREE.Group();
      const pod = new THREE.Mesh(new THREE.OctahedronGeometry(2.0, 0), crimsonGlow);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.3, 6, 8), darkArmor);
      const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 3.4, 6), cyanTrim);
      barrelL.rotation.x = Math.PI / 2;
      barrelL.position.set(-0.85, 0, 1.6);
      const barrelR = barrelL.clone();
      barrelR.position.x = 0.85;
      swivel.add(pod, cage, barrelL, barrelR);
      this.aegisTurrets.push(swivel);

      // Visible energy tether beam connecting turret to central core shield
      const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 8.8, 6), cyanTrim);
      tether.rotation.z = Math.PI / 2;
      tether.position.set(x > 0 ? -4.5 : 4.5, -0.2, -0.6);

      tGroup.add(swivel, tether);
      this.root.add(tGroup);
      this.registerPart(`wing_turret_${idx}`, tGroup, turretHp, 2.8, false);
    });

    // Central Double-Gyro Singularity Core
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0, 3.8);
    const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), solarCore);
    const coreGyro1 = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.22, 6, 16), crimsonGlow);
    const coreGyro2 = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.16, 6, 16), cyanTrim);
    coreGyro2.rotation.x = Math.PI / 2;
    coreGroup.add(coreMesh, coreGyro1, coreGyro2);
    this.root.add(coreGroup);
    this.haloRings.push(coreGyro1, coreGyro2);
    this.registerPart('reactor_core', coreGroup, Math.round(totalHp * 0.56), 3.15, true);
  }

  /**
   * SECTOR 2 — OCTA-CORE SENTINEL
   * Sacred-geometry cosmic god-machine with triple counter-rotating halos, floating crystal obelisks,
   * player-tracking central Iris Eye, and 4 rotating wireframe prism shields that shatter on reflected orbs!
   */
  private buildOctaCoreSentinel(totalHp: number): void {
    const wireShieldMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00ffd5).multiplyScalar(2.4),
      wireframe: true,
      toneMapped: false,
    });
    const innerPlateMat = new THREE.MeshStandardMaterial({
      color: 0x162d4f,
      transparent: true,
      opacity: 0.74,
      metalness: 0.7,
      roughness: 0.2,
      flatShading: true,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xc84bff,
      emissive: new THREE.Color(0xc84bff),
      emissiveIntensity: 3.4,
      flatShading: true,
    });
    const irisMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff2a55).multiplyScalar(3.2),
      toneMapped: false,
    });

    // Triple nested counter-rotating sacred-geometry halos!
    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(11.6, 0.22, 6, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00ffd5).multiplyScalar(1.9), wireframe: true, toneMapped: false })
    );
    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(9.0, 0.24, 6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc84bff).multiplyScalar(2.1), wireframe: true, toneMapped: false })
    );
    const halo3 = new THREE.Mesh(
      new THREE.TorusGeometry(6.2, 0.16, 6, 18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd447).multiplyScalar(2.1), wireframe: true, toneMapped: false })
    );
    this.root.add(halo1, halo2, halo3);
    this.haloRings.push(halo1, halo2, halo3);

    // Floating corner crystal obelisks framing the Sentinel
    const obeliskMat = new THREE.MeshStandardMaterial({
      color: 0x1a2040,
      emissive: new THREE.Color(0x00ffd5),
      emissiveIntensity: 0.8,
      flatShading: true,
    });
    for (const [ox, oy] of [
      [-10.5, 6.2],
      [10.5, 6.2],
      [-10.5, -6.2],
      [10.5, -6.2],
    ]) {
      const ob = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), obeliskMat);
      ob.scale.set(0.7, 2.2, 0.7);
      ob.position.set(ox, oy, -2.5);
      this.root.add(ob);
      this.haloRings.push(ob);
    }

    // Central Octa-Core + Player-Tracking Crimson Iris Eye!
    const coreGroup = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(3.8, 0), coreMat);
    const wire = new THREE.Mesh(
      new THREE.OctahedronGeometry(4.3, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd447).multiplyScalar(2.2), wireframe: true, toneMapped: false })
    );
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(0, 0, 2.9);
    const pupil = new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 1), irisMat);
    const irisRing = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.18, 6, 16), wireShieldMat);
    eyeGroup.add(pupil, irisRing);
    this.sentinelEye = eyeGroup;

    coreGroup.add(core, wire, eyeGroup);
    this.root.add(coreGroup);
    this.registerPart('sentinel_core', coreGroup, Math.round(totalHp * 0.7), 3.95, true);

    // Phase-Shift Invulnerability Dome (flashes bright cyan-magenta for 1.5s between Phase 1 & Phase 2!)
    this.phaseShiftDome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5.8, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x00ffd5).multiplyScalar(2.4),
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
      })
    );
    this.phaseShiftDome.visible = false;
    this.root.add(this.phaseShiftDome);

    // 4 Rotating Wireframe Prism Shields (block normal shots; shatter on reflected plasma orbs!)
    const shieldHp = Math.round((totalHp * 0.3) / 4);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pGroup = new THREE.Group();
      pGroup.position.set(Math.cos(a) * 6.8, Math.sin(a) * 4.6, 3.0);
      const prismGeo = new THREE.CylinderGeometry(2.75, 2.75, 1.1, 6);
      prismGeo.rotateX(Math.PI / 2);
      const plate = new THREE.Mesh(prismGeo, innerPlateMat);
      const wireFrame = new THREE.Mesh(prismGeo, wireShieldMat);
      wireFrame.scale.setScalar(1.06);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.2, 4), wireShieldMat);
      spike.rotation.x = Math.PI / 2;
      spike.position.z = 1.4;
      pGroup.add(plate, wireFrame, spike);
      this.root.add(pGroup);
      this.registerPart(`prism_shield_${i}`, pGroup, shieldHp, 2.9, false, {
        isReflectShield: true,
      });
    }
  }

  /**
   * SECTOR 3 — SOLARIS LEVIATHAN
   * 7-segment articulated cyber-dragon serpent with snapping jaws, sweeping dorsal energy fins,
   * and 6 destructible glowing segments weaving in a 3D Figure-8!
   */
  private buildSolarisLeviathan(totalHp: number): void {
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x2a1d16,
      metalness: 0.7,
      roughness: 0.25,
      flatShading: true,
    });
    const eyeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xff1144).multiplyScalar(3.2),
      toneMapped: false,
    });

    // Articulated Cyber-Dragon Head Core (Segment 0 — invulnerable until 4+ body segments destroyed!)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffd447,
      emissive: new THREE.Color(0xffaa00),
      emissiveIntensity: 3.4,
      flatShading: true,
    });
    this.serpentMats.push(headMat);

    const headGroup = new THREE.Group();
    const throatCore = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), headMat);
    const headCrown = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.26, 6, 16), obsidianMat);

    // Animated Upper & Lower Snapping Plasma Jaws!
    const upperJaw = new THREE.Group();
    const uPlate = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.4, 4.6), obsidianMat);
    uPlate.position.set(0, 1.8, 1.6);
    const eyeL = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), eyeMat);
    eyeL.position.set(-1.9, 2.2, 3.6);
    const eyeR = eyeL.clone();
    eyeR.position.x = 1.9;
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.8, 4), headMat);
    hornL.position.set(-2.8, 3.4, -0.2);
    hornL.rotation.z = 0.55;
    hornL.rotation.x = -0.35;
    const hornR = hornL.clone();
    hornR.position.x = 2.8;
    hornR.rotation.z = -0.55;
    upperJaw.add(uPlate, eyeL, eyeR, hornL, hornR);
    this.leviathanUpperJaw = upperJaw;

    const lowerJaw = new THREE.Group();
    const lPlate = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 4.2), obsidianMat);
    lPlate.position.set(0, -1.8, 1.6);
    const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 4), headMat);
    fangL.position.set(-1.5, -1.0, 3.4);
    const fangR = fangL.clone();
    fangR.position.x = 1.5;
    lowerJaw.add(lPlate, fangL, fangR);
    this.leviathanLowerJaw = lowerJaw;

    headGroup.add(throatCore, headCrown, upperJaw, lowerJaw);
    this.root.add(headGroup);
    this.serpentSegments.push(headGroup);
    this.registerPart('solaris_head', headGroup, Math.round(totalHp * 0.42), 3.65, true);

    // 6 Destructible Armored Body Segments with Dorsal Fins & Side Thruster Blades
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
      const rad = Math.max(1.65, 2.95 - s * 0.18);
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(rad, 0), obsidianMat);
      body.scale.set(1.45, 1.0, 1.25);
      const coreNode = new THREE.Mesh(new THREE.IcosahedronGeometry(rad * 0.74, 0), segGlow);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.28, 0.18, 6, 12), segGlow);
      const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.35, rad * 1.9, 3), segGlow);
      dorsalFin.position.set(0, rad * 1.25, 0);
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(rad * 1.4, 0.22, rad * 0.7), obsidianMat);
      wingL.position.set(-rad * 1.5, 0, 0);
      const wingR = wingL.clone();
      wingR.position.x = rad * 1.5;

      segGroup.add(body, coreNode, ring, dorsalFin, wingL, wingR);
      this.root.add(segGroup);
      this.serpentSegments.push(segGroup);
      this.registerPart(`serpent_seg_${s}`, segGroup, segHp, rad * 1.22, false, {
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
    const segs = this.parts.filter((p) => p.isSerpentSegment && p.alive);
    if (this.destroyedSegmentsCount < 4 && segs.length > 0) {
      return segs;
    }
    return this.parts.filter((p) => p.alive);
  }

  public getReflectTargetParts(): BossPart[] {
    if (!this.active) return [];
    if (this.bossId === 'octa_core_sentinel') {
      const shields = this.parts.filter((p) => p.isReflectShield && p.alive);
      if (shields.length > 0) return shields;
    }
    return this.getTargetableParts();
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

    // Phase-Shift Invulnerability Window (e.g. Octa-Core Sentinel 1.5s Phase 1 -> Phase 2 barrier!)
    if (this.phaseShiftInvulnTimer > 0) {
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

    // SECTOR 2: Octa-Core Sentinel Prism Shields block normal shots, SHATTER on reflected orbs!
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
      part.hp = 0;
      part.alive = false;
      part.mesh.visible = false;
      this.attackTimer = Math.max(this.attackTimer, 1.35);
      this.totalHp = this.parts.reduce((acc, p) => acc + Math.max(0, p.hp), 0);
      const shieldsLeft = this.parts.filter((p) => p.isReflectShield && p.alive).length;
      const phaseBreak = this.phase === 1 && shieldsLeft <= 2;
      if (phaseBreak) {
        this.phase = 2;
        this.phaseShiftInvulnTimer = 1.5;
        this.attackTimer = Math.max(this.attackTimer, 1.55);
        if (this.coreLight) this.coreLight.color.setHex(0xff2a85);
      }
      return {
        partDestroyed: true,
        phaseBreak,
        bossDefeated: false,
        blocked: false,
        shatteredShield: true,
        pos,
      };
    }

    // SECTOR 3: Solaris Leviathan Head is armored until 4+ body segments are destroyed!
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

    // SECTOR 1: Aegis Core takes 25% damage until BOTH wing turrets are destroyed!
    let actualDmg = dmg;
    if (this.bossId === 'aegis_dreadnought' && part.isCore) {
      const turretsAlive = this.parts.some((p) => !p.isCore && p.alive);
      if (turretsAlive) actualDmg = dmg * 0.25;
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
      // Stagger boss briefly when a weak point / segment is destroyed!
      this.attackTimer = Math.max(this.attackTimer, 1.35);
      if (part.isSerpentSegment) {
        this.destroyedSegmentsCount += 1;
        this.shiftLeviathanColorPhase();
      }
    }

    this.totalHp = this.parts.reduce((acc, p) => acc + Math.max(0, p.hp), 0);

    let phaseBreak = false;
    if (this.phase === 1) {
      if (this.bossId === 'aegis_dreadnought') {
        if (!this.parts.some((p) => !p.isCore && p.alive)) {
          this.phase = 2;
          phaseBreak = true;
          // 1.5s phase-shift invulnerability window as blast doors open + guarantee immediate laser sweep!
          this.phaseShiftInvulnTimer = 1.5;
          this.attackPatternIdx = 2; // next attack increments to 3 => triggers telegraphed laser sweep!
          this.attackTimer = 1.55;
          if (this.coreShieldDome) {
            this.coreShieldDome.visible = true;
            (this.coreShieldDome.material as THREE.MeshBasicMaterial).color.setHex(0xffaa00).multiplyScalar(2.4);
          }
          if (this.coreLight) this.coreLight.color.setHex(0xffaa00);
        }
      } else if (this.bossId === 'octa_core_sentinel') {
        if (this.totalHp <= this.maxTotalHp * 0.55) {
          this.phase = 2;
          phaseBreak = true;
          this.phaseShiftInvulnTimer = 1.5;
          this.attackTimer = Math.max(this.attackTimer, 1.55);
          if (this.coreLight) this.coreLight.color.setHex(0xff2a85);
        }
      } else if (this.bossId === 'solaris_leviathan') {
        if (this.destroyedSegmentsCount >= 4) {
          this.phase = 2;
          phaseBreak = true;
          if (this.coreLight) this.coreLight.color.setHex(0xff22aa);
          this.attackTimer = 0.8;
        }
      }
    }

    const core = this.parts.find((p) => p.isCore);
    const bossDefeated = this.totalHp <= 0 || (core !== undefined && !core.alive);
    if (bossDefeated) {
      this.active = false;
      this.dying = true;
      // Full 2.7s dramatic chain-reaction meltdown so the villain finishes its defeat line!
      this.deathTimer = 2.7;
      this.deathBoomTimer = 0.04;
      this.sweepBeamActive = false;
      this.chargeTimer = 0;
      this.pendingAttack = null;
      if (this.sweepBeamGroup) this.sweepBeamGroup.visible = false;
      if (this.telegraphLine) this.telegraphLine.visible = false;
      if (this.chargeOrb) this.chargeOrb.visible = false;
      // Re-show the core during the 1.65s dramatic chain-reaction meltdown!
      if (core) core.mesh.visible = true;
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
    projSpeedMult = 1.0,
    damageMult = 1.0,
    enemyHpMult = 1.0,
    onTelegraph?: () => void,
    onDamageSpark?: (pos: THREE.Vector3) => void
  ): void {
    if (!this.active) return;

    this.age += dt;
    if (this.entered) {
      this.fightElapsedSec += dt;
    }
    if (this.phaseShiftInvulnTimer > 0) {
      this.phaseShiftInvulnTimer = Math.max(0, this.phaseShiftInvulnTimer - dt);
    }
    if (this.phaseShiftDome) {
      const shifting = this.phaseShiftInvulnTimer > 0;
      this.phaseShiftDome.visible = shifting;
      if (shifting) {
        this.phaseShiftDome.rotation.y += dt * 4.5;
        this.phaseShiftDome.rotation.x -= dt * 3.2;
        const pulse = 1.0 + Math.sin(this.age * 28) * 0.08;
        this.phaseShiftDome.scale.setScalar(pulse);
      }
    }
    // Aegis Dreadnought core shield dome stays pulsing during its 1.5s Phase 2 transition, then shatters open!
    if (this.bossId === 'aegis_dreadnought' && this.coreShieldDome && this.phase === 2) {
      if (this.phaseShiftInvulnTimer > 0) {
        this.coreShieldDome.visible = true;
        this.coreShieldDome.scale.setScalar(1.0 + Math.sin(this.age * 28) * 0.08);
      } else {
        this.coreShieldDome.visible = false;
      }
    }

    // Entrance to Z = -52
    if (!this.entered) {
      this.root.position.z = THREE.MathUtils.lerp(this.root.position.z, -52, Math.min(1, dt * 2.6));
      if (this.root.position.z > -54) this.entered = true;
    } else if (this.bossId === 'solaris_leviathan') {
      const speedScale = (1 + this.destroyedSegmentsCount * 0.1) * Math.min(1.35, aggressionMult);
      const t = this.age * 0.92 * speedScale;
      this.root.position.x = Math.sin(t) * 8.4;
      this.root.position.y = Math.sin(t * 2) * 3.8;
      this.root.rotation.z = Math.cos(t) * 0.22;

      for (let s = 1; s < this.serpentSegments.length; s++) {
        const seg = this.serpentSegments[s];
        const lag = t - s * 0.36;
        const targetX = Math.sin(lag) * 8.4 - this.root.position.x;
        const targetY = Math.sin(lag * 2) * 3.8 - this.root.position.y;
        seg.position.set(targetX, targetY, -s * 4.4);
        seg.rotation.z = Math.cos(lag) * 0.5;
      }
    } else {
      const ampX = this.phase === 2 ? 6.8 : 4.4;
      const ampY = this.phase === 2 ? 2.9 : 1.7;
      const speedX = (this.phase === 2 ? 1.25 : 0.82) * Math.min(1.3, aggressionMult);
      this.root.position.x = Math.sin(this.age * speedX) * ampX;
      this.root.position.y = 0.6 + Math.cos(this.age * 1.0) * ampY;
      this.root.rotation.z = Math.cos(this.age * speedX) * (this.phase === 2 ? 0.14 : 0.06);
    }

    // Aegis Dreadnought visual polish: blast doors, shield dome, player-tracking turrets & ion thrusters
    if (this.blastDoorLeft && this.blastDoorRight) {
      const targetX = this.phase === 2 ? 5.4 : 1.7;
      this.blastDoorLeft.position.x = THREE.MathUtils.lerp(this.blastDoorLeft.position.x, -targetX, dt * 3.5);
      this.blastDoorRight.position.x = THREE.MathUtils.lerp(this.blastDoorRight.position.x, targetX, dt * 3.5);
    }
    if (this.coreShieldDome && this.coreShieldDome.visible) {
      this.coreShieldDome.rotation.y += dt * 1.4;
      this.coreShieldDome.rotation.x += dt * 0.9;
    }
    for (const turret of this.aegisTurrets) {
      turret.lookAt(playerPos);
    }
    for (const flame of this.aegisThrusters) {
      flame.scale.set(1, 0.85 + Math.sin(this.age * 28) * 0.25, 1);
    }

    // Octa-Core Sentinel: central Iris Eye tracks the player!
    if (this.sentinelEye) {
      this.sentinelEye.lookAt(playerPos);
      const pulse = this.chargeTimer > 0 ? 1.45 : 1.0 + Math.sin(this.age * 6) * 0.08;
      this.sentinelEye.scale.setScalar(pulse);
    }

    // Solaris Leviathan: snapping jaws open wide when charging or in Phase 2!
    if (this.leviathanUpperJaw && this.leviathanLowerJaw) {
      const jawOpen =
        this.chargeTimer > 0 || this.sweepBeamActive
          ? 0.52
          : this.phase === 2
            ? 0.22 + Math.abs(Math.sin(this.age * 5)) * 0.18
            : 0.06 + Math.abs(Math.sin(this.age * 2.5)) * 0.08;
      this.leviathanUpperJaw.rotation.x = THREE.MathUtils.lerp(this.leviathanUpperJaw.rotation.x, -jawOpen, dt * 8);
      this.leviathanLowerJaw.rotation.x = THREE.MathUtils.lerp(this.leviathanLowerJaw.rotation.x, jawOpen, dt * 8);
    }

    // Spin halos
    this.haloRings.forEach((h, i) => {
      h.rotation.z += dt * (i % 2 === 0 ? 1.15 : -1.55) * (this.phase === 2 ? 1.8 : 1.0);
      h.rotation.y += dt * (i % 2 === 0 ? 0.5 : -0.65);
    });

    // Live battle-damage sparks when parts are blown off or HP < 55%!
    if (onDamageSpark && (this.phase === 2 || this.totalHp < this.maxTotalHp * 0.6)) {
      this.sparkTimer -= dt;
      if (this.sparkTimer <= 0) {
        this.sparkTimer = 0.22;
        const sparkPos = this.root.position
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 4, 2));
        onDamageSpark(sparkPos);
      }
    }

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
        const orbitSpeed = (this.phase === 2 ? 1.65 : 1.15) * Math.min(1.3, aggressionMult);
        const a = this.age * orbitSpeed + (i * Math.PI) / 2;
        p.mesh.position.set(Math.cos(a) * 6.6, Math.sin(a) * 4.6, 3.0);
        p.mesh.rotation.z = a;
      } else if (p.isCore && p.alive) {
        p.mesh.rotation.y += dt * (this.phase === 2 ? 4.0 : 1.5);
        p.mesh.rotation.x += dt * 1.0;
      }
    }

    // Telegraphing charge orb + warning laser sightline (crisp 0.80s readable warning!)
    if (this.chargeTimer > 0 && this.chargeOrb) {
      this.chargeTimer -= dt;
      this.chargeOrb.visible = true;
      const pulse = 0.6 + (1 - this.chargeTimer / 0.8) * 2.1 + Math.sin(this.age * 32) * 0.2;
      this.chargeOrb.scale.setScalar(pulse);
      if (this.telegraphLine) {
        this.telegraphLine.visible = Math.floor(this.age * 22) % 2 === 0;
      }
      if (this.chargeTimer <= 0) {
        this.chargeOrb.visible = false;
        if (this.telegraphLine) this.telegraphLine.visible = false;
        const fn = this.pendingAttack;
        this.pendingAttack = null;
        if (fn) fn();
      }
    }

    // Sweeping laser beam / Rotating X-Cross Cage update
    if (this.sweepBeamActive && this.sweepBeamGroup && this.sweepBar1 && this.sweepBar2) {
      this.sweepBeamTimer -= dt;
      const prog = 1 - this.sweepBeamTimer / this.sweepDuration;
      this.sweepBeamGroup.visible = true;

      if (this.sweepAxis === 'cross') {
        // Octa-Core Sentinel / Enraged Leviathan Rotating X-Laser Cage!
        this.sweepBar1.visible = true;
        this.sweepBar2.visible = true;
        this.sweepCrossAngle = prog * Math.PI * 1.15 * this.sweepBeamDir;
        this.sweepBeamGroup.position.set(0, 0, -24);
        this.sweepBeamGroup.rotation.set(0, 0, this.sweepCrossAngle);
      } else if (this.sweepAxis === 'horizontal') {
        this.sweepBar1.visible = true;
        this.sweepBar2.visible = false;
        const startY = this.sweepBeamDir > 0 ? -7.2 : 7.2;
        this.sweepBeamPos = THREE.MathUtils.lerp(startY, -startY, prog);
        this.sweepBeamGroup.position.set(0, this.sweepBeamPos, -24);
        this.sweepBeamGroup.rotation.set(0, 0, 0);
      } else {
        this.sweepBar1.visible = false;
        this.sweepBar2.visible = true;
        const startX = this.sweepBeamDir > 0 ? -12.5 : 12.5;
        this.sweepBeamPos = THREE.MathUtils.lerp(startX, -startX, prog);
        this.sweepBeamGroup.position.set(this.sweepBeamPos, 0, -24);
        this.sweepBeamGroup.rotation.set(0, 0, 0);
      }

      if (this.sweepBeamTimer <= 0) {
        this.sweepBeamActive = false;
        this.sweepBeamGroup.visible = false;
      }
    }

    if (!this.entered) return;

    this.attackTimer -= dt;
    // Pause plasma barrages while charging, phase-shifting, or executing a laser sweep so every hazard stays crisp & fair!
    if (this.attackTimer <= 0 && this.chargeTimer <= 0 && !this.sweepBeamActive && this.phaseShiftInvulnTimer <= 0) {
      this.triggerBossAttack(
        playerPos,
        playerVel,
        projectiles,
        bulletDensityMult,
        projSpeedMult,
        damageMult,
        onTelegraph
      );
      const baseCd =
        this.bossId === 'aegis_dreadnought'
          ? this.phase === 2
            ? 1.08
            : 1.35
          : this.bossId === 'octa_core_sentinel'
            ? this.phase === 2
              ? 1.05
              : 1.3
            : this.phase === 2
              ? 0.96
              : 1.22;
      // Built-in brief tactical punish breather every 4th volley!
      const breather = this.attackPatternIdx % 4 === 0 ? 0.55 : 0;
      const leviathanBonus =
        this.bossId === 'solaris_leviathan' ? Math.max(0.75, 1 - this.destroyedSegmentsCount * 0.05) : 1;
      this.attackTimer = (baseCd * leviathanBonus) / aggressionMult + breather;
    }

    // Controlled escort waves (capped at max 2 alive so they add fun side pressure & drop shield rings!)
    this.droneTimer -= dt;
    if (this.droneTimer <= 0) {
      this.droneTimer = (this.phase === 2 ? 7.8 : 9.8) / aggressionMult;
      const aliveEscorts = enemies.enemies.filter((e) => e.alive).length;
      if (aliveEscorts < 2) {
        const escortKind =
          this.bossId === 'aegis_dreadnought'
            ? 'scout'
            : this.bossId === 'octa_core_sentinel'
              ? 'weaver'
              : 'interceptor';
        enemies.spawnSingle(escortKind, -9.8, 3.0, -110, 'swoop_pass', 0.9 * aggressionMult, 0, enemyHpMult);
        enemies.spawnSingle(escortKind, 9.8, -2.4, -110, 'swoop_pass', 0.9 * aggressionMult, 1.5, enemyHpMult);
      }
    }
  }

  private scheduleTelegraphedBeam(
    axis: 'horizontal' | 'vertical' | 'cross',
    duration: number,
    onTelegraph?: () => void
  ): void {
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.chargeTimer = 0.8;
    if (this.telegraphLine) {
      if (axis === 'horizontal') {
        this.telegraphLine.position.set(0, dir > 0 ? -6.8 : 6.8, -24);
        this.telegraphLine.rotation.set(0, 0, 0);
      } else if (axis === 'vertical') {
        this.telegraphLine.position.set(dir > 0 ? -11.5 : 11.5, 0, -24);
        this.telegraphLine.rotation.set(0, 0, Math.PI / 2);
      } else {
        this.telegraphLine.position.set(0, 0, -24);
        this.telegraphLine.rotation.set(0, 0, Math.PI / 4);
      }
      this.telegraphLine.visible = true;
    }
    if (onTelegraph) onTelegraph();
    this.pendingAttack = () => {
      this.sweepBeamActive = true;
      this.sweepAxis = axis;
      this.sweepBeamDir = dir;
      this.sweepDuration = duration;
      this.sweepBeamTimer = duration;
    };
  }

  private triggerBossAttack(
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    projectiles: ProjectilePool,
    bulletDensityMult: number,
    projSpeedMult: number,
    damageMult: number,
    onTelegraph?: () => void
  ): void {
    this.attackPatternIdx++;
    const origin = new THREE.Vector3();
    // Gentle aim lead so dodging sideways cleanly beats incoming fire!
    const leadPos = playerPos.clone().addScaledVector(playerVel, this.phase === 2 ? 0.16 : 0.08);
    const dmg = (base: number) => Math.round(base * damageMult);

    // ===== SECTOR 1: AEGIS DREADNOUGHT — CHOREOGRAPHED 3-STEP ASSAULT =====
    if (this.bossId === 'aegis_dreadnought') {
      if (this.phase === 2 && !this.sweepBeamActive && this.attackPatternIdx % 3 === 0) {
        // Alternates Horizontal and Vertical telegraphed laser sweeps!
        const axis = this.attackPatternIdx % 6 === 0 ? 'vertical' : 'horizontal';
        this.scheduleTelegraphedBeam(axis, 1.75, onTelegraph);
        return;
      }
      if (this.phase === 1) {
        const step = this.attackPatternIdx % 3;
        if (step === 1) {
          // Step 1: Converging Dual Turret Fan (2-3 clean readable shots per alive turret!)
          for (const p of this.parts) {
            if (!p.alive || p.isCore) continue;
            p.getPosition(origin);
            const count = bulletDensityMult >= 1.35 ? 3 : 2;
            for (let k = 0; k < count; k++) {
              const spread = (k - (count - 1) / 2) * 3.0;
              const dir = leadPos.clone().add(new THREE.Vector3(spread, 0, 0)).sub(origin).normalize();
              projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(56 * projSpeedMult), dmg(13), 0.95);
            }
          }
        } else if (step === 2) {
          // Step 2: Pincer Side Lanes (fires horizontal bracket leaving a crisp dodge lane!)
          for (const p of this.parts) {
            if (!p.alive || p.isCore) continue;
            p.getPosition(origin);
            const side = origin.x < 0 ? -1 : 1;
            for (const oy of [-2.4, 2.4]) {
              const target = new THREE.Vector3(side * 3.2, playerPos.y + oy, 0);
              const dir = target.sub(origin).normalize();
              projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(54 * projSpeedMult), dmg(13), 0.92);
            }
          }
        } else {
          // Step 3: Citadel Tri-Pulse (juicy aimed burst — awesome to barrel-roll deflect!)
          this.root.getWorldPosition(origin);
          origin.y += 3.0;
          for (let k = -1; k <= 1; k++) {
            const target = leadPos.clone().add(new THREE.Vector3(k * 2.8, 0, 0));
            const dir = target.sub(origin).normalize();
            projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(62 * projSpeedMult), dmg(14), 1.02);
          }
        }
      } else {
        // Phase 2: Alternates Graceful V-Arc Bomb Wall and Core Tri-Burst!
        const core = this.parts.find((p) => p.isCore);
        if (core) core.getPosition(origin);
        else this.root.getWorldPosition(origin);

        if (this.attackPatternIdx % 2 === 1) {
          // Spaced Hangar Bay V-Arc Bomb Curtain (5-7 glowing slow-arcing bombs with clear lanes!)
          const half = bulletDensityMult >= 1.35 ? 3 : 2;
          for (let k = -half; k <= half; k++) {
            const target = leadPos.clone().add(new THREE.Vector3(k * 3.4, Math.abs(k) * 0.9 - 1.0, 0));
            const dir = target.sub(origin).normalize();
            projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(54 * projSpeedMult), dmg(14), 1.08);
          }
        } else {
          // Focused Core Tri-Burst (great reflect chance!)
          for (let k = -1; k <= 1; k++) {
            const target = leadPos.clone().add(new THREE.Vector3(k * 2.4, 0, 0));
            const dir = target.sub(origin).normalize();
            projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(64 * projSpeedMult), dmg(15), 1.05);
          }
        }
      }
      return;
    }

    // ===== SECTOR 2: OCTA-CORE SENTINEL — REFLECT & SACRED GEOMETRY =====
    if (this.bossId === 'octa_core_sentinel') {
      if (this.phase === 2 && !this.sweepBeamActive && this.attackPatternIdx % 3 === 0) {
        // Readable Rotating X-Cross Laser Cage!
        this.scheduleTelegraphedBeam('cross', 2.25, onTelegraph);
        return;
      }
      this.root.getWorldPosition(origin);
      // Signature HUGE slow-moving Charged Reflector Orb dead-center (barrel-roll to SHATTER prism shields!)
      const aimed = playerPos.clone().sub(origin).normalize().multiplyScalar(50 * projSpeedMult);
      projectiles.spawnEnemyPlasma(origin, aimed, dmg(15), 1.4);

      if (this.attackPatternIdx % 2 === 1) {
        // Spaced Sacred-Geometry Ring with clean radial dodge lanes
        const ringCount = Math.round((this.phase === 2 ? 10 : 8) * bulletDensityMult);
        const twist = this.attackPatternIdx % 4 === 1 ? 1 : -1;
        for (let i = 0; i < ringCount; i++) {
          const a = (i / ringCount) * Math.PI * 2 + this.age * 1.4 * twist;
          const vel = new THREE.Vector3(Math.cos(a) * 14.5, Math.sin(a) * 9.5, 52 * projSpeedMult);
          projectiles.spawnEnemyPlasma(origin, vel, dmg(13), 0.92);
        }
      } else {
        // Cross-Diamond Prism Burst (4 outer corner shots + center reflector orb!)
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + this.age * 0.6;
          const vel = new THREE.Vector3(Math.cos(a) * 10.5, Math.sin(a) * 6.8, 56 * projSpeedMult);
          projectiles.spawnEnemyPlasma(origin, vel, dmg(13), 0.94);
        }
      }
      return;
    }

    // ===== SECTOR 3: SOLARIS LEVIATHAN — WEAVING SERPENT & SOLAR MAW =====
    if (this.phase === 2 && !this.sweepBeamActive && this.attackPatternIdx % 3 === 0) {
      // Solar Maw Hyper-Beam (Horizontal, Vertical, or rare X-Cross!)
      const axis =
        this.attackPatternIdx % 9 === 0
          ? 'cross'
          : Math.random() < 0.5
            ? 'horizontal'
            : 'vertical';
      this.scheduleTelegraphedBeam(axis, axis === 'cross' ? 2.1 : 1.55, onTelegraph);
      return;
    }

    if (this.phase === 1) {
      if (this.attackPatternIdx % 2 === 1) {
        // Segmented Body Broadside: 3 alive segments fire readable staggered shots!
        const aliveSegs = this.parts.filter((p) => p.isSerpentSegment && p.alive);
        const shooters = aliveSegs.length > 0 ? aliveSegs.slice(0, 3) : [this.parts[0]];
        for (const seg of shooters) {
          if (!seg) continue;
          seg.getPosition(origin);
          const dir = leadPos.clone().sub(origin).normalize();
          projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(60 * projSpeedMult), dmg(14), 0.98);
        }
      } else {
        // Solar Maw 3–5 Way Fan from Dragon Head!
        this.root.getWorldPosition(origin);
        const half = bulletDensityMult >= 1.35 ? 2 : 1;
        for (let k = -half; k <= half; k++) {
          const target = leadPos.clone().add(new THREE.Vector3(k * 3.0, Math.abs(k) * 0.5, 0));
          const dir = target.sub(origin).normalize();
          projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(62 * projSpeedMult), dmg(14), 1.02);
        }
      }
    } else {
      // Phase 2 Enraged Dragon: Alternating Supernova Spiral Ring and 3-Shot Maw Fang Burst!
      this.root.getWorldPosition(origin);
      if (this.attackPatternIdx % 2 === 1) {
        const ringN = Math.round(10 * bulletDensityMult);
        for (let i = 0; i < ringN; i++) {
          const a = (i / ringN) * Math.PI * 2 + this.age * 1.2;
          const vel = new THREE.Vector3(Math.cos(a) * 15.5, Math.sin(a) * 10.2, 58 * projSpeedMult);
          projectiles.spawnEnemyPlasma(origin, vel, dmg(14), 0.96);
        }
      } else {
        for (let k = -1; k <= 1; k++) {
          const target = leadPos.clone().add(new THREE.Vector3(k * 2.5, 0, 0));
          const dir = target.sub(origin).normalize();
          projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(68 * projSpeedMult), dmg(16), 1.12);
        }
      }
    }
  }

  /**
   * Dramatic 2.7s chain-reaction meltdown before final supernova detonation!
   */
  public updateDeathMeltdown(
    dt: number,
    onChainExplosion: (pos: THREE.Vector3, intensity: number) => void,
    onFinalDetonation: (pos: THREE.Vector3) => void
  ): void {
    if (!this.dying) return;
    this.deathTimer -= dt;
    const prog = Math.min(1, 1 - this.deathTimer / 2.7);

    // Violently shudder, list sideways, sink downward, and flash core light!
    this.root.position.x += (Math.random() - 0.5) * (0.85 + prog * 1.4);
    this.root.position.y -= (1.4 + prog * 2.2) * dt;
    this.root.rotation.z += dt * (0.9 + prog * 2.2);
    this.root.rotation.x += dt * 0.45;
    if (this.coreLight) {
      this.coreLight.color.setHex(Math.floor(this.deathTimer * 26) % 2 === 0 ? 0xffffff : 0xff4400);
      this.coreLight.intensity = 14 + prog * 24;
    }

    // Flash remaining hull white on rapid strobe
    const strobeWhite = Math.floor(this.deathTimer * 22) % 2 === 0;
    for (const p of this.parts) {
      if (!p.mesh.visible) continue;
      p.mesh.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (strobeWhite) {
            obj.material = WHITE_MAT;
          } else {
            const orig = p.originalMats.get(obj);
            if (orig) obj.material = orig;
          }
        }
      });
    }

    this.deathBoomTimer -= dt;
    if (this.deathBoomTimer <= 0) {
      this.deathBoomTimer = Math.max(0.08, 0.17 - prog * 0.08);
      const boomPos = this.root.position
        .clone()
        .add(new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 6));
      onChainExplosion(boomPos, 0.55 + prog * 0.85);
    }

    if (this.deathTimer <= 0) {
      this.dying = false;
      const finalPos = this.root.position.clone();
      this.scene.remove(this.root);
      onFinalDetonation(finalPos);
    }
  }

  public clear(): void {
    this.active = false;
    this.dying = false;
    this.deathTimer = 0;
    this.phaseShiftInvulnTimer = 0;
    this.sweepBeamActive = false;
    this.chargeTimer = 0;
    this.pendingAttack = null;
    this.blastDoorLeft = null;
    this.blastDoorRight = null;
    this.coreShieldDome = null;
    this.phaseShiftDome = null;
    this.coreLight = null;
    this.aegisTurrets = [];
    this.aegisThrusters = [];
    this.sentinelEye = null;
    this.haloRings = [];
    this.serpentSegments = [];
    this.serpentMats = [];
    this.leviathanUpperJaw = null;
    this.leviathanLowerJaw = null;
    this.chargeOrb = null;
    this.scene.remove(this.root);
    while (this.root.children.length > 0) {
      this.root.remove(this.root.children[0]);
    }
    if (this.sweepBeamGroup) {
      this.scene.remove(this.sweepBeamGroup);
      this.sweepBeamGroup = null;
      this.sweepBar1 = null;
      this.sweepBar2 = null;
    }
    if (this.telegraphLine) {
      this.scene.remove(this.telegraphLine);
      this.telegraphLine = null;
    }
    this.parts.length = 0;
  }
}
