// Screen <-> model-frame helpers for the 3D viewer (see three3d.js, map.__sams3d).
//
// The rendered model lives in a local frame: x east, z south, y up (meters, y = height
// above the model base). Annotations store lng/lat + altitude in that same frame, so a
// click on a roof gives the exact lng/lat/altitude of the surface the user sees — no
// terrain guesswork and no TOP view needed.
import maplibregl from 'maplibre-gl';

const model = (map) => (map && map.getLayer && map.getLayer('sams-3d') && map.__sams3d && map.__sams3d.matrix ? map.__sams3d : null);
export const hasModel = (map) => !!model(map);

// ── tiny 4x4 helpers (column-major, like gl-matrix) ─────────────────────
function mulPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}
function invert(a) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = a;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}

const toLocal = (md, X, Y, Z) => {
  const t = md.transform;
  return [(X - t.x) / t.scale, (Z - t.z) / t.scale, (Y - t.y) / t.scale]; // [east m, up m, south m]
};
const fromLocal = (md, x, y, z) => {
  const t = md.transform;
  return [t.x + t.scale * x, t.y + t.scale * z, t.z + t.scale * y];
};

// 모델 프레임의 (lng, lat, 고도 m) → 메르카토르 좌표. 고도는 모델 기준면(transform.z) 위로 잰다.
const mercAt = (md, lng, lat, alt) => {
  const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
  return { x: mc.x, y: mc.y, z: md.transform.z + alt * md.transform.scale };
};

// lng/lat/altitude(m, model frame) -> CSS px inside the map canvas, or null if behind the camera.
export function project(map, lng, lat, alt) {
  const md = model(map);
  if (!md) return null;
  const mc = mercAt(md, lng, lat, alt);
  const c = mulPoint(md.matrix, mc.x, mc.y, mc.z);
  if (c[3] <= 1e-6) return null;
  const cv = map.getCanvas();
  return { x: ((c[0] / c[3] + 1) / 2) * cv.clientWidth, y: ((1 - c[1] / c[3]) / 2) * cv.clientHeight };
}

// Camera ray through a canvas pixel, in the model's local frame ({ o, d } with d normalized).
function screenRay(map, md, px, py) {
  const cv = map.getCanvas();
  const nx = (px / cv.clientWidth) * 2 - 1;
  const ny = 1 - (py / cv.clientHeight) * 2;
  if (md.invFor !== md.matrix) { md.inv = invert(md.matrix); md.invFor = md.matrix; }
  if (!md.inv) return null;
  const un = (z) => { const v = mulPoint(md.inv, nx, ny, z); return [v[0] / v[3], v[1] / v[3], v[2] / v[3]]; };
  const a = un(-1); const b = un(1);
  const o = toLocal(md, a[0], a[1], a[2]);
  const e = toLocal(md, b[0], b[1], b[2]);
  const d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return { o, d: [d[0] / len, d[1] / len, d[2] / len] };
}

// ── mesh: uniform XZ grid so a ray only tests the triangles in the cells it crosses ──
const grids = new WeakMap();
function buildGrid(positions, indices) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cell = Math.max(maxX - minX, maxZ - minZ, 1) / 64;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell)); const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const triCount = indices.length / 3;
  const counts = new Uint32Array(nx * nz + 1);
  const range = (t) => {
    const i0 = indices[t * 3] * 3, i1 = indices[t * 3 + 1] * 3, i2 = indices[t * 3 + 2] * 3;
    const x0 = Math.min(positions[i0], positions[i1], positions[i2]), x1 = Math.max(positions[i0], positions[i1], positions[i2]);
    const z0 = Math.min(positions[i0 + 2], positions[i1 + 2], positions[i2 + 2]), z1 = Math.max(positions[i0 + 2], positions[i1 + 2], positions[i2 + 2]);
    return [
      Math.max(0, Math.min(nx - 1, Math.floor((x0 - minX) / cell))), Math.max(0, Math.min(nx - 1, Math.floor((x1 - minX) / cell))),
      Math.max(0, Math.min(nz - 1, Math.floor((z0 - minZ) / cell))), Math.max(0, Math.min(nz - 1, Math.floor((z1 - minZ) / cell))),
    ];
  };
  for (let t = 0; t < triCount; t++) {
    const [cx0, cx1, cz0, cz1] = range(t);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) counts[cz * nx + cx + 1]++;
  }
  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
  const fill = counts.slice(0, nx * nz);
  const tris = new Int32Array(counts[nx * nz]);
  for (let t = 0; t < triCount; t++) {
    const [cx0, cx1, cz0, cz1] = range(t);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) tris[fill[cz * nx + cx]++] = t;
  }
  return { minX, minZ, cell, nx, nz, start: counts, tris };
}

