import { getState, saveState } from './storage.js'
import { checkAgentTTL, timeAgo, verifyAgent, revokeAgent } from './agent.js'
import { flushQueue } from './crm.js'

import { renderEntry }      from './screens/screen0-entry.js'
import { renderRegister }   from './screens/screen-register.js'
import { renderWelcomeNew } from './screens/screen-welcome-new.js'
import { renderHome }       from './screens/screen-home.js'
import { renderMap }        from './screens/screen-map.js'
import { renderPricing }    from './screens/screen-pricing.js'
import { renderComplete }   from './screens/screen-complete.js'
import { renderAgentCheck } from './screens/screen-agent-check.js'

const SCREENS = {
  entry:         renderEntry,
  register:      renderRegister,
  'welcome-new': renderWelcomeNew,
  home:          renderHome,
  map:           renderMap,
  pricing:       renderPricing,
  complete:      renderComplete,
  'agent-check': renderAgentCheck,
}

const app = document.getElementById('app')

async function navigate(screenName) {
  await saveState({ screen: screenName })
  const state = await getState()
  renderAgentBanner(state)
  const renderer = SCREENS[screenName]
  if (!renderer) { console.error('Unknown screen:', screenName); return }
  app.innerHTML = ''
  await renderer(app, state, navigate)
}

function renderAgentBanner(state) {
  const existing = document.getElementById('agent-banner')
  if (existing) existing.remove()
  if (!state?.isAgent) return

  const banner = document.createElement('div')
  banner.id = 'agent-banner'
  const span = document.createElement('span')
  span.textContent = `👤 Agent: ${state.agentPhone} · Verified ${timeAgo(state.verifiedAt)}`
  const syncBtn = document.createElement('button')
  syncBtn.id = 'agent-sync-btn'
  syncBtn.title = 'Re-verify'
  syncBtn.textContent = '↻'
  banner.appendChild(span)
  banner.appendChild(syncBtn)
  document.body.prepend(banner)
  document.getElementById('agent-sync-btn').addEventListener('click', async () => {
    const btn = document.getElementById('agent-sync-btn')
    btn.textContent = '⟳'
    const result = await verifyAgent(state.agentPhone).catch(() => null)
    if (!result) {
      await revokeAgent()
      showToast('Agent access revoked.')
      navigate('entry')
    } else {
      showToast('Agent access confirmed.')
      const fresh = await getState()
      renderAgentBanner(fresh)
    }
  })
}

export function showToast(msg, duration = 3000) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), duration)
}

async function boot() {
  await checkAgentTTL(showToast).catch(() => {})
  if (navigator.onLine) flushQueue().catch(() => {})
  const state = await getState()
  const screen = state?.screen ?? 'entry'
  navigate(screen)
}

boot()
