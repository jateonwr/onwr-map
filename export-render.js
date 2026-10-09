'use strict';

/* ============================================================
 *  export-render.js — วาดหน้ากระดาษ (ใช้ทั้งตัวอย่างในหน้าจัดวาง และภาพจริง A2/A3)
 *  หน่วยจัดวาง = "มม. บน A2" (420×594) · U = px ต่อ มม. ของ canvas ที่กำลังวาด
 * ============================================================ */

const PAPER = { A2: [420, 594], A3: [297, 420], A4: [210, 297] };   // mm แนวตั้ง
const PAGE_BASE = [420, 594];                        // หน้ากระดาษในหน่วยจัดวาง (ทุกขนาดใช้สัดส่วนเดียวกัน) แนวตั้ง
const isLandscape = s => s.orient === 'landscape';
const pageMm = s => isLandscape(s) ? [PAGE_BASE[1], PAGE_BASE[0]] : [PAGE_BASE[0], PAGE_BASE[1]];   // [กว้าง, สูง] หน่วยจัดวาง
const paperMm = s => isLandscape(s) ? [PAPER[s.paper][1], PAPER[s.paper][0]] : [...PAPER[s.paper]];  // [กว้าง, สูง] มม. จริง
/* ตำแหน่ง/ขนาดกล่องแยกตามแนวกระดาษ (แนวตั้ง = layout.boxes · แนวนอน = layout.boxesL) */
const layoutBoxes = (layout, s) => isLandscape(s) ? (layout.boxesL = layout.boxesL || {}) : (layout.boxes = layout.boxes || {});
const EXPORT_DPI = 150;
const MM_PER_CSS_PX = 0.33;      // ตัวอักษรป้าย: px บนจอ → มม. บน A2 (16px ≈ 5.3 มม. ≈ 16pt)
const STROKE_K_PER_U = 0.23;     // ความหนาเส้น/ขนาดไอคอน = ค่าบนจอ × U × ค่านี้ (A2 150dpi ≈ 1.35×)
const FONT_TH = '"Noto Sans Thai", system-ui, sans-serif';
// ลำดับทุ่งในตาราง/เลขหน้าชื่อ (ตามเอกสารต้นแบบ) — ทุ่งที่ไม่อยู่ในรายการต่อท้าย
const TUNG_ORDER = ['บางระกำ', 'เชียงราก', 'ฝั่งซ้ายชัยนาทป่าสัก', 'ท่าวุ้ง', 'บางกุ่ม', 'บางกุ้ง',
  'บางบาล-บ้านแพน', 'ป่าโมก', 'ผักไห่', 'เจ้าเจ็ด', 'โครงการฯโพธิ์พระยา'];
const LEGEND_ORDER = ['visits', 'stations', 'water-other', 'streams-main', 'streams-sub', 'water-l', 'water-m', 'tung', 'provinces', 'basins'];
const LABEL_CLASS_NAMES = {
  'tung-label': 'ชื่อทุ่งรับน้ำ', 'water-label': 'ชื่อเขื่อน / อาคารบังคับน้ำ', 'river-label': 'ชื่อแม่น้ำ',
  'stn-label': 'รหัสสถานี', 'visit-label': 'จุดลงพื้นที่', 'prov-label': 'ชื่อจังหวัด', 'basin-label': 'ชื่อลุ่มน้ำหลัก',
};
const BOX_NAMES = { title: 'ชื่อแผนที่', logo: 'โลโก้', table: 'ตาราง', legend: 'สัญลักษณ์', north: 'ลูกศรทิศเหนือ', scalebar: 'มาตราส่วน' };
// คอลัมน์ตาราง 11 ทุ่ง (w = มม. บน A2 ที่ขนาดกล่อง 1×) — "name" แสดงเสมอ
const TABLE_COLS = [
  { key: 'no', w: 9, t: 'ลำดับที่', name: 'ลำดับที่' },
  { key: 'name', w: 40, t: 'พื้นที่ลุ่มต่ำ', name: 'พื้นที่ลุ่มต่ำ' },
  { key: 'pot', w: 21, t: 'ความจุศักยภาพ (ล้าน ลบ.ม.)', name: 'ความจุศักยภาพ' },
  { key: 'cap', w: 21, t: 'ความจุประชาคม (ล้าน ลบ.ม.)', name: 'ความจุประชาคม' },
  { key: 'now', w: 21, t: 'ปริมาณน้ำปัจจุบัน (ล้าน ลบ.ม.)', name: 'ปริมาณน้ำปัจจุบัน' },
  { key: 'pct', w: 21, t: 'ร้อยละเทียบ ความจุประชาคม', name: 'ร้อยละเทียบความจุประชาคม' },
];
const BOX_SCALE_MIN = 0.3, BOX_SCALE_MAX = 4;
const LINE_DASH = [3, 1.6];          // เส้นประของขอบเขตจังหวัด/ลุ่มน้ำ (หน่วย = ความหนาเส้น)
const PAGE_MARGIN_MM = 8;            // ขอบกระดาษสีขาว 4 ด้าน (มม. บน A2)
const EDGE_MM = PAGE_MARGIN_MM + 4;  // ตำแหน่งเริ่มต้นของโลโก้/ตาราง/สัญลักษณ์ ห่างจากขอบกระดาษ
const boxScale = (boxes, type) => (boxes[type] && boxes[type].s) || 1;

