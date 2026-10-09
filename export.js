'use strict';

/* ============================================================
 *  export.js — หน้าจัดวางภาพแผนที่ (Export Designer)
 *  แผนที่ตัวอย่าง (MapLibre ตัวที่สอง) + canvas ซ้อนทับ → ลาก/ปรับได้ → บันทึก PNG A2/A3
 *  แผงตั้งค่า: แท็บเล็ต = คอลัมน์ขวา · มือถือ = แผงล่าง (ลากปรับความสูงได้) · ตัวอย่างพอดีพื้นที่ที่เหลือเสมอ
 * ============================================================ */

const ds = {
  open: false, pm: null, settings: null, layout: null, mode: 'map',
  pageW: 0, pageH: 0, U: 1, ox: 0, oy: 0, zoom: 1, pan: { x: 0, y: 0 },
  page: null, selected: null, selectedBox: null, raf: 0, busy: false,
  sheetOpen: true, sheetH: 40, tab: 'layers', expanded: null,
};
const isWide = () => matchMedia('(min-width: 768px)').matches;

function loadExportState() {
  ds.settings = mergeSettings(store.get('export:settings', null));
  const l = store.get('export:layout', null) || {};
  ds.layout = { boxes: l.boxes || {}, boxesL: l.boxesL || {}, labels: l.labels || {} };
}
const curBoxes = () => layoutBoxes(ds.layout, ds.settings);
const saveExportState = () => { store.set('export:settings', ds.settings); store.set('export:layout', ds.layout); };

/* ---------- เปิด / ปิด ---------- */
async function openDesigner() {
  if (!overlayState.tung.data) { toast('ข้อมูลยังโหลดไม่เสร็จ'); return; }
  if (ds.open) return;
  loadExportState();
  ds.open = true; ds.selected = null; ds.zoom = 1; ds.pan = { x: 0, y: 0 };
  $('designer').classList.remove('hidden');
  closeSheet('layerSheet'); closeSheet('infoSheet');
  renderSettingsPanel();
  applySheetState();
  setMode('map');
  updatePaperButtons();
  updateFocusButton();
  $('dsTitle').value = ds.settings.title || '';
  setTitleBg(ds.settings.titleBg !== false);
  await Promise.all([document.fonts.load(`600 16px ${FONT_TH}`), document.fonts.load(`700 16px ${FONT_TH}`)]);
  await loadExportAssets(ds.settings);
  if (!ds.open) return;

  const pm = ds.pm = new maplibregl.Map({
    container: $('dsMap'), style: buildBaseStyle(), attributionControl: false,
    bounds: map.getBounds(), fitBoundsOptions: { padding: 0, bearing: 0 },
    maxPitch: 0, dragRotate: false, pitchWithRotate: false, touchPitch: false,
  });
  pm.touchZoomRotate.disableRotation();
  pm.once('load', () => {
    addMapImages(pm, pointIconColors(ds.settings));
    addOverlayLayers(pm);
    addFocusLayers(pm);
    applyPreviewStyle();
    pm.on('movestart', () => { $('dsCanvas').style.opacity = '0.35'; });
    pm.on('moveend', () => { applyPreviewStyle(); renderPreview(); });
    pm.once('idle', renderPreview);
  });
}

function closeDesigner() {
  ds.open = false;
  if (ds.pm) { try { ds.pm.remove(); } catch {} ds.pm = null; }
  $('designer').classList.add('hidden');
}

$('btnExport').onclick = openDesigner;
$('dsClose').onclick = closeDesigner;

/* ---------- ขนาด/ตำแหน่งหน้ากระดาษในจอ (พอดีพื้นที่ที่เหลือจากแผง) ---------- */
function layoutDesignerPage() {
  const area = $('dsArea');
  const aw = area.clientWidth - 8, ah = area.clientHeight - 8;
  const [PW, PH] = pageMm(ds.settings);
  ds.pageW = Math.max(100, Math.floor(Math.min(aw, ah * PW / PH)));
  ds.pageH = Math.round(ds.pageW * PH / PW);
  ds.U = ds.pageW / PW;
  ds.ox = Math.round((area.clientWidth - ds.pageW) / 2);
  ds.oy = Math.round((area.clientHeight - ds.pageH) / 2);
  const page = $('dsPage');
  page.style.width = ds.pageW + 'px'; page.style.height = ds.pageH + 'px';
  const z = $('dsZoom');
  z.style.left = ds.ox + 'px'; z.style.top = ds.oy + 'px';
  const c = $('dsCanvas'), dpr = window.devicePixelRatio || 1;
  c.width = Math.round(ds.pageW * dpr); c.height = Math.round(ds.pageH * dpr);
  c.style.width = ds.pageW + 'px'; c.style.height = ds.pageH + 'px';
  applyZoomTransform();
  if (ds.pm) { ds.pm.resize(); renderPreview(); }
}
window.addEventListener('resize', () => { if (ds.open) { applySheetState(); } });

