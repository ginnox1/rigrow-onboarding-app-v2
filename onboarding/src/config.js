export const USER_REGISTRY_URL =
  import.meta.env.VITE_USER_REGISTRY_URL ?? '/docs/user_registry.json'

export const AGENT_REGISTRY_URL =
  import.meta.env.VITE_AGENT_REGISTRY_URL ??
  USER_REGISTRY_URL.replace('user_registry.json', 'agent_registry.json')

export const USER_CONFIG_BASE_URL =
  import.meta.env.VITE_USER_CONFIG_BASE_URL ?? '/docs/'

export const CRM_WEBHOOK_URL =
  import.meta.env.VITE_CRM_WEBHOOK_URL ?? 'http://localhost:3001/api/v1/crm/lead'

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

export const PRICING_RATE_BIRR        = 390
export const USSD_CODE                = '*384#'
export const USSD_ENABLED             = false
export const AGENT_MODE_ENABLED       = true
export const AGENT_VERIFY_TTL_DAYS    = 7
export const AGENT_FARMER_CACHE_LIMIT = 100
export const MIN_FARM_HA              = 0.5
export const MAX_FARM_HA              = 100000
