/**
 * sync.js — Background Sync queue for offline form submission (Section 6.4)
 *
 * When offline, form data is stored in IndexedDB ('rigrow-queue').
 * The service worker picks it up and retries on reconnect.
 */
import { openDB } from 'idb';

const QUEUE_DB   = 'rigrow-queue';
const QUEUE_VER  = 1;
const QUEUE_STORE = 'submissions';
const QUEUE_KEY  = 'pending';

async function openQueueDB() {
  return openDB(QUEUE_DB, QUEUE_VER, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE);
      }
    },
  });
}

/**
 * Store submission data and register a Background Sync tag.
 * If Background Sync is not supported, falls back to an immediate fetch attempt.
 *
 * @param {object} data - onboarding state payload
 * @returns {Promise<'queued'|'sent'>}
 */
export async function queueSubmission(data) {
  const db = await openQueueDB();
  await db.put(QUEUE_STORE, { ...data, queuedAt: Date.now() }, QUEUE_KEY);

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('submit-onboarding');
    return 'queued';
  }

  // Fallback: try to send immediately (online)
  try {
    await flushNow();
    return 'sent';
  } catch {
    return 'queued';
  }
}

/**
 * Attempt to flush the queue immediately (used as a Background Sync fallback
 * and can be called after the app detects connectivity is restored).
 */
export async function flushNow() {
  const db = await openQueueDB();
  const pending = await db.get(QUEUE_STORE, QUEUE_KEY);
  if (!pending) return;

  const response = await fetch('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pending),
  });

  if (!response.ok) {
    throw new Error(`Server responded ${response.status}`);
  }

  await db.delete(QUEUE_STORE, QUEUE_KEY);
  return response.json();
}

/**
 * Check if there is an unsubmitted record in the queue.
 * @returns {Promise<boolean>}
 */
export async function hasPendingSubmission() {
  const db = await openQueueDB();
  const item = await db.get(QUEUE_STORE, QUEUE_KEY);
  return !!item;
}

/**
 * Listen for SYNC_SUCCESS messages posted by the service worker
 * after a background sync completes.
 * @param {(data: object) => void} cb
 */
export function onSyncSuccess(cb) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'SYNC_SUCCESS') cb(event.data);
  });
}
