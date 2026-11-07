import { useEffect, useState } from 'react';
import { createStore, del, get, keys, set } from 'idb-keyval';
import type { ImageExercice } from '../shared/methode.ts';
import { serverUrl } from './server.ts';

// Exercice pictures kept in the app's own storage, so they show offline. The Android app has no service worker to
// cache them (ADR 0003), and the browser's cache can be cleared, so both use this.

const store = createStore('tmy-fitness-images', 'images');
const cle = (image: ImageExercice) => `${image.exercice}\n${image.version}`;

/** Where a picture is served; the version makes each upload a new address, so a cached copy never goes stale. */
export function imageUrl(image: ImageExercice): string {
  return serverUrl(`/api/images/${encodeURIComponent(image.exercice)}?v=${encodeURIComponent(image.version)}`);
}

/** Downloads the pictures not kept yet and forgets those replaced or removed. Called while in range of the server. */
export async function garderImages(images: ImageExercice[]): Promise<void> {
  try {
    const voulues = new Set(images.map(cle));
    const gardees = new Set((await keys(store)).map(String));
    for (const k of gardees) if (!voulues.has(k)) await del(k, store);
    for (const image of images) {
      if (gardees.has(cle(image))) continue;
      const res = await fetch(imageUrl(image));
      if (res.ok) await set(cle(image), await res.blob(), store);
    }
  } catch {
    // Out of range or storage refused: the next sync tries again.
  }
}

/** The picture's address for an <img>: the kept copy when there is one, otherwise the server. */
export function useImageSrc(image: ImageExercice): string {
  const [src, setSrc] = useState(() => imageUrl(image));
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    void get<Blob>(cle(image), store)
      .then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [image.exercice, image.version]);
  return src;
}
