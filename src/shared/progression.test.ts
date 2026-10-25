import { describe, expect, it } from 'vitest';
import { methode } from './methode.ts';
import { conditionAtteinte, suggestionProgramme, suggestionProgression } from './progression.ts';
import { conclusionTests, deroulerTest, exercicesDeDepart } from './tests.ts';
import { consigneDemo, demoMethode, fait, niveauDemo } from './testing.ts';

const m = demoMethode();

describe('conditionAtteinte', () => {
  it('needs enough Séries reaching the répétitions', () => {
    const condition = { type: 'series' as const, series: 3, reps: 12 };
    expect(conditionAtteinte(condition, fait('x', 'C1', [[12, 12], [12, 13], [12, 12]]).series)).toBe(true);
    expect(conditionAtteinte(condition, fait('x', 'C1', [[12, 12], [12, 11], [12, 12]]).series)).toBe(false);
  });

  it("leaves the book's wording to the trainee", () => {
    expect(conditionAtteinte({ type: 'texte', texte: 'Quand vous êtes à l’aise' }, [])).toBeNull();
  });
});

describe('suggestions', () => {
  const c = consigneDemo(m, 'demo-1-p1-c');

  it('suggests the next step of the Progression once its condition is met', () => {
    expect(suggestionProgression(c, fait(c.id, 'C1', [[12, 12], [12, 12], [12, 12]]))?.vers).toBe('C2');
    expect(suggestionProgression(c, fait(c.id, 'C1', [[12, 12], [12, 12], [12, 10]]))).toBeNull();
    expect(suggestionProgression(c, fait(c.id, 'C3', [[20, 20], [20, 20], [20, 20]]))).toBeNull();
    expect(suggestionProgression(c, fait(c.id, 'F1', [[20, 20], [20, 20], [20, 20]]))).toBeNull();
  });

  it('suggests the next Programme once its passage condition is met', () => {
    const n1 = niveauDemo(m, 'demo-1');
    const p1 = n1.parties[0]!;
    expect(suggestionProgramme(n1, p1, [fait('demo-1-p1-a1', 'A1', [[8, 8], [8, 8], [8, 9]])])?.vers).toBe('demo-1-p2');
    expect(suggestionProgramme(n1, p1, [fait('demo-1-p1-a1', 'A1', [[8, 8], [8, 7], [8, 9]])])).toBeNull();
  });
});

describe('Tests', () => {
  const haut = m.tests[0]!;
  const dos = m.tests[1]!;

  it('follows the pass and fail branches step by step', () => {
    expect(deroulerTest(haut, []).etape?.id).toBe('th-1');
    expect(deroulerTest(haut, [fait('th-1', 'A2', [[10, 12]])]).etape?.id).toBe('th-2');
    const done = deroulerTest(haut, [fait('th-1', 'A2', [[10, 12]]), fait('th-2', 'A1', [[10, 7]])]);
    expect(done).toEqual({ etape: null, issue: { niveau: 'demo-1', partie: 'demo-1-p1' }, dernierExercice: 'A1' });
  });

  it('concludes on a starting Niveau and the Exercices to start from', () => {
    const faits = new Map([
      ['test-haut', [fait('th-1', 'A2', [[10, 12]]), fait('th-2', 'A1', [[10, 11]]), fait('th-3', 'A', [[20, 14]])]],
      ['test-dos', [fait('td-1', 'C1', [[12, 15]]), fait('td-2', 'C2', [[12, 9]])]],
    ]);
    const conclusion = conclusionTests(m, faits);
    expect(conclusion).toEqual({ niveau: 'demo-1', partie: 'demo-1-p2', exercices: ['A', 'C2'] });
    expect(exercicesDeDepart(niveauDemo(m, 'demo-1'), conclusion.exercices)).toEqual([{ consigne: 'demo-1-p1-c', exercice: 'C2' }]);
  });
});

describe('methode schema', () => {
  it('rejects unknown Exercices and broken references', () => {
    const broken = structuredClone(m);
    broken.niveaux[0]!.parties[0]!.blocs[0]!.consignes[0]!.exercice = 'Z9';
    broken.tests[0]!.etapes[0]!.siEchec = { niveau: 'nope' };
    const result = methode.safeParse(broken);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('Z9 inconnu'), expect.stringContaining('nope inconnu')]),
    );
  });
});
