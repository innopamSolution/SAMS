// Vanilla DOM/canvas helpers for MapLibre popup content — these render into
// popup HTML strings and wire up interactive bits (gallery arrows, point
// cloud turntable canvases) after the popup is attached to the map.
import { loadPointCloud } from './pointCloudAsset';

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 255) + amt;
  let b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function statusChipHtml(status) {
  return status === 'published'
    ? `<span style="font-size:10px;font-weight:600;color:var(--ant-success);background:var(--ant-success-bg);border:1px solid var(--ant-success-border);padding:1px 7px;border-radius:20px;">Published</span>`
    : `<span style="font-size:10px;font-weight:600;color:var(--ant-warning);background:var(--ant-warning-bg);border:1px solid var(--ant-warning-border);padding:1px 7px;border-radius:20px;">Draft</span>`;
}

export function thumbHtml(it, catMap, gallery) {
  const c = catMap[it.cat];
  if (it.cat === 'document') return '';
  if (it.cat === 'pointcloud') {
    if (it.pointCloudUrl) {
      const H = 190;
      return `<div style="position:relative;height:${H}px;background:radial-gradient(circle at 50% 40%, #14202e, #060a10);"><canvas class="sams-tt sams-tt-real" data-url="${it.pointCloudUrl}" width="288" height="${H}" style="width:100%;height:${H}px;display:block;"></canvas><div style="position:absolute;left:9px;bottom:8px;display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.8);background:rgba(0,0,0,0.35);padding:3px 7px;border-radius:20px;"><span style="width:5px;height:5px;border-radius:50%;background:${c.color};box-shadow:0 0 6px ${c.color};"></span>실측 데이터 미리보기 · ${it.extra}</div></div>`;
    }
    return `<div style="position:relative;height:138px;background:radial-gradient(circle at 50% 40%, #14202e, #060a10);"><canvas class="sams-tt" data-color="${c.color}" width="248" height="138" style="width:100%;height:138px;display:block;"></canvas><div style="position:absolute;left:9px;bottom:8px;display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.8);background:rgba(0,0,0,0.35);padding:3px 7px;border-radius:20px;"><span style="width:5px;height:5px;border-radius:50%;background:${c.color};box-shadow:0 0 6px ${c.color};"></span>회전 미리보기 · ${it.extra}</div></div>`;
  }
  if (it.cat === 'image' && gallery) {
    return `<div style="position:relative;height:138px;overflow:hidden;background:#1a2230;"><div class="sams-gframe" style="position:absolute;inset:0;"></div><div style="position:absolute;left:10px;top:9px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.95);">이미지</div><button data-act="img-prev" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,0.45);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">‹</button><button data-act="img-next" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,0.45);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">›</button><span class="sams-gbadge" style="position:absolute;right:10px;bottom:9px;font-size:10px;color:#fff;background:rgba(0,0,0,0.5);padding:3px 8px;border-radius:20px;"></span></div>`;
  }
  const dark = shade(c.color, -30);
  return `<div style="position:relative;height:138px;background:linear-gradient(135deg, ${c.color}, ${dark});overflow:hidden;"><div style="position:absolute;inset:0;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.08) 0 1px,transparent 1px 26px),repeating-linear-gradient(0deg,rgba(255,255,255,0.08) 0 1px,transparent 1px 26px);"></div><div style="position:absolute;inset:0;background:radial-gradient(circle at 70% 20%, rgba(255,255,255,0.25), transparent 60%);"></div><div style="position:absolute;left:10px;top:9px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.95);letter-spacing:0.3px;">${c.label}</div>${it.extra ? `<div style="position:absolute;left:10px;bottom:9px;font-size:10px;color:rgba(255,255,255,0.9);background:rgba(0,0,0,0.28);padding:3px 7px;border-radius:20px;">${it.extra}</div>` : ''}</div>`;
}

export function wireGallery(root, it) {
  const frame = root.querySelector('.sams-gframe');
  if (!frame) return;
  const badge = root.querySelector('.sams-gbadge');
  const total = parseInt(it.extra, 10) || 24;
  const N = Math.min(total, 6);
  let idx = 0;
  const render = () => {
    const h1 = (205 + idx * 40) % 360;
    const h2 = (h1 + 26) % 360;
    frame.style.backgroundImage = `linear-gradient(135deg, hsl(${h1} 42% 44%), hsl(${h2} 40% 26%)), repeating-linear-gradient(90deg,rgba(255,255,255,0.06) 0 1px,transparent 1px 24px)`;
    if (badge) badge.textContent = idx + 1 + ' / ' + total;
  };
  const prev = root.querySelector('[data-act="img-prev"]');
  const next = root.querySelector('[data-act="img-next"]');
  if (prev) prev.onclick = (e) => { e.stopPropagation(); idx = (idx - 1 + N) % N; render(); };
  if (next) next.onclick = (e) => { e.stopPropagation(); idx = (idx + 1) % N; render(); };
  render();
}

