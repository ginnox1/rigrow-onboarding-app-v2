# Rigrow Onboarding App — PRD v2.1
**Supersedes:** `Rigrow_PRD.md` Sections 5–6 and PRD v2.0
**Updated:** April 2026
**Status:** Live on Vercel — use this document for any clean rebuild

---

## 1. Design Philosophy

| Pillar | What it means |
|--------|---------------|
| **Low-Friction Entry** | Phone + language is enough to start. No forms beyond what's needed. |
| **Progressive Profiling** | Day 1: phone + region + farm size → savings estimate. Day 7: optional GPS precision. |
| **Accessible by Default** | Works offline, handles 2G, 4 languages, local currency (Birr). |

### Progressive Profiling Timeline

| Stage | Collected | Value delivered |
|-------|-----------|-----------------|
| **Day 1** (this app) | Phone, name, region, crop, farm size | Savings estimate, weather via USSD |
| Day 3 | Crop confirmation | 7-day irrigation tips via USSD/SMS |
| Day 7 | Optional GPS pin/boundary | 10m satellite precision |

> Calculator: `rigrow-calc.quanomics.com` (separate offline PWA).
> Weather: available via USSD or mobile app only — not this app.

---

## 2. User Flow

```
App Opens
│
├─ screen0-entry: Language + phone input
│   ├─ [I am an agent] ─────────────────────────────► screen-agent-check
│   └─ [Continue] → lookup phone in registry
│
├─ Phone NOT found (new user)
│   ├─ screen-register: Name + region + woreda → POST new_registration to CRM
│   ├─ screen-welcome-new: Success banner + USSD/app promo + upgrade pitch
│   │   ├─ [Yes, sign up my farm] ──────────────────► screen-map
│   │   ├─ [Not now] → WhatsApp fallback
│   │   └─ [Register Next Farmer] (agent only) ─────► screen0-entry (farmer cleared)
│   │
│   └─ ──────────────────────────────────────────────► screen-map (after welcome)
│
├─ Phone FOUND (returning user)
│   └─ screen-home: Field list + [Pin] / [Boundary] CTAs
│       └─ ─────────────────────────────────────────► screen-map
│
└─ screen-map (both new + returning)
    ├─ Mode selector if fieldMode not set
    ├─ Pin-drop OR polygon boundary
    ├─ [Continue] → screen-pricing
    └─ [Request Agent] → POST agent_request to CRM → confirmation message
        │
        └─ screen-pricing
            ├─ [Confirm & Request Service] → POST field_request to CRM
            └─ screen-complete
                ├─ [Back to Home] → screen-home
                └─ [Register Next Farmer] (agent only) → screen0-entry
```

**Agent flow:**
```
screen0-entry → [I am an agent] → screen-agent-check
  → verified → screen0-entry in agent mode (banner shown)
  → agent registers farmers through the normal flow above
```

---

## 3. Screen Specifications

### S0 — Entry
**File:** `src/screens/screen0-entry.js`

**Layout:**
- Rigrow logo (square placeholder or SVG)
- Language toggle: EN / SW / አማ / OM — re-renders on tap
- Phone input row:
  - Country prefix dropdown: ET +251, KE +254, UG +256, TZ +255, RW +250
  - Auto-selected by language: `am/om → +251`, all others → +254
  - Local number input, `inputmode="numeric"`, 9 digits
- `[Continue]` primary button
- `[I am an agent]` ghost button

**Logic:**
1. Combine prefix + digits → full E.164 phone (e.g. `+251911000005`)
2. `fetchUserConfig(phone)` → found → `navigate('home')` | not found → `navigate('register')`
3. Offline + no cache → show "No connection" error
4. Agent tap → `navigate('agent-check')`

---

### S1 — New Registration
**File:** `src/screens/screen-register.js`

**Layout:**
- Back → S0
- Heading: "Tell us about yourself"
- Name input (required)
- Location fields (adapt by country code derived from phone prefix):
  - **ET +251:** Region dropdown (14 regions) + Woreda text input (both required)
  - **KE +254:** County text input + Sub-location text input (both required)
  - **Other:** Single "Location" text input (required)
