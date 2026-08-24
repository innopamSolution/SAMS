export function buildMainStyle() {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      light: {
        type: 'raster',
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
        tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.openstreetmap.org/{z}/{x}/{y}.png`),
      },
      sat: {
        type: 'raster',
        tileSize: 256,
        maxzoom: 18,
        attribution: '© Esri, Maxar, Earthstar Geographics',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      },
      satref: {
        type: 'raster',
        tileSize: 256,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      },
      terrain: {
        type: 'raster-dem',
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      },
    },
    layers: [
      { id: 'light-tiles', type: 'raster', source: 'light' },
      { id: 'sat-tiles', type: 'raster', source: 'sat', layout: { visibility: 'none' } },
      { id: 'satref-tiles', type: 'raster', source: 'satref', layout: { visibility: 'none' } },
    ],
  };
}


// 관리 페이지의 작은 위치 확인용 지도 — 베이스 래스터 한 장이면 충분하다.
export function buildMiniStyle() {
  return {
    version: 8,
    sources: {
      light: {
        type: 'raster',
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
        tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.openstreetmap.org/{z}/{x}/{y}.png`),
      },
    },
    layers: [{ id: 'light-tiles', type: 'raster', source: 'light' }],
  };
}

export function buildCompareStyle() {
  return {
    version: 8,
    sources: {
      sat: {
        type: 'raster',
        tileSize: 256,
        maxzoom: 18,
        attribution: '© Esri, Maxar',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      },
      terrain: {
        type: 'raster-dem',
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      },
    },
    layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
  };
}

// Zoom level at which point markers start being backed by the data's real
// coverage rectangle on the ground.
export const FOOTPRINT_MINZOOM = 16;

export function addAssetLayers(map) {
  map.addSource('footprints', {
    type: 'geojson',
    promoteId: 'id',
    data: { type: 'FeatureCollection', features: [] },
  });
  // Below FOOTPRINT_MINZOOM the rectangles stay hidden unless the item is
  // hovered (미리보기) or clicked — then its footprint shows at any zoom.
  const fpEmphasized = ['any',
    ['boolean', ['feature-state', 'hover'], false],
    ['boolean', ['feature-state', 'active'], false],
  ];
  map.addLayer({
    id: 'footprint-fill',
    type: 'fill',
    source: 'footprints',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['step', ['zoom'], ['case', fpEmphasized, 0.12, 0], FOOTPRINT_MINZOOM, ['case', fpEmphasized, 0.14, 0.08]],
    },
  });
  map.addLayer({
    id: 'footprint-line',
    type: 'line',
    source: 'footprints',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', fpEmphasized, 2, 1.5],
      'line-dasharray': [2, 2],
      'line-opacity': ['step', ['zoom'], ['case', fpEmphasized, 0.95, 0], FOOTPRINT_MINZOOM, 0.85],
    },
  });

  map.addSource('assets', {
    type: 'geojson',
    promoteId: 'id',
    cluster: true,
    clusterMaxZoom: 16,
    clusterRadius: 46,
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'assets',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#4096ff', 5, '#1677ff', 10, '#0958d9'],
      'circle-radius': ['step', ['get', 'point_count'], 17, 5, 21, 10, 26],
      'circle-stroke-width': 3,
      'circle-stroke-color': 'rgba(255,255,255,0.9)',
    },
  });
  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'assets',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 14 },
    paint: { 'text-color': '#ffffff' },
  });
  map.addLayer({
    id: 'pt-halo',
    type: 'circle',
    source: 'assets',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.18,
      'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 24, ['boolean', ['feature-state', 'active'], false], 22, 0],
    },
  });
  map.addLayer({
    id: 'unclustered',
    type: 'circle',
    source: 'assets',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 11, ['boolean', ['feature-state', 'active'], false], 11, 8],
      'circle-stroke-width': ['case', ['boolean', ['feature-state', 'active'], false], 3, 2],
      'circle-stroke-color': '#ffffff',
    },
  });
}
