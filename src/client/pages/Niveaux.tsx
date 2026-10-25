import { useState } from 'react';
import { departBoucle } from '../../shared/boucle.ts';
import type { Carnet } from '../../shared/carnet.ts';
import { consigneEffective, exerciceActuel } from '../../shared/consigne.ts';
import { consignesOf, type Methode, type Niveau } from '../../shared/methode.ts';
import type { Operation } from '../../shared/operations.ts';
import { etapeDe } from '../../shared/progression.ts';
import { etapeActuelle, libelleFrequence, niveauActuel, prochainePartie } from '../../shared/prochain.ts';
import { newId } from '../api.ts';
import { Layout, NotFound } from '../components.tsx';
import { formatDate, todayIso } from '../format.ts';
import { nomExercice } from '../lookup.ts';
import { navigate } from '../router.ts';
import { enqueue } from '../store.ts';

export function NiveauxPage({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  const actuel = niveauActuel(methode, carnet);
  const etape = etapeActuelle(carnet.parcours);
  return (
    <Layout title="Niveau" back="/">
      {actuel ? <NiveauActuel methode={methode} carnet={carnet} niveau={actuel} /> : <p className="muted">Aucun Niveau commencé.</p>}

      <section>
        <h2>Changer de niveau</h2>
        <p className="muted small">Passer au Niveau suivant, ou à n’importe quel autre.</p>
        {methode.niveaux.map((n) => (
          <button
            type="button"
            key={n.id}
            className={`card choice ${n.id === actuel?.id ? 'card-accent' : ''}`}
            disabled={n.id === actuel?.id}
            onClick={() => {
              if (!window.confirm(`Commencer le ${n.nom} aujourd’hui ?`)) return;
              void enqueue({ kind: 'parcours', data: { id: newId(), niveau: n.id, debut: todayIso(), boucle: false } });
              navigate('/');
            }}
          >
            <strong>{n.nom}</strong>
            {n.frequence ? <span className="muted small"> · {libelleFrequence(n.frequence)}</span> : null}
            {n.id === actuel?.id && etape ? <span className="muted small"> · actuel depuis le {formatDate(etape.debut)}</span> : null}
          </button>
        ))}
      </section>

      {actuel ? (
        <section>
          <h2>Boucle</h2>
          <p className="muted small">Recommencer un Niveau depuis le début, environ 35 % sous vos meilleures performances.</p>
          {methode.niveaux.slice(0, methode.niveaux.findIndex((n) => n.id === actuel.id) + 1).map((n) => (
            <a className="card choice" key={n.id} href={`#/boucle/${n.id}`}>
              Boucler le <strong>{n.nom}</strong>
            </a>
          ))}
        </section>
      ) : null}
    </Layout>
  );
}

function NiveauActuel({ methode, carnet, niveau }: { methode: Methode; carnet: Carnet; niveau: Niveau }) {
  const programme = niveau.organisation === 'programmes' ? prochainePartie(niveau, carnet).id : null;
  return (
    <section>
      <h2>{niveau.nom}</h2>
      {niveau.note ? <p className="consigne-note">{niveau.note}</p> : null}
      {niveau.parties.map((p) => (
        <div className={`card ${p.id === programme ? 'card-accent' : ''}`} key={p.id}>
          <h2>{p.nom}</h2>
          {programme && p.id !== programme ? (
            <button
              type="button"
              className="button button-small"
              onClick={() => void enqueue({ kind: 'programme-actuel', data: { niveau: niveau.id, partie: p.id } })}
            >
              Passer à ce programme
            </button>
          ) : null}
          {p.id === programme ? <p className="muted small">Programme actuel</p> : null}
          {p.blocs.map((b) => (
            <div key={b.id}>
              <p className="eyebrow bloc-titre">{b.nom}</p>
              {b.consignes.map((c) => {
                const ex = exerciceActuel(c, carnet);
                return (
                  <a className="ligne-consigne" key={c.id} href={`#/consigne/${c.id}`}>
                    <span>{nomExercice(methode, ex)}</span>
                    <span className="muted small">
                      {consigneEffective(c, carnet).series.length} séries{ex !== c.exercice && etapeDe(c, ex) === -1 ? ' · remplacé' : ''} ›
                    </span>
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/** Starting a Boucle: every reps Série restarts at a share of the best Résultat, adjustable before confirming. */
export function BouclePage({ methode, carnet, niveauId }: { methode: Methode; carnet: Carnet; niveauId: string }) {
  const niveau = methode.niveaux.find((n) => n.id === niveauId);
  const lignes = niveau
    ? consignesOf(niveau).map(({ partie, consigne }) => {
        const c = consigneEffective(consigne, carnet);
        const ex = exerciceActuel(c, carnet);
        return { partie, consigne: c, exercice: ex, depart: departBoucle(c, ex, carnet.entrainements) };
      })
    : [];
  const [departs, setDeparts] = useState(() => new Map(lignes.map((l) => [l.consigne.id, l.depart])));
  if (!niveau) return <NotFound what="Niveau" />;

  function commencer() {
    const date = todayIso();
    const ops: Operation[] = [{ kind: 'parcours', data: { id: newId(), niveau: niveau!.id, debut: date, boucle: true } }];
    for (const l of lignes) {
      if (!l.consigne.series.some((s) => s.cible.type === 'reps')) continue;
      ops.push({ kind: 'reprise', data: { id: newId(), consigne: l.consigne.id, date, kind: 'boucle', depart: departs.get(l.consigne.id)! } });
    }
    if (niveau!.organisation === 'programmes') ops.push({ kind: 'programme-actuel', data: { niveau: niveau!.id, partie: niveau!.parties[0]!.id } });
    void enqueue(...ops);
    navigate('/');
  }

  return (
    <Layout title={`Boucle · ${niveau.nom}`} back="/niveaux">
      <p className="muted">Objectifs de départ suggérés (≈ 65 % de vos meilleures séries). Ajustez si besoin.</p>
      {lignes.map((l) => (
        <div className="card" key={l.consigne.id}>
          <p className="eyebrow">{l.partie.nom}</p>
          <h2>{nomExercice(methode, l.exercice)}</h2>
          <div className="departs">
            {l.consigne.series.map((s, i) =>
              s.cible.type === 'reps' ? (
                <input
                  key={i}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={departs.get(l.consigne.id)![i]}
                  onChange={(e) => {
                    const next = [...departs.get(l.consigne.id)!];
                    next[i] = Math.max(0, Number(e.target.value) || 0);
                    setDeparts(new Map(departs).set(l.consigne.id, next));
                  }}
                />
              ) : (
                <span key={i} className="muted small">
                  {s.cible.type}
                </span>
              ),
            )}
          </div>
        </div>
      ))}
      <button type="button" className="button button-primary button-block button-big" onClick={commencer}>
        Commencer la Boucle
      </button>
    </Layout>
  );
}
