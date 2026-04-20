import { t } from '../i18n.js'
import { saveState } from '../storage.js'

export async function renderHome(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const name = state?.userConfig?.name ?? state?.name ?? ''
  const fields = state?.userConfig?.fields ?? []

  const regType = fields[0]?.registrationType ?? 'boundary'
  let ctaButtons = ''
  if (fields.length === 0) {
    ctaButtons = `
      <button id="pin-btn" class="btn-secondary">${t('pin_your_farm', lang)}</button>
      <button id="bound-btn" class="btn-primary">${t('bound_your_farm', lang)}</button>
    `
  } else if (regType === 'pin') {
    ctaButtons = `<button id="pin-btn" class="btn-secondary">${t('add_another_pin', lang)}</button>`
  } else {
    ctaButtons = `<button id="bound-btn" class="btn-primary">${t('add_another_boundary', lang)}</button>`
  }

  const fieldCards = fields.length === 0
    ? `<p class="empty-state">${t('no_fields_yet', lang)}</p>`
    : fields.map(f => `
        <div class="field-card">
          <div>
            <strong>${f.name}</strong>
            <span>${f.A} Ha</span>
          </div>
          <form method="POST" action="https://rigrow-calc.quanomics.com" target="_blank">
            <input type="hidden" name="farm_size" value="${f.A}">
            <input type="hidden" name="crop" value="${f.crop ?? ''}">
            <button type="submit" class="btn-calc">${t('calculator', lang)}</button>
          </form>
        </div>
      `).join('')

  container.innerHTML = `
    <div class="screen screen-home">
      <h2>${t('welcome_back', lang, { name })}</h2>
      <div class="fields-list">${fieldCards}</div>
      <p class="teaser">Unlock field-level insights</p>
      <div class="cta-group">${ctaButtons}</div>
    </div>
  `

  container.querySelector('#pin-btn')?.addEventListener('click', async () => {
    await saveState({ fieldMode: 'pin' })
    navigate('map')
  })
  container.querySelector('#bound-btn')?.addEventListener('click', async () => {
    await saveState({ fieldMode: 'boundary' })
    navigate('map')
  })
}
