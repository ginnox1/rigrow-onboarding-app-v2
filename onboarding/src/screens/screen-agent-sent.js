import { t } from '../i18n.js'

export async function renderAgentSent(container, state, navigate) {
  const lang = state?.language ?? 'en'
  container.innerHTML = `
    <div class="screen screen-agent-sent">
      <div class="success-banner">Request sent!</div>
      <p>An agent will reach out to help register your farm. You will receive a call or SMS shortly.</p>
      <button id="home-btn" class="btn-primary">${t('back_to_home', lang)}</button>
    </div>
  `
  container.querySelector('#home-btn').addEventListener('click', () => navigate('home'))
}
