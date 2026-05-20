import { precacheAndRoute } from 'workbox-precaching'
import { PMTiles, FileSource } from 'pmtiles'

// pmtiles SharedPromiseCache reads exactly 16 384 bytes on first access and slices
// the root directory from that window.  Any root dir larger than ~16 KB is silently
// truncated, producing the "Expected varint not more than 10 bytes" parse error.
// LargeFileSource extends the initial read to 64 KB so archives with up to ~65 KB
// root directories (≈ 12 000+ tile entries) parse correctly.
class LargeFileSource extends FileSource {
  async getBytes(offset, length) {
    if (offset === 0 && length === 16384) {
      length = Math.min(65536, this.file.size)
    }
    return super.getBytes(offset, length)
  }
}

precacheAndRoute(self.__WB_MANIFEST)

// Take over immediately so tile serving is active on first load
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── PMTiles tile server ───────────────────────────────────────────────────────
// Intercepts /_pmtiles/{filename}/{z}/{x}/{y} and serves tiles from OPFS.

const _archives = new Map()

async function getArchive(filename) {
  if (!_archives.has(filename)) {
    const root = await navigator.storage.getDirectory()
    const mapsDir = await root.getDirectoryHandle('maps')
    const fileHandle = await mapsDir.getFileHandle(filename)
    const file = await fileHandle.getFile()
    _archives.set(filename, new PMTiles(new LargeFileSource(file)))
  }
  return _archives.get(filename)
}

async function serveTile(filename, z, x, y) {
  try {
    const archive = await getArchive(filename)
    const tile = await archive.getZxy(z, x, y)
    if (!tile) return new Response(null, { status: 404 })
    const header = await archive.getHeader()
    const types = { 2: 'image/png', 3: 'image/jpeg', 4: 'image/webp', 5: 'image/avif' }
    return new Response(tile.data, {
      headers: {
        'Content-Type': types[header.tileType] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('[SW] serveTile error:', err)
    return new Response(null, { status: 404 })
  }
}

// ── Fetch handler ─────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // PMTiles tile requests: /_pmtiles/{filename}/{z}/{x}/{y}
  const tileMatch = url.pathname.match(/^\/_pmtiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/)
  if (tileMatch) {
    const [, filename, z, x, y] = tileMatch
    event.respondWith(serveTile(decodeURIComponent(filename), +z, +x, +y))
    return
  }

  // Share Target (PWA file share)
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event.request))
  }
})

// Invalidate a cached archive (e.g. after re-import)
self.addEventListener('message', event => {
  if (event.data?.type === 'PMTILES_INVALIDATE') {
    _archives.delete(event.data.filename)
  }
})

// ── Share Target handler ──────────────────────────────────────────────────────

async function handleShareTarget(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !file.name.endsWith('.pmtiles')) {
      return Response.redirect('/?share-error=invalid-file', 303)
    }

    // Write to OPFS
    const root = await navigator.storage.getDirectory()
    const mapsDir = await root.getDirectoryHandle('maps', { create: true })
    const fileHandle = await mapsDir.getFileHandle(file.name, { create: true })
    const writable = await fileHandle.createWritable()
    await file.stream().pipeTo(writable)

    // Save metadata to IDB
    const filename = file.name
    const regionId = filename.replace(/\.[^.]+$/, '')
    const metadata = {
      regionId,
      filename,
      importedAt: new Date().toISOString(),
      sizeBytes: file.size
    }
    await idbPutMapMeta(metadata)

    // Notify all clients
    const clients = await self.clients.matchAll({ type: 'window' })
    for (const client of clients) {
      client.postMessage({ type: 'MAP_LOADED', filename })
    }

    return Response.redirect('/?map-loaded=1', 303)
  } catch (err) {
    console.error('[SW] Share target error:', err)
    return Response.redirect('/?share-error=1', 303)
  }
}

// Raw IDB write — no external imports to keep SW bundle minimal
function idbPutMapMeta(record) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rigrow-v2', 2)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('offline_maps')) {
        db.createObjectStore('offline_maps', { keyPath: 'filename' })
      }
    }
    req.onsuccess = e => {
      const db = e.target.result
      const tx = db.transaction('offline_maps', 'readwrite')
      const putReq = tx.objectStore('offline_maps').put(record)
      putReq.onsuccess = () => resolve(record)
      putReq.onerror = () => reject(putReq.error)
      tx.oncomplete = () => db.close()
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
    req.onerror = () => reject(req.error)
  })
}
