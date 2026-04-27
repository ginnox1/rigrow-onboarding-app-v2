import { CRM_WEBHOOK_URL } from './config.js'

const QUEUE_DB = 'rigrow-crm-queue'
const QUEUE_STORE = 'queue'

async function getQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(QUEUE_STORE, { autoIncrement: true })
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

export const FIELD_HOLD_MS = 10 * 60 * 1000

async function enqueue(payload) {
  const db = await getQueueDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const req = tx.objectStore(QUEUE_STORE).add(payload)
    tx.oncomplete = () => resolve(req.result) // returns auto-increment key
    tx.onerror = () => reject(tx.error)
  })
}

async function sendPayload(payload) {
  const isAppsScript = CRM_WEBHOOK_URL.includes('script.google.com')
  if (isAppsScript) {
    const url = CRM_WEBHOOK_URL + '?data=' + encodeURIComponent(JSON.stringify(payload))
    await fetch(url, { mode: 'no-cors' })
  } else {
    await fetch(CRM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  }
}

async function postEvent(payload) {
  const withTimestamp = { ...payload, timestamp: new Date().toISOString() }
  try {
    await sendPayload(withTimestamp)
  } catch {
    await enqueue(withTimestamp)
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const reg = await navigator.serviceWorker.ready
      await reg.sync.register('crm-queue-flush')
    }
  }
}

export function postLead({ phone, name, region, woreda, language, via }) {
  return postEvent({ event: 'new_registration', phone, name, region, woreda, language, via })
}

export function postFieldRequest({ phone, fieldMode, hectares, crop, plantingDate, annualPriceBirr, currency, discount, paymentStatus, gpsCoordsStr, via }) {
  return postEvent({ event: 'field_request', phone, fieldMode, hectares, crop, plantingDate, annualPriceBirr, currency, discount, paymentStatus, gpsCoordsStr, via })
}

export async function enqueueFieldRequest(params, holdMs = FIELD_HOLD_MS) {
  const payload = {
    event: 'field_request', ...params,
    timestamp: new Date().toISOString(),
    sendAfter: Date.now() + holdMs,
  }
  return enqueue(payload) // resolves with IDB key
}

export async function dequeueField(key) {
  if (key == null) return
  const db = await getQueueDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).delete(key)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export function postAgentRequest({ phone, name, region, woreda, language, via }) {
  return postEvent({ event: 'agent_request', phone, name, region, woreda, language, via })
}

export function postDownloadView({ phone }) {
  return postEvent({ event: 'app_download_view', phone })
}

export async function clearQueue() {
  const db = await getQueueDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).clear()
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

export async function flushQueue() {
  const db = await getQueueDB()

  // Read all queued items first (in their own transaction)
  const allItems = await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const store = tx.objectStore(QUEUE_STORE)
    const result = []
    store.openCursor().onsuccess = function(e) {
      const cursor = e.target.result
      if (cursor) {
        result.push({ key: cursor.key, value: cursor.value })
        cursor.continue()
      } else {
        resolve(result)
      }
    }
    tx.onerror = () => reject(tx.error)
  })

  const now = Date.now()
  for (const { key, value } of allItems) {
    if (value.sendAfter && value.sendAfter > now) continue // hold period not elapsed
    try {
      await sendPayload(value)
      await new Promise((resolve, reject) => {
        const tx = db.transaction(QUEUE_STORE, 'readwrite')
        tx.objectStore(QUEUE_STORE).delete(key)
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      break
    }
  }
}
