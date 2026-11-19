import type { Entrainement } from './carnet.ts';
import type { Consigne, Niveau, Partie } from './methode.ts';
import type { Operation } from './operations.ts';
import type { suggestionsFin } from './seance.ts';
import { exercicesDeDepart, type ConclusionTests } from './tests.ts';

// What each step of the Parcours changes in the Carnet and the trainee's état. The screens call these and queue the result.

type Suggestions = ReturnType<typeof suggestionsFin>;

/** Finishing an Entraînement: it is recorded, and each accepted suggestion moves the trainee on. */
export function terminerEntrainement(e: Entrainement, niveau: Niveau, suggestions: Suggestions, acceptees: number[]): Operation[] {
  const ops: Operation[] = [{ kind: 'entrainement', data: { ...e, termine: true } }];
  suggestions.forEach((s, i) => {
    if (!acceptees.includes(i)) return;
    if (s.kind === 'progression' && s.consigne) ops.push({ kind: 'exercice-actuel', data: { consigne: s.consigne, exercice: s.vers } });
    if (s.kind === 'programme') ops.push({ kind: 'programme-actuel', data: { niveau: niveau.id, partie: s.vers } });
  });
  return ops;
}

/** Starting the Niveau the Tests led to, on the Programme and Exercices they point to. */
export function demarrerApresTests(niveau: Niveau, partie: Partie | undefined, conclusion: Pick<ConclusionTests, 'exercices'>, id: string, date: string): Operation[] {
  const ops: Operation[] = [{ kind: 'parcours', data: { id, niveau: niveau.id, debut: date, boucle: false } }];
  if (partie) ops.push({ kind: 'programme-actuel', data: { niveau: niveau.id, partie: partie.id } });
  for (const x of exercicesDeDepart(niveau, conclusion.exercices)) ops.push({ kind: 'exercice-actuel', data: x });
  return ops;
}

/** Starting a Boucle: every Consigne with reps Séries restarts from its chosen départ, and Programmes go back to the first. */
export function demarrerBoucle(
  niveau: Niveau,
  lignes: { consigne: Consigne; depart: number[] }[],
  newId: () => string,
  date: string,
): Operation[] {
  const ops: Operation[] = [{ kind: 'parcours', data: { id: newId(), niveau: niveau.id, debut: date, boucle: true } }];
  for (const l of lignes) {
    if (!l.consigne.series.some((s) => s.cible.type === 'reps')) continue;
    ops.push({ kind: 'reprise', data: { id: newId(), consigne: l.consigne.id, date, kind: 'boucle', depart: l.depart } });
  }
  if (niveau.organisation === 'programmes') ops.push({ kind: 'programme-actuel', data: { niveau: niveau.id, partie: niveau.parties[0]!.id } });
  return ops;
}
