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

export async function fetchUserConfig(phone, forceRefresh = false) {
  const cacheKey = 'user_registry'
  let registry = await getUserConfig(cacheKey)
  let registryCachedAt = await getUserConfig(cacheKey + '_cachedAt')

  const registryCachedUrl = await getUserConfig(cacheKey + '_url')
  const registryStale = !registry || !registryCachedAt ||
    Date.now() - registryCachedAt > REGISTRY_CACHE_MS ||
    registryCachedUrl !== USER_REGISTRY_URL
  if (registryStale || forceRefresh) {
    try {
      const resp = await fetch(USER_REGISTRY_URL)
      if (resp.ok) {
        registry = await resp.json()
        await saveUserConfig(cacheKey, registry)
        await saveUserConfig(cacheKey + '_cachedAt', Date.now())
        await saveUserConfig(cacheKey + '_url', USER_REGISTRY_URL)
      }
    } catch (_) {}
    if (!registry) return null
  }

  const variants = normalisePhone(phone)
  let userId = null
  for (const v of variants) {
    if (registry[v]) { userId = registry[v]; break }
  }
  if (!userId) return null

  let config = await getUserConfig(userId)
  if (!config || forceRefresh) {
    try {
      const resp = await fetch(USER_CONFIG_BASE_URL + userId + '/user_config.json')
      if (resp.ok) {
        config = await resp.json()
        await saveUserConfig(userId, config)
      }
    } catch (_) {}
    // Return cached version if fetch failed (offline fallback)
    if (!config) return null
  }
  return config
}

export async function fetchUserConfigStripped(phone) {
  const variants = normalisePhone(phone)
  for (const v of variants) {
    const cached = await getStrippedConfig(v)
    if (cached) return cached
  }

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

  const cfgResp = await fetch(USER_CONFIG_BASE_URL + userId + '/user_config.json')
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
