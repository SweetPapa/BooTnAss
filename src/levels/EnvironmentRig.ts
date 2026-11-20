import * as THREE from 'three';
import type { EnvironmentConfig } from './LevelSchema';
import type { TrackCurve } from './TrackCurve';

interface TrackChunk {
  group: THREE.Group;
  baseZ: number;
}

export class EnvironmentRig {
  private readonly scene: THREE.Scene;
  private readonly envGroup = new THREE.Group();
  private readonly scrollingChunks: TrackChunk[] = [];
  private readonly starPoints: THREE.Points;
  private readonly speedLines: THREE.LineSegments;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly dirLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;

  private chunkSpacing = 22;
  private chunkCount = 15;
  private horizonGroup: THREE.Group | null = null;
  private rotatingLandmarks: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.envGroup);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.dirLight = new THREE.DirectionalLight(0x00f0ff, 1.35);
    this.dirLight.position.set(12, 22, 16);
    this.rimLight = new THREE.DirectionalLight(0xff2a85, 1.05);
    this.rimLight.position.set(-18, -8, -24);
    this.scene.add(this.ambientLight, this.dirLight, this.rimLight);

    // Dense deep-space starfield
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 210;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 130;
      starPositions[i * 3 + 2] = -Math.random() * 290;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xd9f4ff,
      size: 0.48,
      transparent: true,
      opacity: 0.88,
    });
    this.starPoints = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starPoints);

    // High-speed racing wind/warp lines
    const lineCount = 56;
    const linePositions = new Float32Array(lineCount * 6);
    for (let i = 0; i < lineCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 13 + Math.random() * 14;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.65;
      const z = -Math.random() * 130;
      linePositions[i * 6] = x;
      linePositions[i * 6 + 1] = y;
      linePositions[i * 6 + 2] = z;
      linePositions[i * 6 + 3] = x;
      linePositions[i * 6 + 4] = y;
      linePositions[i * 6 + 5] = z - 10;
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(0x00f0ff).multiplyScalar(2.5),
      transparent: true,
      opacity: 0.18,
      toneMapped: false,
    });
    this.speedLines = new THREE.LineSegments(lineGeo, lineMat);
    this.scene.add(this.speedLines);
  }

  public applyEnvironment(cfg: EnvironmentConfig): void {
    this.clearChunks();

    this.scene.background = new THREE.Color(cfg.skyColor);
    this.scene.fog = new THREE.FogExp2(cfg.fogColor, cfg.fogDensity * 0.85);
    this.ambientLight.intensity = cfg.ambientIntensity;
    this.dirLight.color.set(cfg.primaryColor);
    this.rimLight.color.set(cfg.secondaryColor);

    const primary = new THREE.Color(cfg.primaryColor);
    const secondary = new THREE.Color(cfg.secondaryColor);

    if (cfg.theme === 'canyon') {
      this.buildCanyonTheme(primary, secondary);
    } else if (cfg.theme === 'asteroid_field') {
      this.buildAsteroidTheme(primary, secondary);
    } else {
      this.buildCyberSpireTheme(primary, secondary);
    }
  }

  /**
   * Builds a glowing neon arcade-racer track deck segment (guardrails + speed chevrons)
   * that bends seamlessly along every twist, turn, climb, and dive!
   */
  private addRacingDeckSegment(
    chunk: THREE.Group,
    index: number,
    primary: THREE.Color,
    secondary: THREE.Color
  ): void {
    // Muted, non-blooming track accents so enemies & bullets POP with 100% clarity!
    const railMat = new THREE.MeshBasicMaterial({
      color: primary.clone().multiplyScalar(0.55),
      transparent: true,
      opacity: 0.72,
    });
    const accentMat = new THREE.MeshBasicMaterial({
      color: secondary.clone().multiplyScalar(0.45),
      transparent: true,
      opacity: 0.6,
    });
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x060916,
      metalness: 0.4,
      roughness: 0.6,
      flatShading: true,
    });

    // Subtle dark racing highway strip underneath play plane
    const deck = new THREE.Mesh(new THREE.BoxGeometry(28, 0.3, this.chunkSpacing + 0.5), deckMat);
    deck.position.set(0, -10.5, 0);
    chunk.add(deck);

    // Sleek left & right highway guardrails
    const railGeo = new THREE.BoxGeometry(0.4, 0.4, this.chunkSpacing + 0.6);
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-14.2, -9.8, 0);
    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(14.2, -9.8, 0);
    chunk.add(leftRail, rightRail);

    // Subtle cross-rib speed lines every segment
    const crossBar = new THREE.Mesh(
      new THREE.BoxGeometry(28.4, 0.14, 0.3),
      index % 2 === 0 ? railMat : accentMat
    );
    crossBar.position.set(0, -10.25, 0);
    chunk.add(crossBar);

    // Racing chevron arrow in center lane every 2nd chunk
    if (index % 2 === 0) {
      const chevL = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.4), accentMat);
      chevL.position.set(-1.25, -10.18, 0);
      chevL.rotation.y = 0.55;
      const chevR = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.4), accentMat);
      chevR.position.set(1.25, -10.18, 0);
      chevR.rotation.y = -0.55;
      chunk.add(chevL, chevR);
    }
  }

  private buildCanyonTheme(primary: THREE.Color, secondary: THREE.Color): void {
    // Iconic Outrun / Synthwave Sliced Horizon Sun + Distant Ringed Cyber-Planet!
    this.horizonGroup = new THREE.Group();
    this.horizonGroup.position.set(0, 16, -280);

    const sunMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ff3d9a'),
      fog: false,
    });
    const sunCore = new THREE.Mesh(new THREE.CircleGeometry(38, 40), sunMat);
    this.horizonGroup.add(sunCore);

    // Horizontal synthwave dark scanline slices across lower half of sun
    const sliceMat = new THREE.MeshBasicMaterial({ color: 0x07091a, fog: false });
    for (let s = 0; s < 6; s++) {
      const y = -6 - s * 4.8;
      const h = 1.1 + s * 0.45;
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(82, h), sliceMat);
      bar.position.set(0, y, 0.5);
      this.horizonGroup.add(bar);
    }

    // Distant Ringed Cyber-Planet on upper-right horizon
    const planetGroup = new THREE.Group();
    planetGroup.position.set(82, 46, -15);
    const planet = new THREE.Mesh(
      new THREE.IcosahedronGeometry(14, 1),
      new THREE.MeshStandardMaterial({
        color: 0x1a2855,
        emissive: primary,
        emissiveIntensity: 0.25,
        flatShading: true,
        fog: false,
      })
    );
    const pRing = new THREE.Mesh(
      new THREE.RingGeometry(18, 25, 32),
      new THREE.MeshBasicMaterial({
        color: primary.clone().multiplyScalar(0.6),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.48,
        fog: false,
      })
    );
    pRing.rotation.set(Math.PI / 2.6, 0.3, 0.2);
    planetGroup.add(planet, pRing);
    this.horizonGroup.add(planetGroup);
    this.rotatingLandmarks.push(planetGroup);

    this.envGroup.add(this.horizonGroup);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d20,
      roughness: 0.8,
      metalness: 0.15,
      flatShading: true,
    });
    const crestMat = new THREE.MeshBasicMaterial({
      color: primary.clone().multiplyScalar(0.38),
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: secondary.clone().multiplyScalar(0.45),
      transparent: true,
      opacity: 0.45,
    });

    this.chunkSpacing = 22;
    this.chunkCount = 15;
    for (let i = 0; i < this.chunkCount; i++) {
      const chunk = new THREE.Group();
      const baseZ = -i * this.chunkSpacing;
      chunk.position.z = baseZ;

      this.addRacingDeckSegment(chunk, i, primary, secondary);

      for (const side of [-1, 1]) {
        const h = 22 + ((i * 7 + (side > 0 ? 5 : 0)) % 14);
        const geo = new THREE.ConeGeometry(12, h, 5);
        const rock = new THREE.Mesh(geo, wallMat);
        rock.position.set(side * (23 + ((i * 3) % 4)), -10 + h * 0.42, 0);
        rock.rotation.y = i * 0.7;
        const wire = new THREE.Mesh(geo, crestMat);
        wire.position.copy(rock.position);
        wire.rotation.copy(rock.rotation);
        wire.scale.setScalar(1.015);
        chunk.add(rock, wire);
      }

      // Overhead neon racing gantry every 3rd chunk (makes turns feel HUGE!)
      if (i % 3 === 0) {
        const arch = new THREE.Mesh(new THREE.TorusGeometry(16.5, 0.22, 6, 20, Math.PI), haloMat);
        arch.position.set(0, -10, 0);
        chunk.add(arch);
      }

      this.envGroup.add(chunk);
      this.scrollingChunks.push({ group: chunk, baseZ });
    }
  }

  private buildAsteroidTheme(primary: THREE.Color, secondary: THREE.Color): void {
    // Colossal Ringed Gas Giant + Shattered Crystal Moon in deep background!
    this.horizonGroup = new THREE.Group();
    this.horizonGroup.position.set(-48, 22, -285);
    const giant = new THREE.Mesh(
      new THREE.IcosahedronGeometry(44, 2),
      new THREE.MeshStandardMaterial({
        color: 0x161036,
        emissive: secondary,
        emissiveIntensity: 0.22,
        flatShading: true,
        fog: false,
      })
    );
    const giantRing = new THREE.Mesh(
      new THREE.RingGeometry(56, 76, 48),
      new THREE.MeshBasicMaterial({
        color: primary.clone().multiplyScalar(0.5),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.38,
        fog: false,
      })
    );
    giantRing.rotation.set(Math.PI / 2.4, -0.25, 0.18);
    this.horizonGroup.add(giant, giantRing);
    this.rotatingLandmarks.push(this.horizonGroup);
    this.envGroup.add(this.horizonGroup);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x0d1324,
      roughness: 0.65,
      metalness: 0.2,
      flatShading: true,
    });
    const edgeMat = new THREE.MeshBasicMaterial({
      color: primary.clone().multiplyScalar(0.38),
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const accentMat = new THREE.MeshBasicMaterial({
      color: secondary.clone().multiplyScalar(0.38),
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });

    this.chunkSpacing = 22;
    this.chunkCount = 15;
    for (let i = 0; i < this.chunkCount; i++) {
      const chunk = new THREE.Group();
      const baseZ = -i * this.chunkSpacing;
      chunk.position.z = baseZ;

      // Galaxy-style floating neon rail guide rings + glowing prism asteroids!
      if (i % 2 === 0) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(16.5, 0.16, 6, 24),
          i % 4 === 0 ? edgeMat : accentMat
        );
        chunk.add(ring);
      }

      for (let k = 0; k < 4; k++) {
        const angle = (i * 1.9 + k * 1.57) % (Math.PI * 2);
        const dist = 19.5 + ((i * 5 + k * 7) % 14);
        const rad = 3.0 + ((i + k * 2) % 4) * 1.1;
        const geo = new THREE.IcosahedronGeometry(rad, 0);
        const m = new THREE.Mesh(geo, rockMat);
        m.position.set(Math.cos(angle) * dist, Math.sin(angle) * dist * 0.65, (k - 1.5) * 5);
        m.rotation.set(i, k, i + k);
        const w = new THREE.Mesh(geo, k % 2 === 0 ? edgeMat : accentMat);
        w.position.copy(m.position);
        w.rotation.copy(m.rotation);
        w.scale.setScalar(1.03);
        chunk.add(m, w);
      }

      this.envGroup.add(chunk);
      this.scrollingChunks.push({ group: chunk, baseZ });
    }
  }

  private buildCyberSpireTheme(primary: THREE.Color, secondary: THREE.Color): void {
    // Colossal Counter-Rotating Dyson Megastructure Rings on the far horizon!
    this.horizonGroup = new THREE.Group();
    this.horizonGroup.position.set(0, 12, -275);
    const dyson1 = new THREE.Mesh(
      new THREE.TorusGeometry(58, 1.8, 6, 36),
      new THREE.MeshBasicMaterial({
        color: primary.clone().multiplyScalar(0.65),
        wireframe: true,
        fog: false,
      })
    );
    const dyson2 = new THREE.Mesh(
      new THREE.TorusGeometry(42, 1.5, 6, 28),
      new THREE.MeshBasicMaterial({
        color: secondary.clone().multiplyScalar(0.65),
        wireframe: true,
        fog: false,
      })
    );
    const dysonCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(16, 1),
      new THREE.MeshBasicMaterial({
        color: primary.clone().multiplyScalar(0.85),
        wireframe: true,
        fog: false,
      })
    );
    this.horizonGroup.add(dyson1, dyson2, dysonCore);
    this.rotatingLandmarks.push(dyson1, dyson2, dysonCore);
    this.envGroup.add(this.horizonGroup);

    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x090d1b,
      metalness: 0.5,
      roughness: 0.45,
      flatShading: true,
    });
    const conduitPrimary = new THREE.MeshBasicMaterial({
      color: primary.clone().multiplyScalar(0.48),
      transparent: true,
      opacity: 0.62,
    });
    const conduitSecondary = new THREE.MeshBasicMaterial({
      color: secondary.clone().multiplyScalar(0.45),
      transparent: true,
      opacity: 0.55,
    });

    this.chunkSpacing = 22;
    this.chunkCount = 15;
    for (let i = 0; i < this.chunkCount; i++) {
      const chunk = new THREE.Group();
      const baseZ = -i * this.chunkSpacing;
      chunk.position.z = baseZ;

      this.addRacingDeckSegment(chunk, i, primary, secondary);

      for (const side of [-1, 1]) {
        const h = 38 + ((i * 11) % 24);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(5.5, h, 5.5), towerMat);
        tower.position.set(side * 21, -11 + h * 0.5, 0);
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, h, 0.45),
          i % 2 === 0 ? conduitPrimary : conduitSecondary
        );
        strip.position.set(side * 18.1, -11 + h * 0.5, 2.6);
        chunk.add(tower, strip);
      }

      if (i % 2 === 0) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(17.5, 0.22, 6, 24),
          i % 4 === 0 ? conduitPrimary : conduitSecondary
        );
        chunk.add(ring);
      }

      this.envGroup.add(chunk);
      this.scrollingChunks.push({ group: chunk, baseZ });
    }
  }

  public update(dt: number, railSpeed: number, isBoosting: boolean, curve: TrackCurve): void {
    const totalLength = this.chunkSpacing * this.chunkCount;
    const off = { dx: 0, dy: 0 };

    for (const c of this.scrollingChunks) {
      c.baseZ += railSpeed * dt;
      if (c.baseZ > 24) {
        c.baseZ -= totalLength;
      }
      curve.offsetAtZ(c.baseZ, off);
      c.group.position.set(off.dx, off.dy, c.baseZ);
      // Subtle horizon tilt into the curve for dynamic space-coaster vibes!
      const depthT = Math.min(1, Math.max(0, -c.baseZ) / 140);
      c.group.rotation.z = -curve.bankRoll * depthT * 0.55;
    }

    if (this.horizonGroup) {
      this.horizonGroup.position.x = curve.curveX * 2.4;
      this.horizonGroup.position.y = 16 + curve.curveY * 1.4;
    }
    this.rotatingLandmarks.forEach((lm, idx) => {
      lm.rotation.y += dt * (idx % 2 === 0 ? 0.14 : -0.22);
      lm.rotation.z += dt * (idx % 2 === 0 ? 0.08 : -0.12);
    });

    // Scroll stars
    const posAttr = this.starPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const starSpeed = railSpeed * (isBoosting ? 2.6 : 1.3);
    for (let i = 0; i < posAttr.count; i++) {
      let z = posAttr.getZ(i) + starSpeed * dt;
      if (z > 16) z -= 290;
      posAttr.setZ(i, z);
    }
    posAttr.needsUpdate = true;

    // Racing wind/speed lines (always subtle at high speed, blazing bright when boosting!)
    const lineMat = this.speedLines.material as THREE.LineBasicMaterial;
    const targetOpacity = isBoosting ? 0.92 : 0.22;
    lineMat.opacity += (targetOpacity - lineMat.opacity) * Math.min(1, dt * 8);
    const lp = this.speedLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const lineSpd = railSpeed * (isBoosting ? 3.5 : 1.9);
    for (let i = 0; i < lp.count; i += 2) {
      let z1 = lp.getZ(i) + lineSpd * dt;
      if (z1 > 15) z1 -= 130;
      lp.setZ(i, z1);
      lp.setZ(i + 1, z1 - (isBoosting ? 13 : 7));
    }
    lp.needsUpdate = true;
  }

  private clearChunks(): void {
    for (const c of this.scrollingChunks) {
      this.envGroup.remove(c.group);
    }
    this.scrollingChunks.length = 0;
    if (this.horizonGroup) {
      this.envGroup.remove(this.horizonGroup);
      this.horizonGroup = null;
    }
    this.rotatingLandmarks.length = 0;
  }
}