/* ---------- การตั้งค่า ---------- */
const POLY_ICONS = ['area', 'lake', 'boundary'], LINE_ICONS = ['line', 'line-thick'];
function layerColorDefaults(o) {
  if (POLY_ICONS.includes(o.icon)) return { fillColor: o.swatch === 'transparent' ? null : o.swatch, lineColor: o.outline || null };
  if (LINE_ICONS.includes(o.icon)) return { fillColor: null, lineColor: o.swatch };
  return { fillColor: o.swatch, lineColor: null };   // จุด (วงกลม/ดาว/สี่เหลี่ยม)
}
function defaultExportSettings() {
  return {
    paper: 'A2',
    orient: 'portrait',
    title: '', titleBg: true,
    layers: Object.fromEntries(OVERLAYS.map(o => [o.id, { on: overlayState[o.id].visible, width: 1, iconSize: 1, ...layerColorDefaults(o), ...(o.lineStyle ? { dash: o.lineStyle } : {}) }])),
    labels: Object.fromEntries(Object.entries(LABEL_STYLES).map(([k, s]) => [k, { on: true, size: 1, color: s.color }])),
    table: { on: true, cols: Object.fromEntries(TABLE_COLS.map(c => [c.key, true])), totals: true },
    legend: { on: true, items: Object.fromEntries(LEGEND_ORDER.map(id => [id, true])) },
    furniture: { logo: true, north: true, scalebar: true, date: true },
  };
}
function mergeSettings(stored) {
  const d = defaultExportSettings();
  if (!stored) return d;
  const out = { ...d, paper: PAPER[stored.paper] ? stored.paper : d.paper, orient: stored.orient === 'landscape' ? 'landscape' : 'portrait',
    title: typeof stored.title === 'string' ? stored.title : '', titleBg: stored.titleBg !== false };
  for (const grp of ['layers', 'labels']) {
    for (const k of Object.keys(d[grp])) out[grp][k] = { ...d[grp][k], ...(stored[grp] && stored[grp][k] || {}) };
  }
  const st = stored.table || {}, sl = stored.legend || {};
  out.table = { on: st.on ?? d.table.on, totals: st.totals ?? d.table.totals, cols: { ...d.table.cols, ...(st.cols || {}), name: true } };
  out.legend = { on: sl.on ?? d.legend.on, items: { ...d.legend.items, ...(sl.items || {}) } };
  out.furniture = { ...d.furniture, ...(stored.furniture || {}) };
  return out;
}
const pointIconColors = s => ({ rect: s.layers['water-other'].fillColor, star: s.layers.visits.fillColor });

/* ---------- helpers ---------- */
const mmToPx = (mm, dpi) => Math.round(mm / 25.4 * dpi);
const fmtN = v => v == null || !Number.isFinite(v) ? '–' : v.toLocaleString('th-TH', { maximumFractionDigits: 2 });
const stripTags = s => String(s || '').replace(/<[^>]+>/g, '');
const normKey = (o, p) => `${o.id}:${p[o.titleField]}`;
const tungOrderIndex = f => {
  const i = TUNG_ORDER.findIndex(n => normName(n) === normName(f.properties.AREA_NAME));
  return i < 0 ? 100 + f.id : i;
};
const numAt = (v, z) => typeof v === 'number' ? v : stopsAt(v, z);

function haloText(ctx, text, x, y, { size, weight = 600, color, halo = 2, family = FONT_TH, align = 'center', alpha = 1 }) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = halo * 2; ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = alpha;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
}
function measure(ctx, text, size, weight, family = FONT_TH) {
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width;
}
function wrapText(ctx, text, maxW, size, weight) {
  ctx.font = `${weight} ${size}px ${FONT_TH}`;
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
async function loadImage(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/* ---------- รูปประกอบ (โลโก้, ไอคอนในสัญลักษณ์) ---------- */
const exportAssets = { logo: null, icons: new Map() };
const legendIconSvg = (o, s) => {
  const ls = s.layers[o.id];
  const swatch = POLY_ICONS.includes(o.icon) ? (ls.fillColor || o.swatch) : (ls.fillColor || ls.lineColor || o.swatch);
  return layerIcon({ icon: o.icon, swatch, outline: ls.lineColor || o.outline, dash: ls.dash === 'dash' }, 48)
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
};
async function loadExportAssets(settings) {
  if (!exportAssets.logo) { try { exportAssets.logo = await loadImage('assets/onwr-logo.png'); } catch (err) { console.warn('logo', err); } }
  for (const o of OVERLAYS) {
    const svg = legendIconSvg(o, settings);
    if (exportAssets.icons.has(svg)) continue;
    try { exportAssets.icons.set(svg, await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))); }
    catch (err) { console.warn('legend icon', o.id, err); }
  }
}

