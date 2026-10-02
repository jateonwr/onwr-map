'use strict';

/* ============================================================
 *  เครื่องมือวัดระยะทาง
 *  - แตะแผนที่เพื่อเพิ่มจุด · ลากจุดเพื่อย้าย · ลากจุดกลางเส้นเพื่อแทรกจุด · แตะจุดเพื่อลบ
 *  - วัดได้หลายเส้น (กด "เส้นใหม่") แต่ละเส้นคนละสี · จำค่าไว้ในเครื่อง
 * ============================================================ */

const MEASURE_COLORS = ['#e11d48', '#7c3aed', '#0891b2', '#ca8a04', '#16a34a', '#db2777'];

let measureOn = false;
let measures = (store.get('measures', []) || []).filter(m => m && Array.isArray(m.pts) && m.pts.length);
let activeMeasureId = measures.length ? measures[measures.length - 1].id : null;
let measureMarkers = [];

const fmtDist = m => m < 1000 ? `${Math.round(m)} ม.` : `${(m / 1000).toFixed(m < 100000 ? 2 : 1)} กม.`;

function cumulative(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + haversine(pts[i - 1], pts[i]));
  return out;
}
const totalOf = m => cumulative(m.pts).pop() || 0;
const activeMeasure = () => measures.find(m => m.id === activeMeasureId) || null;

function saveMeasures() {
  measures = measures.filter(m => m.pts.length || m.id === activeMeasureId);
  store.set('measures', measures.filter(m => m.pts.length).map(({ id, color, pts }) => ({ id, color, pts })));
}

function newMeasure() {
  const cur = activeMeasure();
  if (cur && !cur.pts.length) return cur;
  const used = new Set(measures.map(m => m.color));
  const color = MEASURE_COLORS.find(c => !used.has(c)) || MEASURE_COLORS[measures.length % MEASURE_COLORS.length];
  const m = { id: Date.now(), color, pts: [] };
  measures.push(m);
  activeMeasureId = m.id;
  return m;
}

/* ---------- วาดเส้น ---------- */
function setMeasureData() {
  map.getSource('measure')?.setData({
    type: 'FeatureCollection',
    features: measures.filter(m => m.pts.length >= 2).map(m => ({
      type: 'Feature', properties: { color: m.color, active: m.id === activeMeasureId },
      geometry: { type: 'LineString', coordinates: m.pts },
    })),
  });
}

onMapReady.push(() => {
  map.addSource('measure', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'measure-casing', type: 'line', source: 'measure', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'active'], 8, 6] } });
  map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'active'], 4, 3], 'line-dasharray': [2, 1.2] } });
  renderMeasure();
});

/* อัปเดตระหว่างลากจุด (ไม่สร้าง marker ใหม่) */
function liveUpdate(m) {
  setMeasureData();
  const cum = cumulative(m.pts);
  (m.labels || []).forEach(([i, mk]) => {
    if (!m.pts[i]) return;
    mk.setLngLat(m.pts[i]);
    mk.getElement().textContent = fmtDist(cum[i]);
  });
  updateMeasurePanel();
}

function addMarker(el, lngLat, opts = {}) {
  const mk = new maplibregl.Marker({ element: el, ...opts }).setLngLat(lngLat).addTo(map);
  measureMarkers.push(mk);
  return mk;
}

function renderMeasure() {
  measureMarkers.forEach(m => m.remove());
  measureMarkers = [];
  const vis = measureOn ? 'visible' : 'none';
  ['measure-casing', 'measure-line'].forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', vis));
  $('measurePanel').classList.toggle('hidden', !measureOn);
  $('btnMeasure').setAttribute('aria-pressed', String(measureOn));
  setMeasureData();
  if (!measureOn) return;

  for (const m of measures) {
    const isActive = m.id === activeMeasureId;
    const cum = cumulative(m.pts);
    m.labels = [];

    // ระยะสะสมที่แต่ละจุด
    m.pts.forEach((p, i) => {
      if (i === 0) return;
      const el = document.createElement('div');
      el.className = 'm-label';
      el.style.setProperty('--c', m.color);
      el.textContent = fmtDist(cum[i]);
      m.labels.push([i, addMarker(el, p, { anchor: 'bottom-left', offset: [10, -8] })]);
    });

    // จุด: ลากเพื่อย้าย · แตะเพื่อลบ (เส้นที่ไม่ได้เลือก: แตะเพื่อเลือกเส้น)
    m.pts.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'm-vertex' + (i === m.pts.length - 1 ? ' last' : '');
      el.style.setProperty('--c', m.color);
      const mk = addMarker(el, p, { draggable: true });
      let moved = false;
      el.addEventListener('pointerdown', () => { moved = false; });
      mk.on('dragstart', () => { moved = true; });
      mk.on('drag', () => { const ll = mk.getLngLat(); m.pts[i] = [ll.lng, ll.lat]; liveUpdate(m); });
      mk.on('dragend', () => { activeMeasureId = m.id; saveMeasures(); renderMeasure(); });
      el.addEventListener('click', ev => {
        ev.stopPropagation();
        if (moved) return;
        if (!isActive) { activeMeasureId = m.id; renderMeasure(); return; }
        m.pts.splice(i, 1);
        saveMeasures(); renderMeasure();
      });
    });

    // จุดกลางเส้น (เฉพาะเส้นที่เลือก): ลากหรือแตะเพื่อแทรกจุด
    if (isActive) {
      for (let i = 0; i < m.pts.length - 1; i++) {
        const a = m.pts[i], b = m.pts[i + 1];
        const el = document.createElement('div');
        el.className = 'm-mid';
        el.style.setProperty('--c', m.color);
        const mk = addMarker(el, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { draggable: true });
        let inserted = false;
        const insert = () => { if (!inserted) { const ll = mk.getLngLat(); m.pts.splice(i + 1, 0, [ll.lng, ll.lat]); inserted = true; } };
        mk.on('dragstart', insert);
        mk.on('drag', () => { const ll = mk.getLngLat(); m.pts[i + 1] = [ll.lng, ll.lat]; liveUpdate(m); });
        mk.on('dragend', () => { saveMeasures(); renderMeasure(); });
        el.addEventListener('click', ev => { ev.stopPropagation(); if (inserted) return; insert(); saveMeasures(); renderMeasure(); });
      }
    }
  }
  updateMeasurePanel();
}

