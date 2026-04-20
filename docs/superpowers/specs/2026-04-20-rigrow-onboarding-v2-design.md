# Rigrow Onboarding App v2 — Design Spec
**Date:** 2026-04-20
**Status:** Approved

---

## 1. Overview

A clean rebuild of the Rigrow farmer onboarding Progressive Web App (PWA). Farmers in Ethiopia (and other East African markets) use this app to register, map their fields (pin or boundary), and request precision agriculture services. The app is offline-first, supports 4 languages, and targets 2G/low-bandwidth conditions.

---

## 2. Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| UI framework | React 18 | Component model, large ecosystem |
| Build tool | Vite | Fast dev server, PWA plugin support |
| Styling | Tailwind CSS | Mobile-first, utility classes, consistent design tokens |
| State | Zustand (persist → IndexedDB) | Lightweight, maps directly to PRD session store |
| Routing | React Router v6 | Simple flat-route navigation matching screen flow |
| Maps | Mapbox GL JS + MapboxDraw | As specified in PRD |
| PWA | vite-plugin-pwa (Workbox) | Offline caching, service worker generation |
| Backend | Express + SQLite | Dev-only CRM relay to Google Sheets |
| Validation | Zod | Backend payload validation |

---

## 3. Project Structure

```
rigrow-onboarding-app-v2/
├── src/
│   ├── main.jsx              — React entry, PWA boot, offline/agent banner
│   ├── App.jsx               — Router + top-level layout (AgentBanner, OfflineBanner)
│   ├── config.js             — All constants + env vars with fallbacks
│   ├── store.js              — Zustand session store persisted to IndexedDB
│   ├── lib/
│   │   ├── storage.js        — IndexedDB wrapper (idb-keyval); agent_identity store
│   │   ├── userLookup.js     — Two-step registry fetch + normalisePhone (all 5 country codes)
│   │   ├── crm.js            — postLead, postFieldRequest, postAgentRequest + offline queue
│   │   ├── agent.js          — verifyAgent, revokeAgent, checkAgentTTL, timeAgo
│   │   ├── pricing.js        — calcAnnualBirr(ha, discount), calcMonthlyBirr(ha)
│   │   ├── i18n.js           — EN/SW/AM/OM key-value translations
│   │   └── map.js            — createMap, attachDraw, calcHectares, hasSelfIntersection
│   ├── screens/
│   │   ├── EntryScreen.jsx
│   │   ├── RegisterScreen.jsx
│   │   ├── WelcomeNewScreen.jsx
│   │   ├── HomeScreen.jsx
│   │   ├── MapScreen.jsx
│   │   ├── PricingScreen.jsx
│   │   ├── CompleteScreen.jsx
│   │   └── AgentCheckScreen.jsx
│   └── components/
│       ├── AgentBanner.jsx   — Shown on all screens when store.isAgent === true
│       ├── OfflineBanner.jsx — Subscribes to navigator.onLine
│       └── PhoneInput.jsx    — Shared: prefix dropdown (5 countries) + 9-digit input
├── backend/
│   └── src/
│       ├── index.js          — Express app, CORS, routes
│       └── routes/crm.js     — POST /api/v1/crm/lead (Zod validation + relay)
├── public/
│   └── docs/                 — Local dev: user_registry.json, agent_registry.json, {userId}.json
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 4. Navigation Flow

Flat React Router routes, one per screen:

| Route | Screen | Component |
|-------|--------|-----------|
| `/` | Entry | `EntryScreen` |
| `/register` | New Registration | `RegisterScreen` |
| `/welcome` | Welcome (New User) | `WelcomeNewScreen` |
| `/home` | Registered Home | `HomeScreen` |
| `/map` | Map | `MapScreen` |
| `/pricing` | Pricing | `PricingScreen` |
| `/complete` | Complete | `CompleteScreen` |
| `/agent-check` | Agent Check | `AgentCheckScreen` |

Navigation follows the PRD user flow exactly (see PRD §2). On boot, App.jsx reads the persisted screen from Zustand and redirects accordingly.

---

## 5. State Model

Zustand store (`store.js`) persists to IndexedDB `rigrow-v2` / `session` store via `idb-keyval`. Shape mirrors PRD §4 exactly:

```js
{
  screen, language, phone, userConfig, name, region, woreda, isRegistered,
  fieldMode, pinCoords, polygon, hectares, crop, plantingDate, gpsCoords, gpsCoordsStr,
  discount, paymentStatus,
  isAgent, agentPhone, agentLevel, verifiedAt
}
```

Agent identity (`{ phone, agentLevel, verifiedAt, cachedAt }`) is stored separately in IndexedDB `rigrow-v2` / `agent_identity` store, managed directly via `storage.js`.

---

## 6. Key Modules

### config.js
All env vars with local fallbacks:
- `VITE_USER_REGISTRY_URL` → fallback `/docs/user_registry.json`
- `VITE_AGENT_REGISTRY_URL` → fallback `/docs/agent_registry.json`
- `VITE_USER_CONFIG_BASE_URL` → fallback `/docs/`
- `VITE_CRM_WEBHOOK_URL` → fallback `http://localhost:3001/api/v1/crm/lead`
- `VITE_MAPBOX_TOKEN` → required

