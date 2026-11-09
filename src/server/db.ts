import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Schema changes, applied in order. Never edit a migration that has shipped: append a new one.
 * PRAGMA user_version records how many have been applied.
 */
export const MIGRATIONS: string[] = [
  `
  -- The Méthode transcribed from the book: one JSON document, uploaded from the owner's private file.
  CREATE TABLE methode (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- One Entraînement (or Test, or Routine de souplesse) with its Exercices and Séries, stored as sent by the phone.
  CREATE TABLE entrainements (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    termine INTEGER NOT NULL,
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX entrainements_date ON entrainements (date);

  CREATE TABLE parcours (
    id TEXT PRIMARY KEY,
    niveau TEXT NOT NULL,
    debut TEXT NOT NULL,
    boucle INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE reprises (
    id TEXT PRIMARY KEY,
    consigne TEXT NOT NULL,
    date TEXT NOT NULL,
    kind TEXT NOT NULL,
    depart TEXT NOT NULL
  );

  CREATE TABLE exercices_actuels (consigne TEXT PRIMARY KEY, exercice TEXT NOT NULL);
  CREATE TABLE programmes_actuels (niveau TEXT PRIMARY KEY, partie TEXT NOT NULL);
  CREATE TABLE notes (exercice TEXT PRIMARY KEY, note TEXT NOT NULL);
  CREATE TABLE ajustements (consigne TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE reglages (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
  `,
  `
  -- A picture the owner uploads for an Exercice (a photo of the book's description, a drawing…), one per Exercice code.
  CREATE TABLE images (
    exercice TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  `
  -- The owner's own name and description for an Exercice, kept apart from the Méthode file so reloading the file never overwrites them.
  -- NULL means "use the file's value"; an empty description hides the file's one. Not a foreign key: the file may lose a code and get it back.
  CREATE TABLE exercices_perso (code TEXT PRIMARY KEY, nom TEXT, description TEXT, updated_at TEXT NOT NULL);
  `,
];

function schemaVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

/**
 * Opens (or creates) the database and brings its schema up to date.
 * An existing database is copied into backupDir before any migration runs.
 */
export function openDatabase(path: string, backupDir?: string, targetVersion = MIGRATIONS.length): DatabaseSync {
  const isNew = path === ':memory:' || !existsSync(path);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');

  const current = schemaVersion(db);
  if (current < targetVersion && !isNew && backupDir) {
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = join(backupDir, `fitness-v${current}-${stamp}.sqlite`);
    db.prepare('VACUUM INTO ?').run(target);
  }

  for (let version = current; version < targetVersion; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}
