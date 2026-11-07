import { useEffect } from 'react';
import { garderEcranAllume, isAndroidApp } from './native.ts';

// Phone features used mid-workout: keeping the screen on, and signalling the end of a rest.

/** Keeps the screen on while `active`, re-acquiring the lock when the app comes back to the foreground. */
export function useEcranAllume(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (isAndroidApp) {
      void garderEcranAllume(true);
      return () => void garderEcranAllume(false);
    }
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // Refused (battery saver, page hidden): the workout still works, the screen may just dim.
      }
      if (cancelled) void lock?.release();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}

let audio: AudioContext | null = null;

/** Browsers only allow sound after a tap; call this from a tap so the end-of-rest beep can play later. */
export function preparerSon(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Two short beeps and a vibration: the rest is over. */
export function signalFinRepos(): void {
  navigator.vibrate?.([300, 150, 300]);
  if (!audio) return;
  const start = audio.currentTime;
  for (const offset of [0, 0.35]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.25);
  }
}
