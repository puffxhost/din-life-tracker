# Dayora by Puffx

**Your Life, Your Timeline.** Dayora is a private personal journal and event tracker by Puffx. The current release provides the Today dashboard, daily timeline, categories, mood notes, history search, summaries, a browser-only mode, and an optional same-origin Node/SQLite API.

## Live demo

[Open Dayora on GitHub Pages](https://puffxhost.github.io/din-life-tracker/)

GitHub Pages is enabled for this repository with **GitHub Actions** as its publishing source. Changes on feature branches appear in the demo after they are merged and the Pages deployment succeeds.

## Current implementation

- The browser UI tracks meal, workout, medicine self-report, plan, task, and note entries; mood; timeline; history; basic charts; and JSON backup/restore.
- New UI entries default to the current local day and time and store an ISO UTC timestamp, together with the IANA timezone used at entry. The UI exposes completed, planned, missed, cancelled, skipped, pending, in-progress, and unknown states.
- Existing `din.life-tracker.v1` browser records migrate idempotently to `dayora.life-tracker.v1`. The original key is retained; where both exist, Dayora entries win on matching IDs and Dayora mood values win on matching dates.
- New exports use the Dayora schema version 2 format. Din v1 backups remain importable after validation and an explicit replacement confirmation. Malformed records, duplicate IDs, invalid dates, invalid state transitions, and unconfirmed historical records are rejected.
- Past entries require a confirmation dialog showing the activity and localized date/time. The record is labelled `user-confirmed`; the app does not claim independent verification.
- `core/event-system.js` provides shared strict timestamp, timezone, state, confirmation, and DST rules.
- `server.js` provides bearer-token-protected `GET /api/events`, `POST /api/events`, `PATCH /api/events/:id`, and `GET /api/audit` endpoints.
- `db.js` creates SQLite tables and triggers that reject future states other than planned or cancelled and unconfirmed historical events, and append immutable audit records for creates and corrections. On startup it migrates older event-state constraints while preserving existing records and audit history.
- Connect from the UI with the server token. The token stays in `sessionStorage` for the current tab. Connected event changes go through API validation; server-loaded events are also cached locally by the existing UI.
- Runtime dependencies are built into Node.js. Node 22.5 or newer is required for `node:sqlite`.

**Important boundary:** The API is a single-owner bearer-token service, not full account management. Existing browser-only entries are not bulk-migrated automatically to the server. The token is tab-scoped, but event data and cached records remain in browser `localStorage`. There are no multi-user accounts, recurring schedules, reminders, water/sleep/metric modules, calendar, or period-based analytics beyond the existing basic charts.

## Run locally

Copy `.env.example` to `.env`, replace the token with a unique random secret (at least 32 characters), then set the environment variables in your shell. The server currently reads environment variables directly; it does not load `.env` automatically.

```powershell
$env:LIFETRACK_API_TOKEN = "replace-with-a-unique-secret-of-at-least-32-characters"
$env:PORT = "3000"
node server.js
```

Open <http://localhost:3000>, then use the connect button and enter the same token. The SQLite database defaults to `./data/lifetrack.sqlite`; `data/`, `.env`, and SQLite files are ignored by Git. For a non-local deployment, put the server behind HTTPS and keep the token private. The API has one configured owner identity by default (`LIFETRACK_USER_ID=owner`); use a unique token and do not expose it in a public webpage.

Example authenticated API call:

```sh
curl -H "Authorization: Bearer $LIFETRACK_API_TOKEN" http://localhost:3000/api/events
```

The API accepts timestamps as strict RFC 3339 strings with `Z` or an explicit numeric offset. Supply a valid IANA timezone and an explicit status. Future events must be `planned`; past events need `historicalConfirmation: true` and a `confirmedAt` timestamp. A past event is labelled `user-confirmed`, not verified.

## Tests

```sh
npm run check
npm test
```

Tests use Node's built-in test runner and temporary SQLite databases; no test service or package installation is required. GitHub Actions runs these checks on pushes and pull requests.

## GitHub Pages

The Pages workflow deploys only the static root UI. GitHub Pages cannot run this Node API or protect journal data. Use the Node server for the authenticated SQLite API; do not treat a Pages deployment as a private server.

## Plan

See [docs/AUDIT.md](docs/AUDIT.md) for inspected files and verified findings, and [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) for architecture, schema, security rules, implementation status, and the staged roadmap.

## License

MIT. See [LICENSE](LICENSE).
