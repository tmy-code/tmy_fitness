import { useState } from 'react';
import type { Carnet, Entrainement } from '../../shared/carnet.ts';
import type { Methode } from '../../shared/methode.ts';
import { Layout, NotFound } from '../components.tsx';
import { formatDate } from '../format.ts';
import { nomExercice } from '../lookup.ts';
import { navigate } from '../router.ts';
import { enqueue } from '../store.ts';

function titre(methode: Methode, e: Entrainement): string {
  if (e.kind === 'test') return methode.tests.find((t) => t.id === e.test)?.nom ?? 'Test';
  if (e.kind === 'souplesse') return methode.souplesse.find((r) => r.id === e.routine)?.nom ?? 'Souplesse';
  const niveau = methode.niveaux.find((n) => n.id === e.niveau);
  const partie = niveau?.parties.find((p) => p.id === e.partie);
  return [niveau?.nom ?? e.niveau, partie?.nom ?? e.partie].filter(Boolean).join(' · ');
}

export function CarnetPage({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  const list = carnet.entrainements.filter((e) => e.termine).toReversed();
  return (
    <Layout title="Carnet" back="/">
      {list.length === 0 ? <p className="empty muted">Aucun entraînement enregistré.</p> : null}
      {list.map((e) => (
        <a className="card" key={e.id} href={`#/carnet/${e.id}`}>
          <p className="eyebrow">{formatDate(e.date)}</p>
          <h2>{titre(methode, e)}</h2>
          <p className="muted small">
            {e.exercices.map((x) => `${x.exercice} ${x.series.map((s) => `${s.resultat ?? '—'}${s.forcees ? `+${s.forcees}` : ''}`).join('/')}`).join(' · ')}
            {e.blocs ? ' · Split' : ''}
          </p>
        </a>
      ))}
    </Layout>
  );
}

/** One past Entraînement, editable so a mistyped Résultat can be fixed. */
export function CarnetDetail({ methode, carnet, id }: { methode: Methode; carnet: Carnet; id: string }) {
  const original = carnet.entrainements.find((e) => e.id === id);
  const [draft, setDraft] = useState(original);
  if (!original || !draft) return <NotFound what="Entraînement" />;
  const changed = JSON.stringify(draft) !== JSON.stringify(original);

  function set(i: number, j: number, field: 'resultat' | 'forcees', value: string) {
    const next = structuredClone(draft!);
    const n = value === '' ? null : Math.max(0, Math.round(Number(value)) || 0);
    if (field === 'resultat') next.exercices[i]!.series[j]!.resultat = n;
    else next.exercices[i]!.series[j]!.forcees = n ?? 0;
    setDraft(next);
  }

  return (
    <Layout title={formatDate(original.date)} back="/carnet">
      <h2>{titre(methode, original)}</h2>
      <label className="field">
        <span className="field-label">Date</span>
        <input type="date" value={draft.date} onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })} />
      </label>
      {draft.exercices.map((x, i) => (
        <section className="card" key={`${x.ref}-${i}`}>
          <h2>{nomExercice(methode, x.exercice)}</h2>
          <table className="series">
            <thead>
              <tr>
                <th>Série</th>
                <th>Objectif</th>
                <th>Résultat</th>
                <th>Forcées</th>
              </tr>
            </thead>
            <tbody>
              {x.series.map((s, j) => (
                <tr key={j}>
                  <td>{j + 1}</td>
                  <td>{s.objectif ?? 'max'}</td>
                  <td>
                    <input className="num" type="number" inputMode="numeric" min={0} value={s.resultat ?? ''} onChange={(e) => set(i, j, 'resultat', e.target.value)} />
                  </td>
                  <td>
                    <input className="num" type="number" inputMode="numeric" min={0} value={s.forcees || ''} onChange={(e) => set(i, j, 'forcees', e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {x.note ? <p className="muted small">📝 {x.note}</p> : null}
        </section>
      ))}
      <button
        type="button"
        className="button button-primary button-block"
        disabled={!changed}
        onClick={() => {
          void enqueue({ kind: 'entrainement', data: draft });
          navigate('/carnet');
        }}
      >
        Enregistrer les corrections
      </button>
      <button
        type="button"
        className="button button-danger button-block"
        onClick={() => {
          if (!window.confirm('Supprimer cet entraînement du Carnet ?')) return;
          void enqueue({ kind: 'supprimer-entrainement', id: original.id });
          navigate('/carnet', { replace: true });
        }}
      >
        Supprimer
      </button>
    </Layout>
  );
}