function rayTri(positions, indices, t, o, d) {
  const i0 = indices[t * 3] * 3, i1 = indices[t * 3 + 1] * 3, i2 = indices[t * 3 + 2] * 3;
  const e1x = positions[i1] - positions[i0], e1y = positions[i1 + 1] - positions[i0 + 1], e1z = positions[i1 + 2] - positions[i0 + 2];
  const e2x = positions[i2] - positions[i0], e2y = positions[i2 + 1] - positions[i0 + 1], e2z = positions[i2 + 2] - positions[i0 + 2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const tx = o[0] - positions[i0], ty = o[1] - positions[i0 + 1], tz = o[2] - positions[i0 + 2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return Infinity;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t0 = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t0 > 1e-4 ? t0 : Infinity;
}

// Nearest ray hit distance (> 0, along normalized d) on the mesh, or Infinity.
function castMesh(md, o, d, maxT = Infinity) {
  let g = grids.get(md.positions);
  if (!g) { g = buildGrid(md.positions, md.indices); grids.set(md.positions, g); }
  const maxX = g.minX + g.nx * g.cell, maxZ = g.minZ + g.nz * g.cell;
  let t0 = 0; let t1 = maxT;
  const slab = (oo, dd, lo, hi) => {
    if (Math.abs(dd) < 1e-12) return oo >= lo && oo <= hi;
    let a = (lo - oo) / dd; let b = (hi - oo) / dd;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    return t0 <= t1;
  };
  if (!slab(o[0], d[0], g.minX, maxX) || !slab(o[2], d[2], g.minZ, maxZ)) return Infinity;
  const sx = o[0] + d[0] * t0, sz = o[2] + d[2] * t0;
  let cx = Math.max(0, Math.min(g.nx - 1, Math.floor((sx - g.minX) / g.cell)));
  let cz = Math.max(0, Math.min(g.nz - 1, Math.floor((sz - g.minZ) / g.cell)));
  const stepX = d[0] > 0 ? 1 : -1; const stepZ = d[2] > 0 ? 1 : -1;
  const tDx = Math.abs(d[0]) < 1e-12 ? Infinity : g.cell / Math.abs(d[0]);
  const tDz = Math.abs(d[2]) < 1e-12 ? Infinity : g.cell / Math.abs(d[2]);
  const nextX = g.minX + (cx + (stepX > 0 ? 1 : 0)) * g.cell; const nextZ = g.minZ + (cz + (stepZ > 0 ? 1 : 0)) * g.cell;
  let tMx = Math.abs(d[0]) < 1e-12 ? Infinity : (nextX - o[0]) / d[0];
  let tMz = Math.abs(d[2]) < 1e-12 ? Infinity : (nextZ - o[2]) / d[2];
  let best = Infinity;
  while (cx >= 0 && cx < g.nx && cz >= 0 && cz < g.nz) {
    const c = cz * g.nx + cx;
    for (let k = g.start[c]; k < g.start[c + 1]; k++) {
      const t = rayTri(md.positions, md.indices, g.tris[k], o, d);
      if (t < best) best = t;
    }
    if (best <= Math.min(tMx, tMz, t1)) return best;
    if (tMx < tMz) { cx += stepX; tMx += tDx; } else { cz += stepZ; tMz += tDz; }
    if (Math.min(tMx, tMz) - tDx > t1 && Math.min(tMx, tMz) - tDz > t1) break;
  }
  return best <= t1 ? best : Infinity;
}

// Nearest scan point within ~10 screen pixels of the cursor ray (point clouds are sparse, so a
// pixel-sized tolerance — converted to meters at each point's distance — feels natural).
function castPoints(md, o, d, angPerPx) {
  const p = md.positions; let bestT = Infinity;
  const k = angPerPx * 10;
  for (let i = 0; i < p.length; i += 3) {
    const wx = p[i] - o[0], wy = p[i + 1] - o[1], wz = p[i + 2] - o[2];
    const t = wx * d[0] + wy * d[1] + wz * d[2];
    if (t <= 0 || t >= bestT) continue;
    const dx = wx - t * d[0], dy = wy - t * d[1], dz = wz - t * d[2];
    const tol = 0.1 + k * t;
    if (dx * dx + dy * dy + dz * dz <= tol * tol) bestT = t;
  }
  return bestT;
}

const hitToLngLatAlt = (md, p) => {
  const [X, Y, Z] = fromLocal(md, p[0], p[1], p[2]);
  const ll = new maplibregl.MercatorCoordinate(X, Y, Z).toLngLat();
  return { lng: ll.lng, lat: ll.lat, alt: Math.max(0, p[1]) };
};

// Click/hover on the model surface -> { lng, lat, alt } (alt = meters above the model base), or null on a miss.
export function pickSurface(map, px, py) {
  const md = model(map);
  if (!md) return null;
  const ray = screenRay(map, md, px, py);
  if (!ray) return null;
  let t;
  if (md.kind === 'mesh') t = castMesh(md, ray.o, ray.d);
  else if (md.kind === 'tiles') t = md.cast(ray.o, ray.d);
  else {
    const n = screenRay(map, md, px + 1, py);
    const ang = n ? Math.hypot(n.d[0] - ray.d[0], n.d[1] - ray.d[1], n.d[2] - ray.d[2]) : 0.0005;
    t = castPoints(md, ray.o, ray.d, ang);
  }
  if (!isFinite(t)) return null;
  return hitToLngLatAlt(md, [ray.o[0] + ray.d[0] * t, ray.o[1] + ray.d[1] * t, ray.o[2] + ray.d[2] * t]);
}

// Altitude of the point on the vertical line above (lng,lat) closest to the cursor ray —
// lets the user drag a pin's head up/down along its stem even where no surface is hit.
export function altitudeAlongVertical(map, lng, lat, px, py) {
  const md = model(map);
  if (!md) return null;
  const ray = screenRay(map, md, px, py);
  if (!ray) return null;
  const mc = mercAt(md, lng, lat, 0);
  const base = toLocal(md, mc.x, mc.y, mc.z);
  // closest points between the cursor ray (o + s d) and the vertical line (base + u * up)
  const w0 = [ray.o[0] - base[0], ray.o[1] - base[1], ray.o[2] - base[2]];
  const b = ray.d[1]; const d1 = ray.d[0] * w0[0] + ray.d[1] * w0[1] + ray.d[2] * w0[2]; const e = w0[1];
  const den = 1 - b * b;
  if (Math.abs(den) < 1e-6) return null;
  // minimize |w0 + s d - u up|  =>  s = (b e - d1) / (1 - b²),  u = e + s b
  const s = (b * e - d1) / den;
  return Math.max(0, e + s * b);
}

// Is the model surface between the camera and this point? (used to dim hidden annotations)
export function isOccluded(map, lng, lat, alt) {
  const md = model(map);
  if (!md || (md.kind !== 'mesh' && md.kind !== 'tiles')) return false;
  const pt = project(map, lng, lat, alt);
  if (!pt) return false;
  const ray = screenRay(map, md, pt.x, pt.y);
  if (!ray) return false;
  const mc = mercAt(md, lng, lat, alt);
  const target = toLocal(md, mc.x, mc.y, mc.z);
  const dist = Math.hypot(target[0] - ray.o[0], target[1] - ray.o[1], target[2] - ray.o[2]);
  const t = md.kind === 'tiles' ? md.cast(ray.o, ray.d, dist) : castMesh(md, ray.o, ray.d, dist);
  return t < dist - Math.max(0.6, dist * 0.004);
}

// Where the cursor ray meets the model's base plane (altitude 0) — same plane the pins' ground
// dots are projected on, so a pin dropped off the model still lands under the cursor.
export function pickGround(map, px, py) {
  const md = model(map);
  if (!md) return null;
  const ray = screenRay(map, md, px, py);
  if (!ray || ray.d[1] > -1e-4) return null;
  const t = -ray.o[1] / ray.d[1];
  if (t <= 0) return null;
  const r = hitToLngLatAlt(md, [ray.o[0] + ray.d[0] * t, 0, ray.o[2] + ray.d[2] * t]);
  return { ...r, alt: 0, ground: true };
}
