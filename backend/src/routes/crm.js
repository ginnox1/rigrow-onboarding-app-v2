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
    const webhookRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    })
    if (!webhookRes.ok) {
      console.error('[CRM relay] Webhook returned error status:', webhookRes.status)
      return res.status(502).json({ error: `Webhook error: ${webhookRes.status}` })
    }
    res.json({ status: 'relayed' })
  } catch (err) {
    console.error('[CRM relay] Webhook failed:', err.message)
    res.status(502).json({ error: 'Webhook unavailable' })
  }
})
