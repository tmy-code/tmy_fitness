import type { Carnet, Entrainement } from './carnet.ts';

export interface PointProgres {
  date: string;
  /** Total répétitions (or seconds) over the Exercice's Séries that day. */
  total: number;
  /** The best single Série that day. */
  meilleure: number;
}

/** One point per Entraînement where the Exercice was done, oldest first. Tests and Routines de souplesse are left out. */
export function progresExercice(exercice: string, entrainements: Entrainement[]): PointProgres[] {
  return entrainements
    .filter((e) => e.kind === 'entrainement' && e.termine)
    .flatMap((e) => {
      const resultats = e.exercices.filter((x) => x.exercice === exercice).flatMap((x) => x.series.map((s) => s.resultat ?? 0));
      if (resultats.length === 0) return [];
      return [{ date: e.date, total: resultats.reduce((a, b) => a + b, 0), meilleure: Math.max(...resultats) }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Every Exercice done in an Entraînement, the most recently done first. */
export function exercicesPratiques(entrainements: Entrainement[]): string[] {
  const last = new Map<string, string>();
  for (const e of entrainements) {
    if (e.kind !== 'entrainement' || !e.termine) continue;
    for (const x of e.exercices) if ((last.get(x.exercice) ?? '') < e.date) last.set(x.exercice, e.date);
  }
  return [...last.entries()].sort((a, b) => b[1].localeCompare(a[1]) || a[0].localeCompare(b[0])).map(([code]) => code);
}

/** Dates where the climb was deliberately restarted on this Exercice: Mini-boucles and Boucles. */
export function marqueursReprise(exercice: string, carnet: Carnet): { date: string; kind: 'mini-boucle' | 'boucle' }[] {
  const consignes = new Set(
    carnet.entrainements.flatMap((e) => e.exercices.filter((x) => x.exercice === exercice).map((x) => x.ref)),
  );
  return carnet.reprises.filter((r) => consignes.has(r.consigne)).map((r) => ({ date: r.date, kind: r.kind }));
}

export interface EtapeAvecDuree {
  niveau: string;
  debut: string;
  boucle: boolean;
  /** Days until the next stage started, or until today for the current one. */
  jours: number;
}

export function dureesParcours(carnet: Carnet, today: string): EtapeAvecDuree[] {
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  return carnet.parcours.map((p, i) => ({
    niveau: p.niveau,
    debut: p.debut,
    boucle: p.boucle,
    jours: days(p.debut, carnet.parcours[i + 1]?.debut ?? today),
  }));
}
