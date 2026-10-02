'use strict';

/* ============================================================
 *  บันทึกเส้นทาง (เก็บในเครื่อง — IndexedDB)
 *  หมายเหตุ: เว็บจะได้ตำแหน่งเฉพาะตอนเปิดหน้าแอปค้างไว้และจอติด
 *  ระหว่างบันทึกแอปจึงสั่งไม่ให้จอดับ (Screen Wake Lock)
 * ============================================================ */

const TRACK = {
  minDistance: 5,     // เมตร — ไม่เก็บจุดที่ห่างจากจุดก่อนหน้าน้อยกว่านี้ (กันจุดซ้ำตอนจอดนิ่ง)
  maxAccuracy: 50,    // เมตร — ไม่เก็บจุดที่ GPS คลาดเคลื่อนมากกว่านี้
  color: '#7c3aed',
};

/* ---------- IndexedDB ---------- */
const trackDB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((ok, fail) => {
    const r = indexedDB.open('watermap', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((ok, fail) => {
      const t = db.transaction('tracks', mode);
      const req = fn(t.objectStore('tracks'));
      t.oncomplete = () => ok(req && req.result);
      t.onerror = () => fail(t.error);
    });
  };
  return {
    all: () => tx('readonly', s => s.getAll()),
    put: t => tx('readwrite', s => s.put(t)),
    del: id => tx('readwrite', s => s.delete(id)),
  };
})();

/* ---------- สถานะ ---------- */
let tracks = [];                                   // เส้นทางทั้งหมด (ใหม่สุดก่อน)
let rec = null;                                    // { track, paused, lastPt, runStart, lastSave }
const shownTracks = new Set(store.get('trackShown', []));
let wakeLock = null;
let recTimer = null;

