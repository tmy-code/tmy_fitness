import { useState } from 'react';
import type { Carnet } from '../../shared/carnet.ts';
import type { Methode } from '../../shared/methode.ts';
import { newId } from '../api.ts';
import { Layout, NotFound } from '../components.tsx';
import { useEcranAllume } from '../device.ts';
import { formatDate, formatDuree, todayIso } from '../format.ts';
import { navigate } from '../router.ts';
import { enqueue } from '../store.ts';
import { Chrono } from './Entrainement.tsx';

export function SouplessePage({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  return (
    <Layout title="Souplesse" back="/">
      {methode.souplesse.length === 0 ? <p className="empty muted">La Méthode chargée ne contient pas de routine de souplesse.</p> : null}
      {methode.souplesse.map((r) => {
        const derniere = carnet.entrainements.filter((e) => e.kind === 'souplesse' && e.routine === r.id && e.termine).at(-1);
        const total = r.etirements.reduce((sum, e) => sum + e.secondes, 0);
        return (
          <a className="card" key={r.id} href={`#/souplesse/${r.id}`}>
            <h2>{r.nom}</h2>
            <p className="muted small">
              {r.etirements.length} étirements · {formatDuree(total)}
              {derniere ? ` · dernière fois le ${formatDate(derniere.date)}` : ''}
            </p>
          </a>
        );
      })}
    </Layout>
  );
}

/** Walks through a Routine de souplesse with a hold timer per stretch; recorded only as done. */
export function RoutineRun({ methode, routineId }: { methode: Methode; routineId: string }) {
  const routine = methode.souplesse.find((r) => r.id === routineId);
  const [index, setIndex] = useState(0);
  useEcranAllume(true);
  if (!routine) return <NotFound what="Routine" />;
  const etirement = routine.etirements[index];

  function terminer() {
    void enqueue({ kind: 'entrainement', data: { id: newId(), date: todayIso(), kind: 'souplesse', routine: routine!.id, termine: true, exercices: [] } });
    navigate('/souplesse', { replace: true });
  }

  return (
    <Layout title={routine.nom} back="/souplesse">
      {etirement ? (
        <section className="card saisie" key={index}>
          <p className="eyebrow">
            Étirement {index + 1}/{routine.etirements.length}
          </p>
          <h2>{etirement.nom}</h2>
          {etirement.page ? <p className="muted small">Descriptif p. {etirement.page}</p> : null}
          {etirement.note ? <p className="consigne-note">{etirement.note}</p> : null}
          <Chrono secondes={etirement.secondes} onFin={() => undefined} />
          <button type="button" className="button button-primary button-block button-big" onClick={() => setIndex(index + 1)}>
            {index + 1 < routine.etirements.length ? 'Suivant ›' : 'Dernier étirement fait'}
          </button>
        </section>
      ) : (
        <section className="card card-accent">
          <h2>Routine terminée ✓</h2>
          <button type="button" className="button button-primary button-block button-big" onClick={terminer}>
            Enregistrer
          </button>
        </section>
      )}
    </Layout>
  );
}
