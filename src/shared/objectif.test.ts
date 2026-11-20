import { describe, expect, it } from 'vitest';
import { departBoucle } from './boucle.ts';
import { objectifsDuJour } from './objectif.ts';
import { consigneDemo, demoMethode, entrainementDemo, fait } from './test-helpers.ts';

const m = demoMethode();
const a1 = consigneDemo(m, 'demo-1-p1-a1'); // 3 Séries of 3 répétitions
const e1 = consigneDemo(m, 'demo-1-p1-e1'); // a timed Série then a max Série
const objectifs = (r: ReturnType<typeof objectifsDuJour>) => r.series.map((s) => s.objectif);

describe('objectifsDuJour', () => {
  it("starts from the Consigne's targets the first time", () => {
    expect(objectifs(objectifsDuJour(a1, 'A1', [], []))).toEqual([3, 3, 3]);
  });

  it('climbs by the increment after each Série that reached its Objectif', () => {
    const past = [entrainementDemo('2026-11-02', [fait(a1.id, 'A1', [[3, 3], [3, 3], [3, 2]])])];
    expect(objectifs(objectifsDuJour(a1, 'A1', past, []))).toEqual([4, 4, 3]);
  });

  it('builds on a Résultat above the Objectif', () => {
    const past = [entrainementDemo('2026-11-02', [fait(a1.id, 'A1', [[3, 6], [3, 3], [3, 3]])])];
    expect(objectifs(objectifsDuJour(a1, 'A1', past, []))).toEqual([7, 4, 4]);
  });

  it('uses only the latest finished Entraînement, of the same Exercice', () => {
    const past = [
      entrainementDemo('2026-11-02', [fait(a1.id, 'A1', [[3, 3], [3, 3], [3, 3]])]),
      entrainementDemo('2026-11-04', [fait(a1.id, 'A1', [[4, 4], [4, 4], [4, 4]])]),
      entrainementDemo('2026-11-06', [fait(a1.id, 'A1', [[5, 9], [5, 9], [5, 9]])], { termine: false }),
      entrainementDemo('2026-11-06', [fait(a1.id, 'A2', [[5, 9], [5, 9], [5, 9]])]),
    ];
    const r = objectifsDuJour(a1, 'A1', past, []);
    expect(objectifs(r)).toEqual([5, 5, 5]);
    expect(r.series.map((s) => s.aBattre)).toEqual([4, 4, 4]);
  });

  it('gives the duration for a timed Série and the last Résultat to beat for a max Série', () => {
    const past = [entrainementDemo('2026-11-02', [fait(e1.id, 'E1', [[60, 60], [null, 25]])])];
    const r = objectifsDuJour(e1, 'E1', past, []);
    expect(r.series.map((s) => [s.objectif, s.aBattre])).toEqual([
      [60, 60],
      [null, 25],
    ]);
  });

  it('restarts the climb from a Mini-boucle', () => {
    const past = [entrainementDemo('2026-11-02', [fait(a1.id, 'A1', [[8, 8], [8, 8], [8, 8]])])];
    const reprise = { id: 'test-reprise-1', consigne: a1.id, date: '2026-11-03', kind: 'mini-boucle' as const, depart: [4, 4, 4] };
    expect(objectifs(objectifsDuJour(a1, 'A1', past, [reprise]))).toEqual([4, 4, 4]);
    const after = [...past, entrainementDemo('2026-11-05', [fait(a1.id, 'A1', [[4, 4], [4, 4], [4, 4]])])];
    expect(objectifs(objectifsDuJour(a1, 'A1', after, [reprise]))).toEqual([5, 5, 5]);
  });

  it("starts a new Exercice of a Progression from its step's starting point", () => {
    const c = consigneDemo(m, 'demo-1-p1-c');
    expect(objectifs(objectifsDuJour(c, 'C2', [], [], [6, 6, 6]))).toEqual([6, 6, 6]);
  });
});

describe('Série increment', () => {
  const sevenFifteen = {
    ...a1,
    increment: 0,
    series: [
      { cible: { type: 'reps' as const, n: 7 }, repos: 25, increment: 1 },
      { cible: { type: 'reps' as const, n: 15 }, repos: 25 },
    ],
  };

  it('lets one Série climb while the others stay put', () => {
    const past = [entrainementDemo('2026-11-02', [fait(a1.id, 'A1', [[7, 7], [15, 15]])])];
    expect(objectifs(objectifsDuJour(sevenFifteen, 'A1', past, []))).toEqual([8, 15]);
  });
});

describe('plateau Consigne', () => {
  const plateau = { ...a1, plateau: true, series: Array.from({ length: 6 }, () => ({ cible: { type: 'reps' as const, n: 8 }, repos: 25 })) };
  const apres = (resultats: number[]) =>
    objectifs(objectifsDuJour(plateau, 'A1', [entrainementDemo('2026-11-02', [fait(a1.id, 'A1', resultats.map((r) => [8, r]))])], []));

  it('moves every Série up once all of them reached the plateau', () => {
    expect(apres([8, 8, 8, 8, 8, 8])).toEqual([9, 9, 9, 9, 9, 9]);
  });

  it('levels the plateau out before climbing (8-8-8-7-7-6 aims for 8 everywhere)', () => {
    expect(apres([8, 8, 8, 7, 7, 6])).toEqual([8, 8, 8, 8, 8, 8]);
  });

  it('climbs from the weakest Résultat when some Séries went beyond', () => {
    expect(apres([10, 9, 9, 8, 9, 9])).toEqual([9, 9, 9, 9, 9, 9]);
  });

  it('starts every Série on the Consigne target the first time', () => {
    expect(objectifs(objectifsDuJour(plateau, 'A1', [], []))).toEqual([8, 8, 8, 8, 8, 8]);
  });
});

describe('departBoucle', () => {
  it('suggests about 65% of the best Résultat on each Série', () => {
    const past = [
      entrainementDemo('2026-11-02', [fait(a1.id, 'A1', [[9, 10], [9, 9], [9, 8]])]),
      entrainementDemo('2026-11-04', [fait(a1.id, 'A1', [[11, 11], [10, 7], [9, 9]])]),
    ];
    expect(departBoucle(a1, 'A1', past)).toEqual([7, 6, 6]);
  });

  it("falls back to the Consigne's targets without history", () => {
    expect(departBoucle(a1, 'A1', [])).toEqual([3, 3, 3]);
  });
});
