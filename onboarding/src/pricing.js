import { PRICING_RATE_BIRR } from './config.js'

export function calcAnnualBirr(ha, discount = 0) {
  return ha * PRICING_RATE_BIRR * 12 * (1 - discount)
}

export function calcMonthlyBirr(ha) {
  return ha * PRICING_RATE_BIRR
}
