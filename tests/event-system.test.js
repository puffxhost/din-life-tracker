'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core/event-system');

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const base = { category: 'meal', title: 'Lunch', status: 'completed', occurredAt: '2026-10-29T12:00:00Z', timezone: 'Asia/Kolkata' };

test('accepts an activity at current time and stores canonical UTC', () => {
  const result = core.validateEvent(base, NOW);
  assert.equal(result.occurredAt, '2026-10-29T12:00:00.000Z');
  assert.equal(result.confirmationLabel, null);
});

test('rejects future completed activities but accepts planned future events', () => {
  const future = { ...base, occurredAt: '2026-10-29T12:00:01Z' };
  assert.throws(() => core.validateEvent(future, NOW), /future events must be planned/);
  assert.equal(core.validateEvent({ ...future, status: 'planned' }, NOW).status, 'planned');
  assert.equal(core.validateEvent({ ...future, status: 'cancelled' }, NOW).status, 'cancelled');
  for (const status of core.STATES.filter(s => !['planned','cancelled'].includes(s))) {
    assert.throws(() => core.validateEvent({ ...future, status }, NOW), /future events must be planned/);
  }
});

test('preserves unclassified history as unknown and accepts confirmed in-progress history', () => {
  const past = { ...base, occurredAt: '2026-10-28T12:00:00Z' };
  const confirmed = { historicalConfirmation: true, confirmedAt: '2026-10-29T11:59:00Z' };
  assert.equal(core.validateEvent({ ...past, status: 'unknown', ...confirmed }, NOW).status, 'unknown');
  assert.equal(core.validateEvent({ ...past, status: 'in_progress', ...confirmed }, NOW).status, 'in_progress');
  assert.throws(() => core.validateEvent({ ...past, status: 'unknown' }, NOW), /explicit user confirmation/);
});

test('requires explicit confirmation for past entries and labels them user-confirmed', () => {
  const past = { ...base, occurredAt: '2026-10-28T12:00:00Z' };
  assert.throws(() => core.validateEvent(past, NOW), /historical events require explicit user confirmation/);
  const result = core.validateEvent({ ...past, historicalConfirmation: true, confirmedAt: '2026-10-29T11:59:00Z' }, NOW);
  assert.equal(result.confirmationLabel, 'user-confirmed');
  assert.equal(result.historicalConfirmedAt, '2026-10-29T11:59:00.000Z');
});

test('converts local dates with configured timezone across midnight and DST', () => {
  assert.equal(core.localToUtc('2026-10-29T00:05', 'Asia/Kolkata'), '2026-10-28T18:35:00.000Z');
  assert.equal(core.localToUtc('2026-03-08T01:30', 'America/New_York'), '2026-03-08T06:30:00.000Z');
  assert.throws(() => core.localToUtc('2026-03-08T02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => core.localToUtc('2026-11-01T01:30', 'America/New_York'), /ambiguous/);
  assert.equal(core.formatTimestamp('2026-10-28T18:35:00Z', 'Asia/Kolkata', 'en-IN'), '29 Oct 2026, 12:05 am');
});

test('rejects invalid timestamps, invalid dates, invalid timezone, and missing data', () => {
  for (const value of ['2026-02-30T12:00:00Z', '2026-01-01T25:00:00Z', '2026-01-01T12:00:00', '', null]) {
    assert.throws(() => core.parseTimestamp(value));
  }
  assert.throws(() => core.localToUtc('2026-02-30T12:00', 'UTC'));
  assert.throws(() => core.validateEvent({ ...base, timezone: 'Mars/Olympus' }, NOW), /valid IANA timezone/);
  assert.throws(() => core.validateEvent({ ...base, title: '' }, NOW), /title is required/);
  assert.throws(() => core.validateEvent({ ...base, category: undefined }, NOW), /category/);
  assert.throws(() => core.validateEvent({ category: 'note', title: 'Unknown', timezone: 'UTC' }, NOW), /status/);
});

test('local day follows the configured timezone at UTC day boundaries', () => {
  assert.equal(core.localNow('Asia/Kolkata', Date.parse('2026-10-28T18:31:00Z')).date, '2026-10-29');
  assert.equal(core.localNow('America/Los_Angeles', Date.parse('2026-10-29T06:59:00Z')).date, '2026-10-28');
  assert.equal(core.localNow('America/Los_Angeles', Date.parse('2026-10-29T07:01:00Z')).date, '2026-10-29');
});
