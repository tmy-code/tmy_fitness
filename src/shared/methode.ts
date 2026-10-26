import { z } from 'zod';

// The Méthode: the program content transcribed from the book (see ADR 0001 — the real file never enters the repo).
// Every item carries a stable id so a corrected re-upload keeps the Carnet attached to it.

const id = z.string().min(1).max(64);
const text = z.string().trim().min(1).max(2000);
const seconds = z.number().int().min(0).max(3600);

/**
 * An Exercice code: a letter, optionally followed by a number (A1, B3, E6, or B alone).
 * Two Exercices done in alternation within one Consigne are joined by a slash (H/G, B3/B).
 * A few movements the book names without a code get an upper-case word instead (CANARD).
 */
export const exerciceCode = z
  .string()
  .regex(/^(?:[A-Z][0-9]*(?:\/[A-Z][0-9]*)*|[A-Z]{3,20})$/, 'code Exercice attendu (ex. A1, B, H/G)');

/** What one Série aims for. */
export const cible = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reps'), n: z.number().int().min(1).max(500) }),
  /** As many répétitions as possible, or — with `secondes` — held as long as possible. */
  z.object({ type: z.literal('max'), secondes: z.literal(true).optional() }),
  z.object({ type: z.literal('duree'), secondes: z.number().int().min(1).max(3600) }),
]);
export type Cible = z.infer<typeof cible>;

/** Whether a Série is measured in seconds rather than répétitions. */
export function enSecondes(c: Cible): boolean {
  return c.type === 'duree' || (c.type === 'max' && c.secondes === true);
}

export const serieConsigne = z.object({
  cible,
  /** Temps de repos after this Série (before the next Série, or the next Consigne for the last one). */
  repos: seconds,
});
export type SerieConsigne = z.infer<typeof serieConsigne>;

/** "N Séries reaching M répétitions" can be checked by the app; anything else is shown as the book words it. */
export const condition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('series'), series: z.number().int().min(1).max(20), reps: z.number().int().min(1).max(500) }),
  z.object({ type: z.literal('texte'), texte: text }),
]);
export type Condition = z.infer<typeof condition>;

export const etapeProgression = z.object({
  exercice: exerciceCode,
  /** Condition to pass from this step to the next one; absent on the last step. */
  condition: condition.optional(),
  /** Starting répétitions per Série when arriving on this step; defaults to the Consigne's own targets. */
  depart: z.array(z.number().int().min(0).max(500)).optional(),
});
export type EtapeProgression = z.infer<typeof etapeProgression>;

export const consigne = z.object({
  id,
  /** The Exercice the book names; the trainee's Exercice actuel may differ (Progression or Remplacement). */
  exercice: exerciceCode,
  series: z.array(serieConsigne).min(1).max(20),
  rythme: z.string().trim().max(100).optional(),
  /** Répétitions added to each Série after a successful Entraînement. */
  increment: z.number().int().min(0).max(10).default(1),
  note: text.optional(),
  progression: z.array(etapeProgression).min(2).optional(),
});
export type Consigne = z.infer<typeof consigne>;

export const bloc = z.object({
  id,
  nom: z.string().trim().min(1).max(100),
  consignes: z.array(consigne).min(1),
  /** Rest before the next Bloc. */
  repos: seconds.optional(),
  /** An optional Bloc: left out unless the trainee picks it, and never owed on a Split. */
  facultatif: z.boolean().optional(),
  /** Blocs sharing a `choix` are alternatives: the trainee does one of them. */
  choix: id.optional(),
});
export type Bloc = z.infer<typeof bloc>;

/** A Séance or a Programme: one prescribed workout of a Niveau. */
export const partie = z.object({
  id,
  nom: z.string().trim().min(1).max(100),
  blocs: z.array(bloc).min(1),
  /** For a Programme: the target on one Consigne (and, if given, on one Exercice of it) that unlocks the next Programme. */
  passage: z.object({ consigne: id, exercice: exerciceCode.optional(), condition }).optional(),
});
export type Partie = z.infer<typeof partie>;

export const frequence = z.discriminatedUnion('type', [
  z.object({ type: z.literal('parSemaine'), n: z.number().int().min(1).max(7) }),
  z.object({ type: z.literal('tousLesJours'), n: z.number().int().min(1).max(14) }),
]);
export type Frequence = z.infer<typeof frequence>;

