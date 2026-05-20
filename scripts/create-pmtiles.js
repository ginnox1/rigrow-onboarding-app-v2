#!/usr/bin/env node
/**
 * create-pmtiles.js
 *
 * Downloads raster map tiles and writes a single .pmtiles v3 file.
 * No npm dependencies — pure Node.js built-ins.
 *
 * Usage:
 *   node scripts/create-pmtiles.js --center lng,lat --radius km --out tiles/region.pmtiles
 *   node scripts/create-pmtiles.js --bbox w,s,e,n  --out tiles/region.pmtiles
 *
 * Options:
 *   --center   lat,lng            region centre — Google Maps order (decimal degrees)
 *   --radius   km                 radius → square bbox
 *   --bbox     west,south,east,north
 *   --out      output .pmtiles path  (default: output.pmtiles)
 *   --minzoom  (default: 5)
 *   --maxzoom  (default: 14)
 *   --token    Mapbox access token  (or set VITE_MAPBOX_TOKEN env var)
 *   --source   mapbox-satellite | osm | esri | eox | custom {z}/{x}/{y} URL
 *   --header   "Name: value"  (e.g. "Authorization: Bearer <token>")
 *   --jobs     parallel downloads  (default: 8)
 *
 * NOTE: --center uses lat,lng order (Google Maps convention) — NOT lng,lat
 * NOTE: avoid spaces in coordinates: 7.142152,38.51402 not "7.142152, 38.51402"
 * NOTE: Use eox for copernicus/sentinel 2
 * NOTE: Check your tile provider's Terms of Service before caching tiles offline.
 */

import https from 'https';
import http  from 'http';
import fs    from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';

// Load .env from repo root (Vite reads it; plain `node` does not)
try {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* no .env — rely on shell env */ }

// ── Tile math ────────────────────────────────────────────────────────────────

function lngToX(lng, z) {
  return Math.floor(((lng + 180) / 360) * (1 << z));
}

function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z)
  );
}

function bboxTiles(w, s, e, n, z) {
  const tiles = [];
  const xMin = lngToX(w, z), xMax = lngToX(e, z);
  const yMin = latToY(n, z), yMax = latToY(s, z); // y increases downward
  for (let x = xMin; x <= xMax; x++)
    for (let y = yMin; y <= yMax; y++)
      tiles.push({ z, x, y });
  return tiles;
}

function centerRadiusToBbox(lng, lat, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

// ── Hilbert tile ID (PMTiles v3) ─────────────────────────────────────────────

function zxyToTileId(z, x, y) {
  if (z === 0) return 0;
  const base = (Math.pow(4, z) - 1) / 3;
  let acc = 0, bx = x, by = y;
  for (let s = 1 << (z - 1); s > 0; s >>= 1) {
    const rx = (bx & s) > 0 ? 1 : 0;
    const ry = (by & s) > 0 ? 1 : 0;
    acc += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { bx = s - 1 - bx; by = s - 1 - by; }
      const t = bx; bx = by; by = t;
    }
  }
  return base + acc;
}

// ── Unsigned LEB-128 varint ──────────────────────────────────────────────────

function varint(n) {
  const b = [];
  while (n > 127) { b.push((n % 128) + 128); n = Math.floor(n / 128); }
  b.push(n);
  return Buffer.from(b);
}

// ── PMTiles v3 directory ─────────────────────────────────────────────────────

function buildDirectory(entries) {
  // PMTiles v3 directory format (all fields in separate passes, NOT interleaved):
  //   numEntries | tileId_deltas... | runLengths... | lengths... | offsets...
  const parts = [];

  // 1. number of entries
  parts.push(varint(entries.length));

  // 2. tile ID deltas
  let lastId = 0;
  for (const e of entries) {
    parts.push(varint(e.tileId - lastId));
    lastId = e.tileId;
  }

  // 3. run lengths (always 1 — no run-length encoding)
  for (let i = 0; i < entries.length; i++) parts.push(varint(1));

  // 4. tile byte lengths
  for (const e of entries) parts.push(varint(e.length));

  // 5. offsets — 0 means "packed" (prev offset + prev length), else offset+1
  for (let i = 0; i < entries.length; i++) {
    if (i === 0) {
      parts.push(varint(entries[i].offset + 1)); // absolute offset+1 for first entry
    } else {
      const p = entries[i - 1];
      parts.push(varint(p.offset + p.length === entries[i].offset ? 0 : entries[i].offset + 1));
    }
  }

  return Buffer.concat(parts);
}

