import { getState, saveState } from './storage.js'
import { checkAgentTTL, timeAgo, verifyAgent, revokeAgent } from './agent.js'
import { flushQueue, clearQueue } from './crm.js'

import { renderEntry }      from './screens/screen0-entry.js'
import { renderRegister }   from './screens/screen-register.js'
import { renderWelcomeNew } from './screens/screen-welcome-new.js'
import { renderHome }       from './screens/screen-home.js'
import { renderMap }        from './screens/screen-map.js'
import { renderPricing }    from './screens/screen-pricing.js'
import { renderComplete }   from './screens/screen-complete.js'
import { renderAgentCheck } from './screens/screen-agent-check.js'
import { renderAgentSent }  from './screens/screen-agent-sent.js'
import { renderDownload }   from './screens/screen-download.js'

const SCREENS = {
  entry:         renderEntry,
  register:      renderRegister,
  'welcome-new': renderWelcomeNew,
  home:          renderHome,
  map:           renderMap,
  pricing:       renderPricing,
  complete:      renderComplete,
  'agent-check': renderAgentCheck,
  'agent-sent':  renderAgentSent,
  download:      renderDownload,
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

const THEME_KEY = 'rigrow-theme'
const THEME_CYCLE = { light: 'dark', dark: 'high-contrast', 'high-contrast': 'light' }
const THEME_LABEL = { light: '☀', dark: '🌙', 'high-contrast': '◑' }

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) ?? 'light'
  document.documentElement.dataset.theme = saved

  if (document.getElementById('theme-toggle')) return
  const btn = document.createElement('button')
  btn.id = 'theme-toggle'
  btn.title = 'Switch theme'
  btn.textContent = THEME_LABEL[saved]
  btn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme ?? 'light'
    const next = THEME_CYCLE[current] ?? 'light'
    document.documentElement.dataset.theme = next
    localStorage.setItem(THEME_KEY, next)
    btn.textContent = THEME_LABEL[next]
  })
  document.body.appendChild(btn)
}

const QUEUE_PURGE_KEY = 'queuePurgedV2'

function initFooter() {
  if (document.getElementById('app-footer')) return
  const footer = document.createElement('footer')
  footer.id = 'app-footer'
  footer.innerHTML =
    `Rigrow Onboarding v${__APP_VERSION__} &nbsp;·&nbsp; ` +
    `&copy; Rigrow PLC, 2026 &nbsp;·&nbsp; ` +
    `<a href="https://rigrow.quanomics.com" target="_blank" rel="noopener">rigrow.quanomics.com</a>`
  document.body.appendChild(footer)
}

async function boot() {
  initTheme()
  initFooter()
  await checkAgentTTL(showToast).catch(() => {})
  const state = await getState()
  if (!state?.[QUEUE_PURGE_KEY]) {
    await clearQueue().catch(() => {})
    await saveState({ [QUEUE_PURGE_KEY]: true })
  } else if (navigator.onLine) {
    flushQueue().catch(() => {})
  }
  const screen = state?.screen ?? 'entry'
  navigate(screen)
}

boot()
