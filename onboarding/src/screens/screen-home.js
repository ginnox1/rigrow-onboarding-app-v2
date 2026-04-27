import { t } from '../i18n.js'
import { saveState } from '../storage.js'
import { fetchUserConfig } from '../userLookup.js'

const CALC_URL = 'https://rigrow-calc.quanomics.com'

function cropFromName(name = '') {
  const lastWord = name.trim().split(/\s+/).pop() || ''
  return lastWord.split('-').pop() || lastWord
}

export async function renderHome(container, state, navigate) {
  const lang = state?.language ?? 'en'

  function render(userConfig) {
    const name = userConfig?.name ?? state?.name ?? ''
    const fields = userConfig?.fields ?? []

    const fieldCards = fields.length === 0
      ? `<p class="empty-state">${t('no_fields_yet', lang)}</p>`
      : fields.map(f => {
          const crop = cropFromName(f.name)
          const params = new URLSearchParams({ hectares: f.A, crop })
          const calcUrl = `${CALC_URL}?${params}`
          const pendingBadge = f.pending
            ? `<span class="field-pending-badge">Syncing…</span>`
            : ''
          return `
            <div class="field-card${f.pending ? ' field-card-pending' : ''}">
              <div class="field-info">
                <strong>${f.name ?? 'Field'}</strong>
                <span>${f.A} Ha</span>
                ${pendingBadge}
              </div>
              <a href="${calcUrl}" target="_blank" rel="noopener noreferrer" class="btn-calc">${t('calculator', lang)}</a>
            </div>
          `
        }).join('')

    container.innerHTML = `
      <div class="screen screen-home">
        <h2>${t('welcome_back', lang, { name })}</h2>
        <div class="fields-list">${fieldCards}</div>
        <p class="teaser">Unlock field-level insights</p>
        <div class="cta-group">
          <button id="add-farm-btn" class="btn-primary">+ Add a Farm</button>
        </div>
      </div>
    `

    container.querySelector('#add-farm-btn').addEventListener('click', async () => {
      await saveState({ fieldMode: null })
      navigate('map')
    })
  }

  render(state?.userConfig)

  if (state?.phone && navigator.onLine) {
    fetchUserConfig(state.phone, true).then(async fresh => {
      if (!fresh) return
      // Preserve optimistic pending fields not yet reflected on the server
      const pending = (state?.userConfig?.fields ?? []).filter(f => f.pending)
      if (pending.length) {
        const serverFields = fresh.fields ?? []
        const isMatch = (s, p) =>
          cropFromName(s.name).toLowerCase() === cropFromName(p.name).toLowerCase() &&
          Math.abs((s.A ?? 0) - (p.A ?? 0)) < 0.15
        // Carry registrationType from matched pending field onto its server counterpart
        const mergedServer = serverFields.map(s => {
          const matched = pending.find(p => isMatch(s, p))
          return matched ? { ...s, registrationType: matched.registrationType } : s
        })
        const stillPending = pending.filter(p => !serverFields.some(s => isMatch(s, p)))
        fresh = { ...fresh, fields: [...mergedServer, ...stillPending] }
      }
      await saveState({ userConfig: fresh })
      render(fresh)
    }).catch(() => {})
  }
}
