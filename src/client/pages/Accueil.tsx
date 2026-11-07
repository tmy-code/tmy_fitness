import { useState } from 'react';
import { methode as methodeSchema, type Methode } from '../../shared/methode.ts';
import type { Carnet } from '../../shared/carnet.ts';
import { blocsFaitsDepuisDebut, etapeActuelle, ligneFrequence, niveauActuel, prochainePartie } from '../../shared/prochain.ts';
import { Layout, NeedsConnection } from '../components.tsx';
import { formatDate, pluriel, todayIso } from '../format.ts';
import { online, useStore } from '../store.ts';

export function AccueilPage({ methode, carnet }: { methode: Methode | null; carnet: Carnet }) {
  const { brouillon } = useStore();
  if (!methode) return <SansMethode />;

  const niveau = niveauActuel(methode, carnet);
  const etape = etapeActuelle(carnet.parcours);
  return (
    <Layout title="_fitness">
      {brouillon ? (
        <a className="card card-accent" href="#/entrainement">
          <h2>Entraînement en cours</h2>
          <p className="muted">Commencé le {formatDate(brouillon.entrainement.date)} — toucher pour reprendre.</p>
        </a>
      ) : null}

      {!niveau ? (
        <section className="card">
          <h2>Bienvenue</h2>
          <p>Commencez par les Tests : ils indiquent votre Niveau de départ.</p>
          <a className="button button-primary button-block" href="#/tests">
            Passer les Tests
          </a>
          <p className="muted small">
            Ou <a href="#/niveaux">choisir directement un Niveau</a>.
          </p>
        </section>
      ) : (
        <Prochain methode={methode} carnet={carnet} enCours={!!brouillon} />
      )}

      <nav className="menu">
        {niveau ? (
          <a className="card" href="#/niveaux">
            <h2>{niveau.nom}</h2>
            <p className="muted">
              {etape?.boucle ? 'Boucle · ' : ''}depuis le {etape ? formatDate(etape.debut) : '—'}
            </p>
          </a>
        ) : null}
        <a className="card" href="#/progres">
          <h2>Progrès</h2>
        </a>
        <a className="card" href="#/carnet">
          <h2>Carnet</h2>
        </a>
        <a className="card" href="#/souplesse">
          <h2>Souplesse</h2>
        </a>
        <a className="card" href="#/reglages">
          <h2>Réglages</h2>
        </a>
      </nav>
    </Layout>
  );
}

function Prochain({ methode, carnet, enCours }: { methode: Methode; carnet: Carnet; enCours: boolean }) {
  const niveau = niveauActuel(methode, carnet)!;
  const partie = prochainePartie(niveau, carnet);
  const faits = blocsFaitsDepuisDebut(partie, carnet.entrainements);
  const restants = partie.blocs.filter((b) => !faits.includes(b.id));
  const ligne = ligneFrequence(niveau, carnet, todayIso());
  return (
    <section className="card">
      <p className="eyebrow">Prochain entraînement</p>
      <h2>
        {niveau.nom} · {partie.nom}
      </h2>
      <p className="muted">
        {faits.length > 0 ? `Split : reste ${restants.map((b) => b.nom).join(', ')}` : pluriel(partie.blocs.length, 'bloc', 'blocs')}
      </p>
      {ligne.libelle ? (
        <p className={ligne.jourEntrainement ? 'ok small' : 'muted small'}>
          Fréquence conseillée : {ligne.libelle}
          {ligne.joursDepuis !== null ? ` · dernier entraînement ${ligne.joursDepuis === 0 ? "aujourd'hui" : `il y a ${pluriel(ligne.joursDepuis, 'jour', 'jours')}`}` : ''}
        </p>
      ) : null}
      {enCours ? null : (
        <a className="button button-primary button-block" href="#/entrainement">
          Commencer
        </a>
      )}
    </section>
  );
}

function SansMethode() {
  const { reachable, syncing } = useStore();
  return (
    <Layout title="_fitness">
      <section className="card">
        <h2>Aucune Méthode chargée</h2>
        <p className="muted">
          {syncing ? 'Chargement…' : reachable ? 'Chargez le fichier de la Méthode pour commencer.' : 'Ouvrez l’application une première fois avec une connexion au serveur.'}
        </p>
        <ChargerMethode />
      </section>
    </Layout>
  );
}

/** Uploads the private Méthode file (never part of the app itself, see ADR 0001). */
export function ChargerMethode() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const parsed = methodeSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        setMessage(`Fichier invalide : ${issue.path.join('.')} ${issue.message}`);
        return;
      }
      await online('PUT', '/api/methode', parsed.data);
      setMessage('Méthode chargée ✓');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Échec du chargement');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form">
      <NeedsConnection />
      <label className="button button-block">
        {busy ? 'Chargement…' : 'Charger un fichier Méthode (.json)'}
        <input type="file" accept="application/json,.json" hidden disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {message ? <p className="small">{message}</p> : null}
    </div>
  );
}
