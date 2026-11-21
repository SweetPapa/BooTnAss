import * as THREE from 'three';

export interface HomingTarget {
  id: number;
  alive: boolean;
  getPosition(out: THREE.Vector3): THREE.Vector3;
}

export type ProjectileKind =
  | 'player_bolt'
  | 'player_missile'
  | 'enemy_plasma'
  | 'reflected_bolt'
  | 'ally_bolt';

export interface Projectile {
  active: boolean;
  kind: ProjectileKind;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  radius: number;
  target: HomingTarget | null;
  grazed?: boolean;
  allyId?: 'blitz' | 'tank';
}

export class ProjectilePool {
  private readonly maxPlayerBolts = 220;
  private readonly maxMissiles = 48;
  private readonly maxEnemyShots = 420;

  public readonly projectiles: Projectile[] = [];

  private readonly playerMesh: THREE.InstancedMesh;
  private readonly missileMesh: THREE.InstancedMesh;
  private readonly enemyMesh: THREE.InstancedMesh;
  private readonly playerAlphaAttr: THREE.InstancedBufferAttribute;
  private readonly missileAlphaAttr: THREE.InstancedBufferAttribute;
  private readonly enemyAlphaAttr: THREE.InstancedBufferAttribute;
  private readonly dummy = new THREE.Object3D();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpTargetPos = new THREE.Vector3();
  private readonly defaultCamPos = new THREE.Vector3(0, 2.2, 14);
  private readonly up = new THREE.Vector3(0, 1, 0);

