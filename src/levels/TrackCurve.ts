import * as THREE from 'three';

export interface CurveOffset {
  dx: number;
  dy: number;
}

/**
 * Drives dramatic Space-Run / Super Mario Galaxy / Arcade Racer twists, turns,
 * vertical crests/dives, and smooth horizon banking!
 * At z = 0 (the player plane), offset is always (0, 0) so aiming & hitboxes stay razor-sharp.
 * Ahead of the player (z < 0), the entire track, scenery, and approaching obstacles bend smoothly!
 */
export class TrackCurve {
  public curveX = 0; // Horizontal bend strength (-22..22)
  public curveY = 0; // Vertical crest/dive strength (-13..13)
  public bankRoll = 0; // Smooth camera horizon roll (-0.34..0.34 rad)

  private targetX = 0;
  private targetY = 0;
  private targetRoll = 0;

  public update(dt: number, distance: number, levelIndex: number, isBossActive: boolean): void {
    // Rich multi-frequency spline: long sweeping turns + snappy S-chicanes + Galaxy hills/dives
    const d = distance * 0.0042;
    const freqScale = 1 + levelIndex * 0.14;

    const sweepX =
      Math.sin(d * 1.15 * freqScale) * 16.5 +
      Math.sin(d * 2.75 * freqScale + 1.3) * 9.5 +
      Math.cos(d * 0.52) * 7.0;

    const sweepY =
      Math.sin(d * 0.92 * freqScale + 0.7) * 10.5 +
      Math.cos(d * 2.1 * freqScale) * 5.2;

    // Gentle damp during boss arena so boss duels stay super readable while still feeling alive
    const damp = isBossActive ? 0.24 : 1.0;

    this.targetX = THREE.MathUtils.clamp(sweepX * damp, -24, 24);
    this.targetY = THREE.MathUtils.clamp(sweepY * damp, -14, 14);
    this.targetRoll = THREE.MathUtils.clamp(-this.targetX * 0.0135, -0.34, 0.34);

    const smooth = Math.min(1, dt * 3.2);
    this.curveX += (this.targetX - this.curveX) * smooth;
    this.curveY += (this.targetY - this.curveY) * smooth;
    this.bankRoll += (this.targetRoll - this.bankRoll) * Math.min(1, dt * 3.8);
  }

  public offsetAtZ(z: number, out: CurveOffset = { dx: 0, dy: 0 }): CurveOffset {
    if (z >= 0) {
      out.dx = 0;
      out.dy = 0;
      return out;
    }
    const t = Math.min(2.4, -z / 105);
    const t2 = t * t;
    out.dx = this.curveX * t2;
    out.dy = this.curveY * t2;
    return out;
  }

  public reset(): void {
    this.curveX = 0;
    this.curveY = 0;
    this.bankRoll = 0;
  }
}
