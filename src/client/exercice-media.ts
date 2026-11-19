import type { Methode } from '../shared/methode.ts';
import { online } from './store.ts';

// The changes that need a connection (they never wait in the send queue): pictures, Exercice names and descriptions,
// and the Méthode file. The screens call these by name and never build an API path.

const enc = encodeURIComponent;

/** Sets the picture of an Exercice (already shrunk by the phone). */
export const setImage = (code: string, image: Blob) => online('PUT', `/api/images/${enc(code)}`, image);

export const clearImage = (code: string) => online('DELETE', `/api/images/${enc(code)}`);

/** The owner's own name and/or description; a field left out keeps its current value. */
export const editExercice = (code: string, edits: { nom?: string; description?: string }) => online('PUT', `/api/exercices/${enc(code)}`, edits);

/** Back to the Méthode file's own name and description. */
export const resetExercice = (code: string) => online('DELETE', `/api/exercices/${enc(code)}`);

/** Uploads the private Méthode file (ADR 0001). */
export const loadMethode = (data: Methode) => online('PUT', '/api/methode', data);
