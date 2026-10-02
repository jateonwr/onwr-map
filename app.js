'use strict';

/* ============================================================
 *  ตั้งค่า — แผนที่ฐาน และชั้นข้อมูลซ้อนทับ
 *  เพิ่มชั้นข้อมูลใหม่ได้โดยเพิ่ม object ใน OVERLAYS
 * ============================================================ */

const BASEMAPS = [
  {
    id: 'streets', name: 'ถนน',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxzoom: 19,
  },
  {
    id: 'satellite', name: 'ดาวเทียม',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
  },
  {
    id: 'topo', name: 'ภูมิประเทศ',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
    attribution: '© Esri, HERE, Garmin, USGS',
    maxzoom: 19,
  },
];

const FIELD_LABELS = {
  // ทุ่งรับน้ำ (พื้นที่ลุ่มต่ำ 10+1)
  AREA_NAME: 'ชื่อทุ่ง', PROV_NAM_T: 'จังหวัด', AMPHOE_T: 'อำเภอ', OVER_R: 'รับน้ำจาก', Basin: 'ลุ่มน้ำ',
  STORAGE: 'พื้นที่รับน้ำ (ไร่)', DEPTH: 'ความลึกน้ำ (ม.)', Cap_MCM: 'ความจุ (ล้าน ลบ.ม.)',
  Status_Now: 'ปริมาณน้ำปัจจุบัน (ล้าน ลบ.ม.)',
  // แหล่งน้ำขนาดใหญ่ / ขนาดกลาง
  name: 'ชื่อ', tambol: 'ตำบล', amphoe: 'อำเภอ', province: 'จังหวัด', storage: 'ความจุ (ล้าน ลบ.ม.)',
  agency: 'หน่วยงาน', Basin22: 'ลุ่มน้ำ', ONWR_Reg: 'สทนช. ภาค', REMARK: 'หมายเหตุ',
  // สถานี
  stn_code: 'รหัสสถานี', lat: 'ละติจูด', lng: 'ลองจิจูด',
  dam_storage: 'ความจุที่ระดับเก็บกัก (ล้าน ลบ.ม.)', dam_volume: 'ปริมาณน้ำในอ่าง (ล้าน ลบ.ม.)',
  dam_percent_storage: 'ปริมาณน้ำ (% ความจุ)',
  // ลำน้ำ
  STREAM_ID: 'รหัสลำน้ำ', STREAM_NAM: 'ชื่อลำน้ำ', LOCAL_NAME: 'ชื่อท้องถิ่น',
  Hy_use_des: 'ลักษณะทางน้ำ', STRCLAS_DE: 'ชั้นลำน้ำ', SHAPE_Leng: 'ความยาว (กม.)', length_km: 'ความยาวรวม (กม.)',
  str_code: 'รหัสลำน้ำ', str_name: 'ชื่อลำน้ำ', SUBBASIN: 'ลุ่มน้ำสาขา', MBASIN: 'ลุ่มน้ำหลัก',
  STREFFCODE: 'รหัสจุดตรวจวัด', EFF_KM: 'กม. ที่', Descp: 'รายละเอียด', Length_km: 'ความยาว (กม.)',
};

const TUNG_FILL = '#c7bca8';
const TUNG_LINE = '#1e3a8a';   // ขอบทุ่งรับน้ำ: น้ำเงินเข้ม

