import { USER_REGISTRY_URL, USER_CONFIG_BASE_URL, AGENT_FARMER_CACHE_LIMIT } from './config.js'
import { saveUserConfig, getUserConfig, saveStrippedConfig, getStrippedConfig } from './storage.js'

const REGISTRY_CACHE_MS = 24 * 60 * 60 * 1000

const PREFIXES = ['+251', '+254', '+256', '+255', '+250']

export function normalisePhone(phone) {
  const digits = phone.replace(/^\+\d{3}/, '').replace(/^0/, '').replace(/\D/g, '')
  const variants = new Set()
  for (const prefix of PREFIXES) {
    variants.add(prefix + digits)
  }
  variants.add('0' + digits)
  variants.add(phone)
  return [...variants]
}

export async function fetchUserConfig(phone) {
  const cacheKey = 'user_registry'
  let registry = await getUserConfig(cacheKey)
  let registryCachedAt = await getUserConfig(cacheKey + '_cachedAt')

  if (!registry || !registryCachedAt || Date.now() - registryCachedAt > REGISTRY_CACHE_MS) {
    const resp = await fetch(USER_REGISTRY_URL)
    if (!resp.ok) throw new Error('registry_unavailable')
    registry = await resp.json()
    await saveUserConfig(cacheKey, registry)
    await saveUserConfig(cacheKey + '_cachedAt', Date.now())
  }

  const variants = normalisePhone(phone)
  let userId = null
  for (const v of variants) {
    if (registry[v]) { userId = registry[v]; break }
  }
  if (!userId) return null

  let config = await getUserConfig(userId)
  if (!config) {
    const resp = await fetch(USER_CONFIG_BASE_URL + userId + '.json')
    if (!resp.ok) return null
    config = await resp.json()
    await saveUserConfig(userId, config)
  }
  return config
}

export async function fetchUserConfigStripped(phone) {
  const variants = normalisePhone(phone)
  // Try stripped cache first
  for (const v of variants) {
    const cached = await getStrippedConfig(v)
    if (cached) return cached
  }

  // Reuse the 24h registry cache (same as fetchUserConfig)
  const cacheKey = 'user_registry'
  let registry = await getUserConfig(cacheKey)
  let registryCachedAt = await getUserConfig(cacheKey + '_cachedAt')

  if (!registry || !registryCachedAt || Date.now() - registryCachedAt > REGISTRY_CACHE_MS) {
    const resp = await fetch(USER_REGISTRY_URL)
    if (!resp.ok) return null
    registry = await resp.json()
    await saveUserConfig(cacheKey, registry)
    await saveUserConfig(cacheKey + '_cachedAt', Date.now())
  }

  let userId = null
  for (const v of variants) {
    if (registry[v]) { userId = registry[v]; break }
  }
  if (!userId) return null

  const cfgResp = await fetch(USER_CONFIG_BASE_URL + userId + '.json')
  if (!cfgResp.ok) return null
  const full = await cfgResp.json()

  const stripped = {
    userId: full.userId,
    phoneNr: full.phoneNr,
    language: full.language,
    calendarType: full.calendarType,
    datePickerType: full.datePickerType,
    fields: (full.fields ?? []).map(f => ({
      id: f.id, name: f.name, A: f.A, registrationType: f.registrationType
    }))
  }

  await saveStrippedConfig(phone, stripped, AGENT_FARMER_CACHE_LIMIT)
  return stripped
}
