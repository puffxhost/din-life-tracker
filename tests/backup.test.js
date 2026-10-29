const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../core/event-system.js');
const backup=require('../core/backup.js');
const now=Date.parse('2026-10-29T12:00:00Z');
function historical(id='h'){return {id,category:'note',title:'Walk',status:'completed',date:'2026-10-29',time:'10:00',occurredAt:'2026-10-29T10:00:00Z',timezone:'UTC',confirmedAt:'2026-10-29T11:00:00Z'}}
function pack(entries,app='Dayora'){return app==='Din'?{app,version:1,entries,moods:{}}:{app,schemaVersion:2,entries,moods:{}}}

test('accepts Dayora v2 and imports compatible Din v1 records intact',()=>{
  const old=historical();old.notes='remember';
  assert.deepEqual(backup.validateBackup(pack([old],'Din'),core,now,'UTC').entries,[old]);
});
test('rejects duplicate IDs, malformed dates, unknown states, and timestamp mismatch',()=>{
  for(const rows of [[historical(),historical()],[{...historical(),date:'2026-02-30'}],[{...historical(),status:'failed'}],[{...historical(),time:'09:00'}]])assert.throws(()=>backup.validateBackup(pack(rows),core,now,'UTC'));
});
test('rejects an old historical backup record without explicit confirmation',()=>{
  const row=historical();delete row.confirmedAt;
  assert.throws(()=>backup.validateBackup(pack([row]),core,now,'UTC'),/no user confirmation/);
});
test('labels records with missing legacy state as unknown instead of assuming failure',()=>{
  const row=historical();delete row.status;
  assert.equal(backup.validateBackup(pack([row],'Din'),core,now,'UTC').entries[0].status,'unknown');
});
