# Rigrow Onboarding App v2 — Implementation Plan

> **STATUS: COMPLETE** — All phases implemented and committed to `main`. Build passes. Session closed 2026-04-20.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean rebuild of the Rigrow farmer onboarding PWA — phone-based registration, optional field mapping, CRM posting, and agent-assisted farmer enrollment.

**Architecture:** Vanilla JS PWA (no framework) using Vite. Single-page app with a client-side router in `main.js`. State lives in IndexedDB (`rigrow-v2`). Remote data (user/agent registries, user configs) fetched from GitHub raw URLs with local `/docs/` fallbacks for dev.

**Tech Stack:** Vite + vite-plugin-pwa, Mapbox GL JS + MapboxDraw, IndexedDB (idb), Express (backend dev relay only), Google Apps Script (CRM webhook)

---

## Pre-requisite: Recover v1 Files

Three files are marked "do not modify" in the PRD — `map.js`, `offline.js`, `sync.js`. They must come from the v1 codebase.

- [ ] Copy `map.js`, `offline.js`, `sync.js` from the existing v1 repo into `onboarding/src/`.
- [ ] Run `node --check onboarding/src/map.js` (and the others) to confirm they parse cleanly.

> If v1 source is unavailable, these must be rebuilt — flag to user before proceeding.

---

## Phase 1 — Project Scaffold + Core Utilities

**Goal:** Installable, runnable skeleton. `npm run dev:pwa` opens a blank page without errors. All utility modules pass `node --check`.

**Files created:**
- `package.json`
- `vite.config.js`
- `onboarding/index.html`
- `onboarding/src/config.js`
- `onboarding/src/storage.js`
- `onboarding/src/userLookup.js`
- `onboarding/src/crm.js`
- `onboarding/src/agent.js`
- `onboarding/src/pricing.js`
- `onboarding/src/i18n.js`
- `.env.example`

---

### Task 1.1: package.json + Vite config

**Files:**
- Create: `package.json`
- Create: `vite.config.js`

- [ ] Create `package.json`:

```json
{
  "name": "rigrow-onboarding-v2",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev:pwa": "vite --host",
    "build:pwa": "vite build",
    "dev:backend": "node --env-file=backend/.env backend/src/index.js"
  },
  "dependencies": {
    "idb": "^8.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vite-plugin-pwa": "^0.19.0"
  }
}
```

- [ ] Run `npm install`

- [ ] Create `vite.config.js`:

```js
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  root: 'onboarding',
  build: { outDir: '../dist/onboarding', emptyOutDir: true },
  server: { host: true, fs: { allow: ['..'] } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Rigrow Onboarding',
        short_name: 'Rigrow',
        theme_color: '#2e7d32',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/'
      }
    })
  ]
})
```

- [ ] Create `onboarding/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rigrow</title>
  <link href='https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css' rel='stylesheet' />
  <link rel="stylesheet" href="/styles/main.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] Run `npm run dev:pwa` — confirm server starts on `http://localhost:5173`
- [ ] Commit:

```bash
git add package.json vite.config.js onboarding/index.html
git commit -m "feat: scaffold Vite PWA project"
```

---

### Task 1.2: config.js

**Files:**
- Create: `onboarding/src/config.js`
- Create: `.env.example`

- [ ] Create `onboarding/src/config.js`:

```js
export const USER_REGISTRY_URL =
  import.meta.env.VITE_USER_REGISTRY_URL ?? '/docs/user_registry.json'

export const AGENT_REGISTRY_URL =
  import.meta.env.VITE_AGENT_REGISTRY_URL ??
  USER_REGISTRY_URL.replace('user_registry.json', 'agent_registry.json')

export const USER_CONFIG_BASE_URL =
  import.meta.env.VITE_USER_CONFIG_BASE_URL ?? '/docs/'

export const CRM_WEBHOOK_URL =
  import.meta.env.VITE_CRM_WEBHOOK_URL ?? 'http://localhost:3001/api/v1/crm/lead'

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? ''

export const PRICING_RATE_BIRR        = 390
export const USSD_CODE                = '*384#'
export const USSD_ENABLED             = false
export const AGENT_MODE_ENABLED       = true
export const AGENT_VERIFY_TTL_DAYS    = 7
export const AGENT_FARMER_CACHE_LIMIT = 100
export const MIN_FARM_HA              = 0.5
export const MAX_FARM_HA              = 100000
```

- [ ] Create `.env.example`:

```
VITE_MAPBOX_TOKEN=
VITE_USER_REGISTRY_URL=https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/user_registry.json
VITE_AGENT_REGISTRY_URL=https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/agent_registry.json
VITE_USER_CONFIG_BASE_URL=https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/
VITE_CRM_WEBHOOK_URL=https://<apps-script-url>
```

- [ ] Run `node --check onboarding/src/config.js` — expect no output (clean)
- [ ] Commit:

```bash
git add onboarding/src/config.js .env.example
git commit -m "feat: add config.js with env var wiring"
```

---

### Task 1.3: storage.js

**Files:**
- Create: `onboarding/src/storage.js`

- [ ] Create `onboarding/src/storage.js`:

```js
import { openDB } from 'idb'

const DB_NAME = 'rigrow-v2'
const DB_VERSION = 1

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('session'))        db.createObjectStore('session')
      if (!db.objectStoreNames.contains('agent_identity')) db.createObjectStore('agent_identity')
      if (!db.objectStoreNames.contains('user_config'))    db.createObjectStore('user_config')
      if (!db.objectStoreNames.contains('user_config_stripped')) db.createObjectStore('user_config_stripped')
    }
  })
}

export async function getState() {
  const db = await getDB()
  return (await db.get('session', 'state')) ?? {}
}

export async function saveState(patch) {
  const db = await getDB()
  const current = (await db.get('session', 'state')) ?? {}
  await db.put('session', { ...current, ...patch }, 'state')
}

export async function clearFarmerState() {
  const db = await getDB()
  const current = (await db.get('session', 'state')) ?? {}
  const { isAgent, agentPhone, agentLevel, verifiedAt, language } = current
  await db.put('session', { isAgent, agentPhone, agentLevel, verifiedAt, language }, 'state')
}

export async function getAgentIdentity() {
  const db = await getDB()
  return db.get('agent_identity', 'current')
}

export async function saveAgentIdentity(identity) {
  const db = await getDB()
  await db.put('agent_identity', identity, 'current')
}

export async function clearAgentIdentity() {
  const db = await getDB()
  await db.delete('agent_identity', 'current')
}

export async function getUserConfig(key) {
  const db = await getDB()
  return db.get('user_config', key)
}

export async function saveUserConfig(key, value) {
  const db = await getDB()
  await db.put('user_config', value, key)
}

// LRU-evicting cache for agent devices (stripped configs)
export async function getStrippedConfig(key) {
  const db = await getDB()
  return db.get('user_config_stripped', key)
}

export async function saveStrippedConfig(key, value, limit) {
  const db = await getDB()
  const all = await db.getAllKeys('user_config_stripped')
  if (all.length >= limit && !all.includes(key)) {
    await db.delete('user_config_stripped', all[0]) // evict oldest
  }
  await db.put('user_config_stripped', value, key)
}
```