/* ---------- แผงควบคุม ---------- */
function updateMeasurePanel() {
  const m = activeMeasure();
  $('measureSwatch').style.background = m ? m.color : MEASURE_COLORS[0];
  $('measureTotal').textContent = fmtDist(m ? totalOf(m) : 0);
  $('measureHint').textContent = !m || !m.pts.length ? 'แตะแผนที่เพื่อเพิ่มจุด'
    : 'แตะแผนที่เพิ่มจุด · ลากจุดเพื่อย้าย · แตะจุดเพื่อลบ';
  $('btnMeasureUndo').disabled = !m || !m.pts.length;
  $('btnMeasureUndo').style.opacity = $('btnMeasureUndo').disabled ? '0.35' : '';

  const list = measures.filter(x => x.pts.length);
  $('measureList').innerHTML = list.length > 1 || (list.length === 1 && list[0].id !== activeMeasureId) ? list.map((x, n) => `
    <span class="inline-flex items-center rounded-full ${x.id === activeMeasureId ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'} text-[13px] h-8">
      <button data-msel="${x.id}" class="flex items-center gap-1.5 pl-2.5 pr-1.5 h-8">
        <span class="w-2.5 h-2.5 rounded-full" style="background:${x.color}"></span>เส้น ${n + 1} · ${fmtDist(totalOf(x))}
      </button>
      <button data-mdel="${x.id}" aria-label="ลบเส้น ${n + 1}" class="w-7 h-8 grid place-items-center opacity-70">✕</button>
    </span>`).join('') + (list.length > 1 ? `
    <button data-mclear class="rounded-full text-[13px] h-8 px-3 text-red-600 bg-red-50">ล้างทั้งหมด</button>` : '') : '';
}

$('measureList').addEventListener('click', async e => {
  const sel = e.target.closest('[data-msel]'), del = e.target.closest('[data-mdel]'), clr = e.target.closest('[data-mclear]');
  if (sel) {
    activeMeasureId = +sel.dataset.msel;
    const m = activeMeasure();
    if (m && m.pts.length >= 2) map.fitBounds(geomBounds({ geometry: { coordinates: m.pts } }), { padding: 80, maxZoom: 15 });
  } else if (del) {
    const id = +del.dataset.mdel;
    measures = measures.filter(m => m.id !== id);
    if (activeMeasureId === id) activeMeasureId = measures.length ? measures[measures.length - 1].id : null;
  } else if (clr) {
    if (!await confirmModal('ล้างเส้นวัดระยะทั้งหมด?', { ok: 'ล้างทั้งหมด', danger: true })) return;
    measures = []; activeMeasureId = null;
  } else return;
  saveMeasures(); renderMeasure();
});

$('btnMeasure').onclick = () => {
  measureOn = !measureOn;
  if (measureOn) {
    closeSheet('infoSheet');
    if (!activeMeasure()) newMeasure();
  }
  saveMeasures();
  renderMeasure();
};

$('btnMeasureUndo').onclick = () => {
  const m = activeMeasure();
  if (!m || !m.pts.length) return;
  m.pts.pop();
  saveMeasures(); renderMeasure();
};

$('btnMeasureNew').onclick = () => { newMeasure(); renderMeasure(); };

/* แตะแผนที่ระหว่างเปิดเครื่องมือ = เพิ่มจุด (ไม่เปิดแผงข้อมูล) */
clickInterceptors.push(e => {
  if (!measureOn) return false;
  const t = e.originalEvent && e.originalEvent.target;
  if (t && t.closest && t.closest('.m-vertex, .m-mid')) return true;
  const m = activeMeasure() || newMeasure();
  m.pts.push([+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]);
  saveMeasures(); renderMeasure();
  return true;
});