- `[Register]` primary button

**Validation:** All visible fields must be non-empty before submit.

**Logic:**
1. `postLead({ phone, name, region, woreda, language, via })` → CRM `new_registration` event
2. `via = state.agentPhone ?? 'self'`
3. On success or queue → `navigate('welcome-new')`

**Ethiopian regions (14):**
Addis Ababa, Afar, Amhara, Benishangul-Gumuz, Dire Dawa, Gambela, Harari, Oromia, Sidama, Somali, South Ethiopia, Southwest Ethiopia Peoples, Tigray, SNNPR

---

### S2 — Welcome (New User)
**File:** `src/screens/screen-welcome-new.js`

**Layout — two sections:**

**Section A — Registration success:**
- ✅ Success banner: "You're registered" + intro text
- USSD block: if `USSD_ENABLED = true` show code; else "Dial-in service — coming soon"
- Android app download button (placeholder `#` href)

**Section B — Upgrade pitch:**
- Heading: "Want advice specific to your farm?"
- Teaser: "Why stay on weather data only, when you can get more field-level insights?"
- Benefits list (FREE badges):
  - Savings Calculator — free
  - Basic Insights (soil moisture, crop condition) — free
- Closing: "It's all free, and signing up your farm is easy."
- `[Yes, sign up my farm]` → `navigate('map')`
- `[Not now]` → show WhatsApp fallback message
- `[Register Next Farmer]` **(agent only)** → clear farmer state, preserve agent identity → `navigate('entry')`

---

### S3 — Registered Home
**File:** `src/screens/screen-home.js`

**Layout:**
- "Welcome back, {name}"
- Fields list from `userConfig.fields`:
  - Empty state: "You have no fields yet"
  - Per field card: name, area (Ha), crop + `[Calculator →]` form POST button
- "Unlock field-level insights" teaser
- CTA buttons (logic below)

**Button logic:**
- No fields → show both `[Pin Your Farm]` AND `[Bound Your Farm]`
- Pin fields exist → `[Add Another Pin Field]` only
- Boundary fields exist → `[Add Another Boundary Field]` only
- Field type from `fields[0].registrationType` (default `'boundary'`)

**Calculator button:**
```html
<form method="POST" action="https://rigrow-calc.quanomics.com" target="_blank">
  <input type="hidden" name="farm_size" value="{field.A}">
  <input type="hidden" name="crop" value="{field.name}">
  <button type="submit">Calculator →</button>
</form>
```

---

### S4 — Map
**File:** `src/screens/screen-map.js`

**Mode selector** (shown when `state.fieldMode` is null):
- Two cards: Pin-drop | Boundary — tap to select and enter map

**Pin-drop mode:**
1. Map centred on user's region (derived from phone prefix)
2. Tap → green marker dropped, `pinCoords = { lat, lng }` saved
3. Manual area input (Ha, required, ≥ 0.5)
4. Crop dropdown + planting date picker
5. `[Continue]` → validates → saves state → `navigate('pricing')`
6. `[Request Agent]` → `postAgentRequest(...)` → CRM `agent_request` → show confirmation

**Boundary mode:**
1. MapboxDraw polygon tool active
2. Draw → `calcHectares()` fills area (read-only, user cannot edit)
3. Area < 0.5 Ha → show warning, disable crop/date, block Continue
4. `hasSelfIntersection()` check → block if true
5. Crop dropdown + planting date
6. `[Continue]` → validates → saves state → `navigate('pricing')`
7. `[Request Agent]` → same as pin

**GPS format saved to state:**
- Pin: `gpsCoordsStr = "lng,lat"` (1 point)
- Boundary: `gpsCoordsStr = "lng1,lat1;lng2,lat2;lng3,lat3;..."` (≥ 3 points, 6 decimal places)

**Cursor:** default crosshair; tap-and-hold → pan/grab hand.

