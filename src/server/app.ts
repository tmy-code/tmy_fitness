import type { DatabaseSync } from 'node:sqlite';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { ZodType } from 'zod';
import {
  ajustement,
  entrainement,
  etapeParcours,
  exerciceActuel,
  noteExercice,
  programmeActuel,
  reglages,
  reprise,
  type Carnet,
  type Entrainement,
} from '../shared/carnet.ts';
import { API_VERSION, API_VERSION_HEADER } from '../shared/api-version.ts';
import { methode, type ImageExercice, type Methode } from '../shared/methode.ts';
import { exportCsv } from './csv.ts';

type ErrorStatus = 400 | 404 | 409 | 413 | 422;

export class HttpError extends Error {
  readonly status: ErrorStatus;
  constructor(status: ErrorStatus, message: string) {
    super(message);
    this.status = status;
  }
}

export async function parse<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'Body must be JSON');
  });
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new HttpError(422, `${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return result.data;
}

/** The record in the body must be the one named in the path, so a replay always lands on the same row. */
function samePath(c: Context, value: string) {
  if (c.req.param('id') !== value) throw new HttpError(409, 'Path and body name different records');
}

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

export function readMethode(db: DatabaseSync): Methode | null {
  const row = db.prepare('SELECT json FROM methode WHERE id = 1').get() as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as Methode) : null;
}

export function readCarnet(db: DatabaseSync): Carnet {
  const all = (sql: string) => db.prepare(sql).all() as Row[];
  const reglagesRow = db.prepare('SELECT json FROM reglages WHERE id = 1').get() as { json: string } | undefined;
  return {
    entrainements: all('SELECT json FROM entrainements ORDER BY date, updated_at').map((r) => JSON.parse(r.json as string) as Entrainement),
    parcours: all('SELECT id, niveau, debut, boucle FROM parcours ORDER BY debut, created_at').map((r) => ({
      id: r.id as string,
      niveau: r.niveau as string,
      debut: r.debut as string,
      boucle: r.boucle === 1,
    })),
    reprises: all('SELECT id, consigne, date, kind, depart FROM reprises ORDER BY date').map((r) => ({
      id: r.id as string,
      consigne: r.consigne as string,
      date: r.date as string,
      kind: r.kind as 'mini-boucle' | 'boucle',
      depart: JSON.parse(r.depart as string) as number[],
    })),
    exercicesActuels: all('SELECT consigne, exercice FROM exercices_actuels').map((r) => ({
      consigne: r.consigne as string,
      exercice: r.exercice as string,
    })),
    programmesActuels: all('SELECT niveau, partie FROM programmes_actuels').map((r) => ({ niveau: r.niveau as string, partie: r.partie as string })),
    notes: all('SELECT exercice, note FROM notes').map((r) => ({ exercice: r.exercice as string, note: r.note as string })),
    ajustements: all('SELECT json FROM ajustements').map((r) => JSON.parse(r.json as string)),
    reglages: reglagesRow ? JSON.parse(reglagesRow.json) : { frequence: null },
  };
}

/** Which Exercices have a picture, with a version that changes on each upload so the phone knows to fetch it again. */
export function readImages(db: DatabaseSync): ImageExercice[] {
  return (db.prepare('SELECT exercice, updated_at FROM images ORDER BY exercice').all() as Row[]).map((r) => ({
    exercice: r.exercice as string,
    version: r.updated_at as string,
  }));
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Where the Android app's bundled screens run (Capacitor's default origin); the browser version is same-origin. */
export const ANDROID_APP_ORIGIN = 'https://localhost';

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: error.message }, error.status);
    console.error(error);
    return c.json({ error: 'Internal error' }, 500);
  });

  // The Android app's screens are not served from here, so the browser inside it needs permission to call the API.
  app.use('/api/*', cors({ origin: ANDROID_APP_ORIGIN, exposeHeaders: [API_VERSION_HEADER], maxAge: 86400 }));

  // Every answer says which API version it speaks, so an app from another version stops before sending its queue.
  app.use('/api/*', async (c, next) => {
    await next();
    c.res.headers.set(API_VERSION_HEADER, String(API_VERSION));
  });

  app.get('/api/health', (c) => {
    db.prepare('SELECT 1').get();
    return c.json({ ok: true });
  });

  app.get('/api/snapshot', (c) => c.json({ methode: readMethode(db), carnet: readCarnet(db), images: readImages(db) }));

  // The Méthode is the owner's transcription of the book; it replaces the previous one as a whole.
  app.put('/api/methode', bodyLimit({ maxSize: 5 * 1024 * 1024, onError: () => { throw new HttpError(413, 'Méthode trop volumineuse'); } }), async (c) => {
    const data = await parse(c, methode);
    db.prepare(
      'INSERT INTO methode (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
    ).run(JSON.stringify(data), now());
    return c.body(null, 204);
  });

  app.put('/api/entrainements/:id', async (c) => {
    const data = await parse(c, entrainement);
    samePath(c, data.id);
    db.prepare(
      `INSERT INTO entrainements (id, date, kind, termine, json, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET date = excluded.date, kind = excluded.kind, termine = excluded.termine,
         json = excluded.json, updated_at = excluded.updated_at`,
    ).run(data.id, data.date, data.kind, data.termine ? 1 : 0, JSON.stringify(data), now());
    return c.body(null, 204);
  });

  app.delete('/api/entrainements/:id', (c) => {
    db.prepare('DELETE FROM entrainements WHERE id = ?').run(c.req.param('id'));
    return c.body(null, 204);
  });

  app.put('/api/parcours/:id', async (c) => {
    const data = await parse(c, etapeParcours);
    samePath(c, data.id);
    db.prepare(
      `INSERT INTO parcours (id, niveau, debut, boucle, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET niveau = excluded.niveau, debut = excluded.debut, boucle = excluded.boucle`,
    ).run(data.id, data.niveau, data.debut, data.boucle ? 1 : 0, now());
    return c.body(null, 204);
  });

  app.delete('/api/parcours/:id', (c) => {
    db.prepare('DELETE FROM parcours WHERE id = ?').run(c.req.param('id'));
    return c.body(null, 204);
  });

  app.put('/api/reprises/:id', async (c) => {
    const data = await parse(c, reprise);
    samePath(c, data.id);
    db.prepare(
      `INSERT INTO reprises (id, consigne, date, kind, depart) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET consigne = excluded.consigne, date = excluded.date, kind = excluded.kind, depart = excluded.depart`,
    ).run(data.id, data.consigne, data.date, data.kind, JSON.stringify(data.depart));
    return c.body(null, 204);
  });

  app.put('/api/exercices-actuels/:id', async (c) => {
    const data = await parse(c, exerciceActuel);
    samePath(c, data.consigne);
    db.prepare('INSERT INTO exercices_actuels (consigne, exercice) VALUES (?, ?) ON CONFLICT (consigne) DO UPDATE SET exercice = excluded.exercice').run(
      data.consigne,
      data.exercice,
    );
    return c.body(null, 204);
  });

  app.put('/api/programmes-actuels/:id', async (c) => {
    const data = await parse(c, programmeActuel);
    samePath(c, data.niveau);
    db.prepare('INSERT INTO programmes_actuels (niveau, partie) VALUES (?, ?) ON CONFLICT (niveau) DO UPDATE SET partie = excluded.partie').run(
      data.niveau,
      data.partie,
    );
    return c.body(null, 204);
  });

  app.put('/api/notes/:id', async (c) => {
    const data = await parse(c, noteExercice);
    samePath(c, data.exercice);
    db.prepare('INSERT INTO notes (exercice, note) VALUES (?, ?) ON CONFLICT (exercice) DO UPDATE SET note = excluded.note').run(data.exercice, data.note);
    return c.body(null, 204);
  });

  // Pictures are sent as raw bytes, already shrunk by the phone.
  app.put('/api/images/:id', bodyLimit({ maxSize: 3 * 1024 * 1024, onError: () => { throw new HttpError(413, 'Image trop volumineuse'); } }), async (c) => {
    const type = (c.req.header('content-type') ?? '').split(';')[0]!.trim();
    if (!IMAGE_TYPES.includes(type)) throw new HttpError(422, 'Image JPEG, PNG ou WebP attendue');
    const data = new Uint8Array(await c.req.arrayBuffer());
    if (data.length === 0) throw new HttpError(422, 'Image vide');
    db.prepare(
      'INSERT INTO images (exercice, type, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (exercice) DO UPDATE SET type = excluded.type, data = excluded.data, updated_at = excluded.updated_at',
    ).run(c.req.param('id'), type, data, now());
    return c.body(null, 204);
  });

  app.get('/api/images/:id', (c) => {
    const row = db.prepare('SELECT type, data FROM images WHERE exercice = ?').get(c.req.param('id')) as { type: string; data: Uint8Array<ArrayBuffer> } | undefined;
    if (!row) throw new HttpError(404, 'Pas d’image pour cet exercice');
    c.header('content-type', row.type);
    // The app asks for "?v=<version>", so a given address never changes content.
    c.header('cache-control', 'private, max-age=31536000, immutable');
    return c.body(row.data);
  });

  app.delete('/api/images/:id', (c) => {
    db.prepare('DELETE FROM images WHERE exercice = ?').run(c.req.param('id'));
    return c.body(null, 204);
  });

  app.put('/api/ajustements/:id', async (c) => {
    const data = await parse(c, ajustement);
    samePath(c, data.consigne);
    db.prepare('INSERT INTO ajustements (consigne, json) VALUES (?, ?) ON CONFLICT (consigne) DO UPDATE SET json = excluded.json').run(
      data.consigne,
      JSON.stringify(data),
    );
    return c.body(null, 204);
  });

  app.delete('/api/ajustements/:id', (c) => {
    db.prepare('DELETE FROM ajustements WHERE consigne = ?').run(c.req.param('id'));
    return c.body(null, 204);
  });

  app.put('/api/reglages', async (c) => {
    const data = await parse(c, reglages);
    db.prepare('INSERT INTO reglages (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json').run(JSON.stringify(data));
    return c.body(null, 204);
  });

  app.get('/api/export.csv', (c) => {
    const csv = exportCsv(readMethode(db), readCarnet(db).entrainements);
    c.header('content-type', 'text/csv; charset=utf-8');
    c.header('content-disposition', `attachment; filename="carnet-${now().slice(0, 10)}.csv"`);
    return c.body(csv);
  });

  return app;
}
