const GITHUB_DATA_BASE = 'https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/'

export const USER_REGISTRY_URL =
  import.meta.env.VITE_USER_REGISTRY_URL || (GITHUB_DATA_BASE + 'user_registry.json')

export const AGENT_REGISTRY_URL =
  import.meta.env.VITE_AGENT_REGISTRY_URL || (GITHUB_DATA_BASE + 'agent_registry.json')

export const USER_CONFIG_BASE_URL =
  import.meta.env.VITE_USER_CONFIG_BASE_URL || GITHUB_DATA_BASE

export const CRM_WEBHOOK_URL =
  import.meta.env.VITE_CRM_WEBHOOK_URL ?? 'http://localhost:3001/api/v1/crm/lead'

export const MAPBOX_TOKEN    = import.meta.env.VITE_MAPBOX_TOKEN ?? ''
export const APK_DOWNLOAD_URL = import.meta.env.VITE_APK_DOWNLOAD_URL ?? '/apk-dowbload/RigrowMobileApp.apk'

export const COUNTRY_PRICING = {
  '+251': { rate: Number(import.meta.env.VITE_PRICE_ETB)  || null, currency: 'ETB' },
  '+254': { rate: Number(import.meta.env.VITE_PRICE_KES)  || null, currency: 'KES' },
  '+256': { rate: Number(import.meta.env.VITE_PRICE_UGX)  || null, currency: 'UGX' },
  '+255': { rate: Number(import.meta.env.VITE_PRICE_TZS)  || null, currency: 'TZS' },
  '+250': { rate: Number(import.meta.env.VITE_PRICE_RWF)  || null, currency: 'RWF' },
}

function parseBbox(str) {
  if (!str) return null
  const p = str.split(',').map(Number)
  return (p.length === 4 && p.every(n => !isNaN(n))) ? p : null
}

// Bounding boxes: [latMin, latMax, lngMin, lngMax]
export const COUNTRY_BBOX = {
  '+251': parseBbox(import.meta.env.VITE_BBOX_ETB) ?? [3.4,  14.9, 33.0, 47.9],
  '+254': parseBbox(import.meta.env.VITE_BBOX_KES) ?? [-4.7,  4.6, 33.9, 41.9],
  '+256': parseBbox(import.meta.env.VITE_BBOX_UGX) ?? [-1.5,  4.2, 29.5, 35.0],
  '+255': parseBbox(import.meta.env.VITE_BBOX_TZS) ?? [-11.7,-1.0, 29.3, 40.4],
  '+250': parseBbox(import.meta.env.VITE_BBOX_RWF) ?? [-2.8, -1.0, 28.8, 30.9],
}

export const USSD_CODE                = '*384#'
export const USSD_ENABLED             = false
export const AGENT_MODE_ENABLED       = true
export const AGENT_VERIFY_TTL_DAYS    = 7
export const AGENT_FARMER_CACHE_LIMIT = 100
export const MIN_FARM_HA              = 0.5
export const MAX_FARM_HA              = 100000
