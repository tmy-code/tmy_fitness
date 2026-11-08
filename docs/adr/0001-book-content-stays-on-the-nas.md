---
status: accepted
---

# Book content stays on the NAS, never in the repo or image

The app needs the book's Niveaux, Séances, Programmes, Consignes and Routines de souplesse to show today's Entraînement, but *Access Autonomy* is marked "reproduction et diffusion interdites" and this repository (and the container image built from it) is public. So the transcribed content lives only in a private data file in the app's data folder on the NAS, loaded at runtime and cached on the phone; it is never committed, never baked into the image, and never used as test fixtures. Exercices are shown by a short name written in our own words plus the book's page reference — the book's descriptions and photos are not copied into the repository. An Exercice may carry a `description` the owner writes in their own words; like the rest of the Méthode it lives only in the private file and the NAS, and the demo Méthode uses a made-up one. The desktop app can edit a description, which changes the NAS copy only; the app warns before a reload of the file would replace edited descriptions, and offers the current Méthode as a download.

## Considered Options

- **Private repository holding the content** — rejected: the NAS pulls the public image without a stored token (as TMY Garage does), and a private repo still keeps a copy of the book in a third-party service.
- **Trainee types everything in through the app** — rejected as the main route: Consignes with Progressions and per-Série targets are slow and error-prone to enter on a phone. A small edit screen covers tweaks instead.

## Consequences

- Tests and demos use made-up Niveaux and Exercices, never real book content.
- Adding a new Niveau or routine means transcribing it into the NAS data file, not shipping a release.
- Once anything from the book is pushed to the public repo it cannot be truly withdrawn, so this rule is checked before every commit.
