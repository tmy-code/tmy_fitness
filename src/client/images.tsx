import { useState } from 'react';
import { NeedsConnection } from './components.tsx';
import type { ImageExercice } from '../shared/methode.ts';
import { useImageSrc } from './image-cache.ts';
import { online, useStore } from './store.ts';

/** The picture uploaded for an Exercice, if any. */
export function useImage(exercice: string) {
  return useStore().view?.images.find((i) => i.exercice === exercice) ?? null;
}

/** The Exercice's picture; a tap shows it full screen, another tap closes it. */
export function PhotoExercice({ exercice, petite = false }: { exercice: string; petite?: boolean }) {
  const image = useImage(exercice);
  return image ? <Photo key={image.version} image={image} petite={petite} /> : null;
}

function Photo({ image, petite }: { image: ImageExercice; petite: boolean }) {
  const { exercice } = image;
  const [grande, setGrande] = useState(false);
  const src = useImageSrc(image);
  return (
    <>
      <button type="button" className={`photo ${petite ? 'photo-petite' : ''}`} onClick={() => setGrande(true)} aria-label={`Agrandir l’image de ${exercice}`}>
        <img src={src} alt={`Image de ${exercice}`} loading="lazy" />
      </button>
      {grande ? (
        <button type="button" className="photo-plein-ecran" onClick={() => setGrande(false)} aria-label="Fermer l’image">
          <img src={src} alt={`Image de ${exercice}`} />
        </button>
      ) : null}
    </>
  );
}

// Phone photos are several megabytes; this size keeps text in a photographed page readable.
const COTE_MAX = 1600;

/** Shrinks a photo to a JPEG before sending, so it uploads quickly and fits the phone's cache. */
async function reduire(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * echelle);
  canvas.height = Math.round(bitmap.height * echelle);
  const ctx = canvas.getContext('2d')!;
  // A transparent PNG would turn black as a JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image illisible'))), 'image/jpeg', 0.85));
}

/** Add, replace or remove an Exercice's picture. Needs a connection: pictures are kept on the server. */
export function GererImage({ exercice }: { exercice: string }) {
  const image = useImage(exercice);
  const { reachable } = useStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const path = `/api/images/${encodeURIComponent(exercice)}`;

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <NeedsConnection />
      <div className="row-actions">
        <label className={`button button-small ${busy || !reachable ? 'disabled' : ''}`}>
          {busy ? 'Envoi…' : image ? 'Remplacer l’image' : 'Ajouter une image'}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busy || !reachable}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void run(async () => online('PUT', path, await reduire(file)), 'Image enregistrée ✓');
            }}
          />
        </label>
        {image ? (
          <button
            type="button"
            className="button button-small"
            disabled={busy || !reachable}
            onClick={() => {
              if (confirm(`Supprimer l’image de ${exercice} ?`)) void run(() => online('DELETE', path), 'Image supprimée');
            }}
          >
            Supprimer
          </button>
        ) : null}
      </div>
      {message ? <p className="small">{message}</p> : null}
    </div>
  );
}
