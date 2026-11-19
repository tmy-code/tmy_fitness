import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import type { Operation } from '../shared/operations.ts';
import { request, VersionError } from './api.ts';
import { loadBrouillon, persistBrouillon, type Brouillon } from './brouillon.ts';
import { garderImages } from './image-cache.ts';
import { isAndroidApp } from './native.ts';
import { serverAddress, setServerAddress } from './server.ts';
import { createSyncEngine, type Snapshot, type SyncState } from './sync-engine.ts';

export type { Brouillon, Snapshot };

export interface StoreState extends SyncState {
  brouillon: Brouillon | null;
  loaded: boolean;
  /** The server's address; '' in the browser, where the screens come from the server itself. */
  serveur: string;
}

/** The Android app does not know where the server is until its address is typed on first launch. */
export function needsServerAddress(s: Pick<StoreState, 'serveur'> = local): boolean {
  return isAndroidApp && s.serveur === '';
}

const engine = createSyncEngine({
  storage: { get: (key) => get(key), set: (key, value) => set(key, value) },
  request,
  afterSnapshot: (snapshot) => void garderImages(snapshot.images),
  ready: () => !needsServerAddress(),
});

let local = { brouillon: null as Brouillon | null, loaded: false, serveur: serverAddress() };
let combined: StoreState = { ...engine.getState(), ...local };
const listeners = new Set<() => void>();

function refresh() {
  combined = { ...engine.getState(), ...local };
  listeners.forEach((l) => l());
}
engine.subscribe(refresh);

export function useStore(): StoreState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => combined,
  );
}

export function currentState(): StoreState {
  return combined;
}

export const sync = engine.sync;
export const enqueue: (...ops: Operation[]) => Promise<void> = engine.enqueue;
export const dismissRejected = engine.dismissRejected;

/** Runs a change that needs a connection (uploading the Méthode), then refreshes the offline copy. */
export async function online<T>(method: string, path: string, body?: unknown): Promise<T> {
  const result = await engine.observe(() => request<T>(method, path, body));
  await engine.sync();
  return result;
}

/**
 * Checks that a server answers at this address with the same API version, then uses it. Throws a message for the
 * screen otherwise. The offline copy is kept: it is the same server, reached another way.
 */
export async function connecterServeur(address: string): Promise<void> {
  const previous = serverAddress();
  setServerAddress(address);
  try {
    await request('GET', '/api/health');
  } catch (error) {
    setServerAddress(previous);
    if (error instanceof VersionError) throw error;
    throw new Error('Aucun serveur TMY Fitness ne répond à cette adresse. Vérifiez l’adresse et que Tailscale est connecté.');
  }
  local = { ...local, serveur: serverAddress() };
  refresh();
  await engine.sync();
}

export async function saveBrouillon(brouillon: Brouillon | null): Promise<void> {
  local = { ...local, brouillon };
  refresh();
  await persistBrouillon(brouillon);
}

export async function initStore(): Promise<void> {
  const [, brouillon] = await Promise.all([engine.hydrate(), loadBrouillon()]);
  local = { ...local, brouillon, loaded: true };
  refresh();
  void engine.sync();

  // The engine has no timers or listeners: these triggers decide when to try sending.
  window.addEventListener('online', () => void engine.sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void engine.sync();
  });
  // Retry queued changes regularly while the app is open, since "online" events are unreliable.
  setInterval(() => {
    const s = engine.getState();
    if (s.outbox.length > 0 || !s.reachable) void engine.sync();
  }, 30_000);
}
