import { saveState } from '../storage.js'
import { postLead } from '../crm.js'
import { t } from '../i18n.js'

const ET_REGIONS = [
  'Addis Ababa','Afar','Amhara','Benishangul-Gumuz','Dire Dawa',
  'Gambela','Harari','Oromia','Sidama','Somali','South Ethiopia',
  'Southwest Ethiopia Peoples','Tigray','SNNPR'
]

function locationFields(prefix, lang) {
  if (prefix === '+251') {
    return `
      <label>${t('region_label', lang)}
        <select id="region-select" required>
          <option value="">— Select —</option>
          ${ET_REGIONS.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </label>
      <label>${t('woreda_label', lang)}<input id="woreda-input" type="text" required /></label>
    `
  }
  if (prefix === '+254') {
    return `
      <label>${t('county_label', lang)}<input id="county-input" type="text" required /></label>
      <label>${t('sublocation_label', lang)}<input id="sublocation-input" type="text" required /></label>
    `
  }
  return `<label>${t('location_label', lang)}<input id="location-input" type="text" required /></label>`
}

export async function renderRegister(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const prefix = state?.phonePrefix ?? '+251'

  container.innerHTML = `
    <div class="screen screen-register">
      <button class="btn-back">${t('back', lang)}</button>
      <h2>${t('tell_us', lang)}</h2>
      <label>${t('name_label', lang)}<input id="name-input" type="text" required /></label>
      ${locationFields(prefix, lang)}
      <div id="reg-error" class="error-text hidden"></div>
      <button id="register-btn" class="btn-primary">${t('register', lang)}</button>
    </div>
  `

  container.querySelector('.btn-back').addEventListener('click', () => navigate('entry'))

  document.getElementById('register-btn').addEventListener('click', async () => {
    const name = document.getElementById('name-input')?.value.trim()
    const errorEl = document.getElementById('reg-error')

    let region = '', woreda = ''
    if (prefix === '+251') {
      region = document.getElementById('region-select')?.value
      woreda = document.getElementById('woreda-input')?.value.trim()
      if (!name || !region || !woreda) {
        errorEl.textContent = 'Please fill in all fields'
        errorEl.classList.remove('hidden')
        return
      }
    } else if (prefix === '+254') {
      region = document.getElementById('county-input')?.value.trim()
      woreda = document.getElementById('sublocation-input')?.value.trim()
      if (!name || !region || !woreda) {
        errorEl.textContent = 'Please fill in all fields'
        errorEl.classList.remove('hidden')
        return
      }
    } else {
      region = document.getElementById('location-input')?.value.trim()
      if (!name || !region) {
        errorEl.textContent = 'Please fill in all fields'
        errorEl.classList.remove('hidden')
        return
      }
    }
    errorEl.classList.add('hidden')

    const via = state?.agentPhone ?? 'self'
    await saveState({ name, region, woreda })
    await postLead({ phone: state.phone, name, region, woreda, language: lang, via })
    navigate('welcome-new')
  })
}
