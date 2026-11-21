import * as THREE from 'three';
import type { EnemyKind, WaveEvent } from '../levels/LevelSchema';
import type { HomingTarget, ProjectilePool } from './ProjectilePool';

let nextEnemyId = 1;

export type TailStalkPhase = 'intro_pass' | 'on_tail' | 'peek_attack' | 'overshoot_exposed';

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
  holdZ: number;
  holdDuration: number;
  speedZ: number;
  hitFlashTimer: number;
  originalMats: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  pursuingAlly?: 'blitz' | 'tank' | null;

  // Dynamic visual sub-parts (centipede segments, spinning saucer lights/pyramid halo, boot kick!)
  segments?: THREE.Group[];
  spinPart?: THREE.Object3D;

  // Tailgater rival ace state machine
  stalkPhase?: TailStalkPhase;
  stalkTimer?: number;
  stalkSide?: -1 | 1;
  brakeHoldAccum?: number;
  tailShotTimer?: number;
  isExposedBonus?: boolean;
}

export interface EnemyUpdateCallbacks {
  onTailgaterLocked?: (enemy: EnemyEntity) => void;
  onTailgaterReversed?: (enemy: EnemyEntity, method: 'somersault' | 'brake') => void;
  onTailgaterSpark?: (pos: THREE.Vector3, colorHex: number) => void;
}

export interface TailgaterHudInfo {
  onTail: boolean;
  tailSide: -1 | 1;
  hpPct: number;
  exposedTargets: Array<{
    worldPos: THREE.Vector3;
    label: string;
    isReversed: boolean;
  }>;
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
    const squadronPhase = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const offset = this.computeFormationOffset(wave.formation, i, count);
      const startX = THREE.MathUtils.clamp(wave.spawnOffset.x + offset.x, -11.5, 11.5);
      const startY = THREE.MathUtils.clamp(wave.spawnOffset.y + offset.y, -6.0, 6.0);

      let startZ = -170 - offset.z;
      let spawnX = startX;
      if (wave.behavior === 'rear_entry') {
        // Streak forward dramatically from behind the player's wingtips!
        const side = i % 2 === 0 ? -1 : 1;
        spawnX = side * (9.5 + (i % 3) * 1.1);
        startZ = 8.5 + i * 3.5;
      } else if (wave.behavior === 'tail_stalker') {
        startZ = -128 - i * 16;
      }

      const entity = this.spawnSingle(
        wave.enemy,
        spawnX,
        startY,
        startZ,
        wave.behavior,
        wave.fireRate,
        squadronPhase + (wave.formation === 'spiral' ? i * 0.45 : i * 0.25),
        hpMult
      );
      entity.baseX = startX;
      entity.fireTimer = wave.fireRate > 0 ? 0.65 + i * 0.22 : 999;
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
    const { group, hp: baseHp, radius, scoreValue, speedZ, segments, spinPart } = this.buildMesh(kind);
    const hp = Math.round(baseHp * hpMult);
    group.position.set(x, y, z);
    this.scene.add(group);