export const niveau = z.object({
  id,
  nom: z.string().trim().min(1).max(100),
  /** "programmes" are done in order, "seances" alternate, "unique" has a single workout. */
  organisation: z.enum(['programmes', 'seances', 'unique']),
  parties: z.array(partie).min(1),
  frequence: frequence.optional(),
  /** What the book says about the Niveau as a whole: frequency changes, when to move on. */
  note: text.optional(),
  page: z.number().int().min(1).optional(),
});
export type Niveau = z.infer<typeof niveau>;

export const exercice = z.object({
  code: exerciceCode,
  /** A short name in our own words — never the book's description. */
  nom: z.string().trim().min(1).max(100),
  page: z.number().int().min(1).optional(),
});
export type Exercice = z.infer<typeof exercice>;

/** A picture the owner uploaded for an Exercice; stored on the server only, never in the Méthode file. */
export interface ImageExercice {
  exercice: string;
  /** Changes on each upload. */
  version: string;
}

/** Where a step of the Tests leads: another step, or a conclusion. */
export const issueTest = z.union([
  z.object({ etape: id }),
  z.object({ niveau: id, partie: id.optional() }),
  z.object({ fin: z.literal(true) }),
]);
export type IssueTest = z.infer<typeof issueTest>;

export const etapeTest = z.object({
  id,
  exercice: exerciceCode,
  cible,
  /** Rest before the next step when the target is reached. */
  repos: seconds.default(60),
  note: text.optional(),
  siReussi: issueTest,
  siEchec: issueTest,
});
export type EtapeTest = z.infer<typeof etapeTest>;

export const test = z.object({
  id,
  nom: z.string().trim().min(1).max(100),
  etapes: z.array(etapeTest).min(1),
});
export type Test = z.infer<typeof test>;

export const etirement = z.object({
  nom: z.string().trim().min(1).max(100),
  secondes: z.number().int().min(1).max(600),
  page: z.number().int().min(1).optional(),
  note: text.optional(),
});

export const routineSouplesse = z.object({
  id,
  nom: z.string().trim().min(1).max(100),
  etirements: z.array(etirement).min(1),
});
export type RoutineSouplesse = z.infer<typeof routineSouplesse>;

export const methode = z
  .object({
    nom: z.string().trim().min(1).max(100),
    exercices: z.array(exercice),
    /** Items of the Échauffement checklist. */
    echauffement: z.array(z.string().trim().min(1).max(200)).default([]),
    tests: z.array(test).default([]),
    niveaux: z.array(niveau),
    souplesse: z.array(routineSouplesse).default([]),
  })
  .superRefine((m, ctx) => {
    const codes = new Set(m.exercices.map((e) => e.code));
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const checkCode = (code: string, where: string) => {
      if (!codes.has(code)) issue(`${where} : Exercice ${code} inconnu`);
    };
    const seen = new Set<string>();
    const unique = (value: string, where: string) => {
      if (seen.has(value)) issue(`${where} : id ${value} en double`);
      seen.add(value);
    };
    for (const n of m.niveaux) {
      unique(n.id, 'Niveau');
      for (const p of n.parties) {
        unique(p.id, n.nom);
        const consigneIds = new Set<string>();
        for (const b of p.blocs) {
          unique(b.id, p.nom);
          for (const c of b.consignes) {
            unique(c.id, b.nom);
            consigneIds.add(c.id);
            checkCode(c.exercice, c.id);
            c.progression?.forEach((e) => checkCode(e.exercice, c.id));
          }
        }
        if (p.passage && !consigneIds.has(p.passage.consigne)) issue(`${p.nom} : Consigne de passage inconnue`);
      }
    }
    const niveauIds = new Set(m.niveaux.map((n) => n.id));
    for (const t of m.tests) {
      unique(t.id, 'Test');
      const etapeIds = new Set(t.etapes.map((e) => e.id));
      for (const e of t.etapes) {
        checkCode(e.exercice, `${t.nom} ${e.id}`);
        for (const next of [e.siReussi, e.siEchec]) {
          if ('etape' in next && !etapeIds.has(next.etape)) issue(`${t.nom} : étape ${next.etape} inconnue`);
          if ('niveau' in next && !niveauIds.has(next.niveau)) issue(`${t.nom} : Niveau ${next.niveau} inconnu`);
        }
      }
    }
  });
export type Methode = z.infer<typeof methode>;
export type MethodeInput = z.input<typeof methode>;

/** Every Consigne of a Niveau, with the Partie and Bloc it belongs to. */
export function consignesOf(n: Niveau): { partie: Partie; bloc: Bloc; consigne: Consigne }[] {
  return n.parties.flatMap((partie) => partie.blocs.flatMap((bloc) => bloc.consignes.map((consigne) => ({ partie, bloc, consigne }))));
}
