import { clearFarmerState } from '../storage.js'
import { t } from '../i18n.js'

export async function renderComplete(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const existingFields = state?.userConfig?.fields?.length ?? 0
  const totalFields = existingFields + 1
  const fieldType = state?.fieldMode === 'pin' ? 'Basic' : 'Precision'

  container.innerHTML = `
    <div class="screen screen-complete">
      <div class="complete-icon">🌱</div>
      <h2>${t('thank_you', lang)}</h2>
      <p>${t('fields_registered', lang, { n: totalFields, type: fieldType })}</p>
      <button id="download-btn" class="btn-secondary">${t('download_app', lang)}</button>
      <button id="ussd-btn" class="btn-ghost" disabled>${t('ussd_coming_soon', lang)}</button>
      <button id="home-btn" class="btn-primary">${t('back_to_home', lang)}</button>
      ${state?.isAgent ? `<button id="next-farmer-btn" class="btn-secondary">${t('register_next_farmer', lang)}</button>` : ''}
    </div>
  `

  container.querySelector('#home-btn').addEventListener('click', () => navigate('home'))

  container.querySelector('#next-farmer-btn')?.addEventListener('click', async () => {
    await clearFarmerState()
    navigate('entry')
  })
}