const OVERLAYS = [
  {
    id: 'tung', name: 'ทุ่งรับน้ำ', url: 'data/tung.geojson', visible: true, opacity: 0.75,
    swatch: TUNG_FILL, outline: TUNG_LINE,
    titleField: 'AREA_NAME', legend: true, labels: true, isZone: true,
    // บรรทัดใต้ชื่อทุ่ง: (ความจุ/ปริมาณน้ำปัจจุบัน/ปริมาณ÷ความจุ %)
    labelExtra: p => {
      const cap = p.Cap_MCM, now = p.Status_Now;
      if (cap == null && now == null) return '';
      const pct = cap > 0 && now != null ? `${Math.round(now / cap * 100)}%` : '–';
      return `(${cap != null ? fmt(cap) : '–'}/${now != null ? fmt(now) : '–'}/${pct})`;
    },
    layers: (src, op) => [
      { id: `${src}-fill`, type: 'fill', source: src,
        paint: { 'fill-color': TUNG_FILL, 'fill-opacity': op } },
      { id: `${src}-line`, type: 'line', source: src, layout: { 'line-join': 'round' },
        paint: { 'line-color': TUNG_LINE, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 3, 15, 4] } },
    ],
    opacityProps: [['fill', 'fill-opacity', 1]],
  },
  {
    id: 'water-m', name: 'แหล่งน้ำขนาดกลาง', url: 'data/water-m.geojson', visible: true, opacity: 0.6,
    swatch: '#7dd3fc', outline: '#0284c7', titleField: 'name',
    layers: (src, op) => [
      { id: `${src}-fill`, type: 'fill', source: src, paint: { 'fill-color': '#7dd3fc', 'fill-opacity': op } },
      { id: `${src}-line`, type: 'line', source: src,
        paint: { 'line-color': '#0284c7', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 12, 1.5] } },
    ],
    opacityProps: [['fill', 'fill-opacity', 1]],
  },
  {
    id: 'water-l', name: 'แหล่งน้ำขนาดใหญ่', url: 'data/water-l.geojson', visible: true, opacity: 0.7,
    swatch: '#38bdf8', outline: '#0369a1', titleField: 'name',
    labels: true, labelClass: 'water-label', labelMinZoom: 7.5,
    // บรรทัดใต้ชื่อเขื่อน: (ความจุ/ปริมาณน้ำ/%)
    labelExtra: p => p.dam_storage == null && p.dam_volume == null ? ''
      : `(${p.dam_storage != null ? fmt(p.dam_storage) : '–'}/${p.dam_volume != null ? fmt(p.dam_volume) : '–'}/${p.dam_percent_storage != null ? `${Math.round(p.dam_percent_storage)}%` : '–'})`,
    layers: (src, op) => [
      { id: `${src}-fill`, type: 'fill', source: src, paint: { 'fill-color': '#38bdf8', 'fill-opacity': op } },
      { id: `${src}-line`, type: 'line', source: src,
        paint: { 'line-color': '#0369a1', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 2] } },
    ],
    opacityProps: [['fill', 'fill-opacity', 1]],
  },
  {
    // แหล่งน้ำอื่น ๆ (จุด) — เพิ่มจุดได้ใน data/water-other.geojson
    id: 'water-other', name: 'แหล่งน้ำอื่น ๆ', url: 'data/water-other.geojson', visible: true, opacity: 1,
    swatch: '#0284c7', titleField: 'name',
    labels: true, labelClass: 'water-label', labelMinZoom: 7.5, labelAnchor: 'left', labelOffset: [15, 0],
    layers: (src, op) => [
      { id: `${src}-icon`, type: 'symbol', source: src,
        layout: { 'icon-image': 'rect-blue', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                  'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.75, 12, 1.1] },
        paint: { 'icon-opacity': op } },
    ],
    opacityProps: [['icon', 'icon-opacity', 1]],
  },
  {
    id: 'streams-sub', name: 'ลำน้ำสาขา', url: 'data/streams-sub.geojson', visible: true, opacity: 1,
    swatch: '#0ea5e9', titleField: 'str_name',
    layers: (src, op) => [
      { id: `${src}-line`, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0ea5e9', 'line-opacity': op,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 10, 2, 15, 4] } },
    ],
    opacityProps: [['line', 'line-opacity', 1]],
  },
  {
    id: 'streams-main', name: 'ลำน้ำหลัก', url: 'data/streams-main.geojson', visible: true, opacity: 1,
    swatch: '#1d4ed8', titleField: 'STREAM_NAM',
    lineLabels: 'data/streams-main-labels.json',   // จุดวางชื่อตามแนวแม่น้ำ (คำนวณไว้ล่วงหน้า: ตำแหน่ง, มุม, ซูมขั้นต่ำ)
    labelMinZoom: 7.5,                             // ระดับซูมที่เริ่มแสดงชื่อแม่น้ำ
    layers: (src, op) => [
      { id: `${src}-casing`, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-opacity': op * 0.8,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 10, 5, 15, 9] } },
      { id: `${src}-line`, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1d4ed8', 'line-opacity': op,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.8, 10, 3, 15, 6] } },
    ],
    opacityProps: [['casing', 'line-opacity', 0.8], ['line', 'line-opacity', 1]],
  },
  {
    id: 'stations', name: 'สถานี', url: 'data/stations.geojson', visible: true, opacity: 1,
    swatch: '#f97316', titleField: 'stn_code',
    labels: true, labelClass: 'stn-label', labelMinZoom: 7.5, labelAnchor: 'left', labelOffset: [10, 0],
    layers: (src, op) => [
      { id: `${src}-circle`, type: 'circle', source: src,
        paint: { 'circle-color': '#f97316', 'circle-opacity': op, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2,
                 'circle-stroke-opacity': op, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 8] } },
    ],
    opacityProps: [['circle', 'circle-opacity', 1], ['circle', 'circle-stroke-opacity', 1]],
  },
];

/* ============================================================
 *  สร้างแผนที่
 * ============================================================ */

const LOCATE_ZOOM = 10;     // ระดับซูมเมื่อกดปุ่มตำแหน่งของฉัน (มากขึ้น = ใกล้ขึ้น)

const $ = id => document.getElementById(id);
/* เทียบชื่อแบบไม่สนช่องว่าง / การันต์ / นิคหิต+สระอา (ํา = ำ) */
const normName = s => String(s || '').normalize('NFC').replace(/\s+/g, '').replace(/ํา/g, 'ำ').replace(/์/g, '');

/* จุดเชื่อมให้ไฟล์อื่น (sheet.js, track.js) ต่อเพิ่มความสามารถ */
const onMapReady = [];      // fn()            — หลังโหลดชั้นข้อมูลเสร็จ
const fixListeners = [];    // fn(fix)         — ทุกครั้งที่ได้ตำแหน่ง GPS ใหม่
const infoExtras = [];      // fn(o, f) → html — แถวเพิ่มเติมในแผงข้อมูล
const layerNotes = {};      // [layerId]: () → html — ข้อความใต้ชื่อชั้นข้อมูล
const clickInterceptors = []; // fn(e) → true ถ้าจัดการการแตะแผนที่เองแล้ว (เช่น เครื่องมือวัดระยะ)
const store = {
  get(k, d) { try { const v = localStorage.getItem('wm2:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wm2:' + k, JSON.stringify(v)); } catch {} },
};

let activeBase = store.get('basemap', 'streets');
if (!BASEMAPS.some(b => b.id === activeBase)) activeBase = 'streets';

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: Object.fromEntries(BASEMAPS.map(b => [`base-${b.id}`, {
      type: 'raster', tiles: b.tiles, tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution,
    }])),
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#e5e7eb' } },
      ...BASEMAPS.map(b => ({
        id: `base-${b.id}`, type: 'raster', source: `base-${b.id}`,
        layout: { visibility: b.id === activeBase ? 'visible' : 'none' },
      })),
    ],
  },
  bounds: [[98.2, 13.1], [102.5, 17.3]],
  fitBoundsOptions: { padding: 40 },
  maxPitch: 60,
  attributionControl: false,
});
map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
map.touchPitch.disable();

