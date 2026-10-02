'use strict';

/* ============================================================
 *  ค่าจาก Google Sheet → แสดงบนทุ่งรับน้ำ
 *
 *  วิธีตั้งค่า Sheet
 *   1. แถวแรกเป็นหัวคอลัมน์
 *      คอลัมน์ A = ชื่อทุ่ง (สะกดให้ตรงกับในแผนที่)
 *      คอลัมน์ B, C, … = ค่าที่จะแสดง (หัวคอลัมน์ใช้เป็นชื่อค่า เช่น "ระดับน้ำ (ม.)")
 *   2. Share → General access → "Anyone with the link" → Viewer
 *   3. คัดลอกลิงก์ของ Sheet มาวางใน SHEET.url ด้านล่าง
 * ============================================================ */

const SHEET = {
  url: '',             // เช่น 'https://docs.google.com/spreadsheets/d/xxxxxxxx/edit#gid=0'
  layer: 'tung',       // ชั้นข้อมูลที่จะจับคู่ (ใช้คอลัมน์ชื่อทุ่ง)
  mapValues: 2,        // จำนวนค่าที่แสดงบนแผนที่ใต้ชื่อทุ่ง
  refreshMinutes: 5,   // ดึงค่าใหม่ทุกกี่นาที (ระหว่างเปิดแอป)
};

const sheetState = store.get('sheet', null) || { headers: [], rows: [], fetchedAt: 0 };
sheetState.error = null;
let sheetLoading = false;

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

const normName = s => String(s || '').replace(/\s+/g, '').normalize('NFC');

async function loadSheet() {
  const url = sheetCsvUrl(SHEET.url);
  if (!url || sheetLoading) return;
  sheetLoading = true;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error('ได้หน้าเว็บแทน CSV');
    const rows = parseCSV(text.replace(/^﻿/, '')).map(r => r.map(c => c.trim()));
    const headers = rows.shift() || [];
    sheetState.headers = headers;
    sheetState.rows = rows.filter(r => r[0]);
    sheetState.fetchedAt = Date.now();
    sheetState.error = null;
    store.set('sheet', { headers: sheetState.headers, rows: sheetState.rows, fetchedAt: sheetState.fetchedAt });
  } catch (err) {
    console.error('Google Sheet:', err);
    sheetState.error = 'ดึงข้อมูลไม่สำเร็จ — ตรวจว่าแชร์ Sheet แบบ "ทุกคนที่มีลิงก์" แล้ว';
  } finally {
    sheetLoading = false;
  }
  applySheet();
}

/* หาแถวของ feature จากชื่อ */
function sheetRowFor(name) {
  const n = normName(name);
  return sheetState.rows.find(r => normName(r[0]) === n) || null;
}

/* คอลัมน์ค่า (ข้ามคอลัมน์ชื่อ และคอลัมน์ที่ไม่มีหัว) */
function sheetValues(row) {
  return sheetState.headers.map((h, i) => [h, row[i]]).slice(1).filter(([h, v]) => h && v !== undefined && v !== '');
}

function applySheet() {
  const o = OVERLAYS.find(x => x.id === SHEET.layer);
  const st = o && overlayState[o.id];
  if (!st || !st.data) return;

  for (const [name, el] of Object.entries(st.labelEls)) {
    const row = sheetRowFor(name);
    const vals = row ? sheetValues(row).slice(0, SHEET.mapValues) : [];
    el.querySelector('.v').innerHTML = vals
      .map(([h, v]) => `<span class="k">${escapeHtml(h)}</span> ${escapeHtml(v)}`)
      .join('<span class="sep"> · </span>');
  }
  renderLayerPanel();

  // ถ้าแผงข้อมูลเปิดอยู่ที่ทุ่ง ให้รีเฟรชค่าด้วย
  if (selectedInfo && selectedInfo.o === o) showInfo(o, selectedInfo.f);
}

function timeText(ms) {
  return new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' น.';
}

layerNotes[SHEET.layer] = () => {
  if (!SHEET.url) return '';
  const st = overlayState[SHEET.layer];
  const names = new Set(st.data.features.map(f => normName(f.properties[OVERLAYS.find(x => x.id === SHEET.layer).titleField])));
  const unmatched = sheetState.rows.map(r => r[0]).filter(n => !names.has(normName(n)));
  const parts = [];
  if (sheetState.fetchedAt) parts.push(`Google Sheet: ${timeText(sheetState.fetchedAt)}`);
  if (sheetState.error) parts.push(`<span class="text-red-600">${sheetState.error}</span>`);
  if (unmatched.length) parts.push(`<span class="text-amber-700">ไม่พบชื่อในแผนที่: ${unmatched.map(escapeHtml).join(', ')}</span>`);
  return parts.length ? `<div class="text-xs text-gray-500 mt-0.5">${parts.join('<br>')}</div>` : '';
};

infoExtras.push((o, f) => {
  if (o.id !== SHEET.layer) return '';
  const row = sheetRowFor(f.properties[o.titleField]);
  if (!row) return '';
  const vals = sheetValues(row);
  if (!vals.length) return '';
  return vals.map(([h, v]) =>
    `<div class="flex gap-4 py-2.5"><dt class="w-32 flex-none text-gray-500">${escapeHtml(h)}</dt><dd class="flex-1 min-w-0 break-words font-semibold">${escapeHtml(v)}</dd></div>`
  ).join('') + `<div class="py-2.5 text-xs text-gray-400">จาก Google Sheet · ${timeText(sheetState.fetchedAt)}${sheetState.error ? ' (ค่าล่าสุดที่ดึงได้)' : ''}</div>`;
});

onMapReady.push(applySheet);

/* ดึงตอนเปิดแอป + ทุก ๆ refreshMinutes + ตอนกลับมาที่แอป */
loadSheet();
setInterval(() => { if (document.visibilityState === 'visible') loadSheet(); }, SHEET.refreshMinutes * 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - sheetState.fetchedAt > SHEET.refreshMinutes * 60000) loadSheet();
});
