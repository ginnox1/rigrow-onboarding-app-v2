import { t } from '../i18n.js'
import { saveState } from '../storage.js'
import { fetchUserConfig } from '../userLookup.js'
import { dequeueField } from '../crm.js'
import { shareButtonHTML, shareFallbackHTML, attachShare } from '../share.js'

const CALC_URL = 'https://rigrow-calc.quanomics.com'
const PENDING_TTL = 5 * 60 * 1000

function cropFromName(name = '') {
  const lastWord = name.trim().split(/\s+/).pop() || ''
  return lastWord.split('-').pop() || lastWord
}

export async function renderHome(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const now = Date.now()

  // Expire pending fields whose 5-minute grace window has passed
  const currentFields = state?.userConfig?.fields ?? []
  const hasExpired = currentFields.some(
    f => f.pending && f.pendingAt && (now - f.pendingAt) >= PENDING_TTL
  )
  if (hasExpired) {
    const updatedFields = currentFields.map(f =>
      (f.pending && f.pendingAt && (now - f.pendingAt) >= PENDING_TTL)
        ? { ...f, pending: false }
        : f
    )
    const updatedConfig = { ...state.userConfig, fields: updatedFields }
    await saveState({ userConfig: updatedConfig })
    state = { ...state, userConfig: updatedConfig }
  }

  function render(userConfig) {
    const name = userConfig?.name ?? state?.name ?? ''
    const fields = userConfig?.fields ?? []

    const hasPinFields = fields.some(f => f.registrationType === 'pin')
    let selectedFieldId = null

    const fieldCards = fields.length === 0
      ? `<p class="empty-state">${t('no_fields_yet', lang)}</p>`
      : fields.map(f => {
          const crop = cropFromName(f.name)
          const params = new URLSearchParams({ hectares: f.A, crop, lang, embed: '1' })
          const calcUrl = `${CALC_URL}?${params}`
          const pendingBadge = f.pending
            ? `<span class="field-pending-badge">${t('field_syncing', lang)}</span>`
            : ''
          const typeBadge = f.registrationType === 'pin'
            ? `<span class="field-type-badge field-type-pin">📍 ${t('field_type_pin', lang)}</span>`
            : `<span class="field-type-badge field-type-boundary">🗺️ ${t('field_type_boundary', lang)}</span>`
          const deleteBtn = f.pending
            ? `<button class="btn-field-delete" data-field-id="${f.id}" title="${t('delete_field', lang)}">✕</button>`
            : ''
          return `
            <div class="field-card${f.pending ? ' field-card-pending' : ''}" data-field-id="${f.id}" data-reg-type="${f.registrationType ?? ''}">
              <div class="field-info">
                <strong>${f.name ?? 'Field'}</strong>
                <span>${f.A} Ha</span>
                ${typeBadge}
                ${pendingBadge}
              </div>
              <div class="field-card-actions">
                <a href="${calcUrl}" target="_blank" rel="noopener noreferrer" class="btn-calc">${t('calculator', lang)}</a>
                ${deleteBtn}
              </div>
            </div>
          `
        }).join('')

    const upgradeCard = hasPinFields ? `
      <div class="upgrade-card">
        <h3>${t('upgrade_title', lang)}</h3>
        <p>${t('upgrade_desc', lang)}</p>
        <button id="upgrade-btn" class="btn-primary" disabled>${t('upgrade_btn', lang)}</button>
      </div>
    ` : ''

    const hasPending = fields.some(f => f.pending)
    container.innerHTML = `
      <div class="screen screen-home">
        <h2>${t('welcome_back', lang, { name })}</h2>
        <div class="fields-list">${fieldCards}</div>
        ${hasPending ? `<p class="pending-note">${t('pending_note', lang)}</p>` : ''}
        ${upgradeCard}
        <p class="teaser">${t('teaser_unlock', lang)}</p>
        <div class="cta-group">
          <button id="add-farm-btn" class="btn-primary">${t('add_farm', lang)}</button>
          <button id="download-app-btn" class="btn-ghost">${t('download_app_rigrow', lang)}</button>
          ${shareButtonHTML('share-btn-home')}
          ${shareFallbackHTML('share-fallback-home')}
        </div>
      </div>
    `

    // Field selection
    container.querySelectorAll('.field-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.btn-field-delete') || e.target.closest('.btn-calc')) return
        const fieldId = card.dataset.fieldId
        if (selectedFieldId === fieldId) {
          selectedFieldId = null
          card.classList.remove('field-selected')
        } else {
          container.querySelectorAll('.field-card').forEach(c => c.classList.remove('field-selected'))
          selectedFieldId = fieldId
          card.classList.add('field-selected')
        }
        const upgradeBtn = container.querySelector('#upgrade-btn')
        if (upgradeBtn) {
          const sel = fields.find(f => f.id === selectedFieldId)
          upgradeBtn.disabled = !sel || sel.registrationType !== 'pin'
        }
      })
    })

    // Upgrade button
    container.querySelector('#upgrade-btn')?.addEventListener('click', async () => {
      const sel = fields.find(f => f.id === selectedFieldId)
      if (!sel || sel.registrationType !== 'pin') return
      await saveState({ fieldMode: null, upgradeField: { name: sel.name } })
      navigate('map')
    })

    container.querySelector('#add-farm-btn').addEventListener('click', async () => {
      await saveState({ fieldMode: null, upgradeField: null })
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

  // Auto-clear badge when the TTL for the earliest pending field expires
  const activePending = (state?.userConfig?.fields ?? []).filter(f => f.pending && f.pendingAt)
  if (activePending.length) {
    const earliestAt = Math.min(...activePending.map(f => f.pendingAt))
    const msLeft = PENDING_TTL - (now - earliestAt) + 200
    setTimeout(() => { if (container.isConnected) navigate('home') }, msLeft)
  }

  // Fetch fresh server data — preserve fields still within their pending window
  if (state?.phone && navigator.onLine) {
    fetchUserConfig(state.phone, true).then(async fresh => {
      if (!fresh) return
      const stillPending = (state?.userConfig?.fields ?? []).filter(
        f => f.pending && f.pendingAt && (Date.now() - f.pendingAt) < PENDING_TTL
      )
      if (stillPending.length) {
        const serverFields = fresh.fields ?? []
        const isMatch = (s, p) =>
          cropFromName(s.name).toLowerCase() === cropFromName(p.name).toLowerCase() &&
          Math.abs((s.A ?? 0) - (p.A ?? 0)) < 0.15
        const mergedServer = serverFields.map(s => {
          const matched = stillPending.find(p => isMatch(s, p))
          return matched ? { ...s, registrationType: matched.registrationType } : s
        })
        const notOnServer = stillPending.filter(p => !serverFields.some(s => isMatch(s, p)))
        fresh = { ...fresh, fields: [...mergedServer, ...notOnServer] }
      }
      await saveState({ userConfig: fresh })
      render(fresh)
    }).catch(() => {})
  }
}
