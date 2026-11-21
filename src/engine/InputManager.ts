export type ControllerProfile = 'xbox' | 'playstation' | 'nintendo' | '8bitdo' | 'generic';

export interface InputState {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimStickX: number;
  aimStickY: number;
  fire: boolean;
  chargeLock: boolean;
  chargeReleased: boolean;
  barrelRollDir: -1 | 0 | 1;
  somersaultPressed: boolean;
  novaBombPressed: boolean;
  boost: boolean;
  brake: boolean;
  mouseNdcX: number;
  mouseNdcY: number;
  pausePressed: boolean;
  menuConfirmPressed: boolean;
  menuBackPressed: boolean;
  menuNavX: -1 | 0 | 1;
  menuNavY: -1 | 0 | 1;
  skipHeld: boolean;
  gamepadConnected: boolean;
  gamepadName: string;
  gamepadProfile: ControllerProfile;
  rumbleSupported: boolean;
}

export class InputManager {
  private keys = new Set<string>();
  private mouseLeft = false;
  private mouseRight = false;
  private mouseNdcX = 0;
  private mouseNdcY = 0;

  private prevCharge = false;
  private pendingRollDir: -1 | 0 | 1 = 0;
  private somersaultQueued = false;
  private novaBombQueued = false;
  private pauseQueued = false;
  private menuConfirmQueued = false;
  private menuBackQueued = false;
  private menuNavCooldown = 0;

  // Gamepad state & universal profile mapping
  private prevPadButtons: boolean[] = [];
  public gamepadConnected = false;
  public gamepadName = '';
  public gamepadProfile: ControllerProfile = 'generic';
  public nintendoFaceLayout = false; // Auto-set for Nintendo/8BitDo Switch layout, toggleable by user
  public invertY = false;
  public stickSensitivity = 1.0;
  public deadzone = 0.16;
  public rumbleScale = 1.0;
  private userOverrodeLayout = false;

  // Double-tap A/D detection
  private lastTapKey: string | null = null;
  private lastTapTime = 0;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  public setNintendoLayout(enabled: boolean): void {
    this.nintendoFaceLayout = enabled;
    this.userOverrodeLayout = true;
  }

  private detectProfile(id: string): ControllerProfile {
    const low = id.toLowerCase();
    if (low.includes('8bitdo') || low.includes('2dc8') || low.includes('sf30') || low.includes('sn30') || low.includes('f30')) {
      return '8bitdo';
    }
    if (low.includes('nintendo') || low.includes('switch') || low.includes('pro controller') || low.includes('057e')) {
      return 'nintendo';
    }
    if (low.includes('dualsense') || low.includes('dualshock') || low.includes('playstation') || low.includes('054c')) {
      return 'playstation';
    }
    if (low.includes('xbox') || low.includes('xinput') || low.includes('045e')) {
      return 'xbox';
    }
    return 'generic';
  }

  private onGamepadConnected = (e: GamepadEvent): void => {
    this.gamepadConnected = true;
    this.gamepadName = e.gamepad.id;
    this.gamepadProfile = this.detectProfile(e.gamepad.id);
    if (!this.userOverrodeLayout) {
      this.nintendoFaceLayout =
        this.gamepadProfile === 'nintendo' || this.gamepadProfile === '8bitdo';
    }
  };

