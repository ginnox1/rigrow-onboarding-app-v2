import { t } from '../i18n.js'
import { saveState } from '../storage.js'
import { fetchUserConfig } from '../userLookup.js'
import { dequeueField } from '../crm.js'
import { shareButtonHTML, shareFallbackHTML, attachShare } from '../share.js'

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
          const params = new URLSearchParams({ hectares: f.A, crop, lang })
          const calcUrl = `${CALC_URL}?${params}`
          const pendingBadge = f.pending
            ? `<span class="field-pending-badge">${t('field_syncing', lang)}</span>`
            : ''
          const deleteBtn = f.pending
            ? `<button class="btn-field-delete" data-field-id="${f.id}" title="${t('delete_field', lang)}">✕</button>`
            : ''
          return `
            <div class="field-card${f.pending ? ' field-card-pending' : ''}">
              <div class="field-info">
                <strong>${f.name ?? 'Field'}</strong>
                <span>${f.A} Ha</span>
                ${pendingBadge}
              </div>
              <div class="field-card-actions">
                <a href="${calcUrl}" target="_blank" rel="noopener noreferrer" class="btn-calc">${t('calculator', lang)}</a>
                ${deleteBtn}
              </div>
            </div>
          `
        }).join('')

    const hasPending = fields.some(f => f.pending)
    container.innerHTML = `
      <div class="screen screen-home">
        <h2>${t('welcome_back', lang, { name })}</h2>
        <div class="fields-list">${fieldCards}</div>
        ${hasPending ? `<p class="pending-note">You can delete a pending field before it syncs. Sync completes in about 10 minutes.</p>` : ''}
        <p class="teaser">Unlock field-level insights</p>
        <div class="cta-group">
          <button id="add-farm-btn" class="btn-primary">+ Add a Farm</button>
          <button id="download-app-btn" class="btn-ghost">📲 Download the Rigrow App</button>
          ${shareButtonHTML('share-btn-home')}
          ${shareFallbackHTML('share-fallback-home')}
        </div>
      </div>
    `

    container.querySelector('#add-farm-btn').addEventListener('click', async () => {
      await saveState({ fieldMode: null })
      navigate('map')
    })

    container.querySelector('#download-app-btn').addEventListener('click', () => navigate('download'))
    attachShare(container.querySelector('.screen-home'), 'share-btn-home', 'share-fallback-home')

    container.querySelectorAll('.btn-field-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const fieldId = btn.dataset.fieldId
        const fields = userConfig?.fields ?? []
        const field = fields.find(f => f.id === fieldId)
        if (!field) return

        // Confirmation modal
        const overlay = document.createElement('div')
        overlay.className = 'modal-overlay'
        overlay.innerHTML = `
          <div class="modal-box">
            <div class="modal-icon">🗑️</div>
            <h3>${t('delete_field_title', lang)}</h3>
            <p>${t('delete_field_msg', lang, { name: field.name ?? 'Field' })}</p>
            <button id="confirm-delete" class="btn-primary">${t('delete_confirm', lang)}</button>
            <button id="cancel-delete" class="btn-ghost">${t('delete_cancel', lang)}</button>
          </div>
        `
        document.body.appendChild(overlay)

        overlay.querySelector('#cancel-delete').addEventListener('click', () => overlay.remove())
        overlay.querySelector('#confirm-delete').addEventListener('click', async () => {
          overlay.remove()
          await dequeueField(field.crmQueueKey).catch(() => {})
          const updated = { ...userConfig, fields: fields.filter(f => f.id !== fieldId) }
          await saveState({ userConfig: updated })
          render(updated)
        })
      })
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