/* ---------- ใส่สี/ความหนา/การมองเห็นตามการตั้งค่า ให้ map instance ---------- */
function setPointIcons(m, settings) {
  for (const id of ['rect-blue', 'star-red']) if (m.hasImage(id)) m.removeImage(id);
  addMapImages(m, pointIconColors(settings));
}
function applyExportStyle(m, settings, U, refZoom, { minPx = 0 } = {}) {
  const k = U * STROKE_K_PER_U;
  for (const o of OVERLAYS) {
    const st = overlayState[o.id], ls = settings.layers[o.id];
    if (!st.data || !m.getSource(o.id)) continue;
    for (const def of o.layers(o.id, st.opacity)) {
      if (!m.getLayer(def.id)) continue;
      m.setLayoutProperty(def.id, 'visibility', ls.on ? 'visible' : 'none');
      const paint = def.paint || {}, layout = def.layout || {};
      for (const prop of ['line-width', 'circle-radius', 'circle-stroke-width']) {
        if (paint[prop] != null) m.setPaintProperty(def.id, prop, Math.max(minPx, numAt(paint[prop], refZoom) * k * ls.width));
      }
      if (layout['icon-size'] != null) m.setLayoutProperty(def.id, 'icon-size', Math.max(minPx ? 0.3 : 0, numAt(layout['icon-size'], refZoom) * k * ls.iconSize));
      if (paint['fill-color'] != null && ls.fillColor) m.setPaintProperty(def.id, 'fill-color', ls.fillColor);
      if (paint['line-color'] != null && ls.lineColor && !def.id.endsWith('-casing')) m.setPaintProperty(def.id, 'line-color', ls.lineColor);
      if (o.lineStyle && def.type === 'line') m.setPaintProperty(def.id, 'line-dasharray', ls.dash === 'dash' ? LINE_DASH : null);
      if (paint['circle-color'] != null && ls.fillColor) m.setPaintProperty(def.id, 'circle-color', ls.fillColor);
    }
  }
  if (m.getLayer('focus-line')) m.setPaintProperty('focus-line', 'line-width', Math.max(minPx, numAt(FOCUS_LINE_WIDTH, refZoom) * k));
}

/* ---------- ฟอนต์ของป้ายแต่ละชนิด (px ของ canvas) ---------- */
function labelFont(settings, cls, U) {
  const s = LABEL_STYLES[cls], ls = settings.labels[cls];
  const f = MM_PER_CSS_PX * U * ls.size;
  return {
    size: s.size * f, subSize: s.sub ? s.sub.size * f : 0, weight: s.weight, subWeight: s.sub ? s.sub.weight : 600,
    color: ls.color, halo: s.halo * f * 0.8, family: s.family || FONT_TH, alpha: s.opacity ?? 1,
  };
}

