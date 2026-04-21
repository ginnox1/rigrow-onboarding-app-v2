import { saveState } from '../storage.js'
import { postAgentRequest } from '../crm.js'
import { createMap, attachDraw, calcHectares, hasSelfIntersection, addGreenMarker, mapboxgl } from '../map.js'
import { MIN_FARM_HA } from '../config.js'
import { t } from '../i18n.js'
import { showToast } from '../main.js'
import { Protocol, PMTiles } from 'pmtiles'
import { importPMTiles, listLocalMaps, getMapSource } from '../offlineMap.js'

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
    container.innerHTML = `
      <div class="screen screen-map-select">
        <h2>${t('mode_select_title', lang)}</h2>
        <div class="mode-cards">
          <div class="mode-card" id="select-pin"><strong>${t('mode_pin', lang)}</strong><p>Drop a point, enter area manually</p></div>
          <div class="mode-card" id="select-boundary"><strong>${t('mode_boundary', lang)}</strong><p>Draw farm boundary — area auto-calculated</p></div>
        </div>
      </div>
    `
    container.querySelector('#select-pin').addEventListener('click', async () => {
      await saveState({ fieldMode: 'pin' })
      navigate('map')
    })
    container.querySelector('#select-boundary').addEventListener('click', async () => {
      await saveState({ fieldMode: 'boundary' })
      navigate('map')
    })
    return
  }

  // Listen for MAP_LOADED postMessage from service worker (Share Target flow)
  const onMapLoaded = async (event) => {
    if (event.data?.type === 'MAP_LOADED') {
      showToast('Map loaded — ready for offline use')
      await saveState({ mapSource: 'local' })
      navigator.serviceWorker.removeEventListener('message', onMapLoaded)
      navigate('map')
    }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', onMapLoaded)
  }

  // Check for local PMTiles
  const localMaps = await listLocalMaps()
  const hasLocal = localMaps.length > 0

  // Register PMTiles protocol once
  if (!pmtilesProtocolRegistered) {
    const protocol = new Protocol()
    mapboxgl.addProtocol('pmtiles', protocol.tile.bind(protocol))
    pmtilesProtocolRegistered = true
  }

  // Get saved mapSource from state, default to 'online' if no local maps
  let mapSource = (hasLocal && state?.mapSource === 'local') ? 'local' : 'online'

  // Determine whether to show the file input fallback
  const shareTargetUnavailable = !(window.matchMedia('(display-mode: standalone)').matches && 'share' in navigator)

  container.innerHTML = `
    <div class="screen screen-map">
      <button class="btn-back">${t('back', lang)}</button>
      <div id="source-switcher" class="${hasLocal ? '' : 'hidden'}">
        <button id="btn-online" class="source-btn ${mapSource === 'online' ? 'active' : ''}">🌐 Online Map</button>
        <button id="btn-local" class="source-btn ${mapSource === 'local' ? 'active' : ''}">📁 Local Map</button>
      </div>
      <div id="load-map-file-row" class="${shareTargetUnavailable ? '' : 'hidden'}">
        <label class="btn-ghost load-map-label">
          Load map file
          <input id="load-map-input" type="file" accept=".pmtiles" class="hidden" />
        </label>
      </div>
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
      showToast('Map loaded — ready for offline use')
      await saveState({ mapSource: 'local' })
      navigate('map')  // re-render to show switcher
    } catch (err) {
      showToast('Failed to load map file')
      console.error(err)
    }
  })

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

  if (fieldMode === 'pin') {
    map.on('click', e => {
      pinCoords = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      if (currentMarker) currentMarker.remove()
      currentMarker = addGreenMarker(map, [e.lngLat.lng, e.lngLat.lat])
    })
  } else {
    const draw = attachDraw(map)
    map.on('draw.create', updateBoundary)
    map.on('draw.update', updateBoundary)
    map.on('draw.delete', () => {
      polygon = null
      container.querySelector('#area-input').value = ''
      container.querySelector('#area-warning').classList.add('hidden')
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
        container.querySelector('#crop-select').disabled = true
        container.querySelector('#date-input').disabled = true
        container.querySelector('#continue-btn').disabled = true
      } else {
        warn.classList.add('hidden')
        container.querySelector('#crop-select').disabled = false
        container.querySelector('#date-input').disabled = false
        container.querySelector('#continue-btn').disabled = false
      }
    }
  }

  container.querySelector('#continue-btn').addEventListener('click', async () => {
    const ha = parseFloat(container.querySelector('#area-input').value)
    const crop = container.querySelector('#crop-select').value
    const plantingDate = container.querySelector('#date-input').value

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
      gpsCoords = polygon.geometry.coordinates[0].slice(0, -1)
      gpsCoordsStr = gpsCoords.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';')
    }

    await saveState({ hectares: ha, crop, plantingDate, gpsCoordsStr, gpsCoords })
    navigate('pricing')
  })

  container.querySelector('#agent-request-btn').addEventListener('click', async () => {
    const via = state?.agentPhone ?? 'self'
    await postAgentRequest({
      phone: state.phone,
      name: state.name,
      region: state.region,
      woreda: state.woreda,
      language: lang,
      via
    })
    showToast(t('agent_requested', lang))
    navigate('pricing')
  })
}
