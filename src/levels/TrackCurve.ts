import * as THREE from 'three';

export interface CurveOffset {
  dx: number;
  dy: number;
}

export type TrackStuntKind = 'loop' | 'corkscrew' | 'dive' | 'slalom_wave';

/**
 * Drives dramatic dynamic space-coaster & arcade-racer twists, turns,
 * vertical crests/dives, 360-degree vertical loops, corkscrew tunnels, and horizon banking!
 * At z = 0 (the player plane), offset is always (0, 0) so aiming & hitboxes stay razor-sharp.
 * Ahead of the player (z < 0), the entire track, scenery, and approaching obstacles bend smoothly!
 */
export class TrackCurve {
  public curveX = 0; // Horizontal bend strength (-34..34)
  public curveY = 0; // Vertical crest/dive/loop strength (-32..42)
  public bankRoll = 0; // Smooth camera horizon roll
  public tunnelTwist = 0; // Extra helical twist on track chunks ahead during corkscrews/loops
  public cameraPitchOffset = 0; // Extra camera pitch excitement during loops/dives
  public horizonLoopAngle = 0; // Sweeps horizon landmark through 360-degree loop arc
  public stuntSpeedMult = 1.0; // Automatic roller-coaster speed rush during stunts
  public stuntFovBonus = 0; // Extra dynamic FOV punch during stunts

  public activeStunt: TrackStuntKind | null = null;
  private stuntElapsed = 0;
  private stuntDuration = 4.8;

  private targetX = 0;
  private targetY = 0;
  private targetRoll = 0;

  public triggerStunt(stunt: TrackStuntKind, duration = 4.8): void {
    this.activeStunt = stunt;
    this.stuntElapsed = 0;
    this.stuntDuration = Math.max(2.2, duration);
  }

