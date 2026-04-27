export function calcAnnualBirr(ha, rate, discount = 0) {
  return ha * rate * 12 * (1 - discount)
}

export function calcMonthlyBirr(ha, rate) {
  return ha * rate
}