**Map centre logic** (from `centreForState(state)`):
| Phone prefix | Centre |
|---|---|
| +251, 09, 07 | Addis Ababa [38.7578, 9.0192] |
| +254 | Nairobi [36.8219, -1.2921] |
| +256 | Kampala [32.5825, 0.3476] |
| +255 | Dar es Salaam [39.2083, -6.7924] |
| +250 | Kigali [29.8739, -1.9403] |

---

### S5 — Pricing
**File:** `src/screens/screen-pricing.js`

**Layout:**
- Heading: "Precision Advice Plan"
- Rate: Birr 390 / ha / month
- Annual total: `{hectares} ha × 390 × 12 = {total} Birr/year`
- If `discount > 0`: struck-through full price + discounted price
- Trust list:
  - "We will send payment details via SMS — pay within 24 hours"
  - "Service activated within 72 hours"
  - "Cancel anytime within 14 days — full refund"
- `[Confirm & Request Service]` primary
- `[Back]` → `navigate('map')`

**Logic:**
- On Confirm: `postFieldRequest({ phone, fieldMode, hectares, crop, plantingDate, annualPriceBirr, discount, paymentStatus: 'pending_sms', gpsCoordsStr, via })` → CRM `field_request`
- `via = state.agentPhone ?? 'self'`
- `navigate('complete')`

**Pricing formula:**
```
annualTotal = hectares × 390 × 12
discountedTotal = annualTotal × (1 − discount)
```

---

### S6 — Complete
**File:** `src/screens/screen-complete.js`

**Layout:**
- 🌱 icon
- "Thank you for choosing Rigrow!"
- "{n} Basic/Precision field(s) registered" (count = existing fields + 1)
- `[Download Mobile App]` placeholder
- `[USSD]` disabled, "Coming soon" badge
- `[Back to Home]` → `navigate('home')` — shown for ALL users
- `[Register Next Farmer]` (agent only) → clear farmer state, preserve agent identity → `navigate('entry')`

---

### SA — Agent Check
**File:** `src/screens/screen-agent-check.js`

**Layout:**
- Back → S0
- Heading: "Agent Access Check"
- Phone row:
  - Country prefix dropdown (same 5 options as S0)
  - 9-digit local number input
- Error: "Please enter a valid phone number (9 digits)"
- `[Check Access]` primary button

**Logic:**
1. Requires online (show error if offline)
2. Combine prefix + digits → full E.164 phone
3. `fetchAgentRegistry()` (no-cache — always fresh)
4. `normalisePhone(phone)` → try all variants (all 5 country code prefixes + local 0XXXXXXXXX)
5. Not found → "Access denied. Please contact Rigrow to register as an agent." + Back only
6. Found → `saveAgentIdentity({ phone, agentLevel, verifiedAt, cachedAt })` + `saveState({ isAgent: true, agentPhone, agentLevel, verifiedAt })` → `navigate('entry')`

---

### Agent Banner & Continuous Verification
**Rendered by:** `main.js` whenever `state.isAgent === true`

```
👤 Agent: {phone}  ·  Verified {N} ago  [↻]
```

**Auto-verify on boot:** if agent identity exists + online → silently re-verify → update `verifiedAt` or revoke.

**Manual sync [↻]:** spin icon → re-verify → update or revoke → toast result.

**TTL:** `AGENT_VERIFY_TTL_DAYS = 7`
- Online + past TTL → auto-verify immediately
- Offline + past TTL → non-blocking warning toast only

**Revocation:** clear `agent_identity` + `isAgent` from session → `navigate('entry')` → toast.

---

## 4. State Model

**DB:** `rigrow-v2` | **Store:** `session`

```js
{
  screen:        string,           // current screen name
  language:      'en'|'sw'|'am'|'om',
  phone:         string,           // full E.164, e.g. "+251911000005"
  userConfig:    object|null,      // cached {userId}.json
  name:          string,
  region:        string,
  woreda:        string,
  isRegistered:  boolean,

  // Map / field
  fieldMode:     'pin'|'boundary'|null,
  pinCoords:     { lat, lng }|null,
  polygon:       object|null,      // GeoJSON Feature
  hectares:      number|null,
  crop:          string|null,
  plantingDate:  string|null,      // "YYYY-MM-DD"
  gpsCoords:     array,            // [[lng,lat], ...]
  gpsCoordsStr:  string,           // "lng1,lat1;lng2,lat2;..." for CRM

  // Pricing
  discount:      number,           // 0–1, default 0
  paymentStatus: 'none'|'pending_sms'|'paid',

  // Agent (also stored in separate `agent_identity` store)
  isAgent:       boolean,
  agentPhone:    string|null,
  agentLevel:    string|null,
  verifiedAt:    string|null,      // ISO timestamp
}
```