Constants: `PRICING_RATE_BIRR=390`, `USSD_CODE='*384#'`, `USSD_ENABLED=false`, `AGENT_MODE_ENABLED=true`, `AGENT_VERIFY_TTL_DAYS=7`, `AGENT_FARMER_CACHE_LIMIT=100`, `MIN_FARM_HA=0.5`, `MAX_FARM_HA=100000`

### userLookup.js
`normalisePhone(phone)` generates all variants across all 5 country prefixes (ET/KE/UG/TZ/RW) plus local `0XXXXXXXXX` format. Two-step lookup: registry → userId → full config. Caching: 24h for registry, self config full, agent devices stripped (max 100 LRU).

The lookup result drives navigation the same way regardless of whether the caller is a self-service farmer or an agent:
- Phone **found** → load config into Zustand → navigate to `/home` (farmer's home screen, showing their fields)
- Phone **not found** → navigate to `/register` (begin new farmer onboarding)

On agent devices, the loaded config is the **stripped** variant (`userId, phoneNr, language, fields[].{id, name, A, registrationType}`). This is sufficient to render the farmer's HomeScreen (field list, Calculator links, Pin/Bound CTAs). The agent sees the farmer's home screen in context and can add fields or navigate the normal flow on the farmer's behalf.

### crm.js
Three event types: `new_registration`, `field_request`, `agent_request`. Transport: `no-cors` POST to Apps Script in prod; relay via backend in dev. Offline: queue to IndexedDB `rigrow-crm-queue`, retry on `online` event + Background Sync.

### agent.js
`verifyAgent(phone)`: fetches agent registry (no-cache), checks all phone variants, saves identity.
`revokeAgent()`: clears `agent_identity` store + resets Zustand agent state → redirects to `/`.
`checkAgentTTL()`: called on boot — if online + past 7-day TTL, silently re-verifies.
`timeAgo(isoTimestamp)`: human-readable "N hours/days ago" for banner display.

### i18n.js
`useTranslation()` hook reads `language` from Zustand, returns `t(key)`. No external library. Keys cover all PRD screen text in EN, SW, AM, OM.

### map.js
Wraps Mapbox GL JS: `createMap(container, centre)`, `attachDraw(map)`, `calcHectares(polygon)`, `hasSelfIntersection(polygon)`, `centreForState(state)`. Used only by `MapScreen`.

---

## 7. Screen Specifications

### EntryScreen (`/`)
- Language toggle: EN / SW / አማ / OM — re-renders UI on tap
- `PhoneInput`: prefix dropdown (auto-selects by language) + 9-digit numeric input
- `[Continue]`: combines prefix + digits → E.164 → `fetchUserConfig(phone)` → navigate to `/home` (found) or `/register` (not found)
  - This lookup behaves identically for self-service users and agents. If an agent enters a farmer's phone and that farmer is registered, the app navigates to `/home` showing the farmer's data from the stripped cached config.
- `[I am an agent]`: navigate to `/agent-check`
- Offline + no cache: show "No connection" error

**Boot redirect behaviour:**
On app boot, `App.jsx` reads persisted Zustand state from IndexedDB:
- `isRegistered=true` and no active onboarding in progress → redirect to `/home`
- Active onboarding in progress (e.g. `screen='map'`) → redirect to that screen (preserving all form state so the user does not need to refill anything)
- Agent identity present → restore agent banner + redirect to `/` (entry, ready to onboard next farmer)
- No persisted state → stay at `/`

### RegisterScreen (`/register`)
- Back → `/`
- Name (required), location fields adapt to country code:
  - ET (+251): Region dropdown (14 regions) + Woreda text input
  - KE (+254): County + Sub-location text inputs
  - Other: single Location text input
- `[Register]`: validates all fields → `postLead(...)` → navigate to `/welcome`
- `via = agentPhone ?? 'self'`

### WelcomeNewScreen (`/welcome`)
- Success banner: "You're registered"
- USSD block (shown only if `USSD_ENABLED=true`)
- Android app download button (placeholder href)
- Upgrade pitch with FREE benefits list
- `[Yes, sign up my farm]` → `/map`
- `[Not now]` → WhatsApp fallback message
- `[Register Next Farmer]` (agent only) → clear farmer state, keep agent → `/`

### HomeScreen (`/home`)
- "Welcome back, {name}"
- Field cards: name, area (Ha), crop + Calculator POST form to `rigrow-calc.quanomics.com`
- Empty state: "You have no fields yet"
- CTA logic:
  - No fields → both `[Pin Your Farm]` and `[Bound Your Farm]`
  - Pin fields exist → `[Add Another Pin Field]` only
  - Boundary fields exist → `[Add Another Boundary Field]` only

### MapScreen (`/map`)
- Mode selector shown if `fieldMode` is null
- Pin-drop: tap → green marker, manual Ha input (≥0.5), crop dropdown, planting date picker
- Boundary: MapboxDraw polygon, auto-calculated Ha (read-only), ≥0.5Ha gate, self-intersection check, crop + date
- Cursor: crosshair default, pan hand on tap-and-hold
- `[Continue]`: builds `gpsCoordsStr` → navigate to `/pricing`
- `[Request Agent]`: `postAgentRequest(...)` → confirmation message (stays on map)

### PricingScreen (`/pricing`)
- Rate: Birr 390/ha/month, annual total formula: `ha × 390 × 12`
- Discount: struck-through full price if `discount > 0`
- Trust items: SMS payment, 72h activation, 14-day refund
- `[Confirm & Request Service]`: `postFieldRequest(...)` → `/complete`
- `[Back]` → `/map`

### CompleteScreen (`/complete`)
- Field count: existing fields + 1
- App download placeholder, USSD "coming soon"
- `[Back to Home]` → `/home` (all users)
- `[Register Next Farmer]` (agent only) → clear farmer state → `/`

### AgentCheckScreen (`/agent-check`)
- Back → `/`
- `PhoneInput` component
- `[Check Access]`: requires online, fetches agent registry (no-cache), normalises phone, saves identity → navigate to `/` in agent mode
- Not found: "Access denied" message

---

## 8. Agent–Farmer Flow (Key Flow)

This flow must work correctly for all agent use cases.

```
AgentCheckScreen
  → verified → navigate('/') with isAgent=true, agentBanner shown

EntryScreen (agent mode)
  → agent enters farmer phone → [Continue]
    → fetchUserConfig(farmerPhone)
      → FOUND   → load stripped config into Zustand → navigate('/home')
                   [Agent sees farmer's home screen: their fields, Calculator links, Pin/Bound CTAs]
      → NOT FOUND → navigate('/register')
                   [Agent fills name/region/woreda on farmer's behalf → postLead via=agentPhone]

HomeScreen (agent viewing a farmer)
  → Agent can add fields (Pin or Bound) just like the farmer would
  → All CRM events carry via=agentPhone

CompleteScreen / WelcomeNewScreen
  → [Register Next Farmer] clears farmer state (phone, name, region, woreda, fields, map data)
    but preserves agent identity (isAgent, agentPhone, agentLevel, verifiedAt)
  → navigate('/') — ready to onboard the next farmer
```

**State isolation between farmers:** When `[Register Next Farmer]` is tapped, all farmer-scoped fields are cleared from Zustand and IndexedDB before navigating to `/`. The agent identity fields are never cleared by this action.

---

## 9. Shared Components

### AgentBanner
Rendered in `App.jsx` above all screens when `store.isAgent === true`.
Shows: `👤 Agent: {phone} · Verified {N} ago [↻]`
Manual `[↻]` triggers re-verify. Auto-verifies on boot if online.

### OfflineBanner
Subscribes to `window` `online`/`offline` events. Shows non-blocking bar when offline.

### PhoneInput
Props: `value`, `onChange`, `countryCode`, `onCountryChange`.
Prefix dropdown: ET +251, KE +254, UG +256, TZ +255, RW +250.
Auto-selects by language: `am/om → +251`, all others → +254.
Input: `inputmode="numeric"`, max 9 digits.

---

## 10. Backend (Dev Only)

**Express server** on port 3001.

Routes:
- `GET /health`
- `POST /api/v1/crm/lead` — Zod-validates payload (all 3 event types), forwards to `CRM_SHEETS_WEBHOOK_URL` via fetch

`backend/.env`:
```
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.0.161:5173
DB_PATH=./data/rigrow.db
CRM_SHEETS_WEBHOOK_URL=<Apps Script URL>
```

---

## 11. Build & Dev Scripts

```json
"scripts": {
  "dev": "vite",
  "dev:backend": "node --env-file=backend/.env backend/src/index.js",
  "build": "vite build",
  "preview": "vite preview"
}
```

Vite config: `host: true` (LAN access for mobile testing), `vite-plugin-pwa` for Workbox service worker, Mapbox GL aliased to avoid CJS issues.

---

## 12. Environment Variables

| Variable | Dev fallback | Prod value |
|----------|-------------|------------|
| `VITE_MAPBOX_TOKEN` | *(must be provided)* | Mapbox public token |
| `VITE_USER_REGISTRY_URL` | `/docs/user_registry.json` | GitHub raw URL |
| `VITE_AGENT_REGISTRY_URL` | `/docs/agent_registry.json` | GitHub raw URL |
| `VITE_USER_CONFIG_BASE_URL` | `/docs/` | GitHub raw base URL |
| `VITE_CRM_WEBHOOK_URL` | `http://localhost:3001/api/v1/crm/lead` | Apps Script URL |

---

## 13. Out of Scope (v2+)

- USSD live integration (`USSD_ENABLED=false` for now)
- Kenya county dropdown (47 counties) — text input for now
- Mobile money (M-Pesa / TeleBirr)
- Farmer login data refresh button
- Comprehensive automated test suite
- Signature/security mechanism for user-device binding