  public update(dt: number, distance: number, levelIndex: number, isBossActive: boolean): void {
    // Rich multi-frequency spline: dramatic sweeping turns + snappy S-chicanes + big coaster hills/dives
    const d = distance * 0.0046;
    const freqScale = 1 + levelIndex * 0.16;

    const sweepX =
      Math.sin(d * 1.18 * freqScale) * 21.5 +
      Math.sin(d * 2.85 * freqScale + 1.3) * 12.0 +
      Math.cos(d * 0.56) * 8.5;

    const sweepY =
      Math.sin(d * 0.96 * freqScale + 0.7) * 13.5 +
      Math.cos(d * 2.25 * freqScale) * 7.0;

    // Damp gently during boss arena so boss duels stay readable while still feeling dynamic
    const damp = isBossActive ? 0.22 : 1.0;

    let tx = THREE.MathUtils.clamp(sweepX * damp, -30, 30);
    let ty = THREE.MathUtils.clamp(sweepY * damp, -18, 18);
    let tRoll = THREE.MathUtils.clamp(-tx * 0.013, -0.38, 0.38);
    let tTwist = 0;
    let tPitch = 0;
    let tHorizon = 0;
    let tSpd = 1.0;
    let tFov = 0;

    if (this.activeStunt && !isBossActive) {
      this.stuntElapsed += dt;
      const p = Math.min(1, this.stuntElapsed / this.stuntDuration);
      const env = Math.sin(p * Math.PI); // smooth 0 -> 1 -> 0 bell envelope

      if (this.activeStunt === 'loop') {
        // 360-DEGREE VERTICAL ROLLERCOASTER LOOP!
        // Track surges sharply skyward into a massive glowing arc while horizon sweeps 360 deg!
        tx = Math.sin(p * Math.PI * 2) * 8.0;
        ty = 40.0 * env + Math.sin(p * Math.PI * 2) * 8.0;
        tRoll = Math.sin(p * Math.PI * 2) * 0.48;
        tTwist = env * 0.35;
        tPitch = Math.sin(p * Math.PI * 2) * 0.24;
        tHorizon = p * Math.PI * 2;
        tSpd = 1.0 + 0.32 * env;
        tFov = 14 * env;
      } else if (this.activeStunt === 'corkscrew') {
        // 360-DEGREE GRAVITY CORKSCREW BARREL TUNNEL!
        // Smooth eased full 360-degree camera & tunnel barrel rotation!
        const eased = p * p * (3 - 2 * p);
        const angle = eased * Math.PI * 2;
        tx = Math.cos(angle) * 28.0 * env;
        ty = Math.sin(angle) * 18.0 * env;
        tRoll = angle;
        tTwist = env * 1.45;
        tPitch = Math.sin(angle) * 0.08;
        tSpd = 1.0 + 0.24 * env;
        tFov = 11 * env;
      } else if (this.activeStunt === 'dive') {
        // MASSIVE COASTER CREST -> HYPER-PLUNGE DROP -> ROCKET PULL-UP!
        const diveWave = p < 0.28 ? Math.sin((p / 0.28) * Math.PI * 0.5) * 24 : Math.cos(((p - 0.28) / 0.72) * Math.PI) * 32 - 6;
        tx = Math.sin(p * Math.PI * 2) * 14;
        ty = diveWave;
        tRoll = -tx * 0.018;
        tPitch = (p > 0.28 && p < 0.78 ? -0.22 : 0.14) * env;
        tSpd = 1.0 + (p > 0.28 ? 0.38 : 0.12) * env;
        tFov = (p > 0.28 ? 16 : 5) * env;
      } else if (this.activeStunt === 'slalom_wave') {
        // HIGH-G SNAPPY S-CHICANE DRIFT GAUNTLET!
        const sWave = Math.sin(p * Math.PI * 4);
        tx = sWave * 33.0 * Math.min(1, env * 1.8);
        ty = Math.cos(p * Math.PI * 2) * 11.0 * env;
        tRoll = -sWave * 0.52 * Math.min(1, env * 1.8);
        tTwist = sWave * 0.42 * env;
        tSpd = 1.0 + 0.22 * env;
        tFov = 10 * env;
      }

      if (this.stuntElapsed >= this.stuntDuration) {
        this.activeStunt = null;
        // Wrap bankRoll smoothly back to [-PI, PI] after a 360 corkscrew!
        this.bankRoll = ((this.bankRoll + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (this.bankRoll < -Math.PI) this.bankRoll += Math.PI * 2;
      }
    }

    this.targetX = tx;
    this.targetY = ty;
    this.targetRoll = tRoll;

    const smooth = Math.min(1, dt * (this.activeStunt ? 5.2 : 3.6));
    this.curveX += (this.targetX - this.curveX) * smooth;
    this.curveY += (this.targetY - this.curveY) * smooth;
    if (this.activeStunt === 'corkscrew') {
      // Track the continuous 0 -> 2*PI roll directly without clamping wrap!
      this.bankRoll += (this.targetRoll - this.bankRoll) * Math.min(1, dt * 8.5);
    } else {
      this.bankRoll += (this.targetRoll - this.bankRoll) * Math.min(1, dt * 4.5);
    }
    this.tunnelTwist += (tTwist - this.tunnelTwist) * Math.min(1, dt * 4.5);
    this.cameraPitchOffset += (tPitch - this.cameraPitchOffset) * Math.min(1, dt * 4.5);
    this.horizonLoopAngle = tHorizon;
    this.stuntSpeedMult += (tSpd - this.stuntSpeedMult) * Math.min(1, dt * 4.0);
    this.stuntFovBonus += (tFov - this.stuntFovBonus) * Math.min(1, dt * 4.5);
  }

  public offsetAtZ(z: number, out: CurveOffset = { dx: 0, dy: 0 }): CurveOffset {
    if (z >= 0) {
      out.dx = 0;
      out.dy = 0;
      return out;
    }
    const t = Math.min(2.45, -z / 102);
    const t2 = t * t;
    out.dx = this.curveX * t2;
    out.dy = this.curveY * t2;
    return out;
  }

  public reset(): void {
    this.curveX = 0;
    this.curveY = 0;
    this.bankRoll = 0;
    this.tunnelTwist = 0;
    this.cameraPitchOffset = 0;
    this.horizonLoopAngle = 0;
    this.stuntSpeedMult = 1.0;
    this.stuntFovBonus = 0;
    this.activeStunt = null;
    this.stuntElapsed = 0;
  }
}
