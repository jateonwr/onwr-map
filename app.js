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
  STORAGE: 'พื้นที่รับน้ำ (ไร่)', DEPTH: 'ความลึกน้ำ (ม.)', Cap_Pot: 'ความจุศักยภาพ (ล้าน ลบ.ม.)', Cap_MCM: 'ความจุ (ล้าน ลบ.ม.)',
  Status_Now: 'ปริมาณน้ำปัจจุบัน (ล้าน ลบ.ม.)',
  // แหล่งน้ำขนาดใหญ่ / ขนาดกลาง
  name: 'ชื่อ', tambol: 'ตำบล', amphoe: 'อำเภอ', province: 'จังหวัด', storage: 'ความจุ (ล้าน ลบ.ม.)',
  agency: 'หน่วยงาน', Basin22: 'ลุ่มน้ำ', ONWR_Reg: 'สทนช. ภาค', REMARK: 'หมายเหตุ',
  // สถานี
  stn_code: 'รหัสสถานี', lat: 'ละติจูด', lng: 'ลองจิจูด',
  dam_storage: 'ความจุที่ระดับเก็บกัก (ล้าน ลบ.ม.)', dam_volume: 'ปริมาณน้ำในอ่าง (ล้าน ลบ.ม.)',
  dam_percent_storage: 'ปริมาณน้ำ (% ความจุ)', discharge: 'ค่าที่ 1', discharge2: 'ค่าที่ 2',
  // ลำน้ำ
  STREAM_ID: 'รหัสลำน้ำ', STREAM_NAM: 'ชื่อลำน้ำ', LOCAL_NAME: 'ชื่อท้องถิ่น',
  Hy_use_des: 'ลักษณะทางน้ำ', STRCLAS_DE: 'ชั้นลำน้ำ', SHAPE_Leng: 'ความยาว (กม.)', length_km: 'ความยาวรวม (กม.)',
  str_code: 'รหัสลำน้ำ', str_name: 'ชื่อลำน้ำ', SUBBASIN: 'ลุ่มน้ำสาขา', MBASIN: 'ลุ่มน้ำหลัก',
  STREFFCODE: 'รหัสจุดตรวจวัด', EFF_KM: 'กม. ที่', Descp: 'รายละเอียด', Length_km: 'ความยาว (กม.)',
};

/* ขนาดไอคอนจุดตามระดับซูม: ซูมออก = เล็ก, ซูมเข้า = ใหญ่ */
const ICON_SIZE_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 5, 0.35, 8, 0.6, 11, 0.9, 14, 1.2];
const CIRCLE_RADIUS_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 5, 2.5, 8, 4, 11, 6.5, 14, 9];
const CIRCLE_STROKE_BY_ZOOM = ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 1.5, 11, 2, 14, 2.5];

const TUNG_FILL = '#c7bca8';
const TUNG_LINE = '#1e3a8a';   // ขอบทุ่งรับน้ำ: น้ำเงินเข้ม

