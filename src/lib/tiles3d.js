// Cesium 3D Tiles(b3dm/glTF)를 MapLibre 지도 위에 직접 그린다.
//
// 타일셋은 지구중심 직교좌표(ECEF)로 저장돼 있다. 기준점(lng/lat, 지면 높이) 둘레의 로컬 프레임
// (x 동, y 위, z 남 — three3d.js 의 모델 프레임과 같음)으로 옮겨 그리므로 지도 위 좌표·어노테이션·
// 표면 찍기(pick3d.js)를 기존 메시와 똑같이 쓸 수 있다. y=0 이 지면이고 지형 고도 위에 얹힌다.
import * as THREE from 'three';
import { TilesRenderer } from '3d-tiles-renderer/three';

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);

function geodeticToEcef(lngDeg, latDeg, h) {
  const lng = (lngDeg * Math.PI) / 180; const lat = (latDeg * Math.PI) / 180;
  const sl = Math.sin(lat); const cl = Math.cos(lat);
  const n = A / Math.sqrt(1 - E2 * sl * sl);
  return new THREE.Vector3((n + h) * cl * Math.cos(lng), (n + h) * cl * Math.sin(lng), (n * (1 - E2) + h) * sl);
}

// ECEF → 로컬(x 동, y 위, z 남) 행렬. 기준점 O 의 동·북·상 축으로 회전하고 O 만큼 평행이동한다.
function ecefToLocalMatrix(lngDeg, latDeg, h) {
  const lng = (lngDeg * Math.PI) / 180; const lat = (latDeg * Math.PI) / 180;
  const o = geodeticToEcef(lngDeg, latDeg, h);
  const e = new THREE.Vector3(-Math.sin(lng), Math.cos(lng), 0);
  const n = new THREE.Vector3(-Math.sin(lat) * Math.cos(lng), -Math.sin(lat) * Math.sin(lng), Math.cos(lat));
  const u = new THREE.Vector3(Math.cos(lat) * Math.cos(lng), Math.cos(lat) * Math.sin(lng), Math.sin(lat));
  return new THREE.Matrix4().set(
    e.x, e.y, e.z, -e.dot(o),
    u.x, u.y, u.z, -u.dot(o),
    -n.x, -n.y, -n.z, n.dot(o),
    0, 0, 0, 1,
  );
}

// 타일의 PBR 재질은 조명이 없으면 까맣게 나오므로, 지도 위에서 보이는 그대로(조명 없이) 그린다.
function flatten(scene) {
  scene.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.__sams) return;
    const m = o.material;
    const nm = new THREE.MeshBasicMaterial({
      map: m.map || null,
      color: m.color ? m.color.clone() : 0xffffff,
      vertexColors: !!(o.geometry && o.geometry.attributes && o.geometry.attributes.color),
      side: THREE.DoubleSide,
      transparent: !!m.transparent,
      opacity: m.opacity != null ? m.opacity : 1,
      alphaTest: m.alphaTest || 0,
    });
    nm.__sams = true;
    o.material = nm;
  });
}

/**
 * @param {object} maplibregl
 * @param {object} map
 * @param {{ url: string, lngLat: [number, number], groundH?: number, onError?: (e: any) => void, onReady?: () => void }} opts
 *   groundH: 타일셋 좌표계(타원체 높이)에서 지면의 높이(m). 이 높이가 로컬 y=0, 곧 지형 위 지면이 된다.
 */
