import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyCarnet } from '../shared/carnet.ts';
import { applyOperation, opRequest, type Operation } from '../shared/operations.ts';
import { entrainementDemo } from '../shared/test-helpers.ts';
import { createApp, readCarnet } from './app.ts';
import { openDatabase } from './db.ts';

let db: ReturnType<typeof openDatabase>;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp(db);
});
afterEach(() => db.close());

/** Sends an Operation the way the phone's queue does. */
async function send(op: Operation) {
  const { method, path, body } = opRequest(op);
  const res = await app.request(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.status).toBe(204);
}

const entrainement = entrainementDemo('2026-11-02', [{ ref: 'c1', exercice: 'A1', series: [{ objectif: 10, resultat: 8, forcees: 0 }] }], { id: 'parity-entrainement-1' });

// One Operation per kind, then the removal where one exists. Values are already trimmed and complete, so the server's parsing adds nothing.
const sequence: Operation[] = [
  { kind: 'entrainement', data: entrainement },
  { kind: 'parcours', data: { id: 'parity-parcours-1', niveau: 'n1', debut: '2026-11-01', boucle: false } },
  { kind: 'reprise', data: { id: 'parity-reprise-1', consigne: 'c1', date: '2026-11-02', kind: 'boucle', depart: [8, 6] } },
  { kind: 'exercice-actuel', data: { consigne: 'c1', exercice: 'A2' } },
  { kind: 'exercice-actuel', data: { consigne: 'c1', exercice: 'A3' } },
  { kind: 'programme-actuel', data: { niveau: 'n1', partie: 'p2' } },
  { kind: 'note', data: { exercice: 'A1', note: 'bien' } },
  { kind: 'ajustement', data: { consigne: 'c1', rythme: 'lent' } },
  { kind: 'reglages', data: { frequence: null } },
  { kind: 'supprimer-ajustement', consigne: 'c1' },
  { kind: 'supprimer-parcours', id: 'parity-parcours-1' },
  { kind: 'supprimer-entrainement', id: 'parity-entrainement-1' },
];

describe('the phone and the server agree on every Operation', () => {
  it('leaves the Carnet the phone predicted after each change', async () => {
    let predicted = emptyCarnet();
    for (const op of sequence) {
      predicted = applyOperation(predicted, op);
      await send(op);
      expect(readCarnet(db), `after ${op.kind}`).toEqual(predicted);
    }
  });
});
