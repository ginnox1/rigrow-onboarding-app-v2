/**
 * map.js — Mapbox GL JS v3 + MapboxDraw setup (Section 5.4, Step 1)
 *
 * Exports factory functions; actual instances live in the step that uses the map.
 * Mapbox GL JS is loaded via CDN (mapbox-gl.css in index.html) and available
 * as the global `mapboxgl` object — we import it here for tree-shaking.
 */
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import area from '@turf/area';
import kinks from '@turf/kinks';

// Access token from env var — set VITE_MAPBOX_TOKEN in your .env file
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
mapboxgl.accessToken = TOKEN;

// Default centre — middle of East Africa
const DEFAULT_CENTER = [37.9062, 0.0236];
const DEFAULT_ZOOM   = 5;

/**
 * Initialise a Mapbox GL map in a given container element.
 * @param {string|HTMLElement} container
 * @param {[number,number]} [center]
 * @param {number} [zoom]
 * @returns {mapboxgl.Map}
 */
export function createMap(container, center = DEFAULT_CENTER, zoom = DEFAULT_ZOOM) {
  return new mapboxgl.Map({
    container,
    style: 'mapbox://styles/mapbox/satellite-streets-v12',
    center,
    zoom,
    attributionControl: false,
  });
}

/**
 * Attach MapboxDraw to an existing map.
 * Uses large vertex dots (14px) and Rigrow green colours.
 * @param {mapboxgl.Map} map
 * @returns {MapboxDraw}
 */
export function attachDraw(map) {
  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: true, trash: true },
    defaultMode: 'draw_polygon',
    styles: [
      // Polygon fill
      {
        id: 'gl-draw-polygon-fill',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        paint: {
          'fill-color': '#2E7D32',
          'fill-opacity': 0.2,
        },
      },
      // Polygon outline
      {
        id: 'gl-draw-polygon-stroke',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#2E7D32',
          'line-width': 3,
        },
      },
      // Vertex midpoints
      {
        id: 'gl-draw-polygon-midpoint',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
        paint: {
          'circle-radius': 5,
          'circle-color': '#2E7D32',
        },
      },
      // Vertex dots — large for fat-finger tapping
      {
        id: 'gl-draw-polygon-and-line-vertex',
        type: 'circle',
        filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
        paint: {
          'circle-radius': 7,
          'circle-color': '#FFFFFF',
          'circle-stroke-color': '#2E7D32',
          'circle-stroke-width': 3,
        },
      },
    ],
  });

  map.addControl(draw, 'top-right');

  // After the polygon is first created, automatically switch to direct_select
  // so the farmer can immediately drag vertices or tap + trash to delete them.
  map.on('draw.create', e => {
    const id = e.features?.[0]?.id;
    if (id) {
      // Small delay so the create event fully resolves before mode switch
      setTimeout(() => draw.changeMode('direct_select', { featureId: id }), 50);
    }
  });

  return draw;
}

/**
 * Calculate area in hectares from a GeoJSON Polygon feature.
 * @param {object} polygon - GeoJSON Feature<Polygon>
 * @returns {number} hectares (2 decimal places)
 */
export function calcHectares(polygon) {
  const m2 = area(polygon);
  return parseFloat((m2 / 10000).toFixed(2));
}

/**
 * Check if a polygon self-intersects.
 * @param {object} polygon - GeoJSON Feature<Polygon>
 * @returns {boolean}
 */
export function hasSelfIntersection(polygon) {
  const result = kinks(polygon);
  return result.features.length > 0;
}

/**
 * Add a green marker to the map at the given coordinates.
 * @param {mapboxgl.Map} map
 * @param {[number,number]} lngLat
 * @returns {mapboxgl.Marker}
 */
export function addGreenMarker(map, lngLat) {
  const el = document.createElement('div');
  // 70% of original 32×44 → 22×31; overflow:visible prevents stroke clipping
  el.style.cssText = 'width:22px;height:31px;cursor:default;overflow:visible;';
  el.innerHTML = `
    <svg viewBox="0 0 32 44" width="22" height="31"
         style="overflow:visible;" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 11 16 28 16 28S32 27 32 16C32 7.163 24.837 0 16 0z"
            fill="#2E7D32" stroke="#fff" stroke-width="2.5"/>
      <circle cx="16" cy="16" r="6" fill="#fff"/>
    </svg>
  `;
  // Anchor the tip of the pin (bottom-centre) to the coordinate
  return new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat).addTo(map);
}

export { mapboxgl };
