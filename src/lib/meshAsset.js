// Loads the compact binary mesh format written by the OBJ-extraction script:
//   uint32 vertexCount
//   uint32 faceCount
//   vertexCount * float32[3]  local xyz (meters, centered on the mesh's own
//                              bounding-box center; y is height above the
//                              lowest vertex)
//   vertexCount * uint8[3]    per-vertex RGB baked from the source OBJ
//   faceCount * uint32[3]     triangle indices into the vertex arrays
const cache = new Map();

// 원본 메시와 실제 지도 방향이 어긋난 자료를 위한 보정(로컬 프레임 x=동, y=위, z=남 기준).
//   mirrorZ: 남북을 뒤집는다(내보낼 때 z 축 부호가 반대로 저장된 경우)
//   rotate : 위에서 봤을 때 반시계 방향 회전(도). 뒤집기 다음에 적용한다.
//   groundY: 메시 안에서 지면(길)의 높이(m). 이만큼 내려 지면이 y=0(주석 고도의 0 m)이 되게 한다.
// 캐시된 원본 배열은 건드리지 않고 보정한 복사본을 돌려준다(삼각형 면은 양면 렌더라 그대로 둔다).
function alignMesh(mesh, align) {
  const { positions, bounds } = mesh;
  const out = new Float32Array(positions.length);
  const rad = ((align.rotate || 0) * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i], z = positions[i + 2];
    if (align.mirrorZ) z = -z;
    if (rad) { const n = -z; const e2 = x * c - n * s; const n2 = x * s + n * c; x = e2; z = -n2; }
    out[i] = x; out[i + 1] = positions[i + 1] - (align.groundY || 0); out[i + 2] = z;
  }
  // 보정 뒤 경계(주석 배치 등에서 쓸 수 있도록)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < out.length; i += 3) {
    if (out[i] < minX) minX = out[i]; if (out[i] > maxX) maxX = out[i];
    if (out[i + 2] < minZ) minZ = out[i + 2]; if (out[i + 2] > maxZ) maxZ = out[i + 2];
  }
  return { ...mesh, positions: out, bounds: { ...bounds, minX, maxX, minZ, maxZ } };
}

export function loadMeshAsset(url, align) {
  if (!align) return loadMeshAssetRaw(url);
  const key = url + '|' + JSON.stringify(align);
  if (!cache.has(key)) cache.set(key, loadMeshAssetRaw(url).then((m) => alignMesh(m, align)));
  return cache.get(key);
}

function loadMeshAssetRaw(url) {
  if (cache.has(url)) return cache.get(url);
  const promise = fetch(url)
    .then((res) => res.arrayBuffer())
    .then((buf) => {
      const dv = new DataView(buf);
      const vertexCount = dv.getUint32(0, true);
      const faceCount = dv.getUint32(4, true);
      let offset = 8;
      const positions = new Float32Array(buf, offset, vertexCount * 3);
      offset += vertexCount * 3 * 4;
      const colors = new Uint8Array(buf, offset, vertexCount * 3);
      offset += vertexCount * 3;
      const indices = new Uint32Array(buf, offset, faceCount * 3);

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < vertexCount; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return { vertexCount, faceCount, positions, colors, indices, bounds: { minX, maxX, minY, maxY, minZ, maxZ } };
    });
  cache.set(url, promise);
  return promise;
}