const overlayState = Object.fromEntries(OVERLAYS.map(o => [o.id, {
  visible: store.get(`vis:${o.id}`, o.visible),
  opacity: store.get(`op:${o.id}`, o.opacity),
  data: null, bounds: null, labels: [], labelEls: {}, lineLabels: [],
}]));

/* ============================================================
 *  โหลดชั้นข้อมูล
 * ============================================================ */

function geomBounds(fc) {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = c => {
    if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); }
    else c.forEach(walk);
  };
  (fc.features || [fc]).forEach(f => f.geometry && walk(f.geometry.coordinates));
  return [[w, s], [e, n]];
}

/* ไอคอนสี่เหลี่ยมผืนผ้า (วาดด้วย canvas) */
function rectIcon(fill, w = 24, h = 14, border = 2.5) {
  const r = 2, c = document.createElement('canvas');
  c.width = w * r; c.height = h * r;
  const g = c.getContext('2d');
  g.scale(r, r);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  g.fillStyle = fill; g.fillRect(border, border, w - border * 2, h - border * 2);
  return { image: g.getImageData(0, 0, w * r, h * r), pixelRatio: r };
}

map.on('load', async () => {
  const icon = rectIcon('#0284c7');
  map.addImage('rect-blue', icon.image, { pixelRatio: icon.pixelRatio });
  // แหล่งข้อมูลตำแหน่งผู้ใช้ (วงความแม่นยำ) + feature ที่ถูกเลือก
  map.addSource('me-accuracy', { type: 'geojson', data: emptyFC() });
  map.addSource('selected', { type: 'geojson', data: emptyFC() });

  await Promise.all(OVERLAYS.map(async o => {
    const st = overlayState[o.id];
    try {
      const res = await fetch(o.url, { cache: 'no-cache' });   // เช็กกับ server ทุกครั้ง กันใช้ไฟล์เก่าที่ค้างในเครื่อง
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (o.enrich) await o.enrich(data);
      st.data = data;
    } catch (err) {
      console.error(o.url, err);
      toast(`โหลด “${o.name}” ไม่สำเร็จ — ต้องเปิดผ่าน web server (ไม่ใช่ file://)`);
      return;
    }
    st.data.features.forEach((f, i) => { f.id = i; });
    st.bounds = geomBounds(st.data);
    map.addSource(o.id, { type: 'geojson', data: st.data });
    if (o.lineLabels) {
      const pts = await fetch(o.lineLabels, { cache: 'no-cache' }).then(r => r.json()).catch(() => []);
      st.lineLabels = pts.map(d => {
        const el = document.createElement('div');
        el.className = 'river-label';
        el.textContent = d.n;
        const m = new maplibregl.Marker({ element: el, rotationAlignment: 'map', rotation: d.r }).setLngLat(d.c);
        m.minZoom = d.z;
        m.river = d.n;
        return m;
      });
      // จัดกลุ่มตามชื่อแม่น้ำ (เรียงตามแนวลำน้ำอยู่แล้ว)
      st.lineGroups = {};
      st.lineLabels.forEach(m => (st.lineGroups[m.river] = st.lineGroups[m.river] || []).push(m));
    }
  }));

  // เรียงลำดับ: polygon ล่าง → เส้น → ไฮไลต์ → วงความแม่นยำ
  for (const o of OVERLAYS) {
    if (!map.getSource(o.id)) continue;
    const st = overlayState[o.id];
    for (const l of o.layers(o.id, st.opacity)) {
      l.layout = { ...(l.layout || {}), visibility: st.visible ? 'visible' : 'none' };
      map.addLayer(l);
    }
    if (o.labels) createLabels(o);
  }
  onMapReady.forEach(fn => fn());
  map.addLayer({ id: 'selected-fill', type: 'fill', source: 'selected', filter: ['==', '$type', 'Polygon'],
    paint: { 'fill-color': '#facc15', 'fill-opacity': 0.25 } });
  map.addLayer({ id: 'selected-line', type: 'line', source: 'selected', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#facc15', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 14, 9], 'line-opacity': 0.85 } });
  map.addLayer({ id: 'me-accuracy-fill', type: 'fill', source: 'me-accuracy', paint: { 'fill-color': '#1a73e8', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'me-accuracy-line', type: 'line', source: 'me-accuracy', paint: { 'line-color': '#1a73e8', 'line-opacity': 0.4, 'line-width': 1 } });

  renderLayerPanel();
  updateLabels();
  if (lastFix) updateZone(lastFix);
});

/* ป้ายชื่อแบบ HTML (รองรับสระ/วรรณยุกต์ภาษาไทยถูกต้อง) */
function createLabels(o) {
  const st = overlayState[o.id];
  st.labelEls = {};
  st.labels = st.data.features
    .filter(f => f.properties.label_lng != null)
    .map(f => {
      const el = document.createElement('div');
      el.className = o.labelClass || 'tung-label';
      el.innerHTML = '<div class="n"></div><div class="c"></div><div class="v"></div>';
      el.firstChild.textContent = f.properties[o.titleField];
      if (o.labelExtra) el.children[1].textContent = o.labelExtra(f.properties);
      st.labelEls[f.properties[o.titleField]] = el;
      return new maplibregl.Marker({ element: el, anchor: o.labelAnchor || 'center', offset: o.labelOffset || [0, 0] }).setLngLat([f.properties.label_lng, f.properties.label_lat]);
    });
}
function showMarker(m, on) {
  if (on && !m.shown) m.addTo(map);
  if (!on && m.shown) m.remove();
  m.shown = on;
}
function updateLabels() {
  const z = map.getZoom();
  const b = map.getBounds();
  const [[w, s], [e, n]] = b.toArray();
  const ix = (e - w) * 0.12, iy = (n - s) * 0.08;   // ขอบด้านใน: ให้ชื่ออยู่ในจอทั้งคำ
  const insideInner = ll => ll.lng > w + ix && ll.lng < e - ix && ll.lat > s + iy && ll.lat < n - iy;
  for (const o of OVERLAYS) {
    const st = overlayState[o.id];
    const on = z >= (o.labelMinZoom ?? 7) && st.visible;   // ค่าเริ่มต้น (ทุ่งรับน้ำ)
    st.labels.forEach(m => showMarker(m, on));
    // ชื่อตามแนวแม่น้ำ: 1 ชื่อต่อแม่น้ำ วางกลางช่วงที่มองเห็นในจอ
    // เลือกจากจุดที่มุมเอียงคำนวณไว้สำหรับระดับซูมนี้ก่อน (ข้อความจะขนานกับลำน้ำพอดี)
    for (const group of Object.values(st.lineGroups || {})) {
      const visible = on ? group.filter(m => insideInner(m.getLngLat())) : [];
      const fit = visible.filter(m => m.minZoom <= z);
      const pool = fit.length ? fit : visible;
      const chosen = pool[Math.floor(pool.length / 2)];
      group.forEach(m => showMarker(m, m === chosen));
    }
  }
}
map.on('moveend', updateLabels);

/* ขนาดตัวอักษรของป้ายเปลี่ยนตามระดับซูม: ซูม 7 → 0.75×, 9 → 0.9×, 11 → 1×, 13+ → 1.2× */
const LABEL_SCALE = [[7, 0.75], [9, 0.9], [11, 1], [13, 1.2]];
function labelScale(z) {
  if (z <= LABEL_SCALE[0][0]) return LABEL_SCALE[0][1];
  for (let i = 1; i < LABEL_SCALE.length; i++) {
    const [z1, s1] = LABEL_SCALE[i], [z0, s0] = LABEL_SCALE[i - 1];
    if (z <= z1) return s0 + (s1 - s0) * (z - z0) / (z1 - z0);
  }
  return LABEL_SCALE[LABEL_SCALE.length - 1][1];
}
let lastLabelScale = null;
function applyLabelScale() {
  const ls = Math.round(labelScale(map.getZoom()) * 100) / 100;
  if (ls === lastLabelScale) return;
  lastLabelScale = ls;
  map.getContainer().style.setProperty('--ls', ls);
}
map.on('zoom', applyLabelScale);
applyLabelScale();

/* ============================================================
 *  แผงชั้นข้อมูล
 * ============================================================ */

function tileThumb(b) {
  const lng = 100.5, lat = 14.4, z = 9;
  const x = Math.floor((lng + 180) / 360 * 2 ** z);
  const r = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
  return b.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

function renderLayerPanel() {
  $('basemapList').innerHTML = BASEMAPS.map(b => `
    <button data-base="${b.id}" class="group flex flex-col items-center gap-1.5">
      <span class="block w-full aspect-square rounded-xl overflow-hidden ring-2 ${b.id === activeBase ? 'ring-blue-600' : 'ring-transparent'} bg-gray-200">
        <img src="${tileThumb(b)}" alt="" class="w-full h-full object-cover" loading="lazy" />
      </span>
      <span class="text-sm ${b.id === activeBase ? 'text-blue-700 font-semibold' : 'text-gray-700'}">${b.name}</span>
    </button>`).join('');

  $('overlayList').innerHTML = OVERLAYS.map(o => {
    const st = overlayState[o.id];
    const failed = !map.getSource(o.id);
    const legend = o.legend && st.data ? `
      <div class="flex flex-wrap gap-1.5 mt-3 ${st.visible ? '' : 'hidden'}" data-legend="${o.id}">
        ${st.data.features.map(f => `
          <button data-zoomfeat="${o.id}:${f.id}" class="flex items-center gap-1.5 rounded-full bg-gray-100 active:bg-gray-200 pl-2 pr-2.5 h-8 text-[13px]">
            <span class="w-2.5 h-2.5 rounded-sm" style="${swatchStyle(o)}"></span>${f.properties[o.titleField]}
          </button>`).join('')}
      </div>` : '';
    return `
      <div class="rounded-2xl border border-gray-200 p-4 ${failed ? 'opacity-50' : ''}">
        <div class="flex items-center gap-3">
          <span class="w-9 h-9 rounded-lg flex-none" style="${swatchStyle(o, 3)}"></span>
          <div class="flex-1 min-w-0">
            <div class="font-medium">${o.name}</div>
            <div class="text-xs text-gray-500">${failed ? 'โหลดไม่สำเร็จ' : `${st.data.features.length} รายการ`}</div>
            ${!failed && layerNotes[o.id] ? layerNotes[o.id]() : ''}
          </div>
          <button data-fit="${o.id}" aria-label="ซูมไปที่${o.name}" class="w-10 h-10 rounded-full grid place-items-center active:bg-gray-100 ${failed ? 'hidden' : ''}">
            <svg class="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor"><path d="M5 15H3v4c0 1.1.9 2 2 2h4v-2H5v-4zM5 5h4V3H5c-1.1 0-2 .9-2 2v4h2V5zm14-2h-4v2h4v4h2V5c0-1.1-.9-2-2-2zm0 16h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zM12 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
          <label class="switch"><input type="checkbox" data-toggle="${o.id}" ${st.visible ? 'checked' : ''} ${failed ? 'disabled' : ''}><span></span></label>
        </div>
        <div class="flex items-center gap-3 mt-3 ${st.visible && !failed ? '' : 'hidden'}" data-opwrap="${o.id}">
          <span class="text-xs text-gray-500 w-14">ความทึบ</span>
          <input type="range" min="0.1" max="1" step="0.05" value="${st.opacity}" data-opacity="${o.id}" class="flex-1">
        </div>
        ${legend}
      </div>`;
  }).join('');
}

$('basemapList').addEventListener('click', e => {
  const btn = e.target.closest('[data-base]');
  if (!btn) return;
  activeBase = btn.dataset.base;
  store.set('basemap', activeBase);
  BASEMAPS.forEach(b => map.setLayoutProperty(`base-${b.id}`, 'visibility', b.id === activeBase ? 'visible' : 'none'));
  document.querySelectorAll('.tung-label, .water-label, .stn-label, .river-label').forEach(el => {
    el.style.color = activeBase === 'satellite' ? '#fff' : '';
    el.style.textShadow = activeBase === 'satellite' ? '0 0 3px #000, 0 0 3px #000' : '';
  });
  renderLayerPanel();
});

$('overlayList').addEventListener('change', e => {
  const id = e.target.dataset.toggle;
  if (!id) return;
  const o = OVERLAYS.find(x => x.id === id), st = overlayState[id];
  st.visible = e.target.checked;
  store.set(`vis:${id}`, st.visible);
  o.layers(id, st.opacity).forEach(l => map.setLayoutProperty(l.id, 'visibility', st.visible ? 'visible' : 'none'));
  document.querySelector(`[data-opwrap="${id}"]`)?.classList.toggle('hidden', !st.visible);
  document.querySelector(`[data-legend="${id}"]`)?.classList.toggle('hidden', !st.visible);
  updateLabels();
  if (lastFix) updateZone(lastFix);
});

$('overlayList').addEventListener('input', e => {
  const id = e.target.dataset.opacity;
  if (!id) return;
  const o = OVERLAYS.find(x => x.id === id), st = overlayState[id];
  st.opacity = +e.target.value;
  store.set(`op:${id}`, st.opacity);
  o.opacityProps.forEach(([suffix, prop, k]) => map.setPaintProperty(`${id}-${suffix}`, prop, st.opacity * k));
});

$('overlayList').addEventListener('click', e => {
  const fit = e.target.closest('[data-fit]');
  if (fit) { fitTo(overlayState[fit.dataset.fit].bounds); return; }
  const zf = e.target.closest('[data-zoomfeat]');
  if (zf) {
    const [id, fid] = zf.dataset.zoomfeat.split(':');
    const o = OVERLAYS.find(x => x.id === id);
    const f = overlayState[id].data.features[+fid];
    fitTo(geomBounds(f));
    showInfo(o, f);
  }
});

function fitTo(bounds) {
  if (!bounds) return;
  setFollow('off');
  closeSheet('layerSheet');
  const wide = matchMedia('(min-width: 768px)').matches;
  map.fitBounds(bounds, { padding: wide ? { top: 60, bottom: 60, left: 60, right: 80 } : { top: 140, bottom: 80, left: 30, right: 80 }, maxZoom: 14 });
}

/* ============================================================
 *  แผง (sheet) เปิด/ปิด + ลากลงเพื่อปิด
 * ============================================================ */

function openSheet(id) {
  if (id === 'layerSheet') closeSheet('infoSheet');
  $(id).classList.remove('closed');
  if (id === 'layerSheet') $('backdrop').classList.remove('hidden');
}
function closeSheet(id) {
  $(id).classList.add('closed');
  if (id === 'layerSheet') $('backdrop').classList.add('hidden');
  if (id === 'infoSheet') { selectedInfo = null; map.getSource('selected')?.setData(emptyFC()); }
}
$('btnLayers').onclick = () => $('layerSheet').classList.contains('closed') ? openSheet('layerSheet') : closeSheet('layerSheet');
$('backdrop').onclick = () => closeSheet('layerSheet');
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeSheet(b.closest('aside').id));

for (const id of ['layerSheet', 'infoSheet']) {
  const el = $(id);
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', e => {
    const scroller = e.target.closest('.overflow-y-auto');
    if (matchMedia('(min-width: 768px)').matches || (scroller && scroller.scrollTop > 0)) return;
    y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (y0 == null) return;
    el.style.transition = ''; el.style.transform = '';
    if (dy > 80) closeSheet(id);
    y0 = null;
  });
}

/* ============================================================
 *  แตะ feature → แสดงข้อมูล
 * ============================================================ */

const clickableLayers = () => OVERLAYS.flatMap(o => o.layers(o.id, 1).map(l => l.id))
  .filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none' && !/-(casing|label2?)$/.test(id));

map.on('click', e => {
  if (clickInterceptors.some(fn => fn(e))) return;
  const pad = 10;
  const hits = map.queryRenderedFeatures(
    [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]], { layers: clickableLayers() });
  if (!hits.length) { closeSheet('infoSheet'); return; }
  // เส้น (ลำน้ำ) มาก่อน polygon เพราะแตะยากกว่า
  hits.sort((a, b) => (a.layer.type === 'fill') - (b.layer.type === 'fill'));
  const f = hits[0];
  const o = OVERLAYS.find(x => x.id === f.source);
  showInfo(o, overlayState[o.id].data.features[f.id]);
});

