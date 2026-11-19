### Best Approach & Tech Stack

For a *Star Fox 64* meets neon arcade shooter built with an AI coding agent, **skip Unity, Unreal, and Godot**. GUI-heavy engines rely on binary/nested scene files (`.unity`, `.tscn`) that AI agents struggle to edit cleanly. A **100% code-first web stack** lets the AI write, refactor, and verify every mesh, shader, and level in plain text with instant hot-reload.

| Layer | Recommended Tech | Why It Fits |
| --- | --- | --- |
| **3D Engine** | **Three.js (`three@0.187+`)** | AI models know Three.js inside out. Procedural low-poly geometry + glowing materials require zero external 3D modeling to look great. |
| **Language / Build** | **TypeScript + Vite** | Strict types catch AI hallucinations at compile time; Vite gives sub-second hot reload while tuning game feel. |
| **Visuals / Glow** | **`pmndrs/postprocessing`** (`BloomEffect`, `ToneMappingEffect`) | Single-pass merged HDR bloom (`HalfFloatType`) is what turns simple flat-shaded shapes into vibrant, *Geometry Wars*/*Rez*-style eye candy. *(Three.js r187 also supports `WebGPURenderer` with automatic WebGL 2 fallback, though `WebGLRenderer` + `postprocessing` is currently the most reliable target for AI-generated shaders.)* |
| **Level Authoring** | **YAML (`js-yaml`) + `zod**` | Human- and LLM-friendly declarative level scripts, strictly validated on load so malformed levels fail loudly with exact line errors. |
| **Audio** | **Web Audio API (Procedural Synth)** | Zero asset dependencies—synthesizes crisp arcade laser pews, lock-on chirps, shield deflects, and sub-bass explosions in code. |
| **Packaging (Optional)** | **Browser (default) or Tauri/Electron** | Runs anywhere immediately; trivial to wrap as a native desktop app later. |

**The Secret to "Simple and Pretty" Graphics:**
Don't use textures. Use **flat-shaded low-poly primitives** (`flatShading: true`), dark moody fog, **high-emissive accent edges/cores** that trigger HDR bloom, and **`InstancedMesh`** for hundreds of rapid-fire bolts and glowing explosion shards at a locked 60 FPS.

---

### Requirements & Design Document (Ready for Your AI Coder)

Save the block below as `SPEC.md` in your repo root and instruct your AI coder to implement it phase by phase.

```markdown
# Project: STARBURST // On-Rails Arcade Space Shooter

## 1. High-Level Vision
A vibrant, high-speed 3D on-rails space shooter combining the tight rail-flight, barrel rolls, and lock-on charge shots of *Star Fox 64* with the rapid-fire energy, glowing neon aesthetics, and explosive particle feedback of modern arcade shooters (*Rez*, *Geometry Wars*).

### Core Design Pillars
1. **Simple, Striking Visuals**: No external textures or 3D models required. All ships, terrain, rings, and bosses are built procedurally from flat-shaded low-poly geometry, wireframe accents, and HDR emissive materials driven by bloom post-processing.
2. **Hyper-Responsive Arcade Feel**: Instant movement, rapid-fire lasers, satisfying lock-on missile volleys, punchy hitstop/screen-shake, and a score combo multiplier.
3. **Data-Driven Levels**: Every level is defined in a standalone YAML file validated by a strict Zod schema. Adding a new level requires zero engine code changes.

---

## 2. Tech Stack & Architecture
- **Runtime**: TypeScript (strict mode), Vite, Three.js (`three`), `postprocessing` (Bloom + ACES Filmic Tone Mapping), `js-yaml`, `zod`.
- **Target Performance**: Locked 60 FPS using a fixed-timestep simulation loop (`dt = 1/60`, clamped accumulator) decoupled from rendering.

### Directory Structure
```text
src/
├── main.ts                 # Entry point, canvas mount, game loop
├── engine/
│   ├── GameState.ts        # Title, Playing, LevelClear, GameOver, Victory
│   ├── InputManager.ts     # Keyboard + Mouse + Gamepad unified input
│   ├── CollisionSystem.ts  # Fast sphere/AABB swept checks (player, bolts, enemies, obstacles)
│   ├── ParticlePool.ts     # InstancedMesh pooled sparks, debris, engine trails
│   └── AudioSynth.ts       # Procedural Web Audio API SFX & subtle pulse
├── entities/
│   ├── PlayerShip.ts       # Movement bounds, banking, barrel roll, weapons, shield
│   ├── ProjectilePool.ts   # InstancedMesh player lasers, homing missiles, enemy plasma
│   ├── EnemyFactory.ts     # Procedural meshes + AI behaviors (scout, weaver, turret, interceptor)
│   ├── BossController.ts   # Multi-part / multi-phase boss state machines
│   └── ObstacleFactory.ts  # Arches, crystal asteroids, laser gates, boost rings
├── levels/
│   ├── LevelSchema.ts      # Zod schema & TypeScript types for YAML levels
│   ├── LevelLoader.ts      # Loads, parses, validates YAML; drives timeline spawner
│   ├── EnvironmentRig.ts   # Procedural scrolling terrain/starfield/fog/lighting per level
│   └── data/
│       ├── level-01-neon-canyon.yaml
│       ├── level-02-prism-belt.yaml
│       └── level-03-hyper-spire.yaml
├── render/
│   └── Renderer.ts         # WebGLRenderer, EffectComposer, HalfFloatType HDR Bloom
└── ui/
    └── HUD.ts              # Minimal neon HUD: Shield, Boost, Combo, Score, Boss HP, Reticle
```

---

## 3. Controls & Core Mechanics

### Flight & Aiming
- **Rail Space**: Camera advances automatically along `-Z`. Player moves freely within a bounded 2D play plane (`X: [-12, 12]`, `Y: [-7, 7]`) while the camera subtly tracks player position with spring damping.
- **Movement**: `WASD` / Arrow Keys (or Left Stick). Ship banks smoothly into turns.
- **Aiming**: Dual-depth reticle (near + far crosshair) projects forward from the ship's nose; optional Mouse Aim mode subtly steers the reticle toward the cursor with gentle aim-magnetism on enemies within a small cone.

### Combat & Maneuvers
- **Rapid Fire (`Space` / Left Click / Hold)**: Fires twin neon plasma bolts at 10–12 shots/sec. Upgrades to triple-spread when Combo ≥ 10x (temporary overdrive).
- **Charge Lock-On (`Hold Shift` or Right Click, release to fire)**: Locks onto up to 4 targets in reticle range with glowing diamond UI brackets and rising synth chirps; releasing fires curving homing energy missiles.
- **Barrel Roll (`Q` / `E` / Double-tap A or D)**: 0.45s 360° roll with brief invulnerability frames; **deflects incoming enemy plasma bolts** with a bright flash and metallic ping.
- **Boost / Brake (`W`+`Tab` or `F` / `C`)**: Short speed burst (with FOV punch and speed lines) to clear closing gates or dodge barrages, fueled by a regenerating boost meter.

### Scoring & Feedback ("Juice")
- **Combo Multiplier**: Consecutive kills without taking damage increment multiplier (`1x` → `16x`); decays after 4 seconds without a hit.
- **Hit Feedback**: Enemies flash pure white for 50ms on hit; kills burst into 15–30 glowing low-poly shards via `ParticlePool`; boss phase breaks trigger 80ms hitstop + radial shockwave ring.
- **Rings**: Flying through glowing golden/cyan rings restores +15% shield and grants bonus score.

---

## 4. Visual Style Guide
- **Rendering**: Dark saturated void/fog background, `MeshStandardMaterial` with `flatShading: true` for structural bodies, and `emissiveIntensity: 2.0–4.0` on weapons, engines, trim, and weak points so only accents trigger `BloomEffect` (`luminanceThreshold: 1.0`, `mipmapBlur: true`).
- **Player Ship**: Sleek angular low-poly starfighter (delta wings, twin cyan thrusters, glowing cockpit canopy, dynamic wingtip ribbons).
- **Readability Rule**: Player projectiles = **Electric Cyan / Gold**; Enemy projectiles = **Hot Magenta / Crimson** (high contrast, always larger/brighter than background stars).

---

## 5. Programmatic Level Format (YAML Schema)
Levels are authored in `src/levels/data/*.yaml` and validated via `LevelSchema.ts`. Timeline events fire based on `atDistance` (world units traveled along the rail).

### Schema Example
```yaml
id: "neon-canyon"
name: "01 // NEON CANYON"
subtitle: "Outer Rim Trench Run"
baseSpeed: 48
length: 4200

environment:
  theme: "canyon"            # "canyon" | "asteroid_field" | "cyber_spire"
  skyColor: "#07091a"
  fogColor: "#140b2e"
  fogDensity: 0.0085
  primaryColor: "#00f0ff"    # Grid / rim highlight
  secondaryColor: "#ff2a85"  # Accent lighting
  ambientIntensity: 0.4

timeline:
  - atDistance: 150
    type: "banner"
    text: "SYSTEMS ONLINE // ENGAGE"

  - atDistance: 300
    type: "wave"
    enemy: "scout"           # scout | weaver | turret | interceptor
    formation: "v_shape"     # line | v_shape | spiral | flanking
    count: 5
    spawnOffset: { x: 0, y: 2 }
    behavior: "swoop_pass"   # straight | sine_weave | swoop_pass | hover_fire
    fireRate: 0.8

  - atDistance: 650
    type: "obstacle"
    kind: "arch_gate"        # arch_gate | crystal_cluster | laser_bar | boost_ring
    position: { x: -3, y: 0 }
    scale: 1.2
    rotationSpeed: 0.0

  - atDistance: 3600
    type: "boss"
    bossId: "aegis_dreadnought"
    name: "AEGIS DREADNOUGHT"
    hp: 600
    phases: 2
```

### Schema Validation Rules (`zod`)
- Every YAML file must pass `LevelSchema.parse()` at startup.
- Invalid fields must render a readable on-screen error overlay with the exact YAML path (so new levels can be debugged in seconds).
- Include a URL query param (`?level=neon-canyon&startDist=3400`) to jump directly to any level or boss for fast testing.

---

## 6. Launch Content: 3 Complete Levels

### Level 1: Neon Canyon (`level-01-neon-canyon.yaml`)
- **Theme**: Deep indigo sky, glowing wireframe-crested low-poly canyon walls on left/right, synthwave magenta sun on the horizon.
- **Pacing (~90–120s)**: Introduces scout formations, glowing canyon arches to weave through, shield boost rings, and sweeping weavers.
- **Boss — Aegis Dreadnought**: Wide armored carrier flying ahead of the player.
  - *Phase 1*: Destroy 4 glowing wing turrets firing staggered plasma spreads.
  - *Phase 2*: Central reactor opens; fires sweeping laser walls (dodge or barrel-roll) while spawning scout drones.

### Level 2: Prism Asteroid Belt (`level-02-prism-belt.yaml`)
- **Theme**: Pitch-black nebula with teal/violet volumetric fog and giant faceted floating crystal asteroids that refract/glow at the edges.
- **Pacing (~120s)**: Higher density. Features destructible crystal clusters (shatter into glittering shards for bonus points), rotating laser bars, and flanking interceptors.
- **Boss — Octa-Core Sentinel**: Rotating geometric octahedron with 4 orbiting shield plates.
  - *Phase 1*: Shoot through gaps in the spinning plates to hit the core; plates periodically launch radial bullet rings.
  - *Phase 2*: Plates break off into independent orbiting turrets while the core charges high-speed homing beams.

### Level 3: Hyper-Grid Spire (`level-03-hyper-spire.yaml`)
- **Theme**: High-velocity cyber-trench made of pulsing gold/cyan energy conduits, warp-speed light rings, and vertical monolith towers.
- **Pacing (~120–150s)**: Fast rail speed (`baseSpeed: 64`). Tight weaving through monoliths, dual-turret gauntlets, and rapid interceptor waves.
- **Boss — Solaris Leviathan**: Multi-segmented glowing serpent/warship.
  - *Phase 1*: Destructible flank pods firing cross-hatch laser patterns.
  - *Phase 2*: Core overdrive—alternates between missile barrages (ideal for barrel-roll deflection) and narrow safe-zone beam sweeps.

---

## 7. Phased Implementation Plan (Follow in Order)

### Phase 1: Core Flight & Visual Vertical Slice
- Scaffold Vite + TypeScript + Three.js + `postprocessing` (`HalfFloatType` Bloom).
- Implement `PlayerShip` (procedural low-poly mesh, smooth banking, bounded X/Y movement, barrel roll, dual-depth reticle).
- Implement `ProjectilePool` (`InstancedMesh`) with rapid-fire lasers and `AudioSynth` laser sound.
- Add scrolling starfield + glowing ground grid so speed feels awesome immediately.
- **Exit Criteria**: Ship flies, banks, barrel-rolls, and shoots glowing cyan lasers at 60 FPS with crisp bloom.

### Phase 2: Combat Loop, Lock-On & Juice
- Build `EnemyFactory` (all 4 enemy types with distinct low-poly silhouettes) and `ParticlePool` (`InstancedMesh` explosions).
- Implement CollisionSystem, enemy projectiles, barrel-roll deflection, and Charge Lock-On missiles.
- Add `HUD.ts` (shield bar, boost bar, combo counter, score, lock-on brackets).
- **Exit Criteria**: Destroying waves feels punchy; barrel rolls visibly deflect magenta shots; lock-on missiles curve cleanly into targets.

### Phase 3: YAML Level Engine & Environment Rigs
- Build `LevelSchema.ts` (Zod) + `LevelLoader.ts` + `?level=`/`?startDist=` debug hooks.
- Build `EnvironmentRig.ts` supporting `canyon`, `asteroid_field`, and `cyber_spire` themes.
- Build `ObstacleFactory.ts` (arches, destructible crystals, laser bars, boost rings).
- **Exit Criteria**: Dropping a new `.yaml` file into `src/levels/data/` automatically registers it in the Level Select menu and plays cleanly.

### Phase 4: The 3 Levels, Bosses & Polish
- Implement `BossController.ts` with all 3 multi-phase bosses and boss HP bar.
- Author and playtest `level-01`, `level-02`, and `level-03` YAML files for escalating difficulty and rhythm.
- Add Title Screen, Level Select, Level Clear tally (Accuracy, Max Combo, Shield Bonus, S/A/B/C Rank), and Game Over / Retry flow.
- **Exit Criteria**: Full 3-level playthrough works end-to-end with zero console errors and consistent 60 FPS.

```

---

### Two Tips Before Handing This to Your AI Coder

* **Have it build Phase 1 first and playtest the feel before Phase 2.** Rail shooters live or die on movement responsiveness, camera lag, and laser fire rate—tweaking those numbers takes 2 minutes in Phase 1 and saves rewrites later.
* **Use the `?level=&startDist=` query parameter** built into the spec so you can immediately warp straight to a boss or tricky obstacle sequence when tuning YAML files.

Want me to also generate a standalone **Level Authoring Prompt** you can feed to an LLM later to auto-generate balanced new YAML levels on demand?

MAJOR important note, game needs to have an opening crawl story thing and should be configurable via txt file or something