- [ ] Run `node --check onboarding/src/storage.js` — expect clean
- [ ] Commit:

```bash
git add onboarding/src/storage.js
git commit -m "feat: add IndexedDB storage module"
```

---

### Task 1.4: userLookup.js

**Files:**
- Create: `onboarding/src/userLookup.js`

- [ ] Create `onboarding/src/userLookup.js`:

```js
import { USER_REGISTRY_URL, USER_CONFIG_BASE_URL, AGENT_FARMER_CACHE_LIMIT } from './config.js'
import { saveUserConfig, getUserConfig, saveStrippedConfig, getStrippedConfig } from './storage.js'

const REGISTRY_CACHE_MS = 24 * 60 * 60 * 1000 // 24h

const PREFIXES = ['+251', '+254', '+256', '+255', '+250']

export function normalisePhone(phone) {
  // Strip leading + and all non-digit chars for the local part
  const digits = phone.replace(/^\+\d{3}/, '').replace(/^0/, '').replace(/\D/g, '')
  const variants = new Set()
  for (const prefix of PREFIXES) {
    variants.add(prefix + digits)
  }
  variants.add('0' + digits)
  variants.add(phone) // original
  return [...variants]
}

export async function fetchUserConfig(phone) {
  // Step 1: get registry (cached 24h)
  const cacheKey = 'user_registry'
  let registry = await getUserConfig(cacheKey)
  let registryCachedAt = await getUserConfig(cacheKey + '_cachedAt')

  if (!registry || !registryCachedAt || Date.now() - registryCachedAt > REGISTRY_CACHE_MS) {
    const resp = await fetch(USER_REGISTRY_URL)
    if (!resp.ok) throw new Error('registry_unavailable')
    registry = await resp.json()
    await saveUserConfig(cacheKey, registry)
    await saveUserConfig(cacheKey + '_cachedAt', Date.now())
  }

  // Step 2: find userId
  const variants = normalisePhone(phone)
  let userId = null
  for (const v of variants) {
    if (registry[v]) { userId = registry[v]; break }
  }
  if (!userId) return null

  // Step 3: fetch user config
  let config = await getUserConfig(userId)
  if (!config) {
    const resp = await fetch(USER_CONFIG_BASE_URL + userId + '.json')
    if (!resp.ok) return null
    config = await resp.json()
    await saveUserConfig(userId, config)
  }
  return config
}

export async function fetchUserConfigStripped(phone) {
  const variants = normalisePhone(phone)
  // Try cache first
  for (const v of variants) {
    const cached = await getStrippedConfig(v)
    if (cached) return cached
  }

  const resp = await fetch(USER_REGISTRY_URL)
  if (!resp.ok) return null
  const registry = await resp.json()
  let userId = null
  for (const v of variants) {
    if (registry[v]) { userId = registry[v]; break }
  }
  if (!userId) return null

  const cfgResp = await fetch(USER_CONFIG_BASE_URL + userId + '.json')
  if (!cfgResp.ok) return null
  const full = await cfgResp.json()

  const stripped = {
    userId: full.userId,
    phoneNr: full.phoneNr,
    language: full.language,
    calendarType: full.calendarType,
    datePickerType: full.datePickerType,
    fields: (full.fields ?? []).map(f => ({
      id: f.id, name: f.name, A: f.A, registrationType: f.registrationType
    }))
  }

  await saveStrippedConfig(phone, stripped, AGENT_FARMER_CACHE_LIMIT)
  return stripped
}
```

- [ ] Run `node --check onboarding/src/userLookup.js` — expect clean
- [ ] Commit:

```bash
git add onboarding/src/userLookup.js
git commit -m "feat: add userLookup with normalisePhone (all country codes)"
```

---

### Task 1.5: crm.js

**Files:**
- Create: `onboarding/src/crm.js`

- [ ] Create `onboarding/src/crm.js`:

```js
import { CRM_WEBHOOK_URL } from './config.js'

const QUEUE_DB = 'rigrow-crm-queue'
const QUEUE_STORE = 'queue'

async function getQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore(QUEUE_STORE, { autoIncrement: true })
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

async function enqueue(payload) {
  const db = await getQueueDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).add(payload)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
}

async function sendPayload(payload) {
  const isAppsScript = CRM_WEBHOOK_URL.includes('script.google.com')
  const opts = isAppsScript
    ? { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  await fetch(CRM_WEBHOOK_URL, opts)
}

async function postEvent(payload) {
  const withTimestamp = { ...payload, timestamp: new Date().toISOString() }
  try {
    await sendPayload(withTimestamp)
  } catch {
    await enqueue(withTimestamp)
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const reg = await navigator.serviceWorker.ready
      await reg.sync.register('crm-queue-flush')
    }
  }
}

export function postLead({ phone, name, region, woreda, language, via }) {
  return postEvent({ event: 'new_registration', phone, name, region, woreda, language, via })
}

export function postFieldRequest({ phone, fieldMode, hectares, crop, plantingDate, annualPriceBirr, discount, paymentStatus, gpsCoordsStr, via }) {
  return postEvent({ event: 'field_request', phone, fieldMode, hectares, crop, plantingDate, annualPriceBirr, discount, paymentStatus, gpsCoordsStr, via })
}

export function postAgentRequest({ phone, name, region, woreda, language, via }) {
  return postEvent({ event: 'agent_request', phone, name, region, woreda, language, via })
}

export async function flushQueue() {
  const db = await getQueueDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)
  const keys = await new Promise(res => { const r = store.getAllKeys(); r.onsuccess = () => res(r.result) })
  for (const key of keys) {
    const item = await new Promise(res => { const r = store.get(key); r.onsuccess = () => res(r.result) })
    try {
      await sendPayload(item)
      store.delete(key)
    } catch { break }
  }
}
```

- [ ] Run `node --check onboarding/src/crm.js` — expect clean
- [ ] Commit:

```bash
git add onboarding/src/crm.js
git commit -m "feat: add CRM module with offline queue"
```

---

### Task 1.6: agent.js

**Files:**
- Create: `onboarding/src/agent.js`

- [ ] Create `onboarding/src/agent.js`:

