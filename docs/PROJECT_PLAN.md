# Puffx LifeTrack — Project Plan

**Status:** Planning document for the existing `puffxhost/din-life-tracker` repository. This plan does not claim the future modules below are implemented.

## 1. Repository audit (verified)

The current default-branch snapshot is a small static application:

- `index.html`: page structure and forms for today, insights, and history.
- `styles.css`: responsive presentation.
- `app.js`: application state, rendering, entry editing, date checks, search, charts, and backup/restore.
- `manifest.webmanifest`, `icon.svg`, `sw.js`: install metadata and a static-asset service worker.
- `.github/workflows/pages.yml`: deploys the repository root to GitHub Pages on pushes to `main` and manual dispatch.
- `.nojekyll`, `LICENSE`, `README.md`.

There is no `package.json`, lockfile, backend, database, test suite, build step, or authentication implementation in the audited tree. It is plain HTML/CSS/JavaScript. The service worker caches same-origin static assets; it is not a data-sync service.

### What currently works in code

- Hindi/English interface and browser-local language preference.
- Day selection that blocks navigating/logging into future calendar dates, plus a chronological timeline and searchable/filterable history.
- Entries for meals (meal type and free-text amount), workouts (duration and free-text sets/distance), medicine (dose and a taken/skipped choice), plans (place, optional planned date, companions), tasks (done/missed/in progress), and notes.
- Mood selection; editing and deleting entries; a seven-day activity-count chart, category totals, month activity dots, and day summary.
- Past-dated or earlier-today entries prompt for confirmation before save. The UI permits future dates as a plan detail while keeping the plan's recorded date separate.
- JSON export and import from a user-selected file.

These are lightweight journal fields, not dedicated health or scheduling systems. The medicine choice is a self-reported log, with no recurring schedule, reminder, or verification. The charts count recorded entries; they do not measure health outcomes, adherence, or comprehensive daily metrics.

### Gaps and constraints

- Journal and language settings live in browser `localStorage`; there are no accounts, server storage, multi-device sync, or app-level encryption at rest. Clearing browser data can lose the journal; export is manual.
- No configured persistence database, authorization layer, server-side validation, or server-side backup/restore exists.
- No first-class recurring habits, task schedules, workout plans/exercises/sets, water intake, sleep, structured body metrics, medication schedules, appointment/calendar views, trip lifecycle, reminders, or daily/weekly/monthly/yearly analytics.
- There is no immutable audit history for edits/deletions. Past-entry confirmation is a UI prompt, not a durable audit record; mood changes use a browser confirmation.
- Date checks rely on the browser's current local clock and HTML controls. Imported JSON is only lightly validated. This is not a security boundary or a strict timezone-aware server rule.
- No automated tests or CI quality checks are present. The Pages workflow requires GitHub Pages to be configured for GitHub Actions in repository settings.

## 2. Product goal and architecture

Puffx LifeTrack should become a private, self-hostable personal tracker. Keep the existing static UI and local-only mode usable during the transition; introduce the server and database as a deliberate next stage, rather than replacing working screens before an authenticated data path is ready.

**Proposed target architecture (not implemented):**

1. Responsive browser client, initially reusing the current vanilla UI and progressively separating modules as needed.
2. Versioned JSON HTTP API with schema validation and explicit ownership checks.
3. Node.js + TypeScript backend (proposed Fastify) for authentication, domain rules, exports, and API operations.
4. PostgreSQL as the authoritative multi-user datastore, with SQL migrations.
5. Docker Compose deployment for a self-hosted instance, with a reverse proxy providing HTTPS and operator-managed encrypted backups.

This is a documented technical choice, not a user requirement or existing dependency. Before coding the backend, confirm the supported deployment target, whether the app is single-owner or multi-account, and whether local-only mode must remain a supported option.

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
| `users` | `id`, normalized unique `email`, `password_hash` (or external identity subject), timezone, created/updated timestamps. |
| `sessions` | `id`, `user_id`, hashed session/token reference, expiry, revocation and creation timestamps. |
| `activity_entries` | Shared timeline: `id`, `user_id`, kind, title, notes, `occurred_at`, local date/time context, created/updated timestamps. |
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

1. **Planning baseline:** this audit, project plan, and truthful README; decide deployment and account model.
2. **Engineering foundation:** establish backend/client layout, package manager, formatting/linting, unit/integration test harness, local Docker Compose, environment examples, and CI checks.
3. **Identity and persistence:** migrations for users/sessions/timeline; authentication, authorization, schema validation, timezone/date policy, and API error handling.
4. **Core journal migration:** authenticated timeline, meals/workouts/medication self-reports/plans/tasks/notes, historical confirmation, and safe migration/import from the current JSON export.
5. **Habits and fitness:** recurring schedules, completion/missed records, structured workouts and missed sessions.
6. **Wellbeing modules:** water, sleep, meal structure and configurable metrics.
7. **Calendar and plans:** appointments, trips, date/time views, reminder preferences if safely supported.
8. **Insights:** daily through yearly aggregations and clear definitions for each graph.
9. **Audit, portability, and hardening:** correction history, export/import, encrypted backup and tested restore, deletion, security review, accessibility, self-host deployment docs.

Build and verify each stage independently. Do not start later modules until the data model, migration path, and acceptance criteria for the preceding stage are reviewed.
