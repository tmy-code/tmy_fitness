import type {
  Ajustement,
  Carnet,
  Entrainement,
  EtapeParcours,
  ExerciceActuel,
  NoteExercice,
  ProgrammeActuel,
  Reglages,
  Reprise,
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

const enc = encodeURIComponent;

export function opRequest(op: Operation): { method: 'PUT' | 'DELETE'; path: string; body?: unknown } {
  switch (op.kind) {
    case 'entrainement':
      return { method: 'PUT', path: `/api/entrainements/${enc(op.data.id)}`, body: op.data };
    case 'supprimer-entrainement':
      return { method: 'DELETE', path: `/api/entrainements/${enc(op.id)}` };
    case 'parcours':
      return { method: 'PUT', path: `/api/parcours/${enc(op.data.id)}`, body: op.data };
    case 'supprimer-parcours':
      return { method: 'DELETE', path: `/api/parcours/${enc(op.id)}` };
    case 'reprise':
      return { method: 'PUT', path: `/api/reprises/${enc(op.data.id)}`, body: op.data };
    case 'exercice-actuel':
      return { method: 'PUT', path: `/api/exercices-actuels/${enc(op.data.consigne)}`, body: op.data };
    case 'programme-actuel':
      return { method: 'PUT', path: `/api/programmes-actuels/${enc(op.data.niveau)}`, body: op.data };
    case 'note':
      return { method: 'PUT', path: `/api/notes/${enc(op.data.exercice)}`, body: op.data };
    case 'ajustement':
      return { method: 'PUT', path: `/api/ajustements/${enc(op.data.consigne)}`, body: op.data };
    case 'supprimer-ajustement':
      return { method: 'DELETE', path: `/api/ajustements/${enc(op.consigne)}` };
    case 'reglages':
      return { method: 'PUT', path: '/api/reglages', body: op.data };
  }
}

/** Two queued changes to the same record have the same path: only the latest needs sending. */
export function enqueueOp(ops: Operation[], op: Operation): Operation[] {
  const path = opRequest(op).path;
  return [...ops.filter((o) => opRequest(o).path !== path), op];
}

function upsert<T>(items: T[], item: T, same: (a: T) => boolean): T[] {
  const index = items.findIndex(same);
  if (index === -1) return [...items, item];
  const copy = [...items];
  copy[index] = item;
  return copy;
}

/** The Carnet with one change applied, the way the server will apply it. */
export function applyOperation(carnet: Carnet, op: Operation): Carnet {
  switch (op.kind) {
    case 'entrainement':
      return { ...carnet, entrainements: upsert(carnet.entrainements, op.data, (e) => e.id === op.data.id) };
    case 'supprimer-entrainement':
      return { ...carnet, entrainements: carnet.entrainements.filter((e) => e.id !== op.id) };
    case 'parcours':
      return { ...carnet, parcours: upsert(carnet.parcours, op.data, (e) => e.id === op.data.id) };
    case 'supprimer-parcours':
      return { ...carnet, parcours: carnet.parcours.filter((e) => e.id !== op.id) };
    case 'reprise':
      return { ...carnet, reprises: upsert(carnet.reprises, op.data, (r) => r.id === op.data.id) };
    case 'exercice-actuel':
      return { ...carnet, exercicesActuels: upsert(carnet.exercicesActuels, op.data, (x) => x.consigne === op.data.consigne) };
    case 'programme-actuel':
      return { ...carnet, programmesActuels: upsert(carnet.programmesActuels, op.data, (x) => x.niveau === op.data.niveau) };
    case 'note':
      return { ...carnet, notes: upsert(carnet.notes, op.data, (x) => x.exercice === op.data.exercice) };
    case 'ajustement':
      return { ...carnet, ajustements: upsert(carnet.ajustements, op.data, (x) => x.consigne === op.data.consigne) };
    case 'supprimer-ajustement':
      return { ...carnet, ajustements: carnet.ajustements.filter((x) => x.consigne !== op.consigne) };
    case 'reglages':
      return { ...carnet, reglages: op.data };
  }
}

export function applyOperations(carnet: Carnet, ops: Operation[]): Carnet {
  return ops.reduce(applyOperation, carnet);
}