```js
import { AGENT_REGISTRY_URL, AGENT_VERIFY_TTL_DAYS } from './config.js'
import { getAgentIdentity, saveAgentIdentity, clearAgentIdentity, saveState, getState } from './storage.js'
import { normalisePhone } from './userLookup.js'

export async function fetchAgentRegistry() {
  const resp = await fetch(AGENT_REGISTRY_URL, { cache: 'no-store' })
  if (!resp.ok) throw new Error('agent_registry_unavailable')
  return resp.json()
}

export async function verifyAgent(phone) {
  const registry = await fetchAgentRegistry()
  const variants = normalisePhone(phone)
  for (const v of variants) {
    if (registry[v]) {
      const identity = { phone, agentLevel: registry[v], verifiedAt: new Date().toISOString(), cachedAt: new Date().toISOString() }
      await saveAgentIdentity(identity)
      await saveState({ isAgent: true, agentPhone: phone, agentLevel: registry[v], verifiedAt: identity.verifiedAt })
      return identity
    }
  }
  return null
}

export async function revokeAgent() {
  await clearAgentIdentity()
  const state = await getState()
  await saveState({ ...state, isAgent: false, agentPhone: null, agentLevel: null, verifiedAt: null })
}

export async function checkAgentTTL() {
  const identity = await getAgentIdentity()
  if (!identity) return
  const ageMs = Date.now() - new Date(identity.verifiedAt).getTime()
  const ttlMs = AGENT_VERIFY_TTL_DAYS * 24 * 60 * 60 * 1000
  if (ageMs < ttlMs) return  // still valid

  if (!navigator.onLine) return  // offline + expired: non-blocking warning only

  // Online + expired: re-verify silently
  const result = await verifyAgent(identity.phone).catch(() => null)
  if (!result) await revokeAgent()
}

export function timeAgo(isoString) {
  const ms = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
```

- [ ] Run `node --check onboarding/src/agent.js` — expect clean
- [ ] Commit:

```bash
git add onboarding/src/agent.js
git commit -m "feat: add agent verification module with TTL"
```

---

### Task 1.7: pricing.js + i18n.js

**Files:**
- Create: `onboarding/src/pricing.js`
- Create: `onboarding/src/i18n.js`

- [ ] Create `onboarding/src/pricing.js`:

```js
import { PRICING_RATE_BIRR } from './config.js'

export function calcAnnualBirr(ha, discount = 0) {
  return ha * PRICING_RATE_BIRR * 12 * (1 - discount)
}

export function calcMonthlyBirr(ha) {
  return ha * PRICING_RATE_BIRR
}
```

- [ ] Create `onboarding/src/i18n.js` (EN keys only; other languages return EN as fallback for now):

```js
const strings = {
  en: {
    continue: 'Continue',
    i_am_agent: 'I am an agent',
    register: 'Register',
    back: '← Back',
    tell_us: 'Tell us about yourself',
    name_label: 'Your name',
    region_label: 'Region',
    woreda_label: 'Woreda',
    county_label: 'County',
    sublocation_label: 'Sub-location',
    location_label: 'Location',
    youre_registered: "You're registered!",
    want_farm_advice: 'Want advice specific to your farm?',
    why_stay: 'Why stay on weather data only, when you can get more field-level insights?',
    its_all_free: "It's all free, and signing up your farm is easy.",
    yes_sign_up: 'Yes, sign up my farm',
    not_now: 'Not now',
    register_next_farmer: 'Register Next Farmer',
    welcome_back: 'Welcome back, {name}',
    no_fields_yet: 'You have no fields yet',
    pin_your_farm: 'Pin Your Farm',
    bound_your_farm: 'Bound Your Farm',
    add_another_pin: 'Add Another Pin Field',
    add_another_boundary: 'Add Another Boundary Field',
    calculator: 'Calculator →',
    precision_plan: 'Precision Advice Plan',
    rate_display: 'Birr {rate} / ha / month',
    annual_total: '{ha} ha × {rate} × 12 = {total} Birr/year',
    confirm_request: 'Confirm & Request Service',
    sms_payment_note: 'We will send payment details via SMS — pay within 24 hours',
    activation_note: 'Service activated within 72 hours',
    cancel_note: 'Cancel anytime within 14 days — full refund',
    thank_you: 'Thank you for choosing Rigrow!',
    fields_registered: '{n} {type} field(s) registered',
    back_to_home: 'Back to Home',
    download_app: 'Download Mobile App',
    ussd_coming_soon: 'USSD — Coming soon',
    agent_access: 'Agent Access Check',
    check_access: 'Check Access',
    agent_denied: 'Access denied. Please contact Rigrow to register as an agent.',
    agent_banner: '👤 Agent: {phone}  ·  Verified {ago}',
    no_connection: 'No connection',
    area_too_small: 'Area must be at least 0.5 Ha',
    self_intersection: 'Boundary cannot self-intersect',
    crop_label: 'Crop',
    planting_date_label: 'Planting Date',
    area_label: 'Area (Ha)',
    request_agent: 'Request Agent',
    agent_requested: 'Agent request sent. A Rigrow agent will follow up with you.',
    ussd_label: 'Dial USSD',
    mode_pin: 'Pin-drop',
    mode_boundary: 'Boundary',
    mode_select_title: 'How would you like to add your farm?',
    savings_calculator: 'Savings Calculator',
    basic_insights: 'Basic Insights (soil moisture, crop condition)',
    ussd_block: 'Dial {code} for weather insights',
    ussd_coming: 'Dial-in service — coming soon',
  },
  sw: {},  // TODO: add Swahili strings
  am: {},  // TODO: add Amharic strings
  om: {},  // TODO: add Oromian strings
}

export function t(key, lang = 'en', vars = {}) {
  const str = strings[lang]?.[key] ?? strings.en[key] ?? key
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
}

export const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'sw', label: 'SW' },
  { code: 'am', label: 'አማ' },
  { code: 'om', label: 'OM' },
]
```

- [ ] Run `node --check onboarding/src/pricing.js` && `node --check onboarding/src/i18n.js`
- [ ] Commit:

```bash
git add onboarding/src/pricing.js onboarding/src/i18n.js
git commit -m "feat: add pricing calculator and i18n module"
```

---

## Phase 2 — Entry + Registration Screens

**Goal:** User can open app, enter phone, get routed to register or home. Registration posts to CRM.

**Files created:**
- `onboarding/src/screens/screen0-entry.js`
- `onboarding/src/screens/screen-register.js`
- `onboarding/src/screens/screen-welcome-new.js`
- `onboarding/src/main.js` (skeleton router)
- `onboarding/styles/main.css` (basic styles)

---

### Task 2.1: main.js skeleton

**Files:**
- Create: `onboarding/src/main.js`

- [ ] Create `onboarding/src/main.js`:

