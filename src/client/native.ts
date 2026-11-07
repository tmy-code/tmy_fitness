import { KeepAwake } from '@capacitor-community/keep-awake';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

// What only the Android app does (ADR 0003). In the browser every function here falls back to the web behaviour.

export const isAndroidApp = Capacitor.isNativePlatform();

/** Android's back button goes back one screen, and leaves the app from the home screen. */
export function initAndroidApp(): void {
  if (!isAndroidApp) return;
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  void StatusBar.setBackgroundColor({ color: '#000000' }).catch(() => undefined);
  void App.addListener('backButton', () => {
    if (location.hash === '' || location.hash === '#/' || location.hash === '#') void App.exitApp();
    else history.back();
  });
}

/** Keeps the screen on in the Android app, whose browser has no Wake Lock. Returns false in the browser. */
export async function garderEcranAllume(actif: boolean): Promise<boolean> {
  if (!isAndroidApp) return false;
  try {
    await (actif ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
  } catch {
    // Refused: the workout still works, the screen may just dim.
  }
  return true;
}

/** Opens a file the server sends (the CSV export) where the phone can save it; the app's own browser cannot. */
export async function ouvrirFichier(url: string): Promise<void> {
  await Browser.open({ url });
}
