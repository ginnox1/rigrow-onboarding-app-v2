# Changelog

All notable changes to the Rigrow Onboarding App.

---

## [Unreleased] — 2026-04-27

### Added — GitHub data source, home screen fields, per-country pricing, map UX

#### Data source — GitHub (`user_registry.json` + `user_config.json`)

- `config.js` — all three data URLs now default to `https://raw.githubusercontent.com/ginnox1/rigrow-data/main/user-data/`. A shared `GITHUB_DATA_BASE` constant drives all three. `||` guards replace `??` to handle empty-string env vars correctly. `AGENT_REGISTRY_URL` no longer uses a fragile string-replace on the registry URL.
- `userLookup.js` — fetch path changed from `BASE_URL/{userId}.json` → `BASE_URL/{userId}/user_config.json` matching the GitHub repo layout. `fetchUserConfig` accepts a `forceRefresh` flag that bypasses both the registry and config IDB caches. Offline fallback: if a network fetch fails but IDB has cached data, the cache is returned. Registry cache is invalidated automatically when `USER_REGISTRY_URL` changes (stored as `user_registry_url` in IDB).
- `screen0-entry.js` — login always calls `fetchUserConfig(phone, true)` (force-refresh) so live GitHub data is always fetched on login, preventing stale IDB registry from hiding registered users.
- `onboarding/public/docs/58130/user_config.json` — local dev test file at new path structure.
- `.env` — `VITE_USER_CONFIG_BASE_URL` uncommented and set to the correct GitHub URL; `VITE_USER_REGISTRY_URL` / `VITE_AGENT_REGISTRY_URL` already correct.

#### Home screen — field list, calculator, background refresh

- `screen-home.js` — rewritten with an inner `render(userConfig)` function. On every load the screen renders immediately from IDB-cached state, then fires `fetchUserConfig(phone, true)` in the background; if fresh data arrives the screen re-renders. Pending (optimistic) fields not yet confirmed by the server are preserved across refreshes by matching crop name + area (±0.15 Ha).
- Calculator button changed from `<form method="POST">` to `<a href="…" target="_blank">` with GET params: `?hectares={A}&crop={crop}`.
- `cropFromName(name)` helper extracts the crop from the last space-separated word, then strips any hyphen-prefix (`"E4-Tomato"` → `"Tomato"`, `"E4 Onion"` → `"Onion"`). Used for both the calculator link and pending-field deduplication.
- CTA simplified: single `+ Add a Farm` button replaces the old pin/bound/add-another logic. Clears `fieldMode` before navigating to `map` so mode selection always shows.

#### Per-country pricing

- `config.js` — `PRICING_RATE_BIRR` removed; replaced by `COUNTRY_PRICING` map: `{ prefix: { rate, currency } }`. Rate sourced from `VITE_PRICE_{CCY}` env vars; `null` if blank (service not available).
- `pricing.js` — `calcAnnualBirr(ha, rate, discount)` and `calcMonthlyBirr(ha, rate)` now accept `rate` as a parameter instead of reading a global.
- `screen-pricing.js` — reads `COUNTRY_PRICING[phonePrefix]` for rate + currency; price display uses the correct currency symbol. `currency` now included in the `postFieldRequest` call.
- `crm.js` — `postFieldRequest` destructures and forwards `currency`.
- `docs/google_sheet_script` — `Field Requests` header updated: "Annual Price (Birr)" → "Annual Price" + new "Currency" column.
- `.env` — `VITE_PRICE_ETB=390`; other country prices left blank (coming soon).

#### Map screen — mode selection redesign

- Mode selection (`fieldMode === null`) fully redesigned:
  - Cards stacked vertically (better mobile readability).
  - **Pin card**: green "Free" badge + three bullet benefits (weather, soil, calculator savings).
  - **Boundary card**: amber `{currency} {rate} / Ha / month` badge when available; grey "Coming Soon" badge when `VITE_PRICE_{CCY}` is blank. Clicking "Coming Soon" reveals an inline not-available message with a back button.
  - If any existing field has `registrationType === 'boundary'`, Pin card is hidden entirely and a hint explains why only boundary is offered.
  - `← Back` button added, navigates to `home`.
