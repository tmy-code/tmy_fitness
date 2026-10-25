import type { Cible } from '../shared/methode.ts';

/** Today's date on the phone, as YYYY-MM-DD in local time. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(`${iso}T12:00:00`));
}

/** 90 → "1 min 30", 45 → "45 s". */
export function formatDuree(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${String(s).padStart(2, '0')}`;
}

/** A countdown display: 75 → "1:15". */
export function formatChrono(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatCible(cible: Cible): string {
  if (cible.type === 'reps') return `${cible.n} rép.`;
  if (cible.type === 'max') return 'max';
  return formatDuree(cible.secondes);
}

/** A Série's number in its unit: répétitions, or a duration for timed Séries. */
export function formatValeur(cible: Cible, value: number | null): string {
  if (value === null) return '—';
  return cible.type === 'duree' ? formatDuree(value) : String(value);
}

export function pluriel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
