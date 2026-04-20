/**
 * offline.js — Offline detection, tile download, and File System Access storage
 * (Section 6.5 + new file-accessible download feature)
 */
import { saveState, getState, initDB } from './storage.js';
import { TILE_DOWNLOAD_RADIUS_DEG, MIN_DOWNLOAD_ZOOM, MAX_DOWNLOAD_ZOOM } from './config.js';

// ─── File System Access helpers ───────────────────────────────────────────────
// FileSystemDirectoryHandle is stored in a dedicated IndexedDB store so it
// survives page reloads. Chrome for Android 86+ supports this API.

const FS_STORE = 'fs_handles';
const FS_KEY   = 'download_dir';

async function getFsDB() {
  return initDB(); // reuses the same DB opened by storage.js
}

/**
 * Return the saved FileSystemDirectoryHandle, or null if none is stored.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function getSavedDirHandle() {
  if (!('showDirectoryPicker' in window)) return null;
  try {
    const db = await getFsDB();
    const handle = await db.get(FS_STORE, FS_KEY);
    if (!handle) return null;
    // Verify permission is still granted (user may have revoked it)
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return handle;
    const req = await handle.requestPermission({ mode: 'readwrite' });
    return req === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Prompt the user to pick a folder, save the handle to IndexedDB, return it.
 * Returns null if the user cancels or the API is unsupported.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function requestDownloadDir() {
  if (!('showDirectoryPicker' in window)) return null;
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const db = await getFsDB();
    await db.put(FS_STORE, handle, FS_KEY);
    return handle;
  } catch {
    // User cancelled or permission denied
    return null;
  }
}

/**
 * Read tile files from a chosen folder and repopulate the Cache API.
 * Files must be named {z}-{x}-{y}.jpg (written by downloadTilesForArea).
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} accessToken - Mapbox access token (used to rebuild the cache URL key)
 * @param {(processed: number, total: number) => void} [onProgress]
 * @returns {Promise<{ count: number, bounds: [number,number,number,number]|null }>}
 *   count = tiles added; bounds = [minLng, minLat, maxLng, maxLat] of all tiles, or null
 */
export async function importTilesFromDir(dirHandle, accessToken, onProgress = null) {
  if (!dirHandle) return { count: 0, bounds: null };
  const cache = await caches.open('raster-tiles');

  // First pass — collect all valid tile entries so we know the total for progress
  const entries = [];
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.jpg')) continue;
      const parts = entry.name.slice(0, -4).split('-');
      if (parts.length !== 3) continue;
      entries.push({ entry, z: parseInt(parts[0], 10), x: parseInt(parts[1], 10), y: parseInt(parts[2], 10) });
    }
  } catch { return { count: 0, bounds: null }; }

  let count = 0;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

  for (let i = 0; i < entries.length; i++) {
    const { entry, z, x, y } = entries[i];
    const url = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg90?access_token=${accessToken}`;
    const existing = await cache.match(url);
    if (!existing) {
      try {
        const file = await entry.getFile();
        const response = new Response(file, { headers: { 'Content-Type': 'image/jpeg' } });
        await cache.put(url, response);
        count++;
      } catch { /* skip unreadable files */ }
    }
    // Accumulate geographic bounds from XYZ tile coords (Web Mercator)
    const n     = Math.pow(2, z);
    const west  = x / n * 360 - 180;
    const east  = (x + 1) / n * 360 - 180;
    const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
    if (west  < minLng) minLng = west;
    if (east  > maxLng) maxLng = east;
    if (south < minLat) minLat = south;
    if (north > maxLat) maxLat = north;

    if (onProgress) onProgress(i + 1, entries.length);
  }

  const bounds = entries.length > 0 ? [minLng, minLat, maxLng, maxLat] : null;
  return { count, total: entries.length, bounds };
}

/** True if browser has no network connection. */
export function isOffline() {
  return !navigator.onLine;
}

/**
 * Register online/offline listeners and call back with current status.
 * @param {(online: boolean) => void} cb
 * @returns {() => void} unsubscribe function
 */
export function watchConnectivity(cb) {
  const onOnline  = () => cb(true);
  const onOffline = () => cb(false);
  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);
  // Emit immediately
  cb(navigator.onLine);
  return () => {
    window.removeEventListener('online',  onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

/**
 * Convert lat/lng/zoom to XYZ tile coordinates.
 * @param {number} lat
 * @param {number} lng
 * @param {number} zoom
 * @returns {{ x: number, y: number, z: number }}
 */
function latLngToTile(lat, lng, zoom) {
  const z = Math.floor(zoom);
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, z));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
  return { x, y, z };
}

/**
 * Build all Mapbox raster tile URLs for a bounding box and zoom levels.
 * @param {[number,number,number,number]} bounds - [minLng, minLat, maxLng, maxLat]
 * @param {number[]} zoomLevels
 * @param {string} accessToken
 * @returns {string[]}
 */
function getTileUrlsForBounds(bounds, zoomLevels, accessToken) {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const urls = [];

  for (const zoom of zoomLevels) {
    const topLeft     = latLngToTile(maxLat, minLng, zoom);
    const bottomRight = latLngToTile(minLat, maxLng, zoom);

    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        urls.push(
          `https://api.mapbox.com/v4/mapbox.satellite/${zoom}/${x}/${y}@2x.jpg90?access_token=${accessToken}`
        );
      }
    }
  }

  return urls;
}