function applyZoomTransform() {
  $('dsZoom').style.transform = `translate(${ds.pan.x}px, ${ds.pan.y}px) scale(${ds.zoom})`;
  $('dsZoomFit').classList.toggle('opacity-40', ds.zoom === 1 && !ds.pan.x && !ds.pan.y);
}

/* ---------- วาดตัวอย่าง ---------- */
function applyPreviewStyle() {
  if (ds.pm && ds.pm.getSource('tung')) applyExportStyle(ds.pm, ds.settings, ds.U, ds.pm.getZoom(), { minPx: 0.8 });
}
function renderPreview() {
  if (!ds.open || !ds.pm) return;
  const c = $('dsCanvas'), ctx = c.getContext('2d'), dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ds.pageW, ds.pageH);
  ds.page = buildPage(ctx, ds.pm, ds.U, ds.settings, ds.layout, ds.pm.getZoom());
  drawPage(ctx, ds.pm, ds.U, ds.settings, ds.page, { editing: ds.mode === 'edit', selected: ds.selected, selectedBox: ds.selectedBox, handlePx: 11 / ds.zoom });
  c.style.opacity = '1';
}
function scheduleRender() {
  if (ds.raf) return;
  ds.raf = requestAnimationFrame(() => { ds.raf = 0; renderPreview(); });
}

