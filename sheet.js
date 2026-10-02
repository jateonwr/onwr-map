'use strict';

/* ============================================================
 *  ค่าจาก Google Sheet → ใช้แทนค่าเดิมของชั้นข้อมูล (ปรับเองได้)
 *
 *  วิธีตั้งค่า Sheet (ดูตัวอย่างใน sheet-template.csv / sheet-template-dam.csv)
 *   1. แถวแรกเป็นหัวคอลัมน์ · คอลัมน์ A = ชื่อ (สะกดให้ตรงกับในแผนที่)
 *      คอลัมน์ถัดไปจับจาก "คำในหัวคอลัมน์" ตาม fields ด้านล่าง
 *      คอลัมน์วันที่ (ไม่ใส่ก็ได้) และคอลัมน์อื่น ๆ (แสดงเป็นป้ายใต้ชื่อ + ในแผงข้อมูล)
 *      ช่องที่ว่างจะใช้ค่าเดิม · คอลัมน์ตัวเลขห้ามใส่ข้อความปน (เช่น "-")
 *   2. Share → General access → "Anyone with the link" → Viewer
 *   3. คัดลอกลิงก์ของ Sheet มาวางใน url ด้านล่าง
 * ============================================================ */

const SHEETS = [
  {
    key: 'sheet',            // ชื่อที่ใช้เก็บค่าล่าสุดในเครื่อง
    layer: 'tung',
    url: 'https://docs.google.com/spreadsheets/d/1Z-avaBjksZ6km8dr90KO6eZ54nIBEik2FH9uavvA4O0/edit?usp=sharing',
    fields: {                // ค่าในชั้นข้อมูล : คำที่ต้องมีในหัวคอลัมน์ (จับตามลำดับ)
      Cap_Pot:    ['ศักยภาพ', 'Cap_Pot'],      // ต้องอยู่ก่อน "ความจุ" (หัวคอลัมน์มีคำว่าความจุเหมือนกัน)
      Cap_MCM:    ['ความจุ', 'Cap_MCM'],
      Status_Now: ['ปริมาณน้ำ', 'Status_Now'],
    },
  },
  {
    key: 'sheet:dam',
    layer: 'water-l',        // แหล่งน้ำขนาดใหญ่ (เขื่อน)
    url: 'https://docs.google.com/spreadsheets/d/1p1wrzr5_O-1nkvG55OHNbdcSd05UixAIaEJTTPzUJ_w/edit?usp=sharing',
    fields: {
      dam_percent_storage: ['%', 'เปอร์เซ็นต์', 'dam_percent_storage'],   // ต้องอยู่ก่อน "ปริมาณน้ำ"
      dam_storage:         ['ความจุ', 'dam_storage'],
      dam_volume:          ['ปริมาณน้ำ', 'dam_volume'],
    },
    // แถวพิเศษ: ค่าในคอลัมน์ของ Sheet นี้ ไปแสดงที่จุดในชั้นข้อมูลอื่น
    // เขื่อนเจ้าพระยา → คอลัมน์ "ความจุ" = ค่าระบายน้ำ (ลบ.ม./วินาที)
    extras: [
      { layer: 'water-other', name: 'เขื่อนเจ้าพระยา', from: 'dam_storage', to: 'discharge' },
    ],
    // ถ้าปรับความจุ/ปริมาณน้ำ แต่ไม่ได้ใส่ % → คำนวณ % ใหม่
    derive(p, changed) {
      if ((changed.dam_storage || changed.dam_volume) && !changed.dam_percent_storage && p.dam_storage > 0 && p.dam_volume != null) {
        p.dam_percent_storage = Math.round(p.dam_volume / p.dam_storage * 10000) / 100;
      }
    },
  },
];
const SHEET_COMMON = {
  mapValues: 2,        // จำนวนค่า "อื่น ๆ" ที่แสดงเป็นป้ายใต้ชื่อ
  refreshMinutes: 5,   // ดึงค่าใหม่ทุกกี่นาที (ระหว่างเปิดแอป)
  dateHeaders: ['วันที่', 'อัปเดต', 'อัพเดท', 'date'],
};