/**
 * Download and cache map tiles for a given centre point (±radiusDeg degrees).
 * Reports progress via onProgress(downloaded, total).
 * Tiles accumulate in the cache — downloading a new area does NOT remove old areas.
 * If dirHandle is provided, each tile is also written to that folder as {z}-{x}-{y}.jpg
 * so the user can access, rename, and share the files from their phone storage.
 *
 * @param {{ lat: number, lng: number }} center
 * @param {string} accessToken - Mapbox access token
 * @param {(downloaded: number, total: number) => void} [onProgress]
 * @param {number} [radiusDeg]
 * @param {string} [label]  - Human-readable area name stored in the download log
 * @param {FileSystemDirectoryHandle|null} [dirHandle] - Optional folder for user-accessible copies
 */
export async function downloadTilesForArea(center, accessToken, onProgress, radiusDeg = TILE_DOWNLOAD_RADIUS_DEG, label = '', dirHandle = null) {
  // Pre-cache the Mapbox metadata files needed for offline map initialisation.
  // The TileJSON tells Mapbox what tile URL template to use; the style JSON
  // carries the layer definitions.  Both must survive a browser-data clear,
  // so we fetch and store them explicitly here (while the user is online for
  // the download) rather than relying on them happening to be in the HTTP cache.
  await _preCacheMapboxMeta(accessToken);

  const bounds = [
    center.lng - radiusDeg,
    center.lat - radiusDeg,
    center.lng + radiusDeg,
    center.lat + radiusDeg,
  ];
  const zoomLevels = Array.from({ length: MAX_DOWNLOAD_ZOOM - MIN_DOWNLOAD_ZOOM + 1 }, (_, i) => MIN_DOWNLOAD_ZOOM + i);
  const tileUrls = getTileUrlsForBounds(bounds, zoomLevels, accessToken);

  const cache = await caches.open('raster-tiles');
  let downloaded = 0;

  for (const url of tileUrls) {
    try {
      const existing = await cache.match(url);
      if (!existing) {
        const response = await fetch(url);
        if (response.ok) {
          // Clone before consuming — one copy for cache, one for the folder
          const forCache  = response.clone();
          const forFolder = response;
          await cache.put(url, forCache);
          if (dirHandle) {
            const zxy = parseTileZXY(url);
            if (zxy) {
              try {
                const fh = await dirHandle.getFileHandle(`${zxy.z}-${zxy.x}-${zxy.y}.jpg`, { create: true });
                const writable = await fh.createWritable();
                await writable.write(await forFolder.arrayBuffer());
                await writable.close();
              } catch { /* skip file-write errors silently */ }
            }
          }
        }
      }
    } catch {
      // Network error for this tile — skip and continue
    }
    downloaded++;
    if (onProgress) onProgress(downloaded, tileUrls.length);
  }

  // Append this area to the download log (existing areas are preserved)
  const existing = await getState();
  const prev = existing?.tilesDownloaded ?? [];
  await saveState({
    tilesDownloaded: [
      ...prev,
      { label: label || `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`, bbox: bounds, downloadedAt: new Date().toISOString() },
    ],
  });
}

