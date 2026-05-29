import { postDownloadView } from '../crm.js'
import { APP_SCREENSHOTS } from '../app-screenshots.js'
import { t } from '../i18n.js'
import { APK_DOWNLOAD_URL } from '../config.js'

export async function renderDownload(container, state, navigate) {
  const lang = state?.language ?? 'en'
  const phone = state?.phone ?? ''

  // Log page view to APK Downloads sheet
  postDownloadView({ phone }).catch(() => {})

  // Check APK availability and version
  let apkStatus = { available: false, version: '' }
  try {
    const versionRes = await fetch('/apk-download/version.json')
    if (versionRes.ok) {
      const versionData = await versionRes.json()

      const apkRes = await fetch(APK_DOWNLOAD_URL, { method: 'HEAD' })
      if (apkRes.ok) {
        apkStatus = { available: true, version: versionData.version }
      }
    }
  } catch (e) {
    console.error('APK check failed', e)
  }

  const downloadSection = apkStatus.available
    ? `<a href="${APK_DOWNLOAD_URL}?src=app" class="btn-primary btn-download-apk" id="android-btn">▶ Download Android App <span class="apk-version">${apkStatus.version}</span></a>`
    : `<div class="maintenance-notice">
         <div class="maintenance-icon">🛠️</div>
         <h3>App Update in Progress</h3>
         <p>The Android APK is currently unavailable due to scheduled maintenance. We are working to get it back online as quickly as possible.</p>
         <div class="maintenance-footer">Please check back soon!</div>
       </div>`

  container.innerHTML = `
    <div class="screen screen-download">
      <button class="btn-back">← ${t('back', lang).replace('← ', '')}</button>

      <h2>Download the Rigrow App</h2>
      <p class="teaser">Get farm-level weather insights, savings tools, and personalised advice — all in your pocket.</p>

      <div class="screenshot-gallery">
        ${APP_SCREENSHOTS.map((src, i) => `<img src="${src}" alt="App screen ${i + 1}" />`).join('')}
      </div>

      <div class="download-note">
        <strong>Note:</strong> You will need the userId sent to your SMS to login.
      </div>

      ${downloadSection}

      <div class="download-requirements">
        <strong>Requirements</strong>
        <ul>
          <li>Any smartphone with a touch screen — including low-end devices</li>
          <li>A few minutes of internet connection per day</li>
        </ul>
      </div>

      <button id="home-btn" class="btn-ghost">${t('back_to_home', lang)}</button>
    </div>

    <div id="download-modal" class="modal-overlay hidden">
      <div class="modal-box">
        <div class="modal-icon">✅</div>
        <h3>Download started!</h3>
        <p>Watch your <strong>Downloads</strong> folder. Once the file is saved, open it to install the Rigrow app.</p>
        <button id="modal-ok-btn" class="btn-primary">OK</button>
      </div>
    </div>
  `

  container.querySelector('.btn-back').addEventListener('click', () => navigate('home'))
  container.querySelector('#home-btn').addEventListener('click', () => navigate('home'))

  if (apkStatus.available) {
    container.querySelector('#android-btn').addEventListener('click', () => {
      const modal = container.querySelector('#download-modal')
      modal.classList.remove('hidden')
      setTimeout(() => modal.classList.add('hidden'), 5000)
    })
  }

  const modalOkBtn = container.querySelector('#modal-ok-btn')
  if (modalOkBtn) {
    modalOkBtn.addEventListener('click', () => {
      container.querySelector('#download-modal').classList.add('hidden')
    })
  }
}
