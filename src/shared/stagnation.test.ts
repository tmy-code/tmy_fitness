import { describe, expect, it } from 'vitest';
import { dernierLest } from './seance.ts';
import { enStagnation, semainesDepuis } from './stagnation.ts';
import { carnetDemo, entrainementDemo, fait } from './test-helpers.ts';

const seance = (date: string, total: number, extra = {}) => entrainementDemo(date, [fait('c', 'A1', [[total, total]], extra)]);

describe('enStagnation', () => {
  it('is false while the Exercice keeps beating its best', () => {
    const c = carnetDemo({ entrainements: [seance('2026-11-01', 5), seance('2026-11-03', 6), seance('2026-11-05', 7), seance('2026-11-07', 8)] });
    expect(enStagnation('A1', c)).toBe(false);
  });

  it('is true after three Entraînements without a new best', () => {
    const c = carnetDemo({ entrainements: [seance('2026-11-01', 5), seance('2026-11-03', 8), seance('2026-11-05', 8), seance('2026-11-07', 7), seance('2026-11-09', 8)] });
    expect(enStagnation('A1', c)).toBe(true);
  });

  it('does not judge an Exercice with too little history', () => {
    const c = carnetDemo({ entrainements: [seance('2026-11-01', 8), seance('2026-11-03', 8), seance('2026-11-05', 8)] });
    expect(enStagnation('A1', c)).toBe(false);
  });

  it('starts over after a Mini-boucle', () => {
    const c = carnetDemo({
      entrainements: [seance('2026-11-01', 5), seance('2026-11-03', 8), seance('2026-11-05', 8), seance('2026-11-07', 7), seance('2026-11-09', 8)],
      reprises: [{ id: 'test-reprise-1', consigne: 'c', date: '2026-11-09', kind: 'mini-boucle', depart: [4] }],
    });
    expect(enStagnation('A1', c)).toBe(false);
  });
});

describe('semainesDepuis', () => {
  it('counts whole weeks', () => {
    expect(semainesDepuis('2026-10-01', '2026-11-20')).toBe(7);
  });
});

describe('dernierLest', () => {
  it('gives the lest of the latest Entraînement on that Exercice', () => {
    const past = [seance('2026-11-01', 5, { lest: 5 }), seance('2026-11-03', 5, { lest: 10 })];
    expect(dernierLest('A1', past)).toBe(10);
    expect(dernierLest('B', past)).toBeUndefined();
  });
});
