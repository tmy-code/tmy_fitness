import { z } from 'zod';
import { exerciceCode, frequence, serieConsigne } from './methode.ts';

// The Carnet (what was done) and the trainee's état (where they are in the Méthode).

/** Ids made on the phone, so a replayed change is recognised by the server. */
export const clientId = z.string().min(8).max(64);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ attendue');
const ref = z.string().min(1).max(64);
const count = z.number().int().min(0).max(10_000);

export const serieFaite = z.object({
  /** Répétitions or seconds aimed for; null for a max Série. */
  objectif: count.nullable(),
  /** Répétitions or seconds achieved; null while not done yet. */
  resultat: count.nullable(),
  forcees: count.default(0),
});
export type SerieFaite = z.infer<typeof serieFaite>;

export const exerciceFait = z.object({
  /** The Consigne (or step of a Test, or stretch of a Routine de souplesse) this was done for. */
  ref,
  /** The Exercice actually done. */
  exercice: exerciceCode,
  note: z.string().trim().max(500).optional(),
  series: z.array(serieFaite).max(20),
});
export type ExerciceFait = z.infer<typeof exerciceFait>;

export const entrainement = z.object({
  id: clientId,
  date: isoDate,
  kind: z.enum(['entrainement', 'test', 'souplesse']),
  niveau: ref.optional(),
  /** The Séance or Programme followed. */
  partie: ref.optional(),
  /** The Blocs done, when only some were (Split). Absent means all of them. */
  blocs: z.array(ref).optional(),
  test: ref.optional(),
  routine: ref.optional(),
  termine: z.boolean(),
  exercices: z.array(exerciceFait).max(100),
});
export type Entrainement = z.infer<typeof entrainement>;

/** One stage of the Parcours: a Niveau started on a date, normally or as a Boucle. */
export const etapeParcours = z.object({
  id: clientId,
  niveau: ref,
  debut: isoDate,
  boucle: z.boolean(),
});
export type EtapeParcours = z.infer<typeof etapeParcours>;

/** A new starting point for a Consigne's Objectifs, set by a Mini-boucle or a Boucle. */
export const reprise = z.object({
  id: clientId,
  consigne: ref,
  date: isoDate,
  kind: z.enum(['mini-boucle', 'boucle']),
  depart: z.array(count).min(1).max(20),
});
export type Reprise = z.infer<typeof reprise>;

export const exerciceActuel = z.object({ consigne: ref, exercice: exerciceCode });
export type ExerciceActuel = z.infer<typeof exerciceActuel>;

/** The Programme the trainee is on, for a Niveau organised in Programmes. */
export const programmeActuel = z.object({ niveau: ref, partie: ref });
export type ProgrammeActuel = z.infer<typeof programmeActuel>;

export const noteExercice = z.object({ exercice: exerciceCode, note: z.string().trim().max(1000) });
export type NoteExercice = z.infer<typeof noteExercice>;

/** The trainee's own tweaks to a Consigne, layered over the Méthode so a re-upload never loses them. */
export const ajustement = z.object({
  consigne: ref,
  series: z.array(serieConsigne).min(1).max(20).optional(),
  rythme: z.string().trim().max(100).optional(),
  increment: z.number().int().min(0).max(10).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type Ajustement = z.infer<typeof ajustement>;

export const reglages = z.object({
  /** The trainee's own Fréquence, replacing the Niveau's recommendation. */
  frequence: frequence.nullable(),
});
export type Reglages = z.infer<typeof reglages>;

/** The trainee's whole état and Carnet, as sent to the phone. */
export interface Carnet {
  entrainements: Entrainement[];
  parcours: EtapeParcours[];
  reprises: Reprise[];
  exercicesActuels: ExerciceActuel[];
  programmesActuels: ProgrammeActuel[];
  notes: NoteExercice[];
  ajustements: Ajustement[];
  reglages: Reglages;
}

export const emptyCarnet = (): Carnet => ({
  entrainements: [],
  parcours: [],
  reprises: [],
  exercicesActuels: [],
  programmesActuels: [],
  notes: [],
  ajustements: [],
  reglages: { frequence: null },
});
