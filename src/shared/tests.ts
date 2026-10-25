import type { ExerciceFait } from './carnet.ts';
import type { Cible, EtapeTest, IssueTest, Methode, Niveau, Test } from './methode.ts';

/** A max step always counts as passed; otherwise the Résultat must reach the target. */
export function cibleAtteinte(cible: Cible, resultat: number): boolean {
  if (cible.type === 'max') return true;
  return resultat >= (cible.type === 'reps' ? cible.n : cible.secondes);
}

export interface DeroulementTest {
  /** The step to do now, or null once the Test has reached a conclusion. */
  etape: EtapeTest | null;
  /** The conclusion, once reached. */
  issue: Exclude<IssueTest, { etape: string }> | null;
  /** The Exercice of the last step attempted: where the trainee starts from in that area. */
  dernierExercice: string | null;
}

/** Replays the steps done so far to find the next one, following each step's pass or fail branch. */
export function deroulerTest(test: Test, faits: ExerciceFait[]): DeroulementTest {
  let etape: EtapeTest | undefined = test.etapes[0];
  let dernierExercice: string | null = null;
  const visited = new Set<string>();
  while (etape && !visited.has(etape.id)) {
    visited.add(etape.id);
    const resultat = faits.find((f) => f.ref === etape!.id)?.series[0]?.resultat;
    if (resultat === undefined || resultat === null) return { etape, issue: null, dernierExercice };
    dernierExercice = etape.exercice;
    const next: IssueTest = cibleAtteinte(etape.cible, resultat) ? etape.siReussi : etape.siEchec;
    if (!('etape' in next)) return { etape: null, issue: next, dernierExercice };
    const target: string = next.etape;
    etape = test.etapes.find((e) => e.id === target);
  }
  return { etape: null, issue: { fin: true }, dernierExercice };
}

export interface ConclusionTests {
  /** The suggested starting Niveau and Programme, from the first Test that concludes on one. */
  niveau: string | null;
  partie: string | null;
  /** The Exercice each Test finished on. */
  exercices: string[];
}

export function conclusionTests(methode: Methode, faits: Map<string, ExerciceFait[]>): ConclusionTests {
  let niveau: string | null = null;
  let partie: string | null = null;
  const exercices: string[] = [];
  for (const test of methode.tests) {
    const { issue, dernierExercice } = deroulerTest(test, faits.get(test.id) ?? []);
    if (dernierExercice) exercices.push(dernierExercice);
    if (!niveau && issue && 'niveau' in issue) {
      niveau = issue.niveau;
      partie = issue.partie ?? null;
    }
  }
  return { niveau, partie, exercices };
}

/** The Exercice actuel to set on a Niveau's Consignes whose Progression includes an Exercice the Tests finished on. */
export function exercicesDeDepart(niveau: Niveau, exercices: string[]): { consigne: string; exercice: string }[] {
  return niveau.parties.flatMap((p) =>
    p.blocs.flatMap((b) =>
      b.consignes.flatMap((c) => {
        const found = c.progression?.find((e) => exercices.includes(e.exercice));
        return found ? [{ consigne: c.id, exercice: found.exercice }] : [];
      }),
    ),
  );
}