// ── PMTiles v3 writer ─────────────────────────────────────────────────────────

function writePMTiles(outputPath, tiles, bbox, minZoom, maxZoom) {
  const [w, s, e, n] = bbox;

  // Sort tiles by Hilbert ID and build packed tile data
  const sorted = tiles
    .map(t => ({ ...t, tileId: zxyToTileId(t.z, t.x, t.y) }))
    .sort((a, b) => a.tileId - b.tileId);

  const entries = [];
  let offset = 0;
  const tileData = Buffer.concat(
    sorted.map(t => {
      entries.push({ tileId: t.tileId, offset, length: t.data.length });
      offset += t.data.length;
      return t.data;
    })
  );

  const rootDir = buildDirectory(entries);

  const meta = Buffer.from(JSON.stringify({
    name: path.basename(outputPath, '.pmtiles'),
    format: 'jpg',
    bounds: `${w},${s},${e},${n}`,
    center: `${((w + e) / 2).toFixed(6)},${((s + n) / 2).toFixed(6)},${maxZoom}`,
    minzoom: minZoom,
    maxzoom: maxZoom,
  }), 'utf8');

  // Layout: [header 127B][rootDir][meta][tileData]
  const ROOT_OFF = 127;
  const META_OFF = ROOT_OFF + rootDir.length;
  const DATA_OFF = META_OFF + meta.length;

  const hdr = Buffer.alloc(127);
  hdr.write('PMTiles', 0, 'ascii');
  hdr.writeUInt8(3, 7); // spec version

  const u64 = (off, v) => hdr.writeBigUInt64LE(BigInt(v), off);
  u64( 8, ROOT_OFF);          u64(16, rootDir.length);  // root dir
  u64(24, META_OFF);          u64(32, meta.length);      // metadata
  u64(40, DATA_OFF);          u64(48, 0);                // leaf dirs: none
  u64(56, DATA_OFF);          u64(64, tileData.length);  // tile data
  u64(72, tiles.length);      u64(80, entries.length);   // n_addressed / n_entries
  u64(88, entries.length);                               // n_contents

  hdr.writeUInt8(1, 96); // clustered
  hdr.writeUInt8(1, 97); // internal_compression: none
  hdr.writeUInt8(1, 98); // tile_compression: none
  hdr.writeUInt8(3, 99); // tile_type: jpg (2 = png)
  hdr.writeUInt8(minZoom, 100);
  hdr.writeUInt8(maxZoom, 101);

  const e7 = v => Math.round(v * 1e7);
  hdr.writeInt32LE(e7(w), 102); hdr.writeInt32LE(e7(s), 106);
  hdr.writeInt32LE(e7(e), 110); hdr.writeInt32LE(e7(n), 114);
  hdr.writeUInt8(maxZoom, 118);
  hdr.writeInt32LE(e7((w + e) / 2), 119);
  hdr.writeInt32LE(e7((s + n) / 2), 123);

  fs.writeFileSync(outputPath, Buffer.concat([hdr, rootDir, meta, tileData]));
}

