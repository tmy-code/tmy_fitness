import type { Carnet, Entrainement } from './carnet.ts';
import { consigneEffective, departEtape, exerciceActuel } from './consigne.ts';
import type { Niveau, Partie } from './methode.ts';
import { objectifsDuJour } from './objectif.ts';
import { suggestionProgramme, suggestionProgression, type Suggestion } from './progression.ts';

/**
 * A new Entraînement on a Séance or Programme, with each Série's Objectif du jour filled in.
 * `blocs` lists the Blocs to do today (a Split); all of them when omitted.
 */
export function nouvelEntrainement(niveau: Niveau, partie: Partie, carnet: Carnet, id: string, date: string, blocs?: string[]): Entrainement {
  const chosen = partie.blocs.filter((b) => !blocs || blocs.includes(b.id));
  const exercices = chosen.flatMap((b) =>
    b.consignes.map((c) => {
      const consigne = consigneEffective(c, carnet);
      const exercice = exerciceActuel(consigne, carnet);
      const { series } = objectifsDuJour(consigne, exercice, carnet.entrainements, carnet.reprises, departEtape(consigne, exercice));
      return { ref: c.id, exercice, series: series.map((s) => ({ objectif: s.objectif, resultat: null, forcees: 0 })) };
    }),
  );
  const split = blocs && chosen.length < partie.blocs.length ? { blocs: chosen.map((b) => b.id) } : {};
  return { id, date, kind: 'entrainement', niveau: niveau.id, partie: partie.id, termine: false, exercices, ...split };
}

/** The first Série not done yet, in order. */
export function serieCourante(e: Entrainement): { exercice: number; serie: number } | null {
  for (const [i, x] of e.exercices.entries()) {
    const j = x.series.findIndex((s) => s.resultat === null);
    if (j !== -1) return { exercice: i, serie: j };
  }
  return null;
}

/**
 * The rest after a Série: the Série's own Temps de repos, or the Bloc's longer rest
 * when it is the last Série of the Bloc's last Consigne. Nothing after the very last Série.
 */
export function reposApres(partie: Partie, e: Entrainement, exercice: number, serie: number, carnet: Carnet): number {
  const fait = e.exercices[exercice]!;
  const isLastSerie = serie === fait.series.length - 1;
  if (isLastSerie && exercice === e.exercices.length - 1) return 0;
  const bloc = partie.blocs.find((b) => b.consignes.some((c) => c.id === fait.ref));
  const consigne = bloc?.consignes.find((c) => c.id === fait.ref);
  if (!bloc || !consigne) return 0;
  const own = consigneEffective(consigne, carnet).series[serie]?.repos ?? 0;
  const lastOfBloc = isLastSerie && bloc.consignes.at(-1)?.id === consigne.id;
  return lastOfBloc && bloc.repos !== undefined ? bloc.repos : own;
}

/** "Passer à C2 ?" and "Passer au Deuxième programme ?" suggestions at the end of an Entraînement. */
export function suggestionsFin(niveau: Niveau, partie: Partie, e: Entrainement, carnet: Carnet): (Suggestion & { consigne?: string })[] {
  const out: (Suggestion & { consigne?: string })[] = [];
  for (const fait of e.exercices) {
    const consigne = partie.blocs.flatMap((b) => b.consignes).find((c) => c.id === fait.ref);
    if (!consigne) continue;
    const s = suggestionProgression(consigneEffective(consigne, carnet), fait);
    if (s) out.push({ ...s, consigne: consigne.id });
  }
  const p = suggestionProgramme(niveau, partie, e.exercices);
  if (p) out.push(p);
  return out;
}
