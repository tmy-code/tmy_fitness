import type { Carnet } from '../shared/carnet.ts';
import type { ImageExercice, Methode } from '../shared/methode.ts';
import { applyOperations, enqueueOp, opRequest, type Operation } from '../shared/operations.ts';
import { ApiError, NetworkError, VersionError } from './api.ts';

export interface Snapshot {
  methode: Methode | null;
  carnet: Carnet;
  images: ImageExercice[];
}

export interface SyncState {
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
  /** Set when the server speaks another API version: the queue is kept, and nothing is sent until one side is updated. */
  versionMismatch: VersionError['behind'] | null;
  /** Queued changes the server refused; shown so nothing disappears silently. */
  rejected: { op: Operation; reason: string }[];
}

/** Where the offline copy is kept. A failing adapter never stops the engine: it warns and carries on. */
export interface Storage {
  get(key: StorageKey): Promise<unknown>;
  set(key: StorageKey, value: unknown): Promise<void>;
}
export type StorageKey = 'snapshot' | 'outbox' | 'rejected';

/** How the engine talks to the server. Throws NetworkError, ApiError or VersionError (api.ts). */
export type Request = <T>(method: string, path: string, body?: unknown) => Promise<T>;

export interface SyncEngineOptions {
  storage: Storage;
  request: Request;
  /** Called with each snapshot received, e.g. to cache the pictures it lists. */
  afterSnapshot?: (snapshot: Snapshot) => void;
  /** Return false while there is nowhere to send to (the Android app before its server address is typed). */
  ready?: () => boolean;
}

export interface SyncEngine {
  /** Loads the offline copy, queue and refused changes from storage. Does not contact the server. */
  hydrate(): Promise<void>;
  getState(): SyncState;
  subscribe(listener: () => void): () => void;
  /** Saves changes: shown at once, sent to the server now or when back in range. */
  enqueue(...ops: Operation[]): Promise<void>;
  /**
   * Checks the API version, sends the queue in order, then refreshes the snapshot. A call made during a sync
   * triggers one more run; the promise resolves when all of them are done.
   */
  sync(): Promise<void>;
  dismissRejected(): Promise<void>;
  /** Runs a call that needs a connection (uploading the Méthode) and records whether the server was reached. */
  observe<T>(call: () => Promise<T>): Promise<T>;
}

export function createSyncEngine({ storage, request, afterSnapshot, ready = () => true }: SyncEngineOptions): SyncEngine {
  let state: SyncState = {
    serverSnapshot: null,
    view: null,
    outbox: [],
    reachable: true,
    contacted: false,
    syncing: false,
    versionMismatch: null,
    rejected: [],
  };
  const listeners = new Set<() => void>();

  function update(patch: Partial<SyncState>) {
    const next = { ...state, ...patch };
    if ('serverSnapshot' in patch || 'outbox' in patch) {
      const s = next.serverSnapshot;
      // Copies saved before pictures existed have no list of them.
      next.view = s ? { methode: s.methode, carnet: applyOperations(s.carnet, next.outbox), images: s.images ?? [] } : null;
    }
    state = next;
    listeners.forEach((l) => l());
  }

  // IndexedDB can fail (private browsing, storage pressure); the app must still work online.
  async function persist(key: StorageKey, value: unknown) {
    try {
      await storage.set(key, value);
    } catch (error) {
      console.warn('Could not save offline copy', error);
    }
  }

  async function load(key: StorageKey): Promise<unknown> {
    try {
      return await storage.get(key);
    } catch {
      return undefined;
    }
  }

  async function fetchSnapshot() {
    const snapshot = await request<Snapshot>('GET', '/api/snapshot');
    update({ serverSnapshot: snapshot, reachable: true, contacted: true });
    await persist('snapshot', snapshot);
    afterSnapshot?.(snapshot);
  }

  /** Sends queued changes in order. Stops at the first network failure and keeps the rest for later. */
  async function flushOnce(): Promise<void> {
    if (!ready()) return;
    update({ syncing: true });
    try {
      // Checks the API version before sending anything, so a queued change never reaches a server that would misread it.
      await request('GET', '/api/health');
      update({ versionMismatch: null });
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
      else if (error instanceof VersionError) update({ reachable: true, contacted: true, versionMismatch: error.behind });
      else throw error;
    } finally {
      update({ syncing: false });
    }
  }

  let running: Promise<void> | null = null;
  let again = false;

  function sync(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await flushOnce();
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    async hydrate() {
      const [snapshot, outbox, rejected] = await Promise.all([load('snapshot'), load('outbox'), load('rejected')]);
      update({
        serverSnapshot: (snapshot as Snapshot | undefined) ?? null,
        outbox: (outbox as Operation[] | undefined) ?? [],
        rejected: (rejected as SyncState['rejected'] | undefined) ?? [],
      });
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async enqueue(...ops) {
      update({ outbox: ops.reduce(enqueueOp, state.outbox) });
      await persist('outbox', state.outbox);
      void sync();
    },
    sync,
    async dismissRejected() {
      update({ rejected: [] });
      await persist('rejected', []);
    },
    async observe(call) {
      try {
        const result = await call();
        update({ reachable: true });
        return result;
      } catch (error) {
        if (error instanceof NetworkError) update({ reachable: false });
        if (error instanceof VersionError) update({ versionMismatch: error.behind });
        throw error;
      }
    },
  };
}