```js
import { getState, saveState } from './storage.js'
import { checkAgentTTL, timeAgo, verifyAgent, revokeAgent } from './agent.js'
import { flushQueue } from './crm.js'

import { renderEntry }      from './screens/screen0-entry.js'
import { renderRegister }   from './screens/screen-register.js'
import { renderWelcomeNew } from './screens/screen-welcome-new.js'
import { renderHome }       from './screens/screen-home.js'
import { renderMap }        from './screens/screen-map.js'
import { renderPricing }    from './screens/screen-pricing.js'
import { renderComplete }   from './screens/screen-complete.js'
import { renderAgentCheck } from './screens/screen-agent-check.js'

const SCREENS = {
  entry:       renderEntry,
  register:    renderRegister,
  'welcome-new': renderWelcomeNew,
  home:        renderHome,
  map:         renderMap,
  pricing:     renderPricing,
  complete:    renderComplete,
  'agent-check': renderAgentCheck,
}

const app = document.getElementById('app')

async function navigate(screenName) {
  await saveState({ screen: screenName })
  const state = await getState()
  renderAgentBanner(state)
  const renderer = SCREENS[screenName]
  if (!renderer) { console.error('Unknown screen:', screenName); return }
  app.innerHTML = ''
  await renderer(app, state, navigate)
}

function renderAgentBanner(state) {
  const existing = document.getElementById('agent-banner')
  if (existing) existing.remove()
  if (!state?.isAgent) return

  const banner = document.createElement('div')
  banner.id = 'agent-banner'
  banner.innerHTML = `
    <span>👤 Agent: ${state.agentPhone} · Verified ${timeAgo(state.verifiedAt)}</span>
    <button id="agent-sync-btn" title="Re-verify">↻</button>
  `
  document.body.prepend(banner)
  document.getElementById('agent-sync-btn').addEventListener('click', async () => {
    const btn = document.getElementById('agent-sync-btn')
    btn.textContent = '⟳'
    const result = await verifyAgent(state.agentPhone).catch(() => null)
    if (!result) {
      await revokeAgent()
      showToast('Agent access revoked.')
      navigate('entry')
    } else {
      showToast('Agent access confirmed.')
      const fresh = await getState()
      renderAgentBanner(fresh)
    }
  })
}

export function showToast(msg, duration = 3000) {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), duration)
}

async function boot() {
  // Re-verify agent TTL silently
  await checkAgentTTL().catch(() => {})

  // Flush any queued CRM events
  if (navigator.onLine) flushQueue().catch(() => {})

  const state = await getState()
  const screen = state?.screen ?? 'entry'
  navigate(screen)
}

boot()
```

- [ ] Run `node --check onboarding/src/main.js` — expect clean
- [ ] Commit:

```bash
git add onboarding/src/main.js
git commit -m "feat: add main.js router with agent banner and boot"
```

---

### Task 2.2: screen0-entry.js

**Files:**
- Create: `onboarding/src/screens/screen0-entry.js`

- [ ] Create `onboarding/src/screens/screen0-entry.js`:

```js
import { saveState } from '../storage.js'
import { fetchUserConfig } from '../userLookup.js'
import { t, LANGUAGES } from '../i18n.js'

const PREFIXES = [
  { code: '+251', label: 'ET +251', langMatch: ['am', 'om'] },
  { code: '+254', label: 'KE +254' },
  { code: '+256', label: 'UG +256' },
  { code: '+255', label: 'TZ +255' },
  { code: '+250', label: 'RW +250' },
]

function defaultPrefix(lang) {
  return (lang === 'am' || lang === 'om') ? '+251' : '+254'
}

export async function renderEntry(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const prefix = state?.phonePrefix ?? defaultPrefix(lang)

  container.innerHTML = `
    <div class="screen screen-entry">
      <div class="logo">Rigrow</div>
      <div class="lang-toggle">
        ${LANGUAGES.map(l => `<button class="lang-btn${l.code === lang ? ' active' : ''}" data-lang="${l.code}">${l.label}</button>`).join('')}
      </div>
      <div class="phone-row">
        <select id="prefix-select">
          ${PREFIXES.map(p => `<option value="${p.code}"${p.code === prefix ? ' selected' : ''}>${p.label}</option>`).join('')}
        </select>
        <input id="phone-input" type="tel" inputmode="numeric" placeholder="9-digit number" maxlength="9" value="${state?.localPhone ?? ''}" />
      </div>
      <div id="phone-error" class="error-text hidden"></div>
      <button id="continue-btn" class="btn-primary">${t('continue', lang)}</button>
      <button id="agent-btn" class="btn-ghost">${t('i_am_agent', lang)}</button>
    </div>
  `

  container.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newLang = btn.dataset.lang
      const newPrefix = defaultPrefix(newLang)
      await saveState({ language: newLang, phonePrefix: newPrefix })
      renderEntry(container, { ...state, language: newLang, phonePrefix: newPrefix }, navigate)
    })
  })

  document.getElementById('continue-btn').addEventListener('click', async () => {
    const selectedPrefix = document.getElementById('prefix-select').value
    const local = document.getElementById('phone-input').value.trim()
    const errorEl = document.getElementById('phone-error')

    if (!/^\d{9}$/.test(local)) {
      errorEl.textContent = 'Please enter a valid 9-digit phone number'
      errorEl.classList.remove('hidden')
      return
    }
    errorEl.classList.add('hidden')

    const phone = selectedPrefix + local
    await saveState({ phone, localPhone: local, phonePrefix: selectedPrefix })

    if (!navigator.onLine) {
      const cached = null // TODO: check local user_config cache
      if (!cached) { errorEl.textContent = t('no_connection', lang); errorEl.classList.remove('hidden'); return }
    }

    try {
      const userConfig = await fetchUserConfig(phone)
      if (userConfig) {
        await saveState({ userConfig, isRegistered: true, name: userConfig.name })
        navigate('home')
      } else {
        navigate('register')
      }
    } catch {
      errorEl.textContent = t('no_connection', lang)
      errorEl.classList.remove('hidden')
    }
  })

  document.getElementById('agent-btn').addEventListener('click', () => navigate('agent-check'))
}
```

- [ ] Run `node --check onboarding/src/screens/screen0-entry.js` — expect clean
- [ ] Open browser: confirm entry screen renders, language toggles work, 9-digit validation fires
- [ ] Commit:

```bash
git add onboarding/src/screens/screen0-entry.js
git commit -m "feat: add screen0-entry with phone input and routing"
```

---

### Task 2.3: screen-register.js

**Files:**
- Create: `onboarding/src/screens/screen-register.js`

- [ ] Create `onboarding/src/screens/screen-register.js`:

```js
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
```

- [ ] Run `node --check onboarding/src/screens/screen-register.js` — expect clean
- [ ] Browser test: enter unregistered phone → registration screen → ET fields shown for +251 prefix
- [ ] Browser test: submit without all fields → error shown; submit with all → navigates to welcome-new
- [ ] Commit:

```bash
git add onboarding/src/screens/screen-register.js
git commit -m "feat: add screen-register with ET/KE/other location fields"
```

