# Puffx LifeTrack (current app: Din)

A private, self-hostable personal life management and tracking application. The repository currently contains an early **browser-only journal prototype** named Din. It is not yet the full authenticated, database-backed Puffx LifeTrack product.

## Current implementation status

Verified in the current source:

- Static HTML, CSS, and vanilla JavaScript; no build step or package installation.
- Hindi and English interface.
- Daily entries and chronological/searchable history for meals, workouts, medicine self-reports, plans, tasks, and notes; mood selection.
- Day navigation and basic future-date/time blocking; past-dated entry creation or edits require an on-screen confirmation.
- Seven-day entry-count chart, category totals, month activity dots, and day summary.
- JSON backup download and restore.
- Browser `localStorage` persistence and a static-asset service worker.

Not implemented yet: accounts, server/API, database, multi-device sync, app-level encryption, recurring habit or medicine schedules/reminders, structured water/sleep/metrics, full calendar/appointments, yearly insights, immutable correction/audit history, automated tests, or automated backup storage. See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) for the repository audit, proposed architecture/schema/security rules, and staged roadmap.

## Privacy and data storage

Journal entries are stored in the current browser profile's `localStorage`; this app does not upload them to a LifeTrack server. They are not encrypted by the app, are not shared across devices, and may be lost if browser data is cleared. Export JSON backups and store them somewhere private. The static app loads Google Fonts, so the browser makes font requests to Google; this prototype should not be described as having zero third-party network requests. Do not put personal entries or backups in this public source repository.

## Run locally

Open `index.html` in a modern browser, or run:

```sh
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## GitHub Pages

The repository includes `.github/workflows/pages.yml`, which deploys the static root when the `main` branch changes or the workflow is manually run. Configure **Settings → Pages → Build and deployment → GitHub Actions** before expecting deployment to succeed. Pages serves a public static application; it does not provide private accounts or server-side data storage.

## Project plan

See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) before implementation work. The database and backend described there are proposals, not code currently in this repository.

## License

MIT. See [LICENSE](LICENSE).