/* ---------- โหมด / กระดาษ / ซูมตัวอย่าง ---------- */
function setMode(mode) {
  ds.mode = mode;
  $('dsMap').style.pointerEvents = mode === 'edit' ? 'none' : '';
  $('dsArea').style.touchAction = mode === 'edit' ? 'none' : '';
  document.querySelectorAll('#designer [data-mode]').forEach(b => b.classList.toggle('seg-on', b.dataset.mode === mode));
  if (mode === 'map') { ds.zoom = 1; ds.pan = { x: 0, y: 0 }; applyZoomTransform(); }
  ds.selectedBox = null;
  selectLabel(null);
  renderPreview();
}
document.querySelectorAll('#designer [data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

function updatePaperButtons() {
  document.querySelectorAll('#designer [data-paper]').forEach(b => b.classList.toggle('seg-on', b.dataset.paper === ds.settings.paper));
  document.querySelectorAll('#designer [data-orient]').forEach(b => b.classList.toggle('seg-on', b.dataset.orient === ds.settings.orient));
}
/* สลับแนวตั้ง/แนวนอน: จัดหน้าตัวอย่างใหม่ (ตำแหน่งกล่องแยกเก็บตามแนว) */
document.querySelectorAll('#designer [data-orient]').forEach(b => b.onclick = () => {
  if (ds.settings.orient === b.dataset.orient) return;
  ds.settings.orient = b.dataset.orient;
  ds.selectedBox = null; ds.zoom = 1; ds.pan = { x: 0, y: 0 };
  saveExportState(); updatePaperButtons(); selectLabel(null);
  layoutDesignerPage();
});
document.querySelectorAll('#designer [data-paper]').forEach(b => b.onclick = () => {
  ds.settings.paper = b.dataset.paper; saveExportState(); updatePaperButtons();
});

/* ซูมตัวอย่างรอบจุด (cx, cy) ในพิกัดจอ — ใช้ร่วมกันทั้งปุ่ม / บีบ / ล้อเมาส์ */
function setPreviewZoom(z, cx, cy) {
  const r = $('dsArea').getBoundingClientRect();
  if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
  z = Math.min(4, Math.max(1, z));
  const qx = (cx - r.left - ds.ox - ds.pan.x) / ds.zoom, qy = (cy - r.top - ds.oy - ds.pan.y) / ds.zoom;
  ds.zoom = z;
  ds.pan = z === 1 ? { x: 0, y: 0 } : { x: cx - r.left - ds.ox - qx * z, y: cy - r.top - ds.oy - qy * z };
  applyZoomTransform();
}
$('dsZoomIn').onclick = () => { if (ds.mode !== 'edit') setMode('edit'); setPreviewZoom(ds.zoom * 1.5); };
$('dsZoomOut').onclick = () => setPreviewZoom(ds.zoom / 1.5);
$('dsZoomFit').onclick = () => setPreviewZoom(1);

/* ---------- ท่าทางในโหมดจัดวาง: ลาก / เลื่อน / บีบซูม ---------- */
const ptrs = new Map();
let gesture = null;
const dsArea = $('dsArea');
const toPage = (cx, cy) => {
  const r = dsArea.getBoundingClientRect();
  return { x: (cx - r.left - ds.ox - ds.pan.x) / ds.zoom, y: (cy - r.top - ds.oy - ds.pan.y) / ds.zoom };
};
/* ระยะจากจุดถึงกรอบ (0 = อยู่ในกรอบ) */
const distToBox = (p, x1, y1, x2, y2) => Math.hypot(Math.max(x1 - p.x, 0, p.x - x2), Math.max(y1 - p.y, 0, p.y - y2));
function hitTest(p) {
  if (!ds.page) return null;
  // จุดจับมุมกล่อง (กล่องที่เลือกอยู่ได้ก่อน)
  const hr = 16 / ds.zoom;
  const boxesOrdered = [...ds.page.boxes].sort((a, b) => (b.type === ds.selectedBox) - (a.type === ds.selectedBox));
  for (const b of boxesOrdered) {
    const cs = boxCorners(b);
    for (let i = 0; i < 4; i++) if (Math.hypot(p.x - cs[i][0], p.y - cs[i][1]) <= hr) return { type: 'handle', box: b, corner: CORNERS[i] };
  }
  const sel = ds.selected && ds.page.labels.find(l => l.key === ds.selected && !l.hidden);
  if (sel && distToBox(p, sel.x - sel.bw / 2, sel.y - sel.bh / 2, sel.x + sel.bw / 2, sel.y + sel.bh / 2) <= 24 / ds.zoom) return { type: 'label', label: sel };
  // ป้ายที่ใกล้ที่สุดภายใน 18 px บนจอ (ป้ายอยู่บนกล่อง จึงเช็กก่อน)
  // จุดอยู่ในกล่องเต็ม ๆ → กล่องมาก่อน ยกเว้นแตะโดนตัวป้ายโดยตรง (ป้ายใกล้เคียงไม่ควรแย่งกล่องบาง ๆ อย่างชื่อแผนที่)
  const inBox = ds.page.boxes.some(b => p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2);
  let best = null, bestD = 18 / ds.zoom;
  for (const l of ds.page.labels) {
    if (l.hidden) continue;
    const d = distToBox(p, l.x - l.bw / 2, l.y - l.bh / 2, l.x + l.bw / 2, l.y + l.bh / 2);
    if (inBox && d > 0) continue;
    if (d < bestD) { bestD = d; best = l; }
  }
  if (best) return { type: 'label', label: best };
  const padB = 8 / ds.zoom;
  for (const b of ds.page.boxes) if (p.x >= b.x1 - padB && p.x <= b.x2 + padB && p.y >= b.y1 - padB && p.y <= b.y2 + padB) return { type: 'box', box: b };
  return null;
}
function pinOf(label) {   // ค่า dx/dy (มม.) ปัจจุบันของป้าย (ถ้ายังไม่ pinned ใช้ตำแหน่งอัตโนมัติ)
  const ex = ds.layout.labels[label.key];
  if (ex && ex.dx != null) return { ...ex };
  const base = { dx: (label.x - label.anchor.x) / ds.U, dy: (label.y - label.anchor.y) / ds.U };
  if (label.river) Object.assign(base, { lng: label.lngLat[0], lat: label.lngLat[1], rot: label.rot });
  return base;
}
dsArea.addEventListener('pointerdown', e => {
  if (ds.mode !== 'edit' || e.target.closest('#dsLabelBar, #dsZoomBtns')) return;
  try { dsArea.setPointerCapture(e.pointerId); } catch {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    const p = toPage(e.clientX, e.clientY), hit = hitTest(p);
    if (hit && hit.type === 'handle') {
      // ปรับขนาดคงสัดส่วน: มุมตรงข้ามอยู่กับที่
      const b = hit.box, s0 = b.s || 1;
      const opp = { nw: [b.x2, b.y2], ne: [b.x1, b.y2], sw: [b.x2, b.y1], se: [b.x1, b.y1] }[hit.corner];
      gesture = { type: 'resize', hit, opp, baseW: (b.x2 - b.x1) / s0, baseH: (b.y2 - b.y1) / s0, moved: false };
      ds.selectedBox = b.type;
      if (ds.selected) selectLabel(null);
    } else if (hit) {
      const orig = hit.type === 'box'
        ? { ...(curBoxes()[hit.box.type] || {}), x: hit.box.x1 / ds.U, y: hit.box.y1 / ds.U }
        : pinOf(hit.label);
      // ป้ายที่เลือกอยู่แล้ว / กล่องที่เลือกอยู่แล้ว: ลากได้ทันที ไม่ต้องรอระยะเริ่ม
      const instant = (hit.type === 'label' && hit.label.key === ds.selected) || (hit.type === 'box' && hit.box.type === ds.selectedBox);
      gesture = { type: 'drag', hit, start: p, orig, moved: false, instant };
    } else gesture = { type: 'pan', start: { x: e.clientX, y: e.clientY }, pan0: { ...ds.pan } };
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: ds.zoom, mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pan0: { ...ds.pan } };
  }
});
dsArea.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId) || !gesture) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.type === 'pinch' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const z = Math.min(4, Math.max(1, gesture.z0 * d / gesture.d0));
    const r = dsArea.getBoundingClientRect();   // จุดใต้กึ่งกลางนิ้วต้องอยู่ที่เดิม
    const qx = (gesture.mid0.x - r.left - ds.ox - gesture.pan0.x) / gesture.z0, qy = (gesture.mid0.y - r.top - ds.oy - gesture.pan0.y) / gesture.z0;
    ds.zoom = z;
    ds.pan = { x: mid.x - r.left - ds.ox - qx * z, y: mid.y - r.top - ds.oy - qy * z };
    applyZoomTransform();
  } else if (gesture.type === 'pan') {
    if (Math.hypot(e.clientX - gesture.start.x, e.clientY - gesture.start.y) > 4) gesture.moved = true;
    ds.pan = { x: gesture.pan0.x + e.clientX - gesture.start.x, y: gesture.pan0.y + e.clientY - gesture.start.y };
    applyZoomTransform();
  } else if (gesture.type === 'resize') {
    const p = toPage(e.clientX, e.clientY), g = gesture, c = g.hit.corner;
    const s = Math.min(BOX_SCALE_MAX, Math.max(BOX_SCALE_MIN, Math.max(Math.abs(p.x - g.opp[0]) / g.baseW, Math.abs(p.y - g.opp[1]) / g.baseH)));
    const w = g.baseW * s, h = g.baseH * s;
    const x1 = c === 'nw' || c === 'sw' ? g.opp[0] - w : g.opp[0];
    const y1 = c === 'nw' || c === 'ne' ? g.opp[1] - h : g.opp[1];
    curBoxes()[g.hit.box.type] = { x: x1 / ds.U, y: y1 / ds.U, s };
    g.moved = true;
    scheduleRender();
  } else if (gesture.type === 'drag') {
    const p = toPage(e.clientX, e.clientY);
    const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
    if (!gesture.moved && !gesture.instant && Math.hypot(dx, dy) * ds.zoom < 4) return;
    gesture.moved = true;
    if (gesture.hit.type === 'box') {
      curBoxes()[gesture.hit.box.type] = { ...gesture.orig, x: gesture.orig.x + dx / ds.U, y: gesture.orig.y + dy / ds.U };
      ds.selectedBox = gesture.hit.box.type;
    } else {
      ds.layout.labels[gesture.hit.label.key] = { ...gesture.orig, dx: gesture.orig.dx + dx / ds.U, dy: gesture.orig.dy + dy / ds.U };
      ds.selected = gesture.hit.label.key;
    }
    scheduleRender();
  }
});
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gesture && gesture.type === 'resize') { if (gesture.moved) saveExportState(); renderPreview(); }
  if (gesture && gesture.type === 'drag') {
    if (gesture.hit.type === 'label') { ds.selectedBox = null; if (gesture.moved) saveExportState(); selectLabel(gesture.hit.label.key); }
    else { ds.selectedBox = gesture.hit.box.type; if (gesture.moved) saveExportState(); selectLabel(null); }
  } else if (gesture && gesture.type === 'pan' && !gesture.moved) {
    if (ds.selectedBox) { ds.selectedBox = null; renderPreview(); }
  }
  gesture = ptrs.size === 1 ? { type: 'pan', start: { ...[...ptrs.values()][0] }, pan0: { ...ds.pan } } : null;
}
dsArea.addEventListener('pointerup', endPointer);
dsArea.addEventListener('pointercancel', endPointer);
dsArea.addEventListener('wheel', e => {
  if (ds.mode !== 'edit') return;
  e.preventDefault();
  setPreviewZoom(ds.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
}, { passive: false });

/* ---------- เลือกป้าย: ซ่อน / คืนอัตโนมัติ ---------- */
function selectLabel(key) {
  ds.selected = key;
  const bar = $('dsLabelBar');
  bar.classList.toggle('hidden', !key);
  if (key) {
    const l = ds.page && ds.page.labels.find(x => x.key === key);
    $('dsLabelName').textContent = l ? l.text : '';
    $('dsLabelAuto').classList.toggle('hidden', !(l && l.pinned));
  }
  if (ds.open) renderPreview();
}
$('dsLabelHide').onclick = () => {
  if (!ds.selected) return;
  ds.layout.labels[ds.selected] = { ...(ds.layout.labels[ds.selected] || {}), hidden: true };
  saveExportState(); selectLabel(null); renderHiddenCount();
};
$('dsLabelAuto').onclick = () => {
  if (!ds.selected) return;
  delete ds.layout.labels[ds.selected];
  saveExportState(); selectLabel(null);
};
$('dsLabelClose').onclick = () => selectLabel(null);

/* ---------- แผงตั้งค่า: เปิด/ปิด + ความสูง (มือถือ) ---------- */
function applySheetState() {
  const sheet = $('dsSheet');
  sheet.classList.toggle('hidden', !ds.sheetOpen);
  sheet.style.setProperty('--sh', ds.sheetH + '%');
  $('dsSettings').classList.toggle('seg-on', ds.sheetOpen);
  layoutDesignerPage();
}
$('dsSettings').onclick = () => { ds.sheetOpen = !ds.sheetOpen; applySheetState(); };
$('dsSheetClose').onclick = () => { ds.sheetOpen = false; applySheetState(); };

// ที่จับลากปรับความสูงแผง (มือถือ)
let handleDrag = null;
$('dsHandle').addEventListener('pointerdown', e => {
  try { $('dsHandle').setPointerCapture(e.pointerId); } catch {}
  handleDrag = { h0: ds.sheetH, y0: e.clientY, bodyH: $('dsBody').clientHeight, raf: 0 };
});
$('dsHandle').addEventListener('pointermove', e => {
  if (!handleDrag) return;
  ds.sheetH = Math.min(85, Math.max(25, handleDrag.h0 + (handleDrag.y0 - e.clientY) / handleDrag.bodyH * 100));
  $('dsSheet').style.setProperty('--sh', ds.sheetH + '%');
  const hd = handleDrag;
  if (!hd.raf) hd.raf = requestAnimationFrame(() => { hd.raf = 0; layoutDesignerPage(); });
});
const endHandle = () => {
  if (!handleDrag) return;
  handleDrag = null;
  ds.sheetH = ds.sheetH < 60 ? 40 : 80;   // snap
  applySheetState();
};
$('dsHandle').addEventListener('pointerup', endHandle);
$('dsHandle').addEventListener('pointercancel', endHandle);

/* ---------- แผงตั้งค่า: แท็บ + การ์ดพับ ---------- */
const slider = (path, v, min, max, step, label) => `
  <label class="flex items-center gap-2 text-xs text-gray-600"><span class="w-16 flex-none">${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-path="${path}" class="flex-1 min-w-0">
    <span class="w-9 text-right tabular-nums" data-val="${path}">${v}×</span></label>`;
const colorInput = (path, v, label) => v ? `
  <label class="flex items-center gap-1.5 text-xs text-gray-600">${label}
    <input type="color" value="${v}" data-path="${path}" data-kind="color" class="w-8 h-7 p-0 border-0 bg-transparent rounded"></label>` : '';
const toggle = (path, on) => `<label class="switch"><input type="checkbox" data-path="${path}" ${on ? 'checked' : ''}><span></span></label>`;
const chevron = () => `<svg class="w-5 h-5 text-gray-400 flex-none transition-transform chev" viewBox="0 0 24 24" fill="currentColor"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>`;
/* การ์ดพับได้: head (แตะเพื่อกาง) + body */
const card = (key, head, body) => `
  <div class="rounded-2xl border border-gray-200 px-3" data-card="${key}">
    <div class="flex items-center gap-2 min-h-[44px] cursor-pointer select-none" data-expand="${key}">${head}${chevron()}</div>
    <div class="pb-3 pt-1 flex flex-col gap-2 ${ds.expanded === key ? '' : 'hidden'}" data-sub="${key}">${body}</div>
  </div>`;
const TABS = [['layers', 'เลเยอร์'], ['labels', 'ป้ายชื่อ'], ['boxes', 'ตาราง-สัญลักษณ์'], ['other', 'อื่น ๆ']];

function renderSettingsPanel() {
  const s = ds.settings;
  $('dsTabs').innerHTML = TABS.map(([k, n]) => `<button data-tab="${k}" class="${ds.tab === k ? 'seg-on' : ''}">${n}</button>`).join('');
  let html = '';
  if (ds.tab === 'layers') {
    html = `<div class="flex flex-col gap-2">${OVERLAYS.map(o => {
      const ls = s.layers[o.id];
      const isPoint = !POLY_ICONS.includes(o.icon) && !LINE_ICONS.includes(o.icon);
      const icon = layerIcon({ icon: o.icon, swatch: ls.fillColor || ls.lineColor || o.swatch, outline: ls.lineColor || o.outline, dash: ls.dash === 'dash' }, 22);
      return card(`layer:${o.id}`,
        `<span class="w-8 h-8 rounded-lg flex-none bg-gray-100 grid place-items-center" data-icon="${o.id}">${icon}</span>
         <div class="flex-1 min-w-0 text-sm font-medium truncate">${o.name}</div>${toggle(`layers.${o.id}.on`, ls.on)}`,
        `${isPoint ? slider(`layers.${o.id}.iconSize`, ls.iconSize, 0.5, 3, 0.1, 'ขนาดไอคอน') : slider(`layers.${o.id}.width`, ls.width, 0.5, 3, 0.1, 'ความหนา')}
         <div class="flex flex-wrap items-center gap-x-5 gap-y-2">${colorInput(`layers.${o.id}.fillColor`, ls.fillColor, isPoint ? 'สีไอคอน' : 'สีพื้น')}${colorInput(`layers.${o.id}.lineColor`, ls.lineColor, 'สีเส้น')}
           ${o.lineStyle ? `<div class="seg ml-auto" title="ชนิดเส้น"><button data-dash="${o.id}:solid" class="${ls.dash !== 'dash' ? 'seg-on' : ''}">เส้นทึบ</button><button data-dash="${o.id}:dash" class="${ls.dash === 'dash' ? 'seg-on' : ''}">เส้นประ</button></div>` : ''}</div>`);
    }).join('')}</div>`;
  } else if (ds.tab === 'labels') {
    html = `<div class="flex flex-col gap-2">${Object.entries(LABEL_CLASS_NAMES).map(([cls, name]) => {
      const l = s.labels[cls];
      return card(`label:${cls}`,
        `<div class="flex-1 min-w-0 text-sm font-medium truncate">${name}</div>
         <input type="color" value="${l.color}" data-path="labels.${cls}.color" data-kind="color" aria-label="สี" class="w-7 h-7 p-0 border-0 bg-transparent rounded-full flex-none">
         ${toggle(`labels.${cls}.on`, l.on)}`,
        slider(`labels.${cls}.size`, l.size, 0.5, 2, 0.05, 'ขนาด'));
    }).join('')}</div>`;
  } else if (ds.tab === 'boxes') {
    const check = (path, on, label, extra = '', disabled = false) => `
      <label class="flex items-center gap-3 min-h-[38px] text-sm ${disabled ? 'opacity-50' : ''}">
        <input type="checkbox" data-path="${path}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} class="w-5 h-5 accent-blue-600 flex-none">
        ${extra}<span class="flex-1 min-w-0">${label}</span></label>`;
    const tableBody = TABLE_COLS.map(c => c.key === 'name'
      ? check('table.cols.name', true, `${c.name} <span class="text-xs text-gray-400">(แสดงเสมอ)</span>`, '', true)
      : check(`table.cols.${c.key}`, s.table.cols[c.key] !== false, c.name)).join('') +
      `<div class="border-t border-gray-100 mt-1 pt-1">${check('table.totals', s.table.totals, 'แถวรวม (10 ทุ่ง / 11 ทุ่ง)')}</div>`;
    const legendBody = LEGEND_ORDER.map(id => OVERLAYS.find(o => o.id === id)).filter(Boolean).map(o => {
      const ls = s.layers[o.id];
      const icon = `<span class="w-6 h-6 flex-none grid place-items-center">${layerIcon({ icon: o.icon, swatch: ls.fillColor || ls.lineColor || o.swatch, outline: ls.lineColor || o.outline, dash: ls.dash === 'dash' }, 20)}</span>`;
      return check(`legend.items.${o.id}`, s.legend.items[o.id] !== false, ls.on ? o.name : `${o.name} <span class="text-xs text-gray-400">(เลเยอร์ปิดอยู่)</span>`, icon, !ls.on);
    }).join('');
    html = `<div class="flex flex-col gap-2">
        ${card('box:table', `<div class="flex-1 min-w-0 text-sm font-medium truncate">ตารางข้อมูลทุ่งรับน้ำ</div>${toggle('table.on', s.table.on)}`, tableBody)}
        ${card('box:legend', `<div class="flex-1 min-w-0 text-sm font-medium truncate">กล่องสัญลักษณ์</div>${toggle('legend.on', s.legend.on)}`, legendBody)}
      </div>`;
  } else {
    const furn = [['logo', 'โลโก้ สทนช.'], ['north', 'ลูกศรทิศเหนือ'], ['scalebar', 'มาตราส่วน'], ['date', 'ข้อมูล ณ วันที่ (ในกล่องสัญลักษณ์)']]
      .map(([k, n]) => `<div class="flex items-center gap-3 min-h-[44px] border-b border-gray-100"><div class="flex-1 text-sm">${n}</div>${toggle(`furniture.${k}`, s.furniture[k])}</div>`).join('');
    html = `<label class="block text-sm font-medium mb-1" for="dsTitleField">ชื่อแผนที่</label>
      <input id="dsTitleField" type="text" maxlength="100" value="${escapeHtml(s.title || '')}" placeholder="พิมพ์ชื่อแผนที่ (แสดงกลางบน ลากย้ายได้)" class="w-full h-11 rounded-xl border border-gray-300 px-3 text-sm mb-1">
      <label class="flex items-center gap-3 min-h-[44px] border-b border-gray-100"><span class="flex-1 text-sm">พื้นหลังชื่อแผนที่ <span class="text-xs text-gray-400">(ปิด = ตัวอักษรขอบขาว)</span></span><span class="switch"><input type="checkbox" id="dsTitleBgField" ${s.titleBg !== false ? 'checked' : ''}><span></span></span></label>
      ${furn}
      <button id="dsUnhide" class="mt-4 w-full h-10 rounded-xl bg-gray-100 text-sm text-gray-800 active:bg-gray-200"></button>
      <button id="dsResetBoxes" class="mt-2 w-full h-10 rounded-xl bg-gray-100 text-sm text-gray-800 active:bg-gray-200">คืนขนาด/ตำแหน่งกล่องทั้งหมด</button>
      <button id="dsResetAll" class="mt-2 w-full h-10 rounded-xl bg-red-50 text-sm font-medium text-red-700 active:bg-red-100">รีเซ็ตการจัดวางทั้งหมด</button>`;
  }
  $('dsSheetBody').innerHTML = html;
  $('dsSheetBody').scrollTop = 0;
  renderHiddenCount();
  const ra = $('dsResetAll');
  if (ra) ra.onclick = resetDesigner;
  const rb = $('dsResetBoxes');
  if (rb) rb.onclick = () => { ds.layout.boxes = {}; ds.layout.boxesL = {}; ds.selectedBox = null; saveExportState(); renderPreview(); };
  const un = $('dsUnhide');
  if (un) un.onclick = () => {
    for (const [k, v] of Object.entries(ds.layout.labels)) { if (v.hidden) { delete v.hidden; if (v.dx == null) delete ds.layout.labels[k]; } }
    saveExportState(); renderHiddenCount(); renderPreview();
  };
}
function renderHiddenCount() {
  const b = $('dsUnhide');
  if (!b) return;
  const n = Object.values(ds.layout.labels).filter(v => v.hidden).length;
  b.textContent = n ? `แสดงป้ายที่ซ่อนไว้ทั้งหมด (${n})` : 'ไม่มีป้ายที่ซ่อนไว้';
  b.disabled = !n; b.style.opacity = n ? '' : '0.5';
}
$('dsTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  ds.tab = b.dataset.tab; ds.expanded = null;
  renderSettingsPanel();
});
$('dsSheetBody').addEventListener('click', async e => {
  const dashBtn = e.target.closest('[data-dash]');
  if (dashBtn) {   // ชนิดเส้น: ทึบ / ประ (ขอบเขตจังหวัด, ลุ่มน้ำหลัก)
    const [id, style] = dashBtn.dataset.dash.split(':'), ls = ds.settings.layers[id], o = OVERLAYS.find(x => x.id === id);
    ls.dash = style; saveExportState();
    dashBtn.parentElement.querySelectorAll('[data-dash]').forEach(b => b.classList.toggle('seg-on', b === dashBtn));
    const holder = $('dsSheetBody').querySelector(`[data-icon="${id}"]`);
    if (holder) holder.innerHTML = layerIcon({ icon: o.icon, swatch: ls.fillColor || ls.lineColor || o.swatch, outline: ls.lineColor || o.outline, dash: style === 'dash' }, 22);
    applyPreviewStyle();
    await loadExportAssets(ds.settings);
    scheduleRender();
    return;
  }
  if (e.target.closest('.switch, input')) return;   // สวิตช์/ช่องสี ไม่ใช่การกาง
  const h = e.target.closest('[data-expand]');
  if (!h) return;
  const key = h.dataset.expand;
  ds.expanded = ds.expanded === key ? null : key;
  $('dsSheetBody').querySelectorAll('[data-sub]').forEach(el => el.classList.toggle('hidden', el.dataset.sub !== ds.expanded));
  $('dsSheetBody').querySelectorAll('[data-expand] .chev').forEach(el => el.classList.toggle('rotate-180', el.closest('[data-expand]').dataset.expand === ds.expanded));
});