function fmt(v) {
  if (typeof v === 'number') return v.toLocaleString('th-TH', { maximumFractionDigits: 2 });
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v))
    return new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return String(v);
}

let selectedInfo = null;   // { o, f } ที่แสดงในแผงข้อมูลอยู่

function showInfo(o, f) {
  selectedInfo = { o, f };
  const p = f.properties;
  $('infoTitle').textContent = p[o.titleField] || '(ไม่มีชื่อ)';
  $('infoLayer').textContent = o.name;
  $('infoSwatch').style.cssText = swatchStyle(o);
  $('infoBody').innerHTML = Object.entries(p)
    .filter(([k, v]) => FIELD_LABELS[k] && k !== o.titleField && v !== null && v !== '')
    .map(([k, v]) => `<div class="flex gap-4 py-2.5"><dt class="w-32 flex-none text-gray-500">${FIELD_LABELS[k]}</dt><dd class="flex-1 min-w-0 break-words">${escapeHtml(fmt(v))}</dd></div>`)
    .join('') + infoExtras.map(fn => fn(o, f) || '').join('');
  map.getSource('selected').setData({ type: 'FeatureCollection', features: [f] });
  closeSheet('layerSheet');
  openSheet('infoSheet');
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function swatchStyle(o, border = 2) {
  return `background:${o.swatch};` + (o.outline ? `box-shadow:inset 0 0 0 ${border}px ${o.outline};` : '');
}
function emptyFC() { return { type: 'FeatureCollection', features: [] }; }

/* ============================================================
 *  ติดตามตำแหน่ง (GPS) + เข็มทิศ
 * ============================================================ */

const ICONS = {
  off:     '<path d="M20.94 11A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>',
  follow:  '<path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>',
  compass: '<path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>',
};

let watchId = null;
let lastFix = null;          // { lng, lat, accuracy, speed, heading, time }
let follow = 'off';          // 'off' | 'follow' | 'compass'
let compassHeading = null;   // องศาจากทิศเหนือ (จากเซนเซอร์)
let orientationOn = false;
let staleTimer = null;
const shown = { lng: null, lat: null, heading: null };  // ค่าที่แสดงจริง (ทำ smoothing)

const meEl = document.createElement('div');
meEl.className = 'me';
meEl.innerHTML = `
  <svg class="cone" viewBox="0 0 88 88"><defs><radialGradient id="cg" cx="44" cy="44" r="44" gradientUnits="userSpaceOnUse">
    <stop offset="0.2" stop-color="#1a73e8" stop-opacity="0.55"/><stop offset="1" stop-color="#1a73e8" stop-opacity="0"/></radialGradient></defs>
    <path d="M44 44 L24 4 A44 44 0 0 1 64 4 Z" fill="url(#cg)"/></svg>
  <div class="pulse"></div><div class="dot"></div>`;
const meMarker = new maplibregl.Marker({ element: meEl, rotationAlignment: 'map', pitchAlignment: 'map' });

function setLocateIcon() {
  const ico = $('icoLocate');
  ico.innerHTML = follow === 'compass' ? ICONS.compass : (follow === 'follow' ? ICONS.follow : ICONS.off);
  ico.classList.toggle('text-blue-600', follow !== 'off');
  ico.classList.toggle('text-gray-600', follow === 'off');
}

function setFollow(mode) {
  follow = mode;
  setLocateIcon();
  if (mode === 'follow' && map.getBearing() !== 0) map.easeTo({ bearing: 0, duration: 400 });
}

function status(text) { const el = $('gpsStatus'); if (el) el.textContent = text; }

function startTracking() {
  if (!('geolocation' in navigator)) { toast('อุปกรณ์นี้ไม่รองรับ GPS'); return false; }
  if (!window.isSecureContext) { toast('GPS ต้องเปิดผ่าน HTTPS หรือ localhost'); }
  status('กำลังหาตำแหน่ง…');
  watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true, maximumAge: 1000, timeout: 20000,
  });
  return true;
}

