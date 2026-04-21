# Rigrow Onboarding App v2 — CLAUDE.md

Project context and rules for Claude Code sessions.

---

## What this app is

A PWA for onboarding Ethiopian (and East African) smallholder farmers into the Rigrow precision agriculture platform. Agents and farmers use it to register, map their fields (pin or boundary), and request field-level insight services. Works on low-end Android, 2G connections, and partially offline.

**Live spec:** `docs/onboarding-prd-v2.md` — read this before any significant feature work.

---

## Commands

```bash
npm run dev:pwa        # Frontend dev server — http://localhost:5173
npm run dev:backend    # CRM relay backend — http://localhost:3001
npm run build:pwa      # Production build → dist/onboarding/
```

No test suite yet (open item).

---

## Architecture at a glance

```
onboarding/src/
  main.js              — router, boot, agent banner, toast, offline banner, theme init
  config.js            — all env vars + constants (PRICING_RATE_BIRR, USSD_ENABLED, etc.)
  storage.js           — IndexedDB 'rigrow-v2' (v2); stores: session, agent_identity,
                         user_config, user_config_stripped, offline_maps
  userLookup.js        — two-step registry lookup + normalisePhone (all 5 country codes)
  crm.js               — postLead, postFieldRequest, postAgentRequest, offline queue
  agent.js             — verifyAgent, revokeAgent, checkAgentTTL, timeAgo
  pricing.js           — calcAnnualBirr(ha, discount)
  i18n.js              — EN/SW/AM/OM translations
  offlineMap.js        — OPFS read/write + IDB offline_maps metadata (PMTiles support)
  sw-custom.js         — Custom service worker: Workbox precache + Share Target handler
  map.js               — UNCHANGED v1: Mapbox GL, Draw, Turf. Exports mapboxgl.
  offline.js           — UNCHANGED
  sync.js              — UNCHANGED
  screens/             — one file per screen (see Screen list below)
  app-screenshots.js   — APP_SCREENSHOTS array for download screen gallery

onboarding/styles/main.css   — all styles + CSS custom property theme system
onboarding/index.html        — PWA entry point
onboarding/public/
  docs/                — local dev fallback JSON files (user_registry, agent_registry, userId.json)
  assets/              — logo.png, favicon, etc.
  app-screenshots/     — *.jpg screenshots for the download screen gallery

vite.config.js         — root: 'onboarding', envDir: '..', injectManifest PWA strategy
backend/src/index.js   — Express CRM relay (local dev only, port 3001, Node ≥18)
docs/google_sheet_script — GAS source; redeploy after any changes
```

---

## Screen list

| Screen | File | Route key |
|--------|------|-----------|
| Entry (lang + phone) | screen0-entry.js | `entry` |
| Register | screen-register.js | `register` |
| Welcome (new user) | screen-welcome-new.js | `welcome-new` |
| Home (returning user) | screen-home.js | `home` |
| Map (pin / boundary) | screen-map.js | `map` |
| Pricing | screen-pricing.js | `pricing` |
| Complete | screen-complete.js | `complete` |
| Agent check | screen-agent-check.js | `agent-check` |
| Agent sent | screen-agent-sent.js | `agent-sent` |
| App download | screen-download.js | `download` |

Every screen exports `async function renderXxx(container, state, navigate)`.

---

## Critical technical rules

### Do NOT modify these files
- `onboarding/src/map.js` — v1, stable. Any map changes go in screen-map.js.
- `onboarding/src/offline.js`
- `onboarding/src/sync.js`

### Mapbox CSS — npm only
`import 'mapbox-gl/dist/mapbox-gl.css'` is at the top of `map.js`. Do NOT add a CDN `<link>` in index.html — version mismatch breaks the map.

### Vite envDir
`vite.config.js` has `envDir: '..'` to find `.env` at repo root (not inside `onboarding/`). Without this, all `VITE_*` vars are undefined.

### CRM transport — GET, not POST
`no-cors` POST to Google Apps Script silently drops the body. CRM calls use GET with `?data=encodeURIComponent(JSON.stringify(payload))`. GAS reads via `e.parameter.data` in `doGet`, which delegates to `doPost`.

### IndexedDB v2 schema
`rigrow-v2` DB (managed by `storage.js`). Stores:
- `session` — all app state
- `agent_identity` — agent phone + level + TTL
- `user_config` — self-service user config cache
- `user_config_stripped` — agent device farmer cache (LRU, limit 100)
- `offline_maps` — PMTiles metadata (`{ regionId, filename, importedAt, sizeBytes }`), `keyPath: 'filename'`

