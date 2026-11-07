# TMY Fitness

## Docs: read only what the task needs

| Doc | Read when |
|---|---|
| [CONTEXT.md](CONTEXT.md) | Writing code, API names or screen text (glossary) |
| [docs/adr/](docs/adr/) | Changing what is stored where (book content), the single-trainee offline model or the Android app |
| [docs/deploy.md](docs/deploy.md) | Installing or updating on the NAS |

The app is French only and uses the glossary's terms on screen; code uses the same terms without accents (`niveau`, `seance`, `entrainement`).

Naming: the project, package, container and NAS folder are snake_case (`tmy_fitness`); files are kebab-case (`test-helpers.ts`), except React component files in PascalCase (`Accueil.tsx`) and upper-case docs (`CONTEXT.md`).

## This repository is public: no book content and no personal data, ever

The owner is not technical and relies on these rules being followed in every commit.

- **No content from *Access Autonomy*** (ADR 0001): no transcribed Niveaux, Séances, Programmes, Consignes, Tests, routines, exercise descriptions, photos or page images, not even in tests or fixtures. Tests and the dev server use the made-up Méthode in [demo/](demo/). The real Méthode file lives in the git-ignored `private/` folder and on the NAS only. Exercise names shown in the app are written in our own words.
- **No personal data**: no names, emails, real training history or Carnet exports. Use obviously fake values.
- **No infrastructure details or secrets in code**: server hostnames (including the Tailscale address), tokens and passwords come from environment variables set on the NAS. Document new variables in `.env.example` with placeholder values only.
- **Runtime data stays out of git**: the SQLite database, backups and `private/` are ignored by `.gitignore`. Never weaken those ignore rules.
- **Before every commit**, check the staged diff for anything above. If book content or personal data was ever committed, stop and tell the owner — deleting the file does not remove it from git history.

## Android app

The phone uses a sideloaded Android app (ADR 0003): Capacitor wraps the same React screens, bundled in the APK. Android-only behaviour lives in `src/client/native.ts`; the server's address is typed on first launch (`src/client/server.ts`) and never written in the repo.

- Build: `npm run build:android` (screens into `dist/android`, then `cap sync`), then `./gradlew assembleDebug` in `android/` with `JAVA_HOME` on a **JDK 21** (Android Studio's bundled Java is too new for this Gradle).
- Test on the owner's phone over USB with `adb`; the emulator needs a Windows hypervisor that is not enabled. `CAP_ALLOW_HTTP=1` at sync time lets a debug build reach the dev server over plain HTTP; never for a release.
- Bump `API_VERSION` in `src/shared/api-version.ts` whenever a change to `/api` would break an older app.
