import * as THREE from 'three';

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
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

export class ParticlePool {
  private readonly maxParticles = 900;
  private readonly particles: Particle[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly scene: THREE.Scene;
  private readonly shockwaves: Shockwave[] = [];
  private readonly ringGeo: THREE.RingGeometry;
  private cursor = 0;

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

    this.ringGeo = new THREE.RingGeometry(0.82, 1.0, 32);
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
    life = 0.65
  ): void {
    // HDR boosted color so bloom catches it
    const baseColor = new THREE.Color(hexColor).multiplyScalar(2.4);
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      p.active = true;
      p.pos.copy(origin);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = speed * (0.4 + Math.random() * 0.9);
      p.vel.set(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.sin(phi) * Math.sin(theta) * spd,
        Math.cos(phi) * spd
      );
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
      p.scale = scale * (0.55 + Math.random() * 0.9);
      p.maxLife = life * (0.65 + Math.random() * 0.65);
      p.life = p.maxLife;
      p.color.copy(baseColor);
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
    p.maxLife = life;
    p.life = life;
    p.color.setHex(hexColor).multiplyScalar(2.2);
  }

  public spawnShockwave(origin: THREE.Vector3, hexColor: number, maxScale = 14, duration = 0.55): void {
    // Clamp shockwave away from camera near-plane frustum (camera z=14)
    if (origin.z > 9.5) return;
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
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      life: duration,
      maxLife: duration,
      maxScale,
    });
  }

  public update(dt: number, railSpeed: number): void {
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
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

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
    for (const sw of this.shockwaves) {
      this.scene.remove(sw.mesh);
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.shockwaves.length = 0;
  }
}
