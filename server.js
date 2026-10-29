'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const core = require('./core/event-system');
const { openDatabase } = require('./db');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const nowIso = () => new Date().toISOString();
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function normalizeCurrentCapture(input, now) {
  if (input.currentCapture !== true) return input;
  const requested = core.parseTimestamp(input.occurredAt);
  if (requested.epochMs > now || now - requested.epochMs > 5000) throw new Error('current capture timestamp is outside the 5-second request window');
  return { ...input, occurredAt: new Date(now).toISOString() };
}
function makeServer({ db, token, userId = 'owner', staticRoot = __dirname, clock = Date.now }) {
  if (!db || typeof token !== 'string' || token.length < 32) throw new Error('A database and LIFETRACK_API_TOKEN of at least 32 characters are required');
  function send(res, status, data) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(data));
  }
  async function body(req) {
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (raw.length > 64 * 1024) throw Object.assign(new Error('request body too large'), { status: 413 }); }
    try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('invalid JSON body'), { status: 400 }); }
  }
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (!safeEqual(req.headers.authorization?.replace(/^Bearer\s+/i, ''), token)) return send(res, 401, { error: 'unauthorized' });
      try {
        if (req.method === 'GET' && url.pathname === '/api/events') {
          const rows = db.prepare('SELECT * FROM events WHERE user_id = ? ORDER BY occurred_at_ms').all(userId);
          return send(res, 200, { events: rows.map(row => ({ ...row, details: JSON.parse(row.details_json), confirmationLabel: row.historical_confirmed_at ? 'user-confirmed' : null })) });
        }
        if (req.method === 'GET' && url.pathname === '/api/audit') {
          const rows = db.prepare('SELECT * FROM audit_events WHERE user_id = ? ORDER BY id DESC').all(userId);
          return send(res, 200, { audit: rows });
        }
        if (req.method === 'POST' && url.pathname === '/api/events') {
          const now = clock();
          const input = normalizeCurrentCapture(await body(req), now);
          const event = core.validateEvent(input, now);
          const id = crypto.randomUUID();
          const timestamp = nowIso();
          db.prepare(`INSERT INTO events(id,user_id,category,title,status,occurred_at,occurred_at_ms,timezone,historical_confirmed_at,completed_at,details_json,created_at,updated_at,updated_by)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,userId,event.category,event.title,event.status,event.occurredAt,Date.parse(event.occurredAt),event.timezone,event.historicalConfirmedAt,event.completedAt || null,JSON.stringify(event.details || {}),timestamp,timestamp,userId);
          return send(res, 201, { id, status: event.status, occurredAt: event.occurredAt, timezone: event.timezone, confirmationLabel: event.confirmationLabel });
        }
        const match = url.pathname.match(/^\/api\/events\/([0-9a-f-]{36})$/i);
        if (match && req.method === 'PATCH') {
          const current = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(match[1], userId);
          if (!current) return send(res, 404, { error: 'event not found' });
          const input = await body(req);
          const changedTime = input.occurredAt != null && input.occurredAt !== current.occurred_at;
          const correctingHistory = changedTime || Date.parse(current.occurred_at) < clock() - 60_000;
          const merged = { category: current.category, title: current.title, status: current.status, occurredAt: current.occurred_at, timezone: current.timezone, historicalConfirmation: correctingHistory ? false : Boolean(current.historical_confirmed_at), confirmedAt: correctingHistory ? null : current.historical_confirmed_at, completedAt: current.completed_at, details: JSON.parse(current.details_json), ...input };
          const now = clock();
          const event = core.validateEvent(normalizeCurrentCapture(merged, now), now);
          const timestamp = nowIso();
          db.prepare(`UPDATE events SET category=?,title=?,status=?,occurred_at=?,occurred_at_ms=?,timezone=?,historical_confirmed_at=?,completed_at=?,details_json=?,updated_at=?,updated_by=? WHERE id=? AND user_id=?`)
            .run(event.category,event.title,event.status,event.occurredAt,Date.parse(event.occurredAt),event.timezone,event.historicalConfirmedAt,event.completedAt || null,JSON.stringify(event.details || {}),timestamp,userId,match[1],userId);
          return send(res, 200, { id: match[1], status: event.status, occurredAt: event.occurredAt, timezone: event.timezone, confirmationLabel: event.confirmationLabel });
        }
        return send(res, 404, { error: 'not found' });
      } catch (error) {
        return send(res, error.status || 400, { error: error.message });
      }
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(staticRoot, relative);
    if (!target.startsWith(path.resolve(staticRoot) + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(target)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(data);
    });
  };
  return http.createServer((req, res) => { Promise.resolve(handler(req, res)).catch(() => send(res, 500, { error: 'internal server error' })); });
}

if (require.main === module) {
  const token = process.env.LIFETRACK_API_TOKEN;
  if (!token || token.length < 32) throw new Error('Set LIFETRACK_API_TOKEN to a random secret of at least 32 characters');
  const server = makeServer({ db: openDatabase(), token, userId: process.env.LIFETRACK_USER_ID || 'owner' });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`Puffx LifeTrack listening on http://localhost:${port}`));
}

module.exports = { makeServer };
