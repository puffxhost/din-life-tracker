# Puffx LifeTrack — Project Plan

**Status:** Living plan for `puffxhost/din-life-tracker`. The current branch implements a first date/event API slice; future modules below remain proposals unless explicitly marked implemented.

## Implementation checkpoint: core date/event slice

Implemented on the current working branch:

- `core/event-system.js` is shared by the browser and Node server. It validates explicit RFC 3339 instants, normalizes them to UTC, validates IANA timezones, resolves local times, and rejects nonexistent or ambiguous daylight-saving wall times rather than guessing.
- The existing UI defaults a new entry to the current local date/time, saves UTC timestamps and the timezone, exposes six explicit states, blocks future non-planned entries, requests confirmation for past entries, and labels confirmed history as user-confirmed.
- `server.js` exposes token-protected event read/create/correction and audit endpoints. `db.js` stores UTC instants in SQLite and uses database triggers for future-state and retrospective-confirmation constraints plus immutable audit history.
- `npm test` exercises the shared policy and API/database boundaries.

The static journal UI can connect to the same-origin API using a tab-scoped bearer token; browser-only mode remains available. Existing local-only entries are not bulk-migrated automatically, and connected entries are cached by the UI. The bearer-token setup is a single-owner deployment boundary, not multi-user account management.

## 1. Repository audit (verified)

The original default-branch UI is a small static application, with the core API slice now added on this branch:

- `index.html`: page structure and forms for today, insights, and history.
- `styles.css`: responsive presentation.
- `app.js`: application state, rendering, entry editing, date checks, search, charts, and backup/restore.
- `core/event-system.js`: shared date, time, timezone, event-state, and history-confirmation rules.
- `server.js`, `db.js`: bearer-authenticated Node HTTP API and SQLite schema/constraints/audit triggers.
- `tests/`: built-in Node tests for core date/time behavior and API/database enforcement.
- `manifest.webmanifest`, `icon.svg`, `sw.js`: install metadata and a static-asset service worker.
- `.github/workflows/pages.yml`: deploys the repository root to GitHub Pages on pushes to `main` and manual dispatch.
- `.nojekyll`, `LICENSE`, `README.md`.

The UI remains plain HTML/CSS/JavaScript and has no build step or third-party runtime dependency. Node.js 22.5+ is required for the API's built-in SQLite module. The service worker caches same-origin static assets; it is not a data-sync service.

### What currently works in code

- Hindi/English interface and browser-local language preference.
- Day selection that blocks navigating/logging into future calendar dates, plus a chronological timeline and searchable/filterable history.
- Entries for meals (meal type and free-text amount), workouts (duration and free-text sets/distance), medicine (dose and a taken/skipped choice), plans (place, optional planned date, companions), tasks (done/missed/in progress), and notes.
- Mood selection; editing and deleting entries; a seven-day activity-count chart, category totals, month activity dots, and day summary.
- Past-dated or earlier-today entries prompt for confirmation before save. The UI permits future dates as a plan detail while keeping the plan's recorded date separate.
- JSON export and import from a user-selected file.

These are lightweight journal fields, not dedicated health or scheduling systems. The medicine choice is a self-reported log, with no recurring schedule, reminder, or verification. The charts count recorded entries; they do not measure health outcomes, adherence, or comprehensive daily metrics.

### Gaps and constraints

- Browser-only journal entries and the connected-event cache live in browser `localStorage`; the UI has no app-level encryption at rest. Clearing browser data can remove its cache; export is manual.
- The API uses a single configured bearer token and SQLite, but the browser UI does not yet call it. There is no user registration, multi-account session management, or server-side backup/restore workflow.
- No first-class recurring habits, task schedules, workout plans/exercises/sets, water intake, sleep, structured body metrics, medication schedules, appointment/calendar views, trip lifecycle, reminders, or daily/weekly/monthly/yearly analytics.
- There is no immutable audit history for edits/deletions. Past-entry confirmation is a UI prompt, not a durable audit record; mood changes use a browser confirmation.
- Date checks rely on the browser's current local clock and HTML controls. Imported JSON is only lightly validated. This is not a security boundary or a strict timezone-aware server rule.
- No automated tests or CI quality checks are present. The Pages workflow requires GitHub Pages to be configured for GitHub Actions in repository settings.