export function runTurntableEl(canvas, opts) {
  const ctx = canvas.getContext('2d');
  const cw = canvas.width;
  const ch = canvas.height;
  const color = opts.color || '#f5222d';
  const H = opts.H || 1.55;
  const count = opts.count || 560;
  const baseCount = opts.baseCount != null ? opts.baseCount : Math.round(count * 0.25);
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = Math.pow(Math.random(), 0.7);
    const y = t * H - H / 2;
    const taper = 1 - 0.58 * t;
    const r = 0.5 * taper * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    pts.push([r * Math.cos(a), y, r * Math.sin(a)]);
  }
  for (let i = 0; i < baseCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.72 * Math.sqrt(Math.random());
    pts.push([r * Math.cos(a), -H / 2 - 0.03, r * Math.sin(a)]);
  }
  const gen = (canvas._gen || 0) + 1;
  canvas._gen = gen;
  canvas._stop = false;
  let ang = 0.4;
  const frame = () => {
    if (canvas._stop || canvas._gen !== gen) return;
    ang += 0.011;
    ctx.clearRect(0, 0, cw, ch);
    const cx = cw / 2;
    const cy = ch / 2 + 6;
    const scale = ch * 0.44;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const proj = pts.map((p) => {
      const x = p[0] * ca - p[2] * sa;
      const z = p[0] * sa + p[2] * ca;
      const persp = 1 / (1.85 - z * 0.34);
      return [x, p[1], z, persp];
    });
    proj.sort((a, b) => a[2] - b[2]);
    for (const q of proj) {
      const px = cx + q[0] * scale * q[3];
      const py = cy - q[1] * scale * q[3];
      const depth = (q[2] + 0.75) / 1.5;
      ctx.globalAlpha = Math.max(0.14, Math.min(1, 0.3 + 0.65 * depth));
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 1.0 + 1.5 * q[3], 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  };
  frame();
}

export function runTurntable(canvas, color) {
  runTurntableEl(canvas, { color, count: 560, H: 1.55 });
}

// Same rotating-preview rendering as runTurntableEl, but driven by real
// scanned points (local meter offsets + real RGB) instead of a procedural
// shape. Subsamples further for a canvas this small — sorting a few
// thousand points every animation frame is plenty dense and stays smooth.
export function runTurntableReal(canvas, positions, colors, bounds) {
  const ctx = canvas.getContext('2d');
  const cw = canvas.width;
  const ch = canvas.height;
  const count = positions.length / 3;
  const hExtent = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minZ), Math.abs(bounds.maxZ)) || 1;
  const targetR = 0.62;
  const scale = targetR / hExtent;
  const heightMid = ((bounds.maxY - bounds.minY) / 2) * scale;

  const MAX_PREVIEW_POINTS = 2600;
  const step = Math.max(1, Math.floor(count / MAX_PREVIEW_POINTS));
  const pts = [];
  for (let i = 0; i < count; i += step) {
    pts.push([
      positions[i * 3] * scale,
      positions[i * 3 + 1] * scale - heightMid,
      positions[i * 3 + 2] * scale,
      colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2],
    ]);
  }

  const gen = (canvas._gen || 0) + 1;
  canvas._gen = gen;
  canvas._stop = false;
  let ang = 0.4;
  const frame = () => {
    if (canvas._stop || canvas._gen !== gen) return;
    ang += 0.011;
    ctx.clearRect(0, 0, cw, ch);
    const cx = cw / 2;
    const cy = ch / 2 + 6;
    const scaleCv = ch * 0.44;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const proj = pts.map((p) => {
      const x = p[0] * ca - p[2] * sa;
      const z = p[0] * sa + p[2] * ca;
      const persp = 1 / (1.85 - z * 0.34);
      return [x, p[1], z, persp, p[3], p[4], p[5]];
    });
    proj.sort((a, b) => a[2] - b[2]);
    for (const q of proj) {
      const px = cx + q[0] * scaleCv * q[3];
      const py = cy - q[1] * scaleCv * q[3];
      const depth = (q[2] + 0.75) / 1.5;
      ctx.globalAlpha = Math.max(0.25, Math.min(1, 0.35 + 0.65 * depth));
      ctx.fillStyle = `rgb(${q[4]},${q[5]},${q[6]})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.0 + 1.3 * q[3], 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  };
  frame();
}

export function startTurntables(popup) {
  const root = popup.getElement();
  if (!root) return;
  root.querySelectorAll('canvas.sams-tt').forEach((cv) => {
    if (cv.classList.contains('sams-tt-real')) {
      loadPointCloud(cv.dataset.url).then(({ positions, colors, bounds }) => {
        if (cv._stop) return;
        runTurntableReal(cv, positions, colors, bounds);
      });
    } else {
      runTurntable(cv, cv.dataset.color);
    }
  });
  popup.on('close', () => root.querySelectorAll('canvas.sams-tt').forEach((cv) => { cv._stop = true; }));
}

let threePromise = null;
export function ensureThree() {
  if (window.THREE) return Promise.resolve(true);
  if (threePromise) return threePromise;
  threePromise = new Promise((res) => {
    let s = document.querySelector('script[data-sams-three]');
    if (s) {
      s.addEventListener('load', () => res(!!window.THREE));
      s.addEventListener('error', () => res(false));
      return;
    }
    s = document.createElement('script');
    s.src = 'https://unpkg.com/three@0.128.0/build/three.min.js';
    s.setAttribute('data-sams-three', '1');
    s.onload = () => res(!!window.THREE);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  return threePromise;
}

export function buildTowerPositions(H, baseR, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const t = Math.pow(Math.random(), 0.7);
    const y = t * H;
    const taper = 1 - 0.6 * t;
    const r = baseR * taper * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    arr.push(r * Math.cos(a), y, r * Math.sin(a));
  }
  const nb = Math.floor(n * 0.28);
  for (let i = 0; i < nb; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = baseR * 1.4 * Math.sqrt(Math.random());
    arr.push(r * Math.cos(a), Math.random() * 0.5, r * Math.sin(a));
  }
  return arr;
}

export const DL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 11l5 5 5-5M5 21h14"/></svg>`;
export const CUBE_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/></svg>`;