const setPath = (obj, path, v) => { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = v; };
$('dsSheetBody').addEventListener('input', async e => {
  const path = e.target.dataset.path;
  if (!path) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
  setPath(ds.settings, path, v);
  const val = $('dsSheetBody').querySelector(`[data-val="${path}"]`);
  if (val) val.textContent = `${v}×`;
  saveExportState();
  if (path.startsWith('layers.')) {
    if (ds.pm && ds.pm.getSource('tung')) {
      if (path.endsWith('fillColor') && (path.includes('water-other') || path.includes('visits'))) setPointIcons(ds.pm, ds.settings);
      applyPreviewStyle();
    }
    if (e.target.dataset.kind === 'color') {
      await loadExportAssets(ds.settings);
      const id = path.split('.')[1], o = OVERLAYS.find(x => x.id === id), ls = ds.settings.layers[id];
      const holder = $('dsSheetBody').querySelector(`[data-icon="${id}"]`);
      if (holder) holder.innerHTML = layerIcon({ icon: o.icon, swatch: ls.fillColor || ls.lineColor || o.swatch, outline: ls.lineColor || o.outline, dash: ls.dash === 'dash' }, 22);
    }
  }
  scheduleRender();
});

/* ---------- ชื่อแผนที่: ช่องบนแถบหัว (จอกว้าง) + ช่องในแท็บ "อื่น ๆ" ใช้ค่าเดียวกัน ---------- */
function setMapTitle(v, source) {
  ds.settings.title = v; saveExportState();
  for (const id of ['dsTitle', 'dsTitleField']) { const el = $(id); if (el && el !== source && el.value !== v) el.value = v; }
  scheduleRender();
}
$('dsTitle').addEventListener('input', e => setMapTitle(e.target.value, e.target));
function setTitleBg(on) {
  ds.settings.titleBg = on; saveExportState();
  $('dsTitleBg').checked = on;
  const f = $('dsTitleBgField'); if (f) f.checked = on;
  scheduleRender();
}
$('dsTitleBg').onchange = e => setTitleBg(e.target.checked);
$('dsSheetBody').addEventListener('change', e => { if (e.target.id === 'dsTitleBgField') setTitleBg(e.target.checked); });
$('dsSheetBody').addEventListener('input', e => { if (e.target.id === 'dsTitleField') setMapTitle(e.target.value, e.target); });

