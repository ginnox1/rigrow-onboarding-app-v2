const APP_URL = window.location.origin

function shareText() {
  return `Try Rigrow — smart farm insights for smallholders. Register here: ${APP_URL}`
}

export function shareButtonHTML(id = 'share-btn') {
  return `<button id="${id}" class="btn-ghost share-trigger">🔗 Share Rigrow</button>`
}

export function shareFallbackHTML(id = 'share-fallback') {
  const text = encodeURIComponent(shareText())
  return `
    <div id="${id}" class="share-fallback hidden">
      <a href="https://wa.me/?text=${text}" target="_blank" rel="noopener noreferrer" class="share-pill share-pill-wa">WhatsApp</a>
      <a href="sms:?body=${text}" class="share-pill share-pill-sms">SMS</a>
      <button class="share-pill share-pill-copy" data-share-copy>Copy link</button>
    </div>
  `
}

export function attachShare(root, btnId = 'share-btn', fallbackId = 'share-fallback') {
  const btn      = root.getElementById ? root.getElementById(btnId) : root.querySelector(`#${btnId}`)
  const fallback = root.getElementById ? root.getElementById(fallbackId) : root.querySelector(`#${fallbackId}`)
  if (!btn || !fallback) return

  btn.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Rigrow', text: shareText(), url: APP_URL })
        return
      } catch (e) {
        if (e.name === 'AbortError') return // user cancelled — don't show fallback
      }
    }
    fallback.classList.remove('hidden')
  })

  fallback.querySelector('[data-share-copy]')?.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(APP_URL)
      this.textContent = 'Copied!'
      setTimeout(() => { this.textContent = 'Copy link' }, 2000)
    } catch {
      this.textContent = 'Copy failed'
    }
  })
}
