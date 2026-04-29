let _names = null
let _coords = null

async function loadNames() {
  if (_names) return _names
  try { _names = await (await fetch('/locale-data.json')).json() } catch { _names = {} }
  return _names
}

async function loadCoords() {
  if (_coords) return _coords
  try { _coords = await (await fetch('/locale-coords.json')).json() } catch { _coords = {} }
  return _coords
}

// Entry format: string (English only) or [en, am, om] tuple
function parseEntry(entry) {
  if (typeof entry === 'string') return { en: entry, am: '', om: '' }
  const [en = '', am = '', om = ''] = entry
  return { en, am, om }
}

export async function getCoords(canonicalName) {
  const coords = await loadCoords()
  const c = coords[canonicalName]
  return c ? { lat: c[0], lon: c[1] } : null
}

export async function searchWoredas(query, countryISO, region, lang = 'en') {
  if (!query || query.length < 2) return []
  const [names, coords] = await Promise.all([loadNames(), loadCoords()])
  const countryData = names[countryISO]
  if (!countryData) return []

  const list = region && countryData[region]
    ? countryData[region]
    : Object.values(countryData).flat()

  const q = query.toLowerCase()

  return list
    .filter(entry => {
      const { en, am, om } = parseEntry(entry)
      return en.toLowerCase().includes(q) ||
             (am && am.toLowerCase().includes(q)) ||
             (om && om.toLowerCase().includes(q))
    })
    .slice(0, 8)
    .map(entry => {
      const { en, am, om } = parseEntry(entry)
      const display = (lang === 'am' && am) ? am
                    : (lang === 'om' && om) ? om
                    : en
      const c = coords[en]
      return { name: display, canonical: en, lat: c?.[0] ?? null, lon: c?.[1] ?? null }
    })
}