/* แปลงลิงก์ Sheet → ลิงก์ CSV */
function sheetCsvUrl(url) {
  if (!url) return null;
  if (/^data:|\.csv($|\?)|output=csv/.test(url)) return url;   // ลิงก์ CSV อยู่แล้ว (เช่น Publish to web)
  const id = (url.match(/\/spreadsheets\/d\/([\w-]+)/) || [])[1];
  if (!id) return null;
  const gid = (url.match(/[#&?]gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1${gid ? `&gid=${gid}` : ''}`;
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const toNumber = v => {
  const n = parseFloat(String(v ?? '').replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function timeText(ms) {
  return new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' น.';
}

/* ---------- แต่ละ Sheet ---------- */
for (const cfg of SHEETS) {
  const S = Object.assign(store.get(cfg.key, null) || { headers: [], rows: [], fetchedAt: 0 }, { error: null });
  let loading = false;
  const layer = () => OVERLAYS.find(x => x.id === cfg.layer);

  const rowFor = name => {
    const n = normName(name);
    return S.rows.find(r => normName(r[0]) === n) || null;
  };

  /* หัวคอลัมน์ไหนใช้ทำอะไร → { field: index }, dateIdx, otherIdx[] */
  const columns = () => {
    const hs = S.headers.map(h => String(h || '').toLowerCase());
    const used = new Set([0]);
    const fieldIdx = {};
    for (const [field, keys] of Object.entries(cfg.fields)) {
      const i = hs.findIndex((h, i) => !used.has(i) && keys.some(k => h.includes(k.toLowerCase())));
      if (i > 0) { fieldIdx[field] = i; used.add(i); }
    }
    const dateIdx = hs.findIndex((h, i) => !used.has(i) && SHEET_COMMON.dateHeaders.some(k => h.includes(k.toLowerCase())));
    if (dateIdx > 0) used.add(dateIdx);
    const otherIdx = hs.map((h, i) => i).filter(i => !used.has(i) && S.headers[i]);
    return { fieldIdx, dateIdx, otherIdx };
  };

  const otherValues = row => columns().otherIdx.map(i => [S.headers[i], row[i]]).filter(([, v]) => v !== undefined && v !== '');

  function apply() {
    const o = layer();
    const st = o && overlayState[o.id];
    if (!st || !st.data) return;
    const { fieldIdx } = columns();

    // ใช้ค่าจาก Sheet แทนค่าเดิม (ช่องว่าง/ไม่ใช่ตัวเลข → ใช้ค่าเดิม)
    for (const f of st.data.features) {
      f.baseProps = f.baseProps || { ...f.properties };
      const row = rowFor(f.properties[o.titleField]);
      const changed = {};
      for (const field of Object.keys(cfg.fields)) {
        const n = row && fieldIdx[field] != null ? toNumber(row[fieldIdx[field]]) : null;
        changed[field] = n != null;
        f.properties[field] = n ?? f.baseProps[field];
      }
      if (cfg.derive) cfg.derive(f.properties, changed);
    }

    for (const [name, el] of Object.entries(st.labelEls)) {
      const f = st.data.features.find(x => x.properties[o.titleField] === name);
      if (f && o.labelExtra) el.querySelector('.c').textContent = o.labelExtra(f.properties);
      const row = rowFor(name);
      el.querySelector('.v').innerHTML = (row ? otherValues(row).slice(0, SHEET_COMMON.mapValues) : [])
        .map(([h, v]) => `<span class="k">${escapeHtml(h)}</span> ${escapeHtml(v)}`)
        .join('<span class="sep"> · </span>');
    }
    // แถวพิเศษ (เช่น ค่าระบายน้ำเขื่อนเจ้าพระยา)
    for (const x of cfg.extras || []) {
      const xo = OVERLAYS.find(l => l.id === x.layer), xst = overlayState[x.layer];
      if (!xo || !xst || !xst.data) continue;
      const f = xst.data.features.find(f => normName(f.properties[xo.titleField]) === normName(x.name));
      if (!f) continue;
      const row = rowFor(x.name);
      f.properties[x.to] = row && fieldIdx[x.from] != null ? toNumber(row[fieldIdx[x.from]]) : null;
      const el = xst.labelEls[f.properties[xo.titleField]];
      if (el && xo.labelExtra) el.querySelector('.c').textContent = xo.labelExtra(f.properties);
      if (selectedInfo && selectedInfo.o === xo && selectedInfo.f === f) showInfo(xo, f);
    }

    renderLayerPanel();
    if (selectedInfo && selectedInfo.o === o) showInfo(o, selectedInfo.f);
  }

  async function load() {
    const url = sheetCsvUrl(cfg.url);
    if (!url || loading) return;
    loading = true;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (/^\s*</.test(text)) throw new Error('ได้หน้าเว็บแทน CSV');
      const rows = parseCSV(text.replace(/^﻿/, '')).map(r => r.map(c => c.trim()));
      let headers = rows.shift() || [];
      let n = headers.length;
      while (n > 0 && !headers[n - 1]) n--;            // ตัดคอลัมน์ว่างท้ายตาราง
      S.headers = headers.slice(0, n);
      S.rows = rows.filter(r => r[0]).map(r => r.slice(0, n));
      S.fetchedAt = Date.now();
      S.error = null;
      store.set(cfg.key, { headers: S.headers, rows: S.rows, fetchedAt: S.fetchedAt });
    } catch (err) {
      console.error('Google Sheet:', cfg.layer, err);
      S.error = 'ดึงข้อมูลไม่สำเร็จ — ตรวจว่าแชร์ Sheet แบบ "ทุกคนที่มีลิงก์" แล้ว';
    } finally {
      loading = false;
    }
    apply();
  }

  // ข้อความใต้ชื่อชั้นข้อมูลในแผง (ต่อท้ายข้อความเดิมถ้ามี)
  const prevNote = layerNotes[cfg.layer];
  layerNotes[cfg.layer] = () => {
    const before = prevNote ? prevNote() : '';
    if (!cfg.url) return before;
    const o = layer(), st = overlayState[cfg.layer];
    const names = new Set(st.data.features.map(f => normName(f.properties[o.titleField])));
    (cfg.extras || []).forEach(x => names.add(normName(x.name)));
    const unmatched = S.rows.map(r => r[0]).filter(n => !names.has(normName(n)));
    const parts = [];
    if (S.fetchedAt) parts.push(`Google Sheet: ${timeText(S.fetchedAt)}`);
    if (S.error) parts.push(`<span class="text-red-600">${S.error}</span>`);
    if (unmatched.length) parts.push(`<span class="text-amber-700">ไม่พบชื่อในแผนที่: ${unmatched.map(escapeHtml).join(', ')}</span>`);
    return before + (parts.length ? `<div class="text-xs text-gray-500 mt-0.5">${parts.join('<br>')}</div>` : '');
  };

  infoExtras.push((o, f) => {
    if (o.id !== cfg.layer) return '';
    const row = rowFor(f.properties[o.titleField]);
    if (!row) return '';
    const { dateIdx } = columns();
    const date = dateIdx > 0 && row[dateIdx] ? `ข้อมูลวันที่ ${escapeHtml(row[dateIdx])} · ` : '';
    return otherValues(row).map(([h, v]) =>
      `<div class="flex gap-4 py-2.5"><dt class="w-32 flex-none text-gray-500">${escapeHtml(h)}</dt><dd class="flex-1 min-w-0 break-words font-semibold">${escapeHtml(v)}</dd></div>`
    ).join('') + `<div class="py-2.5 text-xs text-gray-400">${date}ปรับค่าจาก Google Sheet ${timeText(S.fetchedAt)}${S.error ? ' (ค่าล่าสุดที่ดึงได้)' : ''}</div>`;
  });

  onMapReady.push(apply);

  /* ดึงตอนเปิดแอป + ทุก ๆ refreshMinutes + ตอนกลับมาที่แอป */
  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, SHEET_COMMON.refreshMinutes * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - S.fetchedAt > SHEET_COMMON.refreshMinutes * 60000) load();
  });
}


/* ============================================================
 *  จุดลงพื้นที่ — ทั้งชั้นข้อมูลมาจาก Google Sheet
 *  คอลัมน์: ชื่อ | lat | lon | (คอลัมน์อื่น ๆ แสดงในแผงข้อมูล)
 * ============================================================ */

const VISIT_SHEET = {
  layer: 'visits',
  url: 'https://docs.google.com/spreadsheets/d/1IsSuRMH1-xvyKkdiI-nDYWerCpmSU_5fjJMgRtVBfqc/edit?usp=sharing',
  latHeaders: ['lat', 'ละติจูด', 'latitude'],
  lonHeaders: ['lon', 'lng', 'long', 'ลองจิจูด', 'longitude'],
};
const visitState = { fetchedAt: 0, error: null, skipped: [] };

async function loadVisitPoints() {
  const url = sheetCsvUrl(VISIT_SHEET.url);
  let headers, rows;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error('ได้หน้าเว็บแทน CSV');
    rows = parseCSV(text.replace(/^\uFEFF/, '')).map(r => r.map(c => c.trim()));
    headers = rows.shift() || [];
    visitState.error = null;
    visitState.fetchedAt = Date.now();
    store.set('sheet:visits', { headers, rows, fetchedAt: visitState.fetchedAt });
  } catch (err) {
    console.error('Google Sheet: visits', err);
    visitState.error = 'ดึงข้อมูลไม่สำเร็จ — ตรวจว่าแชร์ Sheet แบบ "ทุกคนที่มีลิงก์" แล้ว';
    const cached = store.get('sheet:visits', null);
    headers = cached ? cached.headers : [];
    rows = cached ? cached.rows : [];
    if (cached) visitState.fetchedAt = cached.fetchedAt;
  }

  const hs = headers.map(h => h.toLowerCase());
  const latI = hs.findIndex(h => VISIT_SHEET.latHeaders.includes(h));
  const lonI = hs.findIndex(h => VISIT_SHEET.lonHeaders.includes(h));
  visitState.skipped = [];
  const features = [];
  for (const r of rows) {
    if (!r.some(Boolean)) continue;
    let lat = toNumber(r[latI]), lon = toNumber(r[lonI]);
    if (lat != null && lon != null && Math.abs(lat) > 90) [lat, lon] = [lon, lat];   // กรอกสลับคอลัมน์
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) { visitState.skipped.push(r[0] || '(ไม่มีชื่อ)'); continue; }
    const props = { name: r[0] || '(ไม่มีชื่อ)', lat, lng: lon, label_lat: lat, label_lng: lon };
    headers.forEach((h, i) => {
      if (i === 0 || i === latI || i === lonI || !h || !r[i]) return;
      props[h] = r[i];
      FIELD_LABELS[h] = FIELD_LABELS[h] || h;   // แสดงคอลัมน์อื่น ๆ ในแผงข้อมูล
    });
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } });
  }
  return { type: 'FeatureCollection', features };
}

