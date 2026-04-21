import { USSD_CODE, USSD_ENABLED } from '../config.js'
import { t } from '../i18n.js'
import { clearFarmerState } from '../storage.js'

export async function renderWelcomeNew(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const ussdBlock = USSD_ENABLED
    ? `<p class="ussd-code">${t('ussd_block', lang, { code: USSD_CODE })}</p>`
    : `<p class="ussd-coming">${t('ussd_coming', lang)}</p>`

  container.innerHTML = `
    <div class="screen screen-welcome-new">
      <div class="success-banner">
        <div class="success-title">✅ ${t('youre_registered', lang)}</div>
        <div class="success-sub">${t('youre_registered_sub', lang)}</div>
      </div>
      ${ussdBlock}
      <p style="font-size:0.9rem;color:var(--muted)">Or download our mobile app</p>
      <button id="download-app-btn" class="btn-secondary">${t('download_app', lang)}</button>

      <hr/>
      <h3>${t('want_farm_advice', lang)}</h3>
      <p>${t('why_stay', lang)}</p>
      <ul>
        <li><span class="badge-free">FREE</span> ${t('savings_calculator', lang)}</li>
        <li><span class="badge-free">FREE</span> ${t('basic_insights', lang)}</li>
      </ul>
      <p>${t('its_all_free', lang)}</p>

      <button id="yes-signup-btn" class="btn-primary">${t('yes_sign_up', lang)}</button>
      <button id="not-now-btn" class="btn-ghost">${t('not_now', lang)}</button>
      ${state?.isAgent ? `<button id="next-farmer-btn" class="btn-secondary">${t('register_next_farmer', lang)}</button>` : ''}
    </div>
  `

  document.getElementById('download-app-btn').addEventListener('click', () => navigate('download'))
  document.getElementById('yes-signup-btn').addEventListener('click', () => navigate('map'))

  document.getElementById('not-now-btn').addEventListener('click', () => {
    if (container.querySelector('.whatsapp-fallback')) return
    const msg = document.createElement('p')
    msg.className = 'whatsapp-fallback'
    msg.textContent = t('whatsapp_fallback', lang)
    container.querySelector('.screen').appendChild(msg)
  })

  document.getElementById('next-farmer-btn')?.addEventListener('click', async () => {
    await clearFarmerState()
    navigate('entry')
  })
}