  private createFadableInstancedMat(color: THREE.Color | number): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    mat.customProgramCacheKey = () => 'instanced_cam_fade_v1';
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vInstanceOpacity;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;'
        );
    };
    return mat;
  }

  constructor(scene: THREE.Scene) {
    // Player plasma bolt geometry (elongated glowing rod)
    const boltGeo = new THREE.BoxGeometry(0.18, 0.18, 2.5);
    this.playerAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxPlayerBolts), 1);
    this.playerAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    boltGeo.setAttribute('instanceOpacity', this.playerAlphaAttr);
    const boltMat = this.createFadableInstancedMat(0xffffff);
    this.playerMesh = new THREE.InstancedMesh(boltGeo, boltMat, this.maxPlayerBolts);
    this.playerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.playerMesh.frustumCulled = false;

    // Homing missile geometry (glowing golden diamond)
    const missileGeo = new THREE.OctahedronGeometry(0.45, 0);
    missileGeo.scale(0.85, 0.85, 2.2);
    this.missileAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxMissiles), 1);
    this.missileAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    missileGeo.setAttribute('instanceOpacity', this.missileAlphaAttr);
    const missileMat = this.createFadableInstancedMat(new THREE.Color(0xffd447).multiplyScalar(2.8));
    this.missileMesh = new THREE.InstancedMesh(missileGeo, missileMat, this.maxMissiles);
    this.missileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.missileMesh.frustumCulled = false;

    // Enemy plasma orb (readable fiery crimson-orange glowing sphere with smooth near-camera fade!)
    const enemyGeo = new THREE.IcosahedronGeometry(0.76, 1);
    this.enemyAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.maxEnemyShots), 1);
    this.enemyAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    enemyGeo.setAttribute('instanceOpacity', this.enemyAlphaAttr);
    const enemyMat = this.createFadableInstancedMat(new THREE.Color(0xff3818).multiplyScalar(2.4));
    this.enemyMesh = new THREE.InstancedMesh(enemyGeo, enemyMat, this.maxEnemyShots);
    this.enemyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyMesh.frustumCulled = false;

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const cyan = new THREE.Color(0x00f0ff).multiplyScalar(2.8);

    for (let i = 0; i < this.maxPlayerBolts; i++) {
      this.playerMesh.setMatrixAt(i, zero);
      this.playerMesh.setColorAt(i, cyan);
      this.playerAlphaAttr.setX(i, 0);
    }
    for (let i = 0; i < this.maxMissiles; i++) {
      this.missileMesh.setMatrixAt(i, zero);
      this.missileAlphaAttr.setX(i, 0);
    }
    for (let i = 0; i < this.maxEnemyShots; i++) {
      this.enemyMesh.setMatrixAt(i, zero);
      this.enemyAlphaAttr.setX(i, 0);
    }

    scene.add(this.playerMesh, this.missileMesh, this.enemyMesh);
  }

  public spawnPlayerBolt(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    overdrive = false,
    reflected = false,
    damageMult = 1.0
  ): void {
    const speed = reflected ? 170 : 185;
    this.projectiles.push({
      active: true,
      kind: reflected ? 'reflected_bolt' : 'player_bolt',
      pos: origin.clone(),
      prevPos: origin.clone(),
      vel: direction.clone().normalize().multiplyScalar(speed),
      life: 1.45,
      damage: (reflected ? 36 : overdrive ? 15 : 12) * damageMult,
      radius: reflected ? 1.25 : 0.72,
      target: null,
    });
  }

  public spawnHomingMissile(
    origin: THREE.Vector3,
    initialVel: THREE.Vector3,
    target: HomingTarget | null
  ): void {
    this.projectiles.push({
      active: true,
      kind: 'player_missile',
      pos: origin.clone(),
      prevPos: origin.clone(),
      vel: initialVel.clone(),
      life: 3.0,
      damage: 45,
      radius: 1.25,
      target,
    });
  }

  public spawnAllyBolt(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    allyId: 'blitz' | 'tank',
    damage = 11
  ): void {
    const speed = 155;
    this.projectiles.push({
      active: true,
      kind: 'ally_bolt',
      pos: origin.clone(),
      prevPos: origin.clone(),
      vel: direction.clone().normalize().multiplyScalar(speed),
      life: 1.25,
      damage,
      radius: 0.65,
      target: null,
      allyId,
    });
  }

  public spawnEnemyPlasma(
    origin: THREE.Vector3,
    velocity: THREE.Vector3,
    damage = 14,
    radius = 0.78
  ): void {
    this.projectiles.push({
      active: true,
      kind: 'enemy_plasma',
      pos: origin.clone(),
      prevPos: origin.clone(),
      vel: velocity.clone(),
      life: 4.5,
      damage,
      radius,
      target: null,
    });
  }

  public update(
    dt: number,
    cameraPos?: THREE.Vector3,
    onMissileTrail?: (pos: THREE.Vector3) => void
  ): void {
    const camPos = cameraPos ?? this.defaultCamPos;
    let pIdx = 0;
    let mIdx = 0;
    let eIdx = 0;

    const cyanColor = new THREE.Color(0x00f0ff).multiplyScalar(2.8);
    const goldColor = new THREE.Color(0xffd447).multiplyScalar(3.0);
    // Subtle lower-intensity allied bolt tints so wingmen never clutter the screen!
    const blitzColor = new THREE.Color(0x33ff99).multiplyScalar(1.55);
    const tankColor = new THREE.Color(0xffcc55).multiplyScalar(1.55);

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.active) {
        this.projectiles.splice(i, 1);
        continue;
      }

      proj.life -= dt;
      // Cull once expired, deep out of range, or well past the player near the camera lens!
      if (proj.life <= 0 || proj.pos.z < -260 || proj.pos.z > 8.5) {
        proj.active = false;
        this.projectiles.splice(i, 1);
        continue;
      }

      proj.prevPos.copy(proj.pos);

      if (proj.kind === 'player_missile') {
        if (proj.target && proj.target.alive) {
          proj.target.getPosition(this.tmpTargetPos);
          this.tmpDir.subVectors(this.tmpTargetPos, proj.pos).normalize();
          const speed = 135;
          proj.vel.lerp(this.tmpDir.multiplyScalar(speed), Math.min(1, dt * 8.5));
          proj.vel.setLength(speed);
        } else {
          proj.vel.lerp(new THREE.Vector3(0, 0, -135), Math.min(1, dt * 3));
        }
        if (onMissileTrail && Math.random() < 0.75) {
          onMissileTrail(proj.pos);
        }
      }

      proj.pos.addScaledVector(proj.vel, dt);

      // Near-camera anti-blinding: smoothly fade opacity from 1 -> 0 across 12..6 units and cull/hide at < 6 units!
      const camDist = proj.pos.distanceTo(camPos);
      if (camDist < 6.0) {
        if (proj.kind === 'enemy_plasma' && proj.pos.z > 2.5) {
          proj.active = false;
          this.projectiles.splice(i, 1);
        }
        continue;
      }
      const camOpacity = camDist >= 12.0 ? 1.0 : THREE.MathUtils.clamp((camDist - 6.0) / 6.0, 0, 1);

      if (proj.kind === 'player_bolt' || proj.kind === 'reflected_bolt' || proj.kind === 'ally_bolt') {
        if (pIdx < this.maxPlayerBolts) {
          this.dummy.position.copy(proj.pos);
          this.tmpDir.copy(proj.pos).add(proj.vel);
          this.dummy.lookAt(this.tmpDir);
          const scale = proj.kind === 'reflected_bolt' ? 1.6 : proj.kind === 'ally_bolt' ? 0.78 : 1.0;
          this.dummy.scale.set(scale, scale, scale);
          this.dummy.updateMatrix();
          this.playerMesh.setMatrixAt(pIdx, this.dummy.matrix);
          const col =
            proj.kind === 'reflected_bolt'
              ? goldColor
              : proj.kind === 'ally_bolt'
                ? proj.allyId === 'tank'
                  ? tankColor
                  : blitzColor
                : cyanColor;
          this.playerMesh.setColorAt(pIdx, col);
          this.playerAlphaAttr.setX(pIdx, camOpacity);
          pIdx++;
        }
      } else if (proj.kind === 'player_missile') {
        if (mIdx < this.maxMissiles) {
          this.dummy.position.copy(proj.pos);
          this.tmpDir.copy(proj.pos).add(proj.vel);
          this.dummy.lookAt(this.tmpDir);
          this.dummy.scale.set(1, 1, 1);
          this.dummy.updateMatrix();
          this.missileMesh.setMatrixAt(mIdx, this.dummy.matrix);
          this.missileAlphaAttr.setX(mIdx, camOpacity);
          mIdx++;
        }
      } else if (proj.kind === 'enemy_plasma') {
        if (eIdx < this.maxEnemyShots) {
          this.dummy.position.copy(proj.pos);
          this.dummy.rotation.set(proj.life * 6, proj.life * 8, 0);
          const s = Math.min(proj.radius / 0.58, 1.85);
          this.dummy.scale.set(s, s, s);
          this.dummy.updateMatrix();
          this.enemyMesh.setMatrixAt(eIdx, this.dummy.matrix);
          this.enemyAlphaAttr.setX(eIdx, camOpacity);
          eIdx++;
        }
      }
    }

    // Zero unused instances
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = pIdx; i < this.maxPlayerBolts; i++) {
      this.playerMesh.setMatrixAt(i, zero);
      this.playerAlphaAttr.setX(i, 0);
    }
    for (let i = mIdx; i < this.maxMissiles; i++) {
      this.missileMesh.setMatrixAt(i, zero);
      this.missileAlphaAttr.setX(i, 0);
    }
    for (let i = eIdx; i < this.maxEnemyShots; i++) {
      this.enemyMesh.setMatrixAt(i, zero);
      this.enemyAlphaAttr.setX(i, 0);
    }

    this.playerMesh.instanceMatrix.needsUpdate = true;
    if (this.playerMesh.instanceColor) this.playerMesh.instanceColor.needsUpdate = true;
    this.playerAlphaAttr.needsUpdate = true;
    this.missileMesh.instanceMatrix.needsUpdate = true;
    this.missileAlphaAttr.needsUpdate = true;
    this.enemyMesh.instanceMatrix.needsUpdate = true;
    this.enemyAlphaAttr.needsUpdate = true;
    void this.up;
  }

  public clear(): void {
    this.projectiles.length = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxPlayerBolts; i++) {
      this.playerMesh.setMatrixAt(i, zero);
      this.playerAlphaAttr.setX(i, 0);
    }
    for (let i = 0; i < this.maxMissiles; i++) {
      this.missileMesh.setMatrixAt(i, zero);
      this.missileAlphaAttr.setX(i, 0);
    }
    for (let i = 0; i < this.maxEnemyShots; i++) {
      this.enemyMesh.setMatrixAt(i, zero);
      this.enemyAlphaAttr.setX(i, 0);
    }
    this.playerMesh.instanceMatrix.needsUpdate = true;
    this.playerAlphaAttr.needsUpdate = true;
    this.missileMesh.instanceMatrix.needsUpdate = true;
    this.missileAlphaAttr.needsUpdate = true;
    this.enemyMesh.instanceMatrix.needsUpdate = true;
    this.enemyAlphaAttr.needsUpdate = true;
  }
}