**Agent identity store:** `agent_identity` in `rigrow-v2` DB
```js
{ phone, agentLevel, verifiedAt, cachedAt }
```

---

## 5. Technical Architecture

### 5.1 Phone Normalisation (`userLookup.js → normalisePhone`)

Always tries **all** variants regardless of entered format:

```js
normalisePhone("+251911000005")
// → ["+251911000005", "0911000005", "+254911000005", "+256911000005", "+255911000005", "+250911000005"]
```

This means a registry key of any supported format will always be found, regardless of which country prefix the user selected.

---

### 5.2 User Lookup (`userLookup.js`)

Two-step lookup:
1. Fetch `user_registry.json` → phone → `userId` (24h IndexedDB cache)
2. Fetch `{userId}.json` → full user config

**Self-service:** full config cached in `user_config` store.
**Agent devices:** stripped config cached in `user_config_stripped` (max `AGENT_FARMER_CACHE_LIMIT = 100`, LRU eviction).

**Stripped fields kept:** `userId, phoneNr, language, calendarType, datePickerType, fields[].{id, name, A, registrationType}`

---

### 5.3 CRM (`crm.js`)

**Three event types:**

#### `new_registration`
Sent from: `screen-register.js` on form submit.
```json
{
  "event": "new_registration",
  "phone": "+251911000005",
  "name": "Biruk Tadesse",
  "region": "Oromia",
  "woreda": "Bishoftu",
  "language": "en",
  "via": "self",
  "timestamp": "2026-04-20T10:00:00.000Z"
}
```

#### `field_request`
Sent from: `screen-pricing.js` on confirm.
```json
{
  "event": "field_request",
  "phone": "+251911000005",
  "fieldMode": "boundary",
  "hectares": 5.7,
  "crop": "tomato",
  "plantingDate": "2026-05-01",
  "annualPriceBirr": 26676,
  "discount": 0,
  "paymentStatus": "pending_sms",
  "gpsCoordsStr": "38.761758,9.026782;38.760139,9.026876;38.762001,9.025100",
  "via": "self",
  "timestamp": "2026-04-20T10:05:00.000Z"
}
```

#### `agent_request`
Sent from: `screen-map.js` [Request Agent] button.
```json
{
  "event": "agent_request",
  "phone": "+251911000005",
  "name": "Biruk Tadesse",
  "region": "Oromia",
  "woreda": "Bishoftu",
  "language": "en",
  "via": "+251911000005",
  "timestamp": "2026-04-20T10:03:00.000Z"
}
```

**`via` field:** `state.agentPhone ?? 'self'` — agent's phone number if registered by agent, otherwise `'self'`.

**Transport:**
- **Production (Vercel):** `VITE_CRM_WEBHOOK_URL` points to Apps Script → `no-cors` fire-and-forget POST
- **Local dev:** falls back to `http://localhost:3001/api/v1/crm/lead` → backend relay → Apps Script

**Offline queue:** on failure, payload saved to IndexedDB `rigrow-crm-queue` DB and retried on reconnect. Background Sync registered if available.

---

### 5.4 Google Apps Script (Google Sheets webhook)

Three tabs — one per event type. **Full script to deploy:**