---

### Task 2.4: screen-welcome-new.js

**Files:**
- Create: `onboarding/src/screens/screen-welcome-new.js`

- [ ] Create `onboarding/src/screens/screen-welcome-new.js`:

```js
import { USSD_CODE, USSD_ENABLED } from '../config.js'
import { t } from '../i18n.js'

export async function renderWelcomeNew(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const ussdBlock = USSD_ENABLED
    ? `<p class="ussd-code">${t('ussd_block', lang, { code: USSD_CODE })}</p>`
    : `<p class="ussd-coming">${t('ussd_coming', lang)}</p>`

  container.innerHTML = `
    <div class="screen screen-welcome-new">
      <div class="success-banner">✅ ${t('youre_registered', lang)}</div>
      ${ussdBlock}
      <a href="#" class="btn-download">${t('download_app', lang)}</a>

      <hr/>
      <h3>${t('want_farm_advice', lang)}</h3>
      <p>${t('why_stay', lang)}</p>
      <ul>
        <li><span class="badge-free">FREE</span> ${t('savings_calculator', lang)}</li>
        <li><span class="badge-free">FREE</span> ${t('basic_insights', lang)}</li>
      </ul>
      <p>${t('its_all_free', lang)}</p>

      <button id="yes-signup-btn" class="btn-primary">${t('yes_sign_up', lang)}</button>
      <button id="not-now-btn" class="btn-ghost">${t('not_now', lang)}</button>
      ${state?.isAgent ? `<button id="next-farmer-btn" class="btn-secondary">${t('register_next_farmer', lang)}</button>` : ''}
    </div>
  `

  document.getElementById('yes-signup-btn').addEventListener('click', () => navigate('map'))

  document.getElementById('not-now-btn').addEventListener('click', () => {
    const msg = document.createElement('p')
    msg.className = 'whatsapp-fallback'
    msg.textContent = 'You can return any time to sign up your farm. We\'ll send updates via WhatsApp.'
    container.querySelector('.screen').appendChild(msg)
  })

  document.getElementById('next-farmer-btn')?.addEventListener('click', async () => {
    const { clearFarmerState } = await import('../storage.js')
    await clearFarmerState()
    navigate('entry')
  })
}
```

- [ ] Run `node --check onboarding/src/screens/screen-welcome-new.js` — expect clean
- [ ] Browser test: complete registration → welcome-new shows success banner, upgrade pitch, buttons
- [ ] Browser test: agent mode → "Register Next Farmer" button visible; click → returns to entry
- [ ] Commit:

```bash
git add onboarding/src/screens/screen-welcome-new.js
git commit -m "feat: add screen-welcome-new with upgrade pitch and agent next-farmer"
```

---

## Phase 3 — Home + Map + Pricing + Complete

**Goal:** Full farmer registration loop functional end-to-end.

**Dependencies:** Mapbox GL JS and MapboxDraw must load. Ensure `VITE_MAPBOX_TOKEN` is set in `.env.local`.

**Files created:**
- `onboarding/src/screens/screen-home.js`
- `onboarding/src/screens/screen-map.js`
- `onboarding/src/screens/screen-pricing.js`
- `onboarding/src/screens/screen-complete.js`

---

### Task 3.1: screen-home.js

**Files:**
- Create: `onboarding/src/screens/screen-home.js`

- [ ] Create `onboarding/src/screens/screen-home.js`:

```js
import { t } from '../i18n.js'
import { saveState } from '../storage.js'

export async function renderHome(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const name = state?.userConfig?.name ?? state?.name ?? ''
  const fields = state?.userConfig?.fields ?? []

  const regType = fields[0]?.registrationType ?? 'boundary'
  let ctaButtons = ''
  if (fields.length === 0) {
    ctaButtons = `
      <button id="pin-btn" class="btn-secondary">${t('pin_your_farm', lang)}</button>
      <button id="bound-btn" class="btn-primary">${t('bound_your_farm', lang)}</button>
    `
  } else if (regType === 'pin') {
    ctaButtons = `<button id="pin-btn" class="btn-secondary">${t('add_another_pin', lang)}</button>`
  } else {
    ctaButtons = `<button id="bound-btn" class="btn-primary">${t('add_another_boundary', lang)}</button>`
  }

  const fieldCards = fields.length === 0
    ? `<p class="empty-state">${t('no_fields_yet', lang)}</p>`
    : fields.map(f => `
        <div class="field-card">
          <div>
            <strong>${f.name}</strong>
            <span>${f.A} Ha</span>
          </div>
          <form method="POST" action="https://rigrow-calc.quanomics.com" target="_blank">
            <input type="hidden" name="farm_size" value="${f.A}">
            <input type="hidden" name="crop" value="${f.name}">
            <button type="submit" class="btn-calc">${t('calculator', lang)}</button>
          </form>
        </div>
      `).join('')

  container.innerHTML = `
    <div class="screen screen-home">
      <h2>${t('welcome_back', lang, { name })}</h2>
      <div class="fields-list">${fieldCards}</div>
      <p class="teaser">Unlock field-level insights</p>
      <div class="cta-group">${ctaButtons}</div>
    </div>
  `

  container.querySelector('#pin-btn')?.addEventListener('click', async () => {
    await saveState({ fieldMode: 'pin' })
    navigate('map')
  })
  container.querySelector('#bound-btn')?.addEventListener('click', async () => {
    await saveState({ fieldMode: 'boundary' })
    navigate('map')
  })
}
```

- [ ] Run `node --check onboarding/src/screens/screen-home.js`
- [ ] Browser test: returning user phone → home screen with field cards (or empty state)
- [ ] Browser test: no fields → both buttons shown; pin fields → only pin button; boundary → only boundary
- [ ] Commit:

```bash
git add onboarding/src/screens/screen-home.js
git commit -m "feat: add screen-home with field cards and dynamic CTAs"
```

---

### Task 3.2: screen-map.js

**Files:**
- Create: `onboarding/src/screens/screen-map.js`

> Note: This screen imports from `map.js` (the v1 unchanged file). Ensure that file is present before this task.

- [ ] Create `onboarding/src/screens/screen-map.js`:

