import { saveState } from '../storage.js'
import { postAgentRequest, postFieldRequest } from '../crm.js'
import { createMap, attachDraw, calcHectares, hasSelfIntersection, addGreenMarker, mapboxgl } from '../map.js'
import { MIN_FARM_HA, COUNTRY_PRICING, COUNTRY_BBOX } from '../config.js'
import { t } from '../i18n.js'
import { showToast } from '../main.js'
import { Protocol, PMTiles } from 'pmtiles'
import { importPMTiles, listLocalMaps, getMapSource } from '../offlineMap.js'

const CROPS = ['Barley','Broccoli','Cabbage','Garlic','Kale','Lentils','Maize','Onion','Pepper','Potato','Sorghum','Sweet Potato','Teff','Tomato','Wheat','Other']

const MAP_CENTRES = {
  '+251': [38.7578, 9.0192],
  '09':   [38.7578, 9.0192],
  '07':   [38.7578, 9.0192],
  '+254': [36.8219, -1.2921],
  '+256': [32.5825,  0.3476],
  '+255': [39.2083, -6.7924],
  '+250': [29.8739, -1.9403],
}

let pmtilesProtocolRegistered = false
let _localTileBlobUrl = null

function centreForState(state) {
  const prefix = state?.phonePrefix ?? '+254'
  return MAP_CENTRES[prefix] ?? [38.7578, 9.0192]
}

