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
