(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DayoraBackup=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CATEGORIES=new Set(['meal','workout','medication','plan','task','note']);
  const STATES=new Set(['completed','planned','missed','cancelled','skipped','pending','in_progress','unknown']);
  function validateBackup(data,core,now=Date.now(),defaultTimezone='UTC'){
    if(!data||typeof data!=='object'||Array.isArray(data)||!['Din','Dayora'].includes(data.app)||!Array.isArray(data.entries)||!data.moods||typeof data.moods!=='object'||Array.isArray(data.moods))throw new Error('Backup format is not supported.');
    if(data.app==='Dayora'&&data.schemaVersion!==2)throw new Error('Dayora backup schema version is not supported.');
    if(data.app==='Din'&&data.version!==1)throw new Error('Din backup version is not supported.');
    for(const [date,mood] of Object.entries(data.moods))if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['low','okay','good','great'].includes(mood))throw new Error('Backup contains an invalid mood record.');
    const ids=new Set();
    const entries=data.entries.map((entry,index)=>{
      if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error(`Entry ${index+1} is invalid.`);
      if(typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id))throw new Error(`Entry ${index+1} has a missing or duplicate ID.`);ids.add(entry.id);
      if(!CATEGORIES.has(entry.category)||typeof entry.title!=='string'||!entry.title.trim()||entry.title.length>200)throw new Error(`Entry ${index+1} has invalid category or title.`);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.date||'')||!/^\d{2}:\d{2}$/.test(entry.time||''))throw new Error(`Entry ${index+1} has an invalid date or time.`);
      const timezone=entry.timezone||defaultTimezone;
      if(!core.validTimezone(timezone))throw new Error(`Entry ${index+1} has an invalid timezone.`);
      const occurredAt=entry.occurredAt||core.localToUtc(`${entry.date}T${entry.time}`,timezone);
      const status=entry.status||'unknown';
      if(!STATES.has(status))throw new Error(`Entry ${index+1} has an invalid state.`);
      const normalized={...entry,status,occurredAt,timezone};
      const local=core.localNow(timezone,core.parseTimestamp(occurredAt).epochMs);
      if(local.date!==entry.date||local.time!==entry.time)throw new Error(`Entry ${index+1} date/time does not match its timestamp and timezone.`);
      const eventMs=core.parseTimestamp(occurredAt).epochMs;
      if(eventMs<now&&!entry.confirmedAt&&!entry.historicalConfirmedAt)throw new Error(`Entry ${index+1} is historical but has no user confirmation.`);
      if(eventMs<now)normalized.confirmedAt=entry.confirmedAt||entry.historicalConfirmedAt;
      if(status==='unknown'){
        if(eventMs>now)throw new Error(`Entry ${index+1} is in the future but its state is unknown.`);
        if(normalized.confirmedAt){const confirmation=core.parseTimestamp(normalized.confirmedAt).epochMs;if(confirmation>now)throw new Error(`Entry ${index+1} confirmation is in the future.`)}
      }else{
        core.validateEvent({...normalized,historicalConfirmation:eventMs<now},now);
      }
      return normalized;
    });
    return {entries,moods:{...data.moods}};
  }
  return {validateBackup};
});
