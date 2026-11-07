import { readFileSync } from 'node:fs';
import { emptyCarnet, type Carnet, type Entrainement, type ExerciceFait } from './carnet.ts';
import { methode, type Consigne, type Methode, type Niveau } from './methode.ts';

// Test helpers built on the made-up demo Méthode — never on book content (ADR 0001).

export function demoMethode(): Methode {
  return methode.parse(JSON.parse(readFileSync(new URL('../../demo/methode.json', import.meta.url), 'utf8')));
}

export function niveauDemo(m: Methode, id: string): Niveau {
  return m.niveaux.find((n) => n.id === id)!;
}

export function consigneDemo(m: Methode, id: string): Consigne {
  for (const n of m.niveaux) for (const p of n.parties) for (const b of p.blocs) for (const c of b.consignes) if (c.id === id) return c;
  throw new Error(`no Consigne ${id}`);
}

let counter = 0;

/** A finished Entraînement with one Exercice whose Séries got these Résultats (Objectif given as [objectif, resultat]). */
export function fait(ref: string, exercice: string, series: [number | null, number | null][], extra: Partial<ExerciceFait> = {}): ExerciceFait {
  return { ref, exercice, series: series.map(([objectif, resultat]) => ({ objectif, resultat, forcees: 0 })), ...extra };
}

export function entrainementDemo(date: string, exercices: ExerciceFait[], extra: Partial<Entrainement> = {}): Entrainement {
  counter++;
  return { id: `test-entrainement-${counter}`, date, kind: 'entrainement', termine: true, exercices, ...extra };
}

export function carnetDemo(patch: Partial<Carnet> = {}): Carnet {
  return { ...emptyCarnet(), ...patch };
}
