// Loads the compact custom binary format written by the LAS-extraction script:
//   uint32 count
//   count * float32[3]  local xyz (meters, centered on the scan's bounding-box
//                        center; y is height above the lowest point)
//   count * uint8[3]    real RGB sampled from the source point cloud
const cache = new Map();

export function loadPointCloud(url) {
  if (cache.has(url)) return cache.get(url);
  const promise = fetch(url)
    .then((res) => res.arrayBuffer())
    .then((buf) => {
      const dv = new DataView(buf);
      const count = dv.getUint32(0, true);
      const positions = new Float32Array(buf, 4, count * 3);
      const colors = new Uint8Array(buf, 4 + count * 3 * 4, count * 3);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < count; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return { count, positions, colors, bounds: { minX, maxX, minY, maxY, minZ, maxZ } };
    });
  cache.set(url, promise);
  return promise;
}
