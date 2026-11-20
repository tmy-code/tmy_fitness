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
  /** The lest (kg) used that day; absent means none. */
  lest?: number;
}

/** A Mini-boucle starts around 65 % of the last Résultat; the same share is used when the lest changes (p. 77–79). */
export const RATIO_LEST = 0.65;
/** The Période d'entretien trains at 80 % of one's best (p. 82). */
export const RATIO_ENTRETIEN = 0.8;

export interface OptionsObjectif {
  /** The lest planned for today's Exercice. */
  lest?: number;
  /** A Période d'entretien is running. */
  entretien?: boolean;
}

/** Finished Entraînements where this Exercice was done for this Consigne, oldest first. */
export function historique(consigneId: string, exercice: string, entrainements: Entrainement[]): Precedent[] {
  return entrainements
    .filter((e) => e.termine)
    .flatMap((e) =>
      e.exercices
        .filter((x) => x.ref === consigneId && x.exercice === exercice && x.series.some((s) => s.resultat !== null))
        .map((x) => ({ date: e.date, series: x.series, ...(x.lest ? { lest: x.lest } : {}) })),
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
  options: OptionsObjectif = {},
): { series: ObjectifSerie[]; precedent: Precedent | null; ajuste: 'lest' | 'entretien' | null } {
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

  const reps = (i: number) => consigne.series[i]?.cible.type === 'reps';
  if (options.entretien && passe.length > 0) {
    const meilleur = (i: number) => Math.max(0, ...passe.map((p) => p.series[i]?.resultat ?? 0));
    const ajustees = series.map((s, i) => (reps(i) && meilleur(i) > 0 ? { ...s, objectif: Math.max(1, Math.round(meilleur(i) * RATIO_ENTRETIEN)) } : s));
    return { series: ajustees, precedent, ajuste: 'entretien' };
  }
  if (base && precedent && (precedent.lest ?? 0) !== (options.lest ?? 0)) {
    const bas = series.map((s, i) => {
      const dernier = precedent.series[i]?.resultat;
      return reps(i) && dernier ? Math.max(1, Math.round(dernier * RATIO_LEST)) : null;
    });
    const commun = consigne.plateau ? Math.min(...bas.filter((v): v is number => v !== null)) : null;
    const ajustees = series.map((s, i) => (bas[i] === null ? s : { ...s, objectif: commun ?? bas[i]! }));
    return { series: ajustees, precedent, ajuste: 'lest' };
  }
  return { series, precedent, ajuste: null };
}
