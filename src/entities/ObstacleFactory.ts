import * as THREE from 'three';
import type { ObstacleEvent, ObstacleKind } from '../levels/LevelSchema';
import type { TrackCurve } from '../levels/TrackCurve';

export interface ObstacleEntity {
  id: number;
  kind: ObstacleKind;
  mesh: THREE.Group;
  logicalPos: THREE.Vector3; // True play-plane position (used for fair z=0 collision)
  scale: number;
  rotationSpeed: number;
  driftX: number;
  driftY: number;
  alive: boolean;
  triggered: boolean;
  destructible: boolean;
  hp: number;
  hitRadius: number;
  halfExtents?: THREE.Vector3;
}

let nextObstacleId = 1;

export class ObstacleFactory {
  public readonly obstacles: ObstacleEntity[] = [];
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawn(ev: ObstacleEvent, primaryHex: string, secondaryHex: string): ObstacleEntity {
    const group = new THREE.Group();
    const scale = ev.scale ?? 1.0;
    let destructible = false;
    let hp = 9999;
    let hitRadius = 2.6 * scale;
    let halfExtents: THREE.Vector3 | undefined;

    // High-contrast universal arcade color coding (no color blur!):
    // GOOD = Gold (boost_ring) & Neon Green (slalom_gate)
    // DANGER = Solid light-slate/charcoal chassis + blazing Hazard Orange-Red (0xff4422)
    const primaryColor = new THREE.Color(primaryHex);
    const dangerColor = new THREE.Color(0xff4422);
    void secondaryHex;

    if (ev.kind === 'boost_ring') {
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xffd447,
        emissive: new THREE.Color(0xffd447),
        emissiveIntensity: 3.1,
        flatShading: true,
      });
      const innerMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: new THREE.Color(0x00f0ff),
        emissiveIntensity: 2.8,
        flatShading: true,
      });
      const outer = new THREE.Mesh(new THREE.TorusGeometry(3.1 * scale, 0.24, 6, 18), ringMat);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(2.45 * scale, 0.1, 6, 18), innerMat);
      group.add(outer, inner);
      hitRadius = 3.55 * scale;
    } else if (ev.kind === 'slalom_gate') {
      // High-speed arcade racing turbo checkpoint gate!
      const neonGreen = new THREE.MeshStandardMaterial({
        color: 0x00ff88,
        emissive: new THREE.Color(0x00ff88),
        emissiveIntensity: 3.4,
        flatShading: true,
      });
      const postGeo = new THREE.CylinderGeometry(0.26, 0.26, 7.5 * scale, 6);
      const leftPost = new THREE.Mesh(postGeo, neonGreen);
      leftPost.position.set(-3.4 * scale, 0, 0);
      const rightPost = new THREE.Mesh(postGeo, neonGreen);
      rightPost.position.set(3.4 * scale, 0, 0);

      // Glowing racing chevron arrows pointing forward
      const barGeo = new THREE.BoxGeometry(6.8 * scale, 0.24, 0.24);
      const topBar = new THREE.Mesh(barGeo, neonGreen);
      topBar.position.set(0, 3.6 * scale, 0);
      const botBar = new THREE.Mesh(barGeo, neonGreen);
      botBar.position.set(0, -3.6 * scale, 0);

      group.add(leftPost, rightPost, topBar, botBar);
      hitRadius = 3.8 * scale;
    } else if (ev.kind === 'weapon_crate') {
      // Collectible floating Weapon Upgrade / Nova Bomb power core!
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xd946ff,
        emissive: new THREE.Color(0xc84bff),
        emissiveIntensity: 3.0,
        flatShading: true,
      });
      const haloMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: new THREE.Color(0x00f0ff),
        emissiveIntensity: 2.6,
        flatShading: true,
      });
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.35 * scale, 0), coreMat);
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.3 * scale, 0.14, 6, 16), haloMat);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.3 * scale, 0.14, 6, 16), coreMat);
      ring2.rotation.x = Math.PI / 2;
      group.add(core, ring1, ring2);
      hitRadius = 3.2 * scale;
    } else if (ev.kind === 'spinner_cross') {
      // Giant 4-blade rotating neon X-turbine right across center screen!
      const bladeMat = new THREE.MeshStandardMaterial({
        color: dangerColor,
        emissive: dangerColor,
        emissiveIntensity: 2.6,
        flatShading: true,
      });
      const hubMat = new THREE.MeshStandardMaterial({
        color: 0xc2cde0,
        metalness: 0.4,
        roughness: 0.35,
        flatShading: true,
      });
      const len = 14.5 * scale;
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, len, 8), bladeMat);
      b1.rotation.z = Math.PI / 2;
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, len, 8), bladeMat);
      const hub = new THREE.Mesh(new THREE.OctahedronGeometry(1.45 * scale, 0), hubMat);
      group.add(b1, b2, hub);
      hitRadius = len * 0.5;
      halfExtents = new THREE.Vector3(len * 0.5, 0.9, 1.3);
    } else if (ev.kind === 'debris_field') {
      // Destructible cluster of glowing plasma mines right in the middle lane!
      destructible = true;
      hp = 36 * scale;
      hitRadius = 3.1 * scale;

      const mineMat = new THREE.MeshStandardMaterial({
        color: 0xff3355,
        emissive: new THREE.Color(0xff2a55),
        emissiveIntensity: 3.2,
        flatShading: true,
      });
      const shellMat = new THREE.MeshStandardMaterial({
        color: 0x1e182c,
        metalness: 0.6,
        roughness: 0.35,
        flatShading: true,
      });

      const offsets = [
        [0, 0, 0],
        [-1.8, 1.2, 0.6],
        [1.8, -1.1, -0.5],
        [0.4, -1.7, 0.8],
      ];
      for (const [ox, oy, oz] of offsets) {
        const sub = new THREE.Group();
        sub.position.set(ox * scale, oy * scale, oz * scale);
        sub.add(
          new THREE.Mesh(new THREE.OctahedronGeometry(0.95 * scale, 0), shellMat),
          new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * scale, 0), mineMat)
        );
        group.add(sub);
      }
    } else if (ev.kind === 'arch_gate') {
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x161b36,
        metalness: 0.45,
        roughness: 0.4,
        flatShading: true,
      });
      const trimMat = new THREE.MeshStandardMaterial({
        color: primaryColor,
        emissive: primaryColor,
        emissiveIntensity: 2.8,
        flatShading: true,
      });

      const gap = 3.8 * scale;
      const pillarH = 18 * scale;
      const pillarGeo = new THREE.BoxGeometry(2.6 * scale, pillarH, 2.8 * scale);

      const leftP = new THREE.Mesh(pillarGeo, pillarMat);
      leftP.position.set(-gap - 0.8 * scale, 0, 0);
      const rightP = new THREE.Mesh(pillarGeo, pillarMat);
      rightP.position.set(gap + 0.8 * scale, 0, 0);

      const topBar = new THREE.Mesh(
        new THREE.BoxGeometry(gap * 2 + 4.4 * scale, 2.2 * scale, 2.8 * scale),
        pillarMat
      );
      topBar.position.set(0, 4.4 * scale, 0);

      const trimTop = new THREE.Mesh(
        new THREE.BoxGeometry(gap * 2 + 4.5 * scale, 0.3, 3.0 * scale),
        trimMat
      );
      trimTop.position.set(0, 3.3 * scale, 0);

      const trimL = new THREE.Mesh(new THREE.BoxGeometry(0.3, pillarH, 3.0 * scale), trimMat);
      trimL.position.set(-gap + 0.5 * scale, 0, 0);
      const trimR = new THREE.Mesh(new THREE.BoxGeometry(0.3, pillarH, 3.0 * scale), trimMat);
      trimR.position.set(gap - 0.5 * scale, 0, 0);

      group.add(leftP, rightP, topBar, trimTop, trimL, trimR);
      hitRadius = gap;
    } else if (ev.kind === 'monolith_pillar') {
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x3b455e,
        metalness: 0.35,
        roughness: 0.45,
        flatShading: true,
      });
      const edgeMat = new THREE.MeshStandardMaterial({
        color: dangerColor,
        emissive: dangerColor,
        emissiveIntensity: 2.4,
        flatShading: true,
      });
      const w = 2.6 * scale;
      const h = 24;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), pillarMat);
      const stripF = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, h, w + 0.25), edgeMat);
      const stripS = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, h, w * 0.24), edgeMat);
      group.add(body, stripF, stripS);
      hitRadius = w * 0.62;
      halfExtents = new THREE.Vector3(w * 0.55, h * 0.5, w * 0.55);
    } else if (ev.kind === 'rogue_asteroid') {
      destructible = true;
      hp = 46 * scale;
      hitRadius = 2.85 * scale;

      const rockMat = new THREE.MeshStandardMaterial({
        color: 0x6a5c52,
        emissive: dangerColor,
        emissiveIntensity: 0.35,
        metalness: 0.2,
        roughness: 0.65,
        flatShading: true,
      });
      const veinMat = new THREE.MeshBasicMaterial({
        color: dangerColor.clone().multiplyScalar(1.8),
        wireframe: true,
        toneMapped: false,
      });
      const geo = new THREE.DodecahedronGeometry(2.55 * scale, 0);
      const rock = new THREE.Mesh(geo, rockMat);
      const veins = new THREE.Mesh(geo, veinMat);
      veins.scale.setScalar(1.04);
      group.add(rock, veins);
    } else if (ev.kind === 'crystal_cluster') {
      destructible = true;
      hp = 40 * scale;
      hitRadius = 2.85 * scale;

      const crystalMat = new THREE.MeshStandardMaterial({
        color: 0x182b48,
        emissive: primaryColor,
        emissiveIntensity: 1.0,
        metalness: 0.3,
        roughness: 0.2,
        flatShading: true,
      });
      const edgeMat = new THREE.MeshBasicMaterial({
        color: primaryColor.clone().multiplyScalar(2.5),
        wireframe: true,
        toneMapped: false,
      });

      const mainGeo = new THREE.OctahedronGeometry(2.3 * scale, 0);
      mainGeo.scale(1.0, 1.35, 1.0);
      const main = new THREE.Mesh(mainGeo, crystalMat);
      const wire = new THREE.Mesh(mainGeo, edgeMat);
      wire.scale.setScalar(1.04);
      group.add(main, wire);

      for (let k = 0; k < 3; k++) {
        const sub = new THREE.Mesh(new THREE.OctahedronGeometry(1.15 * scale, 0), crystalMat);
        const a = (k / 3) * Math.PI * 2;
        sub.position.set(Math.cos(a) * 1.55 * scale, Math.sin(a) * 1.2 * scale, (k - 1) * 0.5);
        sub.rotation.set(k, k * 1.5, 0);
        group.add(sub);
      }
    } else if (ev.kind === 'laser_bar') {
      const length = 14.5 * scale;
      const beamMat = new THREE.MeshStandardMaterial({
        color: dangerColor,
        emissive: dangerColor,
        emissiveIntensity: 2.6,
        flatShading: true,
      });
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xc2cde0,
        metalness: 0.45,
        roughness: 0.3,
        flatShading: true,
      });

      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, length, 8), beamMat);
      beam.rotation.z = Math.PI / 2;
      group.add(beam);

      const capL = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), capMat);
      capL.position.set(-length / 2, 0, 0);
      const capR = new THREE.Mesh(new THREE.OctahedronGeometry(1.15, 0), capMat);
      capR.position.set(length / 2, 0, 0);
      group.add(capL, capR);

      hitRadius = length * 0.5;
      halfExtents = new THREE.Vector3(length * 0.5, 1.0, 1.3);
    }

    const logicalPos = new THREE.Vector3(ev.position.x, ev.position.y, -185);
    group.position.copy(logicalPos);
    this.scene.add(group);

    const entity: ObstacleEntity = {
      id: nextObstacleId++,
      kind: ev.kind,
      mesh: group,
      logicalPos,
      scale,
      rotationSpeed: ev.rotationSpeed ?? 0,
      driftX: ev.driftX ?? 0,
      driftY: ev.driftY ?? 0,
      alive: true,
      triggered: false,
      destructible,
      hp,
      hitRadius,
      halfExtents,
    };
    this.obstacles.push(entity);
    return entity;
  }

  public damageCrystal(obs: ObstacleEntity, dmg: number): boolean {
    if (!obs.destructible || !obs.alive) return false;
    obs.hp -= dmg;
    if (obs.hp <= 0) {
      obs.alive = false;
      this.scene.remove(obs.mesh);
      return true;
    }
    return false;
  }

  public update(dt: number, railSpeed: number, curve: TrackCurve): void {
    const off = { dx: 0, dy: 0 };
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      if (!o.alive) {
        this.obstacles.splice(i, 1);
        continue;
      }

      o.logicalPos.z += railSpeed * dt;
      if (o.driftX !== 0) o.logicalPos.x += o.driftX * dt;
      if (o.driftY !== 0) o.logicalPos.y += o.driftY * dt;

      // Visually bend along the curved racing spline ahead of the player!
      curve.offsetAtZ(o.logicalPos.z, off);
      o.mesh.position.set(o.logicalPos.x + off.dx, o.logicalPos.y + off.dy, o.logicalPos.z);

      if (o.kind === 'boost_ring') {
        o.mesh.rotation.z += dt * 1.6;
      } else if (o.kind === 'weapon_crate') {
        o.mesh.rotation.y += dt * 2.4;
        o.mesh.rotation.x += dt * 1.4;
      } else if (o.kind === 'crystal_cluster' || o.kind === 'rogue_asteroid' || o.kind === 'debris_field') {
        o.mesh.rotation.y += dt * (0.9 + o.rotationSpeed);
        o.mesh.rotation.x += dt * 0.65;
      } else if (o.kind === 'spinner_cross') {
        o.mesh.rotation.z += (o.rotationSpeed || 1.1) * dt;
      } else if (o.rotationSpeed !== 0) {
        o.mesh.rotation.z += o.rotationSpeed * dt;
      }

      if (o.logicalPos.z > 24) {
        o.alive = false;
        this.scene.remove(o.mesh);
        this.obstacles.splice(i, 1);
      }
    }
  }

  public clear(): void {
    for (const o of this.obstacles) {
      this.scene.remove(o.mesh);
    }
    this.obstacles.length = 0;
  }
}
