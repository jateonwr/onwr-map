'use strict';

/* ============================================================
 *  export.js — หน้าจัดวางภาพแผนที่ (Export Designer)
 *  แผนที่ตัวอย่าง (MapLibre ตัวที่สอง) + canvas ซ้อนทับ → ลาก/ปรับได้ → บันทึก PNG A2/A3
 * ============================================================ */

const ds = {
  open: false, pm: null, settings: null, layout: null, mode: 'map',
  pageW: 0, pageH: 0, U: 1, ox: 0, oy: 0, zoom: 1, pan: { x: 0, y: 0 },
  page: null, selected: null, raf: 0, busy: false,
};

function loadExportState() {
  ds.settings = mergeSettings(store.get('export:settings', null));
  const l = store.get('export:layout', null) || {};
  ds.layout = { boxes: l.boxes || {}, labels: l.labels || {} };
}
const saveExportState = () => { store.set('export:settings', ds.settings); store.set('export:layout', ds.layout); };

/* ---------- เปิด / ปิด ---------- */
async function openDesigner() {
  if (!overlayState.tung.data) { toast('ข้อมูลยังโหลดไม่เสร็จ'); return; }
  if (ds.open) return;
  loadExportState();
  ds.open = true; ds.selected = null; ds.zoom = 1; ds.pan = { x: 0, y: 0 };
  $('designer').classList.remove('hidden');
  closeSheet('layerSheet'); closeSheet('infoSheet');
  layoutDesignerPage();
  setMode('map');
  updatePaperButtons();
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
    applyPreviewStyle();
    pm.on('movestart', () => { $('dsCanvas').style.opacity = '0.35'; });
    pm.on('moveend', () => { applyPreviewStyle(); renderPreview(); });
    pm.once('idle', renderPreview);
  });
  renderSettingsSheet();
}

function closeDesigner() {
  ds.open = false;
  if (ds.pm) { try { ds.pm.remove(); } catch {} ds.pm = null; }
  $('designer').classList.add('hidden');
  closeDsSheet();
}

$('btnExport').onclick = openDesigner;
$('dsClose').onclick = closeDesigner;