```javascript
function doPost(e) {
  try {
    var p  = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (p.event === 'new_registration') {
      var sh = ss.getSheetByName('Registrations') || ss.insertSheet('Registrations');
      if (sh.getLastRow() === 0) {
        sh.appendRow(['Timestamp','Event','Phone','Name','Region','Woreda','Language','Registered Via']);
      }
      sh.appendRow([
        p.timestamp, p.event, p.phone,
        p.name || '', p.region || '', p.woreda || '', p.language || '',
        p.via || 'self'
      ]);

    } else if (p.event === 'field_request') {
      var fsh = ss.getSheetByName('Field Requests') || ss.insertSheet('Field Requests');
      if (fsh.getLastRow() === 0) {
        fsh.appendRow(['Timestamp','Phone','Field Mode','Hectares','Crop',
          'Planting Date','Annual Price (Birr)','Discount','Payment Status',
          'GPS Coords','Registered Via']);
      }
      fsh.appendRow([
        p.timestamp, p.phone,
        p.fieldMode || '', p.hectares || 0, p.crop || '',
        p.plantingDate || '', p.annualPriceBirr || 0,
        p.discount || 0, p.paymentStatus || '',
        p.gpsCoordsStr || '',
        p.via || 'self'
      ]);

    } else if (p.event === 'agent_request') {
      var ash = ss.getSheetByName('Agent Requests') || ss.insertSheet('Agent Requests');
      if (ash.getLastRow() === 0) {
        ash.appendRow(['Timestamp','Phone','Name','Region','Woreda','Registered Via']);
      }
      ash.appendRow([
        p.timestamp, p.phone,
        p.name || '', p.region || '', p.woreda || '',
        p.via || 'self'
      ]);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function testRouting() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        event: 'field_request',
        timestamp: new Date().toISOString(),
        phone: '+251911000005',
        fieldMode: 'boundary',
        hectares: 2.5,
        crop: 'maize',
        plantingDate: '2026-04-20',
        annualPriceBirr: 11700,
        discount: 0,
        paymentStatus: 'pending_sms',
        gpsCoordsStr: '38.761758,9.026782;38.760139,9.026876;38.762001,9.025100',
        via: 'self'
      })
    }
  };
  doPost(fake);
}
```

**Deployment:** Apps Script → Deploy → New deployment → Web app → Execute as Me → Anyone → Deploy. Copy URL → paste as `VITE_CRM_WEBHOOK_URL` in Vercel and `CRM_SHEETS_WEBHOOK_URL` in `backend/.env`. On script updates, always create a **new version** of the existing deployment (URL stays the same).

---

### 5.5 Data Source Files (GitHub)

Hosted at: `https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/`

| File | Purpose |
|------|---------|
| `user_registry.json` | `{ "+251XXXXXXXXX": "userId", "0XXXXXXXXX": "userId" }` |
| `agent_registry.json` | `{ "+251XXXXXXXXX": "field_agent", "+251XXXXXXXXX": "supervisor" }` |
| `{userId}.json` | Full user config (fields, language, calendar type, etc.) |

**Local dev equivalents:** `onboarding/docs/user_registry.json`, `onboarding/docs/agent_registry.json`, `onboarding/docs/{userId}.json`

---

### 5.6 Config (`config.js`)

All URLs come from Vite env vars with local fallbacks:

```js
VITE_USER_REGISTRY_URL    → fallback: '/docs/user_registry.json'
VITE_AGENT_REGISTRY_URL   → derived from USER_REGISTRY_URL (same folder)
VITE_USER_CONFIG_BASE_URL → fallback: '/docs/'
VITE_CRM_WEBHOOK_URL      → fallback: 'http://localhost:3001/api/v1/crm/lead'
VITE_MAPBOX_TOKEN         → required for map screens
```

Other constants:
```js
PRICING_RATE_BIRR        = 390
USSD_CODE                = '*384#'
USSD_ENABLED             = false       // set true when live
AGENT_MODE_ENABLED       = true
AGENT_VERIFY_TTL_DAYS    = 7
AGENT_FARMER_CACHE_LIMIT = 100
MIN_FARM_HA              = 0.5
MAX_FARM_HA              = 100000
```

---

### 5.7 Backend (`backend/src/`)

Express + SQLite. Only needed for local dev CRM relay and legacy v1 registration route.