/* ---------- เน้นพื้นที่ (ลุ่มน้ำ / จังหวัด) ปุ่มบนแถบเครื่องมือ — สถานะเดียวกับแผนที่หลัก ---------- */
async function focusFromDesigner(key) {
  await setFocusArea(key || null, { fit: false });
  if (focusArea && ds.pm) {
    const pad = Math.round(ds.U * (PAGE_MARGIN_MM + 10));
    ds.pm.fitBounds(focusArea.bounds, { padding: pad, duration: 0 });
  }
}
function updateFocusButton() {
  const b = $('dsFocusBtn'), on = !!focusArea;
  b.classList.toggle('bg-teal-600', on); b.classList.toggle('text-white', on);
  b.classList.toggle('bg-gray-100', !on); b.classList.toggle('text-gray-700', !on);
  $('dsFocusName').textContent = on ? focusArea.name : 'เลือกพื้นที่';
  b.title = on ? `พื้นที่: ${focusArea.name}` : 'เลือกพื้นที่ (ลุ่มน้ำ / จังหวัด)';
}
$('dsFocusBtn').onclick = e => { e.stopPropagation(); toggleSaveMenu(false); toggleFocusMenu($('dsFocusBtn'), focusFromDesigner); };
focusListeners.push(() => {
  updateFocusButton();
  if (!ds.open || !ds.pm) return;
  setFocusData(ds.pm);
  renderPreview();
});

