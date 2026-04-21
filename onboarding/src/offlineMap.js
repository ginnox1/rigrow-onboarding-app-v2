/**
 * offlineMap.js — OPFS + IDB helpers for offline PMTiles map support
 *
 * SW-compatible: uses raw indexedDB API (not the idb npm library).
 * Opens rigrow-v2 DB at version 2 (offline_maps store must exist).
 */

const DB_NAME = 'rigrow-v2';
const DB_VERSION = 2;
const STORE_NAME = 'offline_maps';

// ---------------------------------------------------------------------------
// IDB helpers
// ---------------------------------------------------------------------------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ---------------------------------------------------------------------------
// OPFS helpers
// ---------------------------------------------------------------------------

async function getMapsDir(create = true) {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('maps', { create });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write a PMTiles File to OPFS and save metadata to IDB.
 * @param {File} file
 * @returns {Promise<{ regionId: string, filename: string, importedAt: string, sizeBytes: number }>}
 */
export async function importPMTiles(file) {
  try {
    // 1. Write to OPFS
    const mapsDir = await getMapsDir(true);
    const fileHandle = await mapsDir.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    const buffer = await file.arrayBuffer();
    await writable.write(buffer);
    await writable.close();

    // 2. Build metadata
    const filenameWithoutExt = file.name.replace(/\.[^.]+$/, '');
    const metadata = {
      regionId: filenameWithoutExt,
      filename: file.name,
      importedAt: new Date().toISOString(),
      sizeBytes: file.size,
    };

    // 3. Save metadata to IDB
    await idbPut(metadata);

    return metadata;
  } catch (err) {
    // Best-effort cleanup of partial OPFS file
    try {
      const mapsDir = await getMapsDir(false);
      await mapsDir.removeEntry(file.name);
    } catch {
      // Swallow cleanup errors
    }
    throw err;
  }
}

/**
 * Return all map metadata records from IDB.
 * @returns {Promise<Array>}
 */
export async function listLocalMaps() {
  try {
    return await idbGetAll();
  } catch {
    return [];
  }
}

/**
 * Delete a map file from OPFS and its metadata from IDB.
 * @param {string} filename
 */
export async function deleteLocalMap(filename) {
  // Remove from OPFS
  try {
    const mapsDir = await getMapsDir(false);
    await mapsDir.removeEntry(filename);
  } catch {
    // File may not exist; continue to clean up IDB regardless
  }

  // Remove from IDB
  await idbDelete(filename);
}

/**
 * Retrieve a File object from OPFS for the given filename.
 * @param {string} filename
 * @returns {Promise<File|null>}
 */
export async function getMapSource(filename) {
  try {
    const mapsDir = await getMapsDir(false);
    const fileHandle = await mapsDir.getFileHandle(filename);
    return fileHandle.getFile();
  } catch {
    return null;
  }
}
