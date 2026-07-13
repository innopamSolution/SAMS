// Loads the compact binary mesh format written by the OBJ-extraction script:
//   uint32 vertexCount
//   uint32 faceCount
//   vertexCount * float32[3]  local xyz (meters, centered on the mesh's own
//                              bounding-box center; y is height above the
//                              lowest vertex)
//   vertexCount * uint8[3]    per-vertex RGB baked from the source OBJ
//   faceCount * uint32[3]     triangle indices into the vertex arrays
const cache = new Map();

export function loadMeshAsset(url) {
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