/**
 * Return the list of areas previously downloaded for offline use.
 * @returns {Promise<Array<{label:string, bbox:number[], downloadedAt:string}>>}
 */
export async function getDownloadedAreas() {
  const state = await getState();
  return state?.tilesDownloaded ?? [];
}

/**
 * Estimate the number of tiles and download size for an area without fetching.
 * @param {{ lat: number, lng: number }} center
 * @param {number} [radiusDeg]
 * @returns {{ tileCount: number, estimatedMB: number }}
 */
export function estimateTileDownload(center, radiusDeg = TILE_DOWNLOAD_RADIUS_DEG) {
  const bounds = [
    center.lng - radiusDeg,
    center.lat - radiusDeg,
    center.lng + radiusDeg,
    center.lat + radiusDeg,
  ];
  const zoomRange = Array.from({ length: MAX_DOWNLOAD_ZOOM - MIN_DOWNLOAD_ZOOM + 1 }, (_, i) => MIN_DOWNLOAD_ZOOM + i);
  const tileCount = getTileUrlsForBounds(bounds, zoomRange, '').length;
  // ~15 KB average per tile (mix of low and high zoom satellite JPEGs)
  const estimatedMB = Math.round(tileCount * 15 / 1024 * 10) / 10;
  return { tileCount, estimatedMB };
}

/**
 * Parse z/x/y from a Mapbox tile URL.
 * @param {string} url
 * @returns {{ z: string, x: string, y: string }|null}
 */
function parseTileZXY(url) {
  const m = url.match(/\/(\d+)\/(\d+)\/(\d+)@/);
  return m ? { z: m[1], x: m[2], y: m[3] } : null;
}

/**
 * Check whether tiles have previously been downloaded for the current area.
 * @returns {Promise<boolean>}
 */
export async function hasCachedTiles() {
  try {
    const cache = await caches.open('raster-tiles');
    const keys = await cache.keys();
    return keys.length > 0;
  } catch {
    return false;
  }
}

/**
 * Fetch and cache the Mapbox TileJSON and style JSON while online so that
 * offline sessions can initialise the map even after browser data is cleared.
 * Silently skips if already cached or if the network is unavailable.
 * @param {string} accessToken
 */
async function _preCacheMapboxMeta(accessToken) {
  const metaUrls = [
    // TileJSON — tells Mapbox the tile URL template for the satellite source
    `https://api.mapbox.com/v4/mapbox.satellite.json?access_token=${accessToken}`,
    // Style JSON — layer definitions (already caught by Workbox /styles route,
    // but caching here too ensures it survives a browser-data clear + re-download)
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=${accessToken}`,
  ];

  const cache = await caches.open('mapbox-metadata');

  for (const url of metaUrls) {
    try {
      // Normalise key: strip volatile params (sku), keep access_token
      const u = new URL(url);
      const token = u.searchParams.get('access_token');
      u.search = token ? '?access_token=' + token : '';
      const key = u.toString();

      const existing = await cache.match(key);
      if (existing) continue; // already cached — skip

      const response = await fetch(url);
      if (response.ok) cache.put(key, response.clone());
    } catch { /* network unavailable — skip silently */ }
  }
}
