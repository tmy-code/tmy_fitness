import { useState } from 'react';
import type { Ajustement, Carnet } from '../../shared/carnet.ts';
import type { Cible, Frequence, Methode, SerieConsigne } from '../../shared/methode.ts';
import { libelleFrequence, niveauActuel } from '../../shared/prochain.ts';
import { Layout, NotFound } from '../components.tsx';
import { indexConsignes, nomExercice } from '../lookup.ts';
import { goBack } from '../router.ts';
import { enqueue, useStore } from '../store.ts';
import { ChargerMethode } from './Accueil.tsx';

export function ReglagesPage({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  const { reachable } = useStore();
  const niveau = niveauActuel(methode, carnet);
  const perso = carnet.reglages.frequence;
  const setFrequence = (frequence: Frequence | null) => void enqueue({ kind: 'reglages', data: { ...carnet.reglages, frequence } });

  return (
    <Layout title="Réglages" back="/">
      <section className="card">
        <h2>Fréquence</h2>
        <p className="muted small">
          Conseillée pour le Niveau actuel : {niveau?.frequence ? libelleFrequence(niveau.frequence) : 'non précisée'}.
        </p>
        <select
          className="button-block"
          value={perso ? `${perso.type}:${perso.n}` : ''}
          onChange={(e) => {
            if (!e.target.value) return setFrequence(null);
            const [type, n] = e.target.value.split(':');
            setFrequence({ type: type as Frequence['type'], n: Number(n) } as Frequence);
          }}
        >
          <option value="">Celle du Niveau</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={`s${n}`} value={`parSemaine:${n}`}>
              {libelleFrequence({ type: 'parSemaine', n })}
            </option>
          ))}
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <option key={`j${n}`} value={`tousLesJours:${n}`}>
              {libelleFrequence({ type: 'tousLesJours', n })}
            </option>
          ))}
        </select>
      </section>

      <section className="card">
        <h2>Exporter le Carnet</h2>
        <p className="muted small">Un fichier CSV, une ligne par série, lisible dans Excel ou Google Sheets.</p>
        {reachable ? (
          <a className="button button-block" href="/api/export.csv" download>
            Télécharger le CSV
          </a>
        ) : (
          <p className="banner banner-warn">Nécessite une connexion au serveur.</p>
        )}
      </section>

      <section className="card">
        <h2>Méthode</h2>
        <p className="muted small">
          {methode.nom} · {methode.niveaux.length} niveaux · {methode.exercices.length} exercices
        </p>
        <ChargerMethode />
      </section>
    </Layout>
  );
}

/** The trainee's own version of a Consigne: Séries, rythme, increment and note, kept over re-uploads of the Méthode. */
export function AjusterPage({ methode, carnet, consigneId }: { methode: Methode; carnet: Carnet; consigneId: string }) {
  const lieu = indexConsignes(methode).get(consigneId);
  const existing = carnet.ajustements.find((a) => a.consigne === consigneId);
  const base = lieu?.consigne;
  const [series, setSeries] = useState<SerieConsigne[]>(existing?.series ?? base?.series ?? []);
  const [rythme, setRythme] = useState(existing?.rythme ?? base?.rythme ?? '');
  const [increment, setIncrement] = useState(existing?.increment ?? base?.increment ?? 1);
  const [note, setNote] = useState(existing?.note ?? base?.note ?? '');
  if (!lieu || !base) return <NotFound what="Consigne" />;

  const setSerie = (i: number, patch: Partial<SerieConsigne>) => setSeries(series.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setCible = (i: number, type: Cible['type'], value: number) =>
    setSerie(i, { cible: type === 'reps' ? { type, n: Math.max(1, value) } : type === 'duree' ? { type, secondes: Math.max(1, value) } : { type: 'max' } });

  function enregistrer() {
    const data: Ajustement = { consigne: consigneId, series, rythme: rythme.trim() || undefined, increment, note: note.trim() || undefined };
    void enqueue({ kind: 'ajustement', data });
    goBack(`/consigne/${consigneId}`);
  }

  return (
    <Layout title={`Ajuster · ${nomExercice(methode, base.exercice)}`} back={`/consigne/${consigneId}`}>
      <p className="muted small">Vos changements s’appliquent par-dessus la consigne du livre et sont conservés si la Méthode est rechargée.</p>
      {series.map((s, i) => (
        <section className="card" key={i}>
          <p className="eyebrow">Série {i + 1}</p>
          <div className="row-actions">
            <select value={s.cible.type} onChange={(e) => setCible(i, e.target.value as Cible['type'], s.cible.type === 'reps' ? s.cible.n : s.cible.type === 'duree' ? s.cible.secondes : 10)}>
              <option value="reps">Répétitions</option>
              <option value="max">Max</option>
              <option value="duree">Durée (s)</option>
            </select>
            {s.cible.type !== 'max' ? (
              <input
                className="num"
                type="number"
                inputMode="numeric"
                min={1}
                value={s.cible.type === 'reps' ? s.cible.n : s.cible.secondes}
                onChange={(e) => setCible(i, s.cible.type, Number(e.target.value) || 1)}
              />
            ) : null}
            <label className="small">
              Repos (s){' '}
              <input className="num" type="number" inputMode="numeric" min={0} value={s.repos} onChange={(e) => setSerie(i, { repos: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          </div>
        </section>
      ))}
      <div className="row-actions">
        <button type="button" className="button button-small" onClick={() => setSeries([...series, series.at(-1) ?? { cible: { type: 'reps', n: 5 }, repos: 90 }])}>
          + Série
        </button>
        <button type="button" className="button button-small" disabled={series.length <= 1} onClick={() => setSeries(series.slice(0, -1))}>
          − Série
        </button>
      </div>
      <label className="field">
        <span className="field-label">Rythme</span>
        <input value={rythme} onChange={(e) => setRythme(e.target.value)} placeholder="normal, rapide…" />
      </label>
      <label className="field">
        <span className="field-label">Répétitions ajoutées après une séance réussie</span>
        <input className="num" type="number" inputMode="numeric" min={0} max={10} value={increment} onChange={(e) => setIncrement(Math.min(10, Math.max(0, Number(e.target.value) || 0)))} />
      </label>
      <label className="field">
        <span className="field-label">Note</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="button button-primary button-block" onClick={enregistrer}>
        Enregistrer
      </button>
      {existing ? (
        <button
          type="button"
          className="button button-block"
          onClick={() => {
            void enqueue({ kind: 'supprimer-ajustement', consigne: consigneId });
            goBack(`/consigne/${consigneId}`);
          }}
        >
          Revenir à la consigne du livre
        </button>
      ) : null}
    </Layout>
  );
}
