import { describe, expect, it, vi } from 'vitest';
import type { Entrainement } from '../shared/carnet.ts';
import type { Operation } from '../shared/operations.ts';
import { ApiError, NetworkError, VersionError } from './api.ts';
import { createSyncEngine, type Request, type Snapshot, type Storage, type StorageKey } from './sync-engine.ts';

const carnet = { entrainements: [], parcours: [], reprises: [], exercicesActuels: [], programmesActuels: [], notes: [], ajustements: [], reglages: { frequence: null } };
const snapshot = { methode: null, carnet, images: [] } as unknown as Snapshot;

const note = (exercice: string, text = 'a'): Operation => ({ kind: 'note', data: { exercice, note: text } });
const entrainement = (id: string): Operation => ({ kind: 'entrainement', data: { id, date: '2000-01-01', kind: 'niveau', termine: true, exercices: [] } as unknown as Entrainement });

function memoryStorage(): Storage & { data: Map<StorageKey, unknown> } {
  const data = new Map<StorageKey, unknown>();
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, structuredClone(v)) };
}

/** A scripted server: `fail` can throw for a given call; every call is recorded as "METHOD path". */
function server(fail: (call: string, n: number) => Error | undefined = () => undefined) {
  const calls: string[] = [];
  const request = (async (method: string, path: string) => {
    const call = `${method} ${path}`;
    calls.push(call);
    const error = fail(call, calls.length);
    if (error) throw error;
    return path === '/api/snapshot' ? snapshot : undefined;
  }) as Request;
  return { calls, request };
}

describe('sync engine', () => {
  it('shows a change at once and keeps it queued when the server is unreachable', async () => {
    const s = server(() => new NetworkError('down'));
    const engine = createSyncEngine({ storage: memoryStorage(), request: s.request });
    await engine.hydrate();
    await engine.enqueue(note('A1', 'x'));
    await engine.sync();
    expect(engine.getState().outbox).toHaveLength(1);
    expect(engine.getState().reachable).toBe(false);
  });

  it('shows queued changes in the view', async () => {
    const storage = memoryStorage();
    storage.data.set('snapshot', snapshot);
    const s = server(() => new NetworkError('down'));
    const engine = createSyncEngine({ storage, request: s.request });
    await engine.hydrate();
    await engine.enqueue(note('A1', 'x'));
    expect(engine.getState().view?.carnet.notes).toEqual([{ exercice: 'A1', note: 'x' }]);
  });

  it('sends in order and only the latest change to the same record', async () => {
    const s = server();
    const engine = createSyncEngine({ storage: memoryStorage(), request: s.request });
    await engine.hydrate();
    await engine.enqueue(entrainement('e1'), note('A1', 'old'), note('A1', 'new'));
    await engine.sync();
    expect(s.calls.filter((c) => c.startsWith('PUT'))).toEqual(['PUT /api/entrainements/e1', 'PUT /api/notes/A1']);
    expect(engine.getState().outbox).toEqual([]);
  });

  it('stops at a network failure, keeps the rest, and finishes on the next sync', async () => {
    let down = true;
    const s = server((call) => (down && call === 'PUT /api/notes/B1' ? new NetworkError('down') : undefined));
    const engine = createSyncEngine({ storage: memoryStorage(), request: s.request });
    await engine.hydrate();
    await engine.enqueue(note('A1'), note('B1'), note('C1'));
    await engine.sync();
    expect(engine.getState().outbox.map((o) => (o as { data: { exercice: string } }).data.exercice)).toEqual(['B1', 'C1']);
    expect(engine.getState().reachable).toBe(false);
    down = false;
    await engine.sync();
    expect(engine.getState().outbox).toEqual([]);
    expect(engine.getState().reachable).toBe(true);
  });

  it('sends a change again with the same request when the answer was lost', async () => {
    let lose = true;
    const s = server((call) => (lose && call === 'PUT /api/notes/A1' ? new NetworkError('lost') : undefined));
    const engine = createSyncEngine({ storage: memoryStorage(), request: s.request });
    await engine.hydrate();
    await engine.enqueue(note('A1'));
    await engine.sync();
    lose = false;
    await engine.sync();
    // enqueue sends once itself and the coalesced sync() once more, both lost; the third gets through.
    expect(s.calls.filter((c) => c === 'PUT /api/notes/A1')).toHaveLength(3);
    expect(engine.getState().outbox).toEqual([]);
  });

  it('moves a refused change to the rejected list and carries on', async () => {
    const s = server((call) => (call === 'PUT /api/notes/A1' ? new ApiError(400, 'refusé') : undefined));
    const engine = createSyncEngine({ storage: memoryStorage(), request: s.request });
    await engine.hydrate();
    await engine.enqueue(note('A1'), note('B1'));
    await engine.sync();
    expect(engine.getState().rejected).toHaveLength(1);
    expect(engine.getState().rejected[0]!.reason).toBe('refusé');
    expect(engine.getState().outbox).toEqual([]);
    expect(s.calls).toContain('PUT /api/notes/B1');
    await engine.dismissRejected();
    expect(engine.getState().rejected).toEqual([]);
  });

  it('sends nothing on a version mismatch and sends everything once it matches', async () => {
    let behind = true;
    const s = server((call) => (behind && call === 'GET /api/health' ? new VersionError(99) : undefined));
    const engine = createSyncEngine({ storage: memoryStorage(), request: s.request });
    await engine.hydrate();
    await engine.enqueue(note('A1'));
    await engine.sync();
    expect(s.calls.some((c) => c.startsWith('PUT'))).toBe(false);
    expect(engine.getState().versionMismatch).toBe('app');
    expect(engine.getState().outbox).toHaveLength(1);
    behind = false;
    await engine.sync();
    expect(engine.getState().versionMismatch).toBeNull();
    expect(engine.getState().outbox).toEqual([]);
  });

  it('sends a change enqueued during a sync within the same awaited sync', async () => {
    let engine!: ReturnType<typeof createSyncEngine>;
    let injected = false;
    const s = server();
    const request = (async (method: string, path: string, body?: unknown) => {
      if (path === '/api/snapshot' && !injected) {
        injected = true;
        void engine.enqueue(note('LATE'));
      }
      return s.request(method, path, body);
    }) as Request;
    engine = createSyncEngine({ storage: memoryStorage(), request });
    await engine.hydrate();
    await engine.enqueue(note('A1'));
    await engine.sync();
    expect(s.calls).toContain('PUT /api/notes/LATE');
    expect(engine.getState().outbox).toEqual([]);
  });

  it('survives a restart on the same storage and keeps working when storage throws', async () => {
    const storage = memoryStorage();
    const down = server(() => new NetworkError('down'));
    const first = createSyncEngine({ storage, request: down.request });
    await first.hydrate();
    await first.enqueue(note('A1'));
    const second = createSyncEngine({ storage, request: server().request });
    await second.hydrate();
    expect(second.getState().outbox).toHaveLength(1);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: Storage = { get: async () => { throw new Error('no'); }, set: async () => { throw new Error('no'); } };
    const s = server();
    const engine = createSyncEngine({ storage: broken, request: s.request });
    await engine.hydrate();
    await engine.enqueue(note('A1'));
    await engine.sync();
    expect(s.calls).toContain('PUT /api/notes/A1');
    expect(engine.getState().outbox).toEqual([]);
    warn.mockRestore();
  });
});
