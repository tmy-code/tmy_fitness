import type { ExerciceFait, SerieFaite } from './carnet.ts';
import type { Condition, Consigne, Niveau, Partie } from './methode.ts';

/** Whether the Séries meet a condition; null when the condition is the book's wording and only the trainee can judge. */
export function conditionAtteinte(condition: Condition, series: SerieFaite[]): boolean | null {
  if (condition.type === 'texte') return null;
  const reussies = series.filter((s) => s.resultat !== null && s.resultat >= condition.reps).length;
  return reussies >= condition.series;
}

/** The trainee's step in a Consigne's Progression, or -1 when they do an Exercice outside it (Remplacement). */
export function etapeDe(consigne: Consigne, exercice: string): number {
  return consigne.progression?.findIndex((e) => e.exercice === exercice) ?? -1;
}

export interface Suggestion {
  kind: 'progression' | 'programme';
  /** What to pass to: an Exercice code, or a Programme's id. */
  vers: string;
  libelle: string;
}

/** After an Exercice, suggests passing to the next step of its Progression when the condition is met. */
export function suggestionProgression(consigne: Consigne, fait: ExerciceFait): Suggestion | null {
  const index = etapeDe(consigne, fait.exercice);
  const etape = consigne.progression?.[index];
  const suivante = consigne.progression?.[index + 1];
  if (!etape?.condition || !suivante) return null;
  if (conditionAtteinte(etape.condition, fait.series) !== true) return null;
  return { kind: 'progression', vers: suivante.exercice, libelle: `Objectif atteint ✓ — passer à ${suivante.exercice} la prochaine fois ?` };
}

/** After an Entraînement on a Programme, suggests the next Programme when its passage condition is met. */
export function suggestionProgramme(niveau: Niveau, partie: Partie, faits: ExerciceFait[]): Suggestion | null {
  if (niveau.organisation !== 'programmes' || !partie.passage) return null;
  const suivant = niveau.parties[niveau.parties.findIndex((p) => p.id === partie.id) + 1];
  const fait = faits.find((f) => f.ref === partie.passage!.consigne);
  if (!suivant || !fait || conditionAtteinte(partie.passage.condition, fait.series) !== true) return null;
  return { kind: 'programme', vers: suivant.id, libelle: `Objectif atteint ✓ — passer au ${suivant.nom} ?` };
}