  private onGamepadDisconnected = (): void => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const active = Array.from(pads).find((p) => p && p.connected);
    this.gamepadConnected = Boolean(active);
    this.gamepadName = active ? active.id : '';
    this.gamepadProfile = active ? this.detectProfile(active.id) : 'generic';
  };

  public hasRumbleSupport(): boolean {
    const pad = this.getActiveGamepad();
    if (!pad) return false;
    const anyPad = pad as unknown as {
      vibrationActuator?: { playEffect?: unknown };
      hapticActuators?: Array<{ pulse?: unknown }>;
    };
    return Boolean(
      (anyPad.vibrationActuator && typeof anyPad.vibrationActuator.playEffect === 'function') ||
        (anyPad.hapticActuators && anyPad.hapticActuators.length > 0 && typeof anyPad.hapticActuators[0]?.pulse === 'function')
    );
  }

  /**
   * Triggers universal haptic rumble across Chrome/Edge (`vibrationActuator`)
   * AND Safari/Firefox (`hapticActuators`). Returns true if an actuator was triggered.
   */
  public rumble(strong = 0.6, weak = 0.4, durationMs = 150): boolean {
    if (this.rumbleScale <= 0) return false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let fired = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const anyPad = pad as unknown as {
        vibrationActuator?: {
          type?: string;
          playEffect?: (
            type: string,
            params: {
              startDelay: number;
              duration: number;
              strongMagnitude: number;
              weakMagnitude: number;
            }
          ) => Promise<string>;
        };
        hapticActuators?: Array<{
          pulse?: (value: number, duration: number) => Promise<boolean>;
        }>;
      };

      const s = Math.min(1, Math.max(0, strong * this.rumbleScale));
      const w = Math.min(1, Math.max(0, weak * this.rumbleScale));

      if (anyPad.vibrationActuator && typeof anyPad.vibrationActuator.playEffect === 'function') {
        const effectType = anyPad.vibrationActuator.type === 'trigger-rumble' ? 'trigger-rumble' : 'dual-rumble';
        anyPad.vibrationActuator
          .playEffect(effectType, {
            startDelay: 0,
            duration: durationMs,
            strongMagnitude: s,
            weakMagnitude: w,
          })
          .catch(() => {});
        fired = true;
      } else if (anyPad.hapticActuators && anyPad.hapticActuators.length > 0) {
        const act = anyPad.hapticActuators[0];
        if (act && typeof act.pulse === 'function') {
          act.pulse(Math.max(s, w), durationMs).catch(() => {});
          fired = true;
        }
      }
    }
    return fired;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Tab'
    ) {
      e.preventDefault();
    }

    const isFresh = !this.keys.has(code);
    this.keys.add(code);

    if (isFresh) {
      if (code === 'Escape' || code === 'KeyP') this.pauseQueued = true;
      if (code === 'KeyR') this.somersaultQueued = true;
      if (code === 'KeyB' || code === 'KeyG') this.novaBombQueued = true;
      if (code === 'KeyQ') {
        this.pendingRollDir = -1;
      } else if (code === 'KeyE') {
        this.pendingRollDir = 1;
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        const now = performance.now();
        if (this.lastTapKey === 'LEFT' && now - this.lastTapTime < 260) {
          this.pendingRollDir = -1;
          this.lastTapKey = null;
        } else {
          this.lastTapKey = 'LEFT';
          this.lastTapTime = now;
        }
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        const now = performance.now();
        if (this.lastTapKey === 'RIGHT' && now - this.lastTapTime < 260) {
          this.pendingRollDir = 1;
          this.lastTapKey = null;
        } else {
          this.lastTapKey = 'RIGHT';
          this.lastTapTime = now;
        }
      } else if (code === 'KeyW' || code === 'ArrowUp') {
        const now = performance.now();
        if (this.lastTapKey === 'UP' && now - this.lastTapTime < 260) {
          this.somersaultQueued = true;
          this.lastTapKey = null;
        } else {
          this.lastTapKey = 'UP';
          this.lastTapTime = now;
        }
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseLeft = true;
    if (e.button === 2) this.mouseRight = true;
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseLeft = false;
    if (e.button === 2) this.mouseRight = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    this.mouseNdcX = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseNdcY = -((e.clientY / window.innerHeight) * 2 - 1);
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.mouseLeft = false;
    this.mouseRight = false;
  };

  private getActiveGamepad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.connected) {
        this.gamepadConnected = true;
        if (this.gamepadName !== p.id) {
          this.gamepadName = p.id;
          this.gamepadProfile = this.detectProfile(p.id);
          if (!this.userOverrodeLayout) {
            this.nintendoFaceLayout =
              this.gamepadProfile === 'nintendo' || this.gamepadProfile === '8bitdo';
          }
        }
        return p;
      }
    }
    this.gamepadConnected = false;
    return null;
  }

  /**
   * Decodes POV Hat axis (axes[9]) used by 8BitDo / D-Input controllers on macOS.
   */
  private decodePovHat(val: number): { x: number; y: number } {
    if (val > 1.1 || val < -1.1) return { x: 0, y: 0 }; // Neutral (~3.28)
    if (val < -0.85) return { x: 0, y: 1 }; // Up (-1.0)
    if (val < -0.57) return { x: 1, y: 1 }; // Up-Right (-0.71)
    if (val < -0.28) return { x: 1, y: 0 }; // Right (-0.43)
    if (val < 0.0) return { x: 1, y: -1 }; // Down-Right (-0.14)
    if (val < 0.28) return { x: 0, y: -1 }; // Down (+0.14)
    if (val < 0.57) return { x: -1, y: -1 }; // Down-Left (+0.43)
    if (val < 0.85) return { x: -1, y: 0 }; // Left (+0.71)
    return { x: -1, y: 1 }; // Up-Left (+1.0)
  }

  public poll(): InputState {
    let moveX = 0;
    let moveY = 0;
    let aimStickX = 0;
    let aimStickY = 0;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveY += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveY -= 1;

    let fire = this.keys.has('Space') || this.mouseLeft;
    let chargeLock = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.mouseRight;
    let boost = this.keys.has('KeyF') || this.keys.has('Tab');
    let brake = this.keys.has('KeyC') || this.keys.has('ControlLeft');
    let barrelRollDir: -1 | 0 | 1 = this.pendingRollDir;
    this.pendingRollDir = 0;

    let somersaultPressed = this.somersaultQueued;
    this.somersaultQueued = false;

    let novaBombPressed = this.novaBombQueued;
    this.novaBombQueued = false;

    let pausePressed = this.pauseQueued;
    this.pauseQueued = false;

    let menuConfirmPressed = this.menuConfirmQueued;
    this.menuConfirmQueued = false;

    let menuBackPressed = this.menuBackQueued;
    this.menuBackQueued = false;

    let menuNavX: -1 | 0 | 1 = 0;
    let menuNavY: -1 | 0 | 1 = 0;

    if (this.menuNavCooldown > 0) this.menuNavCooldown -= 1 / 60;

    let skipHeld =
      this.keys.has('Space') ||
      this.keys.has('Escape') ||
      this.keys.has('Enter');

    const pad = this.getActiveGamepad();
    if (pad) {
      const dz = this.deadzone;
      const ax0 = pad.axes[0] ?? 0;
      const ax1 = pad.axes[1] ?? 0;
      const ax2 = pad.axes[2] ?? 0;
      const ax3 = pad.axes[3] ?? 0;

      // Smooth radial deadzone rescaling + quadratic precision curve for silky stick feel!
      const mag = Math.hypot(ax0, ax1);
      let gx = 0;
      let gy = 0;
      if (mag > dz) {
        const rescaled = Math.min(1, ((mag - dz) / Math.max(0.1, 1 - dz)) * this.stickSensitivity);
        const curved = rescaled * (0.65 + 0.35 * rescaled);
        gx = (ax0 / mag) * curved;
        gy = (-ax1 / mag) * curved;
      }

      // Standard D-pad buttons (12..15) OR macOS 8BitDo/D-Input POV Hat (axes[9])
      let dX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
      let dY = (pad.buttons[12]?.pressed ? 1 : 0) - (pad.buttons[13]?.pressed ? 1 : 0);
      if (dX === 0 && dY === 0 && pad.axes.length >= 10) {
        const hat = this.decodePovHat(pad.axes[9]);
        dX = hat.x;
        dY = hat.y;
      }

      if (gx !== 0) moveX = gx;
      else if (dX !== 0) moveX = dX;

      if (gy !== 0) moveY = gy;
      else if (dY !== 0) moveY = dY;

      // Right stick fine reticle aim (if controller has dual sticks)
      if (pad.axes.length >= 4) {
        if (Math.abs(ax2) > dz) aimStickX = ax2;
        if (Math.abs(ax3) > dz) aimStickY = -ax3;
      }

      const btn = (idx: number) =>
        Boolean(pad.buttons[idx]?.pressed || (pad.buttons[idx]?.value ?? 0) > 0.35);
      const freshBtn = (idx: number) => btn(idx) && !this.prevPadButtons[idx];

      // Universal face button mapping:
      // Standard (Xbox/PS): South=0 (Fire/Confirm), East=1 (Lock), West=2 (Nova), North=3 (Somersault)
      // Nintendo / 8BitDo Switch Layout: East=0 or 1 swapped -> keep physical South/East intuitive!
      const isNonStandard = pad.mapping !== 'standard';
      const fireBtnIdx = this.nintendoFaceLayout ? (isNonStandard ? 0 : 1) : 0;
      const lockBtnIdx = this.nintendoFaceLayout ? (isNonStandard ? 1 : 0) : 1;
      const bombBtnIdx = this.nintendoFaceLayout ? (isNonStandard ? 3 : 2) : 2;
      const flipBtnIdx = this.nintendoFaceLayout ? (isNonStandard ? 4 : 3) : 3;

      const lbIdx = isNonStandard ? 6 : 4;
      const rbIdx = isNonStandard ? 7 : 5;
      const ltIdx = isNonStandard ? 8 : 6;
      const rtIdx = isNonStandard ? 9 : 7;
      const startIdx = isNonStandard ? 11 : 9;

      // Analog trigger axis fallback (some macOS controllers map L2/R2 to axes 4 & 5)
      const ltAxis = pad.axes.length >= 6 && pad.axes[4] > 0.25;
      const rtAxis = pad.axes.length >= 6 && pad.axes[5] > 0.25;

      if (btn(fireBtnIdx) || btn(rtIdx) || rtAxis) fire = true;
      if (btn(lockBtnIdx) || btn(ltIdx) || ltAxis) chargeLock = true;
      const bothBumpers = btn(lbIdx) && btn(rbIdx);
      if (bothBumpers) {
        // Holding LB + RB together engages universal Airbrake on EVERY pad (including 8BitDo)!
        brake = true;
      } else {
        if (freshBtn(lbIdx)) barrelRollDir = -1;
        if (freshBtn(rbIdx)) barrelRollDir = 1;
      }
      if (freshBtn(flipBtnIdx)) somersaultPressed = true;
      if (freshBtn(bombBtnIdx)) novaBombPressed = true;

      // L3 (10) = Boost, R3 (11) = Brake (when standard)
      if (!isNonStandard) {
        if (btn(10)) boost = true;
        if (btn(11)) brake = true;
      }

      if (freshBtn(startIdx)) pausePressed = true;
      if (freshBtn(fireBtnIdx) || freshBtn(startIdx)) menuConfirmPressed = true;
      if (freshBtn(lockBtnIdx)) menuBackPressed = true;
      if (btn(fireBtnIdx) || btn(startIdx)) skipHeld = true;

      if (this.menuNavCooldown <= 0) {
        if (moveX > 0.55) {
          menuNavX = 1;
          this.menuNavCooldown = 0.2;
        } else if (moveX < -0.55) {
          menuNavX = -1;
          this.menuNavCooldown = 0.2;
        } else if (moveY > 0.55) {
          menuNavY = -1; // Up in UI list
          this.menuNavCooldown = 0.2;
        } else if (moveY < -0.55) {
          menuNavY = 1; // Down in UI list
          this.menuNavCooldown = 0.2;
        }
      }

      this.prevPadButtons = pad.buttons.map((_, idx) => btn(idx));
    } else {
      this.prevPadButtons = [];
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    const flightMoveY = this.invertY ? -moveY : moveY;

    const chargeReleased = this.prevCharge && !chargeLock;
    this.prevCharge = chargeLock;

    return {
      moveX,
      moveY: flightMoveY,
      aimStickX,
      aimStickY,
      fire,
      chargeLock,
      chargeReleased,
      barrelRollDir,
      somersaultPressed,
      novaBombPressed,
      boost,
      brake,
      mouseNdcX: this.mouseNdcX,
      mouseNdcY: this.mouseNdcY,
      pausePressed,
      menuConfirmPressed,
      menuBackPressed,
      menuNavX,
      menuNavY,
      skipHeld,
      gamepadConnected: this.gamepadConnected,
      gamepadName: this.gamepadName,
      gamepadProfile: this.gamepadProfile,
      rumbleSupported: this.hasRumbleSupport(),
    };
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }
}
