import type { Carnet } from './carnet.ts';
import { consigneEffective, exerciceActuel } from './consigne.ts';
import { consignesOf, type Niveau } from './methode.ts';
import { marqueursReprise, progresExercice } from './progres.ts';

/** Entraînements without a new best before an Exercice counts as stalled. */
export const SEUILS_STAGNATION = 3;

/**
 * Whether an Exercice has not beaten its best total in the last Entraînements,
 * counting only the ones since the latest Mini-boucle or Boucle on it.
 */
export function enStagnation(exercice: string, carnet: Carnet): boolean {
  const reprise = marqueursReprise(exercice, carnet).map((m) => m.date).sort().at(-1);
  const points = progresExercice(exercice, carnet.entrainements).filter((p) => !reprise || p.date > reprise);
  if (points.length <= SEUILS_STAGNATION) return false;
  const avant = Math.max(...points.slice(0, -SEUILS_STAGNATION).map((p) => p.total));
  return Math.max(...points.slice(-SEUILS_STAGNATION).map((p) => p.total)) <= avant;
}

export interface DiagnosticNiveau {
  /** Exercices of the Niveau (as the trainee does them) that are stalled. */
  bloques: string[];
  total: number;
  /** Stalled nearly everywhere: the book says Boucle first, then Fréquence, then a new Niveau. */
  partout: boolean;
}

export function diagnosticNiveau(niveau: Niveau, carnet: Carnet): DiagnosticNiveau {
  const codes = [...new Set(consignesOf(niveau).map(({ consigne }) => exerciceActuel(consigneEffective(consigne, carnet), carnet)))];
  const bloques = codes.filter((c) => enStagnation(c, carnet));
  return { bloques, total: codes.length, partout: bloques.length >= 3 && bloques.length * 2 >= codes.length };
}

/** Whole weeks since a date. */
export function semainesDepuis(debut: string, today: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / (7 * 86_400_000));
}
