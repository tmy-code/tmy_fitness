import { useEffect, useState } from "react";
import { NeedsConnection } from "./components.tsx";
import type { ImageExercice, Methode } from "../shared/methode.ts";
import { useImageSrc } from "./image-cache.ts";
import { codeDepuisNom, descriptionExercice } from "./lookup.ts";
import { isAndroidApp } from "./native.ts";
import { online, useStore } from "./store.ts";

/** The picture uploaded for an Exercice, if any. */
export function useImage(exercice: string) {
  return useStore().view?.images.find((i) => i.exercice === exercice) ?? null;
}

/** The Exercice's picture; a tap shows it full screen, another tap closes it. */
export function PhotoExercice({
  exercice,
  petite = false,
}: {
  exercice: string;
  petite?: boolean;
}) {
  const image = useImage(exercice);
  return image ? (
    <Photo key={image.version} image={image} petite={petite} />
  ) : null;
}

/** The Exercice's description, folded away until asked for; nothing when the Méthode has none. */
export function DescriptionExercice({
  methode,
  exercice,
}: {
  methode: Methode;
  exercice: string;
}) {
  const texte = descriptionExercice(methode, exercice);
  if (!texte) return null;
  return (
    <details className="description-exercice">
      <summary>Description</summary>
      <p>{texte}</p>
    </details>
  );
}

function Photo({ image, petite }: { image: ImageExercice; petite: boolean }) {
  const { exercice } = image;
  const [grande, setGrande] = useState(false);
  const src = useImageSrc(image);
  return (
    <>
      <button
        type="button"
        className={`photo ${petite ? "photo-petite" : ""}`}
        onClick={() => setGrande(true)}
        aria-label={`Agrandir l’image de ${exercice}`}
      >
        <img src={src} alt={`Image de ${exercice}`} loading="lazy" />
      </button>
      {grande ? (
        <button
          type="button"
          className="photo-plein-ecran"
          onClick={() => setGrande(false)}
          aria-label="Fermer l’image"
        >
          <img src={src} alt={`Image de ${exercice}`} />
        </button>
      ) : null}
    </>
  );
}

