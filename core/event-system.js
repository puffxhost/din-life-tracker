(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeTrackCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const STATES = Object.freeze(['completed', 'planned', 'missed', 'cancelled', 'skipped', 'pending', 'in_progress', 'unknown']);
  const CATEGORIES = Object.freeze(['meal', 'workout', 'medication', 'plan', 'task', 'note']);
  const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
  const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

  function validTimezone(timeZone) {
    if (typeof timeZone !== 'string' || !timeZone.trim()) return false;
    try { new Intl.DateTimeFormat('en', { timeZone }).format(0); return true; } catch { return false; }
  }
  function partsValid(y, mo, d, h, mi, s) {
    if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }
  function parseTimestamp(value) {
    if (typeof value !== 'string') throw new Error('timestamp must be an RFC 3339 string with a timezone offset');
    const m = RFC3339.exec(value);
    if (!m) throw new Error('timestamp must include seconds and Z or a numeric UTC offset');
    const [, ys, mos, ds, hs, mis, ss, frac = '', zone] = m;
    const [y, mo, d, h, mi, s] = [ys, mos, ds, hs, mis, ss].map(Number);
    if (!partsValid(y, mo, d, h, mi, s)) throw new Error('timestamp contains an invalid calendar date or time');
    if (zone !== 'Z') {
      const [oh, om] = zone.slice(1).split(':').map(Number);
      if (oh > 14 || om > 59 || (oh === 14 && om !== 0)) throw new Error('timestamp has an invalid UTC offset');
    }
    const epochMs = Date.parse(value);
    if (!Number.isFinite(epochMs)) throw new Error('timestamp is invalid');
    return { epochMs, iso: new Date(epochMs).toISOString() };
  }
  function zonedParts(epochMs, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(epochMs);
    const out = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
  }
  function sameParts(a, b) { return ['year', 'month', 'day', 'hour', 'minute', 'second'].every(k => a[k] === b[k]); }
  function localToUtc(local, timeZone) {
    if (!validTimezone(timeZone)) throw new Error('timezone must be a valid IANA timezone');
    const m = LOCAL.exec(local || '');
    if (!m) throw new Error('local date/time must use YYYY-MM-DDTHH:mm');
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    if (!partsValid(y, mo, d, h, mi, 0)) throw new Error('local date/time is not a real calendar time');
    const wanted = { year: y, month: mo, day: d, hour: h, minute: mi, second: 0 };
    const naive = Date.UTC(y, mo - 1, d, h, mi);
    const offsets = new Set();
    for (let delta = -36; delta <= 36; delta += 3) {
      const probe = naive + delta * 3600000;
      const p = zonedParts(probe, timeZone);
      const localMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      offsets.add(localMs - probe);
    }
    const candidates = [...offsets].map(offset => naive - offset).filter(ms => sameParts(zonedParts(ms, timeZone), wanted));
    if (!candidates.length) throw new Error('local time does not exist in this timezone because of a clock change');
    if (candidates.length > 1) throw new Error('local time is ambiguous because of a clock change; provide an explicit UTC offset');
    return new Date(candidates[0]).toISOString();
  }
  function validateEvent(input, now = Date.now()) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('event must be an object');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('title is required and must be at most 200 characters');
    if (!CATEGORIES.includes(input.category)) throw new Error('category must be one of: ' + CATEGORIES.join(', '));
    if (!STATES.includes(input.status)) throw new Error('status must be one of: ' + STATES.join(', '));
    if (!validTimezone(input.timezone)) throw new Error('timezone must be a valid IANA timezone');
    const eventTime = parseTimestamp(input.occurredAt);
    if (eventTime.epochMs > now && !['planned', 'cancelled'].includes(input.status)) throw new Error('future events must be planned or cancelled; they cannot be saved as activities');
    if (input.details != null && (typeof input.details !== 'object' || Array.isArray(input.details))) throw new Error('details must be an object');
    const isHistorical = eventTime.epochMs < now;
    let confirmedAt = null;
    if (isHistorical) {
      if (input.historicalConfirmation !== true) throw new Error('historical events require explicit user confirmation');
      confirmedAt = parseTimestamp(input.confirmedAt).iso;
      if (Date.parse(confirmedAt) > now) throw new Error('confirmation timestamp cannot be in the future');
    }
    if (input.status === 'planned' && input.completedAt != null) throw new Error('planned events cannot have a completion timestamp');
    let completedAt = null;
    if (input.status === 'completed' && input.completedAt != null) {
      const completed = parseTimestamp(input.completedAt);
      if (completed.epochMs > now || completed.epochMs < eventTime.epochMs) throw new Error('completion timestamp must be valid, not future, and not before the event');
      completedAt = completed.iso;
    }
    return { ...input, title: input.title.trim(), occurredAt: eventTime.iso, timezone: input.timezone, confirmedAt, completedAt, historicalConfirmedAt: confirmedAt, confirmationLabel: isHistorical ? 'user-confirmed' : null };
  }
  function formatTimestamp(value, timeZone, locale) {
    if (!validTimezone(timeZone)) throw new Error('timezone must be a valid IANA timezone');
    const { epochMs } = parseTimestamp(value);
    return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(epochMs);
  }
  function localNow(timeZone, now = Date.now()) {
    if (!validTimezone(timeZone)) throw new Error('timezone must be a valid IANA timezone');
    const p = zonedParts(now, timeZone);
    return { date: [p.year, String(p.month).padStart(2, '0'), String(p.day).padStart(2, '0')].join('-'), time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`, timestamp: new Date(now).toISOString() };
  }
  return Object.freeze({ STATES, CATEGORIES, validTimezone, parseTimestamp, localToUtc, validateEvent, formatTimestamp, localNow });
});
