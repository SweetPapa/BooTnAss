/**
 * DesktopBridge — Seamless integration with Tauri v2 desktop runtime,
 * with clean browser fallbacks when running on the web.
 */

interface TauriCore {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

interface TauriInternals {
  invoke?: TauriCore['invoke'];
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export class DesktopBridge {
  public static get isDesktop(): boolean {
    return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
  }

  private static async invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
    try {
      const fn = window.__TAURI_INTERNALS__?.invoke;
      if (typeof fn === 'function') {
        return await fn<T>(cmd, args);
      }
    } catch {
      // Fallback gracefully outside desktop runtime
    }
    return null;
  }

  public static async isFullscreen(): Promise<boolean> {
    if (this.isDesktop) {
      const res = await this.invoke<boolean>('is_fullscreen');
      if (typeof res === 'boolean') return res;
    }
    return Boolean(document.fullscreenElement);
  }

  public static async toggleFullscreen(): Promise<boolean> {
    if (this.isDesktop) {
      const res = await this.invoke<boolean>('toggle_fullscreen');
      if (typeof res === 'boolean') return res;
    }
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        return true;
      } else {
        await document.exitFullscreen();
        return false;
      }
    } catch {
      return Boolean(document.fullscreenElement);
    }
  }

  public static async quitApp(): Promise<void> {
    if (this.isDesktop) {
      await this.invoke('quit_app');
    }
  }
}