**Routes:**
```
GET  /health
POST /api/v1/onboarding     — v1 farm registration (SQLite, legacy)
POST /api/v1/crm/lead       — CRM relay → Google Sheets
GET  /api/v1/pricing/*
POST /api/v1/payment/*
```

**`backend/.env` required:**
```
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.0.161:5173
DB_PATH=./data/rigrow.db
CRM_SHEETS_WEBHOOK_URL=<same Apps Script URL as VITE_CRM_WEBHOOK_URL>
```

Start: `npm run dev:backend` (uses `--env-file=backend/.env`).

---

## 6. Deployment

### Vercel (production)

**Build settings:**
- Framework: Vite
- Build command: `npm run build:pwa`
- Output directory: `dist/onboarding`
- Root directory: `/` (repo root)

**Environment variables (set in Vercel → Settings → Environment Variables):**

| Variable | Value |
|---|---|
| `VITE_MAPBOX_TOKEN` | Mapbox public token |
| `VITE_USER_REGISTRY_URL` | `https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/user_registry.json` |
| `VITE_AGENT_REGISTRY_URL` | `https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/agent_registry.json` |
| `VITE_USER_CONFIG_BASE_URL` | `https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/` |
| `VITE_CRM_WEBHOOK_URL` | Apps Script web app URL |

Vercel auto-deploys on push to `main`. After adding/changing env vars, trigger a manual redeploy.

### GitHub Pages (alternative)

Workflow: `.github/workflows/deploy-pwa.yml` — same 5 variables set as GitHub Secrets (Settings → Secrets and variables → Actions).

### Local dev

```bash
npm run dev:pwa        # PWA on http://localhost:5173 (also http://192.168.0.161:5173)
npm run dev:backend    # API on http://localhost:3001
npm run build:pwa      # production build → dist/onboarding/
```

---

## 7. File Structure

```
onboarding/src/
  main.js                   — router, boot, agent banner + TTL, toast, offline banner
  config.js                 — all constants + env var wiring
  storage.js                — IndexedDB 'rigrow-v2'; stores: session, agent_identity
  userLookup.js             — two-step registry lookup + normalisePhone (all country codes)
  crm.js                    — postLead, postFieldRequest, postAgentRequest, offline queue
  agent.js                  — verifyAgent, revokeAgent, checkAgentTTL, timeAgo
  pricing.js                — calcAnnualBirr(ha, discount), calcMonthlyBirr(ha)
  i18n.js                   — EN/SW/AM/OM; all v1 + v2 keys
  map.js                    — UNCHANGED (createMap, attachDraw, calcHectares, etc.)
  offline.js                — UNCHANGED
  sync.js                   — UNCHANGED
  screens/
    screen0-entry.js        — lang toggle + prefix dropdown + phone + continue/agent btns
    screen-register.js      — name + region/woreda (ET/KE/other) + postLead
    screen-welcome-new.js   — success banner + USSD + upgrade pitch + agent next-farmer btn
    screen-home.js          — welcome back + field cards + calculator POST + Pin/Bound CTAs
    screen-map.js           — mode selector → pin-drop OR boundary; GPS coords; agent request
    screen-pricing.js       — Birr pricing + trust items + postFieldRequest
    screen-complete.js      — thank you + field count + back-to-home + agent next-farmer btn
    screen-agent-check.js   — prefix dropdown + 9-digit input + live registry lookup

onboarding/docs/
  user_registry.json        — local dev: phone → userId map
  agent_registry.json       — local dev: phone → agentLevel map (keep in sync with GitHub)
  {userId}.json             — local dev: sample user config
  onboarding-prd-v2.md      — this document
  todo.md                   — test checklist + open items

onboarding/styles/
  main.css                  — all screen styles + design tokens

onboarding/index.html       — PWA entry, splash screen div, Mapbox CSS

backend/src/
  index.js                  — Express app
  routes/crm.js             — POST /api/v1/crm/lead (Zod validation + relay)
  middleware/

.github/workflows/
  deploy-pwa.yml            — GitHub Pages deployment (alternative to Vercel)

vite.config.js              — root: 'onboarding', host: true, fs.allow: ['..'], PWA plugin
```