function onPosition(pos) {
  const c = pos.coords;
  const first = !lastFix;
  lastFix = { lng: c.longitude, lat: c.latitude, accuracy: c.accuracy, speed: c.speed, heading: c.heading, altitude: c.altitude, time: pos.timestamp };

  if (first) {
    shown.lng = lastFix.lng; shown.lat = lastFix.lat;
    meMarker.setLngLat([shown.lng, shown.lat]).addTo(map);
    if (follow !== 'off') map.flyTo({ center: [lastFix.lng, lastFix.lat], zoom: LOCATE_ZOOM, duration: 1200 });
  }
  map.getSource('me-accuracy')?.setData(circle(lastFix.lng, lastFix.lat, lastFix.accuracy));

  const spd = c.speed != null && c.speed >= 0 ? ` · ${(c.speed * 3.6).toFixed(0)} กม./ชม.` : '';
  status(`ความแม่นยำ ±${Math.round(c.accuracy)} ม.${spd}`);

  meEl.classList.remove('stale');
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => { meEl.classList.add('stale'); status('สัญญาณ GPS ขาดหาย…'); }, 30000);

  updateZone(lastFix);
  fixListeners.forEach(fn => fn(lastFix));
}

function onPositionError(err) {
  const msg = {
    1: 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ Location ในการตั้งค่าเบราว์เซอร์',
    2: 'หาตำแหน่งไม่ได้ (ไม่มีสัญญาณ GPS)',
    3: 'หาตำแหน่งนานเกินไป กำลังลองใหม่…',
  }[err.code] || err.message;
  status(msg);
  if (err.code === 1) {
    toast(msg);
    navigator.geolocation.clearWatch(watchId); watchId = null; setFollow('off');
  }
}

