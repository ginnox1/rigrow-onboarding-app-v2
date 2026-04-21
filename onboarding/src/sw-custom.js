import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event.request))
  }
})

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
    await writable.write(await file.arrayBuffer())
    await writable.close()

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
        db.createObjectStore('offline_maps')
      }
    }
    req.onsuccess = e => {
      const db = e.target.result
      const tx = db.transaction('offline_maps', 'readwrite')
      const putReq = tx.objectStore('offline_maps').put(record, record.filename)
      putReq.onsuccess = () => resolve(record)
      putReq.onerror = () => reject(putReq.error)
      tx.oncomplete = () => db.close()
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
    req.onerror = () => reject(req.error)
  })
}
