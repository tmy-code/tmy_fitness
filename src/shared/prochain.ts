import type { Carnet, Entrainement, EtapeParcours } from './carnet.ts';
import type { Frequence, Methode, Niveau, Partie } from './methode.ts';

/** The Niveau the trainee is on: the latest stage of the Parcours. */
export function etapeActuelle(parcours: EtapeParcours[]): EtapeParcours | undefined {
  return parcours.at(-1);
}

export function niveauActuel(methode: Methode, carnet: Carnet): Niveau | undefined {
  const etape = etapeActuelle(carnet.parcours);
  return etape && methode.niveaux.find((n) => n.id === etape.niveau);
}

/** Finished Entraînements on a Niveau since the given date, oldest first. */
function faitsSur(niveauId: string, depuis: string, entrainements: Entrainement[]): Entrainement[] {
  return entrainements
    .filter((e) => e.kind === 'entrainement' && e.termine && e.niveau === niveauId && e.date >= depuis)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The Séance or Programme to do next on a Niveau:
 * Programmes stay on the current one until the trainee passes to the next, Séances alternate, a single workout repeats.
 * A Split day that left Blocs undone counts as done: the next day continues the same workout.
 */
export function prochainePartie(niveau: Niveau, carnet: Carnet): Partie {
  const first = niveau.parties[0]!;
  if (niveau.organisation === 'programmes') {
    const actuel = carnet.programmesActuels.find((p) => p.niveau === niveau.id);
    return niveau.parties.find((p) => p.id === actuel?.partie) ?? first;
  }
  if (niveau.organisation === 'unique') return first;
  const debut = etapeActuelle(carnet.parcours)?.debut ?? '0000-00-00';
  const dernier = faitsSur(niveau.id, debut, carnet.entrainements).at(-1);
  const index = niveau.parties.findIndex((p) => p.id === dernier?.partie);
  if (index === -1) return first;
  const partie = niveau.parties[index]!;
  if (blocsFaitsDepuisDebut(partie, carnet.entrainements).length > 0) return partie;
  return niveau.parties[(index + 1) % niveau.parties.length]!;
}

/**
 * What a workout requires: each Bloc on its own, except that alternatives (same `choix`) form one group
 * of which any Bloc will do. Optional Blocs are never required.
 */
export function blocsRequis(partie: Partie): string[][] {
  const groupes = new Map<string, string[]>();
  for (const b of partie.blocs) {
    if (b.facultatif) continue;
    const key = b.choix ?? `bloc:${b.id}`;
    groupes.set(key, [...(groupes.get(key) ?? []), b.id]);
  }
  return [...groupes.values()];
}

function passesSur(partie: Partie, entrainements: Entrainement[]): Entrainement[] {
  return entrainements
    .filter((e) => e.kind === 'entrainement' && e.termine && e.partie === partie.id)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** For a workout spread over several days (Split), the Blocs already done in the current round. */
export function blocsFaitsDepuisDebut(partie: Partie, entrainements: Entrainement[]): string[] {
  const requis = blocsRequis(partie);
  let done = new Set<string>();
  for (const e of passesSur(partie, entrainements)) {
    if (!e.blocs) {
      done = new Set();
      continue;
    }
    e.blocs.forEach((b) => done.add(b));
    if (requis.every((groupe) => groupe.some((b) => done.has(b)))) done = new Set();
  }
  return [...done];
}

/**
 * The Blocs to tick by default before an Entraînement: the required ones not yet done in this round,
 * taking for each choice the alternative the trainee picked last time.
 */
export function blocsProposes(partie: Partie, entrainements: Entrainement[]): string[] {
  const faits = blocsFaitsDepuisDebut(partie, entrainements);
  const recents = passesSur(partie, entrainements).reverse();
  const proposes: string[] = [];
  for (const groupe of blocsRequis(partie)) {
    if (groupe.some((b) => faits.includes(b))) continue;
    const dernier = groupe.length > 1 ? recents.flatMap((e) => e.blocs ?? []).find((b) => groupe.includes(b)) : undefined;
    proposes.push(dernier ?? groupe[0]!);
  }
  return partie.blocs.map((b) => b.id).filter((b) => proposes.includes(b));
}

/** Days between Entraînements for a Fréquence. */
export function intervalle(f: Frequence): number {
  return f.type === 'parSemaine' ? 7 / f.n : f.n;
}

export function libelleFrequence(f: Frequence): string {
  if (f.type === 'parSemaine') return `${f.n} par semaine`;
  return f.n === 1 ? 'tous les jours' : `1 tous les ${f.n} jours`;
}

function joursEntre(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface LigneFrequence {
  frequence: Frequence | null;
  libelle: string | null;
  dernier: string | null;
  joursDepuis: number | null;
  /** Whether the recommended rest since the last Entraînement has passed. */
  jourEntrainement: boolean;
}

/** The "Fréquence conseillée" line: the trainee's own Fréquence wins over the Niveau's. */
export function ligneFrequence(niveau: Niveau | undefined, carnet: Carnet, today: string): LigneFrequence {
  const frequence = carnet.reglages.frequence ?? niveau?.frequence ?? null;
  const dernier =
    carnet.entrainements
      .filter((e) => e.kind === 'entrainement' && e.termine)
      .map((e) => e.date)
      .sort()
      .at(-1) ?? null;
  const joursDepuis = dernier ? joursEntre(dernier, today) : null;
  const jourEntrainement = joursDepuis === null || !frequence || joursDepuis >= Math.floor(intervalle(frequence));
  return { frequence, libelle: frequence ? libelleFrequence(frequence) : null, dernier, joursDepuis, jourEntrainement };
}