---

## 8. Screen Renderer Contract

Every screen exports one async function:

```js
export async function renderXxx(container, state, navigate) {
  // container — HTMLElement to render into
  // state     — full session state from IndexedDB (may be null on first visit)
  // navigate  — (screenName: string) => void
}
```

State is loaded fresh from IndexedDB on every `navigate()` call — screens always receive the latest saved state.

---

## 9. Build Order (clean rebuild)

Each file: write → `node --check` → verify → next file.

| # | File | Key notes |
|---|------|-----------|
| 1 | `config.js` | All env vars with fallbacks; no AGENT_WHITELIST |
| 2 | `storage.js` | DB rigrow-v2; stores: session, agent_identity |
| 3 | `userLookup.js` | normalisePhone tries all 5 country codes in both directions |
| 4 | `crm.js` | no-cors for Apps Script URLs; 3 event types; offline queue |
| 5 | `agent.js` | verifyAgent, revokeAgent, checkAgentTTL, timeAgo |
| 6 | `pricing.js` | calcAnnualBirr(ha, discount) = ha × 390 × 12 × (1 − discount) |
| 7 | `i18n.js` | All keys for all 4 languages |
| 8 | `screens/screen0-entry.js` | Prefix dropdown; combine prefix + digits |
| 9 | `screens/screen-register.js` | All fields required; via field |
| 10 | `screens/screen-welcome-new.js` | Agent next-farmer btn |
| 11 | `screens/screen-home.js` | Field cards + calculator form POST |
| 12 | `screens/screen-map.js` | Mode selector; formatCoords; gpsCoordsStr |
| 13 | `screens/screen-pricing.js` | gpsCoordsStr + via in postFieldRequest |
| 14 | `screens/screen-complete.js` | Back to Home for all; next-farmer for agents |
| 15 | `screens/screen-agent-check.js` | Prefix dropdown; normalisePhone lookup |
| 16 | `main.js` | Router; agent banner; TTL check; boot |
| 17 | `backend/src/routes/crm.js` | Zod schemas with via + gpsCoordsStr |

**Do not modify:** `map.js`, `offline.js`, `sync.js`

---

## 10. Offline Map Tiles (PMTiles)

### Overview

`screen-map.js` supports two tile sources selected at runtime:

| Mode | Source | When used |
|------|--------|-----------|
| **Online** | Mapbox Satellite | Default — requires internet |
| **Local** | PMTiles file (user-supplied) | When a `.pmtiles` file has been imported |

Rigrow prepares regional `.pmtiles` files (10km × 10km, high-resolution satellite imagery sourced fresh per season) and distributes them to farmers via **WhatsApp or Telegram**. No in-app download function is needed.

---

### Tile File Specs

- **Format:** PMTiles (single-file raster tile archive)
- **Zoom range:** 13–18 (field-level detail)
- **Area:** 10km × 10km per region
- **Resolution:** Sentinel-2 (10m) or better
- **Approximate size:** 8–40 MB depending on resolution
- **Naming convention:** `rigrow_{region-id}_{YYYY-MM}.pmtiles`
- **Hosted by:** Rigrow team — distributed via WhatsApp/Telegram group per region

---

### How Users Load the File (Share Target API)

The PWA registers as a **Share Target** in `manifest.json`. When a user receives the `.pmtiles` file in WhatsApp or Telegram and taps **Share → Rigrow**, the app:

1. Receives the file via the Share Target handler in `sw.js`
2. Writes the file to **OPFS** (Origin Private File System) under `maps/{filename}`
3. Saves metadata to IndexedDB: `{ regionId, filename, importedAt, sizeBytes }`
4. Shows a toast: "Map loaded — ready for offline use"

On subsequent app loads, `screen-map.js` checks OPFS on init. If a local tile file exists, it offers the source switcher.

**Manifest entry (`onboarding/manifest.json`):**
```json
"share_target": {
  "action": "/share-target",
  "method": "POST",
  "enctype": "multipart/form-data",
  "params": {
    "files": [{ "name": "file", "accept": ["application/octet-stream", ".pmtiles"] }]
  }
}
```

