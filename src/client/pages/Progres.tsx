import { useState, type PointerEvent } from 'react';
import type { Carnet } from '../../shared/carnet.ts';
import { enSecondes, type Methode } from '../../shared/methode.ts';
import { dureesParcours, exercicesPratiques, marqueursReprise, progresExercice, type PointProgres } from '../../shared/progres.ts';
import { Layout } from '../components.tsx';
import { formatDate, pluriel, todayIso } from '../format.ts';
import { indexConsignes, nomExercice } from '../lookup.ts';

export function ProgresPage({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  const exercices = exercicesPratiques(carnet.entrainements);
  const [exercice, setExercice] = useState(exercices[0] ?? '');
  // Results are seconds when the Exercice was done for a Consigne whose Séries are all timed.
  const lieux = indexConsignes(methode);
  const refs = new Set(carnet.entrainements.flatMap((e) => e.exercices.filter((x) => x.exercice === exercice).map((x) => x.ref)));
  const timed = [...refs].some((ref) => lieux.get(ref)?.consigne.series.every((s) => enSecondes(s.cible)));
  return (
    <Layout title="Progrès" back="/">
      <section>
        <h2>Par exercice</h2>
        {exercices.length === 0 ? (
          <p className="muted">Les graphiques apparaîtront après votre premier entraînement.</p>
        ) : (
          <>
            <select className="button-block" value={exercice} onChange={(e) => setExercice(e.target.value)}>
              {exercices.map((code) => (
                <option key={code} value={code}>
                  {nomExercice(methode, code)}
                </option>
              ))}
            </select>
            <Graphique
              points={progresExercice(exercice, carnet.entrainements)}
              marqueurs={marqueursReprise(exercice, carnet)}
              unite={timed ? 's' : 'rép.'}
              titre={`Total ${timed ? 'tenu (secondes)' : 'de répétitions'} par entraînement`}
            />
          </>
        )}
      </section>
      <Parcours methode={methode} carnet={carnet} />
      <Calendrier carnet={carnet} />
    </Layout>
  );
}

const W = 340;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 32 };

/** A single-series line: total per Entraînement, with Mini-boucle and Boucle markers. Tap a point for its values. */
function Graphique({ points, marqueurs, unite, titre }: { points: PointProgres[]; marqueurs: { date: string; kind: string }[]; unite: string; titre: string }) {
  const [actif, setActif] = useState<number | null>(null);
  if (points.length === 0) return <p className="muted">Pas encore de données.</p>;
  const time = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const t0 = time(points[0]!.date);
  const t1 = Math.max(time(points.at(-1)!.date), t0 + 86_400_000);
  const max = Math.max(...points.map((p) => p.total), 1);
  const yMax = Math.ceil(max / 5) * 5;
  const x = (d: string) => PAD.left + ((time(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const ticks = [0, yMax / 2, yMax];

  function onMove(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best]!.date) - px)) best = i;
    });
    setActif(best);
  }

  const point = actif !== null ? points[actif] : undefined;
  return (
    <figure className="chart">
      <figcaption>{titre}</figcaption>
      <div className="chart-tooltip" aria-live="polite">
        {point ? (
          <>
            <strong>
              {point.total} {unite}
            </strong>{' '}
            · meilleure série {point.meilleure} · {formatDate(point.date)}
          </>
        ) : (
          <span className="muted">Touchez le graphique pour voir les valeurs.</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titre}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {marqueurs.map((m, i) =>
          time(m.date) >= t0 && time(m.date) <= t1 ? (
            <g key={i}>
              <line className="chart-marker" x1={x(m.date)} x2={x(m.date)} y1={PAD.top} y2={H - PAD.bottom} />
              <text className="chart-axis" x={x(m.date) + 3} y={PAD.top + 8}>
                {m.kind === 'boucle' ? 'Boucle' : 'Mini-boucle'}
              </text>
            </g>
          ) : null,
        )}
        <path className="chart-line" d={path} />
        {point ? <line className="chart-crosshair" x1={x(point.date)} x2={x(point.date)} y1={PAD.top} y2={H - PAD.bottom} /> : null}
        {points.map((p, i) => (
          <circle key={i} className="chart-dot" cx={x(p.date)} cy={y(p.total)} r={i === actif ? 6 : 4} />
        ))}
        <text className="chart-axis" x={PAD.left} y={H - 6}>
          {formatDate(points[0]!.date)}
        </text>
        {points.length > 1 ? (
          <text className="chart-axis" x={W - PAD.right} y={H - 6} textAnchor="end">
            {formatDate(points.at(-1)!.date)}
          </text>
        ) : null}
        <rect x={PAD.left} y={0} width={W - PAD.left - PAD.right} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setActif(null)} />
      </svg>
      <details>
        <summary className="small muted">Voir le tableau</summary>
        <table className="series">
          <thead>
            <tr>
              <th>Date</th>
              <th>Total</th>
              <th>Meilleure série</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.date}>
                <td>{formatDate(p.date)}</td>
                <td>{p.total}</td>
                <td>{p.meilleure}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Parcours({ methode, carnet }: { methode: Methode; carnet: Carnet }) {
  const etapes = dureesParcours(carnet, todayIso());
  return (
    <section>
      <h2>Parcours</h2>
      {etapes.length === 0 ? <p className="muted">Aucun Niveau commencé.</p> : null}
      <ol className="timeline">
        {etapes.map((e, i) => (
          <li key={i} className={i === etapes.length - 1 ? 'actuel' : ''}>
            <strong>
              {e.boucle ? 'Boucle · ' : ''}
              {methode.niveaux.find((n) => n.id === e.niveau)?.nom ?? e.niveau}
            </strong>
            <span className="muted small">
              {' '}
              depuis le {formatDate(e.debut)} · {pluriel(e.jours, 'jour', 'jours')}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The last 12 weeks, Monday first: which days had an Entraînement, a Routine de souplesse, or both. */
function Calendrier({ carnet }: { carnet: Carnet }) {
  const kinds = new Map<string, Set<string>>();
  for (const e of carnet.entrainements) {
    if (!e.termine) continue;
    const set = kinds.get(e.date) ?? new Set();
    set.add(e.kind === 'souplesse' ? 'souplesse' : 'entrainement');
    kinds.set(e.date, set);
  }
  const today = new Date(`${todayIso()}T12:00:00`);
  const start = new Date(today);
  start.setDate(start.getDate() - ((today.getDay() + 6) % 7) - 7 * 11);
  const days: string[] = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) days.push(todayIso(d));
  return (
    <section>
      <h2>Calendrier</h2>
      <div className="calendar" role="img" aria-label="Jours d’entraînement des 12 dernières semaines">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={`h${i}`} className="calendar-head">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const k = kinds.get(d);
          const cls = k ? (k.size === 2 ? 'both' : [...k][0]) : '';
          return <span key={d} className={`calendar-day ${cls}`} title={`${formatDate(d)}${k ? ` · ${[...k].join(' + ')}` : ''}`} />;
        })}
      </div>
      <p className="legend small muted">
        <span className="calendar-day entrainement" /> Entraînement <span className="calendar-day souplesse" /> Souplesse
      </p>
    </section>
  );
}
