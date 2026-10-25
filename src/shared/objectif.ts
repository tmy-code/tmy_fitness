import type { Entrainement, Reprise, SerieFaite } from './carnet.ts';
import type { Cible, Consigne } from './methode.ts';

export interface ObjectifSerie {
  cible: Cible;
  /** Répétitions or seconds to aim for today; null for a max Série. */
  objectif: number | null;
  /** Last time's Résultat on this Série, the number to beat. */
  aBattre: number | null;
}

export interface Precedent {
  date: string;
  series: SerieFaite[];
}

/** Finished Entraînements where this Exercice was done for this Consigne, oldest first. */
export function historique(consigneId: string, exercice: string, entrainements: Entrainement[]): Precedent[] {
  return entrainements
    .filter((e) => e.termine)
    .flatMap((e) =>
      e.exercices
        .filter((x) => x.ref === consigneId && x.exercice === exercice && x.series.some((s) => s.resultat !== null))
        .map((x) => ({ date: e.date, series: x.series })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The latest Mini-boucle or Boucle on a Consigne, if any. */
export function derniereReprise(consigneId: string, reprises: Reprise[]): Reprise | undefined {
  return reprises.filter((r) => r.consigne === consigneId).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

/**
 * The Objectif du jour for each Série of a Consigne.
 * Répétitions climb by the Consigne's increment after each Série that reached its Objectif, and stay put after a miss.
 * A Mini-boucle or Boucle restarts the climb from its starting point; so does a new Exercice in a Progression (`depart`).
 */
export function objectifsDuJour(
  consigne: Consigne,
  exercice: string,
  entrainements: Entrainement[],
  reprises: Reprise[],
  depart?: number[],
): { series: ObjectifSerie[]; precedent: Precedent | null } {
  const reprise = derniereReprise(consigne.id, reprises);
  const passe = historique(consigne.id, exercice, entrainements);
  const precedent = passe.at(-1) ?? null;
  // Only an Entraînement done since the latest reprise counts towards the climb.
  const base = precedent && (!reprise || precedent.date >= reprise.date) ? precedent : null;
  const start = reprise?.depart ?? depart;

  const series = consigne.series.map(({ cible }, i): ObjectifSerie => {
    const avant = precedent?.series[i]?.resultat ?? null;
    if (cible.type === 'max') return { cible, objectif: null, aBattre: avant };
    if (cible.type === 'duree') return { cible, objectif: cible.secondes, aBattre: avant };
    const fait = base?.series[i];
    if (fait && fait.resultat !== null) {
      const vise = fait.objectif ?? cible.n;
      return { cible, objectif: fait.resultat >= vise ? fait.resultat + consigne.increment : vise, aBattre: avant };
    }
    return { cible, objectif: start?.[i] ?? start?.at(-1) ?? cible.n, aBattre: avant };
  });
  return { series, precedent };
}
