/**
 * Add this file to the existing auto Apps Script project. In syncOneTab(), add:
 * if (['pick','deli','ca1','fd'].includes(tabKey)) return syncOpsDeltaTab_(ss,tabKey,gid);
 * Keep the existing queue, retry policy, triggers and Leadtime branch.
 * Reads the full BI output but transfers only changed dates, in column arrays.
 */
function opsDeltaMd5_(text) {
  // Local RFC 1321 MD5 avoids one Apps Script service call per source row.
  const bytes = unescape(encodeURIComponent(text));
  const words = new Array(((bytes.length+8 >>> 6)+1)*16).fill(0);
  for (let i=0;i<bytes.length;i++) words[i>>>2] |= bytes.charCodeAt(i) << ((i%4)*8);
  words[bytes.length>>>2] |= 128 << ((bytes.length%4)*8);
  words[words.length-2] = bytes.length*8;
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  for (let offset=0;offset<words.length;offset+=16) {
    let a=a0,b=b0,c=c0,d=d0;
    for (let i=0;i<64;i++) {
      let f,g;
      if(i<16){f=(b&c)|(~b&d);g=i;}
      else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}
      else if(i<48){f=b^c^d;g=(3*i+5)%16;}
      else {f=c^(b|~d);g=(7*i)%16;}
      const sum=(a+f+(Math.floor(Math.abs(Math.sin(i+1))*4294967296)|0)+words[offset+g])|0;
      const shift=shifts[(i>>>4)*4+i%4];
      a=d;d=c;c=b;b=(b+((sum<<shift)|(sum>>>(32-shift))))|0;
    }
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  return [a0,b0,c0,d0].map(n=>[0,8,16,24].map(s=>('0'+((n>>>s)&255).toString(16)).slice(-2)).join('')).join('');
}

function opsDeltaDayManifest_(columns, rows, dateColumn, md5) {
  const dayIndex = columns.findIndex(c => c.name === dateColumn);
  if (dayIndex < 0) throw new Error('Missing date column in OPS schema');
  const groups = {};
  rows.forEach(row => {
    const day = row[dayIndex];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw new Error('Invalid OPS report date');
    // PostgreSQL jsonb_build_array(text, ...) uses comma+space separators.
    // All scalars are text or null, so numeric formatting and key order cannot drift.
    const canonical = '[' + row.map(v => JSON.stringify(v === null ? null : String(v))).join(', ') + ']';
    if (!groups[day]) groups[day] = {rows:[], hashes:[]};
    groups[day].rows.push(row); groups[day].hashes.push(md5(canonical));
  });
  const days = Object.keys(groups).sort().map(day => ({day:day, count:groups[day].rows.length,
    hash:md5(groups[day].hashes.sort().join('\n'))}));
  return {days:days,groups:groups};
}

function opsDeltaNormalizeRows_(headers, values, columns, timezone) {
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Header trống hoặc trùng');
  const indexes = columns.map(c => {
    const index = headers.indexOf(c.name);
    // wh_id was added later and is absent from some approved BI outputs.
    if (index < 0 && c.name !== 'wh_id') throw new Error('Missing header: '+c.name);
    if (!['date','numeric','text'].includes(c.type)) throw new Error('Unsupported OPS column type: '+c.type);
    return index;
  });
  return values.filter(row => row.some(cell => cell !== '' && cell !== null)).map(row => columns.map((c,i) => {
    const value = indexes[i] < 0 ? null : row[indexes[i]];
    if (c.type === 'date') {
      const raw = value instanceof Date ? Utilities.formatDate(value,timezone,'yyyy-MM-dd') : String(value || '').trim();
      const day = /^\d{4}-\d{2}-\d{2}[ T]00:00:00(?:\.0+)?$/.test(raw) ? raw.slice(0,10) : raw;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day+'T00:00:00Z').toISOString().slice(0,10) !== day) throw new Error('Invalid date: '+c.name);
      return day;
    }
    if (c.type === 'numeric') {
      if (value === '' || value === null || value === undefined) return null;
      const number = Number(value);
      if (typeof value === 'boolean' || !Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER || !/^-?\d+(\.\d+)?$/.test(String(number))) throw new Error('Invalid numeric: '+c.name);
      return number;
    }
    if (value === null || value === undefined) return null;
    return c.name === 'wh_id' ? (String(value).trim() || null) : String(value);
  }));
}