export function addTilesLayer(maplibregl, map, { url, lngLat, groundH = 2.6, onError, onReady }) {
  if (map.getLayer('sams-3d')) map.removeLayer('sams-3d');

  const merc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, 0);
  const transform = { x: merc.x, y: merc.y, z: 0, scale: merc.meterInMercatorCoordinateUnits() };
  const tiles = new TilesRenderer(url);
  const group = tiles.group;
  group.matrixAutoUpdate = false;
  group.matrix.copy(ecefToLocalMatrix(lngLat[0], lngLat[1], groundH));
  group.matrixWorldNeedsUpdate = true;

  tiles.errorTarget = 8;
  tiles.lruCache.maxBytesSize = 768 * 1024 * 1024;
  tiles.addEventListener('load-model', ({ scene }) => { flatten(scene); map.triggerRepaint(); });
  tiles.addEventListener('needs-update', () => map.triggerRepaint());
  tiles.addEventListener('load-error', (ev) => { if (!ev.tile && onError) onError(ev.error); else console.warn('[tiles3d]', ev.error); });
  tiles.addEventListener('load-root-tileset', () => { if (onReady) onReady(); });

  const scene = new THREE.Scene();
  scene.add(group);
  const camera = new THREE.Camera(); // 실제로 그리는 카메라(지도 행렬)
  const lod = new THREE.PerspectiveCamera(); // 타일 선택(LOD)용 카메라 — 지도 행렬에서 복원한 실제 시점
  lod.matrixAutoUpdate = false;
  tiles.setCamera(lod);

  const raycaster = new THREE.Raycaster();
  const model = {
    transform, kind: 'tiles', matrix: null, positions: null, indices: null,
    // 로컬 프레임 광선(o, d)이 처음 닿는 표면까지의 거리(없으면 Infinity)
    cast(o, d, maxT = Infinity) {
      raycaster.set(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(d[0], d[1], d[2]));
      raycaster.near = 0; raycaster.far = maxT;
      let best = Infinity;
      tiles.forEachLoadedModel((sc, tile) => {
        if (!tiles.visibleTiles.has(tile)) return;
        const hit = raycaster.intersectObject(sc, true)[0];
        if (hit && hit.distance < best) best = hit.distance;
      });
      return best;
    },
  };
  map.__sams3d = model;

  const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const layer = {
    id: 'sams-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    },
    onRemove() {
      tiles.dispose();
      if (this.renderer) { this.renderer.dispose(); this.renderer = null; }
      if (map.__sams3d === model) map.__sams3d = null;
    },
    render(gl, args) {
      if (!this.renderer) return;
      const mat = (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix) || args;
      model.matrix = Array.from(mat);

      // 모델의 지면(y=0)을 지도 지형 위에 둔다. 지형 타일이 늦게 들어오므로 값이 생길 때마다 갱신한다.
      if (map.queryTerrainElevation) {
        const el = map.queryTerrainElevation(lngLat);
        if (typeof el === 'number' && isFinite(el)) transform.z = el * transform.scale;
      }

      // 로컬(x 동, y 위, z 남) → 클립
      const l = new THREE.Matrix4().makeTranslation(transform.x, transform.y, transform.z)
        .scale(new THREE.Vector3(transform.scale, -transform.scale, transform.scale)).multiply(rotX);
      const pv = new THREE.Matrix4().fromArray(mat).multiply(l);
      camera.projectionMatrix.copy(pv);
      camera.projectionMatrixInverse.copy(pv).invert();

      // 지도 행렬에서 시점을 복원한다: 위치(w=0 의 점)·오른쪽·위 방향.
      const inv = pv.clone().invert();
      const un = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(inv);
      const c4 = new THREE.Vector4(0, 0, 1, 0).applyMatrix4(inv);
      const pos = new THREE.Vector3(c4.x / c4.w, c4.y / c4.w, c4.z / c4.w);
      const right = un(1, 0, -1).sub(un(-1, 0, -1)).normalize();
      const up = un(0, 1, -1).sub(un(0, -1, -1)).normalize();
      const back = new THREE.Vector3().crossVectors(right, up).normalize();
      lod.matrixWorld.makeBasis(right, up, back).setPosition(pos);
      lod.matrixWorldInverse.copy(lod.matrixWorld).invert();
      lod.projectionMatrix.copy(pv).multiply(lod.matrixWorld);
      lod.projectionMatrixInverse.copy(lod.projectionMatrix).invert();
      tiles.setResolution(lod, gl.drawingBufferWidth, gl.drawingBufferHeight);

      tiles.update();
      this.renderer.resetState();
      this.renderer.render(scene, camera);
      if (tiles.loadProgress < 1) map.triggerRepaint();
    },
  };
  map.addLayer(layer);
  return { tiles };
}
