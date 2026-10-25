import { describe, expect, it } from 'vitest';
import { blocsFaitsDepuisDebut, ligneFrequence, prochainePartie } from './prochain.ts';
import { carnetDemo, demoMethode, entrainementDemo, niveauDemo } from './testing.ts';

const m = demoMethode();
const n1 = niveauDemo(m, 'demo-1');
const n2 = niveauDemo(m, 'demo-2');
const parcours = (niveau: string) => [{ id: 'test-parcours-1', niveau, debut: '2026-11-01', boucle: false }];

describe('prochainePartie', () => {
  it('stays on the current Programme', () => {
    expect(prochainePartie(n1, carnetDemo({ parcours: parcours('demo-1') })).id).toBe('demo-1-p1');
    const carnet = carnetDemo({ parcours: parcours('demo-1'), programmesActuels: [{ niveau: 'demo-1', partie: 'demo-1-p2' }] });
    expect(prochainePartie(n1, carnet).id).toBe('demo-1-p2');
  });

  it('alternates Séances', () => {
    expect(prochainePartie(n2, carnetDemo({ parcours: parcours('demo-2') })).id).toBe('demo-2-s1');
    const after1 = [entrainementDemo('2026-11-02', [], { niveau: 'demo-2', partie: 'demo-2-s1' })];
    expect(prochainePartie(n2, carnetDemo({ parcours: parcours('demo-2'), entrainements: after1 })).id).toBe('demo-2-s2');
    const after2 = [...after1, entrainementDemo('2026-11-05', [], { niveau: 'demo-2', partie: 'demo-2-s2' })];
    expect(prochainePartie(n2, carnetDemo({ parcours: parcours('demo-2'), entrainements: after2 })).id).toBe('demo-2-s1');
  });

  it('ignores Entraînements from before the current stage of the Parcours (a Boucle starts afresh)', () => {
    const old = [entrainementDemo('2026-10-01', [], { niveau: 'demo-2', partie: 'demo-2-s1' })];
    expect(prochainePartie(n2, carnetDemo({ parcours: parcours('demo-2'), entrainements: old })).id).toBe('demo-2-s1');
  });

  it('continues the same workout after a Split day, until every Bloc is done', () => {
    const p1 = n1.parties[0]!;
    const day1 = entrainementDemo('2026-11-02', [], { niveau: 'demo-1', partie: p1.id, blocs: ['demo-1-p1-haut'] });
    const day2 = entrainementDemo('2026-11-03', [], { niveau: 'demo-1', partie: p1.id, blocs: ['demo-1-p1-dos', 'demo-1-p1-jambes'] });
    expect(blocsFaitsDepuisDebut(p1, [day1])).toEqual(['demo-1-p1-haut']);
    expect(blocsFaitsDepuisDebut(p1, [day1, day2])).toEqual([]);

    const s1 = n2.parties[0]!;
    const half = entrainementDemo('2026-11-02', [], { niveau: 'demo-2', partie: s1.id, blocs: [] });
    expect(prochainePartie(n2, carnetDemo({ parcours: parcours('demo-2'), entrainements: [half] })).id).toBe('demo-2-s2');
  });
});

describe('ligneFrequence', () => {
  it("uses the Niveau's Fréquence and counts days since the last Entraînement", () => {
    const entrainements = [entrainementDemo('2026-11-02', [], { niveau: 'demo-2' })];
    const line = ligneFrequence(n2, carnetDemo({ entrainements }), '2026-11-04');
    expect(line).toMatchObject({ libelle: '1 tous les 3 jours', dernier: '2026-11-02', joursDepuis: 2, jourEntrainement: false });
    expect(ligneFrequence(n2, carnetDemo({ entrainements }), '2026-11-05').jourEntrainement).toBe(true);
  });

  it("prefers the trainee's own Fréquence", () => {
    const carnet = carnetDemo({ reglages: { frequence: { type: 'parSemaine', n: 2 } } });
    expect(ligneFrequence(n2, carnet, '2026-11-04')).toMatchObject({ libelle: '2 par semaine', jourEntrainement: true });
  });
});