/* ---------- ขนาดองค์ประกอบ ---------- */
function tableSpec(ctx, settings, U) {
  const mm = v => v * U;
  const o = OVERLAYS.find(x => x.id === 'tung');
  const rows = [...overlayState.tung.data.features].sort((a, b) => tungOrderIndex(a) - tungOrderIndex(b));
  const cols = TABLE_COLS.filter(c => c.key === 'name' || settings.table.cols[c.key] !== false).map(c => ({ key: c.key, w: mm(c.w), t: c.t }));
  const fs = 3.1 * U, rowH = Math.max(mm(6), fs * 1.7);
  const pct = (vol, cap) => cap > 0 && vol != null ? String(Math.round(vol / cap * 100)) : '-';
  const sum = list => ['Cap_Pot', 'Cap_MCM', 'Status_Now'].map(k => list.reduce((s, f) => s + (f.properties[k] || 0), 0));
  const pick = v => cols.map(c => v[c.key]);
  const body = rows.map((f, i) => {
    const p = f.properties;
    return pick({ no: String(i + 1), name: displayName(o, p), pot: fmtN(p.Cap_Pot), cap: fmtN(p.Cap_MCM), now: fmtN(p.Status_Now), pct: pct(p.Status_Now, p.Cap_MCM) });
  });
  if (settings.table.totals) {
    const rest = rows.filter(f => normName(f.properties.AREA_NAME) !== normName('บางระกำ'));
    for (const [label, list] of [[`รวม ${rest.length} ทุ่ง (ยกเว้นบางระกำ)`, rest], [`รวม ${rows.length} ทุ่ง`, rows]]) {
      const [a, b, c] = sum(list);
      body.push(pick({ no: '', name: label, pot: fmtN(a), cap: fmtN(b), now: fmtN(c), pct: pct(c, b) }));
    }
  }
  // หัวตาราง: ย่อตัวอักษรเฉพาะคอลัมน์ที่คำยาวกว่าช่อง
  const headFs = cols.map(c => {
    const widest = Math.max(...c.t.split(' ').map(w => measure(ctx, w, fs, 700)));
    return Math.min(fs, fs * (c.w - mm(1.5)) / widest);
  });
  const headLines = cols.map((c, i) => wrapText(ctx, c.t, c.w - mm(1.5), headFs[i], 700));
  const headH = Math.max(...headLines.map((l, i) => l.length * headFs[i])) * 1.25 + mm(2);
  const w = cols.reduce((s, c) => s + c.w, 0);
  return { cols, headLines, headFs, headH, rowH, fs, body, nData: rows.length, w, h: headH + body.length * rowH, pad: mm(1.5) };
}
function legendSpec(settings, U) {
  const mm = v => v * U;
  const layers = LEGEND_ORDER.map(id => OVERLAYS.find(o => o.id === id))
    .filter(o => o && settings.layers[o.id].on && settings.legend.items[o.id] !== false && overlayState[o.id].data);
  const fs = 3.4 * U, rowH = Math.max(mm(6.5), fs * 1.8);
  const dateText = settings.furniture.date
    ? `ข้อมูล ณ วันที่ ${(typeof sheetMeta !== 'undefined' && sheetMeta.tung && sheetMeta.tung.date) || new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : '';
  const w = Math.max(mm(62), fs * 0.55 * (dateText.length + 2));
  return { layers, fs, rowH, w, h: mm(9) + layers.length * rowH + (dateText ? mm(8) : mm(3)), dateText, titleFs: 4.2 * U, pad: mm(3), icon: mm(5.5), textX: mm(11) };
}
function scalebarSpec(m, Ub) {
  const lat = m.getCenter().lat;
  const mPerPx = 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, m.getZoom() + 8);
  const target = 40 * Ub * mPerPx;
  const nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500].map(k => k * 1000).reduce((best, v) => Math.abs(v - target) < Math.abs(best - target) ? v : best, 1000);
  return { km: nice / 1000, barW: nice / mPerPx, barH: 2 * Ub, w: nice / mPerPx + 6 * Ub, h: 12 * Ub, Ub };
}

/* ---------- จัดหน้า: กล่อง + ป้ายชื่อ (คืนตำแหน่งเป็น px ของ canvas) ---------- */
function buildPage(ctx, m, U, settings, layout, refZoom) {
  const [PW, PH] = pageMm(settings), lb = layoutBoxes(layout, settings);
  const W = PW * U, H = PH * U, mm = v => v * U;
  const boxes = [];
  // ขนาดกล่อง = ขนาดพื้นฐาน × s (ลากมุมปรับในหน้าจัดวาง) · ตำแหน่งเป็นมุมบนซ้าย (มม.)
  const place = (type, w, h, defX, defY) => {
    const p = lb[type];
    const x = p && p.x != null ? mm(p.x) : mm(defX), y = p && p.y != null ? mm(p.y) : mm(defY);
    const b = { type, s: boxScale(lb, type), x1: x, y1: y, x2: x + w, y2: y + h };
    boxes.push(b);
    return b;
  };
  const Ub = type => U * boxScale(lb, type);
  const titleLines = (settings.title || '').replace(/\r/g, '').trim().split('\n').map(l => l.trim());
  if (titleLines.some(Boolean)) {   // ชื่อแผนที่ (หลายบรรทัดได้): กลางบน · บรรทัดยาวเกินหน้ากระดาษจะย่อตัวอักษรให้พอดี (ขนาดเริ่มต้นเท่านั้น)
    const widest = (fs, ls = titleLines) => Math.max(...ls.map(l => measure(ctx, l || ' ', fs, 700)));
    const w1 = widest(9 * U) + 10 * U;
    const k = Math.min(1, (PW - 2 * EDGE_MM) * U / w1);
    const u = Ub('title') * k, fs = 9 * u;
    const w = widest(fs) + 10 * u, lineH = fs * 1.3;
    place('title', w, lineH * titleLines.length + fs * 0.25, PW / 2 - w / U / 2, EDGE_MM).spec = { lines: titleLines, fs, lineH, bg: settings.titleBg !== false };
  }
  if (settings.furniture.logo && exportAssets.logo) {
    const w = 34 * Ub('logo'), h = w * exportAssets.logo.height / exportAssets.logo.width;
    place('logo', w, h, EDGE_MM, EDGE_MM);
  }
  if (settings.table.on && overlayState.tung.data) {
    const spec = tableSpec(ctx, settings, Ub('table'));
    place('table', spec.w, spec.h, EDGE_MM, EDGE_MM + 50).spec = spec;
  }
  if (settings.legend.on) {
    const spec = legendSpec(settings, Ub('legend'));
    place('legend', spec.w, spec.h, EDGE_MM, PH - EDGE_MM - spec.h / U).spec = spec;
  }
  if (settings.furniture.north) {
    const u = Ub('north');
    place('north', 18 * u, 22 * u, PW - EDGE_MM - 18 * u / U, EDGE_MM);
  }
  if (settings.furniture.scalebar) {
    const spec = scalebarSpec(m, Ub('scalebar'));
    place('scalebar', spec.w, spec.h, PW - EDGE_MM - spec.w / U, PH - EDGE_MM - spec.h / U).spec = spec;
  }

  // ---- ป้ายชื่อ ----
  const [[w0, s0], [e0, n0]] = m.getBounds().toArray();
  const ix = (e0 - w0) * 0.06, iy = (n0 - s0) * 0.04;
  const inside = ll => ll.lng > w0 + ix && ll.lng < e0 - ix && ll.lat > s0 + iy && ll.lat < n0 - iy && inFocus(ll);
  const k = U * STROKE_K_PER_U;
  let iconR = 0;
  const items = [], metas = [];
  for (const o of OVERLAYS) {
    const st = overlayState[o.id], ls = settings.layers[o.id];
    if (!ls.on || !st.data) continue;
    if (POINT_ICON_LAYERS.includes(o.id)) iconR = Math.max(iconR, iconRadiusAt(refZoom) * k * ls.iconSize);
    const cls = o.labelClass || 'tung-label';
    if (!settings.labels[cls] || !settings.labels[cls].on) continue;
    const font = labelFont(settings, cls, U);
    const pr = LABEL_PRIORITY[o.id] ?? 10;
    const push = (it, meta) => { items.push(it); metas.push(meta); };

    if (o.labels) {
      const tungNo = o.id === 'tung' ? Object.fromEntries([...st.data.features].sort((a, b) => tungOrderIndex(a) - tungOrderIndex(b)).map((f, i) => [f.id, i + 1])) : null;
      for (const f of st.data.features) {
        const p = f.properties;
        if (p.label_lng == null) continue;
        const key = normKey(o, p), pin = layout.labels[key];
        if (pin && pin.hidden) continue;
        if (!inFocus([p.label_lng, p.label_lat])) continue;   // นอกลุ่มน้ำที่เน้น (พื้นสีขาว)
        const pt = m.project([p.label_lng, p.label_lat]);
        if (pt.x < -W * 0.1 || pt.y < -H * 0.1 || pt.x > W * 1.1 || pt.y > H * 1.1) continue;
        let text = displayName(o, p) || '';
        if (tungNo) text = `(${tungNo[f.id]}) ${text}`;
        const sub = LABEL_STYLES[cls].sub && o.labelExtra ? o.labelExtra(p) : '';
        const w = Math.max(measure(ctx, text, font.size, font.weight, font.family), sub ? measure(ctx, sub, font.subSize, font.subWeight, font.family) : 0);
        const h = font.size * 1.2 + (sub ? font.subSize * 1.2 + 2 : 0);
        push({ x: pt.x, y: pt.y, w, h, pr, movable: !!o.labelAnchor, avoidIcons: !!o.labelAnchor, rot: 0, alts: null, pin: pin ? { dx: mm(pin.dx), dy: mm(pin.dy) } : null },
          { key, layerId: o.id, cls, text, sub, font, river: false, anchor: { x: pt.x, y: pt.y }, lngLat: [p.label_lng, p.label_lat] });
      }
    }
    for (const [name, group] of Object.entries(st.lineGroups || {})) {
      const key = `${o.id}:${name}`, pin = layout.labels[key];
      if (pin && pin.hidden) continue;
      let pt, rot, alts = [], lngLat;
      if (pin && pin.lng != null) { if (!inFocus([pin.lng, pin.lat])) continue; lngLat = [pin.lng, pin.lat]; pt = m.project(lngLat); rot = pin.rot || 0; }
      else {
        const r = pickRiverLabel(group, refZoom, inside);
        if (!r.chosen) continue;
        lngLat = r.chosen.getLngLat().toArray(); pt = m.project(lngLat); rot = r.chosen.getRotation() || 0;
        alts = r.alts.map(a => { const q = m.project(a.getLngLat()); return { x: q.x, y: q.y, rot: a.getRotation() || 0, lngLat: a.getLngLat().toArray() }; });
      }
      const w = measure(ctx, name, font.size, font.weight, font.family), h = font.size * 1.1;
      push({ x: pt.x, y: pt.y, w, h, pr, movable: false, avoidIcons: true, rot, alts, pin: pin ? { dx: mm(pin.dx || 0), dy: mm(pin.dy || 0) } : null },
        { key, layerId: o.id, cls, text: name, sub: '', font, river: true, anchor: { x: pt.x, y: pt.y }, lngLat, rot });
    }
  }

  // ป้ายที่ผู้ใช้จัดเอง (pinned) วางก่อน และเป็นสิ่งกีดขวางของป้ายอัตโนมัติ
  const labels = [];
  const pinnedBoxes = [];
  const rotBox = (w, h, deg) => { const a = (deg || 0) * Math.PI / 180; return [Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))]; };
  const autoIdx = [];
  items.forEach((it, i) => {
    const meta = metas[i];
    if (!it.pin) { autoIdx.push(i); return; }
    const x = it.x + it.pin.dx, y = it.y + it.pin.dy;
    const [bw, bh] = rotBox(it.w, it.h, it.rot);
    pinnedBoxes.push({ x1: x - bw / 2 - 2, y1: y - bh / 2 - 2, x2: x + bw / 2 + 2, y2: y + bh / 2 + 2 });
    labels.push({ ...meta, x, y, rot: it.rot, w: it.w, h: it.h, bw, bh, pinned: true, hidden: false });
  });
  const mg = mm(PAGE_MARGIN_MM);
  const marginStrips = [{ x1: -1, y1: -1, x2: W + 1, y2: mg }, { x1: -1, y1: H - mg, x2: W + 1, y2: H + 1 },
    { x1: -1, y1: -1, x2: mg, y2: H + 1 }, { x1: W - mg, y1: -1, x2: W + 1, y2: H + 1 }];
  const obstacles = boxes.map(b => ({ x1: b.x1 - mm(2), y1: b.y1 - mm(2), x2: b.x2 + mm(2), y2: b.y2 + mm(2) })).concat(pinnedBoxes, marginStrips);
  const results = placeLabels(autoIdx.map(i => items[i]), {
    width: W, height: H, gap: iconR + mm(1), pad: mm(0.8), obstacles, iconObstacles: iconR ? iconObstaclesFor(m, iconR) : [],
  });
  autoIdx.forEach((i, j) => {
    const it = items[i], meta = metas[i], res = results[j];
    let x = it.x, y = it.y, rot = it.rot, lngLat = meta.lngLat;
    if (res.alt != null) ({ x, y, rot, lngLat } = it.alts[res.alt]);
    else { x += res.dx; y += res.dy; }
    const [bw, bh] = rotBox(it.w, it.h, rot);
    labels.push({ ...meta, x, y, rot, lngLat, w: it.w, h: it.h, bw, bh, pinned: false, hidden: !!res.hidden, anchor: res.alt != null ? { x, y } : meta.anchor });
  });
  return { W, H, boxes, labels };
}

/* ---------- วาด ---------- */
function drawPage(ctx, m, U, settings, page, { editing = false, selected = null, selectedBox = null, handlePx = 10 } = {}) {
  const mm = v => v * U;
  const { W, H } = page;
  // ขอบกระดาษสีขาว 4 ด้าน (ทับขอบแผนที่) + กรอบเส้นรอบพื้นที่แผนที่
  const mg = mm(PAGE_MARGIN_MM);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, mg); ctx.fillRect(0, H - mg, W, mg);
  ctx.fillRect(0, 0, mg, H); ctx.fillRect(W - mg, 0, mg, H);
  ctx.strokeStyle = '#374151'; ctx.lineWidth = Math.max(1, mm(0.4));
  ctx.strokeRect(mg, mg, W - 2 * mg, H - 2 * mg);

  for (const b of page.boxes) {
    const bw = b.x2 - b.x1, bh = b.y2 - b.y1;
    if (b.type === 'title') drawTitle(ctx, b, v => v * U * b.s);
    else if (b.type === 'logo') ctx.drawImage(exportAssets.logo, b.x1, b.y1, bw, bh);
    else if (b.type === 'table') drawTable(ctx, b, v => v * U * b.s);
    else if (b.type === 'legend') drawLegend(ctx, b, settings, v => v * U * b.s);
    else if (b.type === 'north') drawNorth(ctx, b, v => v * U * b.s);
    else if (b.type === 'scalebar') drawScalebar(ctx, b, v => v * U * b.s);
  }
  // attribution แผนที่ฐาน (มุมขวาล่าง)
  const attr = stripTags((BASEMAPS.find(b => b.id === activeBase) || {}).attribution);
  ctx.font = `400 ${mm(2.2)}px ${FONT_TH}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#374151';
  ctx.fillText(attr, W - mm(2), H - mm(1.5));

  for (const l of page.labels) {
    if (l.hidden) continue;
    const f = l.font;
    const common = { weight: f.weight, color: f.color, halo: f.halo, family: f.family, alpha: f.alpha };
    ctx.save();
    ctx.translate(l.x, l.y);
    if (l.river) ctx.rotate(l.rot * Math.PI / 180);
    if (l.sub) {
      haloText(ctx, l.text, 0, -l.h / 2 + f.size * 0.6, { ...common, size: f.size });
      haloText(ctx, l.sub, 0, l.h / 2 - f.subSize * 0.6, { ...common, size: f.subSize, weight: f.subWeight });
    } else haloText(ctx, l.text, 0, 0, { ...common, size: f.size });
    ctx.restore();
  }

  if (editing) {   // กรอบสิ่งที่ลากได้
    ctx.save();
    ctx.setLineDash([mm(1.2), mm(0.8)]);
    for (const b of page.boxes) {
      const sel = b.type === selectedBox;
      ctx.strokeStyle = sel ? 'rgba(220,38,38,1)' : 'rgba(37,99,235,.9)'; ctx.lineWidth = Math.max(1, mm(sel ? 0.5 : 0.3));
      ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    }
    // จุดจับ 4 มุม (ลากเพื่อปรับขนาด) — ขนาดคงที่บนจอ
    ctx.setLineDash([]);
    for (const b of page.boxes) {
      const sel = b.type === selectedBox, hs = handlePx * (sel ? 1.25 : 1);
      for (const [x, y] of boxCorners(b)) {
        ctx.fillStyle = sel ? '#dc2626' : '#ffffff';
        ctx.strokeStyle = sel ? '#ffffff' : '#2563eb'; ctx.lineWidth = Math.max(1, hs * 0.18);
        ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
        ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
      }
    }
    ctx.setLineDash([mm(1.2), mm(0.8)]);
    for (const l of page.labels) {
      if (l.hidden) continue;
      const sel = l.key === selected;
      ctx.strokeStyle = sel ? 'rgba(220,38,38,1)' : l.pinned ? 'rgba(217,119,6,.9)' : 'rgba(37,99,235,.45)';
      ctx.lineWidth = Math.max(1, mm(sel ? 0.5 : 0.25));
      ctx.strokeRect(l.x - l.bw / 2 - 2, l.y - l.bh / 2 - 2, l.bw + 4, l.bh + 4);
    }
    ctx.restore();
  }
}

