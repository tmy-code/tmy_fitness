import { Layout, NotFound } from './components.tsx';
import { AccueilPage } from './pages/Accueil.tsx';
import { CarnetDetail, CarnetPage } from './pages/Carnet.tsx';
import { ConsignePage } from './pages/Consigne.tsx';
import { EntrainementPage } from './pages/Entrainement.tsx';
import { BouclePage, NiveauxPage } from './pages/Niveaux.tsx';
import { ProgresPage } from './pages/Progres.tsx';
import { AjusterPage, ReglagesPage } from './pages/Reglages.tsx';
import { RoutineRun, SouplessePage } from './pages/Souplesse.tsx';
import { TestRun, TestsPage } from './pages/Tests.tsx';
import { useRoute } from './router.ts';
import { sync, useStore } from './store.ts';

export function App() {
  const { view, loaded, reachable, syncing } = useStore();
  const route = useRoute();

  if (!loaded) return null;
  if (!view) {
    return (
      <Layout title="TMY Fitness">
        <div className="empty">
          {syncing ? (
            <p>Chargement…</p>
          ) : (
            <>
              <p>{reachable ? 'Chargement…' : 'Serveur injoignable.'}</p>
              <p className="muted">L’application doit être ouverte une première fois avec une connexion au serveur.</p>
              <button type="button" className="button" onClick={() => void sync()}>
                Réessayer
              </button>
            </>
          )}
        </div>
      </Layout>
    );
  }

  const { methode, carnet } = view;
  const [section, id] = route;

  if (section === undefined || !methode) return <AccueilPage methode={methode} carnet={carnet} />;
  if (section === 'entrainement') return <EntrainementPage methode={methode} carnet={carnet} />;
  if (section === 'tests') return id ? <TestRun methode={methode} carnet={carnet} testId={id} /> : <TestsPage methode={methode} carnet={carnet} />;
  if (section === 'niveaux') return <NiveauxPage methode={methode} carnet={carnet} />;
  if (section === 'boucle' && id) return <BouclePage methode={methode} carnet={carnet} niveauId={id} />;
  if (section === 'consigne' && id) return <ConsignePage methode={methode} carnet={carnet} consigneId={id} />;
  if (section === 'progres') return <ProgresPage methode={methode} carnet={carnet} />;
  if (section === 'carnet') return id ? <CarnetDetail key={id} methode={methode} carnet={carnet} id={id} /> : <CarnetPage methode={methode} carnet={carnet} />;
  if (section === 'souplesse') return id ? <RoutineRun methode={methode} routineId={id} /> : <SouplessePage methode={methode} carnet={carnet} />;
  if (section === 'reglages') return <ReglagesPage methode={methode} carnet={carnet} />;
  if (section === 'ajuster' && id) return <AjusterPage key={id} methode={methode} carnet={carnet} consigneId={id} />;
  return <NotFound what="Page" />;
}
