import * as THREE from 'three';
import type { InputState } from '../engine/InputManager';

export const PLAY_BOUNDS = {
  minX: -12,
  maxX: 12,
  minY: -7,
  maxY: 7,
};

export class PlayerShip {
  public readonly root = new THREE.Group();
  public readonly position = new THREE.Vector3(0, 0, 0);
  public readonly velocity = new THREE.Vector3(0, 0, 0);
  public readonly aimDir = new THREE.Vector3(0, 0, -1);

  public shield = 100;
  public maxShield = 100;
  public boostMeter = 100;
  public isBoosting = false;
  public isBraking = false;

  // Barrel roll state
  public barrelRollTimer = 0;
  private barrelRollDuration = 0.45;
  private barrelRollDir: -1 | 1 = 1;
  private barrelRollCooldown = 0;

  // Somersault Backflip + EMP pulse state!
  public somersaultTimer = 0;
  private somersaultDuration = 0.65;
  private somersaultCooldown = 0;

  // Weapon upgrades & Smart Nova Bombs!
  public weaponMode: 'twin' | 'spread' | 'gatling' = 'twin';
  public weaponTimer = 0;
  public novaBombs = 2;

  // Invulnerability after damage
  public hitInvulnTimer = 0;
  private damageFlashTimer = 0;

  // Fire cadence
  public fireCooldown = 0;

  // Visual sub-parts
  private readonly shipMesh = new THREE.Group();
  private readonly deflectBubble: THREE.Mesh;
  private readonly thrusterGlowLeft: THREE.Mesh;
  private readonly thrusterGlowRight: THREE.Mesh;
  private readonly shipLight: THREE.PointLight;
  private readonly ribbonMat: THREE.LineBasicMaterial;

  // Wingtip ribbon trails
  private readonly ribbonPoints = 18;
  private readonly leftRibbonHistory: THREE.Vector3[] = [];
  private readonly rightRibbonHistory: THREE.Vector3[] = [];
  private readonly leftRibbonLine: THREE.Line;
  private readonly rightRibbonLine: THREE.Line;

  // Banking angles
  private bankRoll = 0;
  private bankPitch = 0;
  private yaw = 0;

