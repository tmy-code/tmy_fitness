import type { ZodType } from 'zod';
import {
  ajustement,
  entrainement,
  etapeParcours,
  exerciceActuel,
  noteExercice,
  programmeActuel,
  reprise,
  type Ajustement,
  type Carnet,
  type Entrainement,
  type EtapeParcours,
  type ExerciceActuel,
  type NoteExercice,
  type ProgrammeActuel,
  type Reglages,
  type Reprise,
} from './carnet.ts';

/**
 * A change to the Carnet or état made on the phone. Every one can wait in the send queue (ADR 0002)
 * and is idempotent on the server, so replaying it after a lost answer does no harm.
 */
export type Operation =
  | { kind: 'entrainement'; data: Entrainement }
  | { kind: 'supprimer-entrainement'; id: string }
  | { kind: 'parcours'; data: EtapeParcours }
  | { kind: 'supprimer-parcours'; id: string }
  | { kind: 'reprise'; data: Reprise }
  | { kind: 'exercice-actuel'; data: ExerciceActuel }
  | { kind: 'programme-actuel'; data: ProgrammeActuel }
  | { kind: 'note'; data: NoteExercice }
  | { kind: 'ajustement'; data: Ajustement }
  | { kind: 'supprimer-ajustement'; consigne: string }
  | { kind: 'reglages'; data: Reglages };

/**
 * Every record kind, defined once: where it is sent, how the server checks it, how it sits in the Carnet.
 * The phone's optimistic view (applyOperation), the queue (opRequest) and the server's routes all read this table,
 * so adding a kind means one entry here plus its SQL on the server.
 */
export interface RecordKind<T> {
  /** The path segment: PUT and DELETE go to /api/<segment>/<key>. */
  segment: string;
  /** Which list of the Carnet holds these records. */
  collection: keyof Carnet;
  schema: ZodType<T>;
  /** The record's identity: what the path names and what a replayed change lands on. */
  key: (data: T) => string;
  /** The kind of Operation that removes one, if records can be removed. */
  removal?: 'supprimer-entrainement' | 'supprimer-parcours' | 'supprimer-ajustement';
}

export const RECORDS = {
  entrainement: { segment: 'entrainements', collection: 'entrainements', schema: entrainement, key: (d) => d.id, removal: 'supprimer-entrainement' } as RecordKind<Entrainement>,
  parcours: { segment: 'parcours', collection: 'parcours', schema: etapeParcours, key: (d) => d.id, removal: 'supprimer-parcours' } as RecordKind<EtapeParcours>,
  reprise: { segment: 'reprises', collection: 'reprises', schema: reprise, key: (d) => d.id } as RecordKind<Reprise>,
  'exercice-actuel': { segment: 'exercices-actuels', collection: 'exercicesActuels', schema: exerciceActuel, key: (d) => d.consigne } as RecordKind<ExerciceActuel>,
  'programme-actuel': { segment: 'programmes-actuels', collection: 'programmesActuels', schema: programmeActuel, key: (d) => d.niveau } as RecordKind<ProgrammeActuel>,
  note: { segment: 'notes', collection: 'notes', schema: noteExercice, key: (d) => d.exercice } as RecordKind<NoteExercice>,
  ajustement: { segment: 'ajustements', collection: 'ajustements', schema: ajustement, key: (d) => d.consigne, removal: 'supprimer-ajustement' } as RecordKind<Ajustement>,
} as const;

export type RecordName = keyof typeof RECORDS;
export type RecordData<K extends RecordName> = (typeof RECORDS)[K] extends RecordKind<infer T> ? T : never;

type Removal = Extract<Operation, { kind: `supprimer-${string}` }>;

/** The record kind a removal Operation belongs to, and the key it names. */
function removalOf(op: Removal): { name: RecordName; key: string } {
  switch (op.kind) {
    case 'supprimer-entrainement':
      return { name: 'entrainement', key: op.id };
    case 'supprimer-parcours':
      return { name: 'parcours', key: op.id };
    case 'supprimer-ajustement':
      return { name: 'ajustement', key: op.consigne };
  }
}

const enc = encodeURIComponent;

export function opRequest(op: Operation): { method: 'PUT' | 'DELETE'; path: string; body?: unknown } {
  if (op.kind === 'reglages') return { method: 'PUT', path: '/api/reglages', body: op.data };
  if (op.kind.startsWith('supprimer-')) {
    const { name, key } = removalOf(op as Removal);
    return { method: 'DELETE', path: `/api/${RECORDS[name].segment}/${enc(key)}` };
  }
  const { kind, data } = op as Extract<Operation, { data: unknown }> & { kind: RecordName };
  const record = RECORDS[kind] as RecordKind<typeof data>;
  return { method: 'PUT', path: `/api/${record.segment}/${enc(record.key(data))}`, body: data };
}

/** Two queued changes to the same record have the same path: only the latest needs sending. */
export function enqueueOp(ops: Operation[], op: Operation): Operation[] {
  const path = opRequest(op).path;
  return [...ops.filter((o) => opRequest(o).path !== path), op];
}

/** The Carnet with one change applied, the way the server will apply it. */
export function applyOperation(carnet: Carnet, op: Operation): Carnet {
  if (op.kind === 'reglages') return { ...carnet, reglages: op.data };
  if (op.kind.startsWith('supprimer-')) {
    const { name, key } = removalOf(op as Removal);
    const record = RECORDS[name] as RecordKind<unknown>;
    const list = carnet[record.collection] as unknown[];
    return { ...carnet, [record.collection]: list.filter((item) => record.key(item) !== key) };
  }
  const { kind, data } = op as Extract<Operation, { data: unknown }> & { kind: RecordName };
  const record = RECORDS[kind] as RecordKind<unknown>;
  const list = carnet[record.collection] as unknown[];
  const key = record.key(data);
  const index = list.findIndex((item) => record.key(item) === key);
  const next = index === -1 ? [...list, data] : list.map((item, i) => (i === index ? data : item));
  return { ...carnet, [record.collection]: next };
}

export function applyOperations(carnet: Carnet, ops: Operation[]): Carnet {
  return ops.reduce(applyOperation, carnet);
}
