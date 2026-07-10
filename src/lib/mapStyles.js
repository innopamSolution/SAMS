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

export function addAssetLayers(map) {
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
