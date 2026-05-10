export default async function handler(req, res) {
  const apkUrl = process.env.APK_STORAGE_URL
  if (!apkUrl) return res.status(503).send('APK not available')

  const source = req.query.src ?? 'direct'
  const webhookUrl = process.env.CRM_SHEETS_WEBHOOK_URL

  if (webhookUrl) {
    const payload = {
      event: 'app_download_view',
      phone: 'link',
      source,
      timestamp: new Date().toISOString(),
    }
    // Fire-and-forget — don't delay the redirect
    const url = webhookUrl.includes('script.google.com')
      ? webhookUrl + '?data=' + encodeURIComponent(JSON.stringify(payload))
      : webhookUrl
    fetch(url, webhookUrl.includes('script.google.com') ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }

  res.redirect(302, apkUrl)
}
