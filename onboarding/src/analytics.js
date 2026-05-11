import { inject, track as _track } from '@vercel/analytics'

export function initAnalytics() {
  inject()
}

export function track(event, props) {
  _track(event, props)
}