function haversine(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const pointCount = t => t.segments.reduce((n, s) => n + s.length, 0);
const elapsedOf = t => t.elapsed + (rec && rec.track === t && !rec.paused ? Date.now() - rec.runStart : 0);

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return [h, m, ss].map(x => String(x).padStart(2, '0')).join(':');
}
function fmtDurationShort(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return '<1 นาที';
  return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม. ${m % 60} นาที`;
}
const fmtKm = m => `${(m / 1000).toFixed(2)} กม.`;

/* ---------- เปิดจอค้าง ---------- */
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release(); wakeLock = null;
    }
  } catch (err) { console.warn('wakeLock', err); }
}

/* ---------- เริ่ม / พัก / ต่อ / หยุด ---------- */
async function startRecording() {
  if (watchId == null) {
    if (!startTracking()) return;
    setFollow('follow');
    enableOrientation();
  }
  const now = Date.now();
  const track = {
    id: now,
    name: new Date(now).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' น.',
    startedAt: now, endedAt: null, distance: 0, elapsed: 0,
    segments: [[]], zones: [], active: true,
  };
  rec = { track, paused: false, lastPt: null, runStart: now, lastSave: 0 };
  tracks.unshift(track);
  await trackDB.put(track);
  navigator.storage?.persist?.();
  if (!('wakeLock' in navigator)) toast('เปิดหน้าจอค้างไว้ระหว่างบันทึก (ถ้าจอดับจะหยุดเก็บตำแหน่ง)');
  keepAwake(true);
  if (lastFix) addTrackPoint(lastFix);
  updateRecUI();
}

function pauseRecording() {
  if (!rec || rec.paused) return;
  rec.track.elapsed += Date.now() - rec.runStart;
  rec.paused = true;
  keepAwake(false);
  saveTrack(true);
  updateRecUI();
}

function resumeRecording() {
  if (!rec || !rec.paused) return;
  if (watchId == null && !startTracking()) return;
  rec.paused = false;
  rec.runStart = Date.now();
  rec.lastPt = null;
  if (rec.track.segments[rec.track.segments.length - 1].length) rec.track.segments.push([]);
  keepAwake(true);
  if (lastFix) addTrackPoint(lastFix);
  updateRecUI();
}

async function stopRecording() {
  if (!rec) return;
  if (!await confirmModal('หยุดบันทึกเส้นทางนี้?', { ok: 'หยุดบันทึก', danger: true })) return;
  if (!rec) return;
  const t = rec.track;
  if (!rec.paused) t.elapsed += Date.now() - rec.runStart;
  t.active = false;
  t.endedAt = Date.now();
  t.segments = t.segments.filter(s => s.length);
  rec = null;
  keepAwake(false);
  if (pointCount(t) < 2) {
    await trackDB.del(t.id);
    tracks = tracks.filter(x => x !== t);
    toast('เส้นทางสั้นเกินไป ไม่ได้บันทึก');
  } else {
    await trackDB.put(t);
    shownTracks.add(t.id);
    store.set('trackShown', [...shownTracks]);
    toast(`บันทึกแล้ว ${fmtKm(t.distance)} · ${fmtDurationShort(t.elapsed)}`);
  }
  updateRecUI();
  renderTrackMap();
  renderTrackList();
}

function saveTrack(force) {
  if (!rec) return;
  const now = Date.now();
  if (!force && now - rec.lastSave < 10000) return;
  rec.lastSave = now;
  const t = rec.track;
  const snapshot = { ...t, elapsed: elapsedOf(t) };   // เก็บเวลาที่ผ่านไปล่าสุดเผื่อแอปถูกปิดกะทันหัน
  trackDB.put(snapshot).catch(err => console.error('save track', err));
}

/* ---------- รับจุด GPS ---------- */
function addTrackPoint(fix) {
  if (!rec || rec.paused) return;
  if (fix.accuracy > TRACK.maxAccuracy) return;
  const p = [+fix.lng.toFixed(6), +fix.lat.toFixed(6), fix.time || Date.now(),
             fix.altitude != null ? Math.round(fix.altitude * 10) / 10 : null, Math.round(fix.accuracy)];
  const t = rec.track;
  if (rec.lastPt) {
    const d = haversine(rec.lastPt, p);
    if (d < TRACK.minDistance) return;
    t.distance += d;
  }
  t.segments[t.segments.length - 1].push(p);
  rec.lastPt = p;

  const z = zoneAt(p[0], p[1], false);
  const zn = z && displayName(z.layer, z.feature.properties);
  if (zn && !t.zones.includes(zn)) t.zones.push(zn);

  map.getSource('track-live')?.setData(trackFeature(t));
  saveTrack(false);
}
fixListeners.push(addTrackPoint);

/* ---------- วาดบนแผนที่ ---------- */
function trackFeature(t) {
  return {
    type: 'Feature', properties: { id: t.id },
    geometry: { type: 'MultiLineString', coordinates: t.segments.filter(s => s.length).map(s => s.map(p => [p[0], p[1]])) },
  };
}

function renderTrackMap() {
  if (!map.getSource('tracks-saved')) return;
  map.getSource('tracks-saved').setData({
    type: 'FeatureCollection',
    features: tracks.filter(t => !t.active && shownTracks.has(t.id)).map(trackFeature),
  });
  map.getSource('track-live').setData(rec ? trackFeature(rec.track) : emptyFC());
}

onMapReady.push(() => {
  map.addSource('tracks-saved', { type: 'geojson', data: emptyFC() });
  map.addSource('track-live', { type: 'geojson', data: emptyFC() });
  const width = ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5, 18, 8];
  const casing = ['interpolate', ['linear'], ['zoom'], 8, 4.5, 14, 8, 18, 12];
  for (const src of ['tracks-saved', 'track-live']) {
    map.addLayer({ id: `${src}-casing`, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': casing, 'line-opacity': src === 'track-live' ? 0.9 : 0.6 } });
    map.addLayer({ id: `${src}-line`, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': TRACK.color, 'line-width': width, 'line-opacity': src === 'track-live' ? 1 : 0.7 } });
  }
  renderTrackMap();
});

/* ---------- แถบควบคุมขณะบันทึก ---------- */
const ICON_PAUSE = '<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
const ICON_PLAY = '<svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

function updateRecUI() {
  const on = !!rec;
  $('recBar').classList.toggle('hidden', !on);
  $('recBar').classList.toggle('flex', on);
  $('btnRecord').classList.toggle('hidden', on);
  clearInterval(recTimer);
  if (!on) return;
  $('btnRecPause').innerHTML = rec.paused ? ICON_PLAY : ICON_PAUSE;
  $('btnRecPause').setAttribute('aria-label', rec.paused ? 'บันทึกต่อ' : 'พักการบันทึก');
  $('recDot').className = `w-3 h-3 rounded-full flex-none ${rec.paused ? 'bg-gray-400' : 'bg-red-600 animate-pulse'}`;
  const tickRec = () => {
    if (!rec) { clearInterval(recTimer); return; }
    $('recTime').textContent = (rec.paused ? 'พัก · ' : '') + fmtDuration(elapsedOf(rec.track));
    $('recDist').textContent = fmtKm(rec.track.distance) + (rec.track.zones.length ? ` · ${rec.track.zones.join(', ')}` : '');
  };
  tickRec();
  recTimer = setInterval(tickRec, 1000);
}

$('btnRecord').onclick = startRecording;
$('btnRecPause').onclick = () => rec && (rec.paused ? resumeRecording() : pauseRecording());
$('btnRecStop').onclick = stopRecording;

document.addEventListener('visibilitychange', () => {
  if (!rec) return;
  if (document.visibilityState === 'hidden') saveTrack(true);
  else if (!rec.paused) keepAwake(true);   // wake lock หลุดเมื่อสลับแอป ต้องขอใหม่
});
window.addEventListener('pagehide', () => saveTrack(true));

/* ---------- รายการเส้นทางในแผงชั้นข้อมูล ---------- */
function renderTrackList() {
  const list = tracks.filter(t => !t.active);
  $('trackList').innerHTML = list.length ? list.map(t => `
    <div class="rounded-2xl border border-gray-200 p-3 flex items-center gap-2">
      <button data-track-fit="${t.id}" class="flex-1 min-w-0 text-left flex items-center gap-3 active:opacity-60">
        <svg class="w-8 h-8 flex-none" viewBox="0 0 32 32"><path d="M5 25c5-1 4-9 10-10s6-8 12-10" fill="none" stroke="${TRACK.color}" stroke-width="3" stroke-linecap="round"/></svg>
        <span class="min-w-0">
          <span class="block font-medium truncate">${escapeHtml(t.name)}</span>
          <span class="block text-xs text-gray-500 truncate">${fmtKm(t.distance)} · ${fmtDurationShort(t.elapsed)}${t.zones.length ? ' · ' + t.zones.map(escapeHtml).join(', ') : ''}</span>
        </span>
      </button>
      <button data-track-show="${t.id}" aria-label="${shownTracks.has(t.id) ? 'ซ่อน' : 'แสดง'}บนแผนที่" class="w-10 h-10 rounded-full grid place-items-center active:bg-gray-100 ${shownTracks.has(t.id) ? 'text-violet-700' : 'text-gray-400'}">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">${shownTracks.has(t.id)
          ? '<path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zM12 17a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z"/>'
          : '<path d="M12 7a5 5 0 015 5c0 .65-.13 1.26-.36 1.83l2.92 2.92A11.8 11.8 0 0023 12c-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55A2.8 2.8 0 009 12a3 3 0 003 3c.22 0 .44-.03.65-.08l1.55 1.55A5 5 0 017.53 9.8zm4.31-.78l3.15 3.15.02-.16a3 3 0 00-3-3l-.17.01z"/>'}</svg>
      </button>
      <button data-track-export="${t.id}" aria-label="ส่งออก GPX" class="w-10 h-10 rounded-full grid place-items-center active:bg-gray-100 text-gray-600">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/></svg>
      </button>
      <button data-track-del="${t.id}" aria-label="ลบ" class="w-10 h-10 rounded-full grid place-items-center active:bg-gray-100 text-gray-600">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>`).join('')
    : '<div class="text-sm text-gray-500 rounded-2xl border border-dashed border-gray-300 p-4 text-center">ยังไม่มีเส้นทาง — กดปุ่ม <span class="inline-block w-2.5 h-2.5 rounded-full bg-red-600 align-middle"></span> บนแผนที่เพื่อเริ่มบันทึก</div>';
}

$('trackList').addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = +(btn.dataset.trackFit || btn.dataset.trackShow || btn.dataset.trackExport || btn.dataset.trackDel);
  const t = tracks.find(x => x.id === id);
  if (!t) return;

  if (btn.dataset.trackFit) {
    shownTracks.add(id);
    store.set('trackShown', [...shownTracks]);
    renderTrackMap(); renderTrackList();
    fitTo(geomBounds(trackFeature(t)));
  } else if (btn.dataset.trackShow) {
    shownTracks.has(id) ? shownTracks.delete(id) : shownTracks.add(id);
    store.set('trackShown', [...shownTracks]);
    renderTrackMap(); renderTrackList();
  } else if (btn.dataset.trackExport) {
    exportGPX(t);
  } else if (btn.dataset.trackDel) {
    if (!await confirmModal(`ลบเส้นทาง "${t.name}"?\nลบแล้วกู้คืนไม่ได้`, { ok: 'ลบ', danger: true })) return;
    await trackDB.del(id);
    tracks = tracks.filter(x => x !== t);
    shownTracks.delete(id);
    store.set('trackShown', [...shownTracks]);
    renderTrackMap(); renderTrackList();
  }
});

/* ---------- ส่งออก GPX (เปิดได้ใน Google Earth, QGIS, แอป GPS ทั่วไป) ---------- */
function toGPX(t) {
  const x = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const segs = t.segments.filter(s => s.length).map(s => '    <trkseg>\n' + s.map(p =>
    `      <trkpt lat="${p[1]}" lon="${p[0]}">${p[3] != null ? `<ele>${p[3]}</ele>` : ''}<time>${new Date(p[2]).toISOString()}</time></trkpt>`
  ).join('\n') + '\n    </trkseg>').join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="แผนที่ลุ่มน้ำ" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${x(t.name)}</name>
    <desc>${x(`${fmtKm(t.distance)} · ${fmtDurationShort(t.elapsed)}${t.zones.length ? ' · ผ่าน ' + t.zones.join(', ') : ''}`)}</desc>
${segs}
  </trk>
</gpx>
`;
}

