import { saveState } from '../storage.js'
import { postLead } from '../crm.js'
import { t } from '../i18n.js'
import { searchWoredas, getCoords } from '../localeSearch.js'

const ET_REGIONS = [
  'Addis Ababa','Afar','Amhara','Benishangul-Gumuz','Dire Dawa',
  'Gambela','Harari','Oromia','Sidama','Somali','South Ethiopia',
  'Southwest Ethiopia Peoples','Tigray','SNNPR'
]

const PREFIX_TO_ISO = {
  '+251': 'et', '+254': 'ke', '+256': 'ug', '+255': 'tz', '+250': 'rw'
}

function locationFields(prefix, lang, state) {
  const savedRegion = state?.region ?? ''
  const savedWoreda = state?.woreda ?? ''
  if (prefix === '+251') {
    return `
      <label>${t('region_label', lang)}
        <select id="region-select" required>
          <option value="">— Select —</option>
          ${ET_REGIONS.map(r => `<option value="${r}"${r === savedRegion ? ' selected' : ''}>${r}</option>`).join('')}
        </select>
      </label>
      <label>${t('woreda_label', lang)}
        <div class="autocomplete-wrap">
          <input id="woreda-input" type="text" autocomplete="off" required value="${savedWoreda}" />
          <div class="autocomplete-list hidden" id="woreda-ac"></div>
        </div>
      </label>
    `
  }
  if (prefix === '+254') {
    return `
      <label>${t('county_label', lang)}
        <div class="autocomplete-wrap">
          <input id="county-input" type="text" autocomplete="off" required value="${savedRegion}" />
          <div class="autocomplete-list hidden" id="county-ac"></div>
        </div>
      </label>
      <label>${t('sublocation_label', lang)}
        <div class="autocomplete-wrap">
          <input id="sublocation-input" type="text" autocomplete="off" required value="${savedWoreda}" />
          <div class="autocomplete-list hidden" id="sublocation-ac"></div>
        </div>
      </label>
    `
  }
  return `
    <label>${t('location_label', lang)}
      <div class="autocomplete-wrap">
        <input id="location-input" type="text" autocomplete="off" required value="${savedRegion}" />
        <div class="autocomplete-list hidden" id="location-ac"></div>
      </div>
    </label>
  `
}

