import { describe, expect, it } from 'vitest';
import { dureesParcours, exercicesPratiques, marqueursReprise, progresExercice } from './progres.ts';
import { carnetDemo, entrainementDemo, fait } from './testing.ts';

const entrainements = [
  entrainementDemo('2026-11-02', [fait('demo-1-p1-a1', 'A1', [[3, 3], [3, 4], [3, 2]]), fait('demo-1-p1-c', 'C1', [[6, 6]])]),
  entrainementDemo('2026-11-04', [fait('demo-1-p1-a1', 'A1', [[4, 5], [4, 4], [3, 3]])]),
  entrainementDemo('2026-11-05', [fait('th-1', 'A1', [[10, 12]])], { kind: 'test', test: 'test-haut' }),
  entrainementDemo('2026-11-06', [fait('demo-1-p1-a1', 'A1', [[5, 9], [5, 9], [5, 9]])], { termine: false }),
];

describe('progresExercice', () => {
  it('sums each finished Entraînement and keeps its best Série', () => {
    expect(progresExercice('A1', entrainements)).toEqual([
      { date: '2026-11-02', total: 9, meilleure: 4 },
      { date: '2026-11-04', total: 12, meilleure: 5 },
    ]);
  });

  it('lists Exercices done, most recent first', () => {
    expect(exercicesPratiques(entrainements)).toEqual(['A1', 'C1']);
  });
});

describe('marqueursReprise', () => {
  it('finds Mini-boucles and Boucles on the Consignes where the Exercice was done', () => {
    const carnet = carnetDemo({
      entrainements,
      reprises: [
        { id: 'test-reprise-1', consigne: 'demo-1-p1-a1', date: '2026-11-08', kind: 'mini-boucle', depart: [2] },
        { id: 'test-reprise-2', consigne: 'demo-1-p1-c', date: '2026-11-09', kind: 'boucle', depart: [4] },
      ],
    });
    expect(marqueursReprise('A1', carnet)).toEqual([{ date: '2026-11-08', kind: 'mini-boucle' }]);
  });
});

describe('dureesParcours', () => {
  it('counts the days spent on each stage, up to today for the current one', () => {
    const carnet = carnetDemo({
      parcours: [
        { id: 'test-parcours-1', niveau: 'demo-1', debut: '2026-11-01', boucle: false },
        { id: 'test-parcours-2', niveau: 'demo-2', debut: '2026-11-15', boucle: false },
      ],
    });
    expect(dureesParcours(carnet, '2026-11-20').map((p) => p.jours)).toEqual([14, 5]);
  });
});