    const originalMats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        originalMats.set(obj, obj.material);
      }
    });

    const holdZ =
      kind === 'doom_triangle' || kind === 'boot_ship'
        ? -38 - Math.random() * 10
        : kind === 'centipede'
          ? -34 - Math.random() * 12
          : -30 - Math.random() * 18;
    const holdDuration =
      kind === 'centipede' ? 9.5 : kind === 'boot_ship' || kind === 'doom_triangle' ? 8.5 : 7.0;

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
      fireTimer: fireRate > 0 ? 0.85 : 999,
      age: 0,
      phaseOffset,
      baseX: x,
      baseY: y,
      holdZ,
      holdDuration,
      speedZ,
      hitFlashTimer: 0,
      originalMats,
      segments,
      spinPart,
      stalkPhase: behavior === 'tail_stalker' ? 'intro_pass' : undefined,
      stalkTimer: behavior === 'tail_stalker' ? 1.65 : undefined,
      stalkSide: Math.random() < 0.5 ? -1 : 1,
      brakeHoldAccum: 0,
      tailShotTimer: 1.8,
      isExposedBonus: false,
      getPosition(out: THREE.Vector3) {
        return out.copy(group.position);
      },
    };

    this.enemies.push(entity);
    return entity;
  }

  /**
   * Called when the player pulls a Somersault Backflip!
   * Flips ALL active Tailgaters right into the player's crosshairs in a stunned 4.5s exposed state!
   */
  public triggerSomersaultCounter(cb?: EnemyUpdateCallbacks): number {
    let reversedCount = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.behavior !== 'tail_stalker') continue;
      if (e.stalkPhase === 'on_tail' || e.stalkPhase === 'peek_attack' || e.stalkPhase === 'intro_pass') {
        e.stalkPhase = 'overshoot_exposed';
        e.stalkTimer = 4.6;
        e.brakeHoldAccum = 0;
        e.isExposedBonus = true;
        e.fireTimer = 1.8; // Stunned in shock before firing back!
        // Vault them cleanly right in front of the player's nose!
        e.mesh.position.z = Math.min(e.mesh.position.z, -14);
        reversedCount++;
        cb?.onTailgaterReversed?.(e, 'somersault');
      }
    }
    return reversedCount;
  }

  /**
   * Dismisses any lingering tailgaters cleanly when a sector Boss Arena starts.
   */
  public disengageTailgatersForBoss(): void {
    for (const e of this.enemies) {
      if (e.alive && e.behavior === 'tail_stalker') {
        e.behavior = 'straight';
        e.stalkPhase = undefined;
        e.isExposedBonus = false;
      }
    }
  }

  public getTailgaterHudInfo(): TailgaterHudInfo {
    let onTail = false;
    let tailSide: -1 | 1 = 1;
    let hpPct = 100;
    const exposedTargets: TailgaterHudInfo['exposedTargets'] = [];

    for (const e of this.enemies) {
      if (!e.alive || e.behavior !== 'tail_stalker') continue;
      if (e.stalkPhase === 'on_tail') {
        onTail = true;
        tailSide = e.stalkSide ?? 1;
        hpPct = Math.round((e.hp / Math.max(1, e.maxHp)) * 100);
      } else if (e.stalkPhase === 'overshoot_exposed') {
        exposedTargets.push({
          worldPos: e.mesh.position.clone(),
          label: 'REVERSED! BLAST HIM!',
          isReversed: true,
        });
      } else if (e.stalkPhase === 'peek_attack') {
        exposedTargets.push({
          worldPos: e.mesh.position.clone(),
          label: 'TAILGATER IN RANGE!',
          isReversed: false,
        });
      }
    }
    return { onTail, tailSide, hpPct, exposedTargets };
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
        return { x: d * 3.6, y: 0, z: 0 };
      case 'v_shape':
        return { x: d * 3.2, y: -Math.abs(d) * 0.45, z: Math.abs(d) * 6.5 };
      case 'spiral': {
        const angle = (i / Math.max(1, count)) * Math.PI * 2;
        return { x: Math.cos(angle) * 4.8, y: Math.sin(angle) * 3.0, z: i * 5.5 };
      }
      case 'flanking': {
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
    segments?: THREE.Group[];
    spinPart?: THREE.Object3D;
  } {
    const group = new THREE.Group();

    const brightArmor = new THREE.MeshStandardMaterial({
      color: 0xe2ebff,
      metalness: 0.25,
      roughness: 0.35,
      flatShading: true,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x1a1f36,
      metalness: 0.6,
      roughness: 0.28,
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
    const limeGlow = new THREE.MeshStandardMaterial({
      color: 0x33ff66,
      emissive: new THREE.Color(0x22ff55),
      emissiveIntensity: 2.1,
      flatShading: true,
    });
    const magentaGlow = new THREE.MeshStandardMaterial({
      color: 0xff22cc,
      emissive: new THREE.Color(0xff11bb),
      emissiveIntensity: 2.4,
      flatShading: true,
    });
    const cyanGlow = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 2.2,
      flatShading: true,
    });

    if (kind === 'scout') {
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

    if (kind === 'centipede') {
      // NEON CYBER-CENTIPEDE — 7 articulated undulating space segments with glowing mandibles & wriggling legs!
      const segments: THREE.Group[] = [];
      const head = new THREE.Group();
      const headShell = new THREE.Mesh(new THREE.OctahedronGeometry(1.18, 0), darkMetal);
      headShell.scale.set(1.1, 0.82, 1.25);
      head.add(headShell);

      // Blazing compound eyes + curved crimson mandibles
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), yellowEye);
        eye.position.set(side * 0.56, 0.34, 0.72);
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.3, 4), crimsonPlate);
        fang.rotation.x = Math.PI / 2;
        fang.rotation.z = side * 0.42;
        fang.position.set(side * 0.65, -0.15, 1.25);
        head.add(eye, fang);
      }
      group.add(head);
      segments.push(head);

      for (let s = 1; s <= 6; s++) {
        const seg = new THREE.Group();
        const shrink = 1 - s * 0.085;
        const bodyMat = s % 2 === 1 ? limeGlow : crimsonPlate;
        const pod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.92 * shrink, 0), bodyMat);
        pod.scale.set(1.05, 0.78, 1.1);
        seg.add(pod);

        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.35 * shrink, 0.5 * shrink, 0.7 * shrink), brightArmor);
        ridge.position.set(0, 0.48 * shrink, 0);
        seg.add(ridge);

        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(1.45 * shrink, 0.14, 0.22), brightArmor);
          leg.position.set(side * 1.15 * shrink, -0.25, 0);
          leg.rotation.z = side * -0.45;
          seg.add(leg);
        }
        seg.position.set(0, 0, -s * 1.65);
        group.add(seg);
        segments.push(seg);
      }

      return { group, hp: 96, radius: 2.85, scoreValue: 550, speedZ: 26, segments };
    }

    if (kind === 'doom_triangle') {
      // FLYING TRIANGLE OF DOOM — Floating golden-obsidian pyramid with a giant glowing all-seeing laser eye!
      const pyramid = new THREE.Mesh(new THREE.ConeGeometry(2.75, 3.85, 3), darkMetal);
      pyramid.rotation.y = Math.PI / 6;
      group.add(pyramid);

      const wireTrim = new THREE.Mesh(
        new THREE.ConeGeometry(2.85, 3.95, 3),
        new THREE.MeshBasicMaterial({ color: 0xffd447, wireframe: true })
      );
      wireTrim.rotation.y = Math.PI / 6;
      group.add(wireTrim);

      // Giant All-Seeing Red Eye mounted right on the front face!
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.86, 10, 10), brightArmor);
      sclera.scale.set(1.25, 0.78, 0.55);
      sclera.position.set(0, -0.2, 1.38);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.56, 10, 10), coreGlow);
      iris.scale.set(1.0, 0.95, 0.45);
      iris.position.set(0, -0.2, 1.72);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 0.2), darkMetal);
      pupil.position.set(0, -0.2, 1.94);
      group.add(sclera, iris, pupil);

      // Spinning outer mystic triangle halo
      const halo = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.14, 6, 3), yellowEye);
      halo.position.set(0, -0.15, 0.25);
      group.add(halo);

      return { group, hp: 132, radius: 2.7, scoreValue: 650, speedZ: 24, spinPart: halo };
    }

    if (kind === 'boot_ship') {
      // THE GIANT SPACE BOOT SHIP ("STOMPER-9000") — Towering armored combat boot with glowing laces & heel rockets!
      const bootBody = new THREE.Group();

      // Tall metallic armored shin shaft
      const shin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.75, 1.55), darkMetal);
      shin.position.set(0, 0.95, -0.55);
      bootBody.add(shin);

      // Bold crimson top cuff collar
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.48, 1.8), crimsonPlate);
      cuff.position.set(0, 2.28, -0.55);
      bootBody.add(cuff);

      // Lower foot chassis + gleaming steel toe cap!
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.2, 3.05), darkMetal);
      foot.position.set(0, -0.82, 0.35);
      bootBody.add(foot);

      const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.92, 8, 8), brightArmor);
      toeCap.scale.set(0.98, 0.72, 1.15);
      toeCap.position.set(0, -0.85, 1.85);
      bootBody.add(toeCap);

      // Heavy glowing hazard-orange combat tread sole + heel block
      const sole = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.36, 3.55), coreGlow);
      sole.position.set(0, -1.52, 0.42);
      const heel = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.45, 1.2), crimsonPlate);
      heel.position.set(0, -1.78, -0.75);
      bootBody.add(sole, heel);

      // Crisscrossing glowing golden shoelace energy coils up the shin!
      for (let i = 0; i < 4; i++) {
        const y = 0.05 + i * 0.52;
        const laceA = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.13, 0.16), yellowEye);
        laceA.position.set(0, y, 0.28);
        laceA.rotation.z = 0.35;
        const laceB = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.13, 0.16), yellowEye);
        laceB.position.set(0, y, 0.28);
        laceB.rotation.z = -0.35;
        bootBody.add(laceA, laceB);
      }

      // Twin blazing heel rocket thrusters + ankle laser pods!
      for (const side of [-1, 1]) {
        const jet = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.35, 6), cyanGlow);
        jet.rotation.x = -Math.PI / 2;
        jet.position.set(side * 0.55, -1.15, -1.75);
        const anklePod = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.3, 6), crimsonPlate);
        anklePod.rotation.x = Math.PI / 2;
        anklePod.position.set(side * 1.18, -0.35, 0.55);
        bootBody.add(jet, anklePod);
      }

      group.add(bootBody);
      return { group, hp: 155, radius: 2.85, scoreValue: 750, speedZ: 24, spinPart: bootBody };
    }

    if (kind === 'bomber_saucer') {
      // WACKY SPINNING DISCO UFO SAUCER!
      const upperDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.75, 0.55, 12), brightArmor);
      upperDisc.position.y = 0.2;
      const lowerDisc = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 1.0, 0.45, 12), darkMetal);
      lowerDisc.position.y = -0.25;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), limeGlow);
      dome.scale.set(1.0, 0.72, 1.0);
      dome.position.y = 0.58;
      group.add(upperDisc, lowerDisc, dome);

      const lightRing = new THREE.Group();
      const palette = [cyanGlow, magentaGlow, yellowEye, limeGlow];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), palette[i % palette.length]);
        bulb.position.set(Math.cos(a) * 2.45, 0, Math.sin(a) * 2.45);
        lightRing.add(bulb);
      }
      group.add(lightRing);

      return { group, hp: 92, radius: 2.55, scoreValue: 500, speedZ: 27, spinPart: lightRing };
    }

    if (kind === 'ace_stalker') {
      // ELITE RIVAL ACE / TAILGATER — Razor-sharp obsidian & blazing neon-magenta twin-blade interceptor!
      const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.88, 3.9, 4), darkMetal);
      fuselage.rotation.x = Math.PI / 2;
      fuselage.rotation.z = Math.PI / 4;
      fuselage.scale.set(1.25, 1.0, 0.58);
      group.add(fuselage);

      const visor = new THREE.Mesh(new THREE.OctahedronGeometry(0.52, 0), magentaGlow);
      visor.scale.set(0.95, 0.55, 2.1);
      visor.position.set(0, 0.32, 0.35);
      group.add(visor);

      for (const side of [-1, 1]) {
        const mainWing = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.95), crimsonPlate);
        mainWing.position.set(side * 1.95, 0, 0.15);
        mainWing.rotation.y = side * -0.45;
        const neonEdge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.19, 0.2), magentaGlow);
        neonEdge.position.set(side * 1.95, 0.04, 0.45);
        neonEdge.rotation.y = side * -0.45;
        const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 1.15), brightArmor);
        tailFin.position.set(side * 0.9, 0.45, -1.1);
        tailFin.rotation.z = side * -0.3;
        const burner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.35, 6), magentaGlow);
        burner.rotation.x = -Math.PI / 2;
        burner.position.set(side * 0.55, 0, -2.15);
        group.add(mainWing, neonEdge, tailFin, burner);
      }

      return { group, hp: 145, radius: 2.35, scoreValue: 900, speedZ: 38 };
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
    const finalAmt = enemy.isExposedBonus ? amount * 1.4 : amount;
    enemy.hp -= finalAmt;
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
    damageMult = 1.0,
    playerIsBraking = false,
    cb?: EnemyUpdateCallbacks
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

      // Animate special enemy visual parts (centipede wriggle, spinning halo/saucer, stomping boot!)
      if (e.kind === 'centipede' && e.segments) {
        for (let s = 1; s < e.segments.length; s++) {
          const seg = e.segments[s];
          const phase = e.age * 5.8 - s * 0.72;
          seg.position.x = Math.sin(phase) * (1.25 + s * 0.14);
          seg.position.y = Math.cos(phase * 0.85) * (0.75 + s * 0.08);
          seg.position.z = -s * 1.65;
          seg.rotation.z = Math.sin(phase) * 0.55;
        }
      } else if (e.kind === 'doom_triangle' && e.spinPart) {
        e.spinPart.rotation.z += dt * 2.4;
      } else if (e.kind === 'bomber_saucer' && e.spinPart) {
        e.spinPart.rotation.y += dt * 5.2;
        e.mesh.rotation.z = Math.sin(e.age * 3.5 + e.phaseOffset) * 0.24;
      } else if (e.kind === 'boot_ship' && e.spinPart) {
        // Hilarious rhythmic space-boot stomping kick!
        e.spinPart.rotation.x = Math.sin(e.age * 4.4 + e.phaseOffset) * 0.24;
        e.spinPart.rotation.z = Math.cos(e.age * 2.8 + e.phaseOffset) * 0.18;
      }

      const pos = e.mesh.position;

      // If this enemy is actively chasing a wingman, let WingmanSquadron steer its pursuit position!
      if (e.pursuingAlly) {
        if (e.kind === 'turret') e.mesh.rotation.z += dt * 1.9;
        continue;
      }

      // === SIGNATURE TAILGATER RIVAL ACE STATE MACHINE ===
      if (e.behavior === 'tail_stalker') {
        this.updateTailStalker(e, dt, playerPos, projectiles, projSpeedMult, damageMult, playerIsBraking, cb);
        continue;
      }

      const prevX = pos.x;

      if (e.behavior === 'straight') {
        pos.z += (e.speedZ + railSpeed * 0.26) * dt;
      } else if (e.behavior === 'sine_weave') {
        const zoneSlow = pos.z > -82 && pos.z < -22 ? 0.62 : 1.0;
        pos.z += (e.speedZ + railSpeed * 0.26) * zoneSlow * dt;
        pos.x = e.baseX + Math.sin(e.age * 2.4 + e.phaseOffset) * 4.2;
        pos.y = e.baseY + Math.cos(e.age * 1.7 + e.phaseOffset) * 1.8;
      } else if (e.behavior === 'swoop_pass') {
        const zoneSlow = pos.z > -78 && pos.z < -24 ? 0.66 : 1.0;
        pos.z += (e.speedZ + railSpeed * 0.3) * zoneSlow * dt;
        if (pos.z > -105 && pos.z < -18) {
          pos.x += (playerPos.x * 0.72 - pos.x) * dt * 0.95;
          pos.y += (playerPos.y * 0.68 - pos.y) * dt * 0.95;
        }
      } else if (e.behavior === 'hover_fire') {
        if (pos.z < -52) {
          pos.z += (e.speedZ + railSpeed * 0.5) * dt;
        } else if (e.age > 8.5) {
          pos.z += (e.speedZ + railSpeed * 0.58) * dt;
        } else {
          pos.x = e.baseX + Math.sin(e.age * 1.65 + e.phaseOffset) * 2.5;
          pos.y = e.baseY + Math.sin(e.age * 1.2 + e.phaseOffset) * 1.3;
        }
      } else if (e.behavior === 'track_strafe') {
        // Classic arcade wing-tracker: rushes into mid-range, tracks your X/Y across the sky, then peels off!
        if (pos.z < e.holdZ - 4 && e.age < 2.8) {
          pos.z += (e.speedZ + railSpeed * 0.62) * dt;
        } else if (e.age < e.holdDuration) {
          const targetZ = e.holdZ + Math.sin(e.age * 1.5 + e.phaseOffset) * 6.5;
          pos.z = THREE.MathUtils.lerp(pos.z, targetZ, Math.min(1, dt * 3.2));
          const sweepX = THREE.MathUtils.clamp(
            playerPos.x * 0.62 + Math.sin(e.age * 1.85 + e.phaseOffset) * 6.2,
            -10.8,
            10.8
          );
          const sweepY = THREE.MathUtils.clamp(
            playerPos.y * 0.52 + Math.cos(e.age * 1.45 + e.phaseOffset) * 2.8,
            -5.0,
            5.5
          );
          pos.x = THREE.MathUtils.lerp(pos.x, sweepX, Math.min(1, dt * 2.8));
          pos.y = THREE.MathUtils.lerp(pos.y, sweepY, Math.min(1, dt * 2.8));
        } else {
          // Dramatic peel-off exit!
          pos.z += (e.speedZ + railSpeed * 0.65) * dt;
          pos.x += Math.sign(e.baseX || 1) * 12 * dt;
          pos.y += 5.5 * dt;
        }
      } else if (e.behavior === 'rear_entry') {
        // Roars forward PAST your wingtips from behind the camera, then locks into a tracking dogfight ahead!
        if (e.age < 1.35) {
          pos.z = THREE.MathUtils.lerp(pos.z, e.holdZ, Math.min(1, dt * 4.2));
          const targetX = THREE.MathUtils.clamp(e.baseX * 0.8 + Math.sin(e.age * 2.5) * 2.5, -10.5, 10.5);
          pos.x = THREE.MathUtils.lerp(pos.x, targetX, Math.min(1, dt * 3.0));
          pos.y = THREE.MathUtils.lerp(pos.y, e.baseY + Math.cos(e.age * 2.2) * 1.5, Math.min(1, dt * 3.0));
        } else if (e.age < e.holdDuration + 1.2) {
          const targetZ = e.holdZ + Math.sin(e.age * 1.7 + e.phaseOffset) * 7.0;
          pos.z = THREE.MathUtils.lerp(pos.z, targetZ, Math.min(1, dt * 2.6));
          const trackX = THREE.MathUtils.clamp(
            playerPos.x * 0.65 + Math.sin(e.age * 2.0 + e.phaseOffset) * 5.8,
            -10.5,
            10.5
          );
          const trackY = THREE.MathUtils.clamp(
            playerPos.y * 0.5 + Math.cos(e.age * 1.6 + e.phaseOffset) * 2.6,
            -4.8,
            5.2
          );
          pos.x = THREE.MathUtils.lerp(pos.x, trackX, Math.min(1, dt * 2.8));
          pos.y = THREE.MathUtils.lerp(pos.y, trackY, Math.min(1, dt * 2.8));
        } else {
          pos.z += (e.speedZ + railSpeed * 0.6) * dt;
          pos.y += 7 * dt;
        }
      } else if (e.behavior === 'centipede_slither') {
        // Giant hypnotic 3D figure-8 slither across the entire canyon!
        if (pos.z < e.holdZ - 5 && e.age < 2.6) {
          pos.z += (e.speedZ + railSpeed * 0.62) * dt;
        } else if (e.age < e.holdDuration) {
          const t = e.age * 1.25 + e.phaseOffset;
          const targetX = Math.sin(t) * 9.6;
          const targetY = Math.sin(t * 2.0) * 3.9;
          const targetZ = e.holdZ + Math.cos(t) * 11.0;
          pos.x = THREE.MathUtils.lerp(pos.x, targetX, Math.min(1, dt * 3.4));
          pos.y = THREE.MathUtils.lerp(pos.y, targetY, Math.min(1, dt * 3.4));
          pos.z = THREE.MathUtils.lerp(pos.z, targetZ, Math.min(1, dt * 3.0));
        } else {
          pos.z += (e.speedZ + railSpeed * 0.62) * dt;
        }
      }

      // Dynamic banking & yaw into horizontal movement so ships look super alive!
      const vx = (pos.x - prevX) / Math.max(0.001, dt);
      if (e.kind === 'turret') {
        e.mesh.rotation.z += dt * 1.9;
      } else if (e.kind !== 'bomber_saucer') {
        e.mesh.rotation.z = THREE.MathUtils.lerp(
          e.mesh.rotation.z,
          THREE.MathUtils.clamp(-vx * 0.048, -0.78, 0.78),
          Math.min(1, dt * 7)
        );
        e.mesh.rotation.y = THREE.MathUtils.lerp(
          e.mesh.rotation.y,
          THREE.MathUtils.clamp(vx * 0.022, -0.4, 0.4),
          Math.min(1, dt * 7)
        );
      }

      // Firing patterns tailored to each enemy archetype!
      if (e.fireRate > 0 && pos.z > -135 && pos.z < -18) {
        e.fireTimer -= dt * fireRateMult;
        if (e.fireTimer <= 0) {
          e.fireTimer = 1 / e.fireRate;
          this.fireEnemyWeapon(e, playerPos, projectiles, fireRateMult, projSpeedMult, damageMult);
        }
      }

      // Cull safely before camera near-plane frustum (camera z=14)
      if (pos.z > 10.0 && e.behavior !== 'rear_entry') {
        e.alive = false;
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
      } else if (e.behavior === 'rear_entry' && e.age > e.holdDuration + 3.0 && pos.z > 10.0) {
        e.alive = false;
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
      }
    }
  }

  private updateTailStalker(
    e: EnemyEntity,
    dt: number,
    playerPos: THREE.Vector3,
    projectiles: ProjectilePool,
    projSpeedMult: number,
    damageMult: number,
    playerIsBraking: boolean,
    cb?: EnemyUpdateCallbacks
  ): void {
    const pos = e.mesh.position;
    const prevX = pos.x;
    const side = e.stalkSide ?? 1;
    e.stalkTimer = (e.stalkTimer ?? 2.0) - dt;

    if (e.stalkPhase === 'intro_pass') {
      // Streaks close past your wingtip from ahead and hooks sharply behind your tail!
      const tx = THREE.MathUtils.clamp(playerPos.x + side * 4.8, -10.5, 10.5);
      const ty = THREE.MathUtils.clamp(playerPos.y + 1.0, -4.5, 5.2);
      pos.x = THREE.MathUtils.lerp(pos.x, tx, Math.min(1, dt * 4.0));
      pos.y = THREE.MathUtils.lerp(pos.y, ty, Math.min(1, dt * 4.0));
      pos.z = THREE.MathUtils.lerp(pos.z, 5.5, Math.min(1, dt * 3.6));

      if ((e.stalkTimer ?? 0) <= 0 || pos.z > 3.5) {
        e.stalkPhase = 'on_tail';
        e.stalkTimer = 2.6;
        e.brakeHoldAccum = 0;
        e.tailShotTimer = 1.65;
        e.isExposedBonus = false;
        cb?.onTailgaterLocked?.(e);
      }
    } else if (e.stalkPhase === 'on_tail') {
      // Glued right behind your rear flank (z = +5.2 — safely away from camera z = 14!)
      const tx = THREE.MathUtils.clamp(playerPos.x + side * 4.2 + Math.sin(e.age * 3.8) * 1.4, -10.5, 10.5);
      const ty = THREE.MathUtils.clamp(playerPos.y + 0.5 + Math.cos(e.age * 3.2) * 0.9, -4.8, 5.0);
      pos.x = THREE.MathUtils.lerp(pos.x, tx, Math.min(1, dt * 5.2));
      pos.y = THREE.MathUtils.lerp(pos.y, ty, Math.min(1, dt * 5.2));
      pos.z = THREE.MathUtils.lerp(pos.z, 5.2, Math.min(1, dt * 5.0));

      // Holding Airbrake makes the Tailgater OVERSHOOT right past your cockpit into your crosshairs!
      if (playerIsBraking) {
        e.brakeHoldAccum = (e.brakeHoldAccum ?? 0) + dt;
        if (e.brakeHoldAccum >= 0.52) {
          e.stalkPhase = 'overshoot_exposed';
          e.stalkTimer = 4.2;
          e.brakeHoldAccum = 0;
          e.isExposedBonus = true;
          e.fireTimer = 1.6;
          cb?.onTailgaterReversed?.(e, 'brake');
          return;
        }
      } else {
        e.brakeHoldAccum = Math.max(0, (e.brakeHoldAccum ?? 0) - dt * 0.8);
      }

      // Periodically fires a dodgeable flank warning bolt ahead of you so you feel the pressure!
      e.tailShotTimer = (e.tailShotTimer ?? 1.8) - dt;
      if (e.tailShotTimer <= 0) {
        e.tailShotTimer = 1.95;
        const shotOrigin = new THREE.Vector3(pos.x, pos.y, -11.5);
        const dir = new THREE.Vector3().subVectors(playerPos, shotOrigin).normalize();
        const spd = 48 * projSpeedMult;
        projectiles.spawnEnemyPlasma(shotOrigin, dir.multiplyScalar(spd), Math.round(10 * damageMult), 0.84);
      }

      // Periodically creeps forward into close shooting range (peek_attack) so sharp pilots can tag him too!
      if ((e.stalkTimer ?? 0) <= 0) {
        e.stalkPhase = 'peek_attack';
        e.stalkTimer = 2.4;
        e.fireTimer = 0.45;
      }
    } else if (e.stalkPhase === 'peek_attack') {
      // Slides forward into side-by-side / front flank shooting range (Z = -21) for 2.4s!
      const tx = THREE.MathUtils.clamp(playerPos.x + side * 4.6 + Math.sin(e.age * 4.0) * 1.8, -10.2, 10.2);
      const ty = THREE.MathUtils.clamp(playerPos.y + Math.cos(e.age * 3.0) * 1.4, -4.6, 4.8);
      pos.x = THREE.MathUtils.lerp(pos.x, tx, Math.min(1, dt * 4.5));
      pos.y = THREE.MathUtils.lerp(pos.y, ty, Math.min(1, dt * 4.5));
      pos.z = THREE.MathUtils.lerp(pos.z, -21.5, Math.min(1, dt * 4.8));

      // Airbraking during a peek ALSO forces a full overshoot!
      if (playerIsBraking) {
        e.brakeHoldAccum = (e.brakeHoldAccum ?? 0) + dt;
        if (e.brakeHoldAccum >= 0.45) {
          e.stalkPhase = 'overshoot_exposed';
          e.stalkTimer = 4.2;
          e.brakeHoldAccum = 0;
          e.isExposedBonus = true;
          e.fireTimer = 1.5;
          cb?.onTailgaterReversed?.(e, 'brake');
          return;
        }
      }

      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && pos.z < -12) {
        e.fireTimer = 0.85;
        const dir = new THREE.Vector3().subVectors(playerPos, pos).normalize();
        projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(62 * projSpeedMult), Math.round(11 * damageMult), 0.82);
      }

      if ((e.stalkTimer ?? 0) <= 0) {
        // Drops back behind your opposite wingtip!
        e.stalkSide = side === 1 ? -1 : 1;
        e.stalkPhase = 'on_tail';
        e.stalkTimer = 2.7;
        e.tailShotTimer = 1.5;
      }
    } else if (e.stalkPhase === 'overshoot_exposed') {
      // PANICKING DIRECTLY IN FRONT OF YOUR CROSSHAIRS! Takes 1.4x damage while exposed!
      const tx = THREE.MathUtils.clamp(playerPos.x * 0.52 + Math.sin(e.age * 4.2) * 4.4, -8.5, 8.5);
      const ty = THREE.MathUtils.clamp(playerPos.y * 0.45 + Math.cos(e.age * 3.6) * 2.2, -4.0, 4.4);
      pos.x = THREE.MathUtils.lerp(pos.x, tx, Math.min(1, dt * 4.4));
      pos.y = THREE.MathUtils.lerp(pos.y, ty, Math.min(1, dt * 4.4));
      pos.z = THREE.MathUtils.lerp(pos.z, -32.5, Math.min(1, dt * 5.5));

      // Panicked sparks & erratic shudder!
      if (Math.random() < 0.28) {
        cb?.onTailgaterSpark?.(pos.clone(), 0xff22cc);
      }

      e.fireTimer -= dt;
      if (e.fireTimer <= 0 && pos.z < -18) {
        e.fireTimer = 1.15;
        const dir = new THREE.Vector3().subVectors(playerPos, pos).normalize();
        projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(58 * projSpeedMult), Math.round(10 * damageMult), 0.8);
      }

      if ((e.stalkTimer ?? 0) <= 0) {
        // Regains composure and dives back onto your tail!
        e.stalkSide = side === 1 ? -1 : 1;
        e.stalkPhase = 'on_tail';
        e.stalkTimer = 2.6;
        e.isExposedBonus = false;
        e.tailShotTimer = 1.5;
        cb?.onTailgaterLocked?.(e);
      }
    }

    const vx = (pos.x - prevX) / Math.max(0.001, dt);
    const panicRoll = e.stalkPhase === 'overshoot_exposed' ? Math.sin(e.age * 14) * 0.35 : 0;
    e.mesh.rotation.z = THREE.MathUtils.lerp(
      e.mesh.rotation.z,
      THREE.MathUtils.clamp(-vx * 0.06, -0.95, 0.95) + panicRoll,
      Math.min(1, dt * 8)
    );
    e.mesh.rotation.y = e.stalkPhase === 'overshoot_exposed' ? Math.PI : 0;
  }

  private fireEnemyWeapon(
    e: EnemyEntity,
    playerPos: THREE.Vector3,
    projectiles: ProjectilePool,
    fireRateMult: number,
    projSpeedMult: number,
    damageMult: number
  ): void {
    const pos = e.mesh.position;
    const baseSpeed = e.kind === 'interceptor' || e.kind === 'ace_stalker' ? 74 : 62;
    const shotSpeed = baseSpeed * projSpeedMult;
    const shotDmg = Math.round(12 * damageMult);

    if (e.kind === 'turret') {
      const fan = fireRateMult >= 1.15 ? [-1, 0, 1] : [-0.8, 0.8];
      for (const k of fan) {
        const target = playerPos.clone().add(new THREE.Vector3(k * 3.1, 0, 0));
        const dir = target.sub(pos).normalize();
        projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(shotSpeed), shotDmg, 0.88);
      }
    } else if (e.kind === 'doom_triangle') {
      // Ominous 3-corner triangle plasma volley!
      const offsets = [
        new THREE.Vector3(0, 2.2, 0),
        new THREE.Vector3(-2.4, -1.6, 0),
        new THREE.Vector3(2.4, -1.6, 0),
      ];
      for (const off of offsets) {
        const target = playerPos.clone().add(off);
        const dir = target.sub(pos).normalize();
        projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(shotSpeed * 0.95), shotDmg, 0.92);
      }
    } else if (e.kind === 'boot_ship') {
      // Twin heel-rocket stomper spread!
      for (const side of [-1, 1]) {
        const origin = pos.clone().add(new THREE.Vector3(side * 1.2, -0.5, 0.5));
        const target = playerPos.clone().add(new THREE.Vector3(side * 1.8, 0, 0));
        const dir = target.sub(origin).normalize();
        projectiles.spawnEnemyPlasma(origin, dir.multiplyScalar(shotSpeed * 1.02), Math.round(14 * damageMult), 0.96);
      }
    } else if (e.kind === 'bomber_saucer') {
      // Wacky 4-orb radial disco spread (super fun to barrel-roll deflect!)
      const angles = [-0.14, -0.045, 0.045, 0.14];
      const baseDir = new THREE.Vector3().subVectors(playerPos, pos).normalize();
      for (const a of angles) {
        const d = baseDir.clone().add(new THREE.Vector3(a, Math.sin(a * 12) * 0.03, 0)).normalize();
        projectiles.spawnEnemyPlasma(pos, d.multiplyScalar(shotSpeed * 0.88), shotDmg, 0.86);
      }
    } else if (e.kind === 'centipede') {
      // Bio-plasma mandible twin-bolt!
      for (const side of [-1, 1]) {
        const target = playerPos.clone().add(new THREE.Vector3(side * 1.6, 0, 0));
        const dir = target.sub(pos).normalize();
        projectiles.spawnEnemyPlasma(pos, dir.multiplyScalar(shotSpeed * 0.96), shotDmg, 0.88);
      }
    } else if (e.kind === 'interceptor' || e.kind === 'ace_stalker') {
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

  public clear(): void {
    for (const e of this.enemies) {
      this.scene.remove(e.mesh);
    }
    this.enemies.length = 0;
  }
}
