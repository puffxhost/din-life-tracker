'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../db');
const { makeServer } = require('../server');

const TOKEN = 'test-token-that-is-at-least-thirty-two-characters';

test('API requires authentication and records confirmed corrections in database audit history', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifetrack-'));
  const db = openDatabase(path.join(dir, 'test.sqlite'));
  const server = makeServer({ db, token: TOKEN, userId: 'test-owner' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const unauthorized = await fetch(`${base}/api/events`);
  assert.equal(unauthorized.status, 401);

  const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
  const pastBody = { category: 'workout', title: 'Gym', status: 'completed', occurredAt: new Date(Date.now() - 86400000).toISOString(), timezone: 'Asia/Kolkata' };
  const rejected = await fetch(`${base}/api/events`, { method: 'POST', headers, body: JSON.stringify(pastBody) });
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).error, /explicit user confirmation/);

  const createdResponse = await fetch(`${base}/api/events`, { method: 'POST', headers, body: JSON.stringify({ ...pastBody, historicalConfirmation: true, confirmedAt: new Date().toISOString() }) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.confirmationLabel, 'user-confirmed');

  const plannedAt = new Date(Date.now() + 3600000).toISOString();
  const plannedResponse = await fetch(`${base}/api/events`, { method: 'POST', headers, body: JSON.stringify({ category: 'plan', title: 'Trip', status: 'planned', occurredAt: plannedAt, timezone: 'Asia/Kolkata' }) });
  assert.equal(plannedResponse.status, 201);
  assert.equal((await plannedResponse.json()).status, 'planned');

  const correctedAt = new Date(Date.now() - 3600000).toISOString();
  const correctionWithoutConfirmation = await fetch(`${base}/api/events/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ occurredAt: correctedAt }) });
  assert.equal(correctionWithoutConfirmation.status, 400);
  const correction = await fetch(`${base}/api/events/${created.id}`, { method: 'PATCH', headers, body: JSON.stringify({ title: 'Gym corrected', occurredAt: correctedAt, historicalConfirmation: true, confirmedAt: new Date().toISOString() }) });
  assert.equal(correction.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE user_id = ?').get('test-owner').count, 3);
  const latest = db.prepare('SELECT before_json,after_json FROM audit_events WHERE action = ? ORDER BY id DESC').get('corrected');
  assert.equal(JSON.parse(latest.before_json).title, 'Gym');
  assert.equal(JSON.parse(latest.after_json).title, 'Gym corrected');
  assert.throws(() => db.prepare('UPDATE audit_events SET action = ? WHERE id = 1').run('deleted'), /audit events are immutable/);
});

test('SQLite triggers reject invalid future completed events even when API validation is bypassed', () => {
  const db = openDatabase(':memory:');
  const future = new Date(Date.now() + 60000);
  const stamp = future.toISOString();
  assert.throws(() => db.prepare(`INSERT INTO events(id,user_id,category,title,status,occurred_at,occurred_at_ms,timezone,created_at,updated_at,updated_by)
    VALUES('id','owner','workout','Future','completed',?,?, 'UTC',?,?, 'owner')`).run(stamp, future.getTime(), new Date().toISOString(), new Date().toISOString()), /future events must be planned/);
  const past = new Date(Date.now() - 86400000);
  assert.throws(() => db.prepare(`INSERT INTO events(id,user_id,category,title,status,occurred_at,occurred_at_ms,timezone,created_at,updated_at,updated_by)
    VALUES('past','owner','workout','Past','completed',?,?, 'UTC',?,?, 'owner')`).run(past.toISOString(), past.getTime(), new Date().toISOString(), new Date().toISOString()), /historical events require user confirmation/);
  assert.throws(() => db.prepare(`INSERT INTO events(id,user_id,category,title,status,occurred_at,occurred_at_ms,timezone,created_at,updated_at,updated_by)
    VALUES('bad','owner','meal','Bad','completed','not-a-time',0,'UTC',?,?, 'owner')`).run(new Date().toISOString(), new Date().toISOString()));
  db.close();
});
