import { describe, expect, it } from 'vitest';
import { applyOperations, enqueueOp, opRequest, type Operation } from './operations.ts';
import { carnetDemo, entrainementDemo } from './testing.ts';

describe('operations', () => {
  it('keeps only the latest queued change to the same record', () => {
    const draft = entrainementDemo('2026-11-02', [], { id: 'test-seance-0001', termine: false });
    const done = { ...draft, termine: true };
    const other: Operation = { kind: 'note', data: { exercice: 'A1', note: 'x' } };
    const queue = enqueueOp(enqueueOp(enqueueOp([], { kind: 'entrainement', data: draft }), other), { kind: 'entrainement', data: done });
    expect(queue.map((o) => opRequest(o).path)).toEqual(['/api/notes/A1', '/api/entrainements/test-seance-0001']);
  });

  it('applies queued changes the way the server will', () => {
    const e = entrainementDemo('2026-11-02', [], { id: 'test-seance-0001' });
    const carnet = applyOperations(carnetDemo(), [
      { kind: 'entrainement', data: e },
      { kind: 'exercice-actuel', data: { consigne: 'c', exercice: 'C1' } },
      { kind: 'exercice-actuel', data: { consigne: 'c', exercice: 'C2' } },
      { kind: 'supprimer-entrainement', id: 'test-seance-0001' },
    ]);
    expect(carnet.entrainements).toEqual([]);
    expect(carnet.exercicesActuels).toEqual([{ consigne: 'c', exercice: 'C2' }]);
  });
});
