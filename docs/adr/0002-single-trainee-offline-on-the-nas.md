---
status: accepted
---

# Single trainee, offline on the phone, synced to SQLite on the NAS

Everything happens on the phone mid-workout, often without a connection, and the owner wants to keep their data on their own server. We reuse TMY Garage's shape: an installable web app that caches the program and the full Carnet on the phone, records Entraînements locally, and sends finished ones through a queue to a single SQLite file on the Synology NAS, reachable only over Tailscale, with no login. This is safe and simple because there is exactly one trainee and one writing device, so conflicts practically never happen.

## Considered Options

- **Online-only** — rejected: the app must work wherever the trainee trains.
- **Full local-first sync with conflict merging** — rejected: unnecessary for one trainee on one phone.
- **Multiple trainees with logins** — rejected: if someone else wants the app, they get a second copy with its own data folder and port rather than accounts in this one.

## Consequences

- Entraînements recorded on the phone but not yet sent are lost if the phone is wiped before it reconnects.
- No reminders or push notifications: the recommended Fréquence is shown as information only.
- Sharing the app with another trainee would require revisiting the data model, not just adding a login screen.
