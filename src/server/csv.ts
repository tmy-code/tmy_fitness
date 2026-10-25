import type { Entrainement } from '../shared/carnet.ts';
import type { Methode } from '../shared/methode.ts';

const COLUMNS = [
  'date',
  'type',
  'niveau',
  'seance_ou_programme',
  'bloc',
  'consigne',
  'exercice',
  'nom_exercice',
  'serie',
  'objectif',
  'resultat',
  'repetitions_forcees',
  'note',
];

// Semicolons and a byte-order mark, so a French Excel opens the file in columns with accents intact.
function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The Carnet as one row per Série, readable without the app. */
export function exportCsv(methode: Methode | null, entrainements: Entrainement[]): string {
  const niveaux = new Map(methode?.niveaux.map((n) => [n.id, n]) ?? []);
  const noms = new Map(methode?.exercices.map((e) => [e.code, e.nom]) ?? []);
  const lieux = new Map<string, { bloc: string }>();
  for (const n of methode?.niveaux ?? []) for (const p of n.parties) for (const b of p.blocs) for (const c of b.consignes) lieux.set(c.id, { bloc: b.nom });

  const rows = [COLUMNS.join(';')];
  for (const e of [...entrainements].filter((x) => x.termine).sort((a, b) => a.date.localeCompare(b.date))) {
    const niveau = e.niveau ? niveaux.get(e.niveau) : undefined;
    const partie = niveau?.parties.find((p) => p.id === e.partie);
    for (const x of e.exercices) {
      x.series.forEach((s, i) => {
        rows.push(
          [
            e.date,
            e.kind,
            niveau?.nom ?? e.niveau,
            partie?.nom ?? e.partie,
            lieux.get(x.ref)?.bloc,
            x.ref,
            x.exercice,
            noms.get(x.exercice),
            i + 1,
            s.objectif,
            s.resultat,
            s.forcees || null,
            i === 0 ? x.note : null,
          ]
            .map(cell)
            .join(';'),
        );
      });
    }
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}
