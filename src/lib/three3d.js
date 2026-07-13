import { buildTowerPositions } from './popupHelpers';

function makeCustomLayer(THREE, targetMap, lngLat, maplibregl, buildScene) {
  const merc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, 0);
  const transform = { x: merc.x, y: merc.y, z: merc.z, scale: merc.meterInMercatorCoordinateUnits() };
  return {
    id: 'sams-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.points = buildScene(THREE, this.scene);
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    },
    render(gl, args) {
      if (!this.points) return;
      const matrix = (args && args.defaultProjectionData && args.defaultProjectionData.mainMatrix) || args;
      const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(transform.x, transform.y, transform.z)
        .scale(new THREE.Vector3(transform.scale, -transform.scale, transform.scale))
        .multiply(rotationX);
      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      targetMap.triggerRepaint();
    },
  };
}

// Adds (or replaces) a custom Three.js point-cloud layer on the given
// MapLibre map, anchored at lngLat, rendered directly into the map's WebGL
// context via maplibregl's custom-layer API. Procedurally generated —
// used for items that have no real scan data backing them.
export function add3DLayer(maplibregl, targetMap, color, lngLat, count, H) {
  const THREE = window.THREE;
  if (!THREE) return;
  if (targetMap.getLayer('sams-3d')) targetMap.removeLayer('sams-3d');
  const positions = buildTowerPositions(H, H * 0.4, count);
  const layer = makeCustomLayer(THREE, targetMap, lngLat, maplibregl, (T, scene) => {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    const mat = new T.PointsMaterial({ color: new T.Color(color), size: 2.4, sizeAttenuation: false });
    const points = new T.Points(geo, mat);
    scene.add(points);
    return points;
  });
  targetMap.addLayer(layer);
}

// Same custom-layer mechanics as add3DLayer, but rendered from real scan
// data: `positions` are local meter offsets already centered on `lngLat`
// (so real-world scale comes for free via the Mercator transform), and
// `colors` are the point cloud's actual sampled RGB bytes.
export function addRealPointCloudLayer(maplibregl, targetMap, lngLat, positions, colors) {
  const THREE = window.THREE;
  if (!THREE) return;
  if (targetMap.getLayer('sams-3d')) targetMap.removeLayer('sams-3d');
  const layer = makeCustomLayer(THREE, targetMap, lngLat, maplibregl, (T, scene) => {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(Float32Array.from(colors, (v) => v / 255), 3));
    const mat = new T.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true });
    const points = new T.Points(geo, mat);
    scene.add(points);
    return points;
  });
  targetMap.addLayer(layer);
}

// Real, vertex-colored triangle mesh (e.g. a photogrammetry model exported
// from an OBJ) — same anchoring as addRealPointCloudLayer, but rendered as
// a solid surface instead of points.
export function addRealMeshLayer(maplibregl, targetMap, lngLat, positions, colors, indices) {
  const THREE = window.THREE;
  if (!THREE) return;
  if (targetMap.getLayer('sams-3d')) targetMap.removeLayer('sams-3d');
  const layer = makeCustomLayer(THREE, targetMap, lngLat, maplibregl, (T, scene) => {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(Float32Array.from(colors, (v) => v / 255), 3));
    geo.setIndex(new T.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    const mat = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide });
    const mesh = new T.Mesh(geo, mat);
    scene.add(mesh);
    return mesh;
  });
  targetMap.addLayer(layer);
}