function attachAutocomplete(inputEl, listEl, buildQuery, iso, onSelect, lang = 'en', onChange) {
  let activeIdx = -1
  let debounceTimer = null
  let _items = []

  function renderList(items) {
    _items = items
    if (!items.length) { listEl.classList.add('hidden'); return }
    activeIdx = -1
    listEl.innerHTML = items
      .map((it, i) => `<div class="autocomplete-item" data-idx="${i}">${it.name}</div>`)
      .join('')
    listEl.classList.remove('hidden')
  }

  function selectItem(item) {
    inputEl.value = item.name                  // display in user's language
    inputEl.dataset.canonical = item.canonical  // English name for CRM
    listEl.classList.add('hidden')
    activeIdx = -1
    onSelect?.(item)
    onChange?.()
  }

  function highlight(idx) {
    const items = listEl.querySelectorAll('.autocomplete-item')
    items.forEach((el, i) => el.classList.toggle('ac-active', i === idx))
    activeIdx = idx
  }

  inputEl.addEventListener('input', () => {
    inputEl.dataset.canonical = ''  // invalidate selection when user types
    onChange?.()
    clearTimeout(debounceTimer)
    const query = inputEl.value.trim()
    if (query.length < 2) { listEl.classList.add('hidden'); return }
    debounceTimer = setTimeout(async () => {
      const results = await searchWoredas(query, iso, buildQuery(), lang)
      renderList(results)
    }, 200)
  })

  inputEl.addEventListener('keydown', e => {
    const items = listEl.querySelectorAll('.autocomplete-item')
    if (!items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      highlight(Math.min(activeIdx + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlight(Math.max(activeIdx - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      selectItem(_items[activeIdx])
    } else if (e.key === 'Escape') {
      listEl.classList.add('hidden')
    }
  })

  listEl.addEventListener('mousedown', e => {
    const el = e.target.closest('.autocomplete-item')
    if (el) selectItem(_items[parseInt(el.dataset.idx)])
  })

  inputEl.addEventListener('blur', () => {
    setTimeout(() => listEl.classList.add('hidden'), 150)
  })

  inputEl.addEventListener('focus', () => {
    if (listEl.children.length) listEl.classList.remove('hidden')
  })
}

export async function renderRegister(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const prefix = state?.phonePrefix ?? '+251'
  const iso = PREFIX_TO_ISO[prefix] ?? 'et'

  container.innerHTML = `
    <div class="screen screen-register">
      <button class="btn-back">${t('back', lang)}</button>
      <h2>${t('tell_us', lang)}</h2>
      <label>${t('name_label', lang)}<input id="name-input" type="text" required value="${state?.name ?? ''}" /></label>
      ${locationFields(prefix, lang, state)}
      <div id="reg-error" class="error-text hidden"></div>
      <button id="register-btn" class="btn-primary">${t('register', lang)}</button>
    </div>
  `

  container.querySelector('.btn-back').addEventListener('click', () => navigate('entry'))

  let localeCoords = state?.localeCoords ?? null

  const onSelect = item => {
    if (item.lat != null && item.lon != null) {
      localeCoords = { lat: item.lat, lon: item.lon }
      saveState({ localeCoords })
    }
  }

  const registerBtn = document.getElementById('register-btn')

  function validate() {
    const nameOk = !!document.getElementById('name-input')?.value.trim()
    let locationOk = false
    if (prefix === '+251') {
      const regionOk = !!document.getElementById('region-select')?.value
      const woredaOk = !!document.getElementById('woreda-input')?.dataset.canonical
      locationOk = regionOk && woredaOk
    } else if (prefix === '+254') {
      locationOk = !!document.getElementById('county-input')?.dataset.canonical &&
                   !!document.getElementById('sublocation-input')?.dataset.canonical
    } else {
      locationOk = !!document.getElementById('location-input')?.dataset.canonical
    }
    registerBtn.disabled = !(nameOk && locationOk)
  }

  // Restore canonical from saved state so button enables correctly on back-nav
  if (prefix === '+251' && state?.woreda) {
    const woredaInput = document.getElementById('woreda-input')
    if (woredaInput && !woredaInput.dataset.canonical) woredaInput.dataset.canonical = state.woreda
  }

  document.getElementById('name-input')?.addEventListener('input', validate)
  if (prefix === '+251') document.getElementById('region-select')?.addEventListener('change', validate)

  // Wire autocomplete for each country layout
  if (prefix === '+251') {
    const woredaInput = document.getElementById('woreda-input')
    const woredaAc = document.getElementById('woreda-ac')
    const regionSelect = document.getElementById('region-select')
    attachAutocomplete(woredaInput, woredaAc, () => regionSelect.value, iso, onSelect, lang, validate)
  } else if (prefix === '+254') {
    const countyInput = document.getElementById('county-input')
    const countyAc = document.getElementById('county-ac')
    attachAutocomplete(countyInput, countyAc, () => null, iso, onSelect, lang, validate)

    const subInput = document.getElementById('sublocation-input')
    const subAc = document.getElementById('sublocation-ac')
    attachAutocomplete(subInput, subAc, () => countyInput.value.trim(), iso, onSelect, lang, validate)
  } else {
    const locInput = document.getElementById('location-input')
    const locAc = document.getElementById('location-ac')
    attachAutocomplete(locInput, locAc, () => null, iso, onSelect, lang, validate)
  }

  validate() // set initial button state

  document.getElementById('register-btn').addEventListener('click', async () => {
    const name = document.getElementById('name-input')?.value.trim()
    const errorEl = document.getElementById('reg-error')

    if (!state?.phone) { navigate('entry'); return }

    let region = '', woreda = ''
    if (prefix === '+251') {
      region = document.getElementById('region-select')?.value
      const woredaEl = document.getElementById('woreda-input')
      woreda = woredaEl?.dataset.canonical || woredaEl?.value.trim()
      if (!name || !region || !woreda) {
        errorEl.textContent = 'Please fill in all fields'
        errorEl.classList.remove('hidden')
        return
      }
    } else if (prefix === '+254') {
      const countyEl = document.getElementById('county-input')
      const subEl = document.getElementById('sublocation-input')
      region = countyEl?.dataset.canonical || countyEl?.value.trim()
      woreda = subEl?.dataset.canonical || subEl?.value.trim()
      if (!name || !region || !woreda) {
        errorEl.textContent = 'Please fill in all fields'
        errorEl.classList.remove('hidden')
        return
      }
    } else {
      const locEl = document.getElementById('location-input')
      region = locEl?.dataset.canonical || locEl?.value.trim()
      if (!name || !region) {
        errorEl.textContent = 'Please fill in all fields'
        errorEl.classList.remove('hidden')
        return
      }
    }
    errorEl.classList.add('hidden')

    registerBtn.disabled = true
    registerBtn.classList.add('btn-loading')
    const via = state?.agentPhone ?? 'self'
    try {
      if (!localeCoords && woreda) localeCoords = await getCoords(woreda)
      await saveState({ name, region, woreda })
      await postLead({ phone: state.phone, name, region, woreda, language: lang, via, localeCoords })
      navigate('welcome-new')
    } catch (err) {
      registerBtn.classList.remove('btn-loading')
      registerBtn.disabled = false
      errorEl.classList.remove('hidden')
      errorEl.textContent = 'Something went wrong. Please try again.'
    }
  })
}
