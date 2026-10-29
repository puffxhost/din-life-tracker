const test=require('node:test');
const assert=require('node:assert/strict');
const migration=require('../core/storage-migration.js');
function storage(seed={}){const data=new Map(Object.entries(seed));return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),data}}
const state=(entries=[],moods={})=>JSON.stringify({entries,moods});
const entry=(id,title=id)=>({id,category:'note',title,date:'2026-10-01',time:'12:00',status:'unknown'});

test('copies a valid Din journal once and keeps its original recoverable',()=>{
  const old=state([entry('a','Walk')],{'2026-10-01':'good'}),s=storage({[migration.LEGACY_KEY]:old});
  const first=migration.load(s),second=migration.load(s);
  assert.deepEqual(first.state.entries,[entry('a','Walk')]);
  assert.equal(first.migration,'copied');assert.deepEqual(second.state,first.state);
  assert.equal(s.getItem(migration.LEGACY_KEY),old);
});

test('merges without replacing conflicting Dayora records or moods',()=>{
  const s=storage({[migration.CURRENT_KEY]:state([entry('same','new'),entry('b')],{'2026-10-01':'great'}),[migration.LEGACY_KEY]:state([entry('same','old'),entry('a')],{'2026-10-01':'good','2026-10-02':'okay'})});
  const result=migration.load(s);
  assert.deepEqual(result.state.entries,[entry('same','new'),entry('b'),entry('a')]);
  assert.deepEqual(result.state.moods,{'2026-10-01':'great','2026-10-02':'okay'});
  assert.equal(migration.load(s).state.entries.length,3);
});

test('corrupt old data remains recoverable and does not replace a valid current journal',()=>{
  const s=storage({[migration.CURRENT_KEY]:state([entry('safe')]),[migration.LEGACY_KEY]:'{' });
  const result=migration.load(s);
  assert.equal(result.error,'corrupt');assert.deepEqual(result.state.entries,[entry('safe')]);assert.equal(s.getItem(migration.LEGACY_KEY),'{');
});

test('invalid Dayora data is never overwritten from the older Din key',()=>{
  const s=storage({[migration.CURRENT_KEY]:'not-json',[migration.LEGACY_KEY]:state([entry('old')])});
  const result=migration.load(s);
  assert.equal(result.migration,'blocked');assert.equal(result.error,'corrupt');assert.equal(s.getItem(migration.CURRENT_KEY),'not-json');
});