**Fallback:** If Share Target is not supported (iOS Safari), show a **"Load map file"** button (file input `accept=".pmtiles"`) on `screen-map.js` that reads the file via `FileReader` and writes to OPFS.

---

### Map Source Switcher (screen-map.js)

When a local PMTiles file exists in OPFS, the map screen shows a toggle above the map:

```
[ 🌐 Online Map ]  [ 📁 Local Map ]
```

- **Online Map** — loads Mapbox Satellite as normal (requires connectivity)
- **Local Map** — loads PMTiles from OPFS via `maplibre-gl` or Mapbox GL with PMTiles plugin; no network required

The selected source is saved to session state (`mapSource: 'online' | 'local'`) and persisted across sessions.

---

### New Files Required

| File | Purpose |
|------|---------|
| `src/offlineMap.js` | `importPMTiles(file)`, `listLocalMaps()`, `deleteLocalMap(id)`, `getMapSource(id)` |
| `src/screens/screen-map.js` | Add source switcher UI + local tile source init |
| `sw.js` | Add Share Target POST handler + OPFS write |
| `onboarding/manifest.json` | Add `share_target` entry |

### Build order addition (insert after step 12)

| # | File | Notes |
|---|------|-------|
| 12a | `src/offlineMap.js` | OPFS read/write + IndexedDB metadata |
| 12b | `sw.js` share handler | Receive file from WhatsApp/Telegram share |
| 12c | `screen-map.js` source switcher | Toggle between Mapbox and local PMTiles |
| 12d | `manifest.json` | Register share_target for `.pmtiles` files |

---

### Preparing PMTiles Files (Rigrow team, not in-app)

```bash
# 1. Clip GeoTIFF to region bounding box
gdalwarp -te <xmin> <ymin> <xmax> <ymax> source.tif region.tif

# 2. Generate XYZ tiles (JPEG, zoom 13–18)
gdal2tiles.py --zoom=13-18 --processes=4 --format=JPEG region.tif tiles/

# 3. Package as PMTiles
go-pmtiles convert tiles/ rigrow_oromia-west_2026-04.pmtiles
```

Distribute via WhatsApp/Telegram group specific to each region. Update each season with fresh imagery.

---

## 11-A. Open Items

| Item | Status | Notes |
|------|--------|-------|
| GPS data verified in Field Requests | 🔄 Pending push | Changes not yet committed/deployed |
| `via` field in Field Requests | 🔄 Pending push | Same — needs commit + Vercel redeploy |
| Signature / security mechanism | ⬜ v2 | Associate user access to their phone only |
| Underlined links → buttons | ⬜ Minor | Style issue |
| USSD code `*384#` | ⬜ Yilkal | Set `USSD_ENABLED = true` when live |
| Mobile app store links | ⬜ Yilkal | Placeholder `#` in screen-complete + screen-welcome-new |
| Kenya county dropdown (47) | ⬜ v2 | Text input for now |
| Mobile money (M-Pesa / TeleBirr) | ⬜ v2 | Architecture slot ready in screen-pricing.js |
| Farmer login (returning user data refresh) | ⬜ v2 | Manual refresh button on screen-home |
| Comprehensive test suite | ⬜ v2 | See todo.md test checklist |

---

## 11-B. Test Checklist

- [ ] Farmer basic registration (new phone → register → welcome-new → exit)
- [ ] Farmer pin registration (entry → map → pin → pricing → complete)
- [ ] Farmer boundary registration (entry → map → boundary → pricing → complete)
- [ ] Farmer agent request (map → Request Agent → CRM agent_request row)
- [ ] Agent login (entry → agent check → banner shown → TTL behaviour)
- [ ] Agent onboarding farmer (all 4 flows above, via = agent phone in CRM)
- [ ] Returning farmer (found in registry → home → field cards shown)
- [ ] Offline queue (disable network → register → re-enable → data appears in sheet)
- [ ] GPS data in Field Requests tab (pin = 1 coord, boundary = ≥3 coords)
- [ ] Via field correct (self vs agent phone number)