## 2. Product goal and architecture

Puffx LifeTrack should become a private, self-hostable personal tracker. Keep the existing browser-only mode usable alongside the authenticated same-origin API while a safe import path is developed.

**Current and target architecture:**

1. Responsive browser client, currently reusing the vanilla UI with browser-only mode and an optional same-origin API connection.
2. A first JSON HTTP API slice in Node's built-in HTTP server with validation and configured-owner scoping. Connected event reads/creates/corrections work in the UI, but there is not yet a versioned API contract or bulk import/migration.
3. SQLite via Node's built-in `node:sqlite` for the current bearer-protected API.
4. If multi-user accounts or concurrent remote users are required, later migrate to session-based identity and a server database such as PostgreSQL.
5. Later self-host deployment should use HTTPS, persistent database volumes, and operator-managed encrypted backups.

The current Node/SQLite choice minimizes dependencies for the single-owner API slice. PostgreSQL, a multi-user identity/session model, and a future normalized production schema remain target options, not current dependencies. Before broadening the backend, confirm the supported deployment target, whether the app is single-owner or multi-account, and whether local-only mode must remain supported.

### Feature modules

- **Capture and timeline:** activity records, day navigation, chronological display, search, categories.
- **Habits and tasks:** definitions, schedules, per-day completion/missed/skipped records.
- **Fitness:** workout sessions, exercises, sets/reps/weight/duration, missed sessions.
- **Nutrition and wellbeing:** meals, water, sleep, configurable personal metrics.
- **Medication:** medication catalog, schedule, user-confirmed taken/skipped/missed logs; no medical advice.
- **Plans and calendar:** appointments, trips, destinations, planned dates, status and calendar views.
- **Insights:** consistent daily/weekly/monthly/yearly aggregates with timezone-aware boundaries.
- **History and corrections:** explicit retroactive confirmation, reason where appropriate, and append-only audit events.
- **Identity and data portability:** authentication, per-user authorization, export, import, backup, restore, and account deletion.

## 3. Proposed database schema

Use UUID primary keys, UTC instants for event/audit timestamps, and `user_id` ownership on all personal records. Store the user's IANA timezone in profile settings; preserve the local date/time context used when an event was entered. The schema below is a starting point for migrations and may be refined with UI/API design.

| Table | Main fields and purpose |
|---|---|
| `users` | Future multi-account target: `id`, normalized unique `email`, `password_hash` (or external identity subject), timezone, created/updated timestamps. Current API is single-owner and uses `LIFETRACK_USER_ID`. |
| `sessions` | Future multi-account target: `id`, `user_id`, hashed session/token reference, expiry, revocation and creation timestamps. Current API uses a configured bearer secret. |
| `events` (implemented SQLite) | `id`, `user_id`, category, title, state, UTC ISO `occurred_at`, matching epoch-ms index value, IANA timezone, historical confirmation, optional completion instant, JSON details, and server timestamps. SQLite triggers enforce timestamp consistency, future/planned and historical-confirmation rules. |
| `audit_events` (implemented SQLite) | Append-only audit snapshots with owner, actor, action, before/after JSON and server creation time. SQLite triggers create these for inserts/updates and block update/delete. |
| `activity_entries` (future normalized target) | Shared timeline: `id`, `user_id`, kind, title, notes, `occurred_at`, local date/time context, created/updated timestamps. |
| `habits` / `habit_schedules` / `habit_logs` | Habit definition, recurrence rules and per-date done/missed/skipped outcome. |
| `tasks` / `task_occurrences` | Task definition and dated status, including missed/in-progress. |
| `workout_sessions` / `workout_exercises` / `workout_sets` | Session time, duration, exercise order, sets/reps/load/distance; supports a missed planned session separately. |
| `meals` / `water_logs` / `sleep_logs` / `metric_definitions` / `metric_logs` | Structured nutrition/water/sleep and user-defined measurements with units and event times. |
| `medications` / `medication_schedules` / `medication_logs` | Medicine name/details, schedule and explicitly user-confirmed taken/skipped/missed records. A schedule is not proof of ingestion. |
| `plans` / `appointments` / `trips` | Planned date/time, place, participants, status and optional links to timeline entries. |
| `audit_events` | Append-only actor, entity, action, before/after snapshots, correction reason, confirmation time, event time and creation time. |
| `export_jobs` (optional) | Only needed if exports become asynchronous; otherwise create a user-authorized streaming export. |

