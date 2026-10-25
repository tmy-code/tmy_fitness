import { useEffect, useState } from 'react';
import type { Carnet, Entrainement } from '../../shared/carnet.ts';
import type { Methode, Test } from '../../shared/methode.ts';
import type { Operation } from '../../shared/operations.ts';
import { conclusionTests, deroulerTest, exercicesDeDepart, type DeroulementTest } from '../../shared/tests.ts';
import { newId } from '../api.ts';
import { Layout, NotFound, Stepper } from '../components.tsx';
import { preparerSon, signalFinRepos } from '../device.ts';
import { formatChrono, formatCible, formatDate, formatDuree, todayIso } from '../format.ts';
import { nomExercice, pageExercice } from '../lookup.ts';
import { navigate } from '../router.ts';
import { Chrono } from './Entrainement.tsx';
import { enqueue } from '../store.ts';

/** The latest attempt at a Test, if any. */
function dernierEssai(carnet: Carnet, testId: string): Entrainement | undefined {
  return carnet.entrainements.filter((e) => e.kind === 'test' && e.test === testId).at(-1);
}

export function TestsPage({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  const essais = new Map(methode.tests.map((t) => [t.id, dernierEssai(carnet, t.id)]));
  const faits = new Map(methode.tests.map((t) => [t.id, essais.get(t.id)?.exercices ?? []]));
  const conclusion = conclusionTests(methode, faits);
  const tousFinis = methode.tests.every((t) => essais.get(t.id)?.termine);
  const niveau = methode.niveaux.find((n) => n.id === conclusion.niveau);
  const partie = niveau?.parties.find((p) => p.id === conclusion.partie);

  function commencer() {
    if (!niveau) return;
    const ops: Operation[] = [{ kind: 'parcours', data: { id: newId(), niveau: niveau.id, debut: todayIso(), boucle: false } }];
    if (partie) ops.push({ kind: 'programme-actuel', data: { niveau: niveau.id, partie: partie.id } });
    for (const x of exercicesDeDepart(niveau, conclusion.exercices)) ops.push({ kind: 'exercice-actuel', data: x });
    void enqueue(...ops);
    navigate('/', { replace: true });
  }

  return (
    <Layout title="Tests" back="/">
      <p className="muted">Les Tests peuvent être répartis sur plusieurs jours. Chaque étape réussie mène à la suivante.</p>
      {methode.tests.length === 0 ? <p className="empty">La Méthode chargée ne contient pas de Tests.</p> : null}
      {methode.tests.map((t) => {
        const essai = essais.get(t.id);
        return (
          <a className="card" href={`#/tests/${t.id}`} key={t.id}>
            <h2>{t.nom}</h2>
            <p className="muted">{!essai ? 'À faire' : essai.termine ? `Fait le ${formatDate(essai.date)}` : 'En cours'}</p>
          </a>
        );
      })}
      {niveau && tousFinis ? (
        <section className="card card-accent">
          <p className="eyebrow">Conclusion</p>
          <h2>
            Commencer au {niveau.nom}
            {partie ? ` · ${partie.nom}` : ''}
          </h2>
          {conclusion.exercices.length > 0 ? <p className="muted small">Exercices de départ : {conclusion.exercices.join(', ')}</p> : null}
          <button type="button" className="button button-primary button-block" onClick={commencer}>
            Commencer ce Niveau
          </button>
          <p className="muted small">
            Ou <a href="#/niveaux">choisir un autre Niveau</a>.
          </p>
        </section>
      ) : null}
    </Layout>
  );
}

export function TestRun({ methode, carnet, testId }: { methode: Methode; carnet: Carnet; testId: string }) {
  const test = methode.tests.find((t) => t.id === testId);
  if (!test) return <NotFound what="Test" />;
  const essai = dernierEssai(carnet, test.id);
  // Keyed on the Test only: saving the first step creates the attempt, which must not reset the rest timer.
  return <TestEtapes key={test.id} methode={methode} test={test} essai={essai} />;
}

function TestEtapes({ methode, test, essai }: { methode: Methode; test: Test; essai: Entrainement | undefined }) {
  const [current, setCurrent] = useState<Entrainement | undefined>(essai);
  const [repos, setRepos] = useState<number | null>(null);
  const deroule = deroulerTest(test, current?.exercices ?? []);

  function save(e: Entrainement) {
    setCurrent(e);
    void enqueue({ kind: 'entrainement', data: e });
  }

  function valider(resultat: number) {
    const etape = deroule.etape!;
    const base: Entrainement = current ?? { id: newId(), date: todayIso(), kind: 'test', test: test.id, termine: false, exercices: [] };
    const exercices = [...base.exercices, { ref: etape.id, exercice: etape.exercice, series: [{ objectif: etape.cible.type === 'reps' ? etape.cible.n : null, resultat, forcees: 0 }] }];
    const next = deroulerTest(test, exercices);
    save({ ...base, exercices, termine: next.etape === null });
    if (next.etape) setRepos(Date.now() + etape.repos * 1000);
  }

  function recommencer() {
    setCurrent(undefined);
    setRepos(null);
  }

  return (
    <Layout title={test.nom} back="/tests">
      {current ? (
        <section className="card">
          <h2>Étapes faites</h2>
          <ul className="resume">
            {current.exercices.map((x) => (
              <li key={x.ref}>
                {nomExercice(methode, x.exercice)} : <strong>{x.series[0]?.resultat ?? '—'}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {repos !== null ? <Minuteur fin={repos} onFin={() => setRepos(null)} /> : null}
      {deroule.etape && repos === null ? <EtapeEnCours methode={methode} etape={deroule.etape} numero={(current?.exercices.length ?? 0) + 1} onValider={valider} /> : null}
      {!deroule.etape ? (
        <section className="card card-accent">
          <h2>Test terminé ✓</h2>
          <p>{conclusionEtape(methode, deroule.issue, deroule.dernierExercice)}</p>
          <a className="button button-primary button-block" href="#/tests">
            Retour aux Tests
          </a>
          <button type="button" className="link" onClick={recommencer}>
            Recommencer ce Test
          </button>
        </section>
      ) : null}
    </Layout>
  );
}

function conclusionEtape(methode: Methode, issue: DeroulementTest['issue'], dernierExercice: string | null): string {
  if (issue && 'niveau' in issue) {
    const id = issue.niveau;
    return `Résultat : ${methode.niveaux.find((n) => n.id === id)?.nom ?? id}.`;
  }
  return `Exercice de départ : ${dernierExercice ?? '—'}.`;
}

function EtapeEnCours({ methode, etape, numero, onValider }: { methode: Methode; etape: Test['etapes'][number]; numero: number; onValider: (r: number) => void }) {
  const timed = etape.cible.type === 'duree';
  const [value, setValue] = useState(etape.cible.type === 'reps' ? etape.cible.n : etape.cible.type === 'duree' ? etape.cible.secondes : 0);
  const page = pageExercice(methode, etape.exercice);
  return (
    <section className="card saisie">
      <p className="eyebrow">Étape {numero}</p>
      <h2>{nomExercice(methode, etape.exercice)}</h2>
      <p className="muted small">
        Objectif : {formatCible(etape.cible)}
        {page ? ` · Descriptif p. ${page}` : ''}
      </p>
      {etape.note ? <p className="consigne-note">{etape.note}</p> : null}
      {etape.cible.type === 'duree' ? <Chrono secondes={etape.cible.secondes} onFin={setValue} /> : null}
      <p className="field-label">{timed ? 'Tenu' : 'Répétitions faites'}</p>
      <Stepper value={value} onChange={setValue} step={timed ? 5 : 1} format={timed ? formatDuree : undefined} />
      <button
        type="button"
        className="button button-primary button-block button-big"
        onClick={() => {
          preparerSon();
          onValider(value);
        }}
      >
        ✓ Valider
      </button>
    </section>
  );
}

/** A plain countdown for rests outside an Entraînement. */
export function Minuteur({ fin, onFin }: { fin: number; onFin: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const reste = (fin - now) / 1000;
  useEffect(() => {
    if (reste <= 0) {
      signalFinRepos();
      onFin();
    }
  }, [reste <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="card chrono">
      <p className="eyebrow">Repos</p>
      <output>{formatChrono(reste)}</output>
      <button type="button" className="button button-small" onClick={onFin}>
        Passer
      </button>
    </section>
  );
}
