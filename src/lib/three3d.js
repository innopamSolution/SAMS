import { buildTowerPositions } from './popupHelpers';

// Adds (or replaces) a custom Three.js point-cloud layer on the given
// MapLibre map, anchored at lngLat, rendered directly into the map's WebGL
// context via maplibregl's custom-layer API.
export function add3DLayer(maplibregl, targetMap, color, lngLat, count, H) {
  const THREE = window.THREE;
  if (!THREE) return;
  if (targetMap.getLayer('sams-3d')) targetMap.removeLayer('sams-3d');
  const merc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, 0);
  const transform = { x: merc.x, y: merc.y, z: merc.z, scale: merc.meterInMercatorCoordinateUnits() };
  const positions = buildTowerPositions(H, H * 0.4, count);

  const layer = {
    id: 'sams-3d',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color: new THREE.Color(color), size: 2.4, sizeAttenuation: false });
      this.points = new THREE.Points(geo, mat);
      this.scene.add(this.points);
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
  targetMap.addLayer(layer);
}
