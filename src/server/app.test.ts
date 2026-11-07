import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_VERSION } from '../shared/api-version.ts';
import { ANDROID_APP_ORIGIN, createApp } from './app.ts';
import { openDatabase } from './db.ts';

let db: DatabaseSync;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp(db);
});

afterEach(() => db.close());

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

describe('health', () => {
  it('answers when the database is reachable', async () => {
    expect(await call('GET', '/api/health')).toEqual({ status: 200, body: { ok: true } });
  });
});

describe('Android app access', () => {
  it('tells every answer which API version it speaks, errors included', async () => {
    const ok = await app.request('/api/health');
    expect(ok.headers.get('x-api-version')).toBe(String(API_VERSION));
    const refused = await app.request('/api/entrainements/x', { method: 'PUT', body: 'not json' });
    expect(refused.status).toBe(400);
    expect(refused.headers.get('x-api-version')).toBe(String(API_VERSION));
  });

  it('lets the Android app call the API and read the version', async () => {
    const preflight = await app.request('/api/entrainements/x', {
      method: 'OPTIONS',
      headers: { origin: ANDROID_APP_ORIGIN, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ANDROID_APP_ORIGIN);
    const res = await app.request('/api/snapshot', { headers: { origin: ANDROID_APP_ORIGIN } });
    expect(res.headers.get('access-control-allow-origin')).toBe(ANDROID_APP_ORIGIN);
    expect(res.headers.get('access-control-expose-headers')).toContain('x-api-version');
  });

  it('does not open the API to other websites', async () => {
    const res = await app.request('/api/snapshot', { headers: { origin: 'https://example.com' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://example.com');
  });
});

const demo = JSON.parse(readFileSync(new URL('../../demo/methode.json', import.meta.url), 'utf8'));

function seance(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    date: '2026-11-02',
    kind: 'entrainement',
    niveau: 'demo-1',
    partie: 'demo-1-p1',
    termine: true,
    exercices: [
      {
        ref: 'demo-1-p1-a1',
        exercice: 'A1',
        note: 'coudes; serrés',
        series: [
          { objectif: 3, resultat: 4, forcees: 1 },
          { objectif: 3, resultat: 3 },
        ],
      },
    ],
    ...extra,
  };
}

describe('methode', () => {
  it('stores an uploaded Méthode and serves it in the snapshot', async () => {
    expect((await call('GET', '/api/snapshot')).body.methode).toBeNull();
    expect((await call('PUT', '/api/methode', demo)).status).toBe(204);
    const { body } = await call('GET', '/api/snapshot');
    expect(body.methode.niveaux.map((n: { id: string }) => n.id)).toEqual(['demo-0', 'demo-1', 'demo-2']);
  });

  it('refuses a Méthode with broken references', async () => {
    const broken = structuredClone(demo);
    broken.niveaux[0].parties[0].blocs[0].consignes[0].exercice = 'Z9';
    const res = await call('PUT', '/api/methode', broken);
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('Z9');
  });

  it('keeps the Carnet and Ajustements when the Méthode is uploaded again', async () => {
    await call('PUT', '/api/methode', demo);
    await call('PUT', '/api/entrainements/test-seance-0001', seance('test-seance-0001'));
    await call('PUT', '/api/ajustements/demo-1-p1-a1', { consigne: 'demo-1-p1-a1', rythme: 'lent' });
    await call('PUT', '/api/methode', demo);
    const { body } = await call('GET', '/api/snapshot');
    expect(body.carnet.entrainements).toHaveLength(1);
    expect(body.carnet.ajustements).toEqual([{ consigne: 'demo-1-p1-a1', rythme: 'lent' }]);
  });
});

describe('carnet', () => {
  it('saves a replayed Entraînement once', async () => {
    await call('PUT', '/api/entrainements/test-seance-0001', seance('test-seance-0001', { termine: false }));
    await call('PUT', '/api/entrainements/test-seance-0001', seance('test-seance-0001'));
    const { body } = await call('GET', '/api/snapshot');
    expect(body.carnet.entrainements).toHaveLength(1);
    expect(body.carnet.entrainements[0].termine).toBe(true);
    expect(body.carnet.entrainements[0].exercices[0].series[1].forcees).toBe(0);
  });

  it('refuses a body that names another record than the path', async () => {
    expect((await call('PUT', '/api/entrainements/test-seance-0002', seance('test-seance-0001'))).status).toBe(409);
    expect((await call('PUT', '/api/exercices-actuels/x', { consigne: 'y', exercice: 'C2' })).status).toBe(409);
  });

  it('refuses invalid data', async () => {
    const res = await call('PUT', '/api/entrainements/test-seance-0001', seance('test-seance-0001', { date: '02/11/2026' }));
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('date');
  });

  it('records the état: Parcours, reprises, Exercice and Programme actuels, notes and réglages', async () => {
    await call('PUT', '/api/parcours/test-parcours-1', { id: 'test-parcours-1', niveau: 'demo-1', debut: '2026-11-01', boucle: false });
    await call('PUT', '/api/parcours/test-parcours-2', { id: 'test-parcours-2', niveau: 'demo-1', debut: '2026-12-01', boucle: true });
    await call('PUT', '/api/reprises/test-reprise-1', { id: 'test-reprise-1', consigne: 'demo-1-p1-a1', date: '2026-12-01', kind: 'boucle', depart: [5, 5, 4] });
    await call('PUT', '/api/exercices-actuels/demo-1-p1-c', { consigne: 'demo-1-p1-c', exercice: 'C2' });
    await call('PUT', '/api/exercices-actuels/demo-1-p1-c', { consigne: 'demo-1-p1-c', exercice: 'C3' });
    await call('PUT', '/api/programmes-actuels/demo-1', { niveau: 'demo-1', partie: 'demo-1-p2' });
    await call('PUT', '/api/notes/A1', { exercice: 'A1', note: 'garder le dos droit' });
    await call('PUT', '/api/reglages', { frequence: { type: 'parSemaine', n: 2 } });
    await call('DELETE', '/api/parcours/test-parcours-2');
    const { carnet } = (await call('GET', '/api/snapshot')).body;
    expect(carnet.parcours).toEqual([{ id: 'test-parcours-1', niveau: 'demo-1', debut: '2026-11-01', boucle: false }]);
    expect(carnet.reprises[0].depart).toEqual([5, 5, 4]);
    expect(carnet.exercicesActuels).toEqual([{ consigne: 'demo-1-p1-c', exercice: 'C3' }]);
    expect(carnet.programmesActuels).toEqual([{ niveau: 'demo-1', partie: 'demo-1-p2' }]);
    expect(carnet.notes).toEqual([{ exercice: 'A1', note: 'garder le dos droit' }]);
    expect(carnet.reglages).toEqual({ frequence: { type: 'parSemaine', n: 2 } });
  });

  it('keeps a note on an alternating pair, whose code has a slash', async () => {
    const res = await call('PUT', `/api/notes/${encodeURIComponent('H/G')}`, { exercice: 'H/G', note: 'souffler' });
    expect(res.status).toBeLessThan(300);
    const { carnet } = (await call('GET', '/api/snapshot')).body;
    expect(carnet.notes).toEqual([{ exercice: 'H/G', note: 'souffler' }]);
  });
});

describe('images', () => {
  // A few made-up bytes: the server stores the picture as sent and never decodes it.
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const upload = (code: string, body: Uint8Array<ArrayBuffer>, type = 'image/jpeg') =>
    app.request(`/api/images/${encodeURIComponent(code)}`, { method: 'PUT', headers: { 'content-type': type }, body });

  it('stores one picture per Exercice, lists it in the snapshot and serves it back', async () => {
    expect((await upload('H/G', fakeJpeg)).status).toBe(204);
    const { images } = (await call('GET', '/api/snapshot')).body;
    expect(images).toEqual([{ exercice: 'H/G', version: expect.any(String) }]);
    const res = await app.request(`/api/images/${encodeURIComponent('H/G')}`);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(fakeJpeg);
  });

  it('replaces and deletes a picture', async () => {
    await upload('A1', fakeJpeg);
    await upload('A1', new Uint8Array([1, 2, 3]), 'image/png');
    expect((await app.request('/api/images/A1')).headers.get('content-type')).toBe('image/png');
    await call('DELETE', '/api/images/A1');
    expect((await app.request('/api/images/A1')).status).toBe(404);
    expect((await call('GET', '/api/snapshot')).body.images).toEqual([]);
  });

  it('refuses anything that is not a picture, and pictures that are too big', async () => {
    expect((await upload('A1', fakeJpeg, 'application/pdf')).status).toBe(422);
    expect((await upload('A1', new Uint8Array(4 * 1024 * 1024))).status).toBe(413);
  });
});

describe('export', () => {
  it('writes one row per Série of finished Entraînements', async () => {
    await call('PUT', '/api/methode', demo);
    await call('PUT', '/api/entrainements/test-seance-0001', seance('test-seance-0001'));
    await call('PUT', '/api/entrainements/test-seance-0002', seance('test-seance-0002', { termine: false }));
    const res = await app.request('/api/export.csv');
    const lines = (await res.text()).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines).toEqual([
      'date;type;niveau;seance_ou_programme;bloc;consigne;exercice;nom_exercice;serie;objectif;resultat;repetitions_forcees;note',
      '2026-11-02;entrainement;Niveau démo 1;Premier programme;Bloc Haut;demo-1-p1-a1;A1;Pompes démo, mains surélevées;1;3;4;1;"coudes; serrés"',
      '2026-11-02;entrainement;Niveau démo 1;Premier programme;Bloc Haut;demo-1-p1-a1;A1;Pompes démo, mains surélevées;2;3;3;;',
    ]);
  });
});