/* ---------- ขนาด/ตำแหน่งหน้ากระดาษในจอ ---------- */
function layoutDesignerPage() {
  const area = $('dsArea');
  const aw = area.clientWidth - 16, ah = area.clientHeight - 16;
  ds.pageW = Math.max(100, Math.floor(Math.min(aw, ah * PAGE_MM[0] / PAGE_MM[1])));
  ds.pageH = Math.round(ds.pageW * PAGE_MM[1] / PAGE_MM[0]);
  ds.U = ds.pageW / PAGE_MM[0];
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
window.addEventListener('resize', () => { if (ds.open) layoutDesignerPage(); });

function applyZoomTransform() {
  $('dsZoom').style.transform = `translate(${ds.pan.x}px, ${ds.pan.y}px) scale(${ds.zoom})`;
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
  drawPage(ctx, ds.pm, ds.U, ds.settings, ds.page, { editing: ds.mode === 'edit', selected: ds.selected });
  c.style.opacity = '1';
}
function scheduleRender() {
  if (ds.raf) return;
  ds.raf = requestAnimationFrame(() => { ds.raf = 0; renderPreview(); });
}

/* ---------- โหมด / กระดาษ ---------- */
function setMode(mode) {
  ds.mode = mode;
  $('dsMap').style.pointerEvents = mode === 'edit' ? 'none' : '';
  $('dsArea').style.touchAction = mode === 'edit' ? 'none' : '';
  document.querySelectorAll('#designer [data-mode]').forEach(b => b.classList.toggle('seg-on', b.dataset.mode === mode));
  $('dsHint').textContent = mode === 'edit' ? 'ลากป้าย/กล่องเพื่อย้าย · แตะป้ายเพื่อซ่อน · บีบเพื่อขยายตัวอย่าง' : 'เลื่อน/ซูมแผนที่ให้ได้มุมมองที่ต้องการ';
  if (mode === 'map') { ds.zoom = 1; ds.pan = { x: 0, y: 0 }; applyZoomTransform(); }
  selectLabel(null);
  renderPreview();
}
document.querySelectorAll('#designer [data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));

function updatePaperButtons() {
  document.querySelectorAll('#designer [data-paper]').forEach(b => b.classList.toggle('seg-on', b.dataset.paper === ds.settings.paper));
}
document.querySelectorAll('#designer [data-paper]').forEach(b => b.onclick = () => {
  ds.settings.paper = b.dataset.paper; saveExportState(); updatePaperButtons();
});

/* ---------- ท่าทางในโหมดจัดวาง: ลาก / เลื่อน / บีบซูม ---------- */
const ptrs = new Map();
let gesture = null;
const dsArea = $('dsArea');
const toPage = (cx, cy) => {
  const r = dsArea.getBoundingClientRect();
  return { x: (cx - r.left - ds.ox - ds.pan.x) / ds.zoom, y: (cy - r.top - ds.oy - ds.pan.y) / ds.zoom };
};
function hitTest(p) {
  if (!ds.page) return null;
  for (let i = ds.page.labels.length - 1; i >= 0; i--) {
    const l = ds.page.labels[i];
    if (l.hidden) continue;
    if (p.x >= l.x - l.bw / 2 - 3 && p.x <= l.x + l.bw / 2 + 3 && p.y >= l.y - l.bh / 2 - 3 && p.y <= l.y + l.bh / 2 + 3) return { type: 'label', label: l };
  }
  for (const b of ds.page.boxes) if (p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2) return { type: 'box', box: b };
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
  if (ds.mode !== 'edit' || e.target.closest('#dsLabelBar')) return;
  dsArea.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    const p = toPage(e.clientX, e.clientY), hit = hitTest(p);
    if (hit) {
      const orig = hit.type === 'box'
        ? (ds.layout.boxes[hit.box.type] || { x: hit.box.x1 / ds.U, y: hit.box.y1 / ds.U })
        : pinOf(hit.label);
      gesture = { type: 'drag', hit, start: p, orig, moved: false };
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
    // จุดบนหน้ากระดาษใต้กึ่งกลางนิ้วต้องอยู่ที่เดิม
    const r = dsArea.getBoundingClientRect();
    const qx = (gesture.mid0.x - r.left - ds.ox - gesture.pan0.x) / gesture.z0, qy = (gesture.mid0.y - r.top - ds.oy - gesture.pan0.y) / gesture.z0;
    ds.zoom = z;
    ds.pan = { x: mid.x - r.left - ds.ox - qx * z, y: mid.y - r.top - ds.oy - qy * z };
    applyZoomTransform();
  } else if (gesture.type === 'pan') {
    ds.pan = { x: gesture.pan0.x + e.clientX - gesture.start.x, y: gesture.pan0.y + e.clientY - gesture.start.y };
    applyZoomTransform();
  } else if (gesture.type === 'drag') {
    const p = toPage(e.clientX, e.clientY);
    const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) * ds.zoom < 4) return;
    gesture.moved = true;
    if (gesture.hit.type === 'box') {
      ds.layout.boxes[gesture.hit.box.type] = { x: gesture.orig.x + dx / ds.U, y: gesture.orig.y + dy / ds.U };
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
  if (gesture && gesture.type === 'drag') {
    if (gesture.moved) saveExportState();
    else if (gesture.hit.type === 'label') selectLabel(gesture.hit.label.key);
    else selectLabel(null);
  }
  gesture = ptrs.size === 1 ? { type: 'pan', start: { ...[...ptrs.values()][0] }, pan0: { ...ds.pan } } : null;
}
dsArea.addEventListener('pointerup', endPointer);
dsArea.addEventListener('pointercancel', endPointer);
dsArea.addEventListener('wheel', e => {
  if (ds.mode !== 'edit') return;
  e.preventDefault();
  const r = dsArea.getBoundingClientRect();
  const z = Math.min(4, Math.max(1, ds.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  const qx = (e.clientX - r.left - ds.ox - ds.pan.x) / ds.zoom, qy = (e.clientY - r.top - ds.oy - ds.pan.y) / ds.zoom;
  ds.zoom = z;
  ds.pan = { x: e.clientX - r.left - ds.ox - qx * z, y: e.clientY - r.top - ds.oy - qy * z };
  applyZoomTransform();
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

/* ---------- แผงตั้งค่า ---------- */
const slider = (path, v, min, max, step, label) => `
  <label class="flex items-center gap-2 text-xs text-gray-600"><span class="w-20 flex-none">${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-path="${path}" class="flex-1">
    <span class="w-9 text-right tabular-nums" data-val="${path}">${v}×</span></label>`;
const colorInput = (path, v, label) => v ? `
  <label class="flex items-center gap-1.5 text-xs text-gray-600">${label}
    <input type="color" value="${v}" data-path="${path}" data-kind="color" class="w-8 h-7 p-0 border-0 bg-transparent rounded"></label>` : '';
const toggle = (path, on) => `<label class="switch"><input type="checkbox" data-path="${path}" ${on ? 'checked' : ''}><span></span></label>`;

function renderSettingsSheet() {
  const s = ds.settings;
  const layers = OVERLAYS.map(o => {
    const ls = s.layers[o.id];
    const isPoint = !POLY_ICONS.includes(o.icon) && !LINE_ICONS.includes(o.icon);
    return `
      <div class="rounded-2xl border border-gray-200 p-3">
        <div class="flex items-center gap-3">
          <span class="w-8 h-8 rounded-lg flex-none bg-gray-100 grid place-items-center">${layerIcon({ icon: o.icon, swatch: ls.fillColor || ls.lineColor || o.swatch, outline: ls.lineColor || o.outline }, 22)}</span>
          <div class="flex-1 font-medium text-sm">${o.name}</div>
          ${toggle(`layers.${o.id}.on`, ls.on)}
        </div>
        <div class="mt-2 flex flex-col gap-1.5 ${ls.on ? '' : 'hidden'}">
          ${isPoint ? slider(`layers.${o.id}.iconSize`, ls.iconSize, 0.5, 3, 0.1, 'ขนาดไอคอน') : slider(`layers.${o.id}.width`, ls.width, 0.5, 3, 0.1, 'ความหนาเส้น')}
          <div class="flex gap-4">${colorInput(`layers.${o.id}.fillColor`, ls.fillColor, isPoint ? 'สีไอคอน' : 'สีพื้น')}${colorInput(`layers.${o.id}.lineColor`, ls.lineColor, 'สีเส้น')}</div>
        </div>
      </div>`;
  }).join('');
  const labels = Object.entries(LABEL_CLASS_NAMES).map(([cls, name]) => {
    const l = s.labels[cls];
    return `
      <div class="rounded-2xl border border-gray-200 p-3">
        <div class="flex items-center gap-3"><div class="flex-1 font-medium text-sm">${name}</div>${toggle(`labels.${cls}.on`, l.on)}</div>
        <div class="mt-2 flex items-center gap-3 ${l.on ? '' : 'hidden'}">
          <div class="flex-1">${slider(`labels.${cls}.size`, l.size, 0.5, 2, 0.05, 'ขนาด')}</div>
          ${colorInput(`labels.${cls}.color`, l.color, 'สี')}
        </div>
      </div>`;
  }).join('');
  const box = (key, name) => `
    <div class="rounded-2xl border border-gray-200 p-3">
      <div class="flex items-center gap-3"><div class="flex-1 font-medium text-sm">${name}</div>${toggle(`${key}.on`, s[key].on)}</div>
      <div class="mt-2 flex flex-col gap-1.5 ${s[key].on ? '' : 'hidden'}">
        ${slider(`${key}.font`, s[key].font, 0.6, 1.6, 0.05, 'ตัวอักษร')}${slider(`${key}.scale`, s[key].scale, 0.6, 1.6, 0.05, 'ขนาดกล่อง')}
      </div>
    </div>`;
  const furn = [['logo', 'โลโก้ สทนช.'], ['north', 'ลูกศรทิศเหนือ'], ['scalebar', 'มาตราส่วน'], ['date', 'ข้อมูล ณ วันที่ (ในกล่องสัญลักษณ์)']]
    .map(([k, n]) => `<div class="flex items-center gap-3 py-2 border-b border-gray-100"><div class="flex-1 text-sm">${n}</div>${toggle(`furniture.${k}`, s.furniture[k])}</div>`).join('');
  const sec = (t, body) => `<div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-5 mb-2 first:mt-0">${t}</div>${body}`;
  $('dsSheetBody').innerHTML =
    sec('ชั้นข้อมูลในภาพ', `<div class="flex flex-col gap-2">${layers}</div>`) +
    sec('ป้ายชื่อ', `<div class="flex flex-col gap-2">${labels}</div>
      <button id="dsUnhide" class="mt-2 w-full h-10 rounded-xl bg-gray-100 text-sm text-gray-800 active:bg-gray-200"></button>`) +
    sec('ตารางและสัญลักษณ์', `<div class="flex flex-col gap-2">${box('table', 'ตารางข้อมูลทุ่งรับน้ำ')}${box('legend', 'กล่องสัญลักษณ์')}</div>`) +
    sec('องค์ประกอบอื่น', furn);
  renderHiddenCount();
  $('dsUnhide').onclick = () => {
    for (const [k, v] of Object.entries(ds.layout.labels)) { if (v.hidden) { delete v.hidden; if (v.dx == null) delete ds.layout.labels[k]; } }
    saveExportState(); renderHiddenCount(); renderPreview();
  };
}
function renderHiddenCount() {
  const n = Object.values(ds.layout.labels).filter(v => v.hidden).length;
  const b = $('dsUnhide');
  if (!b) return;
  b.textContent = n ? `แสดงป้ายที่ซ่อนไว้ทั้งหมด (${n})` : 'ไม่มีป้ายที่ซ่อนไว้';
  b.disabled = !n; b.style.opacity = n ? '' : '0.5';
}

const setPath = (obj, path, v) => { const ks = path.split('.'); let o = obj; for (const k of ks.slice(0, -1)) o = o[k]; o[ks[ks.length - 1]] = v; };
$('dsSheetBody').addEventListener('input', async e => {
  const path = e.target.dataset.path;
  if (!path) return;
  const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
  setPath(ds.settings, path, v);
  const val = $('dsSheetBody').querySelector(`[data-val="${path}"]`);
  if (val) val.textContent = `${v}×`;
  saveExportState();
  if (e.target.type === 'checkbox') {   // โชว์/ซ่อนตัวปรับของรายการนั้น
    const sub = e.target.closest('.rounded-2xl') && e.target.closest('.rounded-2xl').querySelector('.mt-2');
    if (sub) sub.classList.toggle('hidden', !v);
  }
  if (path.startsWith('layers.')) {
    if (ds.pm && ds.pm.getSource('tung')) {
      if (path.endsWith('fillColor') && (path.includes('water-other') || path.includes('visits'))) setPointIcons(ds.pm, ds.settings);
      applyPreviewStyle();
    }
    if (e.target.dataset.kind === 'color') { await loadExportAssets(ds.settings); renderSettingsIcon(path.split('.')[1]); }
  }
  scheduleRender();
});
function renderSettingsIcon(id) {
  const o = OVERLAYS.find(x => x.id === id), ls = ds.settings.layers[id];
  const el = [...$('dsSheetBody').querySelectorAll('[data-path]')].find(x => x.dataset.path === `layers.${id}.on`);
  const holder = el && el.closest('.rounded-2xl').querySelector('span.w-8');
  if (holder) holder.innerHTML = layerIcon({ icon: o.icon, swatch: ls.fillColor || ls.lineColor || o.swatch, outline: ls.lineColor || o.outline }, 22);
}
function openDsSheet() { $('dsSheet').classList.remove('closed'); $('dsBackdrop').classList.remove('hidden'); }
function closeDsSheet() { $('dsSheet').classList.add('closed'); $('dsBackdrop').classList.add('hidden'); }
$('dsSettings').onclick = () => $('dsSheet').classList.contains('closed') ? openDsSheet() : closeDsSheet();
$('dsBackdrop').onclick = closeDsSheet;
$('dsSheetClose').onclick = closeDsSheet;

/* ---------- รีเซ็ต ---------- */
$('dsReset').onclick = async () => {
  if (!await confirmModal('รีเซ็ตการจัดวางทั้งหมด?\nชั้นข้อมูล สี ขนาด และตำแหน่งที่ย้ายไว้จะกลับเป็นค่าเริ่มต้น', { ok: 'รีเซ็ต', danger: true })) return;
  const paper = ds.settings.paper;
  ds.settings = mergeSettings(null); ds.settings.paper = paper;
  ds.layout = { boxes: {}, labels: {} };
  saveExportState();
  await loadExportAssets(ds.settings);
  if (ds.pm && ds.pm.getSource('tung')) { setPointIcons(ds.pm, ds.settings); applyPreviewStyle(); }
  renderSettingsSheet(); selectLabel(null); renderPreview();
};

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

$('dsSave').onclick = async () => {
  if (!ds.pm || ds.busy) return;
  ds.busy = true;
  closeDsSheet(); selectLabel(null);
  const prog = showProgress(`กำลังสร้างภาพ ${ds.settings.paper}`);
  try {
    const file = await renderFinal({ settings: ds.settings, layout: ds.layout, center: ds.pm.getCenter(), zoom: ds.pm.getZoom(), pageW: ds.pageW, prog });
    prog.close();
    await shareOrDownload(file, `แผนที่ ${ds.settings.paper}`);
  } catch (err) {
    prog.close();
    if (!(err && err.message === 'cancelled')) {
      console.error('export', err);
      toast('สร้างภาพไม่สำเร็จ — ลองใช้ขนาด A3 หรือปิดบางชั้นข้อมูล');
    }
  } finally {
    ds.busy = false;
  }
};
