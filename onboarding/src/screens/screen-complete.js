import { clearFarmerState, saveState } from '../storage.js'
import { t } from '../i18n.js'

export async function renderComplete(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const existingFields = state?.userConfig?.fields?.length ?? 0
  const totalFields = existingFields + 1
  const fieldType = state?.fieldMode === 'pin' ? 'Basic' : 'Precision'

  container.innerHTML = `
    <div class="screen screen-complete">
      <img src="/assets/logo.png" alt="Rigrow" class="complete-logo" />
      <h2>${t('thank_you', lang)}</h2>
      <p>${t('fields_registered', lang, { n: totalFields, type: fieldType })}</p>
      <p class="hint-text">${t('field_sync_note', lang)}</p>
      <button id="home-btn" class="btn-primary">${t('view_my_fields', lang)}</button>
      <button id="download-btn" class="btn-secondary">${t('download_app', lang)}</button>
      <button id="ussd-btn" class="btn-ghost" disabled>${t('ussd_coming_soon', lang)}</button>
      ${state?.isAgent ? `<button id="next-farmer-btn" class="btn-secondary">${t('register_next_farmer', lang)}</button>` : ''}
    </div>
  `

  container.querySelector('#home-btn').addEventListener('click', async () => {
    const upgradeName = state?.upgradeField?.name
    const newField = {
      id: `pending-${Date.now()}`,
      name: upgradeName ? `${upgradeName}-UPG` : (state?.crop || 'New Field'),
      A: state?.hectares ?? 0,
      registrationType: state?.fieldMode ?? 'pin',
      pending: true,
      crmQueueKey: state?.crmQueueKey ?? null,
    }
    const currentFields = state?.userConfig?.fields ?? []
    const updatedConfig = {
      ...(state?.userConfig ?? {}),
      fields: [...currentFields, newField],
    }
    await saveState({ userConfig: updatedConfig, upgradeField: null })
    navigate('home')
  })

  container.querySelector('#download-btn').addEventListener('click', () => navigate('download'))

  container.querySelector('#next-farmer-btn')?.addEventListener('click', async () => {
    await clearFarmerState()
    navigate('entry')
  })
}