```js
import { saveState, getState } from '../storage.js'
import { postAgentRequest } from '../crm.js'
import { createMap, attachDraw, calcHectares, hasSelfIntersection } from '../map.js'
import { MIN_FARM_HA } from '../config.js'
import { t } from '../i18n.js'
import { showToast } from '../main.js'

const CROPS = ['Maize','Wheat','Teff','Barley','Tomato','Onion','Other']

const MAP_CENTRES = {
  '+251': [38.7578, 9.0192],
  '09':   [38.7578, 9.0192],
  '07':   [38.7578, 9.0192],
  '+254': [36.8219, -1.2921],
  '+256': [32.5825,  0.3476],
  '+255': [39.2083, -6.7924],
  '+250': [29.8739, -1.9403],
}

function centreForState(state) {
  const prefix = state?.phonePrefix ?? '+254'
  return MAP_CENTRES[prefix] ?? [38.7578, 9.0192]
}

export async function renderMap(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const fieldMode = state?.fieldMode ?? null

  if (!fieldMode) {
    // Mode selector
    container.innerHTML = `
      <div class="screen screen-map-select">
        <h2>${t('mode_select_title', lang)}</h2>
        <div class="mode-cards">
          <div class="mode-card" id="select-pin"><strong>${t('mode_pin', lang)}</strong><p>Drop a point, enter area manually</p></div>
          <div class="mode-card" id="select-boundary"><strong>${t('mode_boundary', lang)}</strong><p>Draw farm boundary — area auto-calculated</p></div>
        </div>
      </div>
    `
    document.getElementById('select-pin').addEventListener('click', async () => {
      await saveState({ fieldMode: 'pin' })
      navigate('map')
    })
    document.getElementById('select-boundary').addEventListener('click', async () => {
      await saveState({ fieldMode: 'boundary' })
      navigate('map')
    })
    return
  }

  container.innerHTML = `
    <div class="screen screen-map">
      <div id="map-container"></div>
      <div class="map-form">
        <label>${t('area_label', lang)}
          <input id="area-input" type="number" min="0.5" step="0.1"
            ${fieldMode === 'boundary' ? 'readonly' : ''}
            placeholder="Ha" />
        </label>
        <div id="area-warning" class="error-text hidden">${t('area_too_small', lang)}</div>
        <label>${t('crop_label', lang)}
          <select id="crop-select">
            <option value="">— Select —</option>
            ${CROPS.map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join('')}
          </select>
        </label>
        <label>${t('planting_date_label', lang)}
          <input id="date-input" type="date" />
        </label>
        <button id="continue-btn" class="btn-primary">${t('continue', lang)}</button>
        <button id="agent-request-btn" class="btn-ghost">${t('request_agent', lang)}</button>
      </div>
    </div>
  `

  const centre = centreForState(state)
  const map = createMap('map-container', centre)

  let pinCoords = null
  let polygon = null

  if (fieldMode === 'pin') {
    map.on('click', e => {
      pinCoords = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      // Remove previous markers
      document.querySelectorAll('.mapboxgl-marker').forEach(m => m.remove())
      new mapboxgl.Marker({ color: '#2e7d32' }).setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(map)
    })
  } else {
    const draw = attachDraw(map)
    map.on('draw.create', updateBoundary)
    map.on('draw.update', updateBoundary)
    map.on('draw.delete', () => {
      polygon = null
      document.getElementById('area-input').value = ''
      document.getElementById('area-warning').classList.add('hidden')
    })

    function updateBoundary(e) {
      const feat = e.features[0]
      if (hasSelfIntersection(feat)) {
        showToast(t('self_intersection', lang))
        draw.delete(feat.id)
        return
      }
      polygon = feat
      const ha = calcHectares(feat)
      document.getElementById('area-input').value = ha.toFixed(2)
      const warn = document.getElementById('area-warning')
      if (ha < MIN_FARM_HA) {
        warn.classList.remove('hidden')
        document.getElementById('crop-select').disabled = true
        document.getElementById('date-input').disabled = true
        document.getElementById('continue-btn').disabled = true
      } else {
        warn.classList.add('hidden')
        document.getElementById('crop-select').disabled = false
        document.getElementById('date-input').disabled = false
        document.getElementById('continue-btn').disabled = false
      }
    }
  }

  document.getElementById('continue-btn').addEventListener('click', async () => {
    const ha = parseFloat(document.getElementById('area-input').value)
    const crop = document.getElementById('crop-select').value
    const plantingDate = document.getElementById('date-input').value

    if (!ha || ha < MIN_FARM_HA || !crop || !plantingDate) {
      showToast('Please complete all fields')
      return
    }

    let gpsCoordsStr = ''
    let gpsCoords = []
    if (fieldMode === 'pin') {
      if (!pinCoords) { showToast('Please drop a pin on the map'); return }
      gpsCoordsStr = `${pinCoords.lng.toFixed(6)},${pinCoords.lat.toFixed(6)}`
      gpsCoords = [[pinCoords.lng, pinCoords.lat]]
    } else {
      if (!polygon) { showToast('Please draw your farm boundary'); return }
      gpsCoords = polygon.geometry.coordinates[0].slice(0, -1) // drop closing point
      gpsCoordsStr = gpsCoords.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';')
    }

    await saveState({ hectares: ha, crop, plantingDate, gpsCoordsStr, gpsCoords, polygon })
    navigate('pricing')
  })

  document.getElementById('agent-request-btn').addEventListener('click', async () => {
    const via = state?.agentPhone ?? 'self'
    await postAgentRequest({ phone: state.phone, name: state.name, region: state.region, woreda: state.woreda, language: lang, via })
    showToast(t('agent_requested', lang))
    navigate('pricing')
  })
}
```

- [ ] Run `node --check onboarding/src/screens/screen-map.js`
- [ ] Browser test (with Mapbox token set): mode selector shows for null fieldMode
- [ ] Browser test: pin mode → click map → marker drops; fill form → continue → navigates to pricing
- [ ] Browser test: boundary mode → draw polygon → area auto-fills; < 0.5 Ha → warning + disabled
- [ ] Commit:

```bash
git add onboarding/src/screens/screen-map.js
git commit -m "feat: add screen-map with pin/boundary modes and GPS coord capture"
```

---

### Task 3.3: screen-pricing.js

**Files:**
- Create: `onboarding/src/screens/screen-pricing.js`

- [ ] Create `onboarding/src/screens/screen-pricing.js`:

```js
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
    navigate('complete')
  })

  document.getElementById('back-btn').addEventListener('click', () => navigate('map'))
}
```

- [ ] Run `node --check onboarding/src/screens/screen-pricing.js`
- [ ] Browser test: pricing screen shows correct ha × 390 × 12 calculation
- [ ] Browser test: confirm → field_request fires (check Network tab); navigates to complete
- [ ] Commit:

```bash
git add onboarding/src/screens/screen-pricing.js
git commit -m "feat: add screen-pricing with Birr calculation and CRM post"
```

---

### Task 3.4: screen-complete.js

**Files:**
- Create: `onboarding/src/screens/screen-complete.js`

- [ ] Create `onboarding/src/screens/screen-complete.js`:

```js
import { clearFarmerState } from '../storage.js'
import { t } from '../i18n.js'

export async function renderComplete(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const existingFields = state?.userConfig?.fields?.length ?? 0
  const totalFields = existingFields + 1
  const fieldType = state?.fieldMode === 'pin' ? 'Basic' : 'Precision'

  container.innerHTML = `
    <div class="screen screen-complete">
      <div class="complete-icon">🌱</div>
      <h2>${t('thank_you', lang)}</h2>
      <p>${t('fields_registered', lang, { n: totalFields, type: fieldType })}</p>
      <button id="download-btn" class="btn-secondary">${t('download_app', lang)}</button>
      <button id="ussd-btn" class="btn-ghost" disabled>${t('ussd_coming_soon', lang)}</button>
      <button id="home-btn" class="btn-primary">${t('back_to_home', lang)}</button>
      ${state?.isAgent ? `<button id="next-farmer-btn" class="btn-secondary">${t('register_next_farmer', lang)}</button>` : ''}
    </div>
  `

  document.getElementById('home-btn').addEventListener('click', () => navigate('home'))

  document.getElementById('next-farmer-btn')?.addEventListener('click', async () => {
    await clearFarmerState()
    navigate('entry')
  })
}
```

- [ ] Run `node --check onboarding/src/screens/screen-complete.js`
- [ ] Browser test: complete screen shows correct field count; Back to Home → home; agent gets next-farmer button
- [ ] Commit:

```bash
git add onboarding/src/screens/screen-complete.js
git commit -m "feat: add screen-complete with field count and agent next-farmer"
```

---

## Phase 4 — Agent Flow

**Goal:** Agent can verify their identity, see persistent banner, and register farmers with `via = agentPhone`.

**Files created/modified:**
- `onboarding/src/screens/screen-agent-check.js`

---

### Task 4.1: screen-agent-check.js

**Files:**
- Create: `onboarding/src/screens/screen-agent-check.js`

- [ ] Create `onboarding/src/screens/screen-agent-check.js`:

```js
import { verifyAgent } from '../agent.js'
import { saveState } from '../storage.js'
import { t } from '../i18n.js'

const PREFIXES = [
  { code: '+251', label: 'ET +251' },
  { code: '+254', label: 'KE +254' },
  { code: '+256', label: 'UG +256' },
  { code: '+255', label: 'TZ +255' },
  { code: '+250', label: 'RW +250' },
]

export async function renderAgentCheck(container, state, navigate) {
  const lang = state?.language ?? 'en'

  container.innerHTML = `
    <div class="screen screen-agent-check">
      <button class="btn-back">${t('back', lang)}</button>
      <h2>${t('agent_access', lang)}</h2>
      <div class="phone-row">
        <select id="prefix-select">
          ${PREFIXES.map(p => `<option value="${p.code}">${p.label}</option>`).join('')}
        </select>
        <input id="phone-input" type="tel" inputmode="numeric" placeholder="9-digit number" maxlength="9" />
      </div>
      <div id="agent-error" class="error-text hidden"></div>
      <button id="check-btn" class="btn-primary">${t('check_access', lang)}</button>
    </div>
  `

  container.querySelector('.btn-back').addEventListener('click', () => navigate('entry'))

  document.getElementById('check-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('agent-error')
    const local = document.getElementById('phone-input').value.trim()
    const prefix = document.getElementById('prefix-select').value

    if (!/^\d{9}$/.test(local)) {
      errorEl.textContent = 'Please enter a valid phone number (9 digits)'
      errorEl.classList.remove('hidden')
      return
    }

    if (!navigator.onLine) {
      errorEl.textContent = t('no_connection', lang)
      errorEl.classList.remove('hidden')
      return
    }

    errorEl.classList.add('hidden')
    const phone = prefix + local

    try {
      const identity = await verifyAgent(phone)
      if (!identity) {
        errorEl.textContent = t('agent_denied', lang)
        errorEl.classList.remove('hidden')
        document.getElementById('check-btn').remove()
        return
      }
      await saveState({ isAgent: true, agentPhone: phone, agentLevel: identity.agentLevel, verifiedAt: identity.verifiedAt })
      navigate('entry')
    } catch {
      errorEl.textContent = t('no_connection', lang)
      errorEl.classList.remove('hidden')
    }
  })
}
```

- [ ] Run `node --check onboarding/src/screens/screen-agent-check.js`
- [ ] Browser test: click "I am an agent" → agent check screen; enter valid agent phone → returns to entry with banner
- [ ] Browser test: enter unknown phone → "Access denied" shown; check-btn removed
- [ ] Commit:

```bash
git add onboarding/src/screens/screen-agent-check.js
git commit -m "feat: add screen-agent-check with live registry verification"
```

---

## Phase 5 — Styles + PWA + Backend Relay

**Goal:** App looks usable on mobile, PWA installs, and local dev CRM relay works.

**Files created:**
- `onboarding/styles/main.css`
- `backend/src/index.js`
- `backend/src/routes/crm.js`
- `backend/package.json`

---

### Task 5.1: main.css

**Files:**
- Create: `onboarding/styles/main.css`

- [ ] Create `onboarding/styles/main.css` with these design tokens and base styles:

```css
:root {
  --green:      #2e7d32;
  --green-light:#e8f5e9;
  --red:        #c62828;
  --text:       #212121;
  --muted:      #757575;
  --border:     #e0e0e0;
  --radius:     8px;
  --font:       'Segoe UI', system-ui, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); color: var(--text); background: #fafafa; }

#app { max-width: 480px; margin: 0 auto; padding: 16px; }

.screen { display: flex; flex-direction: column; gap: 16px; padding-top: 8px; }

/* Buttons */
.btn-primary  { background: var(--green); color: #fff; border: none; border-radius: var(--radius); padding: 14px; font-size: 1rem; cursor: pointer; width: 100%; }
.btn-secondary{ background: var(--green-light); color: var(--green); border: 1px solid var(--green); border-radius: var(--radius); padding: 12px; font-size: 1rem; cursor: pointer; width: 100%; }
.btn-ghost    { background: transparent; color: var(--green); border: none; padding: 10px; font-size: 0.9rem; cursor: pointer; text-decoration: underline; }
.btn-back     { background: none; border: none; color: var(--green); cursor: pointer; font-size: 0.9rem; align-self: flex-start; }
.btn-calc     { background: var(--green-light); color: var(--green); border: none; border-radius: 4px; padding: 4px 10px; font-size: 0.85rem; cursor: pointer; }

/* Inputs */
input, select { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius); font-size: 1rem; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 0.9rem; color: var(--muted); }

/* Phone row */
.phone-row { display: flex; gap: 8px; }
.phone-row select { width: 130px; flex-shrink: 0; }
.phone-row input  { flex: 1; }

/* Lang toggle */
.lang-toggle { display: flex; gap: 8px; }
.lang-btn { border: 1px solid var(--border); background: #fff; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
.lang-btn.active { background: var(--green); color: #fff; border-color: var(--green); }

/* Logo */
.logo { font-size: 2rem; font-weight: 700; color: var(--green); text-align: center; padding: 24px 0 8px; }

/* Error */
.error-text { color: var(--red); font-size: 0.85rem; }
.hidden { display: none !important; }

/* Agent banner */
#agent-banner { background: var(--green); color: #fff; padding: 8px 16px; display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; }
#agent-sync-btn { background: none; border: none; color: #fff; font-size: 1rem; cursor: pointer; }

/* Toast */
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #323232; color: #fff; padding: 12px 24px; border-radius: var(--radius); font-size: 0.9rem; z-index: 9999; }

/* Map */
#map-container { height: 300px; border-radius: var(--radius); overflow: hidden; }
.map-form { display: flex; flex-direction: column; gap: 12px; }

/* Field cards */
.field-card { display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius); background: #fff; }

/* Mode cards */
.mode-cards { display: flex; gap: 16px; }
.mode-card { flex: 1; padding: 20px; border: 2px solid var(--border); border-radius: var(--radius); text-align: center; cursor: pointer; }
.mode-card:hover { border-color: var(--green); background: var(--green-light); }

/* Success banner */
.success-banner { background: var(--green-light); border: 1px solid var(--green); border-radius: var(--radius); padding: 16px; font-size: 1.1rem; font-weight: 600; color: var(--green); }

/* Pricing */
.price-display { font-size: 1.4rem; text-align: center; padding: 8px 0; }
.trust-list { list-style: none; display: flex; flex-direction: column; gap: 8px; }

/* Badge */
.badge-free { background: var(--green); color: #fff; font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; margin-right: 6px; }

/* Complete */
.complete-icon { font-size: 3rem; text-align: center; }
```