async function exportGPX(t) {
  const d = new Date(t.startedAt);
  const pad = n => String(n).padStart(2, '0');
  const name = `track-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.gpx`;
  const file = new File([toGPX(t)], name, { type: 'application/gpx+xml' });
  // มือถือ: เปิดหน้าแชร์ (บันทึกลงไฟล์ / ส่ง LINE ฯลฯ) — คอม: ดาวน์โหลด
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: t.name }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- เริ่มต้น: โหลดเส้นทางที่เก็บไว้ ---------- */
(async () => {
  try {
    tracks = (await trackDB.all()).sort((a, b) => b.id - a.id);
  } catch (err) {
    console.error('IndexedDB', err);
    $('btnRecord').classList.add('hidden');
    return;
  }
  // มีเส้นทางที่บันทึกค้างไว้ (แอปถูกปิดระหว่างบันทึก) → กู้กลับมาในสถานะพัก
  const active = tracks.find(t => t.active);
  if (active) {
    const segs = active.segments.filter(s => s.length);
    rec = { track: active, paused: true, lastPt: segs.length ? segs[segs.length - 1].slice(-1)[0] : null, runStart: 0, lastSave: 0 };
    toast('มีเส้นทางที่บันทึกค้างไว้ — กด ▶ เพื่อบันทึกต่อ หรือ ■ เพื่อจบ');
  }
  updateRecUI();
  renderTrackMap();
  renderTrackList();
})();
