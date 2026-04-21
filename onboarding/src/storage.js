import { openDB } from 'idb'

const DB_NAME = 'rigrow-v2'
const DB_VERSION = 2

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('session'))        db.createObjectStore('session')
      if (!db.objectStoreNames.contains('agent_identity')) db.createObjectStore('agent_identity')
      if (!db.objectStoreNames.contains('user_config'))    db.createObjectStore('user_config')
      if (!db.objectStoreNames.contains('user_config_stripped')) db.createObjectStore('user_config_stripped')
      if (!db.objectStoreNames.contains('offline_maps'))   db.createObjectStore('offline_maps', { keyPath: 'filename' })
    }
  })
}

export async function getState() {
  const db = await getDB()
  return (await db.get('session', 'state')) ?? {}
}

export async function saveState(patch) {
  const db = await getDB()
  const current = (await db.get('session', 'state')) ?? {}
  await db.put('session', { ...current, ...patch }, 'state')
}

export async function clearFarmerState() {
  const db = await getDB()
  const current = (await db.get('session', 'state')) ?? {}
  const { isAgent, agentPhone, agentLevel, verifiedAt, language } = current
  await db.put('session', { isAgent, agentPhone, agentLevel, verifiedAt, language }, 'state')
}

export async function getAgentIdentity() {
  const db = await getDB()
  return db.get('agent_identity', 'current')
}

export async function saveAgentIdentity(identity) {
  const db = await getDB()
  await db.put('agent_identity', identity, 'current')
}

export async function clearAgentIdentity() {
  const db = await getDB()
  await db.delete('agent_identity', 'current')
}

export async function getUserConfig(key) {
  const db = await getDB()
  return db.get('user_config', key)
}

export async function saveUserConfig(key, value) {
  const db = await getDB()
  await db.put('user_config', value, key)
}

export async function getStrippedConfig(key) {
  const db = await getDB()
  return db.get('user_config_stripped', key)
}

export async function saveStrippedConfig(key, value, limit) {
  const db = await getDB()
  const all = await db.getAllKeys('user_config_stripped')
  if (all.length >= limit && !all.includes(key)) {
    await db.delete('user_config_stripped', all[0])
  }
  await db.put('user_config_stripped', value, key)
}

export function initDB() {
  return getDB()
}
