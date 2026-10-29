# Dayora repository audit

**Repository:** `puffxhost/din-life-tracker`  
**Audit scope:** all tracked application, documentation, workflow, and license files present during the Dayora identity migration.  
**Verification:** source inspection and the automated Node test suite. Findings below distinguish confirmed defects from risks and missing capabilities.

## Confirmed implementation

- `index.html`, `styles.css`, and `app.js` implement a responsive Hindi/English journal UI with Today dashboard, a daily timeline, categories, mood, history search/filter, basic insights, editing and deletion controls, and JSON backup controls.
- `core/event-system.js`, `server.js`, and `db.js` implement UTC timestamp normalization, IANA timezone validation, event-state validation, historical confirmation, a token-protected single-owner API, SQLite persistence, database constraints, and append-only correction audit records.
- `manifest.webmanifest`, `icon.svg`, `sw.js`, and `.github/workflows/pages.yml` implement static PWA metadata, an icon, offline asset caching, and Pages deployment.
- `tests/event-system.test.js` and `tests/server.test.js` cover event rules and API/database behavior. CI checks are now defined in `.github/workflows/ci.yml`.
- `LICENSE` is MIT. `.env.example` and `.gitignore` document and protect local configuration, SQLite files, and secrets.

## Findings

| Priority | Finding | Evidence | Status |
|---|---|---|---|
| P1 | Before this change, malformed journal JSON was caught and displayed as an empty journal. A subsequent save could overwrite the unreadable data. | `readState()` previously caught every parse error and returned empty state; no recovery copy or error was shown. | Fixed: storage migration blocks writes when the active key is unreadable and retains the old key. |
| P1 | Before this change, importing any JSON with an `entries` array replaced the whole journal without validating individual records, duplicate IDs, mood values, or asking for replacement confirmation. | Previous `importData()` assigned `state` directly from parsed JSON then saved. | Fixed: validate schema/records, reject bad values and duplicates, confirm replacement, and only report success after save. Din v1 remains supported. |
| P1 | Weekly/monthly counts and history date headings used the saved local date even when the record timestamp is displayed in the user's newly configured timezone. | `localParts()` already derived the display date from UTC and the current IANA timezone, while the chart and history code read `entry.date`. | Fixed: timeline, history headings, recent counts, and month activity now group records by their UTC instant in the current timezone. |
| P1 | The app had no automated CI workflow despite having tests. | `.github/workflows/` previously contained only `pages.yml`. | Fixed: CI runs syntax checks and tests on pushes and pull requests. |
| P2 | Product branding was split between Din UI, Puffx LifeTrack documentation, Din PWA metadata/cache names, and the original repository identity. | Verified references in `index.html`, `manifest.webmanifest`, `sw.js`, README, plan, package metadata, and Pages workflow. | Fixed for user-facing product references. The repository URL and Din backup/storage identifiers remain for compatibility. |
| P2 | Local browser records are not automatically transferred to the authenticated SQLite API; connected server records are cached in localStorage. | `loadApiEntries()` merges server records into the browser state; no server import/export migration route exists. | Open limitation; documented in README and plan. |
| P2 | API authentication is a single configured bearer token and owner ID, not account-based authentication or multi-user isolation. | `server.js` reads `LIFETRACK_API_TOKEN` and `LIFETRACK_USER_ID`; no user/session tables or login flow exist. | Open limitation; do not present this as multi-user SaaS. |
| P2 | The UI provides only basic recent-entry insights. It does not implement dedicated habit recurrence, structured workouts, nutrition, sleep/water/metrics, medicine schedules, trips/calendar, or yearly analytics. | Inspected `index.html`, `app.js`, and current SQLite event schema. | Open product scope, staged in `docs/PROJECT_PLAN.md`. |
| P2 | The service worker caches static app assets only; private event data is fetched from the API without caching. Browser-only journal contents are stored in localStorage, which is not encrypted by this app. | `sw.js` skips `/api/`; `app.js` uses localStorage. | Expected current boundary; document it clearly and keep server deployment behind HTTPS. |
| Enhancement | The interface and timeline interactions need a dedicated accessibility and device-level QA pass, including keyboard focus behavior and responsive checks on actual mobile browsers. | Source review shows modal/nav handlers and responsive CSS, but no browser automation or accessibility audit is present. | Not yet verified. |

## Data migration and recovery

- Old journal key: `din.life-tracker.v1`; current key: `dayora.life-tracker.v1`. Migration copies old records once and keeps the original key intact. If both have data, current Dayora entries win for matching IDs and Dayora moods win for matching dates; non-conflicting old values are retained.
- Language preference migrates from `din.language` to `dayora.language`. The tab-scoped API token migrates to `dayora.api.token` in sessionStorage.
- Din v1 JSON backups remain importable. The importer rejects malformed dates, invalid categories/states, conflicting timestamps, duplicate IDs, malformed mood records, future events without planned state, and historical records lacking a recorded confirmation. Unknown legacy state is preserved as `unknown` rather than guessed as missed or failed.
- Old browser keys and original backup files are not automatically deleted.

## Remaining risks and recommended next steps

1. Add a versioned SQLite migration mechanism before changing persisted server schemas.
2. Design a user-reviewed, preview-first transfer from browser journals to the server API.
3. Add explicit export/restore tests with representative actual legacy fixtures; current tests use constructed fixtures.
4. Add browser-level accessibility, keyboard, responsive, PWA offline-upgrade, and storage-quota tests.
5. Consider real account authentication and per-user isolation only as a separately designed and tested phase.
6. Verify operator backups/restores, HTTPS termination, secret rotation, and server filesystem permissions before public self-hosting.

## Repository inventory reviewed

`.env.example`, `.gitignore`, `.nojekyll`, `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `LICENSE`, `README.md`, `app.js`, `core/backup.js`, `core/event-system.js`, `core/storage-migration.js`, `db.js`, `docs/AUDIT.md`, `docs/PROJECT_PLAN.md`, `icon.svg`, `index.html`, `manifest.webmanifest`, `package.json`, `server.js`, `styles.css`, `sw.js`, `tests/backup.test.js`, `tests/event-system.test.js`, `tests/server.test.js`, and `tests/storage-migration.test.js`.