- [ ] Browser test: refresh app — layout is clean, buttons styled, no visual regressions
- [ ] Commit:

```bash
git add onboarding/styles/main.css
git commit -m "feat: add base CSS with design tokens"
```

---

### Task 5.2: Backend relay (local dev only)

**Files:**
- Create: `backend/package.json`
- Create: `backend/src/index.js`
- Create: `backend/src/routes/crm.js`
- Create: `backend/.env.example`

- [ ] Create `backend/package.json`:

```json
{
  "name": "rigrow-backend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "express": "^4.18.0",
    "zod": "^3.22.0"
  }
}
```

- [ ] Run `cd backend && npm install && cd ..`

- [ ] Create `backend/src/index.js`:

```js
import express from 'express'
import { crmRouter } from './routes/crm.js'

const app = express()
const PORT = process.env.PORT ?? 3001
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',')

app.use(express.json())
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (_, res) => res.json({ status: 'ok' }))
app.use('/api/v1/crm', crmRouter)

app.listen(PORT, () => console.log(`Backend on http://localhost:${PORT}`))
```

- [ ] Create `backend/src/routes/crm.js`:

```js
import { Router } from 'express'
import { z } from 'zod'

export const crmRouter = Router()

const baseSchema = z.object({
  event: z.enum(['new_registration', 'field_request', 'agent_request']),
  phone: z.string(),
  timestamp: z.string(),
  via: z.string().default('self'),
})

const registrationSchema = baseSchema.extend({
  name: z.string(),
  region: z.string(),
  woreda: z.string().optional().default(''),
  language: z.string(),
})

const fieldRequestSchema = baseSchema.extend({
  fieldMode: z.enum(['pin', 'boundary']),
  hectares: z.number(),
  crop: z.string(),
  plantingDate: z.string(),
  annualPriceBirr: z.number(),
  discount: z.number().default(0),
  paymentStatus: z.string(),
  gpsCoordsStr: z.string().default(''),
})

const agentRequestSchema = baseSchema.extend({
  name: z.string(),
  region: z.string(),
  woreda: z.string().optional().default(''),
  language: z.string(),
})

crmRouter.post('/lead', async (req, res) => {
  const { event } = req.body ?? {}
  let parsed

  try {
    if (event === 'new_registration') parsed = registrationSchema.parse(req.body)
    else if (event === 'field_request') parsed = fieldRequestSchema.parse(req.body)
    else if (event === 'agent_request') parsed = agentRequestSchema.parse(req.body)
    else return res.status(400).json({ error: 'Unknown event' })
  } catch (err) {
    return res.status(400).json({ error: err.errors })
  }

  const webhookUrl = process.env.CRM_SHEETS_WEBHOOK_URL
  if (!webhookUrl) {
    console.log('[CRM relay] No webhook URL — payload logged:', parsed)
    return res.json({ status: 'logged' })
  }

  try {
    await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) })
    res.json({ status: 'relayed' })
  } catch (err) {
    console.error('[CRM relay] Webhook failed:', err.message)
    res.status(502).json({ error: 'Webhook unavailable' })
  }
})
```

- [ ] Create `backend/.env.example`:

```
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.0.161:5173
DB_PATH=./data/rigrow.db
CRM_SHEETS_WEBHOOK_URL=
```

- [ ] Run `npm run dev:backend` in one terminal — confirm "Backend on http://localhost:3001"
- [ ] Test: `curl -s http://localhost:3001/health` → `{"status":"ok"}`
- [ ] Commit:

```bash
git add backend/
git commit -m "feat: add Express backend relay for local dev CRM"
```

---

## Phase 6 — End-to-End Verification

**Goal:** Run every flow from the test checklist in PRD Section 11.

- [ ] **Farmer basic registration:** entry → register (ET phone) → welcome-new → exit
  Verify: Google Sheet "Registrations" tab has new row with correct phone, name, region, woreda

- [ ] **Farmer pin registration:** entry (registered phone) → home → pin → map → drop pin → area/crop/date → pricing → confirm → complete
  Verify: "Field Requests" tab has GPS in format `lng,lat` (1 point), `via = self`

- [ ] **Farmer boundary registration:** same flow with boundary draw
  Verify: GPS has ≥3 points in `lng1,lat1;lng2,lat2;...` format

- [ ] **Farmer agent request:** map → Request Agent → CRM
  Verify: "Agent Requests" tab has row

- [ ] **Agent login:** entry → I am an agent → agent check → enter valid phone → banner appears on re-entry
  Verify: `via` field in all subsequent CRM rows = agent phone number

- [ ] **Offline queue:** disable network in DevTools → register → re-enable → queue flushes
  Verify: data appears in sheet after reconnect

- [ ] **Returning farmer:** enter phone known in `user_registry.json` → goes to home, not register

- [ ] **Agent TTL:** manually set `verifiedAt` in IndexedDB to 8 days ago → reload → auto-verify fires (or revokes if offline)

---

## Deployment Checklist

- [ ] Set Vercel environment variables (see PRD Section 6)
- [ ] Trigger manual Vercel deploy after setting env vars
- [ ] Confirm PWA installs on Android (Add to Home Screen)
- [ ] Set `USSD_ENABLED = true` in `config.js` when USSD goes live
