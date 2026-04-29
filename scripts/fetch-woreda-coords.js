#!/usr/bin/env node
// Fetches centroid coordinates for every woreda in locale-data.json.
// Tries Nominatim first; falls back to Google Geocoding API for misses.
// Safe to interrupt and resume — already-fetched entries are skipped.
// Run: node scripts/fetch-woreda-coords.js

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH  = path.join(__dirname, '../onboarding/public/locale-data.json')
const OUT_PATH   = path.join(__dirname, '../onboarding/public/locale-coords.json')
const ENV_PATH   = path.join(__dirname, '../.env.example')

const COUNTRY_NAMES = { et: 'Ethiopia', ke: 'Kenya', ug: 'Uganda', tz: 'Tanzania', rw: 'Rwanda' }
const COUNTRY_CODES = { et: 'ET', ke: 'KE', ug: 'UG', tz: 'TZ', rw: 'RW' }

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Read GOOGLE_MAPS_API_KEY_TO_BE_REMOVED from .env.example
function readGoogleKey() {
  try {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n')
    const line = lines.find(l => l.startsWith('GOOGLE_MAPS_API_KEY_TO_BE_REMOVED='))
    return line ? line.split('=')[1].trim() : null
  } catch { return null }
}

async function fetchNominatim(name, region, countryName, countryCode) {
  const q = `${name}, ${region}, ${countryName}`
  const params = new URLSearchParams({ q, format: 'json', limit: 1, countrycodes: countryCode, addressdetails: 0 })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'Rigrow-Onboarding/2 (arayamengistu@gmail.com)' }
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const data = await res.json()
  if (data.length && data[0].lat) {
    return [
      parseFloat(parseFloat(data[0].lat).toFixed(5)),
      parseFloat(parseFloat(data[0].lon).toFixed(5))
    ]
  }
  return null
}

async function fetchGoogle(name, region, countryName, iso, apiKey) {
  const address = `${name}, ${region}, ${countryName}`
  const params = new URLSearchParams({
    address,
    components: `country:${COUNTRY_CODES[iso] ?? iso}`,
    key: apiKey
  })
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`)
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`)
  const data = await res.json()
  if (data.status === 'OK' && data.results.length) {
    const loc = data.results[0].geometry.location
    return [
      parseFloat(loc.lat.toFixed(5)),
      parseFloat(loc.lng.toFixed(5))
    ]
  }
  return null
}

const googleKey = readGoogleKey()
if (googleKey) {
  console.log('Google Geocoding API key found — will use as fallback for Nominatim misses.')
} else {
  console.log('No Google API key found — Nominatim only.')
}

const sourceData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
const existing   = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : {}
const result     = { ...existing }

let total = 0, done = 0, found = 0
for (const regions of Object.values(sourceData)) {
  for (const woredas of Object.values(regions)) total += woredas.length
}

for (const [iso, regions] of Object.entries(sourceData)) {
  const countryName = COUNTRY_NAMES[iso] ?? iso
  for (const [region, woredas] of Object.entries(regions)) {
    for (const entry of woredas) {
      const name = Array.isArray(entry) ? entry[0] : entry
      done++
      if (result[name]) {
        process.stdout.write(`\r[${done}/${total}] skip       ${name.padEnd(35)}`)
        continue
      }
      try {
        const coords = await fetchGoogle(name, region, countryName, iso, googleKey)
        if (coords) { result[name] = coords; found++ }
        process.stdout.write(`\r[${done}/${total}] ${coords ? '✓' : '✗'}     ${name.padEnd(35)}`)
      } catch (err) {
        process.stdout.write(`\r[${done}/${total}] ERR   ${name.padEnd(35)} ${err.message}`)
      }
      await sleep(50) // Google allows much higher rate
      fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2))
    }
  }
}

console.log(`\n\nDone. ${found} new coordinates found → ${OUT_PATH}`)
console.log(`Total in file: ${Object.keys(result).length}`)