/* ทิศทางจากเข็มทิศของเครื่อง (iOS ต้องขออนุญาตจากการแตะ) */
async function enableOrientation() {
  if (orientationOn) return true;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false;
    }
  } catch { return false; }
  const evt = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evt, onOrientation, true);
  orientationOn = true;
  return true;
}

function screenAngle() {
  return (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
}

function onOrientation(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;           // iOS
  else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) h = 360 - e.alpha; // Android
  if (h == null) return;
  compassHeading = (h + screenAngle() + 360) % 360;
}

/* ทิศที่ใช้แสดง: เข็มทิศก่อน ถ้าไม่มีใช้ทิศการเคลื่อนที่ของ GPS (เมื่อเคลื่อนที่เร็วพอ) */
function currentHeading() {
  if (compassHeading != null) return compassHeading;
  if (lastFix && lastFix.heading != null && !isNaN(lastFix.heading) && (lastFix.speed ?? 0) > 1) return lastFix.heading;
  return null;
}

$('btnLocate').onclick = async () => {
  if (watchId == null) {
    if (startTracking()) { setFollow('follow'); enableOrientation(); }
    return;
  }
  if (follow === 'off') {
    setFollow('follow');
    if (lastFix) map.easeTo({ center: [lastFix.lng, lastFix.lat], zoom: LOCATE_ZOOM, bearing: 0, duration: 600 });
  } else if (follow === 'follow') {
    const ok = await enableOrientation();
    if (!ok && currentHeading() == null) { toast('ไม่ได้รับอนุญาตให้ใช้เข็มทิศ'); return; }
    setFollow('compass');
  } else {
    setFollow('follow');
  }
};

