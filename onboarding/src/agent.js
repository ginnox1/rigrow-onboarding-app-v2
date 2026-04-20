import { AGENT_REGISTRY_URL, AGENT_VERIFY_TTL_DAYS } from './config.js'
import { getAgentIdentity, saveAgentIdentity, clearAgentIdentity, saveState, getState } from './storage.js'
import { normalisePhone } from './userLookup.js'

export async function fetchAgentRegistry() {
  const resp = await fetch(AGENT_REGISTRY_URL, { cache: 'no-store' })
  if (!resp.ok) throw new Error('agent_registry_unavailable')
  return resp.json()
}

export async function verifyAgent(phone) {
  const registry = await fetchAgentRegistry()
  const variants = normalisePhone(phone)
  for (const v of variants) {
    if (registry[v]) {
      const identity = { phone, agentLevel: registry[v], verifiedAt: new Date().toISOString(), cachedAt: new Date().toISOString() }
      await saveAgentIdentity(identity)
      await saveState({ isAgent: true, agentPhone: phone, agentLevel: registry[v], verifiedAt: identity.verifiedAt })
      return identity
    }
  }
  return null
}

export async function revokeAgent() {
  await clearAgentIdentity()
  const state = await getState()
  await saveState({ ...state, isAgent: false, agentPhone: null, agentLevel: null, verifiedAt: null })
}

export async function checkAgentTTL(toastFn = () => {}) {
  const identity = await getAgentIdentity()
  if (!identity) return
  const ageMs = Date.now() - new Date(identity.verifiedAt).getTime()
  const ttlMs = AGENT_VERIFY_TTL_DAYS * 24 * 60 * 60 * 1000
  if (ageMs < ttlMs) return  // still valid

  if (!navigator.onLine) {
    toastFn('Agent verification is overdue. Please reconnect to re-verify.')
    return
  }

  // Online + expired: re-verify silently
  const result = await verifyAgent(identity.phone).catch(() => null)
  if (!result) await revokeAgent()
}

export function timeAgo(isoString) {
  const ms = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
