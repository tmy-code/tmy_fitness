import { useEffect, useState } from 'react';
import type { Carnet, Entrainement as EntrainementData, ExerciceFait } from '../../shared/carnet.ts';
import { consigneEffective } from '../../shared/consigne.ts';
import { enSecondes, type Bloc, type Cible, type Methode, type Niveau, type Partie } from '../../shared/methode.ts';
import { objectifsDuJour } from '../../shared/objectif.ts';
import type { Operation } from '../../shared/operations.ts';
import { blocsFaitsDepuisDebut, blocsProposes, niveauActuel, prochainePartie } from '../../shared/prochain.ts';
import { etapeDe } from '../../shared/progression.ts';
import { nouvelEntrainement, reposApres, serieCourante, suggestionsFin } from '../../shared/seance.ts';
import { newId } from '../api.ts';
import { Layout, Stepper } from '../components.tsx';
import { preparerSon, signalFinRepos, useEcranAllume } from '../device.ts';
import { formatChrono, formatDuree, formatValeur, todayIso } from '../format.ts';
import { indexConsignes, nomExercice, pageExercice } from '../lookup.ts';
import { navigate } from '../router.ts';
import { enqueue, saveBrouillon, useStore, type Brouillon } from '../store.ts';

export function EntrainementPage({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  const { brouillon } = useStore();
  useEcranAllume(!!brouillon);

  if (!brouillon) {
    const niveau = niveauActuel(methode, carnet);
    if (!niveau) {
      navigate('/', { replace: true });
      return null;
    }
    return <Preparation methode={methode} carnet={carnet} niveau={niveau} partie={prochainePartie(niveau, carnet)} />;
  }

  const lieu = indexConsignes(methode);
  const niveau = methode.niveaux.find((n) => n.id === brouillon.entrainement.niveau);
  const partie = niveau?.parties.find((p) => p.id === brouillon.entrainement.partie);
  if (!niveau || !partie) {
    return (
      <Layout title="Entraînement" back="/">
        <p className="banner banner-error">Ce Niveau n’existe plus dans la Méthode chargée.</p>
        <AbandonButton />
      </Layout>
    );
  }
  const position = serieCourante(brouillon.entrainement);
  return (
    <Layout title={`${niveau.nom} · ${partie.nom}`} back="/">
      {brouillon.repos ? <Repos repos={brouillon.repos} brouillon={brouillon} /> : null}
      {position ? (
        <EnCours methode={methode} carnet={carnet} brouillon={brouillon} partie={partie} position={position} lieu={lieu} />
      ) : (
        <Resume methode={methode} carnet={carnet} brouillon={brouillon} niveau={niveau} partie={partie} />
      )}
    </Layout>
  );
}

function Preparation({ methode, carnet, niveau, partie }: { methode: Methode; carnet: Carnet; niveau: Niveau; partie: Partie }) {
  const faits = blocsFaitsDepuisDebut(partie, carnet.entrainements);
  const [blocs, setBlocs] = useState(() => blocsProposes(partie, carnet.entrainements));
  const [coches, setCoches] = useState<number[]>([]);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  /** Ticking one alternative unticks the others of its choice. */
  function toggleBloc(bloc: Bloc) {
    if (blocs.includes(bloc.id) || !bloc.choix) return setBlocs(toggle(blocs, bloc.id));
    const autres = partie.blocs.filter((b) => b.choix === bloc.choix).map((b) => b.id);
    setBlocs([...blocs.filter((b) => !autres.includes(b)), bloc.id]);
  }

  function commencer() {
    preparerSon();
    const split = blocs.length < partie.blocs.length ? blocs : undefined;
    void saveBrouillon({ entrainement: nouvelEntrainement(niveau, partie, carnet, newId(), todayIso(), split), repos: null });
  }

  return (
    <Layout title={`${niveau.nom} · ${partie.nom}`} back="/">
      {methode.echauffement.length > 0 ? (
        <section className="card">
          <h2>Échauffement</h2>
          <ul className="checklist">
            {methode.echauffement.map((item, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={coches.includes(i)} onChange={() => setCoches(toggle(coches, i))} /> {item}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="card">
        <h2>Blocs du jour</h2>
        <p className="muted small">Décochez des Blocs pour répartir la séance sur plusieurs jours (Split).</p>
        <ul className="checklist">
          {partie.blocs.map((b) => (
            <li key={b.id}>
              <label>
                <input type="checkbox" checked={blocs.includes(b.id)} onChange={() => toggleBloc(b)} /> {b.nom}
                {b.facultatif ? <span className="muted small"> · facultatif</span> : null}
                {b.choix ? <span className="muted small"> · au choix</span> : null}
                {faits.includes(b.id) ? <span className="muted small"> · déjà fait</span> : null}
              </label>
            </li>
          ))}
        </ul>
      </section>
      <button type="button" className="button button-primary button-block" disabled={blocs.length === 0} onClick={commencer}>
        {coches.length < methode.echauffement.length && methode.echauffement.length > 0 ? 'Commencer (sans finir l’échauffement)' : 'Commencer'}
      </button>
    </Layout>
  );
}

function update(brouillon: Brouillon, change: (e: EntrainementData) => void, repos: Brouillon['repos'] = brouillon.repos) {
  const entrainement = structuredClone(brouillon.entrainement);
  change(entrainement);
  void saveBrouillon({ entrainement, repos });
}

function EnCours({
  methode,
  carnet,
  brouillon,
  partie,
  position,
  lieu,
}: {
  methode: Methode;
  carnet: Carnet;
  brouillon: Brouillon;
  partie: Partie;
  position: { exercice: number; serie: number };
  lieu: ReturnType<typeof indexConsignes>;
}) {
  const e = brouillon.entrainement;
  const fait = e.exercices[position.exercice]!;
  const where = lieu.get(fait.ref);
  if (!where) return <p className="banner banner-error">Consigne introuvable dans la Méthode.</p>;
  const consigne = consigneEffective(where.consigne, carnet);
  const { series: objectifs } = objectifsDuJour(consigne, fait.exercice, carnet.entrainements, carnet.reprises);
  const cible = consigne.series[position.serie]?.cible ?? { type: 'max' as const };
  const serie = fait.series[position.serie]!;
  const aBattre = objectifs[position.serie]?.aBattre ?? null;
  const note = carnet.notes.find((n) => n.exercice === fait.exercice)?.note;
  const page = pageExercice(methode, fait.exercice);

  return (
    <>
      <p className="eyebrow">
        {where.bloc.nom} · exercice {position.exercice + 1}/{e.exercices.length}
      </p>
      <section className="card">
        <h2>{nomExercice(methode, fait.exercice)}</h2>
        <p className="muted small">
          {[consigne.rythme ? `Rythme ${consigne.rythme}` : null, page ? `Descriptif p. ${page}` : null].filter(Boolean).join(' · ')}
        </p>
        <Progression methode={methode} consigne={consigne} exercice={fait.exercice} />
        {consigne.note ? <p className="consigne-note">{consigne.note}</p> : null}
        {note ? <p className="perso-note">📝 {note}</p> : null}
        <table className="series">
          <thead>
            <tr>
              <th>Série</th>
              <th>Objectif</th>
              <th>Dernière fois</th>
              <th>Fait</th>
            </tr>
          </thead>
          <tbody>
            {fait.series.map((s, i) => {
              const c = consigne.series[i]?.cible ?? cible;
              return (
                <tr key={i} className={i === position.serie ? 'current' : s.resultat !== null ? 'done' : ''}>
                  <td>{i + 1}</td>
                  <td>{c.type === 'max' ? 'max' : formatValeur(c, s.objectif)}</td>
                  <td>{formatValeur(c, objectifs[i]?.aBattre ?? null)}</td>
                  <td>
                    {formatValeur(c, s.resultat)}
                    {s.forcees ? ` + ${s.forcees}` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <SaisieSerie
        key={`${e.id}-${position.exercice}-${position.serie}`}
        cible={cible}
        initial={serie.objectif ?? aBattre ?? 0}
        onValider={(resultat, forcees) => {
          preparerSon();
          const rest = reposApres(partie, e, position.exercice, position.serie, carnet);
          update(
            brouillon,
            (x) => {
              const target = x.exercices[position.exercice]!.series[position.serie]!;
              target.resultat = resultat;
              target.forcees = forcees;
            },
            rest > 0 ? { fin: Date.now() + rest * 1000, total: rest } : null,
          );
        }}
      />

      <NoteExercice fait={fait} onChange={(text) => update(brouillon, (x) => (x.exercices[position.exercice]!.note = text || undefined))} />

      <div className="row-actions">
        <button type="button" className="button button-small" disabled={position.serie === 0 && position.exercice === 0 && fait.series[0]!.resultat === null} onClick={() => update(brouillon, annulerDerniere, null)}>
          ↶ Annuler la dernière série
        </button>
        <button
          type="button"
          className="button button-small"
          onClick={() => update(brouillon, (x) => passerExercice(x, position.exercice), null)}
        >
          Passer cet exercice
        </button>
        <button type="button" className="button button-small" onClick={() => update(brouillon, terminerMaintenant, null)}>
          Terminer maintenant
        </button>
      </div>
    </>
  );
}

/** Removes the Séries not done from one Exercice (and the Exercice itself if none was done). */
function passerExercice(e: EntrainementData, index: number) {
  const x = e.exercices[index]!;
  x.series = x.series.filter((s) => s.resultat !== null);
  if (x.series.length === 0) e.exercices.splice(index, 1);
}

function terminerMaintenant(e: EntrainementData) {
  for (let i = e.exercices.length - 1; i >= 0; i--) passerExercice(e, i);
}

function annulerDerniere(e: EntrainementData) {
  for (let i = e.exercices.length - 1; i >= 0; i--) {
    const series = e.exercices[i]!.series;
    for (let j = series.length - 1; j >= 0; j--) {
      if (series[j]!.resultat !== null) {
        series[j]!.resultat = null;
        series[j]!.forcees = 0;
        return;
      }
    }
  }
}

function Progression({ methode, consigne, exercice }: { methode: Methode; consigne: ReturnType<typeof consigneEffective>; exercice: string }) {
  if (!consigne.progression) return null;
  const index = etapeDe(consigne, exercice);
  const etape = consigne.progression[index];
  return (
    <div className="progression">
      <p>
        {consigne.progression.map((p, i) => (
          <span key={p.exercice}>
            {i > 0 ? ' → ' : ''}
            <span className={i === index ? 'actuel' : ''} title={nomExercice(methode, p.exercice)}>
              {p.exercice}
            </span>
          </span>
        ))}
        {index === -1 ? <span className="muted"> (remplacé par {exercice})</span> : null}
      </p>
      {etape?.condition ? (
        <p className="muted small">
          Passer au suivant :{' '}
          {etape.condition.type === 'series' ? `${etape.condition.series} séries de ${etape.condition.reps} répétitions` : etape.condition.texte}
        </p>
      ) : null}
    </div>
  );
}

function SaisieSerie({ cible, initial, onValider }: { cible: Cible; initial: number; onValider: (resultat: number, forcees: number) => void }) {
  const [value, setValue] = useState(initial);
  const [forcees, setForcees] = useState(0);
  const [showForcees, setShowForcees] = useState(false);
  const timed = enSecondes(cible);
  return (
    <section className="card saisie">
      {timed ? <Chrono secondes={cible.type === 'duree' ? initial : undefined} onFin={(s) => setValue(s)} /> : null}
      <p className="field-label">{timed ? 'Tenu' : 'Répétitions'}</p>
      <Stepper value={value} onChange={setValue} step={timed ? 5 : 1} format={timed ? formatDuree : undefined} />
      {showForcees ? (
        <>
          <p className="field-label">Répétitions forcées</p>
          <Stepper value={forcees} onChange={setForcees} />
        </>
      ) : (
        <button type="button" className="link" onClick={() => setShowForcees(true)}>
          + répétitions forcées
        </button>
      )}
      <button type="button" className="button button-primary button-block button-big" onClick={() => onValider(value, forcees)}>
        ✓ Valider la série
      </button>
    </section>
  );
}

/**
 * A hold timer for timed Séries: counts down the target, then signals.
 * Without a target ("as long as possible") it counts up until stopped.
 */
export function Chrono({ secondes, onFin }: { secondes?: number; onFin: (s: number) => void }) {
  const [debut, setDebut] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (debut === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [debut]);
  const ecoule = debut === null ? 0 : (now - debut) / 1000;
  useEffect(() => {
    if (debut !== null && secondes !== undefined && ecoule >= secondes) {
      signalFinRepos();
      onFin(secondes);
      setDebut(null);
    }
  }, [debut, ecoule, secondes, onFin]);
  if (debut === null)
    return (
      <button
        type="button"
        className="button button-block"
        onClick={() => {
          preparerSon();
          setNow(Date.now());
          setDebut(Date.now());
        }}
      >
        ▶ Démarrer le chrono{secondes !== undefined ? ` (${formatDuree(secondes)})` : ''}
      </button>
    );
  return (
    <div className="chrono">
      <output>{formatChrono(secondes !== undefined ? secondes - ecoule : ecoule)}</output>
      <button
        type="button"
        className="button button-small"
        onClick={() => {
          onFin(Math.floor(ecoule));
          setDebut(null);
        }}
      >
        Arrêter ({formatDuree(Math.floor(ecoule))})
      </button>
    </div>
  );
}

function NoteExercice({ fait, onChange }: { fait: ExerciceFait; onChange: (text: string) => void }) {
  const [open, setOpen] = useState(!!fait.note);
  if (!open)
    return (
      <button type="button" className="link" onClick={() => setOpen(true)}>
        + note sur cet exercice
      </button>
    );
  return (
    <label className="field">
      <span className="field-label">Note du jour</span>
      <textarea rows={2} defaultValue={fait.note ?? ''} onBlur={(e) => onChange(e.target.value.trim())} placeholder="douleur, variante, matériel…" />
    </label>
  );
}

/** The rest countdown. Its end is a wall-clock time, so it keeps running if the app is closed and reopened. */
function Repos({ repos, brouillon }: { repos: NonNullable<Brouillon['repos']>; brouillon: Brouillon }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const reste = (repos.fin - now) / 1000;
  useEffect(() => {
    if (reste <= 0) {
      signalFinRepos();
      void saveBrouillon({ ...brouillon, repos: null });
    }
  }, [reste <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = () => void saveBrouillon({ ...brouillon, repos: null });
  return (
    <div className="repos" role="timer">
      <p className="eyebrow">Repos</p>
      <output>{formatChrono(reste)}</output>
      <div className="row-actions">
        <button type="button" className="button" onClick={() => void saveBrouillon({ ...brouillon, repos: { fin: repos.fin + 30_000, total: repos.total + 30 } })}>
          +30 s
        </button>
        <button type="button" className="button button-primary" onClick={stop}>
          Passer le repos
        </button>
      </div>
    </div>
  );
}

function Resume({ methode, carnet, brouillon, niveau, partie }: { methode: Methode; carnet: Carnet; brouillon: Brouillon; niveau: Niveau; partie: Partie }) {
  const e = brouillon.entrainement;
  const suggestions = suggestionsFin(niveau, partie, e, carnet);
  const [acceptees, setAcceptees] = useState<number[]>([]);

  function enregistrer() {
    const ops: Operation[] = [{ kind: 'entrainement', data: { ...e, termine: true } }];
    suggestions.forEach((s, i) => {
      if (!acceptees.includes(i)) return;
      if (s.kind === 'progression' && s.consigne) ops.push({ kind: 'exercice-actuel', data: { consigne: s.consigne, exercice: s.vers } });
      if (s.kind === 'programme') ops.push({ kind: 'programme-actuel', data: { niveau: niveau.id, partie: s.vers } });
    });
    void enqueue(...ops);
    void saveBrouillon(null);
    navigate('/', { replace: true });
  }

  return (
    <>
      <section className="card">
        <h2>Entraînement terminé 💪</h2>
        {e.exercices.length === 0 ? <p className="muted">Aucune série faite.</p> : null}
        <ul className="resume">
          {e.exercices.map((x) => (
            <li key={x.ref}>
              <strong>{nomExercice(methode, x.exercice)}</strong>
              <span className="muted">
                {' '}
                {x.series.map((s) => `${s.resultat ?? '—'}${s.forcees ? `+${s.forcees}` : ''}`).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {suggestions.map((s, i) => (
        <section className="card card-accent" key={i}>
          <p>{s.libelle}</p>
          <div className="row-actions">
            <button type="button" className={`button ${acceptees.includes(i) ? 'button-primary' : ''}`} onClick={() => setAcceptees([...acceptees, i])}>
              Oui
            </button>
            <button type="button" className={`button ${acceptees.includes(i) ? '' : 'button-primary'}`} onClick={() => setAcceptees(acceptees.filter((x) => x !== i))}>
              Pas encore
            </button>
          </div>
        </section>
      ))}
      <button type="button" className="button button-primary button-block button-big" disabled={e.exercices.length === 0} onClick={enregistrer}>
        Enregistrer l’entraînement
      </button>
      <div className="row-actions">
        <button type="button" className="button button-small" onClick={() => update(brouillon, annulerDerniere, null)}>
          ↶ Annuler la dernière série
        </button>
        <AbandonButton />
      </div>
    </>
  );
}

function AbandonButton() {
  return (
    <button
      type="button"
      className="button button-small button-danger"
      onClick={() => {
        if (!window.confirm('Abandonner cet entraînement ? Les séries saisies seront perdues.')) return;
        void saveBrouillon(null);
        navigate('/', { replace: true });
      }}
    >
      Abandonner
    </button>
  );
}
