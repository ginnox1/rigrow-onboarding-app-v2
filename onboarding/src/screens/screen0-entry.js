import { saveState } from '../storage.js'
import { fetchUserConfig } from '../userLookup.js'
import { t, LANGUAGES } from '../i18n.js'

const PREFIXES = [
  { code: '+251', label: 'ET +251', langMatch: ['am', 'om'] },
  { code: '+254', label: 'KE +254' },
  { code: '+256', label: 'UG +256' },
  { code: '+255', label: 'TZ +255' },
  { code: '+250', label: 'RW +250' },
]

function defaultPrefix(lang) {
  return (lang === 'am' || lang === 'om') ? '+251' : '+254'
}

export async function renderEntry(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const prefix = state?.phonePrefix ?? defaultPrefix(lang)

  container.innerHTML = `
    <div class="screen screen-entry">
      <img src="/assets/logo.png" alt="Rigrow" class="logo-img" />
      <div class="lang-toggle">
        ${LANGUAGES.map(l => `<button class="lang-btn${l.code === lang ? ' active' : ''}" data-lang="${l.code}">${l.label}</button>`).join('')}
      </div>
      <div class="phone-row">
        <select id="prefix-select">
          ${PREFIXES.map(p => `<option value="${p.code}"${p.code === prefix ? ' selected' : ''}>${p.label}</option>`).join('')}
        </select>
        <input id="phone-input" type="tel" inputmode="numeric" placeholder="9-digit number" maxlength="9" value="${state?.localPhone ?? ''}" />
      </div>
      <div id="phone-error" class="error-text hidden"></div>
      <button id="continue-btn" class="btn-primary" disabled>${t('continue', lang)}</button>
      <button id="agent-btn" class="btn-ghost">${t('i_am_agent', lang)}</button>
    </div>
  `

  const phoneInput = container.querySelector('#phone-input')
  const continueBtn = container.querySelector('#continue-btn')
  function updateContinueBtn() {
    continueBtn.disabled = !/^\d{9}$/.test(phoneInput.value.trim())
  }
  phoneInput.addEventListener('input', updateContinueBtn)
  updateContinueBtn()

  container.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newLang = btn.dataset.lang
      const newPrefix = defaultPrefix(newLang)
      await saveState({ language: newLang, phonePrefix: newPrefix })
      renderEntry(container, { ...state, language: newLang, phonePrefix: newPrefix }, navigate)
    })
  })

  document.getElementById('continue-btn').addEventListener('click', async () => {
    const selectedPrefix = document.getElementById('prefix-select').value
    const local = document.getElementById('phone-input').value.trim()
    const errorEl = document.getElementById('phone-error')

    if (!/^\d{9}$/.test(local)) {
      errorEl.textContent = 'Please enter a valid 9-digit phone number'
      errorEl.classList.remove('hidden')
      return
    }
    errorEl.classList.add('hidden')

    const phone = selectedPrefix + local
    await saveState({ phone, localPhone: local, phonePrefix: selectedPrefix })

    if (!navigator.onLine) {
      errorEl.textContent = t('no_connection', lang)
      errorEl.classList.remove('hidden')
      return
    }

    try {
      const userConfig = await fetchUserConfig(phone)
      if (userConfig) {
        await saveState({ userConfig, isRegistered: true, name: userConfig.name })
        navigate('home')
      } else {
        navigate('register')
      }
    } catch {
      errorEl.textContent = t('no_connection', lang)
      errorEl.classList.remove('hidden')
    }
  })

  document.getElementById('agent-btn').addEventListener('click', () => navigate('agent-check'))
}
