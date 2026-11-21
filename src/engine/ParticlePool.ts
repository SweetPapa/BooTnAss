import * as THREE from 'three';

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
  stretch: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

interface Shockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

interface FireballCore {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  life: number;
  maxLife: number;
  maxScale: number;
  baseColor: THREE.Color;
}

interface BlastLight {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  peakIntensity: number;
}

interface DelayedPop {
  delay: number;
  pos: THREE.Vector3;
  colorHex: number;
  scale: number;
}

export type ExplosionTier = 'small' | 'medium' | 'mega';

export class ParticlePool {
  private readonly maxParticles = 1800;
  private readonly particles: Particle[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly scene: THREE.Scene;
  private readonly shockwaves: Shockwave[] = [];
  private readonly fireballs: FireballCore[] = [];
  private readonly blastLights: BlastLight[] = [];
  private readonly delayedPops: DelayedPop[] = [];
  private readonly ringGeo: THREE.RingGeometry;
  private cursor = 0;
  private fbCursor = 0;
  private lightCursor = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const geo = new THREE.OctahedronGeometry(0.32, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color(1, 1, 1);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: 1,
        stretch: 1,
        life: 0,
        maxLife: 1,
        color: new THREE.Color(1, 1, 1),
      });
      this.mesh.setMatrixAt(i, zeroMat);
      this.mesh.setColorAt(i, white);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.scene.add(this.mesh);

    this.ringGeo = new THREE.RingGeometry(0.8, 1.0, 32);

