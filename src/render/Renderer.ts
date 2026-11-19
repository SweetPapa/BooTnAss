import * as THREE from 'three';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

export class Renderer {
  public readonly webgl: THREE.WebGLRenderer;
  public readonly composer: EffectComposer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  private readonly bloom: BloomEffect;

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.NoToneMapping; // Handled by postprocessing ToneMappingEffect

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07091a');
    this.scene.fog = new THREE.FogExp2('#140b2e', 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.2,
      420
    );
    this.camera.position.set(0, 2.2, 14);

    this.composer = new EffectComposer(this.webgl, {
      frameBufferType: THREE.HalfFloatType,
    });

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloom = new BloomEffect({
      luminanceThreshold: 1.25,
      luminanceSmoothing: 0.2,
      intensity: 0.72,
      mipmapBlur: true,
      radius: 0.52,
    });

    const toneMapping = new ToneMappingEffect({
      mode: ToneMappingMode.ACES_FILMIC,
    });

    const vignette = new VignetteEffect({
      eskil: false,
      offset: 0.24,
      darkness: 0.52,
    });

    const effectPass = new EffectPass(this.camera, this.bloom, toneMapping, vignette);
    this.composer.addPass(effectPass);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.webgl.setSize(w, h);
    this.composer.setSize(w, h);
  };

  public setBloomIntensity(val: number): void {
    this.bloom.intensity = val;
  }

  public render(): void {
    this.composer.render();
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.composer.dispose();
    this.webgl.dispose();
  }
}