/* ผู้ใช้ลาก/หมุนแผนที่เอง → เลิกติดตาม */
map.on('dragstart', e => { if (e.originalEvent && follow !== 'off') setFollow('off'); });
map.on('rotatestart', e => { if (e.originalEvent && follow === 'compass') setFollow('follow'); });

let userTouching = 0;
const mapEl = map.getCanvasContainer();
mapEl.addEventListener('touchstart', e => { userTouching = e.touches.length; }, { passive: true });
mapEl.addEventListener('touchend', e => { userTouching = e.touches.length; }, { passive: true });

/* ลูปแอนิเมชัน: เลื่อนจุด + กล้องอย่างนุ่มนวล */
function angleLerp(a, b, t) { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }

function tick() {
  requestAnimationFrame(tick);
  if (!lastFix) return;

  shown.lng += (lastFix.lng - shown.lng) * 0.15;
  shown.lat += (lastFix.lat - shown.lat) * 0.15;
  meMarker.setLngLat([shown.lng, shown.lat]);

  const h = currentHeading();
  if (h == null) {
    meEl.classList.remove('has-heading');
  } else {
    shown.heading = shown.heading == null ? h : angleLerp(shown.heading, h, 0.2);
    meEl.classList.add('has-heading');
    meMarker.setRotation(shown.heading);
  }

  if (follow === 'off' || userTouching || map.isZooming() || map.isRotating()) return;
  if (map.isEasing && map.isEasing()) return;

  const cam = {};
  const ctr = map.getCenter();
  if (Math.abs(ctr.lng - shown.lng) > 1e-7 || Math.abs(ctr.lat - shown.lat) > 1e-7) cam.center = [shown.lng, shown.lat];
  if (follow === 'compass' && shown.heading != null) {
    const b = angleLerp(map.getBearing() < 0 ? map.getBearing() + 360 : map.getBearing(), shown.heading, 0.15);
    if (Math.abs(((b - map.getBearing() + 540) % 360) - 180) > 0.2) cam.bearing = b;
  }
  if (cam.center || cam.bearing != null) map.jumpTo(cam);
}
requestAnimationFrame(tick);