// ── Tile download ─────────────────────────────────────────────────────────────

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = { hostname: u.hostname, path: u.pathname + u.search, headers };
    lib.get(opts, res => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return get(res.headers.location, headers).then(resolve).catch(reject);
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadAll(tileList, urlTpl, jobs, headers = {}) {
  const results = new Array(tileList.length);
  let done = 0;
  // detect swapped y/x order (ESRI, EOX style: {z}/{y}/{x})
  const swapped = urlTpl.indexOf('{y}') < urlTpl.indexOf('{x}');
  for (let i = 0; i < tileList.length; i += jobs) {
    const batch = tileList.slice(i, i + jobs);
    await Promise.all(batch.map(async (t, j) => {
      let url = urlTpl.replace('{z}', t.z);
      url = swapped
        ? url.replace('{y}', t.y).replace('{x}', t.x)
        : url.replace('{x}', t.x).replace('{y}', t.y);
      results[i + j] = { ...t, data: await get(url, headers) };
      process.stdout.write(`\r  Downloading tiles: ${++done}/${tileList.length}   `);
    }));
  }
  process.stdout.write('\n');
  return results;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs() {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    // Collect all consecutive non-flag tokens as the value (handles spaces in coords)
    const parts = [];
    while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) parts.push(argv[++i]);
    a[key] = parts.join('').replace(/\s/g, '');
  }
  return a;
}

function resolveTemplate(source, token) {
  if (!source || source === 'mapbox-satellite') {
    if (!token) throw new Error('--token or VITE_MAPBOX_TOKEN required for mapbox-satellite');
    return `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.jpg?access_token=${token}`;
  }
  if (source === 'osm')
    return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  if (source === 'esri')
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  if (source === 'eox')
    return 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg';
  return source; // custom {z}/{x}/{y} or {z}/{y}/{x} template
}

async function main() {
  const a       = parseArgs();
  const token   = a.token || process.env.VITE_MAPBOX_TOKEN;
  const minZoom = parseInt(a.minzoom || '5',  10);
  const maxZoom = parseInt(a.maxzoom || '14', 10);
  const jobs    = parseInt(a.jobs    || '8',  10);
  const outPath = path.resolve(a.out || 'output.pmtiles');
  const tplUrl  = resolveTemplate(a.source, token);

  // --header "Authorization: Bearer <token>"
  const headers = {};
  if (a.header) {
    [].concat(a.header).forEach(h => {
      const idx = h.indexOf(':');
      if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    });
  }

  let bbox;
  if (a.bbox) {
    bbox = a.bbox.split(',').map(Number);
  } else if (a.center && a.radius) {
    const [lat, lng] = a.center.split(',').map(Number); // Google Maps order: lat,lng
    bbox = centerRadiusToBbox(lng, lat, parseFloat(a.radius));
  } else {
    console.error([
      '',
      'Usage:',
      '  node scripts/create-pmtiles.js --center lng,lat --radius km --out path/to/file.pmtiles',
      '  node scripts/create-pmtiles.js --bbox w,s,e,n  --out path/to/file.pmtiles',
      '',
      'Options:',
      '  --token    Mapbox token (or set VITE_MAPBOX_TOKEN)',
      '  --source   mapbox-satellite | osm | esri | eox | custom {z}/{x}/{y} URL',
      '  --header   "Name: value"  (e.g. "Authorization: Bearer <token>")',
      '  --minzoom  default: 5',
      '  --maxzoom  default: 14',
      '  --jobs     parallel downloads, default: 8',
    ].join('\n'));
    process.exit(1);
  }

  // Enumerate all tiles across all zoom levels
  const tileList = [];
  for (let z = minZoom; z <= maxZoom; z++)
    tileList.push(...bboxTiles(...bbox, z));

  const [w, s, e, n] = bbox;
  console.log(`Bbox    : ${w.toFixed(5)}, ${s.toFixed(5)}, ${e.toFixed(5)}, ${n.toFixed(5)}`);
  console.log(`Zooms   : ${minZoom}–${maxZoom}   Tiles: ${tileList.length}`);
  console.log(`Output  : ${outPath}`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const tiles = await downloadAll(tileList, tplUrl, jobs, headers);

  process.stdout.write('  Writing .pmtiles file...');
  writePMTiles(outPath, tiles, bbox, minZoom, maxZoom);
  const { size } = fs.statSync(outPath);
  console.log(` done  (${(size / 1048576).toFixed(1)} MB)`);
}

main().catch(e => { console.error('\nError:', e.message); process.exit(1); });