/* มุมกล่อง [nw, ne, sw, se] */
const boxCorners = b => [[b.x1, b.y1], [b.x2, b.y1], [b.x1, b.y2], [b.x2, b.y2]];
const CORNERS = ['nw', 'ne', 'sw', 'se'];

function drawTable(ctx, b, mm) {
  const t = b.spec, x0 = b.x1, y0 = b.y1;
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(x0, y0, t.w, t.h);
  ctx.strokeStyle = '#374151'; ctx.lineWidth = Math.max(0.5, mm(0.2));
  ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x0, y0, t.w, t.headH);
  let cx = x0;
  t.cols.forEach((c, i) => {
    ctx.strokeRect(cx, y0, c.w, t.headH);
    ctx.fillStyle = '#111827'; ctx.font = `700 ${t.headFs[i]}px ${FONT_TH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = t.headLines[i], lh = t.headFs[i] * 1.25;
    lines.forEach((ln, k) => ctx.fillText(ln, cx + c.w / 2, y0 + t.headH / 2 + (k - (lines.length - 1) / 2) * lh));
    cx += c.w;
  });
  t.body.forEach((r, ri) => {
    const y = y0 + t.headH + ri * t.rowH, total = ri >= t.nData;
    if (total) { ctx.fillStyle = '#f3f4f6'; ctx.fillRect(x0, y, t.w, t.rowH); }
    let x = x0;
    t.cols.forEach((c, ci) => {
      ctx.strokeRect(x, y, c.w, t.rowH);
      ctx.fillStyle = '#111827'; ctx.font = `${total ? 700 : 500} ${t.fs}px ${FONT_TH}`; ctx.textBaseline = 'middle';
      const left = c.key === 'name';
      ctx.textAlign = left ? 'left' : 'center';
      ctx.fillText(r[ci], left ? x + t.pad : x + c.w / 2, y + t.rowH / 2);
      x += c.w;
    });
  });
}

function drawLegend(ctx, b, settings, mm) {
  const s = b.spec, x0 = b.x1, y0 = b.y1;
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(x0, y0, s.w, s.h);
  ctx.strokeStyle = '#374151'; ctx.lineWidth = Math.max(0.5, mm(0.25)); ctx.strokeRect(x0, y0, s.w, s.h);
  ctx.fillStyle = '#111827'; ctx.font = `700 ${s.titleFs}px ${FONT_TH}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('สัญลักษณ์', x0 + s.pad, y0 + s.titleFs * 1.1);
  let y = y0 + s.titleFs * 2.2;
  for (const o of s.layers) {
    const img = exportAssets.icons.get(legendIconSvg(o, settings));
    if (img) ctx.drawImage(img, x0 + s.pad, y + (s.rowH - s.icon) / 2, s.icon, s.icon);
    ctx.fillStyle = '#111827'; ctx.font = `500 ${s.fs}px ${FONT_TH}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(o.name, x0 + s.textX, y + s.rowH / 2);
    y += s.rowH;
  }
  if (s.dateText) {
    ctx.fillStyle = '#374151'; ctx.font = `500 ${s.fs * 0.9}px ${FONT_TH}`;
    ctx.fillText(s.dateText, x0 + s.pad, y0 + s.h - s.fs * 1.2);
  }
}

function drawTitle(ctx, b) {
  const s = b.spec, w = b.x2 - b.x1, h = b.y2 - b.y1;
  const y0 = b.y1 + (h - s.lineH * s.lines.length) / 2 + s.lineH / 2;   // กลางบรรทัดแรก
  if (!s.bg) {   // ไม่มีพื้นหลัง: ตัวอักษรมีขอบขาว (mask) ให้อ่านออกบนแผนที่
    s.lines.forEach((ln, i) => ln && haloText(ctx, ln, b.x1 + w / 2, y0 + i * s.lineH, { size: s.fs, weight: 700, color: '#111827', halo: s.fs * 0.16 }));
    return;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(b.x1, b.y1, w, h);
  ctx.strokeStyle = '#374151'; ctx.lineWidth = Math.max(0.5, s.fs * 0.045); ctx.strokeRect(b.x1, b.y1, w, h);
  ctx.fillStyle = '#111827'; ctx.font = `700 ${s.fs}px ${FONT_TH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  s.lines.forEach((ln, i) => ctx.fillText(ln, b.x1 + w / 2, y0 + i * s.lineH));
}

function drawNorth(ctx, b, mm) {
  const cx = (b.x1 + b.x2) / 2, cy = b.y1 + mm(13), s = mm(7);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(0.5, mm(0.4)); ctx.strokeStyle = '#111827';
  ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx - s * 0.55, cy + s * 0.7); ctx.lineTo(cx, cy + s * 0.3); ctx.closePath();
  ctx.fillStyle = '#111827'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.55, cy + s * 0.7); ctx.lineTo(cx, cy + s * 0.3); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
  haloText(ctx, 'N', cx, b.y1 + mm(3), { size: mm(5), weight: 700, color: '#111827', halo: mm(0.8), family: 'system-ui, sans-serif' });
  ctx.restore();
}

function drawScalebar(ctx, b, mm) {
  const s = b.spec, bx = b.x1 + mm(3), by = b.y1 + mm(7);   // mm() ของกล่องนี้ = U × s
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
  ctx.fillStyle = '#111827'; ctx.fillRect(bx, by, s.barW / 2, s.barH);
  ctx.strokeStyle = '#111827'; ctx.lineWidth = Math.max(0.5, mm(0.25)); ctx.strokeRect(bx, by, s.barW, s.barH);
  ctx.font = `600 ${mm(3)}px ${FONT_TH}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#111827';
  ctx.fillText('0', bx, by - mm(0.8)); ctx.fillText(`${s.km} กม.`, bx + s.barW, by - mm(0.8));
}

/* ---------- ภาพจริง ---------- */
function waitIdle(m, prog, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, timeout);          // หมดเวลา → ใช้เท่าที่โหลดได้
    const tick = setInterval(() => { if (prog && prog.cancelled) { cleanup(); reject(new Error('cancelled')); } }, 250);
    function cleanup() { clearTimeout(timer); clearInterval(tick); }
    function finish() { cleanup(); resolve(); }
    m.once('idle', finish);
  });
}

/* jsPDF โหลดเมื่อใช้ครั้งแรก (ไม่ทำให้แอปหลักช้า) */
let jsPdfPromise = null;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!jsPdfPromise) jsPdfPromise = new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    sc.onload = () => window.jspdf ? resolve(window.jspdf) : reject(new Error('jspdf'));
    sc.onerror = () => { jsPdfPromise = null; reject(new Error('jspdf-load')); };
    document.head.appendChild(sc);
  });
  return jsPdfPromise;
}

/* คืน File (PNG หรือ PDF) · center/zoom/pageW = ของแผนที่ตัวอย่าง → ภาพจริงฉายจุดเหมือนตัวอย่างทุกประการ */
async function renderFinal({ settings, layout, center, zoom, pageW, prog, dpi = EXPORT_DPI, format = 'png' }) {
  const [mmW, mmH] = paperMm(settings);
  const W = mmToPx(mmW, dpi), H = mmToPx(mmH, dpi);
  const U = W / pageMm(settings)[0];
  let em = null, box = null;
  try {
    if (prog) prog.set(`โหลดแผนที่ (${W}×${H} px)…`);
    box = document.createElement('div');
    box.style.cssText = `position:fixed;left:-${W + 100}px;top:0;width:${W}px;height:${H}px;pointer-events:none;`;
    document.body.appendChild(box);
    em = new maplibregl.Map({
      container: box, style: buildBaseStyle(), pixelRatio: 1, preserveDrawingBuffer: true,
      interactive: false, attributionControl: false, fadeDuration: 0, maxPitch: 0,
      center, zoom: zoom + Math.log2(W / pageW), bearing: 0, pitch: 0,
    });
    em.on('error', e => console.warn('export map:', e.error && e.error.message));
    await new Promise((resolve, reject) => {   // แผนที่ไม่ขึ้นใน 30 วิ (WebGL ไม่พอ) → ลองความละเอียดต่ำลง
      const t = setTimeout(() => reject(new Error('map load timeout')), 30000);
      em.once('load', () => { clearTimeout(t); resolve(); });
    });
    addMapImages(em, pointIconColors(settings));
    addOverlayLayers(em);
    addFocusLayers(em);
    applyExportStyle(em, settings, U, zoom);
    await waitIdle(em, prog);

    if (prog) prog.set('วาดป้ายชื่อ…');
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(em.getCanvas(), 0, 0, W, H);
    const page = buildPage(ctx, em, U, settings, layout, zoom);
    drawPage(ctx, em, U, settings, page);
    if (prog && prog.cancelled) throw new Error('cancelled');

    if (prog) prog.set('บันทึกไฟล์…');
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const base = `map-${settings.paper}${isLandscape(settings) ? '-landscape' : ''}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    if (format === 'pdf') {
      // หน้า PDF = ขนาดกระดาษจริง (พิมพ์แล้วได้สเกลถูก) · ภาพใส่เป็น JPEG ให้ไฟล์ไม่ใหญ่เกิน
      const { jsPDF } = await loadJsPdf();
      const doc = new jsPDF({ orientation: mmW > mmH ? 'landscape' : 'portrait', unit: 'mm', format: [mmW, mmH], compress: true });
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, mmW, mmH, undefined, 'FAST');
      return new File([doc.output('blob')], base + '.pdf', { type: 'application/pdf' });
    }
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('toBlob');
    return new File([blob], base + '.png', { type: 'image/png' });
  } catch (err) {
    if (err && !['cancelled', 'jspdf', 'jspdf-load'].includes(err.message) && dpi > 100) {   // หน่วยความจำ/WebGL ไม่พอ → ลดความละเอียด
      console.warn('export: retry at 100 dpi', err);
      if (em) { try { em.remove(); } catch {} em = null; }
      if (box) { box.remove(); box = null; }
      return renderFinal({ settings, layout, center, zoom, pageW, prog, dpi: 100, format });
    }
    throw err;
  } finally {
    if (em) { try { em.remove(); } catch {} }
    if (box) box.remove();
  }
}
