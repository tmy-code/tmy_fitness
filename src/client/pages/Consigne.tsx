import { useState } from 'react';
import type { Carnet } from '../../shared/carnet.ts';
import { consigneEffective, departEtape, exerciceActuel } from '../../shared/consigne.ts';
import type { Methode } from '../../shared/methode.ts';
import { derniereReprise, objectifsDuJour } from '../../shared/objectif.ts';
import { etapeDe } from '../../shared/progression.ts';
import { newId } from '../api.ts';
import { Layout, NotFound } from '../components.tsx';
import { DescriptionExercice, EditerExercice, GererImage, PhotoExercice } from '../images.tsx';
import { formatCible, formatDate, formatDuree, formatValeur, todayIso } from '../format.ts';
import { descriptionExercice, indexConsignes, nomExercice } from '../lookup.ts';
import { isAndroidApp } from '../native.ts';
import { enqueue } from '../store.ts';

export function ConsignePage({ methode, carnet, consigneId }: { methode: Methode; carnet: Carnet; consigneId: string }) {
  const lieu = indexConsignes(methode).get(consigneId);
  if (!lieu) return <NotFound what="Consigne" />;
  const consigne = consigneEffective(lieu.consigne, carnet);
  const exercice = exerciceActuel(consigne, carnet);
  const { series, precedent } = objectifsDuJour(consigne, exercice, carnet.entrainements, carnet.reprises, departEtape(consigne, exercice));
  const reprise = derniereReprise(consigne.id, carnet.reprises);
  const setExercice = (code: string) => void enqueue({ kind: 'exercice-actuel', data: { consigne: consigne.id, exercice: code } });

  return (
    <Layout title={nomExercice(methode, exercice)} back="/niveaux">
      <p className="eyebrow">
        {lieu.niveau.nom} · {lieu.partie.nom} · {lieu.bloc.nom}
      </p>

      <section className="card">
        <h2>Consigne</h2>
        <ul className="resume">
          {consigne.series.map((s, i) => (
            <li key={i}>
              Série {i + 1} : {formatCible(s.cible)} · objectif du jour {s.cible.type === 'max' ? '—' : formatValeur(s.cible, series[i]?.objectif ?? null)} · repos {formatDuree(s.repos)}
            </li>
          ))}
        </ul>
        {consigne.rythme ? <p className="muted small">Rythme {consigne.rythme}</p> : null}
        {consigne.note ? <p className="consigne-note">{consigne.note}</p> : null}
        {precedent ? <p className="muted small">Dernière fois ({formatDate(precedent.date)}) : {precedent.series.map((s) => s.resultat ?? '—').join(' · ')}</p> : null}
        {reprise ? <p className="muted small">{reprise.kind === 'boucle' ? 'Boucle' : 'Mini-boucle'} depuis le {formatDate(reprise.date)} : départ {reprise.depart.join(' · ')}</p> : null}
        <a className="link" href={`#/ajuster/${consigne.id}`}>
          Ajuster cette consigne
        </a>
      </section>

      {consigne.progression ? (
        <section className="card">
          <h2>Progression</h2>
          <p className="muted small">Touchez l’exercice à faire désormais.</p>
          {consigne.progression.map((e, i) => (
            <button type="button" key={e.exercice} className={`card choice ${e.exercice === exercice ? 'card-accent' : ''}`} onClick={() => setExercice(e.exercice)}>
              <strong>{nomExercice(methode, e.exercice)}</strong>
              {e.exercice === exercice ? <span className="muted small"> · actuel</span> : null}
              {e.condition ? (
                <span className="muted small">
                  <br />
                  Passer au suivant : {e.condition.type === 'series' ? `${e.condition.series} séries de ${e.condition.reps}` : e.condition.texte}
                </span>
              ) : null}
              {i === etapeDe(consigne, exercice) + 1 ? <span className="muted small"> · suivant</span> : null}
            </button>
          ))}
        </section>
      ) : null}

      <DescriptionExercice methode={methode} exercice={exercice} />

      {isAndroidApp ? null : (
        <section className="card">
          <h2>Image et texte de {exercice}</h2>
          <p className="muted small">Une photo ou un schéma pour savoir quoi faire, affiché pendant l’entraînement.</p>
          <PhotoExercice exercice={exercice} />
          <GererImage exercice={exercice} />
          <EditerExercice methode={methode} exercice={exercice} />
        </section>
      )}

      <Remplacement methode={methode} actuel={exercice} prevu={consigne.exercice} remplace={exercice !== consigne.exercice && etapeDe(consigne, exercice) === -1} onChoose={setExercice} />
      <MiniBoucle consigneId={consigne.id} series={consigne.series} objectifs={series.map((s) => s.objectif)} />
      <NotePerso exercice={exercice} carnet={carnet} />
    </Layout>
  );
}

function Remplacement({ methode, actuel, prevu, remplace, onChoose }: { methode: Methode; actuel: string; prevu: string; remplace: boolean; onChoose: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <h2>Remplacement</h2>
      <p className="muted small">Faire un autre Exercice à la place (douleur, matériel…). Ses résultats sont suivis séparément.</p>
      {remplace ? (
        <button type="button" className="button button-small" onClick={() => onChoose(prevu)}>
          Revenir à {prevu}
        </button>
      ) : null}
      {open ? (
        <select value={actuel} onChange={(e) => onChoose(e.target.value)} className="button-block">
          {methode.exercices.map((e) => (
            <option key={e.code} value={e.code}>
              {e.code} · {e.nom}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Choisir un autre exercice
        </button>
      )}
    </section>
  );
}

function MiniBoucle({ consigneId, series, objectifs }: { consigneId: string; series: { cible: { type: string } }[]; objectifs: (number | null)[] }) {
  const [depart, setDepart] = useState<number[] | null>(null);
  if (!series.some((s) => s.cible.type === 'reps')) return null;
  return (
    <section className="card">
      <h2>Mini-boucle</h2>
      <p className="muted small">Bloqué sur cet exercice ? Repartez plus bas et remontez progressivement.</p>
      {depart ? (
        <>
          <div className="departs">
            {depart.map((v, i) =>
              series[i]?.cible.type === 'reps' ? (
                <input
                  key={i}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={v}
                  onChange={(e) => setDepart(depart.map((x, j) => (j === i ? Math.max(0, Number(e.target.value) || 0) : x)))}
                />
              ) : null,
            )}
          </div>
          <button
            type="button"
            className="button button-primary button-block"
            onClick={() => {
              void enqueue({ kind: 'reprise', data: { id: newId(), consigne: consigneId, date: todayIso(), kind: 'mini-boucle', depart } });
              setDepart(null);
            }}
          >
            Commencer la Mini-boucle
          </button>
        </>
      ) : (
        <button type="button" className="button button-small" onClick={() => setDepart(objectifs.map((o) => Math.max(1, Math.round((o ?? 0) / 2))))}>
          Préparer une Mini-boucle
        </button>
      )}
    </section>
  );
}

function NotePerso({ exercice, carnet }: { exercice: string; carnet: Carnet }) {
  const note = carnet.notes.find((n) => n.exercice === exercice)?.note ?? '';
  return (
    <section className="card">
      <h2>Ma note sur {exercice}</h2>
      <p className="muted small">Affichée à chaque fois que cet exercice revient.</p>
      <textarea
        key={note}
        rows={3}
        className="button-block"
        defaultValue={note}
        placeholder="garder les coudes serrés, chaise du salon OK…"
        onBlur={(e) => {
          const text = e.target.value.trim();
          if (text !== note) void enqueue({ kind: 'note', data: { exercice, note: text } });
        }}
      />
    </section>
  );
}