- `main.css` — mode card styles updated: `flex-direction: column`, `.mode-badge-free/paid/soon`, `.mode-features` bullet list, `.mode-card-unavailable` opacity, `.info-box` for not-available message.

#### Map screen — field prefix input

- Optional "Field ID" text input (max 10 chars) added in a side-by-side row with the crop select. Placeholder: `e.g. E4`.
- Continue handler combines them: prefix `"E4"` + crop `"tomato"` → `crop = "E4-tomato"` sent to CRM.
- State saves both `cropName` (pure crop) and `cropPrefix` separately; `crop` holds the combined value. Restores both on back-navigation.
- Old hint text in the "other" crop group removed; replaced with a single hint below the prefix row.

#### Completion screen — optimistic field append

- `screen-complete.js` — "View My Fields →" button (primary, moved to top) builds a `{ id: 'pending-…', name: crop, A: hectares, registrationType: fieldMode, pending: true }` field from current state and appends it to `state.userConfig.fields` in IDB before navigating home.
- Home screen field cards: pending fields shown with dashed border and "Syncing…" badge. Calculator link works immediately (crop + Ha already known).

#### CRM fixes

- **Pin mode was sending nothing to CRM** — skipping the pricing screen also skipped the only `postFieldRequest` call. Fixed in `screen-map.js`: pin mode now calls `postFieldRequest({ …, annualPriceBirr: 0, paymentStatus: 'free' })` before navigating to complete.
- Pin mode navigates directly to `complete`, bypassing the pricing screen (no payment for pins).
- `crm.js` `postFieldRequest` now destructures and forwards `currency`; GAS `Field Requests` header updated with `Currency` column between Annual Price and Discount. GAS redeploy required.

---

## [Unreleased] — 2026-04-21

### Added — Offline Map Tiles (PMTiles, Section 10)

Farmers can now use satellite map tiles offline. Rigrow prepares regional `.pmtiles` files (10km × 10km, zoom 13–18) and distributes them via WhatsApp/Telegram. The app stores them locally and uses them when offline.

**New files:**

- `onboarding/src/offlineMap.js` — OPFS read/write + IndexedDB metadata management
  - `importPMTiles(file)` — writes file to OPFS `maps/{filename}`, saves `{ regionId, filename, importedAt, sizeBytes }` to IDB
  - `listLocalMaps()` — returns all saved map metadata
  - `deleteLocalMap(filename)` — removes file from OPFS and IDB
  - `getMapSource(filename)` — returns a `File` handle from OPFS
  - Uses raw `indexedDB` API (SW-compatible; no `idb` library)

- `onboarding/src/sw-custom.js` — Custom service worker replacing VitePWA's auto-generated SW
  - Workbox precache via `precacheAndRoute(self.__WB_MANIFEST)`
  - Share Target handler: intercepts POST `/share-target`, extracts `.pmtiles` from FormData, writes to OPFS, saves IDB metadata, notifies open clients via `postMessage({ type: 'MAP_LOADED' })`, redirects to `/?map-loaded=1`

**Modified files:**

- `onboarding/src/storage.js` — bumped DB version 1 → 2; added `offline_maps` object store with `keyPath: 'filename'`

- `onboarding/src/screens/screen-map.js` — offline map UI and integration
  - Source switcher: `[ 🌐 Online Map ] [ 📁 Local Map ]` shown when a local file exists
  - File input fallback (`accept=".pmtiles"`) shown when Share Target is unavailable (non-standalone, iOS Safari)
  - SW `message` listener for `MAP_LOADED` → toast + navigate
  - When `mapSource === 'local'`: map initialises with an empty style (no network requests); PMTiles loaded via blob URL as a raster source/layer
  - `mapSource: 'online' | 'local'` persisted to session state
  - PMTiles protocol registered once per session via module-level flag
  - Blob URL tracked in `_localTileBlobUrl`; previous URL revoked before reassign

- `vite.config.js` — switched VitePWA from `registerType: 'autoUpdate'` to `strategies: 'injectManifest'` pointing at `onboarding/src/sw-custom.js`; added `share_target` to PWA manifest

- `package.json` — added `pmtiles: ^4.4.1` runtime dependency

