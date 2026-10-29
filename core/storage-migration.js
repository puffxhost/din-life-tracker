(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DayoraStorage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LEGACY_KEY='din.life-tracker.v1';
  const CURRENT_KEY='dayora.life-tracker.v1';
  const CATEGORIES=new Set(['meal','workout','medication','plan','task','note']);
  const STATES=new Set(['completed','planned','missed','cancelled','skipped','pending','in_progress','unknown']);
  const MOODS=new Set(['low','okay','good','great']);
  function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d}
  function validState(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.entries)||!value.moods||typeof value.moods!=='object'||Array.isArray(value.moods))return false;
    const ids=new Set();
    for(const entry of value.entries){
      if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id)||!CATEGORIES.has(entry.category)||typeof entry.title!=='string'||!entry.title.trim()||!validDate(entry.date)||typeof entry.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time))return false;
      if(entry.occurredAt&&(!Number.isFinite(Date.parse(entry.occurredAt))||typeof entry.occurredAt!=='string'))return false;
      if(entry.status!=null&&!STATES.has(entry.status))return false;
      ids.add(entry.id);
    }
    for(const [date,mood] of Object.entries(value.moods))if(!validDate(date)||!MOODS.has(mood))return false;
    return true;
  }
  function parseState(raw){
    if(raw===null)return null;
    let value;
    try{value=JSON.parse(raw)}catch{return {error:'corrupt'}}
    if(!validState(value))return {error:'invalid'};
    return {state:{...value,entries:value.entries.map(entry=>({...entry,status:entry.status||'unknown'})),moods:value.moods}};
  }
  function mergeStates(current,legacy){
    const currentEntries=current?.entries||[],legacyEntries=legacy?.entries||[];
    const currentIds=new Set(currentEntries.map(e=>e&&e.id).filter(Boolean));
    const additions=[];
    for(const entry of legacyEntries){if(entry?.id&&currentIds.has(entry.id))continue;additions.push(entry);if(entry?.id)currentIds.add(entry.id)}
    return {...legacy,...current,entries:[...currentEntries,...additions],moods:{...(legacy?.moods||{}),...(current?.moods||{})}};
  }
  function load(storage){
    const current=parseState(storage.getItem(CURRENT_KEY));
    const legacy=parseState(storage.getItem(LEGACY_KEY));
    if(current?.error)return {state:{entries:[],moods:{}},error:current.error,migration:'blocked',writable:false};
    if(legacy?.error)return {state:current?.state||{entries:[],moods:{}},error:legacy.error,migration:'blocked',writable:Boolean(current?.state)};
    if(current?.state&&legacy?.state){
      const merged=mergeStates(current.state,legacy.state);
      if(JSON.stringify(merged)!==JSON.stringify(current.state))storage.setItem(CURRENT_KEY,JSON.stringify(merged));
      return {state:merged,migration:'merged',writable:true};
    }
    if(current?.state)return {state:current.state,migration:'current',writable:true};
    if(legacy?.state){
      storage.setItem(CURRENT_KEY,JSON.stringify(legacy.state));
      return {state:legacy.state,migration:'copied',writable:true};
    }
    return {state:{entries:[],moods:{}},migration:'empty',writable:true};
  }
  return {LEGACY_KEY,CURRENT_KEY,parseState,mergeStates,load};
});