/* ---------- รีเซ็ต ---------- */
async function resetDesigner() {
  if (!await confirmModal('รีเซ็ตการจัดวางทั้งหมด?\nชั้นข้อมูล สี ขนาด และตำแหน่งที่ย้ายไว้จะกลับเป็นค่าเริ่มต้น', { ok: 'รีเซ็ต', danger: true })) return;
  const { paper, orient } = ds.settings;
  ds.settings = mergeSettings(null); ds.settings.paper = paper; ds.settings.orient = orient;
  ds.layout = { boxes: {}, boxesL: {}, labels: {} };
  saveExportState();
  await loadExportAssets(ds.settings);
  if (ds.pm && ds.pm.getSource('tung')) { setPointIcons(ds.pm, ds.settings); applyPreviewStyle(); }
  $('dsTitle').value = '';
  setTitleBg(true);
  renderSettingsPanel(); selectLabel(null); renderPreview();
}

/* ---------- บันทึกภาพ ---------- */
function showProgress(title) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-[60] grid place-items-center bg-black/40 p-6';
  wrap.innerHTML = `
    <div class="w-full max-w-[300px] rounded-2xl bg-white shadow-2xl p-5 text-center">
      <div class="mx-auto w-9 h-9 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin"></div>
      <p class="mt-3 font-semibold text-gray-900"></p>
      <p data-step class="text-sm text-gray-500 mt-1"></p>
      <button data-cancel class="mt-4 h-10 px-5 rounded-xl bg-gray-100 text-gray-800 text-sm active:bg-gray-200">ยกเลิก</button>
    </div>`;
  wrap.querySelector('p').textContent = title;
  const st = { cancelled: false, set(t) { wrap.querySelector('[data-step]').textContent = t; }, close() { wrap.remove(); } };
  wrap.querySelector('[data-cancel]').onclick = () => { st.cancelled = true; st.set('กำลังยกเลิก…'); };
  document.body.appendChild(wrap);
  return st;
}