    // 24 pooled HDR fireball cores (zero allocation during chaotic battles!)
    const fbGeo = new THREE.IcosahedronGeometry(1.0, 1);
    for (let i = 0; i < 24; i++) {
      const fbMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
      });
      const fbMesh = new THREE.Mesh(fbGeo, fbMat);
      fbMesh.visible = false;
      this.scene.add(fbMesh);
      this.fireballs.push({
        mesh: fbMesh,
        mat: fbMat,
        active: false,
        life: 0,
        maxLife: 0.25,
        maxScale: 3.0,
        baseColor: new THREE.Color(0xffaa33),
      });
    }

    // 4 dynamic pooled PointLights so explosions illuminate nearby canyon walls, crystals & ships in real time!
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xff8822, 0, 58);
      light.position.set(0, 0, -500);
      this.scene.add(light);
      this.blastLights.push({
        light,
        life: 0,
        maxLife: 0.26,
        peakIntensity: 24,
      });
    }
  }

  private alloc(): Particle {
    for (let k = 0; k < this.maxParticles; k++) {
      const idx = (this.cursor + k) % this.maxParticles;
      if (!this.particles[idx].active) {
        this.cursor = (idx + 1) % this.maxParticles;
        return this.particles[idx];
      }
    }
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.maxParticles;
    return p;
  }

  public burst(
    origin: THREE.Vector3,
    count: number,
    hexColor: number,
    speed = 18,
    scale = 1.0,
    life = 0.65,
    stretch = 1.0
  ): void {
    if (origin.z > 9.5) return;
    const baseColor = new THREE.Color(hexColor).multiplyScalar(2.45);
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      p.active = true;
      p.pos.copy(origin);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = speed * (0.4 + Math.random() * 0.95);
      p.vel.set(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.sin(phi) * Math.sin(theta) * spd,
        Math.cos(phi) * spd
      );
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      );
      p.scale = scale * (0.55 + Math.random() * 0.9);
      p.stretch = stretch;
      p.maxLife = life * (0.65 + Math.random() * 0.65);
      p.life = p.maxLife;
      p.color.copy(baseColor);
    }
  }

  public spawnFireball(origin: THREE.Vector3, hexColor: number, maxScale = 3.2, duration = 0.24): void {
    if (origin.z > 8.2) return;
    const fb = this.fireballs[this.fbCursor];
    this.fbCursor = (this.fbCursor + 1) % this.fireballs.length;
    fb.active = true;
    fb.life = duration;
    fb.maxLife = duration;
    fb.maxScale = maxScale;
    fb.baseColor.setHex(hexColor);
    fb.mesh.position.copy(origin);
    fb.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    fb.mesh.scale.setScalar(0.45);
    fb.mesh.visible = true;
    fb.mat.opacity = 0.95;
  }

  public flashLight(origin: THREE.Vector3, hexColor: number, intensity = 26, duration = 0.26): void {
    if (origin.z > 9.0) return;
    const slot = this.blastLights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.blastLights.length;
    slot.light.position.copy(origin);
    slot.light.color.setHex(hexColor);
    slot.light.intensity = intensity;
    slot.peakIntensity = intensity;
    slot.maxLife = duration;
    slot.life = duration;
  }

  /**
   * Signature multi-layered arcade explosion: white-hot core + streaking embers + 3D shockwave + dynamic blast light!
   */
  public spawnArcadeExplosion(
    origin: THREE.Vector3,
    tier: ExplosionTier = 'small',
    primaryHex = 0xff5500,
    secondaryHex = 0xffd447
  ): void {
    if (origin.z > 9.0) return;

    if (tier === 'small') {
      this.spawnFireball(origin, primaryHex, 2.5, 0.21);
      this.burst(origin, 18, primaryHex, 23, 1.05, 0.52, 1.4);
      this.burst(origin, 10, secondaryHex, 28, 0.72, 0.42, 2.0);
      this.spawnShockwave(origin, primaryHex, 6.8, 0.28);
      this.flashLight(origin, primaryHex, 20, 0.22);
    } else if (tier === 'medium') {
      this.spawnFireball(origin, secondaryHex, 3.6, 0.26);
      this.burst(origin, 26, primaryHex, 27, 1.25, 0.65, 1.5);
      this.burst(origin, 16, secondaryHex, 34, 0.85, 0.52, 2.2);
      this.spawnShockwave(origin, primaryHex, 10.5, 0.36);
      this.spawnShockwave(origin, secondaryHex, 8.0, 0.28, true);
      this.flashLight(origin, secondaryHex, 32, 0.28);
    } else {
      // MEGA FIREWORK DETONATION (Boot Ship, Doom Triangle, Centipede, Saucer, Tailgater, Boss Parts!)
      this.spawnFireball(origin, 0xffffff, 4.8, 0.3);
      this.burst(origin, 36, primaryHex, 33, 1.4, 0.8, 1.6);
      this.burst(origin, 24, secondaryHex, 40, 1.0, 0.65, 2.4);
      this.burst(origin, 14, 0x00f0ff, 36, 0.85, 0.55, 2.1);
      this.spawnShockwave(origin, secondaryHex, 15.5, 0.44);
      this.spawnShockwave(origin, primaryHex, 12.5, 0.38, true);
      this.flashLight(origin, secondaryHex, 46, 0.34);

      // Schedule 2 rapid secondary firework sub-pops for extra arcade spectacle!
      for (let k = 0; k < 2; k++) {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 4.5,
          (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * 2.5
        );
        this.delayedPops.push({
          delay: 0.085 * (k + 1),
          pos: origin.clone().add(offset),
          colorHex: k === 0 ? primaryHex : secondaryHex,
          scale: 2.6,
        });
      }
    }
  }

  public spawnTrail(origin: THREE.Vector3, hexColor: number, scale = 0.45, life = 0.22): void {
    const p = this.alloc();
    p.active = true;
    p.pos.copy(origin);
    p.vel.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 16 + Math.random() * 6);
    p.rot.set(0, 0, Math.random() * 6);
    p.rotVel.set(4, 4, 4);
    p.scale = scale;
    p.stretch = 1.0;
    p.maxLife = life;
    p.life = life;
    p.color.setHex(hexColor).multiplyScalar(2.2);
  }

  public spawnShockwave(
    origin: THREE.Vector3,
    hexColor: number,
    maxScale = 14,
    duration = 0.55,
    tilted = false
  ): void {
    // Clamp shockwave away from camera near-plane frustum (camera z=14)
    if (origin.z > 9.2) return;
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hexColor).multiplyScalar(2.6),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      toneMapped: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(origin);
    if (tilted) {
      mesh.rotation.set(Math.PI * 0.34, (Math.random() - 0.5) * 0.9, Math.random() * Math.PI);
    }
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      life: duration,
      maxLife: duration,
      maxScale,
    });
  }

  public update(dt: number, railSpeed: number): void {
    // Trigger any scheduled secondary mega-explosion firework pops
    for (let i = this.delayedPops.length - 1; i >= 0; i--) {
      const dp = this.delayedPops[i];
      dp.delay -= dt;
      dp.pos.z += railSpeed * 0.2 * dt;
      if (dp.delay <= 0) {
        this.delayedPops.splice(i, 1);
        if (dp.pos.z < 8.0) {
          this.spawnFireball(dp.pos, dp.colorHex, dp.scale, 0.2);
          this.burst(dp.pos, 16, dp.colorHex, 26, 0.95, 0.48, 2.0);
          this.spawnShockwave(dp.pos, dp.colorHex, 8.5, 0.3, true);
        }
      }
    }

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0 || p.pos.z > 10.5) {
        p.active = false;
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.pos.z += (p.vel.z + railSpeed * 0.35) * dt;
      p.vel.multiplyScalar(0.95);

      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;

      const t = p.life / p.maxLife;
      const s = p.scale * t;
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.copy(p.rot);
      this.dummy.scale.set(s, s, s * p.stretch);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // Update HDR fireball cores (white-hot -> bright blast hue -> vanish)
    for (const fb of this.fireballs) {
      if (!fb.active) continue;
      fb.life -= dt;
      fb.mesh.position.z += railSpeed * 0.22 * dt;
      if (fb.life <= 0 || fb.mesh.position.z > 9.0) {
        fb.active = false;
        fb.mesh.visible = false;
        continue;
      }
      const prog = 1 - fb.life / fb.maxLife;
      const easeOut = 1 - Math.pow(1 - prog, 2.5);
      const s = 0.45 + easeOut * fb.maxScale;
      fb.mesh.scale.setScalar(s);
      fb.mesh.rotation.y += dt * 7;
      fb.mesh.rotation.x += dt * 5;
      // Start blazing white-gold, shift into core blast hue
      const whiteMix = Math.max(0, 1 - prog * 2.4);
      fb.mat.color
        .copy(fb.baseColor)
        .lerp(new THREE.Color(0xffffff), whiteMix)
        .multiplyScalar(2.8);
      fb.mat.opacity = Math.max(0, (1 - prog) * (1 - prog) * 0.92);
    }

    // Update pooled dynamic explosion PointLights
    for (const bl of this.blastLights) {
      if (bl.life <= 0) continue;
      bl.life -= dt;
      if (bl.life <= 0) {
        bl.light.intensity = 0;
      } else {
        const t = bl.life / bl.maxLife;
        bl.light.intensity = bl.peakIntensity * t * t;
      }
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        (sw.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const prog = 1 - sw.life / sw.maxLife;
      const s = 0.5 + prog * sw.maxScale;
      sw.mesh.scale.set(s, s, 1);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - prog) * 0.95;
    }
  }

  public clear(): void {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles[i].active = false;
      this.mesh.setMatrixAt(i, zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const fb of this.fireballs) {
      fb.active = false;
      fb.mesh.visible = false;
    }
    for (const bl of this.blastLights) {
      bl.life = 0;
      bl.light.intensity = 0;
    }
    this.delayedPops.length = 0;
    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.shockwaves.length = 0;
  }
}
