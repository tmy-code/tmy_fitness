import type { Bloc, Consigne, Methode, Niveau, Partie } from '../shared/methode.ts';

export interface Lieu {
  niveau: Niveau;
  partie: Partie;
  bloc: Bloc;
  consigne: Consigne;
}

/** Where each Consigne sits in the Méthode, by id. */
export function indexConsignes(methode: Methode): Map<string, Lieu> {
  const index = new Map<string, Lieu>();
  for (const niveau of methode.niveaux)
    for (const partie of niveau.parties) for (const bloc of partie.blocs) for (const consigne of bloc.consignes) index.set(consigne.id, { niveau, partie, bloc, consigne });
  return index;
}

/** "A1 · Pompes démo, mains surélevées", or the bare code for an Exercice missing from the Méthode. */
export function nomExercice(methode: Methode, code: string): string {
  const e = methode.exercices.find((x) => x.code === code);
  return e ? `${code} · ${e.nom}` : code;
}

export function descriptionExercice(methode: Methode, code: string): string | undefined {
  return methode.exercices.find((x) => x.code === code)?.description;
}

export function pageExercice(methode: Methode, code: string): number | undefined {
  return methode.exercices.find((x) => x.code === code)?.page;
}