**How PMTiles distribution works:**
1. Rigrow team prepares `rigrow_{region-id}_{YYYY-MM}.pmtiles` files using GDAL + go-pmtiles
2. Files distributed to farmers via WhatsApp/Telegram group per region
3. Farmer receives file → taps Share → Rigrow → app receives via Share Target
4. Fallback: tap "Load map file" in the map screen to pick from device storage
5. Source switcher appears on map screen; saved preference persists across sessions

### Fixed — Download Page & GAS Logging (2026-04-21)

- **GAS `doGet` was missing from `docs/google_sheet_script`** — root cause of APK Downloads tab not logging. All CRM events are sent as GET requests; without `doGet` the payload never reached `doPost`. Full script (doGet + doPost) now in `docs/google_sheet_script`. Redeploy required.
- **APK download modal**: tapping the download button now shows an overlay — "Download started! Check your Downloads folder." Auto-dismisses after 5 s or on OK tap.
- **Download button underline removed**: `.btn-primary` now sets `text-decoration: none` + `display: block` so it renders correctly as both `<button>` and `<a>` elements.
- **`VITE_APK_DOWNLOAD_URL`** added to `.env` (`https://rigrow.quanomics.com/assets/app/Rigrow-Android-App.apk`).

---

## [2.0.0] — 2026-04-20 to 2026-04-21

### Added — v2 Rebuild

Full rebuild of the onboarding app (v1 → v2).

**Core flow:**
- Entry screen: language toggle (EN/SW/AM/OM) + country prefix dropdown (ET/KE/UG/TZ/RW) + phone input
- New user: Register → Welcome (with upgrade pitch) → Map → Pricing → Complete
- Returning user: phone lookup → Home (field cards + calculator) → Map → Pricing → Complete
- Agent mode: Agent Check screen verifies against live registry; banner shown with TTL and manual re-verify

**Screens added:**
- `screen0-entry.js` — language/phone entry
- `screen-register.js` — name + region/woreda (ET/KE/other adaptive)
- `screen-welcome-new.js` — registration success + upgrade pitch
- `screen-home.js` — returning user field cards + calculator POST
- `screen-map.js` — mode selector (pin/boundary), GPS capture, agent request
- `screen-pricing.js` — Birr pricing (390/ha/month) + CRM post
- `screen-complete.js` — confirmation + field count
- `screen-agent-check.js` — agent registry lookup
- `screen-agent-sent.js` — agent request confirmation
- `screen-download.js` — app download page with screenshot gallery, requirements, APK counter

**Infrastructure:**
- `storage.js` — IndexedDB `rigrow-v2`; session, agent_identity, user_config, user_config_stripped stores
- `crm.js` — `new_registration`, `field_request`, `agent_request` CRM events; offline IDB queue + background sync
- `userLookup.js` — two-step registry lookup; `normalisePhone` tries all 5 country codes
- `agent.js` — `verifyAgent`, `revokeAgent`, `checkAgentTTL`, `timeAgo`; TTL = 7 days
- `pricing.js` — `calcAnnualBirr(ha, discount) = ha × 390 × 12 × (1 − discount)`
- `i18n.js` — EN/SW/AM/OM (SW/AM/OM stubs pending)
- `main.js` — SPA router, boot sequence, agent banner, offline banner, toast, theme switcher
- `config.js` — all env vars with fallbacks; feature flags (USSD_ENABLED, AGENT_MODE_ENABLED)
- `backend/src/` — Express CRM relay (local dev only, port 3001, Node ≥18)

**UI/UX:**
- CSS custom property theme system (`--bg`, `--surface`, `--text`, etc.)
- Dark / Light / High-contrast theme switcher (fixed top-right, `localStorage` persistence)
- Rigrow logo (logo.png) on entry and complete screens; favicon wired
- Phone entry: Continue disabled until 9 valid digits entered
- Map screen: date range constraints (3 months ago → 1 month ahead); crop/area/pin pre-filled on back-nav; pin marker restored on back-nav
- Register screen: fields pre-filled on back-nav
- All underlined links converted to proper bordered buttons
- Spinner + disabled state on all async action buttons

**GAS (Google Apps Script):**
- Three tabs: Registrations, Field Requests, Agent Requests
- `doGet` decodes query param + delegates to `doPost` (workaround for no-cors POST body drop)
- APK Downloads tab + `app_download_view` event (needs redeploy)
- Source: `docs/google_sheet_script`