const OVERLAYS = [
  {
    id: 'tung', name: 'ทุ่งรับน้ำ', url: 'data/tung.geojson', visible: true, opacity: 0.75,
    icon: 'area', swatch: TUNG_FILL, outline: TUNG_LINE,
    titleField: 'AREA_NAME', legend: true, legendTitle: 'รายชื่อทุ่ง', labels: true, isZone: true,
    // บรรทัดใต้ชื่อทุ่ง: (ความจุศักยภาพ/ความจุ/ปริมาณน้ำปัจจุบัน/ปริมาณ÷ความจุ %)
    labelExtra: p => {
      const pot = p.Cap_Pot, cap = p.Cap_MCM, now = p.Status_Now;
      if (pot == null && cap == null && now == null) return '';
      const v = x => x != null ? fmt(x) : '–';
      const pct = cap > 0 && now != null ? `${Math.round(now / cap * 100)}%` : '–';
      return `(${v(pot)}/${v(cap)}/${v(now)}/${pct})`;
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
    icon: 'lake', swatch: '#7dd3fc', outline: '#0284c7', titleField: 'name',
    layers: (src, op) => [
      { id: `${src}-fill`, type: 'fill', source: src, paint: { 'fill-color': '#7dd3fc', 'fill-opacity': op } },
      { id: `${src}-line`, type: 'line', source: src,
        paint: { 'line-color': '#0284c7', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 12, 1.5] } },
    ],
    opacityProps: [['fill', 'fill-opacity', 1]],
  },
  {
    id: 'water-l', name: 'แหล่งน้ำขนาดใหญ่', url: 'data/water-l.geojson', visible: true, opacity: 0.7,
    icon: 'lake', swatch: '#38bdf8', outline: '#0369a1', titleField: 'name',
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
    // อาคารบังคับน้ำ (จุด) — เพิ่มจุดได้ใน data/water-other.geojson
    id: 'water-other', name: 'อาคารบังคับน้ำ', url: 'data/water-other.geojson', visible: true, opacity: 1,
    icon: 'rect', swatch: '#0284c7', titleField: 'name',
    labels: true, labelClass: 'water-label', labelMinZoom: 7.5, labelAnchor: 'left', labelOffset: [15, 0],
    // ค่าระบายน้ำจาก Sheet เขื่อน (ดู sheet.js → extras)
    labelExtra: p => {
      if (p.discharge == null && p.discharge2 == null) return '';
      const v = x => x != null ? x.toLocaleString('th-TH', { maximumFractionDigits: 2, useGrouping: false }) : '–';
      return `(${v(p.discharge)}, ${v(p.discharge2)})`;
    },
    layers: (src, op) => [
      { id: `${src}-icon`, type: 'symbol', source: src,
        layout: { 'icon-image': 'rect-blue', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                  'icon-size': ICON_SIZE_BY_ZOOM },
        paint: { 'icon-opacity': op } },
    ],
    opacityProps: [['icon', 'icon-opacity', 1]],
  },
  {
    // ขอบเขตจังหวัด: เส้นสีดำ ไม่มีพื้น + ชื่อจังหวัด
    id: 'provinces', name: 'ขอบเขตจังหวัด', url: 'data/provinces.geojson', visible: true, opacity: 1,
    icon: 'boundary', swatch: 'transparent', outline: '#000000', titleField: 'name',
    labels: true, labelClass: 'prov-label', labelMinZoom: 7, noClick: true,
    countText: data => `${data.features.filter(f => f.geometry.type === 'Point').length} จังหวัด`,
    layers: (src, op) => [
      { id: `${src}-line`, type: 'line', source: src, filter: ['!=', '$type', 'Point'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000000', 'line-opacity': op,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 8, 2.5, 11, 3.5, 14, 4.5] } },
    ],
    opacityProps: [['line', 'line-opacity', 1]],
  },
  {
    id: 'streams-sub', name: 'ลำน้ำสาขา', url: 'data/streams-sub.geojson', visible: true, opacity: 1,
    icon: 'line', swatch: '#0ea5e9', titleField: 'str_name',
    layers: (src, op) => [
      { id: `${src}-line`, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0ea5e9', 'line-opacity': op,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 10, 2, 15, 4] } },
    ],
    opacityProps: [['line', 'line-opacity', 1]],
  },
  {
    id: 'streams-main', name: 'ลำน้ำหลัก', url: 'data/streams-main.geojson', visible: true, opacity: 1,
    icon: 'line-thick', swatch: '#1d4ed8', titleField: 'STREAM_NAM',
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
    icon: 'circle', swatch: '#f97316', titleField: 'stn_code',
    labels: true, labelClass: 'stn-label', labelMinZoom: 7.5, labelAnchor: 'left', labelOffset: [10, 0],
    layers: (src, op) => [
      { id: `${src}-circle`, type: 'circle', source: src,
        paint: { 'circle-color': '#f97316', 'circle-opacity': op, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': CIRCLE_STROKE_BY_ZOOM,
                 'circle-stroke-opacity': op, 'circle-radius': CIRCLE_RADIUS_BY_ZOOM } },
    ],
    opacityProps: [['circle', 'circle-opacity', 1], ['circle', 'circle-stroke-opacity', 1]],
  },
  {
    // จุดลงพื้นที่: ข้อมูลจาก Google Sheet (ตั้งลิงก์ใน sheet.js → VISIT_SHEET)
    id: 'visits', name: 'จุดลงพื้นที่', visible: true, opacity: 1,
    icon: 'star', swatch: '#dc2626', titleField: 'name',
    loader: () => loadVisitPoints(),
    countText: data => `${data.features.length} จุด`,
    labels: true, labelClass: 'visit-label', labelMinZoom: 7.5, labelAnchor: 'left', labelOffset: [13, 0],
    layers: (src, op) => [
      { id: `${src}-icon`, type: 'symbol', source: src,
        layout: { 'icon-image': 'star-red', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                  'icon-size': ICON_SIZE_BY_ZOOM },
        paint: { 'icon-opacity': op } },
    ],
    opacityProps: [['icon', 'icon-opacity', 1]],
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

/* style ของแผนที่ฐาน (ใช้ทั้งแผนที่หลักและแผนที่สำหรับ export) */
function buildBaseStyle() {
  return {
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
  };
}

const map = new maplibregl.Map({
  container: 'map',
  style: buildBaseStyle(),
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

/* ไอคอนดาว 5 แฉก ขอบขาว */
function starIcon(fill, size = 26) {
  const r = 2, c = document.createElement('canvas');
  c.width = c.height = size * r;
  const g = c.getContext('2d');
  g.scale(r, r);
  const cx = size / 2, cy = size / 2 + 1, R = size / 2 - 2, rIn = R * 0.45;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? rIn : R;
    g[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  g.closePath();
  g.lineJoin = 'round'; g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = fill; g.fill();
  return { image: g.getImageData(0, 0, size * r, size * r), pixelRatio: r };
}

/* ไอคอนที่ชั้นข้อมูลใช้ (ใส่ให้ map instance ใดก็ได้) */
function addMapImages(m, colors = {}) {
  const icon = rectIcon(colors.rect || '#0284c7');
  m.addImage('rect-blue', icon.image, { pixelRatio: icon.pixelRatio });
  const star = starIcon(colors.star || '#dc2626');
  m.addImage('star-red', star.image, { pixelRatio: star.pixelRatio });
}

/* ใส่ชั้นข้อมูลทั้งหมด (ที่โหลดแล้ว) ลงใน map instance อื่น เช่น แผนที่สำหรับ export */
function addOverlayLayers(m, { onlyVisible = false, onlyIds = null } = {}) {
  for (const o of OVERLAYS) {
    const st = overlayState[o.id];
    if (!st.data || (onlyVisible && !st.visible) || (onlyIds && !onlyIds.includes(o.id))) continue;
    m.addSource(o.id, { type: 'geojson', data: st.data });
    for (const l of o.layers(o.id, st.opacity)) {
      l.layout = { ...(l.layout || {}), visibility: st.visible ? 'visible' : 'none' };
      m.addLayer(l);
    }
  }
}

map.on('load', async () => {
  addMapImages(map);
  // แหล่งข้อมูลตำแหน่งผู้ใช้ (วงความแม่นยำ) + feature ที่ถูกเลือก
  map.addSource('me-accuracy', { type: 'geojson', data: emptyFC() });
  map.addSource('selected', { type: 'geojson', data: emptyFC() });

  await Promise.all(OVERLAYS.map(async o => {
    const st = overlayState[o.id];
    try {
      let data;
      if (o.loader) data = await o.loader();                     // ข้อมูลจากที่อื่น (เช่น Google Sheet)
      else {
        const res = await fetch(o.url, { cache: 'no-cache' });   // เช็กกับ server ทุกครั้ง กันใช้ไฟล์เก่าที่ค้างในเครื่อง
        if (!res.ok) throw new Error(res.status);
        data = await res.json();
      }
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
        m.isRiver = true;
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
      const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([f.properties.label_lng, f.properties.label_lat]);
      m.movable = !!o.labelAnchor;    // ป้ายของจุด: ย้ายไปรอบจุดได้ (ขวา → ซ้าย → บน → ล่าง)
      return m;
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
      const { chosen, alts } = on ? pickRiverLabel(group, z, insideInner) : { chosen: null, alts: [] };
      group.forEach(m => showMarker(m, m === chosen));
      if (chosen) chosen.alts = alts;
    }
  }
  resolveLabels();
}
map.on('moveend', updateLabels);

/* ชื่อแม่น้ำ: เลือก 1 จุดกลางช่วงที่มองเห็น (จากจุดที่มุมคำนวณไว้สำหรับซูมนี้ก่อน)
   + จุดสำรองไล่จากกลางออกไป (ใช้เมื่อตำแหน่งกลางทับป้ายอื่น) */
function pickRiverLabel(group, z, inside) {
  const visible = group.filter(m => inside(m.getLngLat()));
  const fit = visible.filter(m => m.minZoom <= z);
  const pool = fit.length ? fit : visible;
  const mid = Math.floor(pool.length / 2);
  const chosen = pool[mid] || null;
  const alts = chosen ? pool.map((m, i) => [m, Math.abs(i - mid)]).filter(([m]) => m !== chosen)
    .sort((a, b) => a[1] - b[1]).map(([m]) => m).slice(0, 12) : [];
  return { chosen, alts };
}

/* ============================================================
 *  จัดป้ายไม่ให้ซ้อนกัน
 *  1) ป้ายของจุด ลองวาง ขวา → ซ้าย → บน → ล่าง แล้วเลือกตำแหน่งที่ไม่ทับ
 *  2) ถ้ายังทับ → ซ่อนป้ายที่สำคัญน้อยกว่า (ซูมเข้าแล้วจะกลับมาเอง)
 *  ไอคอนทุกจุดยังแสดงเสมอ
 * ============================================================ */
const LABEL_PRIORITY = {   // มาก = สำคัญกว่า (ได้วางก่อน)
  visits: 100, stations: 90, 'water-other': 80, 'water-l': 70, tung: 60, 'streams-main': 50, provinces: 40,
};
const POINT_ICON_LAYERS = ['visits', 'stations', 'water-other'];

function stopsAt(expr, z) {   // ค่าจาก ['interpolate', ['linear'], ['zoom'], z0, v0, z1, v1, ...]
  const st = expr.slice(3);
  if (z <= st[0]) return st[1];
  for (let i = 2; i < st.length; i += 2) {
    if (z <= st[i]) return st[i - 1] + (st[i + 1] - st[i - 1]) * (z - st[i - 2]) / (st[i] - st[i - 2]);
  }
  return st[st.length - 1];
}

/* อัลกอริทึมจัดป้าย (ใช้ทั้งบนจอและภาพ export)
   items: [{ x, y, w, h, pr, movable, avoidIcons, rot (องศา, ป้ายเอียง), alts: [{ x, y, rot }] }]
   คืน array ตามลำดับ items: { dx, dy, hidden } | { alt: index } */
function placeLabels(items, { width, height, gap, pad = 2, obstacles = [], iconObstacles = [] }) {
  const hits = (R, list) => list.some(q => R.x1 < q.x2 && R.x2 > q.x1 && R.y1 < q.y2 && R.y2 > q.y1);
  const rotBox = (w, h, deg) => {
    const a = (deg || 0) * Math.PI / 180;
    return [Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))];
  };
  const box = (x, y, w, h) => ({ x1: x - w / 2 - pad, y1: y - h / 2 - pad, x2: x + w / 2 + pad, y2: y + h / 2 + pad });
  const onScreen = R => R.x1 >= 0 && R.y1 >= 0 && R.x2 <= width && R.y2 <= height;
  const placed = [];
  const out = new Array(items.length).fill(null);
  const order = items.map((_, i) => i).sort((a, b) => items[b].pr - items[a].pr);
  for (const i of order) {
    const it = items[i];
    const [w, h] = it.rot ? rotBox(it.w, it.h, it.rot) : [it.w, it.h];
    const cands = it.movable
      ? [[gap + w / 2, 0], [-(gap + w / 2), 0], [0, -(gap + h / 2)], [0, gap + h / 2]]
      : [[0, 0]];
    const obs = it.avoidIcons ? iconObstacles.concat(obstacles) : obstacles;
    const free = R => !hits(R, placed) && !hits(R, obs);
    let ok = null;
    for (const [dx, dy] of cands) {
      const R = box(it.x + dx, it.y + dy, w, h);
      // ป้ายของจุด: เลือกด้านที่อยู่ในจอทั้งป้ายก่อน (จุดริมจอจะได้ไม่ล้นออกนอกจอ)
      if (free(R) && (!it.movable || onScreen(R))) { ok = [dx, dy]; placed.push(R); break; }
    }
    if (ok) { out[i] = { dx: ok[0], dy: ok[1], hidden: false }; continue; }
    // ชื่อแม่น้ำ: ลองจุดสำรองตามแนวลำน้ำ (ขนาดป้ายเท่าเดิม ต่างแค่ตำแหน่ง/มุม)
    let alt = -1;
    (it.alts || []).some((a, k) => {
      if (a.x < 0 || a.y < 0 || a.x > width || a.y > height) return false;
      const [ww, hh] = rotBox(it.w, it.h, a.rot);
      const R = box(a.x, a.y, ww, hh);
      if (!free(R)) return false;
      placed.push(R); alt = k; return true;
    });
    out[i] = alt >= 0 ? { alt } : { dx: cands[0][0], dy: cands[0][1], hidden: true };
  }
  return out;
}

/* ครึ่งความกว้างของไอคอนจุด (px) ที่ระดับซูม z */
const iconRadiusAt = z => Math.max(13 * stopsAt(ICON_SIZE_BY_ZOOM, z), stopsAt(CIRCLE_RADIUS_BY_ZOOM, z) + 2);

/* กรอบไอคอนของจุดทั้งหมด (สิ่งกีดขวางของป้าย) สำหรับ map instance ที่กำหนด */
function iconObstaclesFor(m, r) {
  const out = [];
  for (const id of POINT_ICON_LAYERS) {
    const st = overlayState[id];
    if (!st || !st.visible || !st.data) continue;
    for (const f of st.data.features) {
      const p = m.project(f.geometry.coordinates);
      out.push({ x1: p.x - r, y1: p.y - r, x2: p.x + r, y2: p.y + r });
    }
  }
  return out;
}

function resolveLabels() {
  const z = map.getZoom(), bearing = map.getBearing();
  const cw = map.getContainer().clientWidth, ch = map.getContainer().clientHeight;
  const r = iconRadiusAt(z);

  // อ่านขนาดทั้งหมดก่อน (ไม่สลับอ่าน/เขียน DOM → ไม่กระตุก)
  const entries = [];
  for (const o of OVERLAYS) {
    const st = overlayState[o.id];
    const pr = LABEL_PRIORITY[o.id] ?? 10;
    for (const m of [...st.labels, ...(st.lineLabels || [])]) {
      if (!m.shown) continue;
      const p = map.project(m.getLngLat());
      if (p.x < -200 || p.y < -100 || p.x > cw + 200 || p.y > ch + 100) continue;   // นอกจอ
      const el = m.getElement();
      const alts = m.isRiver && m.alts ? m.alts.map(a => { const q = map.project(a.getLngLat()); return { x: q.x, y: q.y, rot: (a.getRotation() || 0) - bearing, m: a }; }) : null;
      entries.push({ m, el, item: {
        x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight, pr,
        movable: !!m.movable, avoidIcons: !!m.movable || !!m.isRiver,
        rot: m.isRiver ? (m.getRotation() || 0) - bearing : 0, alts,
      } });
    }
  }

  // ปุ่ม/โลโก้/แผงบนจอ: ไม่วางป้ายไว้ใต้ปุ่ม
  const mb = map.getContainer().getBoundingClientRect();
  const ui = [...document.querySelectorAll('#btnMeasure, #btnVisits, #btnExport, #onwrLogo, #btnLayers, #btnCompass, #zoomBox, #btnRecord, #btnLocate, #recBar, #measurePanel, #zoneChip')]
    .filter(el => el.offsetParent && getComputedStyle(el).visibility !== 'hidden')
    .map(el => { const b = el.getBoundingClientRect(); return { x1: b.left - mb.left - 4, y1: b.top - mb.top - 4, x2: b.right - mb.left + 4, y2: b.bottom - mb.top + 4 }; });

  const results = placeLabels(entries.map(e => e.item), {
    width: cw, height: ch, gap: r + 4, pad: 2, obstacles: ui, iconObstacles: iconObstaclesFor(map, r),
  });

  // เขียนผลลง DOM ทีเดียว
  entries.forEach((e, i) => {
    const res = results[i];
    if (res.alt != null) {   // ย้ายชื่อแม่น้ำไปจุดสำรอง
      const alt = e.item.alts[res.alt].m;
      showMarker(e.m, false);
      showMarker(alt, true);
      alt.getElement().style.visibility = '';
      return;
    }
    e.el.style.visibility = res.hidden ? 'hidden' : '';
    if (e.m.movable) e.m.setOffset([res.dx, res.dy]);
  });
}

/* สไตล์ป้ายแต่ละชนิด (px ที่ --ls = 1) — ต้องตรงกับ CSS ใน index.html; ใช้วาดป้ายลง canvas ตอน export */
const LABEL_STYLES = {
  'tung-label':  { size: 16, weight: 600, color: '#1f2937', sub: { size: 13, weight: 600 }, halo: 3 },
  'water-label': { size: 13, weight: 700, color: '#0c4a6e', sub: { size: 12, weight: 600 }, halo: 2 },
  'river-label': { size: 14, weight: 600, color: '#1d4ed8', halo: 2 },
  'stn-label':   { size: 13, weight: 700, color: '#9a3412', halo: 3, family: 'system-ui, sans-serif' },
  'visit-label': { size: 13, weight: 700, color: '#991b1b', halo: 2 },
  'prov-label':  { size: 13, weight: 600, color: '#111827', halo: 1.5, opacity: 0.85 },
};

/* ส่งไฟล์ให้ผู้ใช้: มือถือเปิดหน้าแชร์ (บันทึกลงไฟล์/รูป, ส่ง LINE) — คอมดาวน์โหลด */
async function shareOrDownload(file, title) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

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
    // รายชื่อ (พับเก็บได้ · ค่าเริ่มต้นพับไว้ · จำสถานะไว้ในเครื่อง)
    const open = store.get(`legend:${o.id}`, false);
    const legend = o.legend && st.data ? `
      <div class="mt-3 ${st.visible ? '' : 'hidden'}" data-legend="${o.id}">
        <button data-legend-toggle="${o.id}" aria-expanded="${open}" class="flex items-center gap-1 text-[13px] text-gray-600 h-8 -ml-1 px-1 rounded-lg active:bg-gray-100">
          ${o.legendTitle || `รายชื่อ${o.name}`} (${st.data.features.length})
          <svg class="w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}" viewBox="0 0 24 24" fill="currentColor"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>
        </button>
        <div class="flex flex-wrap gap-1.5 mt-1 ${open ? '' : 'hidden'}" data-legend-list="${o.id}">
          ${st.data.features.map(f => `
            <button data-zoomfeat="${o.id}:${f.id}" class="flex items-center gap-1.5 rounded-full bg-gray-100 active:bg-gray-200 pl-2 pr-2.5 h-8 text-[13px]">
              ${layerIcon(o, 14)}${escapeHtml(displayName(o, f.properties))}
            </button>`).join('')}
        </div>
      </div>` : '';
    return `
      <div class="rounded-2xl border border-gray-200 p-4 ${failed ? 'opacity-50' : ''}">
        <div class="flex items-center gap-3">
          <span class="w-9 h-9 rounded-lg flex-none bg-gray-100 grid place-items-center">${layerIcon(o, 26)}</span>
          <div class="flex-1 min-w-0">
            <div class="font-medium">${o.name}</div>
            <div class="text-xs text-gray-500">${failed ? 'โหลดไม่สำเร็จ' : o.countText ? o.countText(st.data) : `${st.data.features.length} รายการ`}</div>
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
  document.querySelectorAll('.tung-label, .water-label, .stn-label, .river-label, .prov-label, .visit-label').forEach(el => {
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
  const tg = e.target.closest('[data-legend-toggle]');
  if (tg) {
    const id = tg.dataset.legendToggle, open = tg.getAttribute('aria-expanded') !== 'true';
    store.set(`legend:${id}`, open);
    tg.setAttribute('aria-expanded', String(open));
    tg.querySelector('svg').classList.toggle('rotate-180', open);
    document.querySelector(`[data-legend-list="${id}"]`).classList.toggle('hidden', !open);
    return;
  }
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

/* เปิด/ปิดชั้นข้อมูลจากโค้ด (เหมือนกดสวิตช์ในแผง) */
function setOverlayVisible(id, on) {
  const o = OVERLAYS.find(x => x.id === id), st = overlayState[id];
  if (!o || !map.getSource(id) || st.visible === on) return;
  st.visible = on;
  store.set(`vis:${id}`, on);
  o.layers(id, st.opacity).forEach(l => map.setLayoutProperty(l.id, 'visibility', on ? 'visible' : 'none'));
  updateLabels();
  renderLayerPanel();
}

/* ปุ่มลงพื้นที่: ซูมให้เห็นจุดลงพื้นที่ทั้งหมด */
$('btnVisits').onclick = () => {
  const st = overlayState.visits;
  if (!st || !st.data || !st.data.features.length) { toast('ยังไม่มีจุดลงพื้นที่ใน Google Sheet'); return; }
  setOverlayVisible('visits', true);
  fitTo(st.bounds);
};

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

const clickableLayers = () => OVERLAYS.filter(o => !o.noClick).flatMap(o => o.layers(o.id, 1).map(l => l.id))
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

/* ชื่อที่แสดง: "ชื่อแสดง" จาก Google Sheet ถ้ามี ไม่งั้นใช้ชื่อเดิมจากไฟล์ */
const displayName = (o, p) => p.display_name || p[o.titleField];

function showInfo(o, f) {
  selectedInfo = { o, f };
  const p = f.properties;
  $('infoTitle').textContent = displayName(o, p) || '(ไม่มีชื่อ)';
  $('infoLayer').textContent = o.name + (p.display_name && p.display_name !== p[o.titleField] ? ` · ชื่อเดิม: ${p[o.titleField]}` : '');
  $('infoSwatch').innerHTML = layerIcon(o, 20);
  $('infoBody').innerHTML = Object.entries(p)
    .filter(([k, v]) => FIELD_LABELS[k] && k !== o.titleField && v !== null && v !== '')
    .map(([k, v]) => `<div class="flex gap-4 py-2.5"><dt class="w-32 flex-none text-gray-500">${FIELD_LABELS[k]}</dt><dd class="flex-1 min-w-0 break-words">${escapeHtml((k === 'lat' || k === 'lng') && typeof v === 'number' ? v.toFixed(5) : fmt(v))}</dd></div>`)
    .join('') + infoExtras.map(fn => fn(o, f) || '').join('');
  map.getSource('selected').setData({ type: 'FeatureCollection', features: [f] });
  closeSheet('layerSheet');
  openSheet('infoSheet');
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/* ไอคอนของชั้นข้อมูล (หน้าตาเหมือนบนแผนที่) → SVG */
const ICON_SHAPES = {
  area:       (o) => `<path d="M4 7 11 3l9 2.5 1 8-4.5 7L8 21l-5-6z" fill="${o.swatch}" stroke="${o.outline}" stroke-width="2.6" stroke-linejoin="round"/>`,
  boundary:   (o) => `<path d="M4 7 11 3l9 2.5 1 8-4.5 7L8 21l-5-6z" fill="none" stroke="${o.outline}" stroke-width="2.6" stroke-linejoin="round"/>`,
  lake:       (o) => `<path d="M4.5 10c-.4-3 2.4-5.4 5.4-5 2 .3 3.1-.9 5.1-.6 3 .5 4.6 3.2 3.8 5.8-.5 1.6.8 3 .1 4.9-1 2.6-4.2 4-6.9 3.2-1.6-.5-3 .4-4.6-.3-2.4-1-3.6-3.6-2.9-6z" fill="${o.swatch}" stroke="${o.outline}" stroke-width="1.6" stroke-linejoin="round"/>`,
  rect:       (o) => `<rect x="2.5" y="6.5" width="19" height="11" fill="${o.swatch}" stroke="#ffffff" stroke-width="2.5"/>`,
  line:       (o) => `<path d="M2 17c3-6 5-6.5 7-2.5s4.5 4 6.5-1S19.5 7 22 9" fill="none" stroke="${o.swatch}" stroke-width="2" stroke-linecap="round"/>`,
  'line-thick': (o) => `<path d="M2 17c3-6 5-6.5 7-2.5s4.5 4 6.5-1S19.5 7 22 9" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/><path d="M2 17c3-6 5-6.5 7-2.5s4.5 4 6.5-1S19.5 7 22 9" fill="none" stroke="${o.swatch}" stroke-width="3.4" stroke-linecap="round"/>`,
  circle:     (o) => `<circle cx="12" cy="12" r="7" fill="${o.swatch}" stroke="#ffffff" stroke-width="2.5"/>`,
  star:       (o) => `<path d="M12 2.5l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 16.8l-5.7 3 1.2-6.3-4.6-4.4 6.3-.8z" fill="${o.swatch}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>`,
};
function layerIcon(o, size = 20) {
  const shape = ICON_SHAPES[o.icon] || ICON_SHAPES.area;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="display:block">${shape(o)}</svg>`;
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
  $('zoneName').textContent = `${layer.name} ${displayName(layer, hit.properties)}`;
  $('zoneSwatch').innerHTML = layerIcon(layer, 16);
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