/* โหลดใหม่ระหว่างใช้งาน → อัปเดตจุด + ป้ายชื่อ */
async function refreshVisitPoints() {
  const o = OVERLAYS.find(x => x.id === VISIT_SHEET.layer), st = overlayState[o.id];
  if (!map.getSource(o.id)) return;
  const data = await loadVisitPoints();
  data.features.forEach((f, i) => { f.id = i; });
  st.data = data;
  st.bounds = data.features.length ? geomBounds(data) : null;
  map.getSource(o.id).setData(data);
  st.labels.forEach(m => m.remove());
  createLabels(o);
  updateLabels();
  renderLayerPanel();
}

layerNotes[VISIT_SHEET.layer] = () => {
  const parts = [];
  if (visitState.fetchedAt) parts.push(`Google Sheet: ${timeText(visitState.fetchedAt)}`);
  if (visitState.error) parts.push(`<span class="text-red-600">${visitState.error}</span>`);
  if (visitState.skipped.length) parts.push(`<span class="text-amber-700">พิกัดไม่ถูกต้อง (ข้าม): ${visitState.skipped.map(escapeHtml).join(', ')}</span>`);
  return parts.length ? `<div class="text-xs text-gray-500 mt-0.5">${parts.join('<br>')}</div>` : '';
};

setInterval(() => { if (document.visibilityState === 'visible') refreshVisitPoints(); }, SHEET_COMMON.refreshMinutes * 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - visitState.fetchedAt > SHEET_COMMON.refreshMinutes * 60000) refreshVisitPoints();
});
