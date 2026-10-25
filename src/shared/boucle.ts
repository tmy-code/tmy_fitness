import type { Entrainement } from './carnet.ts';
import type { Consigne } from './methode.ts';
import { historique } from './objectif.ts';

/** The book restarts a Boucle 30 to 40% below one's best. */
export const RATIO_BOUCLE = 0.65;

/**
 * Suggested starting répétitions for each Série when restarting a Niveau in a Boucle:
 * a share of the best Résultat ever reached on that Série, or the Consigne's own target when there is none.
 * Max and timed Séries have no Objectif to lower; their place keeps the Consigne's value so indexes line up.
 */
export function departBoucle(consigne: Consigne, exercice: string, entrainements: Entrainement[], ratio = RATIO_BOUCLE): number[] {
  const passe = historique(consigne.id, exercice, entrainements);
  return consigne.series.map(({ cible }, i) => {
    if (cible.type !== 'reps') return 0;
    const best = Math.max(0, ...passe.map((p) => p.series[i]?.resultat ?? 0));
    return best > 0 ? Math.max(1, Math.round(best * ratio)) : cible.n;
  });
}
