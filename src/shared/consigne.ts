import type { Carnet } from './carnet.ts';
import type { Consigne } from './methode.ts';

/** A Consigne as the trainee follows it: the Méthode's version with their own Ajustement applied on top. */
export function consigneEffective(consigne: Consigne, carnet: Carnet): Consigne {
  const a = carnet.ajustements.find((x) => x.consigne === consigne.id);
  if (!a) return consigne;
  return {
    ...consigne,
    series: a.series ?? consigne.series,
    rythme: a.rythme ?? consigne.rythme,
    increment: a.increment ?? consigne.increment,
    note: a.note ?? consigne.note,
  };
}

/** The Exercice the trainee currently does for a Consigne: their choice, or the one the book names. */
export function exerciceActuel(consigne: Consigne, carnet: Carnet): string {
  return carnet.exercicesActuels.find((x) => x.consigne === consigne.id)?.exercice ?? consigne.exercice;
}

/** Starting répétitions when arriving on a step of the Progression that sets its own. */
export function departEtape(consigne: Consigne, exercice: string): number[] | undefined {
  return consigne.progression?.find((e) => e.exercice === exercice)?.depart;
}