/** Pictures for several Exercices at once: each file is named after its Exercice code (A16.jpg, B3_B.jpg). Desktop only. */
export function ImporterImages({ methode }: { methode: Methode }) {
  const { reachable } = useStore();
  const [busy, setBusy] = useState(false);
  const [rapport, setRapport] = useState<
    { ok: boolean; texte: string }[] | null
  >(null);
  if (isAndroidApp) return null;

  async function importer(files: File[]) {
    setBusy(true);
    setRapport(null);
    const codes = methode.exercices.map((e) => e.code);
    const lignes: { ok: boolean; texte: string }[] = [];
    for (const file of files) {
      const code = codeDepuisNom(file.name, codes);
      if (!code) {
        lignes.push({
          ok: false,
          texte: `⚠ ${file.name} : aucun exercice de ce nom`,
        });
        continue;
      }
      try {
        await online(
          "PUT",
          `/api/images/${encodeURIComponent(code)}`,
          await reduire(file),
        );
        lignes.push({ ok: true, texte: `${code} ✓` });
      } catch {
        lignes.push({ ok: false, texte: `⚠ ${code} : échec, réessayez` });
      }
    }
    setRapport(lignes);
    setBusy(false);
  }

  return (
    <div className="form">
      <label
        className={`button button-block ${busy || !reachable ? "disabled" : ""}`}
      >
        {busy ? "Envoi…" : "Importer plusieurs images"}
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={busy || !reachable}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void importer(files);
          }}
        />
      </label>
      <p className="muted small">
        Le nom de chaque fichier est le code de l’exercice : A16.jpg, E6.png,
        B3_B.jpg pour B3/B.
      </p>
      {!reachable ? (
        <p className="muted small">
          Connectez-vous au serveur pour envoyer des images.
        </p>
      ) : null}
      {rapport ? (
        <ul className="small">
          {rapport.map((l) => (
            <li key={l.texte}>{l.texte}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Change an Exercice's name and description, or go back to the Méthode file's. Desktop only, like the pictures; saved on the server. */
export function EditerExercice({
  methode,
  exercice,
}: {
  methode: Methode;
  exercice: string;
}) {
  const { reachable } = useStore();
  const nomEnregistre =
    methode.exercices.find((x) => x.code === exercice)?.nom ?? "";
  const descriptionEnregistree = descriptionExercice(methode, exercice) ?? "";
  const [nom, setNom] = useState(nomEnregistre);
  const [texte, setTexte] = useState(descriptionEnregistree);
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<
    "ok" | "erreur" | "erreur-retour" | "retour" | null
  >(null);
  const [confirmer, setConfirmer] = useState(false);
  // After a save or a return to the file's version, the boxes follow the server; the banner stays.
  useEffect(() => {
    setNom(nomEnregistre);
    setTexte(descriptionEnregistree);
  }, [nomEnregistre, descriptionEnregistree]);
  if (isAndroidApp) return null;

  const path = `/api/exercices/${encodeURIComponent(exercice)}`;
  const inchange =
    nom.trim() === nomEnregistre && texte.trim() === descriptionEnregistree;

  async function lancer(action: () => Promise<unknown>, fait: "ok" | "retour") {
    setBusy(true);
    setResultat(null);
    setConfirmer(false);
    try {
      await action();
      setResultat(fait);
    } catch {
      // The typed text stays in the boxes so nothing is lost.
      setResultat(fait === "ok" ? "erreur" : "erreur-retour");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <label className="field-label" htmlFor={`nom-${exercice}`}>
        Nom
      </label>
      <input
        id={`nom-${exercice}`}
        type="text"
        maxLength={100}
        required
        value={nom}
        onChange={(e) => {
          setNom(e.target.value);
          setResultat(null);
        }}
      />
      <label className="field-label" htmlFor={`description-${exercice}`}>
        Description
      </label>
      <textarea
        id={`description-${exercice}`}
        rows={5}
        maxLength={2000}
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          setResultat(null);
        }}
      />
      <p className="muted small">
        Si vous laissez la description vide, aucune description ne sera
        affichée.
      </p>
      <div className="row-actions">
        <button
          type="button"
          className="button"
          disabled={busy || !reachable || nom.trim() === "" || inchange}
          onClick={() =>
            void lancer(
              () =>
                online("PUT", path, {
                  ...(nom.trim() !== nomEnregistre ? { nom } : {}),
                  ...(texte.trim() !== descriptionEnregistree
                    ? { description: texte }
                    : {}),
                }),
              "ok",
            )
          }
        >
          {busy ? "Envoi…" : "Enregistrer"}
        </button>
      </div>
      {nom.trim() === "" ? (
        <p className="muted small">Le nom ne peut pas être vide.</p>
      ) : null}
      {confirmer ? (
        <div className="banner banner-warn">
          <p>Vos modifications de nom et de description seront perdues.</p>
          <div className="row-actions">
            <button
              type="button"
              className="button"
              autoFocus
              onClick={() => setConfirmer(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={busy}
              onClick={() =>
                void lancer(() => online("DELETE", path), "retour")
              }
            >
              {busy ? "Rétablissement…" : "Revenir à la version du fichier"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="button button-danger"
          disabled={busy || !reachable}
          onClick={() => setConfirmer(true)}
        >
          Revenir à la version du fichier
        </button>
      )}
      {!reachable ? (
        <p className="muted small">
          Connectez-vous au serveur pour enregistrer.
        </p>
      ) : null}
      {resultat === "ok" ? (
        <p className="banner banner-ok">Enregistré ✓</p>
      ) : null}
      {resultat === "retour" ? (
        <p className="banner banner-ok">Version du fichier rétablie ✓</p>
      ) : null}
      {resultat === "erreur-retour" ? (
        <p className="banner banner-error">
          Retour à la version du fichier impossible. Vérifiez la connexion au
          serveur (Wi-Fi ou Tailscale), puis réessayez.
        </p>
      ) : null}
      {resultat === "erreur" ? (
        <p className="banner banner-error">
          Non enregistré. Vérifiez la connexion au serveur (Wi-Fi ou Tailscale),
          puis réessayez.
        </p>
      ) : null}
    </div>
  );
}

// Phone photos are several megabytes; this size keeps text in a photographed page readable.
const COTE_MAX = 1600;

/** Shrinks a photo to a JPEG before sending, so it uploads quickly and fits the phone's cache. */
async function reduire(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const echelle = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * echelle);
  canvas.height = Math.round(bitmap.height * echelle);
  const ctx = canvas.getContext("2d")!;
  // A transparent PNG would turn black as a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image illisible"))),
      "image/jpeg",
      0.85,
    ),
  );
}

/** Add, replace or remove an Exercice's picture. Desktop only: the Android app just shows the pictures. */
export function GererImage({ exercice }: { exercice: string }) {
  if (isAndroidApp) return null;
  return <GererImageBureau exercice={exercice} />;
}

function GererImageBureau({ exercice }: { exercice: string }) {
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
      setMessage(error instanceof Error ? error.message : "Échec");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <NeedsConnection />
      <div className="row-actions">
        <label
          className={`button button-small ${busy || !reachable ? "disabled" : ""}`}
        >
          {busy ? "Envoi…" : image ? "Remplacer l’image" : "Ajouter une image"}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busy || !reachable}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void run(
                  async () => online("PUT", path, await reduire(file)),
                  "Image enregistrée ✓",
                );
            }}
          />
        </label>
        {image ? (
          <button
            type="button"
            className="button button-small"
            disabled={busy || !reachable}
            onClick={() => {
              if (confirm(`Supprimer l’image de ${exercice} ?`))
                void run(() => online("DELETE", path), "Image supprimée");
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
