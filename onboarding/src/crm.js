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

async function enqueue(payload) {
  const db = await getQueueDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).add(payload)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

async function sendPayload(payload) {
  const isAppsScript = CRM_WEBHOOK_URL.includes('script.google.com')
  const opts = isAppsScript
    ? { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  await fetch(CRM_WEBHOOK_URL, opts)
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

export function postFieldRequest({ phone, fieldMode, hectares, crop, plantingDate, annualPriceBirr, discount, paymentStatus, gpsCoordsStr, via }) {
  return postEvent({ event: 'field_request', phone, fieldMode, hectares, crop, plantingDate, annualPriceBirr, discount, paymentStatus, gpsCoordsStr, via })
}

export function postAgentRequest({ phone, name, region, woreda, language, via }) {
  return postEvent({ event: 'agent_request', phone, name, region, woreda, language, via })
}

export async function flushQueue() {
  const db = await getQueueDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  const keys = await new Promise(res => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result) })
  for (const key of keys) {
    const item = await new Promise(res => { const r = store.get(key); r.onsuccess = () => res(r.result) })
    try {
      await sendPayload(item)
      store.delete(key)
    } catch { break }
  }
}