  constructor(scene: THREE.Scene) {
    this.root.add(this.shipMesh);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xdbe9ff,
      metalness: 0.35,
      roughness: 0.35,
      flatShading: true,
    });
    const darkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x16223d,
      metalness: 0.5,
      roughness: 0.4,
      flatShading: true,
    });
    const cyanGlowMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 3.0,
      roughness: 0.2,
      flatShading: true,
    });
    const goldGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffd447,
      emissive: new THREE.Color(0xffd447),
      emissiveIntensity: 2.5,
      roughness: 0.2,
      flatShading: true,
    });

    // Sleek angular fuselage nose
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 4), hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.rotation.z = Math.PI / 4;
    nose.scale.set(1.15, 1, 0.55);
    nose.position.set(0, 0, -0.5);
    this.shipMesh.add(nose);

    // Rear fuselage body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 1.5), darkTrimMat);
    body.position.set(0, -0.02, 0.85);
    this.shipMesh.add(body);

    // Glowing cockpit canopy
    const canopy = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), cyanGlowMat);
    canopy.scale.set(0.9, 0.55, 2.2);
    canopy.position.set(0, 0.26, -0.1);
    this.shipMesh.add(canopy);

    // Swept delta wings (left & right)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(2.45, -1.05);
    wingShape.lineTo(2.2, -1.45);
    wingShape.lineTo(0, -0.9);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.1,
      bevelEnabled: false,
    });
    wingGeo.rotateX(Math.PI / 2);

    const rightWing = new THREE.Mesh(wingGeo, hullMat);
    rightWing.position.set(0.32, 0.02, 0.1);
    this.shipMesh.add(rightWing);

    const leftWing = rightWing.clone();
    leftWing.scale.x = -1;
    leftWing.position.x = -0.32;
    this.shipMesh.add(leftWing);

    // Wing accent neon strips
    const stripGeo = new THREE.BoxGeometry(1.9, 0.08, 0.14);
    const rightStrip = new THREE.Mesh(stripGeo, cyanGlowMat);
    rightStrip.position.set(1.4, 0.08, 0.72);
    rightStrip.rotation.y = -0.4;
    this.shipMesh.add(rightStrip);

    const leftStrip = new THREE.Mesh(stripGeo, cyanGlowMat);
    leftStrip.position.set(-1.4, 0.08, 0.72);
    leftStrip.rotation.y = 0.4;
    this.shipMesh.add(leftStrip);

    // Twin vertical stabilizers
    const finGeo = new THREE.BoxGeometry(0.09, 0.65, 1.0);
    const leftFin = new THREE.Mesh(finGeo, darkTrimMat);
    leftFin.position.set(-0.65, 0.35, 1.05);
    leftFin.rotation.z = 0.25;
    this.shipMesh.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, darkTrimMat);
    rightFin.position.set(0.65, 0.35, 1.05);
    rightFin.rotation.z = -0.25;
    this.shipMesh.add(rightFin);

    // Twin cyan thrusters
    const thrusterGeo = new THREE.ConeGeometry(0.24, 0.95, 6);
    thrusterGeo.rotateX(Math.PI / 2);
    this.thrusterGlowLeft = new THREE.Mesh(thrusterGeo, cyanGlowMat);
    this.thrusterGlowLeft.position.set(-0.36, -0.02, 1.9);
    this.shipMesh.add(this.thrusterGlowLeft);

    this.thrusterGlowRight = new THREE.Mesh(thrusterGeo, cyanGlowMat);
    this.thrusterGlowRight.position.set(0.36, -0.02, 1.9);
    this.shipMesh.add(this.thrusterGlowRight);

    // Twin laser cannons under wings
    const cannonGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6);
    cannonGeo.rotateX(Math.PI / 2);
    const lc = new THREE.Mesh(cannonGeo, goldGlowMat);
    lc.position.set(-1.1, -0.14, 0.15);
    this.shipMesh.add(lc);
    const rc = new THREE.Mesh(cannonGeo, goldGlowMat);
    rc.position.set(1.1, -0.14, 0.15);
    this.shipMesh.add(rc);

    // Barrel-roll energy deflector bubble
    const bubbleGeo = new THREE.IcosahedronGeometry(2.55, 1);
    const bubbleMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00f0ff).multiplyScalar(2.4),
      wireframe: true,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    });
    this.deflectBubble = new THREE.Mesh(bubbleGeo, bubbleMat);
    this.root.add(this.deflectBubble);

    // Dynamic PointLight on thrusters that casts real-time neon reflections onto passing geometry!
    this.shipLight = new THREE.PointLight(0x00f0ff, 5.5, 24);
    this.shipLight.position.set(0, 0.4, 2.2);
    this.root.add(this.shipLight);

    scene.add(this.root);

    // Wingtip ribbon trails in world space
    for (let i = 0; i < this.ribbonPoints; i++) {
      this.leftRibbonHistory.push(new THREE.Vector3(-2.6, 0, i * 0.5));
      this.rightRibbonHistory.push(new THREE.Vector3(2.6, 0, i * 0.5));
    }
    this.ribbonMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(0x00f0ff).multiplyScalar(1.9),
      transparent: true,
      opacity: 0.78,
      toneMapped: false,
    });
    this.leftRibbonLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.leftRibbonHistory),
      this.ribbonMat
    );
    this.rightRibbonLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.rightRibbonHistory),
      this.ribbonMat
    );
    this.leftRibbonLine.frustumCulled = false;
    this.rightRibbonLine.frustumCulled = false;
    scene.add(this.leftRibbonLine);
    scene.add(this.rightRibbonLine);
  }

  public get isBarrelRolling(): boolean {
    return this.barrelRollTimer > 0 || this.somersaultTimer > 0;
  }

  public get isInvulnerable(): boolean {
    return this.barrelRollTimer > 0 || this.somersaultTimer > 0 || this.hitInvulnTimer > 0;
  }

  public reset(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.shield = this.maxShield;
    this.boostMeter = 100;
    this.barrelRollTimer = 0;
    this.barrelRollCooldown = 0;
    this.somersaultTimer = 0;
    this.somersaultCooldown = 0;
    this.weaponMode = 'twin';
    this.weaponTimer = 0;
    this.novaBombs = 2;
    this.hitInvulnTimer = 0;
    this.damageFlashTimer = 0;
    this.fireCooldown = 0;
    this.bankRoll = 0;
    this.bankPitch = 0;
    this.yaw = 0;
    this.root.position.copy(this.position);
    this.root.visible = true;
    for (let i = 0; i < this.ribbonPoints; i++) {
      this.leftRibbonHistory[i].set(-2.6, 0, i * 0.6);
      this.rightRibbonHistory[i].set(2.6, 0, i * 0.6);
    }
  }

  public triggerBarrelRoll(dir: -1 | 1): boolean {
    if (this.barrelRollTimer > 0 || this.somersaultTimer > 0 || this.barrelRollCooldown > 0) return false;
    this.barrelRollTimer = this.barrelRollDuration;
    this.barrelRollDir = dir;
    this.barrelRollCooldown = 0.22;
    return true;
  }

  public triggerSomersault(): boolean {
    if (this.somersaultTimer > 0 || this.barrelRollTimer > 0 || this.somersaultCooldown > 0 || this.boostMeter < 25) {
      return false;
    }
    this.somersaultTimer = this.somersaultDuration;
    this.somersaultCooldown = 1.6;
    this.boostMeter = Math.max(0, this.boostMeter - 25);
    return true;
  }

  public grantWeaponUpgrade(mode: 'spread' | 'gatling', duration = 14): void {
    this.weaponMode = mode;
    this.weaponTimer = duration;
  }

  public addNovaBomb(): void {
    this.novaBombs = Math.min(5, this.novaBombs + 1);
  }

  public takeDamage(amount: number): boolean {
    if (this.isInvulnerable) return false;
    this.shield = Math.max(0, this.shield - amount);
    this.hitInvulnTimer = 0.75;
    this.damageFlashTimer = 0.25;
    return true;
  }

  public heal(amount: number): void {
    this.shield = Math.min(this.maxShield, this.shield + amount);
  }

  public update(
    dt: number,
    input: InputState,
    railSpeed: number,
    mouseAimEnabled: boolean
  ): { startedBoost: boolean; startedRoll: boolean; startedSomersault: boolean } {
    const moveSpeedX = 25;
    const moveSpeedY = 18;

    const targetVx = input.moveX * moveSpeedX;
    const targetVy = input.moveY * moveSpeedY;
    const accel = 16;
    this.velocity.x += (targetVx - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.y += (targetVy - this.velocity.y) * Math.min(1, accel * dt);

    this.position.x = THREE.MathUtils.clamp(
      this.position.x + this.velocity.x * dt,
      PLAY_BOUNDS.minX,
      PLAY_BOUNDS.maxX
    );
    this.position.y = THREE.MathUtils.clamp(
      this.position.y + this.velocity.y * dt,
      PLAY_BOUNDS.minY,
      PLAY_BOUNDS.maxY
    );

    // Barrel roll
    let startedRoll = false;
    if (input.barrelRollDir !== 0) {
      startedRoll = this.triggerBarrelRoll(input.barrelRollDir);
    }
    if (this.barrelRollCooldown > 0) this.barrelRollCooldown -= dt;
    if (this.barrelRollTimer > 0) {
      this.barrelRollTimer = Math.max(0, this.barrelRollTimer - dt);
    }

    // Somersault Backflip
    let startedSomersault = false;
    if (input.somersaultPressed) {
      startedSomersault = this.triggerSomersault();
    }
    if (this.somersaultCooldown > 0) this.somersaultCooldown -= dt;
    if (this.somersaultTimer > 0) {
      this.somersaultTimer = Math.max(0, this.somersaultTimer - dt);
    }

    // Weapon upgrade timer
    if (this.weaponTimer > 0) {
      this.weaponTimer -= dt;
      if (this.weaponTimer <= 0) {
        this.weaponMode = 'twin';
      }
    }

    // Boost & Brake
    const prevBoost = this.isBoosting;
    if (input.boost && this.boostMeter > 4) {
      this.isBoosting = true;
      this.isBraking = false;
      this.boostMeter = Math.max(0, this.boostMeter - 42 * dt);
    } else if (input.brake && this.boostMeter > 4) {
      this.isBraking = true;
      this.isBoosting = false;
      this.boostMeter = Math.max(0, this.boostMeter - 26 * dt);
    } else {
      this.isBoosting = false;
      this.isBraking = false;
      this.boostMeter = Math.min(100, this.boostMeter + 18 * dt);
    }
    const startedBoost = !prevBoost && this.isBoosting;

    if (this.hitInvulnTimer > 0) this.hitInvulnTimer -= dt;
    if (this.damageFlashTimer > 0) this.damageFlashTimer -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    const targetRoll = -this.velocity.x * 0.028;
    const targetPitch = this.velocity.y * 0.022;
    const targetYaw = -this.velocity.x * 0.012;
    this.bankRoll += (targetRoll - this.bankRoll) * Math.min(1, 11 * dt);
    this.bankPitch += (targetPitch - this.bankPitch) * Math.min(1, 11 * dt);
    this.yaw += (targetYaw - this.yaw) * Math.min(1, 10 * dt);

    this.root.position.copy(this.position);

    let extraRoll = 0;
    let extraPitch = 0;
    if (this.barrelRollTimer > 0) {
      const p = 1 - this.barrelRollTimer / this.barrelRollDuration;
      extraRoll = -this.barrelRollDir * p * Math.PI * 2;
      (this.deflectBubble.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.72;
      this.deflectBubble.rotation.y += dt * 10;
      this.deflectBubble.rotation.z += dt * 7;
    } else if (this.somersaultTimer > 0) {
      const p = 1 - this.somersaultTimer / this.somersaultDuration;
      extraPitch = p * Math.PI * 2;
      this.root.position.y += Math.sin(p * Math.PI) * 2.2;
      (this.deflectBubble.material as THREE.MeshBasicMaterial).opacity = Math.sin(p * Math.PI) * 0.82;
      this.deflectBubble.rotation.x += dt * 12;
    } else {
      (this.deflectBubble.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    this.shipMesh.rotation.set(this.bankPitch + extraPitch, this.yaw, this.bankRoll + extraRoll);

    if (this.hitInvulnTimer > 0 && !this.isBarrelRolling) {
      this.shipMesh.visible = Math.floor(this.hitInvulnTimer * 24) % 2 === 0;
    } else {
      this.shipMesh.visible = true;
    }

    const flameZ = this.isBoosting ? 2.1 + Math.sin(performance.now() * 0.04) * 0.25 : this.isBraking ? 0.55 : 1.0 + Math.sin(performance.now() * 0.03) * 0.1;
    this.thrusterGlowLeft.scale.set(1, 1, flameZ);
    this.thrusterGlowRight.scale.set(1, 1, flameZ);

    // Compute forward aim direction (+ right stick fine aim OR mouse aim)
    this.aimDir.set(0, 0, -1);
    this.aimDir.x = THREE.MathUtils.clamp(this.velocity.x * 0.0085 + input.aimStickX * 0.26, -0.32, 0.32);
    this.aimDir.y = THREE.MathUtils.clamp(this.velocity.y * 0.0085 + input.aimStickY * 0.22, -0.24, 0.24);
    if (mouseAimEnabled) {
      const targetAimX = input.mouseNdcX * 0.34;
      const targetAimY = input.mouseNdcY * 0.24;
      this.aimDir.x = THREE.MathUtils.lerp(this.aimDir.x, targetAimX, 0.78);
      this.aimDir.y = THREE.MathUtils.lerp(this.aimDir.y, targetAimY, 0.78);
    }
    this.aimDir.normalize();

    this.root.updateMatrixWorld(true);
    const leftTip = new THREE.Vector3(-2.55, 0, 1.25).applyMatrix4(this.shipMesh.matrixWorld);
    const rightTip = new THREE.Vector3(2.55, 0, 1.25).applyMatrix4(this.shipMesh.matrixWorld);

    for (let i = this.ribbonPoints - 1; i > 0; i--) {
      this.leftRibbonHistory[i].copy(this.leftRibbonHistory[i - 1]);
      this.leftRibbonHistory[i].z += railSpeed * dt * 0.7;
      this.rightRibbonHistory[i].copy(this.rightRibbonHistory[i - 1]);
      this.rightRibbonHistory[i].z += railSpeed * dt * 0.7;
    }
    this.leftRibbonHistory[0].copy(leftTip);
    this.rightRibbonHistory[0].copy(rightTip);

    this.leftRibbonLine.geometry.setFromPoints(this.leftRibbonHistory);
    this.rightRibbonLine.geometry.setFromPoints(this.rightRibbonHistory);

    return { startedBoost, startedRoll, startedSomersault };
  }

  public setAccentState(overdrive: boolean, turbo: boolean): void {
    if (turbo) {
      this.shipLight.color.setHex(0x00ff88);
      this.ribbonMat.color.setHex(0x00ff88).multiplyScalar(2.1);
    } else if (overdrive || this.weaponMode !== 'twin') {
      this.shipLight.color.setHex(0xffd447);
      this.ribbonMat.color.setHex(0xffd447).multiplyScalar(2.1);
    } else {
      this.shipLight.color.setHex(0x00f0ff);
      this.ribbonMat.color.setHex(0x00f0ff).multiplyScalar(1.9);
    }
  }

  public getCannonMuzzles(): [THREE.Vector3, THREE.Vector3] {
    this.root.updateMatrixWorld(true);
    const left = new THREE.Vector3(-1.1, -0.14, -0.55).applyMatrix4(this.shipMesh.matrixWorld);
    const right = new THREE.Vector3(1.1, -0.14, -0.55).applyMatrix4(this.shipMesh.matrixWorld);
    return [left, right];
  }

  public getReticleWorldPoints(): { near: THREE.Vector3; far: THREE.Vector3 } {
    const near = this.position.clone().addScaledVector(this.aimDir, 28);
    const far = this.position.clone().addScaledVector(this.aimDir, 76);
    return { near, far };
  }
}
