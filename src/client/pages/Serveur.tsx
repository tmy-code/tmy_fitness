import { useState } from 'react';
import { Layout } from '../components.tsx';
import { connecterServeur, useStore } from '../store.ts';

/** Where the Android app finds the server: typed once, kept on the phone (ADR 0003). */
export function AdresseServeur({ onDone }: { onDone?: () => void }) {
  const { serveur } = useStore();
  const [adresse, setAdresse] = useState(serveur || 'https://');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function valider() {
    setBusy(true);
    setMessage(null);
    try {
      await connecterServeur(adresse);
      onDone?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        void valider();
      }}
    >
      <label className="field">
        <span className="field-label">Adresse du serveur</span>
        <input
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://nas.exemple.ts.net:8443"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
      </label>
      <p className="muted small">La même adresse que dans le navigateur, avec Tailscale connecté sur le téléphone.</p>
      <button type="submit" className="button button-primary button-block" disabled={busy || !/^https?:\/\/.+/.test(adresse.trim())}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
      {message ? <p className="banner banner-warn">{message}</p> : null}
    </form>
  );
}

/** First launch of the Android app: nothing works until the server is known. */
export function PremierLancement() {
  return (
    <Layout title="_fitness">
      <section className="card">
        <h2>Bienvenue</h2>
        <p className="muted">Indiquez une fois l’adresse de votre serveur. Ensuite, l’application fonctionne aussi hors ligne.</p>
        <AdresseServeur />
      </section>
    </Layout>
  );
}
