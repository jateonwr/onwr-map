'use strict';

/* ============================================================
 *  photos.js — จุดรูปถ่ายบนแผนที่ (รูปจากการบินสำรวจ · พิกัด/เวลา/ความสูงจาก EXIF ของรูป)
 *  แตะจุด → หน้าต่างดูรูป: เลื่อนดูรูปถัดไป/ก่อนหน้าได้ (เรียงตามเวลา) · แถบรูปย่อด้านล่าง
 *  รูปที่ถ่ายจากจุดเดียวกันรวมเป็นไอคอนเดียว พร้อมตัวเลขจำนวนรูป
 * ============================================================ */

const PHOTO_COLOR = '#0e7490';

/* ไอคอนกล้องเล็ก ๆ ในวงกลม (+ ตัวเลขเมื่อมีหลายรูปที่จุดเดียวกัน) */
function photoIcon(n = 1, size = 30) {
  const r = 2, c = document.createElement('canvas');
  const badge = n > 1;
  const W = size + (badge ? 8 : 0);
  c.width = W * r; c.height = size * r;
  const g = c.getContext('2d');
  g.scale(r, r);
  const cx = size / 2, cy = size / 2, R = size / 2 - 2;
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 3; g.shadowOffsetY = 1;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.shadowColor = 'transparent';
  g.beginPath(); g.arc(cx, cy, R - 2.2, 0, Math.PI * 2); g.fillStyle = PHOTO_COLOR; g.fill();
  // กล้อง
  const bw = R * 1.05, bh = R * 0.72, bx = cx - bw / 2, by = cy - bh / 2 + 1;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(bx, by, bw, bh, 2); g.fill();
  g.beginPath(); g.roundRect(cx - bw * 0.2, by - 2.6, bw * 0.4, 3.2, 1); g.fill();
  g.beginPath(); g.arc(cx, by + bh / 2, bh * 0.32, 0, Math.PI * 2); g.fillStyle = PHOTO_COLOR; g.fill();
  g.beginPath(); g.arc(cx, by + bh / 2, bh * 0.16, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  if (badge) {   // ตัวเลขจำนวนรูปมุมขวาบน
    const bx2 = size - 3, by2 = 7;
    g.beginPath(); g.arc(bx2, by2, 6.5, 0, Math.PI * 2); g.fillStyle = '#f59e0b'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = '#ffffff'; g.stroke();
    g.fillStyle = '#111827'; g.font = '700 9px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n > 9 ? '9+' : String(n), bx2, by2 + 0.5);
  }
  return { image: g.getImageData(0, 0, W * r, size * r), pixelRatio: r };
}
function addPhotoImages(m) {
  for (let n = 1; n <= 10; n++) {
    const id = `photo-${n}`;
    if (!m.hasImage(id)) { const ic = photoIcon(n); m.addImage(id, ic.image, { pixelRatio: ic.pixelRatio }); }
  }
}

/* รูปที่จุดเดียวกัน (ห่างไม่เกิน ~15 ม.) → แสดงไอคอนเดียว (top) พร้อมจำนวน */
function markPhotoStacks(data) {
  const fs = data.features, groups = [];
  for (const f of fs) {
    const [x, y] = f.geometry.coordinates;
    const g = groups.find(gr => Math.abs(gr.x - x) < 0.00015 && Math.abs(gr.y - y) < 0.00015);
    if (g) g.items.push(f); else groups.push({ x, y, items: [f] });
  }
  for (const g of groups) g.items.forEach((f, i) => {
    f.properties.top = i === 0;
    f.properties.icon = `photo-${Math.min(10, g.items.length)}`;
    f.properties.stack = g.items.length;
  });
}

/* ---------- หน้าต่างดูรูป ---------- */
const pv = { list: [], i: 0 };
const fmtPhotoTime = s => new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' น.';
const DIRS = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
function openPhotoViewer(f) {
  const data = overlayState.photos && overlayState.photos.data;
  if (!data) return;
  pv.list = [...data.features].sort((a, b) => a.properties.time.localeCompare(b.properties.time));
  pv.i = Math.max(0, pv.list.indexOf(f));
  $('pvStrip').innerHTML = pv.list.map((p, i) => `<button data-pv="${i}" aria-label="รูปที่ ${i + 1}" class="flex-none w-14 h-14 rounded-lg overflow-hidden ring-2 ring-transparent opacity-70">
      <img src="${p.properties.thumb}" alt="" loading="lazy" class="w-full h-full object-cover"></button>`).join('');
  $('photoViewer').classList.remove('hidden'); $('photoViewer').classList.add('flex');
  showPhoto(pv.i);
}
function showPhoto(i) {
  pv.i = (i + pv.list.length) % pv.list.length;
  const p = pv.list[pv.i].properties, [lng, lat] = pv.list[pv.i].geometry.coordinates;
  const img = $('pvImg');
  $('pvLoading').classList.remove('hidden');
  img.style.opacity = '0.25';
  img.onload = () => { $('pvLoading').classList.add('hidden'); img.style.opacity = '1'; };
  img.src = p.img;
  $('pvTitle').textContent = fmtPhotoTime(p.time);
  const parts = [`${pv.i + 1}/${pv.list.length}`];
  if (p.alt != null) parts.push(`สูง ${p.alt.toLocaleString('th-TH')} ม.`);
  if (p.dir != null) parts.push(`หันไปทาง${DIRS[Math.round(p.dir / 45) % 8]} (${p.dir}°)`);
  parts.push(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  $('pvMeta').textContent = parts.join(' · ');
  $('pvStrip').querySelectorAll('[data-pv]').forEach((b, k) => {
    const on = k === pv.i;
    b.classList.toggle('ring-white', on); b.classList.toggle('ring-transparent', !on);
    b.classList.toggle('opacity-70', !on);
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });
}
function closePhotoViewer() { $('photoViewer').classList.add('hidden'); $('photoViewer').classList.remove('flex'); $('pvImg').removeAttribute('src'); }
$('pvClose').onclick = closePhotoViewer;
$('pvPrev').onclick = () => showPhoto(pv.i - 1);
$('pvNext').onclick = () => showPhoto(pv.i + 1);
$('pvStrip').addEventListener('click', e => { const b = e.target.closest('[data-pv]'); if (b) showPhoto(+b.dataset.pv); });
$('pvMap').onclick = () => {   // ปิดหน้าต่างแล้วซูมไปที่จุดถ่ายรูป
  const [lng, lat] = pv.list[pv.i].geometry.coordinates;
  closePhotoViewer();
  setFollow('off');
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13), duration: 800 });
};
document.addEventListener('keydown', e => {
  if ($('photoViewer').classList.contains('hidden')) return;
  if (e.key === 'Escape') closePhotoViewer();
  else if (e.key === 'ArrowLeft') showPhoto(pv.i - 1);
  else if (e.key === 'ArrowRight') showPhoto(pv.i + 1);
});
{ // ปัดซ้าย/ขวาบนรูป = รูปถัดไป/ก่อนหน้า
  let x0 = null;
  $('pvStage').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  $('pvStage').addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) showPhoto(pv.i + (dx < 0 ? 1 : -1));
  });
}
