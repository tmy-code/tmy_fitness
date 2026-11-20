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
 * The common Objectif of a plateau Consigne, or null when it is not one (or has no past Entraînement to build on).
 * Every Série reached its Objectif: all go up together from the weakest Résultat. Otherwise the plateau stays where it is
 * until the Séries are levelled out ("8-8-8-7-7-6" aims for 8 everywhere, not 9-9-9-8-8-8).
 */
function objectifPlateau(consigne: Consigne, base: Precedent | null): number | null {
  if (!consigne.plateau || !base) return null;
  const faites = base.series.filter((s) => s.resultat !== null);
  if (faites.length === 0) return null;
  const premiere = consigne.series[0]?.cible;
  const palier = Math.max(...faites.map((s) => s.objectif ?? (premiere?.type === 'reps' ? premiere.n : 0)));
  const reussi = faites.length === consigne.series.length && faites.every((s) => s.resultat! >= (s.objectif ?? palier));
  return reussi ? Math.min(...faites.map((s) => s.resultat!)) + consigne.increment : palier;
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

  const plateau = objectifPlateau(consigne, base);
  const series = consigne.series.map(({ cible, increment }, i): ObjectifSerie => {
    const avant = precedent?.series[i]?.resultat ?? null;
    if (cible.type === 'max') return { cible, objectif: null, aBattre: avant };
    if (cible.type === 'duree') return { cible, objectif: cible.secondes, aBattre: avant };
    if (plateau !== null) return { cible, objectif: plateau, aBattre: avant };
    const fait = base?.series[i];
    if (fait && fait.resultat !== null) {
      const vise = fait.objectif ?? cible.n;
      return { cible, objectif: fait.resultat >= vise ? fait.resultat + (increment ?? consigne.increment) : vise, aBattre: avant };
    }
    return { cible, objectif: start?.[i] ?? start?.at(-1) ?? cible.n, aBattre: avant };
  });
  return { series, precedent };
}
