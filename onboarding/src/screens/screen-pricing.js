import { saveState } from '../storage.js'
import { enqueueFieldRequest } from '../crm.js'
import { calcAnnualBirr } from '../pricing.js'
import { COUNTRY_PRICING } from '../config.js'
import { t } from '../i18n.js'

export async function renderPricing(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const ha = state?.hectares ?? 0
  const discount = state?.discount ?? 0
  const prefix = state?.phonePrefix ?? '+251'
  const pricing = COUNTRY_PRICING[prefix] ?? { rate: 390, currency: 'ETB' }
  const { rate, currency } = pricing

  const annual = calcAnnualBirr(ha, rate, discount)
  const fullAnnual = calcAnnualBirr(ha, rate, 0)

  const priceDisplay = discount > 0
    ? `<s>${t('price_year', lang, { total: fullAnnual.toLocaleString(), currency })}</s> <strong>${t('price_year', lang, { total: annual.toLocaleString(), currency })}</strong>`
    : `<strong>${t('price_year', lang, { total: annual.toLocaleString(), currency })}</strong>`

  const gpsCoordsStr = state?.gpsCoordsStr ?? ''
  const gpsLabel = gpsCoordsStr
    ? `<div class="gps-preview">📍 GPS: <span>${gpsCoordsStr}</span></div>`
    : ''

  container.innerHTML = `
    <div class="screen screen-pricing">
      <h2>${t('precision_plan', lang)}</h2>
      <p>${t('rate_display', lang, { currency, rate })}</p>
      <p>${t('annual_total', lang, { ha: ha.toFixed(1), rate, currency, total: annual.toLocaleString() })}</p>
      <div class="price-display">${priceDisplay}</div>
      ${gpsLabel}
      <ul class="trust-list">
        <li>✓ ${t('sms_payment_note', lang)}</li>
        <li>✓ ${t('activation_note', lang)}</li>
        <li>✓ ${t('cancel_note', lang)}</li>
      </ul>
      <button id="confirm-btn" class="btn-primary">${t('confirm_request', lang)}</button>
      <button id="back-btn" class="btn-ghost">${t('back', lang)}</button>
    </div>
  `

  container.querySelector('#confirm-btn').addEventListener('click', async () => {
    if (!state?.phone || !state?.fieldMode) { navigate('entry'); return }
    if (!ha || ha < 0.5) { navigate('map'); return }
    if (!gpsCoordsStr) { navigate('map'); return }
    const btn = container.querySelector('#confirm-btn')
    btn.disabled = true
    btn.classList.add('btn-loading')
    const via = state?.agentPhone ?? 'self'
    await saveState({ paymentStatus: 'pending_sms' })
    const crmQueueKey = await enqueueFieldRequest({
      phone: state.phone, fieldMode: state.fieldMode, hectares: ha,
      crop: state.crop, plantingDate: state.plantingDate,
      annualPriceBirr: annual, currency, discount,
      paymentStatus: 'pending_sms', gpsCoordsStr, via
    }).catch(() => null)
    await saveState({ crmQueueKey })
    navigate('complete')
  })

  container.querySelector('#back-btn').addEventListener('click', () => navigate('map'))
}
