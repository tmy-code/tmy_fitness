import type { ReactNode } from 'react';
import type { Operation } from '../shared/operations.ts';
import { dismissRejected, needsServerAddress, sync, useStore } from './store.ts';

export function Layout({ title, back, actions, children }: { title: string; back?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="topbar">
        {back !== undefined ? (
          <a className="back" href={`#${back}`} aria-label="Retour">
            ‹
          </a>
        ) : null}
        <h1>{title}</h1>
        <SyncBadge />
        {actions}
      </header>
      <VersionBanner />
      <RejectedBanner />
      <main>{children}</main>
    </>
  );
}

function SyncBadge() {
  const store = useStore();
  const { outbox, reachable, contacted, syncing, versionMismatch } = store;
  // Nothing to sync with until the Android app knows the server's address.
  if (needsServerAddress(store)) return null;
  const waiting = outbox.length;
  let label: string;
  let tone: string;
  if (versionMismatch) {
    label = waiting > 0 ? `Bloqué · ${waiting} en attente` : 'Bloqué';
    tone = 'offline';
  } else if (reachable && !contacted) {
    label = 'Connexion…';
    tone = 'syncing';
  } else if (!reachable) {
    label = waiting > 0 ? `Hors ligne · ${waiting} en attente` : 'Hors ligne';
    tone = 'offline';
  } else if (syncing || waiting > 0) {
    label = waiting > 0 ? `Envoi · ${waiting}` : 'Synchronisation…';
    tone = 'syncing';
  } else {
    label = 'À jour';
    tone = 'synced';
  }
  return (
    <button type="button" className={`sync sync-${tone}`} onClick={() => void sync()} title="Toucher pour synchroniser">
      {label}
    </button>
  );
}

function decrire(op: Operation): string {
  switch (op.kind) {
    case 'entrainement':
      return `Entraînement du ${op.data.date}`;
    case 'supprimer-entrainement':
      return 'Suppression d’un entraînement';
    case 'parcours':
    case 'supprimer-parcours':
      return 'Changement de niveau';
    case 'reprise':
      return op.data.kind === 'boucle' ? 'Boucle' : 'Mini-boucle';
    case 'exercice-actuel':
      return `Exercice actuel ${op.data.exercice}`;
    case 'programme-actuel':
      return 'Changement de programme';
    case 'note':
      return `Note sur ${op.data.exercice}`;
    case 'ajustement':
    case 'supprimer-ajustement':
      return 'Ajustement d’une consigne';
    case 'reglages':
      return 'Réglages';
  }
}

/** The app and the server speak different API versions: changes stay on the phone until one is updated. */
function VersionBanner() {
  const { versionMismatch, outbox } = useStore();
  if (!versionMismatch) return null;
  const garde = outbox.length > 0 ? ' Vos modifications restent sur le téléphone en attendant.' : '';
  return (
    <p className="banner banner-warn" role="alert">
      {versionMismatch === 'app'
        ? `Mettez l’application à jour : elle n’est plus compatible avec le serveur.${garde}`
        : `Le serveur n’est pas encore à jour pour cette version de l’application.${garde}`}
    </p>
  );
}

function RejectedBanner() {
  const { rejected } = useStore();
  if (rejected.length === 0) return null;
  return (
    <div className="banner banner-error" role="alert">
      <p>{rejected.length === 1 ? 'Une modification a été refusée par le serveur :' : `${rejected.length} modifications ont été refusées par le serveur :`}</p>
      <ul>
        {rejected.map(({ op, reason }, i) => (
          <li key={i}>
            {decrire(op)} : {reason}
          </li>
        ))}
      </ul>
      <button type="button" className="button button-small" onClick={() => void dismissRejected()}>
        OK
      </button>
    </div>
  );
}

export function NeedsConnection() {
  const { reachable } = useStore();
  if (reachable) return null;
  return <p className="banner banner-warn">Nécessite une connexion au serveur.</p>;
}

export function NotFound({ what }: { what: string }) {
  return (
    <Layout title="Introuvable" back="/">
      <p className="empty">{what} introuvable.</p>
    </Layout>
  );
}

/** A big − value + control, sized for a thumb mid-workout. */
export function Stepper({ value, onChange, min = 0, step = 1, format }: { value: number; onChange: (v: number) => void; min?: number; step?: number; format?: (v: number) => string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Moins" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <output>{format ? format(value) : value}</output>
      <button type="button" aria-label="Plus" onClick={() => onChange(value + step)}>
        +
      </button>
    </div>
  );
}
