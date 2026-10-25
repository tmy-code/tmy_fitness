import { describe, expect, it } from 'vitest';
import { nouvelEntrainement, reposApres, serieCourante, suggestionsFin } from './seance.ts';
import { carnetDemo, demoMethode, entrainementDemo, fait, niveauDemo } from './testing.ts';

const m = demoMethode();
const n1 = niveauDemo(m, 'demo-1');
const p1 = n1.parties[0]!;

describe('nouvelEntrainement', () => {
  it("fills each Série's Objectif from the Carnet and the Exercice actuel", () => {
    const carnet = carnetDemo({
      exercicesActuels: [{ consigne: 'demo-1-p1-c', exercice: 'C2' }],
      entrainements: [entrainementDemo('2026-11-02', [fait('demo-1-p1-a1', 'A1', [[3, 3], [3, 3], [3, 2]])])],
    });
    const e = nouvelEntrainement(n1, p1, carnet, 'test-seance-0001', '2026-11-04');
    expect(e.exercices.map((x) => [x.ref, x.exercice, x.series.map((s) => s.objectif)])).toEqual([
      ['demo-1-p1-a1', 'A1', [4, 4, 3]],
      ['demo-1-p1-c', 'C2', [6, 6, 6]],
      ['demo-1-p1-e1', 'E1', [60, null]],
    ]);
    expect(e.blocs).toBeUndefined();
    expect(e.termine).toBe(false);
  });

  it('keeps only the chosen Blocs on a Split day', () => {
    const e = nouvelEntrainement(n1, p1, carnetDemo(), 'test-seance-0001', '2026-11-04', ['demo-1-p1-dos']);
    expect(e.exercices.map((x) => x.ref)).toEqual(['demo-1-p1-c']);
    expect(e.blocs).toEqual(['demo-1-p1-dos']);
  });

  it("applies the trainee's Ajustement", () => {
    const carnet = carnetDemo({ ajustements: [{ consigne: 'demo-1-p1-a1', series: [{ cible: { type: 'reps', n: 5 }, repos: 60 }] }] });
    const e = nouvelEntrainement(n1, p1, carnet, 'test-seance-0001', '2026-11-04');
    expect(e.exercices[0]!.series.map((s) => s.objectif)).toEqual([5]);
  });
});

describe('during the Entraînement', () => {
  const e = nouvelEntrainement(n1, p1, carnetDemo(), 'test-seance-0001', '2026-11-04');

  it('finds the next Série to do', () => {
    expect(serieCourante(e)).toEqual({ exercice: 0, serie: 0 });
    const started = structuredClone(e);
    started.exercices[0]!.series.forEach((s) => (s.resultat = 3));
    expect(serieCourante(started)).toEqual({ exercice: 1, serie: 0 });
  });

  it("rests per the Série, then the Bloc's longer rest, and not after the last Série", () => {
    expect(reposApres(p1, e, 0, 0, carnetDemo())).toBe(90);
    expect(reposApres(p1, e, 0, 2, carnetDemo())).toBe(180);
    expect(reposApres(p1, e, 2, 1, carnetDemo())).toBe(0);
  });
});

describe('suggestionsFin', () => {
  it('suggests the next Exercice and the next Programme when their conditions are met', () => {
    const e = entrainementDemo('2026-11-04', [
      fait('demo-1-p1-a1', 'A1', [[8, 8], [8, 8], [8, 8]]),
      fait('demo-1-p1-c', 'C1', [[12, 12], [12, 12], [12, 13]]),
    ]);
    expect(suggestionsFin(n1, p1, e, carnetDemo()).map((s) => [s.kind, s.vers])).toEqual([
      ['progression', 'C2'],
      ['programme', 'demo-1-p2'],
    ]);
  });
});
