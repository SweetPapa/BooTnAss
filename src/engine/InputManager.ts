export interface InputState {
  moveX: number; // -1..1
  moveY: number; // -1..1
  aimStickX: number; // Right stick fine aim (-1..1)
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
  gamepadConnected: boolean;
  gamepadName: string;
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

  // Gamepad edge-detection state
  private prevPadButtons: boolean[] = [];
  public gamepadConnected = false;
  public gamepadName = '';

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

  private onGamepadConnected = (e: GamepadEvent): void => {
    this.gamepadConnected = true;
    this.gamepadName = e.gamepad.id;
  };

  private onGamepadDisconnected = (): void => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const active = Array.from(pads).find((p) => p && p.connected);
    this.gamepadConnected = Boolean(active);
    this.gamepadName = active ? active.id : '';
  };

  /**
   * Triggers native Bluetooth controller haptic rumble (Xbox / DualSense / Switch Pro / 8BitDo).
   */
  public rumble(strong = 0.5, weak = 0.3, durationMs = 120): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const actuator = (pad as unknown as {
        vibrationActuator?: {
          playEffect?: (
            type: string,
            params: { duration: number; strongMagnitude: number; weakMagnitude: number }
          ) => Promise<void>;
        };
      }).vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        actuator
          .playEffect('dual-rumble', {
            duration: durationMs,
            strongMagnitude: Math.min(1, Math.max(0, strong)),
            weakMagnitude: Math.min(1, Math.max(0, weak)),
          })
          .catch(() => {});
      }
    }
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
      if (code === 'Escape' || code === 'KeyP') {
        this.pauseQueued = true;
      }
      if (code === 'KeyR') {
        this.somersaultQueued = true;
      }
      if (code === 'KeyB' || code === 'KeyG') {
        this.novaBombQueued = true;
      }
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
        this.gamepadName = p.id;
        return p;
      }
    }
    this.gamepadConnected = false;
    return null;
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
    let brake = this.keys.has('KeyC');
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

    // Native Bluetooth / USB Gamepad Support (Standard Mapping: Xbox, DualSense, Switch Pro, 8BitDo)
    const pad = this.getActiveGamepad();
    if (pad) {
      const deadzone = 0.16;
      const ax0 = pad.axes[0] ?? 0;
      const ax1 = pad.axes[1] ?? 0;
      const ax2 = pad.axes[2] ?? 0;
      const ax3 = pad.axes[3] ?? 0;

      const gx = Math.abs(ax0) > deadzone ? ax0 : 0;
      const gy = Math.abs(ax1) > deadzone ? -ax1 : 0;

      // D-pad fallback / precision flying
      const dUp = pad.buttons[12]?.pressed ? 1 : 0;
      const dDown = pad.buttons[13]?.pressed ? -1 : 0;
      const dLeft = pad.buttons[14]?.pressed ? -1 : 0;
      const dRight = pad.buttons[15]?.pressed ? 1 : 0;

      if (gx !== 0) moveX = gx;
      else if (dLeft + dRight !== 0) moveX = dLeft + dRight;

      if (gy !== 0) moveY = gy;
      else if (dUp + dDown !== 0) moveY = dUp + dDown;

      // Right stick fine reticle aim
      if (Math.abs(ax2) > deadzone) aimStickX = ax2;
      if (Math.abs(ax3) > deadzone) aimStickY = -ax3;

      const btn = (idx: number) => Boolean(pad.buttons[idx]?.pressed || (pad.buttons[idx]?.value ?? 0) > 0.35);
      const freshBtn = (idx: number) => btn(idx) && !this.prevPadButtons[idx];

      // A (0) or RT (7) = Rapid Fire
      if (btn(0) || btn(7)) fire = true;
      // B (1) or LT (6) = Hold Quad Lock-On
      if (btn(1) || btn(6)) chargeLock = true;
      // LB (4) = Barrel Roll Left, RB (5) = Barrel Roll Right
      if (freshBtn(4)) barrelRollDir = -1;
      if (freshBtn(5)) barrelRollDir = 1;
      // Y (3) = Somersault Backflip + EMP
      if (freshBtn(3)) somersaultPressed = true;
      // X (2) = Nova Smart Bomb
      if (freshBtn(2)) novaBombPressed = true;
      // L3 (10) = Boost, R3 (11) = Brake
      if (btn(10)) boost = true;
      if (btn(11)) brake = true;
      // Start / Options (9) = Pause
      if (freshBtn(9)) pausePressed = true;
      // Menu Confirm (A or Start)
      if (freshBtn(0) || freshBtn(9)) menuConfirmPressed = true;

      this.prevPadButtons = pad.buttons.map((_, idx) => btn(idx));
    } else {
      this.prevPadButtons = [];
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 1) {
      moveX /= len;
      moveY /= len;
    }

    const chargeReleased = this.prevCharge && !chargeLock;
    this.prevCharge = chargeLock;

    return {
      moveX,
      moveY,
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
      gamepadConnected: this.gamepadConnected,
      gamepadName: this.gamepadName,
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
