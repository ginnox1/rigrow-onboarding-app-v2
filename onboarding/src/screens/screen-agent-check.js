import { verifyAgent } from '../agent.js'
import { t } from '../i18n.js'

const PREFIXES = [
  { code: '+251', label: 'ET +251' },
  { code: '+254', label: 'KE +254' },
  { code: '+256', label: 'UG +256' },
  { code: '+255', label: 'TZ +255' },
  { code: '+250', label: 'RW +250' },
]

export async function renderAgentCheck(container, state, navigate) {
  const lang = state?.language ?? 'en'

  container.innerHTML = `
    <div class="screen screen-agent-check">
      <button class="btn-back">${t('back', lang)}</button>
      <h2>${t('agent_access', lang)}</h2>
      <div class="phone-row">
        <select id="prefix-select">
          ${PREFIXES.map(p => `<option value="${p.code}">${p.label}</option>`).join('')}
        </select>
        <input id="phone-input" type="tel" inputmode="numeric" placeholder="9-digit number" maxlength="9" />
      </div>
      <div id="agent-error" class="error-text hidden"></div>
      <button id="check-btn" class="btn-primary">${t('check_access', lang)}</button>
    </div>
  `

  container.querySelector('.btn-back').addEventListener('click', () => navigate('entry'))

  container.querySelector('#check-btn').addEventListener('click', async () => {
    const errorEl = container.querySelector('#agent-error')
    const local = container.querySelector('#phone-input').value.trim()
    const prefix = container.querySelector('#prefix-select').value

    if (!/^\d{9}$/.test(local)) {
      errorEl.textContent = t('invalid_phone', lang)
      errorEl.classList.remove('hidden')
      return
    }

    if (!navigator.onLine) {
      errorEl.textContent = t('no_connection', lang)
      errorEl.classList.remove('hidden')
      return
    }

    errorEl.classList.add('hidden')
    const phone = prefix + local

    try {
      const identity = await verifyAgent(phone)
      if (!identity) {
        errorEl.textContent = t('agent_denied', lang)
        errorEl.classList.remove('hidden')
        container.querySelector('#check-btn').remove()
        return
      }
      navigate('entry')
    } catch {
      errorEl.textContent = t('no_connection', lang)
      errorEl.classList.remove('hidden')
    }
  })
}