/* ปุ่มเข็มทิศบนแผนที่ (แสดงมุมการหมุน, แตะเพื่อหันเหนือ) */
function updateCompassButton() {
  const b = map.getBearing();
  $('compassNeedle').style.transform = `rotate(${-b}deg)`;
  $('btnCompass').style.opacity = Math.abs(b) < 0.5 && follow !== 'compass' ? '0.55' : '1';
}
map.on('rotate', updateCompassButton);
updateCompassButton();
$('btnCompass').onclick = () => {
  if (follow === 'compass') setFollow('follow');
  map.easeTo({ bearing: 0, pitch: 0, duration: 400 });
};

/* ปุ่มซูม + / − (ซูมรอบจุดกลางจอ จึงไม่หลุดจากโหมดติดตาม) */
$('btnZoomIn').onclick = () => map.zoomIn({ duration: 250 });
$('btnZoomOut').onclick = () => map.zoomOut({ duration: 250 });

/* วงกลมความแม่นยำ (หน่วยเมตร) */
function circle(lng, lat, r, n = 64) {
  const pts = [];
  const dLat = r / 111320, dLng = r / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
}

/* ============================================================
 *  ตรวจว่าอยู่ในทุ่งไหน (point-in-polygon)
 * ============================================================ */

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(x, y, rings) { return inRing(x, y, rings[0]) && !rings.slice(1).some(h => inRing(x, y, h)); }
function inGeometry(x, y, g) {
  if (g.type === 'Polygon') return inPolygon(x, y, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => inPolygon(x, y, p));
  return false;
}

/* หาพื้นที่ (ทุ่ง) ที่จุดนี้อยู่ข้างใน → { layer, feature } หรือ null */
function zoneAt(lng, lat, visibleOnly = true) {
  for (const o of OVERLAYS.filter(x => x.isZone)) {
    const st = overlayState[o.id];
    if (!st.data || (visibleOnly && !st.visible)) continue;
    const f = st.data.features.find(f => inGeometry(lng, lat, f.geometry));
    if (f) return { layer: o, feature: f };
  }
  return null;
}

function updateZone(fix) {
  const z = zoneAt(fix.lng, fix.lat);
  const hit = z && z.feature, layer = z && z.layer;
  const chip = $('zoneChip');
  if (!hit) { chip.classList.add('hidden'); chip.classList.remove('flex'); return; }
  $('zoneName').textContent = `${layer.name} ${hit.properties[layer.titleField]}`;
  $('zoneSwatch').style.cssText = swatchStyle(layer);
  chip.classList.remove('hidden'); chip.classList.add('flex');
}

/* ============================================================ */

/* กล่องยืนยันกลางจอ → Promise<boolean> */
function confirmModal(message, { ok = 'ยืนยัน', cancel = 'ยกเลิก', danger = false } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-50 grid place-items-center bg-black/40 p-6';
    wrap.innerHTML = `
      <div role="dialog" aria-modal="true" class="w-full max-w-[340px] rounded-2xl bg-white shadow-2xl p-5">
        <p class="text-[17px] leading-snug text-gray-900 whitespace-pre-line"></p>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <button data-r="0" class="h-12 rounded-xl bg-gray-100 text-gray-800 font-medium active:bg-gray-200">${cancel}</button>
          <button data-r="1" class="h-12 rounded-xl text-white font-semibold ${danger ? 'bg-red-600 active:bg-red-700' : 'bg-blue-600 active:bg-blue-700'}">${ok}</button>
        </div>
      </div>`;
    wrap.querySelector('p').textContent = message;
    const done = v => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') done(false); };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (b) done(b.dataset.r === '1');
      else if (e.target === wrap) done(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="1"]').focus();
  });
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}

setLocateIcon();