**Never change DB version without adding an upgrade path.**

### verifyAgent() is stateful
`agent.js verifyAgent()` calls `saveAgentIdentity` and `saveState` internally. Screens must NOT call `saveState` after `verifyAgent` succeeds.

### initDB() contract
`export function initDB() { return getDB() }` — must be synchronous return of a Promise. `offline.js` uses it as a DB factory.

### GPS coord format
- Pin: `"lng,lat"` (6 decimal places, 1 point)
- Boundary: `"lng1,lat1;lng2,lat2;..."` (≥3 points, no closing point — `slice(0,-1)` on GeoJSON ring)

### CRM offline queue
Separate IDB database `rigrow-crm-queue`. `flushQueue` uses separate transactions per item to avoid IDB auto-commit bug.

### PMTiles / offline maps
- `offlineMap.js` uses raw `indexedDB` API (not the `idb` library) — must stay SW-compatible.
- `sw-custom.js` is the custom service worker registered via VitePWA `injectManifest` strategy.
- `screen-map.js` imports `Protocol, PMTiles` from `pmtiles` and `importPMTiles, listLocalMaps, getMapSource` from `../offlineMap.js`. Do not remove these.
- When `mapSource === 'local'`, the map initialises with an empty style (no Mapbox satellite request) so it works offline.

### Theme system
`data-theme` on `<html>` (`light` | `dark` | `high-contrast`). Persisted in `localStorage` under `rigrow-theme`. All UI must use CSS custom properties (`--bg`, `--surface`, `--text`, `--muted`, `--border`, `--green`, `--green-light`, `--red`), never hardcoded hex values.

### Map screen pin restore
On back-navigation, `state.gpsCoords[0]` restores the pin marker. Uses `map.loaded()` guard: `if (map.loaded()) restoreMarker(); else map.once('load', restoreMarker)`. The `saveState({ gpsCoordsStr: null, gpsCoords: null })` still runs on load but reads from the pre-render state snapshot — no conflict.

### App screenshots
Managed via `onboarding/src/app-screenshots.js` (exports `APP_SCREENSHOTS` array). Images live in `onboarding/public/app-screenshots/`. Edit the manifest file; do not hardcode paths in screen-download.js.

---

## Environment variables

| Variable | Purpose | Fallback |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | Mapbox GL token | required |
| `VITE_USER_REGISTRY_URL` | phone → userId map | `/docs/user_registry.json` |
| `VITE_AGENT_REGISTRY_URL` | agent registry | derived from USER_REGISTRY_URL |
| `VITE_USER_CONFIG_BASE_URL` | userId.json base path | `/docs/` |
| `VITE_CRM_WEBHOOK_URL` | Google Apps Script URL | `http://localhost:3001/api/v1/crm/lead` |
| `VITE_APK_DOWNLOAD_URL` | Android APK download link | `#` |

Backend-only (in `backend/.env`):
```
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://192.168.0.161:5173
DB_PATH=./data/rigrow.db
CRM_SHEETS_WEBHOOK_URL=<same as VITE_CRM_WEBHOOK_URL>
```

---

## Deployment

**Vercel (production):**
- Build: `npm run build:pwa`
- Output: `dist/onboarding`
- Root: `/`
- All 6 `VITE_*` env vars must be set in Vercel dashboard

**Local dev:**
```bash
npm install          # from repo root
npm run dev:pwa      # port 5173
npm run dev:backend  # port 3001 (needs backend/.env)
```

---

## Open items (as of 2026-04-21)

- Vercel deploy + end-to-end prod verification
- GAS script redeploy (APK download view event added)
- Set `VITE_APK_DOWNLOAD_URL` when APK is published
- Farmer login (returning users — no re-registration, field data view + refresh)
- Security/signature mechanism for user access
- `USSD_ENABLED = true` when USSD is live (flip in config.js)
- Kenya county dropdown (47 counties — text input for now)
- SW/AM/OM i18n translations (empty objects in i18n.js)
- Comprehensive test suite (see PRD section 11-B checklist)

---

## Workflow preferences

- Use **subagent-driven development** (`superpowers:subagent-driven-development`) for any multi-step feature with a written plan. Works well on this project.
- Always write a plan (`superpowers:writing-plans`) and get approval before implementing.
- Use git worktrees (`.worktrees/`) for feature branches.