export async function renderMap(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const fieldMode = state?.fieldMode ?? null

  if (!fieldMode) {
    const prefix = state?.phonePrefix ?? '+251'
    const pricing = COUNTRY_PRICING[prefix]
    const boundAvailable = !!(pricing?.rate)
    const priceLabel = boundAvailable
      ? t('rate_display', lang, { currency: pricing.currency, rate: pricing.rate })
      : t('price_coming_soon', lang)

    const existingFields = state?.userConfig?.fields ?? []
    const hasBoundaryField = existingFields.some(f => f.registrationType === 'boundary')

    const pinCard = hasBoundaryField ? '' : `
      <div class="mode-card" id="select-pin">
        <span class="mode-badge mode-badge-free">${t('mode_pin_free_badge', lang)}</span>
        <strong>📍 ${t('mode_pin', lang)}</strong>
        <p>${t('mode_pin_desc', lang)}</p>
        <ul class="mode-features">
          <li>${t('mode_pin_feat_weather', lang)}</li>
          <li>${t('mode_pin_feat_soil', lang)}</li>
          <li>${t('mode_pin_feat_calc', lang)}</li>
        </ul>
      </div>
    `

    const boundCard = `
      <div class="mode-card ${boundAvailable ? '' : 'mode-card-unavailable'}" id="select-boundary">
        <span class="mode-badge ${boundAvailable ? 'mode-badge-paid' : 'mode-badge-soon'}">${priceLabel}</span>
        <strong>🗺️ ${t('mode_boundary', lang)}</strong>
        <p>${hasBoundaryField ? t('bound_has_existing', lang) : t('bound_new_desc', lang)}</p>
        <ul class="mode-features">
          <li>${t('bound_feat_plus', lang)}</li>
          <li>${t('bound_feat_irrigation', lang)}</li>
          <li>${t('bound_feat_forecast', lang)}</li>
          <li>${t('bound_feat_enterprise', lang)}</li>
        </ul>
      </div>
    `

    container.innerHTML = `
      <div class="screen screen-map-select">
        <button class="btn-back" id="mode-back-btn">${t('back', lang)}</button>
        <h2>${t('mode_select_title', lang)}</h2>
        ${hasBoundaryField ? `<p class="hint-text">${t('bound_existing_note', lang)}</p>` : ''}
        <div class="mode-cards">
          ${pinCard}
          ${boundCard}
        </div>
        <div id="bound-unavailable-msg" class="hidden info-box">
          <p>🌍 <strong>${t('bound_unavailable_title', lang)}</strong></p>
          <p>${t('bound_unavailable_note', lang)}</p>
          <button class="btn-ghost" id="dismiss-unavailable">${t('back', lang)}</button>
        </div>
      </div>
    `

    container.querySelector('#mode-back-btn').addEventListener('click', () => navigate('home'))

    container.querySelector('#select-pin')?.addEventListener('click', async () => {
      await saveState({ fieldMode: 'pin' })
      navigate('map')
    })

    container.querySelector('#select-boundary').addEventListener('click', async () => {
      if (!boundAvailable) {
        container.querySelector('.mode-cards').classList.add('hidden')
        container.querySelector('#bound-unavailable-msg').classList.remove('hidden')
        return
      }
      await saveState({ fieldMode: 'boundary' })
      navigate('map')
    })

    container.querySelector('#dismiss-unavailable').addEventListener('click', () => {
      container.querySelector('.mode-cards').classList.remove('hidden')
      container.querySelector('#bound-unavailable-msg').classList.add('hidden')
    })

    return
  }

  // Listen for MAP_LOADED postMessage from service worker (Share Target flow)
  const onMapLoaded = async (event) => {
    if (event.data?.type === 'MAP_LOADED') {
      showToast(t('map_loaded_toast', lang))
      await saveState({ mapSource: 'local' })
      navigator.serviceWorker.removeEventListener('message', onMapLoaded)
      navigate('map')
    }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', onMapLoaded)
  }

  // Check for local PMTiles (safe — never blocks map render)
  let localMaps = []
  try { localMaps = await listLocalMaps() } catch (_) {}
  const hasLocal = localMaps.length > 0

  // Register PMTiles protocol once
  if (!pmtilesProtocolRegistered) {
    try {
      const protocol = new Protocol()
      mapboxgl.addProtocol('pmtiles', protocol.tile.bind(protocol))
      pmtilesProtocolRegistered = true
    } catch (_) {}
  }

  // Get saved mapSource from state, default to 'online' if no local maps
  let mapSource = (hasLocal && state?.mapSource === 'local') ? 'local' : 'online'

  // Determine whether to show the file input fallback
  const shareTargetUnavailable = !(window.matchMedia('(display-mode: standalone)').matches && 'share' in navigator)

  // Date range: 3 months ago → 1 month ahead
  function toDateStr(d) { return d.toISOString().slice(0, 10) }
  const today = new Date()
  const minDate = new Date(today); minDate.setMonth(minDate.getMonth() - 3)
  const maxDate = new Date(today); maxDate.setMonth(maxDate.getMonth() + 1)

  // Restore crop — use cropName (pure crop without prefix) for select restoration
  const STD_CROPS = ['barley','broccoli','cabbage','garlic','kale','lentils','maize','onion','pepper','potato','sorghum','sweet potato','teff','tomato','wheat']
  const savedCropName = state?.cropName ?? state?.crop ?? ''
  const isStdCrop = STD_CROPS.includes(savedCropName.toLowerCase())
  const restoredSelect = isStdCrop ? savedCropName.toLowerCase() : (savedCropName ? 'other' : '')
  const restoredOther  = isStdCrop ? '' : savedCropName
  const restoredPrefix = state?.cropPrefix ?? ''

  container.innerHTML = `
    <div class="screen screen-map">
      <div class="map-top-row">
        <button class="btn-back" id="map-back-btn">${t('change_method', lang)}</button>
        <div id="load-map-file-row" class="${shareTargetUnavailable ? '' : 'hidden'}">
          <label class="btn-ghost load-map-label">
            ${t('load_map_file', lang)}
            <input id="load-map-input" type="file" accept=".pmtiles" class="hidden" />
          </label>
        </div>
      </div>
      <div id="source-switcher" class="${hasLocal ? '' : 'hidden'}">
        <button id="btn-online" class="source-btn ${mapSource === 'online' ? 'active' : ''}">${t('map_source_online', lang)}</button>
        <button id="btn-local" class="source-btn ${mapSource === 'local' ? 'active' : ''}">${t('map_source_local', lang)}</button>
      </div>
      <div class="gps-coord-row">
        <input id="gps-lat" type="number" step="any" placeholder="${t('gps_lat_placeholder', lang)}" inputmode="decimal" />
        <input id="gps-lng" type="number" step="any" placeholder="${t('gps_lng_placeholder', lang)}" inputmode="decimal" />
        <button id="gps-validate-btn" class="btn-gps-validate" title="Validate coordinates">✓</button>
        <span id="gps-status" class="gps-status"></span>
      </div>
      <div id="map-container"></div>
      <div class="map-form">
        <label>${t('area_label_full', lang)}
          <input id="area-input" type="number" min="0.5" step="0.1"
            ${fieldMode === 'boundary' ? 'readonly' : ''}
            placeholder="Ha"
            value="${fieldMode === 'pin' && state?.hectares ? state.hectares : ''}" />
        </label>
        <div id="area-warning" class="error-text hidden">${t('area_too_small', lang)}</div>
        <div class="crop-prefix-row">
          <label class="crop-prefix-label">${t('field_id_label', lang)}
            <input id="crop-prefix-input" type="text" maxlength="10" placeholder="e.g. E4" value="${restoredPrefix}" />
          </label>
          <label class="crop-select-label">${t('crop_label', lang)}
            <select id="crop-select">
              <option value="">— Select —</option>
              ${CROPS.map(c => {
                const val = c.toLowerCase()
                const key = `crop_${val.replace(/ /g, '_')}`
                return `<option value="${val}"${val === restoredSelect ? ' selected' : ''}>${t(key, lang)}</option>`
              }).join('')}
            </select>
          </label>
        </div>
        <p class="hint-text">${t('field_id_hint', lang)}</p>
        <div id="other-crop-group" class="${restoredSelect === 'other' ? '' : 'hidden'}">
          <label>${t('other_crop_label', lang)}<input id="other-crop-input" type="text" placeholder="e.g. Pepper" value="${restoredOther}" /></label>
        </div>
        <label>${t('planting_date_full', lang)}
          <input id="date-input" type="date"
            min="${toDateStr(minDate)}" max="${toDateStr(maxDate)}"
            value="${state?.plantingDate ?? ''}" />
        </label>
        <div id="map-hint" class="hint-text"></div>
        <button id="continue-btn" class="btn-primary" disabled>${t('continue', lang)}</button>
        <button id="agent-request-btn" class="btn-ghost">${t('request_agent', lang)}</button>
      </div>
    </div>
  `

  container.querySelector('#map-back-btn').addEventListener('click', async () => {
    await saveState({ fieldMode: null })
    navigate('map')
  })

  // Source switcher event listeners
  if (hasLocal) {
    container.querySelector('#btn-online').addEventListener('click', async () => {
      mapSource = 'online'
      await saveState({ mapSource: 'online' })
      navigate('map')
    })
    container.querySelector('#btn-local').addEventListener('click', async () => {
      mapSource = 'local'
      await saveState({ mapSource: 'local' })
      navigate('map')
    })
  }

  // File input event listener (fallback for when Share Target is unavailable)
  container.querySelector('#load-map-input').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    try {
      await importPMTiles(file)
      showToast(t('map_loaded_toast', lang))
      await saveState({ mapSource: 'local' })
      navigate('map')
    } catch (err) {
      showToast('Failed to load map file')
      console.error(err)
    }
  })

  // GPS coordinate input — validate and place pin / fly-to
  const prefix = state?.phonePrefix ?? '+251'
  const bbox = COUNTRY_BBOX[prefix] ?? COUNTRY_BBOX['+251']
  const [latMin, latMax, lngMin, lngMax] = bbox

  const gpsLatEl  = container.querySelector('#gps-lat')
  const gpsLngEl  = container.querySelector('#gps-lng')
  const gpsStatus = container.querySelector('#gps-status')

  function gpsReset() {
    gpsStatus.textContent = ''
    gpsStatus.className = 'gps-status'
  }
  gpsLatEl.addEventListener('input', gpsReset)
  gpsLngEl.addEventListener('input', gpsReset)

  container.querySelector('#gps-validate-btn').addEventListener('click', () => {
    const lat = parseFloat(gpsLatEl.value)
    const lng = parseFloat(gpsLngEl.value)

    const inRange = !isNaN(lat) && !isNaN(lng) &&
      lat >= latMin && lat <= latMax &&
      lng >= lngMin && lng <= lngMax

    if (!inRange) {
      gpsStatus.textContent = '✗'
      gpsStatus.className = 'gps-status gps-invalid'
      showToast(t('gps_out_of_range', lang, { latMin, latMax, lngMin, lngMax }))
      return
    }

    gpsStatus.textContent = '✓'
    gpsStatus.className = 'gps-status gps-valid'

    if (fieldMode === 'pin') {
      pinCoords = { lat, lng }
      if (currentMarker) currentMarker.remove()
      currentMarker = addGreenMarker(map, [lng, lat])
      map.flyTo({ center: [lng, lat], zoom: 15 })
      checkReady()
    } else {
      map.flyTo({ center: [lng, lat], zoom: 14 })
    }
  })

  await saveState({ gpsCoordsStr: null, gpsCoords: null })

  const centre = centreForState(state)
  let map
  if (mapSource === 'local') {
    map = new mapboxgl.Map({
      container: 'map-container',
      center: centre,
      zoom: 14,
      style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d8d8d8' } }] }
    })
  } else {
    map = createMap('map-container', centre)
  }

  // Load local PMTiles source if selected
  if (mapSource === 'local' && hasLocal) {
    map.on('load', async () => {
      try {
        const file = await getMapSource(localMaps[0].filename)
        if (!file) { showToast('Local map file not found'); return }
        if (_localTileBlobUrl) { URL.revokeObjectURL(_localTileBlobUrl); _localTileBlobUrl = null }
        const blobUrl = URL.createObjectURL(file)
        _localTileBlobUrl = blobUrl
        map.addSource('local-tiles', { type: 'raster', url: `pmtiles://${blobUrl}`, tileSize: 256 })
        map.addLayer({ id: 'local-tiles', type: 'raster', source: 'local-tiles' })
      } catch (err) {
        console.error('Failed to load local PMTiles:', err)
        showToast('Could not load local map')
      }
    })
  }

  let pinCoords = null
  let polygon = null
  let currentMarker = null

  // Restore previous pin position when navigating back
  if (fieldMode === 'pin' && state?.gpsCoords?.length) {
    const [lng, lat] = state.gpsCoords[0]
    pinCoords = { lat, lng }
    const restoreMarker = () => {
      currentMarker = addGreenMarker(map, [lng, lat])
      checkReady()
    }
    if (map.loaded()) restoreMarker()
    else map.once('load', restoreMarker)
  }

  if (fieldMode === 'pin') {
    map.on('click', e => {
      pinCoords = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      if (currentMarker) currentMarker.remove()
      currentMarker = addGreenMarker(map, [e.lngLat.lng, e.lngLat.lat])
      checkReady()
    })
  } else {
    const draw = attachDraw(map)
    map.on('draw.create', updateBoundary)
    map.on('draw.update', updateBoundary)
    map.on('draw.delete', () => {
      polygon = null
      container.querySelector('#area-input').value = ''
      container.querySelector('#area-warning').classList.add('hidden')
      checkReady()
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
      container.querySelector('#area-input').value = ha.toFixed(2)
      const warn = container.querySelector('#area-warning')
      if (ha < MIN_FARM_HA) {
        warn.classList.remove('hidden')
      } else {
        warn.classList.add('hidden')
      }
      checkReady()
    }
  }

  function checkReady() {
    const ha = parseFloat(container.querySelector('#area-input').value)
    const cropSelect = container.querySelector('#crop-select').value
    const otherCropVal = container.querySelector('#other-crop-input').value.trim()
    const plantingDate = container.querySelector('#date-input').value
    let hint = ''
    if (fieldMode === 'pin') {
      if (!pinCoords) hint = t('hint_drop_pin', lang)
    } else {
      if (!polygon) hint = t('hint_draw_boundary', lang)
    }
    if (!hint && (!ha || ha < MIN_FARM_HA)) hint = t('hint_area_min', lang, { min: MIN_FARM_HA })
    if (!hint && !cropSelect) hint = t('hint_select_crop', lang)
    if (!hint && cropSelect === 'other' && !otherCropVal) hint = t('hint_enter_crop', lang)
    if (!hint && !plantingDate) hint = t('hint_select_date', lang)
    container.querySelector('#map-hint').textContent = hint
    container.querySelector('#continue-btn').disabled = hint !== ''
    return hint
  }

  container.querySelector('#crop-select').addEventListener('change', e => {
    const otherGroup = container.querySelector('#other-crop-group')
    if (e.target.value === 'other') {
      otherGroup.classList.remove('hidden')
    } else {
      otherGroup.classList.add('hidden')
    }
    checkReady()
  })

  container.addEventListener('input', e => {
    if (['other-crop-input', 'area-input', 'date-input'].includes(e.target.id)) checkReady()
  })

  // Evaluate pre-filled values immediately so the Continue button state is correct on load
  checkReady()

  container.querySelector('#continue-btn').addEventListener('click', async () => {
    const ha = parseFloat(container.querySelector('#area-input').value)
    const cropSelect = container.querySelector('#crop-select').value
    const otherCropVal = container.querySelector('#other-crop-input').value.trim()
    const cropPrefix = container.querySelector('#crop-prefix-input').value.trim()
    const cropName = cropSelect === 'other' ? otherCropVal : cropSelect
    const crop = cropPrefix ? `${cropPrefix}-${cropName}` : cropName
    const plantingDate = container.querySelector('#date-input').value

    let gpsCoordsStr = ''
    let gpsCoords = []
    if (fieldMode === 'pin') {
      if (!pinCoords) { showToast(t('toast_drop_pin', lang)); return }
      gpsCoordsStr = `${pinCoords.lng.toFixed(6)},${pinCoords.lat.toFixed(6)}`
      gpsCoords = [[pinCoords.lng, pinCoords.lat]]
    } else {
      if (!polygon) { showToast(t('toast_draw_boundary', lang)); return }
      gpsCoords = polygon.geometry.coordinates[0].slice(0, -1)
      gpsCoordsStr = gpsCoords.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';')
    }

    await saveState({ hectares: ha, cropName, cropPrefix, crop, plantingDate, gpsCoordsStr, gpsCoords })
    if (fieldMode === 'pin') {
      postFieldRequest({
        phone: state.phone,
        fieldMode: 'pin',
        hectares: ha,
        crop,
        plantingDate,
        annualPriceBirr: 0,
        currency: '',
        discount: 0,
        paymentStatus: 'free',
        gpsCoordsStr,
        via: state?.agentPhone ?? 'self'
      }).catch(() => {})
      navigate('complete')
    } else {
      navigate('pricing')
    }
  })

  container.querySelector('#agent-request-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#agent-request-btn')
    btn.disabled = true
    btn.classList.add('btn-loading')
    const via = state?.agentPhone ?? 'self'
    await postAgentRequest({
      phone: state.phone,
      name: state.name,
      region: state.region,
      woreda: state.woreda,
      language: lang,
      via
    })
    navigate('agent-sent')
  })
}
