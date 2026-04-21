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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // If the DB already exists at v2 this won't fire; if somehow it doesn't
    // exist yet we create the store so this module works standalone.
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'filename' });
      }
    };
  });
}

function idbPut(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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
  const db = await openDB();
  await idbPut(db, metadata);
  db.close();

  return metadata;
}

/**
 * Return all map metadata records from IDB.
 * @returns {Promise<Array>}
 */
export async function listLocalMaps() {
  try {
    const db = await openDB();
    const records = await idbGetAll(db);
    db.close();
    return records;
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
  const db = await openDB();
  await idbDelete(db, filename);
  db.close();
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
