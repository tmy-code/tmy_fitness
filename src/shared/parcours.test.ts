import { describe, expect, it } from 'vitest';
import type { Consigne, Niveau } from './methode.ts';
import { demarrerApresTests, demarrerBoucle, terminerEntrainement } from './parcours.ts';
import { entrainementDemo } from './test-helpers.ts';

const niveau = (extra: object = {}) => ({ id: 'n1', organisation: 'programmes', parties: [{ id: 'p1' }, { id: 'p2' }], ...extra }) as unknown as Niveau;
const consigne = (id: string, type: 'reps' | 'duree') => ({ id, series: [{ cible: { type } }] }) as unknown as Consigne;

describe('parcours', () => {
  it('records a finished Entraînement and applies only the accepted suggestions', () => {
    const e = entrainementDemo('2026-11-02', [], { id: 'parcours-test-1', termine: false });
    const suggestions = [
      { kind: 'progression', vers: 'C2', consigne: 'c1' },
      { kind: 'programme', vers: 'p2' },
    ] as never;
    expect(terminerEntrainement(e, niveau(), suggestions, [])).toEqual([{ kind: 'entrainement', data: { ...e, termine: true } }]);
    expect(terminerEntrainement(e, niveau(), suggestions, [0, 1]).slice(1)).toEqual([
      { kind: 'exercice-actuel', data: { consigne: 'c1', exercice: 'C2' } },
      { kind: 'programme-actuel', data: { niveau: 'n1', partie: 'p2' } },
    ]);
  });

  it('starts a Boucle: a reprise per reps Consigne and the first Programme again', () => {
    let n = 0;
    const ops = demarrerBoucle(niveau(), [{ consigne: consigne('c1', 'reps'), depart: [8, 6] }, { consigne: consigne('c2', 'duree'), depart: [30] }], () => `id-${++n}`, '2026-11-02');
    expect(ops).toEqual([
      { kind: 'parcours', data: { id: 'id-1', niveau: 'n1', debut: '2026-11-02', boucle: true } },
      { kind: 'reprise', data: { id: 'id-2', consigne: 'c1', date: '2026-11-02', kind: 'boucle', depart: [8, 6] } },
      { kind: 'programme-actuel', data: { niveau: 'n1', partie: 'p1' } },
    ]);
  });

  it('starts the Niveau the Tests led to, with its Programme when there is one', () => {
    const ops = demarrerApresTests(niveau({ parties: [] }), undefined, { exercices: [] }, 'parcours-id-1', '2026-11-02');
    expect(ops).toEqual([{ kind: 'parcours', data: { id: 'parcours-id-1', niveau: 'n1', debut: '2026-11-02', boucle: false } }]);
  });
});