/* ปุ่มบันทึก → เมนู PNG / PDF → ดาวน์โหลดทันที */
function toggleSaveMenu(open) {
  const m = $('dsSaveMenu');
  open = open ?? m.classList.contains('hidden');
  m.classList.toggle('hidden', !open);
}
$('dsSave').onclick = e => { e.stopPropagation(); toggleFocusMenu(false); toggleSaveMenu(); };
document.addEventListener('pointerdown', e => {
  if (!$('dsSaveMenu').classList.contains('hidden') && !e.target.closest('#dsSaveMenu, #dsSave')) toggleSaveMenu(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleSaveMenu(false); });
$('dsSaveMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-format]');
  if (!b) return;
  toggleSaveMenu(false);
  saveExport(b.dataset.format);
});

async function saveExport(format) {
  if (!ds.pm || ds.busy) return;
  ds.busy = true;
  selectLabel(null);
  const prog = showProgress(`กำลังสร้าง${format === 'pdf' ? ' PDF' : 'ภาพ'} ${ds.settings.paper}`);
  try {
    const file = await renderFinal({ settings: ds.settings, layout: ds.layout, center: ds.pm.getCenter(), zoom: ds.pm.getZoom(), pageW: ds.pageW, prog, format });
    prog.close();
    downloadFile(file);
  } catch (err) {
    prog.close();
    if (err && err.message === 'cancelled') return;
    console.error('export', err);
    toast(err && String(err.message).startsWith('jspdf')
      ? 'สร้าง PDF ไม่ได้ (ต้องต่ออินเทอร์เน็ต) — ลองบันทึกเป็น PNG'
      : 'สร้างภาพไม่สำเร็จ — ลองใช้ขนาด A3 หรือปิดบางชั้นข้อมูล');
  } finally {
    ds.busy = false;
  }
}
