import { saveState } from '../storage.js'
import { postFieldRequest } from '../crm.js'
import { calcAnnualBirr } from '../pricing.js'
import { PRICING_RATE_BIRR } from '../config.js'
import { t } from '../i18n.js'

export async function renderPricing(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const ha = state?.hectares ?? 0
  const discount = state?.discount ?? 0
  const annual = calcAnnualBirr(ha, discount)
  const fullAnnual = calcAnnualBirr(ha, 0)

  const priceDisplay = discount > 0
    ? `<s>${fullAnnual.toLocaleString()} Birr/year</s> <strong>${annual.toLocaleString()} Birr/year</strong>`
    : `<strong>${annual.toLocaleString()} Birr/year</strong>`

  container.innerHTML = `
    <div class="screen screen-pricing">
      <h2>${t('precision_plan', lang)}</h2>
      <p>${t('rate_display', lang, { rate: PRICING_RATE_BIRR })}</p>
      <p>${t('annual_total', lang, { ha: ha.toFixed(1), rate: PRICING_RATE_BIRR, total: annual.toLocaleString() })}</p>
      <div class="price-display">${priceDisplay}</div>
      <ul class="trust-list">
        <li>✓ ${t('sms_payment_note', lang)}</li>
        <li>✓ ${t('activation_note', lang)}</li>
        <li>✓ ${t('cancel_note', lang)}</li>
      </ul>
      <button id="confirm-btn" class="btn-primary">${t('confirm_request', lang)}</button>
      <button id="back-btn" class="btn-ghost">${t('back', lang)}</button>
    </div>
  `

  document.getElementById('confirm-btn').addEventListener('click', async () => {
    const via = state?.agentPhone ?? 'self'
    await saveState({ paymentStatus: 'pending_sms' })
    try {
      await postFieldRequest({
        phone: state.phone,
        fieldMode: state.fieldMode,
        hectares: ha,
        crop: state.crop,
        plantingDate: state.plantingDate,
        annualPriceBirr: annual,
        discount,
        paymentStatus: 'pending_sms',
        gpsCoordsStr: state.gpsCoordsStr ?? '',
        via
      })
    } catch {
      // offline queue handled inside crm.js; navigate regardless
    }
    navigate('complete')
  })

  document.getElementById('back-btn').addEventListener('click', () => navigate('map'))
}