Domain tables should reference the owning user and, where useful, a shared timeline entry. Add foreign keys, check constraints, indexes on `(user_id, occurred_at)` and schedule dates, and uniqueness constraints for per-user definitions. Avoid duplicating a full life record in both a generic JSON blob and normalized tables.

## 4. Date/time and correction rules

- Accept explicit ISO dates and local times; validate calendar dates, time ranges, timezone IDs, and allowed event kinds on the server.
- Store absolute event instants in UTC and retain the IANA timezone/local date context needed to display the user's intended day and handle daylight-saving transitions.
- Reject future actual events using server time. Future plans remain valid because their planned time is distinct from when they were created or completed.
- A past event or a correction to an existing event requires an explicit confirmation step bound to the displayed date/time and intended action. Record the accepted confirmation in `audit_events`.
- Keep original creation metadata and append audit records for edits/deletions; do not silently rewrite history. Permit soft deletion or tombstones so audit context remains coherent.
- Validate imported data with the same schema and ownership rules as normal writes; show a preview and require confirmation before replacing or merging data.

## 5. Security, privacy, and operations

- Scope every read/write by the authenticated `user_id`; never trust a client-supplied owner ID. Add PostgreSQL row-level security as defense in depth where operationally practical.
- Use Argon2id password hashing or a carefully configured external identity provider. Store session secrets only as hashes; use secure, HttpOnly, SameSite cookies, CSRF defenses, login rate limits, and session revocation.
- Enforce HTTPS; validate request bodies; use parameterized queries; apply restrictive CORS and security headers. Keep secrets outside the repository and provide a safe example environment file without values.
- Encrypt database volumes and backups at rest under operator-controlled keys. Document restore drills, retention, account export/deletion, and key rotation. Do not log journal text, medication details, or metric values.
- Treat medication and wellbeing records as sensitive personal data. Do not present logs as clinical advice, adherence verification, or emergency care.
- Keep the source repository free of personal journal entries, backup files, credentials, and real user data. Explain any third-party requests such as fonts/analytics; avoid analytics by default.

## 6. Staged implementation order

1. **Planning baseline:** audit, plan, and truthful README are in place; confirm deployment and account model.
2. **Engineering foundation:** Node package scripts, environment example, ignore rules, and built-in core/API tests now exist. Add CI checks and a documented backup/restore strategy next.
3. **Identity and persistence:** single-owner bearer auth, SQLite storage, event validation, audit triggers, API routes, and same-origin UI connection are implemented. Add schema migrations, multi-account authentication if required, and deployment hardening.
4. **Core journal migration:** browser-only records are not bulk-imported to the server. Define a safe JSON import/migration flow with preview and historical confirmation before moving existing data.
5. **Habits and fitness:** recurring schedules, completion/missed records, structured workouts and missed sessions.
6. **Wellbeing modules:** water, sleep, meal structure and configurable metrics.
7. **Calendar and plans:** appointments, trips, date/time views, reminder preferences if safely supported.
8. **Insights:** daily through yearly aggregations and clear definitions for each graph.
9. **Audit, portability, and hardening:** correction history, export/import, encrypted backup and tested restore, deletion, security review, accessibility, self-host deployment docs.

Build and verify each stage independently. Do not start later modules until the data model, migration path, and acceptance criteria for the preceding stage are reviewed.
