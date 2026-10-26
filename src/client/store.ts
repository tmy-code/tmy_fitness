import { useSyncExternalStore } from 'react';
import { get, set } from 'idb-keyval';
import type { Carnet, Entrainement } from '../shared/carnet.ts';
import type { ImageExercice, Methode } from '../shared/methode.ts';
import { applyOperations, enqueueOp, opRequest, type Operation } from '../shared/operations.ts';
import { ApiError, NetworkError, request } from './api.ts';

export interface Snapshot {
  methode: Methode | null;
  carnet: Carnet;
  images: ImageExercice[];
}

/** The Entraînement in progress: kept on the phone only, and sent as a whole when finished. */
export interface Brouillon {
  entrainement: Entrainement;
  /** The running rest timer, as a wall-clock end so it survives the app being closed and reopened. */
  repos: { fin: number; total: number } | null;
}

export interface StoreState {
  /** The last copy received from the server, kept on the phone for offline use. */
  serverSnapshot: Snapshot | null;
  /** serverSnapshot with queued changes applied: what the screens show. */
  view: Snapshot | null;
  outbox: Operation[];
  /** Whether the last request reached the server. navigator.onLine is unreliable with weak signal. */
  reachable: boolean;
  /** Whether the server has been reached since the app opened; until then "synced" would be a guess. */
  contacted: boolean;
  syncing: boolean;
  /** Queued changes the server refused; shown so nothing disappears silently. */
  rejected: { op: Operation; reason: string }[];
  brouillon: Brouillon | null;
  loaded: boolean;
}

let state: StoreState = {
  serverSnapshot: null,
  view: null,
  outbox: [],
  reachable: true,
  contacted: false,
  syncing: false,
  rejected: [],
  brouillon: null,
  loaded: false,
};

const listeners = new Set<() => void>();

function update(patch: Partial<StoreState>) {
  const next = { ...state, ...patch };
  if ('serverSnapshot' in patch || 'outbox' in patch) {
    const s = next.serverSnapshot;
    // Copies saved before pictures existed have no list of them.
    next.view = s ? { methode: s.methode, carnet: applyOperations(s.carnet, next.outbox), images: s.images ?? [] } : null;
  }
  state = next;
  listeners.forEach((l) => l());
}

export function useStore(): StoreState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function currentState(): StoreState {
  return state;
}

// IndexedDB can fail (private browsing, storage pressure); the app must still work online.
async function persist(key: 'snapshot' | 'outbox' | 'rejected' | 'brouillon', value: unknown) {
  try {
    await set(key, value);
  } catch (error) {
    console.warn('Could not save offline copy', error);
  }
}

async function load<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key);
  } catch {
    return undefined;
  }
}

async function fetchSnapshot() {
  const snapshot = await request<Snapshot>('GET', '/api/snapshot');
  update({ serverSnapshot: snapshot, reachable: true, contacted: true });
  await persist('snapshot', snapshot);
  prechargerImages(snapshot.images);
}

/** Where a picture is served; the version makes each upload a new address, so cached copies never go stale. */
export function imageUrl(image: ImageExercice): string {
  return `/api/images/${encodeURIComponent(image.exercice)}?v=${encodeURIComponent(image.version)}`;
}

/** Fetches every picture once while in range, so the service worker has them for training offline. */
function prechargerImages(images: ImageExercice[]) {
  for (const image of images) void fetch(imageUrl(image)).catch(() => undefined);
}

/** Sends queued changes in order. Stops at the first network failure and keeps the rest for later. */
async function flush(): Promise<void> {
  if (state.syncing) return;
  update({ syncing: true });
  try {
    while (state.outbox.length > 0) {
      const op = state.outbox[0]!;
      const { method, path, body } = opRequest(op);
      try {
        await request(method, path, body);
      } catch (error) {
        if (error instanceof ApiError) {
          update({ rejected: [...state.rejected, { op, reason: error.message }] });
          await persist('rejected', state.rejected);
        } else {
          throw error;
        }
      }
      update({ outbox: state.outbox.slice(1), reachable: true });
      await persist('outbox', state.outbox);
    }
    await fetchSnapshot();
  } catch (error) {
    if (error instanceof NetworkError) update({ reachable: false });
    else throw error;
  } finally {
    update({ syncing: false });
  }
}

export function sync(): Promise<void> {
  return flush();
}

/** Saves changes: shown at once, sent to the server now or when back in range. */
export async function enqueue(...ops: Operation[]): Promise<void> {
  update({ outbox: ops.reduce(enqueueOp, state.outbox) });
  await persist('outbox', state.outbox);
  void flush();
}

/** Runs a change that needs a connection (uploading the Méthode), then refreshes the offline copy. */
export async function online<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    const result = await request<T>(method, path, body);
    update({ reachable: true });
    await flush();
    return result;
  } catch (error) {
    if (error instanceof NetworkError) update({ reachable: false });
    throw error;
  }
}

export async function saveBrouillon(brouillon: Brouillon | null): Promise<void> {
  update({ brouillon });
  await persist('brouillon', brouillon);
}

export async function dismissRejected(): Promise<void> {
  update({ rejected: [] });
  await persist('rejected', []);
}

export async function initStore(): Promise<void> {
  const [snapshot, outbox, rejected, brouillon] = await Promise.all([
    load<Snapshot>('snapshot'),
    load<Operation[]>('outbox'),
    load<StoreState['rejected']>('rejected'),
    load<Brouillon>('brouillon'),
  ]);
  update({ serverSnapshot: snapshot ?? null, outbox: outbox ?? [], rejected: rejected ?? [], brouillon: brouillon ?? null, loaded: true });
  void flush();

  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
  });
  // Retry queued changes regularly while the app is open, since "online" events are unreliable.
  setInterval(() => {
    if (state.outbox.length > 0 || !state.reachable) void flush();
  }, 30_000);
}