function opsDeltaValidateWindow_(tabKey, days, today) {
  const offset = tabKey === 'fd' ? [22,8] : [14,1];
  const shift = n => {const d = new Date(today+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-n); return d.toISOString().slice(0,10);};
  const lo = shift(offset[0]), hi = shift(offset[1]);
  if (!days.length || days.some(d => d.day < lo || d.day > hi) || days[days.length-1].day !== hi) {
    throw new Error('Source chưa đúng cửa sổ '+lo+'..'+hi+'; giữ nguyên snapshot cũ');
  }
}

function opsDeltaRpc_(rpc, payload, serviceKey) {
  const res = UrlFetchApp.fetch(SUPABASE_URL+'/rest/v1/rpc/'+rpc, {
    method:'post', contentType:'application/json',
    headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},
    payload:JSON.stringify(payload), muteHttpExceptions:true
  });
  const status = res.getResponseCode(), body = res.getContentText();
  if (status >= 300) {
    const error = new Error('Supabase HTTP '+status+': '+body.slice(0,800));
    let sqlCode = ''; try {sqlCode = JSON.parse(body).code || '';} catch (_) {}
    error.retryable = [408,429,502,503,504].includes(status) ||
      (status >= 500 && (!sqlCode || /^(08|53|57)/.test(sqlCode) || ['40001','40P01','55P03'].includes(sqlCode))) ||
      ['40001','40P01','55P03'].includes(sqlCode);
    const headers = res.getAllHeaders();
    const name = Object.keys(headers).find(k => k.toLowerCase() === 'retry-after');
    if (name) {
      const value = String(headers[name]);
      const delay = /^\d+$/.test(value) ? Number(value)*1000 : Date.parse(value)-Date.now();
      if (Number.isFinite(delay) && delay > 0) error.retryAfterMs = Math.min(delay,3600000);
    }
    throw error;
  }
  return JSON.parse(body);
}

function syncOpsDeltaTab_(ss,tabKey,gid) {
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('Chưa cấu hình Script Property SUPABASE_SERVICE_ROLE_KEY');
  const sheet = ss.getSheets().find(s => s.getSheetId() === gid);
  if (!sheet) throw new Error('Không tìm thấy tab với gid '+gid);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Tab trống hoặc chỉ có header; giữ nguyên snapshot cũ');
  const remote = opsDeltaRpc_('ops_kpi_sync_manifest',{tab_key:tabKey},key);
  const timezone = ss.getSpreadsheetTimeZone();
  const rows = opsDeltaNormalizeRows_(values[0].map(h => String(h).trim()),values.slice(1),remote.columns,timezone);
  const source = opsDeltaDayManifest_(remote.columns,rows,remote.date_column,opsDeltaMd5_);
  opsDeltaValidateWindow_(tabKey,source.days,Utilities.formatDate(new Date(),timezone,'yyyy-MM-dd'));
  const previous = {};
  remote.days.forEach(d => {previous[d.day]=d;});
  const changed = source.days.filter(d => !previous[d.day] || previous[d.day].hash !== d.hash || previous[d.day].count !== d.count);
  const removed = remote.days.filter(d => !source.groups[d.day]);
  if (!changed.length && !removed.length) {
    Logger.log(JSON.stringify({tab:tabKey,mode:'delta',sourceRows:rows.length,transferredRows:0,inserted:0,deleted:0,unchanged:true}));
    return;
  }
  const changedRows = [].concat(...changed.map(d => source.groups[d.day].rows));
  const payload = {tab_key:tabKey,base_token:remote.token,source_days:source.days,changed_rows:changedRows};
  const result = opsDeltaRpc_('sync_ops_kpi_delta',payload,key);
  const objectRows = rows.map(row => {const o={};remote.columns.forEach((c,i)=>{o[c.name]=row[i];});return o;});
  const bytes = value => Utilities.newBlob(JSON.stringify(value)).getBytes().length;
  Logger.log(JSON.stringify({tab:tabKey,mode:'delta',sourceRows:rows.length,transferredRows:changedRows.length,
    changedDates:changed.map(d=>d.day),removedDates:removed.map(d=>d.day),
    payloadBytes:bytes(payload),equivalentFullObjectBytes:bytes({payload:objectRows}),result:result}));
}

/** Explicitly excludes Leadtime; uses the existing durable retry queue. */
function syncOptimizedOpsTabs() {
  startOpsSync_(['pick','deli','ca1','fd']);
}
