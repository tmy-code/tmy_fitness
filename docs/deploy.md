# Installing and updating on the Synology NAS

TMY Fitness runs next to TMY Garage and Actual Budget on the same NAS, reachable only over Tailscale (ADR 0002).
Nothing here touches those two apps.

## One-time setup

1. **Make the image downloadable.** After the first successful build on GitHub, open
   github.com/tmy-code → *Packages* → *tmy_fitness* → *Package settings* → *Change visibility* → **Public**.
   (GitHub creates container images as private even for a public repository.)
2. **Create the data folder.** In *File Station*, create `docker/tmy_fitness` on `volume1`.
   This is where the database, its automatic backups and the Méthode you load live. Include it in Hyper Backup.
3. **Create the container.** In *Container Manager* → *Project* → *Create*: name it `tmy_fitness`,
   choose the folder above, and paste the contents of [`docker-compose.yml`](../docker-compose.yml).
   Start it. The app now answers on port 3011 of the NAS.
4. **Turn on HTTPS through Tailscale.** The phone app needs HTTPS to install and to work offline.
   Over SSH on the NAS, run (8444 is a free port; Actual uses the default one and TMY Garage uses 8443):

   ```bash
   tailscale serve --bg --https=8444 http://localhost:3011
   ```

   This only adds a new address; the existing ones keep working.
   The app is then at `https://<your NAS's Tailscale name>:8444`, from any of your devices on Tailscale.
5. **Add it to the nightly update.** In *Control Panel* → *Task Scheduler*, edit the task that updates TMY Garage
   and Actual Budget every night at 04:00. In *Task Settings* → *Run command*, add one line in the same form as the
   TMY Garage line, with `tmy_fitness` instead of `tmy_garage`. From then on, anything pushed to `main` goes live the
   following night.
6. **Load your Méthode.** On a computer on Tailscale, open the app's address. It shows *Aucune Méthode chargée*:
   choose *Charger un fichier Méthode* and pick your private file (`private/methode.json` in the project folder on
   your PC — never in the repository, see ADR 0001). Later updates of that file go through *Réglages* → *Méthode*.
   Keep a copy of the file in `docker/tmy_fitness` too, so Hyper Backup keeps it.
7. **Install it on your phone.** Open the address in Chrome on Android → *⋮* → *Install app*.
   Open it once with a connection so it stores an offline copy.

## Checking it works

- `https://<your NAS's Tailscale name>:8444/api/health` answers `{"ok":true}`.
- On the phone, during an Entraînement: the screen stays on, and the end of each rest vibrates and beeps
  (turn the phone's media volume up).

## Updating

Updates arrive by themselves with the nightly task. For an immediate update: *Task Scheduler* → select the task →
**Run**, or in *Container Manager* → *Project* → `tmy_fitness` → *Action* → **Stop**, then **Build**.
Your data is in `docker/tmy_fitness`, not in the image, so it is not affected.
Before changing the database structure, the app saves a copy in `docker/tmy_fitness/backups`.

**Rolling back:** every build is also tagged with its commit, e.g. `ghcr.io/tmy-code/tmy_fitness:sha-4a936f9`.
Put that tag instead of `latest` in the project's YAML and build again.
