import { get, set } from 'idb-keyval';
import type { Entrainement } from '../shared/carnet.ts';

/** The Entraînement in progress: kept on the phone only, and sent as a whole when finished. */
export interface Brouillon {
  entrainement: Entrainement;
  /** The running rest timer, as a wall-clock end so it survives the app being closed and reopened. */
  repos: { fin: number; total: number } | null;
}

// IndexedDB can fail (private browsing, storage pressure); the app must still work online.
export async function loadBrouillon(): Promise<Brouillon | null> {
  try {
    return (await get<Brouillon>('brouillon')) ?? null;
  } catch {
    return null;
  }
}

export async function persistBrouillon(brouillon: Brouillon | null): Promise<void> {
  try {
    await set('brouillon', brouillon);
  } catch (error) {
    console.warn('Could not save offline copy', error);
  }
}
