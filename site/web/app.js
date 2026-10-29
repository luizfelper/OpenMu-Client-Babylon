// The public site is a small, dependency-free reader of /api/site. All text from the API is
// escaped before it reaches innerHTML; news bodies arrive already rendered and escaped by the
// server's Markdown renderer.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  data: null,
  plans: [],
  payments: { enabled: false, configured: false },
  urls: { play: '', register: '' },
  player: null,
  playerPanel: null,
  pendingPlanId: null,
  vipPlansOpen: false,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value) {
  if (!value) return null;
  if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function clientUrlFallback() {
  const { protocol, hostname, port } = window.location;
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return null;
  if (hostname.startsWith('play.')) {
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  }
  // IP mode: the site runs on :8082 and the client on port 80 of the same host.
  if (port === '8082') return `${protocol}//${hostname}`;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  const base = hostname.replace(/^(www|site)\./, '');
  const suffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
  return `${protocol}//play.${base}${suffix}`;
}

function resolveLink(value) {
  if (value === '@register') return safeUrl(state.urls.register);
  if (value === '@play') return safeUrl(state.urls.play) || clientUrlFallback();
  return safeUrl(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function formatBrl(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function formatDate(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatWeek(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return `Semana de ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}`;
}

function showToast(message, error = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 5200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body && body.error ? body.error : `Erro ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value ?? '';
}

function showAuthError(id, message) {
  const box = $(`#${id}`);
  if (!box) {
    showToast(message, true);
    return;
  }
  box.textContent = message;
  box.hidden = false;
}

function setAuthMode(mode) {
  const register = mode === 'register';
  const loginForm = $('#auth-login-form');
  const registerForm = $('#auth-register-form');
  if (loginForm) loginForm.hidden = register;
  if (registerForm) registerForm.hidden = !register;
  $$('[data-auth-tab]').forEach(tab => {
    const active = tab.dataset.authTab === (register ? 'register' : 'login');
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  setText('#auth-title', register ? 'Criar conta' : 'Entrar');
}

function closeMobileNav() {
  const nav = $('#main-nav');
  const toggle = $('#nav-toggle');
  if (nav) nav.classList.remove('open');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function showAuthModal(mode = 'login') {
  setAuthMode(mode);
  const modal = $('#auth-modal');
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  closeMobileNav();
  const focus = mode === 'register' ? '#auth-register-account' : '#auth-login-account';
  setTimeout(() => $(focus)?.focus(), 30);
}

function closeAuthModal() {
  const modal = $('#auth-modal');
  if (!modal) return;
  modal.hidden = true;
  const loginError = $('#auth-login-error');
  const registerError = $('#auth-register-error');
  if (loginError) loginError.hidden = true;
  if (registerError) registerError.hidden = true;
  if ($('#vip-modal')?.hidden) document.body.style.overflow = '';
}

function updateVipAccess() {
  const logged = Boolean(state.player);
  const open = state.vipPlansOpen;
  const gate = $('#vip-gate');
  const grid = $('#vip-grid');
  const note = $('#vip-note');
  const planos = $('#vip-planos');
  if (gate) gate.hidden = !open || logged;
  if (grid) grid.hidden = !open || !logged;
  if (note) note.hidden = !open || !logged;
  if (planos) planos.hidden = !open;
}

function closeUserPanel() {
  const panel = $('#user-panel');
  const toggle = $('#user-menu-toggle');
  if (panel) panel.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function renderVipHistory(history) {
  const box = $('#user-vip-history');
  if (!box) return;
  const rows = Array.isArray(history) ? history : [];
  if (!rows.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML =
    '<span class="user-game-label">Histórico VIP</span>' +
    `<ul>${rows
      .map(
        row => `<li class="${row.active ? 'active' : 'past'}">` +
          `<strong>${escapeHtml(row.plan_name || 'VIP')}</strong>` +
          `<span>${escapeHtml(formatDate(row.starts_at))} até ${escapeHtml(formatDate(row.expires_at))}</span>` +
          (row.active ? '<em>ativo</em>' : '') +
          '</li>'
      )
      .join('')}</ul>`;
}

function renderGameStats(game) {
  const box = $('#user-game-stats');
  if (!box) return;
  if (!game?.available || !game.online || !game.inWorld) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  const rows = [
    ['Personagem', game.character || '—'],
    ['Classe', game.class_name || '—'],
    ['Nível', formatNumber(game.level)],
    ['Zen', formatNumber(game.money)],
    ['Vida', game.maxHp > 0 ? `${formatNumber(game.hp)} / ${formatNumber(game.maxHp)}` : '—'],
    ['Estado', game.hero_state_name || '—'],
    ['Mapa', game.map_name || '—'],
    ['Posição', `${formatNumber(game.x)}, ${formatNumber(game.y)}`],
    ['Guild', game.guild || '—'],
  ];
  box.innerHTML = rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
}

function syncMapButton() {
  const select = $('#user-map-select');
  const button = $('#user-map-button');
  const panelState = state.playerPanel;
  if (!select || !button) return;
  button.disabled = !select.value || !panelState?.panel?.allowed || !panelState?.game?.online || !panelState?.game?.inWorld;
}

function renderUserPanel() {
  if (!state.player) return;
  setText('#user-panel-account', state.player.account);
  setText('#auth-account-name', state.player.account);
  const initial = $('#auth-account-initial');
  if (initial) initial.textContent = (state.player.account || '?').slice(0, 1).toUpperCase();
  const panelButton = $('#user-panel-button');
  if (panelButton) panelButton.hidden = false;
  const headerPanel = $('#header-panel');
  if (headerPanel) headerPanel.hidden = true;

  const panelState = state.playerPanel;
  const vip = panelState?.vip;
  const badge = $('#user-vip-badge');
  if (badge) {
    badge.textContent = vip?.active ? vip.planName || 'VIP' : 'Jogador';
    badge.classList.toggle('active', Boolean(vip?.active));
  }
  const vipStatus = $('#user-vip-status');
  if (vipStatus) {
    if (!panelState) {
      vipStatus.textContent = 'Consultando status VIP...';
    } else if (vip?.active) {
      const until = vip.expiresAt ? formatDate(vip.expiresAt) : '';
      vipStatus.textContent = `${vip.planName || 'VIP'} ativo${until ? ` até ${until}` : ''} • ${formatNumber(vip.daysLeft)} dia(s) restante(s).`;
    } else {
      vipStatus.textContent = 'Sua conta ainda não tem VIP ativo.';
    }
  }
  renderVipHistory(panelState?.vip_history);

  const game = panelState?.game;
  const gameStatus = $('#user-game-status');
  const gameDetail = $('#user-game-detail');
  if (gameStatus) {
    if (!game || !game.available) gameStatus.textContent = 'Status indisponível';
    else if (!game.online) gameStatus.textContent = 'Offline';
    else if (!game.inWorld) gameStatus.textContent = 'Na seleção de personagem';
    else gameStatus.textContent = game.character || 'Personagem online';
  }
  if (gameDetail) {
    if (game?.available && game.online && game.inWorld) {
      const parts = [game.class_name, game.map_name || 'Mapa', `Nível ${formatNumber(game.level)}`];
      if (game.hp > 0 || game.maxHp > 0) parts.push(`HP ${formatNumber(game.hp)}/${formatNumber(game.maxHp)}`);
      if (game.guild) parts.push(`Guild: ${game.guild}`);
      gameDetail.textContent = parts.filter(Boolean).join(' • ');
    } else if (game?.available && game.online) {
      gameDetail.textContent = 'Entre no mundo com um personagem para trocar de mapa.';
    } else {
      gameDetail.textContent = '';
    }
  }
  renderGameStats(game);

  const panel = panelState?.panel;
  const allowed = Boolean(panel?.allowed);
  const select = $('#user-map-select');
  if (select) {
    const maps = Array.isArray(panelState?.maps) ? panelState.maps : [];
    const selected = select.value;
    select.innerHTML =
      '<option value="">Escolha o destino</option>' +
      maps
        .map(
          map =>
            `<option value="${escapeHtml(map.id)}">${escapeHtml(map.name)} — Nv ${escapeHtml(map.level)} • ${escapeHtml(formatNumber(map.zen))} zen</option>`
        )
        .join('');
    if (selected) select.value = selected;
    select.disabled = !allowed || !game?.online || !game?.inWorld;
  }

  const note = $('#user-panel-note');
  if (note) {
    note.classList.toggle('locked', Boolean(panel?.vip_only && !vip?.active));
    if (!panelState) note.textContent = 'Não foi possível consultar o painel agora. Tente novamente.';
    else if (!allowed) note.textContent = panel.message || 'A troca de mapa pelo site é exclusiva para VIP.';
    else if (!game?.available) note.textContent = 'Não foi possível consultar o jogo agora. Tente novamente em instantes.';
    else if (!game.online) note.textContent = 'Entre no jogo para consultar o personagem e trocar de mapa.';
    else if (!game.inWorld) note.textContent = 'Selecione um personagem no jogo para trocar de mapa.';
    else note.textContent = panel.message || '';
  }

  syncMapButton();
}

async function loadPlayerPanel() {
  if (!state.player) {
    state.playerPanel = null;
    return;
  }
  try {
    state.playerPanel = await api('/api/player/panel');
  } catch (error) {
    state.playerPanel = null;
    if (/Entre na sua conta/i.test(error.message || '')) {
      state.player = null;
      renderAuth();
      return;
    }
    showToast(error.message || 'Não foi possível consultar o seu painel agora.', true);
  }
  renderUserPanel();
}

async function changeMap() {
  const select = $('#user-map-select');
  const button = $('#user-map-button');
  const mapId = select?.value || '';
  if (!mapId) return;
  if (button) {
    button.disabled = true;
    button.textContent = 'Enviando...';
  }
  try {
    const result = await api('/api/player/warp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ map: mapId }),
    });
    showToast(result.message || 'Pedido de troca de mapa enviado ao jogo.');
    if (select) select.value = '';
    await loadPlayerPanel();
    setTimeout(() => {
      if (state.player) loadPlayerPanel().catch(() => {});
    }, 2000);
  } catch (error) {
    showToast(error.message || 'Não foi possível trocar de mapa.', true);
  } finally {
    if (button) button.textContent = 'Ir';
    syncMapButton();
  }
}

function renderAuth() {
  const open = $('#auth-open');
  const register = $('.auth-cta');
  const account = $('#auth-account');
  const headerPanel = $('#header-panel');
  if (state.player) {
    if (open) open.hidden = true;
    if (register) register.hidden = true;
    if (account) account.hidden = false;
    if (headerPanel) headerPanel.hidden = true;
    renderUserPanel();
  } else {
    if (open) open.hidden = false;
    if (register) register.hidden = false;
    if (account) account.hidden = true;
    if (headerPanel) headerPanel.hidden = false;
    state.playerPanel = null;
    closeUserPanel();
  }
  updateVipAccess();
}

async function loadPlayer() {
  try {
    const result = await api('/api/auth/me');
    state.player = result && result.player ? result.player : null;
  } catch {
    state.player = null;
  }
  renderAuth();
  if (state.player) await loadPlayerPanel().catch(() => {});
}

function afterLogin(player) {
  state.player = player;
  renderAuth();
  loadPlayerPanel().catch(() => {});
  closeAuthModal();
  const loginPassword = $('#auth-login-password');
  if (loginPassword) loginPassword.value = '';
  const registerPassword = $('#auth-register-password');
  const registerConfirm = $('#auth-register-confirm');
  if (registerPassword) registerPassword.value = '';
  if (registerConfirm) registerConfirm.value = '';
  showToast(`Bem-vindo, ${player.account}!`);
  const pending = state.pendingPlanId;
  state.pendingPlanId = null;
  if (pending) openPlanModal(pending);
}

async function handleLogin(event) {
  event.preventDefault();
  const submit = $('#auth-login-submit');
  const account = $('#auth-login-account')?.value.trim() || '';
  const password = $('#auth-login-password')?.value || '';
  const error = $('#auth-login-error');
  if (error) error.hidden = true;
  if (!account || !password) {
    showAuthError('auth-login-error', 'Informe a conta e a senha.');
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Entrando...';
  }
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account, password }),
    });
    afterLogin(result.player);
  } catch (problem) {
    showAuthError('auth-login-error', problem.message || 'Não foi possível entrar.');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Entrar';
    }
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const submit = $('#auth-register-submit');
  const account = $('#auth-register-account')?.value.trim() || '';
  const name = $('#auth-register-name')?.value.trim() || '';
  const email = $('#auth-register-email')?.value.trim() || '';
  const password = $('#auth-register-password')?.value || '';
  const confirm = $('#auth-register-confirm')?.value || '';
  const error = $('#auth-register-error');
  if (error) error.hidden = true;
  if (!account || !name || !email || !password || !confirm) {
    showAuthError('auth-register-error', 'Preencha todos os campos.');
    return;
  }
  if (password !== confirm) {
    showAuthError('auth-register-error', 'As senhas não coincidem.');
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Criando...';
  }
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account, name, email, password, confirm }),
    });
    const accountInput = $('#auth-register-account');
    const nameInput = $('#auth-register-name');
    const emailInput = $('#auth-register-email');
    if (accountInput) accountInput.value = '';
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    afterLogin(result.player);
  } catch (problem) {
    showAuthError('auth-register-error', problem.message || 'Não foi possível criar a conta.');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Criar conta';
    }
  }
}

async function logoutPlayer() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // The cookie may already be gone; clear the local state either way.
  }
  state.player = null;
  state.playerPanel = null;
  state.pendingPlanId = null;
  closePlanModal();
  closeUserPanel();
  renderAuth();
  closeMobileNav();
  showToast('Você saiu da conta.');
}

function bindAuth() {
  $('#auth-open')?.addEventListener('click', () => showAuthModal('login'));
  $('#vip-login')?.addEventListener('click', () => showAuthModal('login'));
  $('#vip-register')?.addEventListener('click', () => showAuthModal('register'));
  $$('[data-open-auth]').forEach(element =>
    element.addEventListener('click', () => showAuthModal(element.dataset.openAuth))
  );
  $('#auth-close')?.addEventListener('click', closeAuthModal);
  $$('[data-close-auth]').forEach(element => element.addEventListener('click', closeAuthModal));
  $$('[data-auth-tab]').forEach(tab =>
    tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab))
  );
  $('#auth-login-form')?.addEventListener('submit', handleLogin);
  $('#auth-register-form')?.addEventListener('submit', handleRegister);
  $('#auth-logout')?.addEventListener('click', logoutPlayer);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#auth-modal')?.hidden) closeAuthModal();
  });
}

function bindUserPanel() {
  const toggle = $('#user-menu-toggle');
  const panel = $('#user-panel');
  toggle?.addEventListener('click', event => {
    event.stopPropagation();
    if (!panel) return;
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    toggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) loadPlayerPanel().catch(() => {});
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('#auth-account')) closeUserPanel();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeUserPanel();
  });
  $('#user-map-select')?.addEventListener('change', syncMapButton);
  $('#user-map-button')?.addEventListener('click', changeMap);
  $('#user-vip-link')?.addEventListener('click', closeUserPanel);
  $('#user-play-link')?.addEventListener('click', closeUserPanel);
}

function applyPlayLinks() {
  const playUrl = safeUrl(state.urls.play) || clientUrlFallback();
  const heroPlay = $('#hero-play');
  if (heroPlay && playUrl) {
    heroPlay.href = playUrl;
    heroPlay.target = '_blank';
    heroPlay.rel = 'noopener';
  }
  const play = $('#user-play-link');
  if (play) {
    play.hidden = !playUrl;
    if (playUrl) play.href = playUrl;
  }
}

function renderOnline(online) {
  const count = $('#online-count');
  const label = $('#online-label');
  const pulse = $('#online-pulse');
  if (!count || !label || !pulse) return;
  if (online && online.available) {
    count.textContent = formatNumber(online.online);
    label.textContent = online.online === 1 ? 'jogador online agora' : 'jogadores online agora';
    pulse.classList.remove('offline');
  } else {
    count.textContent = '—';
    label.textContent = 'Status indisponível';
    pulse.classList.add('offline');
  }
}

function renderHero(data) {
  setText('#brand-name', data.site.name);
  setText('#brand-tagline', String(data.site.tagline || '').split('•')[0].trim() || data.site.tagline);
  setText('#hero-eyebrow', data.site.eyebrow);
  setText('#hero-title', data.site.title);
  setText('#hero-subtitle', data.site.subtitle);
  setText('#hero-text', data.site.text);
  setText('#server-version', data.server.version || '—');
  setText('#vip-notice', data.vip?.notice || '');
  const support = data.vip?.support_email || '';
  const supportLink = $('#vip-support');
  if (supportLink) {
    supportLink.href = `mailto:${support || 'luizfelper@gmail.com'}`;
    supportLink.textContent = support || 'luizfelper@gmail.com';
  }
  document.title = `${data.site.name} — ${data.site.tagline}`;
  applyPlayLinks();

  const facts = Array.isArray(data.server.facts) ? data.server.facts : [];
  const heroFacts = $('#hero-facts');
  if (heroFacts) {
    const rows = facts.slice(0, 4);
    heroFacts.innerHTML = rows
      .map(
        fact =>
          `<div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`
      )
      .join('');
  }

  const rates = data.server.rates || {};
  const maxLevel =
    facts.find(fact => /n[ií]vel|level/i.test(fact.label || ''))?.value || '400 + Master';
  const strip = $('#rate-strip');
  if (strip) {
    strip.innerHTML = [
      ['Experiência', rates.exp || '—'],
      ['Drop', rates.drop || '—'],
      ['Master EXP', rates.master || '—'],
      ['Nível máximo', maxLevel],
    ]
      .map(
        ([label, value]) =>
          `<div class="rate"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`
      )
      .join('');
  }
}

function renderNews(news) {
  const grid = $('#news-grid');
  if (!grid) return;
  if (!Array.isArray(news) || news.length === 0) {
    grid.innerHTML = '<div class="ranking-empty">Nenhuma notícia publicada ainda.</div>';
    return;
  }
  grid.innerHTML = news
    .slice(0, 6)
    .map(item => {
      const image = safeUrl(item.image_url);
      const media = image
        ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />`
        : '';
      const pinned = item.pinned ? '<span class="pinned">Fixada</span>' : '';
      return `
        <article class="news-card">
          <div class="news-card-media">${media}</div>
          <div class="news-card-body">
            <div class="news-meta">
              <span class="tag">${escapeHtml(item.category)}</span>
              ${pinned}
              <span class="news-date">${escapeHtml(formatDate(item.created_at))}</span>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.excerpt)}</p>
            <a class="text-link" href="/noticias/${encodeURIComponent(item.slug)}">Ler notícia <span aria-hidden="true">→</span></a>
          </div>
        </article>`;
    })
    .join('');
}

function renderRankings(rankings) {
  const top = $('#ranking-top');
  const weekly = $('#ranking-weekly');
  if (!top) return;
  setText('#ranking-week', rankings && rankings.weekStart ? formatWeek(rankings.weekStart) : '');

  if (!rankings || !rankings.available) {
    const message = (rankings && rankings.error) || 'Ranking indisponível agora.';
    top.innerHTML = `<div class="ranking-empty">${escapeHtml(message)}</div>`;
    if (weekly) weekly.innerHTML = `<div class="ranking-empty">${escapeHtml(message)}</div>`;
    return;
  }

  top.innerHTML = rankings.top.length
    ? rankings.top
        .slice(0, 5)
        .map(entry => {
          const position = entry.position;
          const rankClass = position === 1 ? 'gold' : position === 2 ? 'silver' : position === 3 ? 'bronze' : '';
          const vip = entry.vip ? '<span class="rank-vip">VIP</span>' : '';
          return `
            <div class="rank-row">
              <span class="rank-cell"><span class="rank ${rankClass}">${escapeHtml(position)}</span><strong>${escapeHtml(entry.name)}${vip}</strong></span>
              <span class="rank-class">${escapeHtml(entry.className || '—')}</span>
              <span class="rank-value">${escapeHtml(entry.resets ?? '—')}</span>
            </div>`;
        })
        .join('')
    : '<div class="ranking-empty">Nenhum personagem no ranking ainda.</div>';

  if (weekly) {
    weekly.hidden = !rankings.weekly.length;
    weekly.innerHTML = rankings.weekly.length
      ? '<span class="rank-weekly-title">Mais XP ganho esta semana</span>' +
        rankings.weekly
          .slice(0, 3)
          .map(entry => `<span class="rank-weekly-row">${escapeHtml(entry.name)} <b>+${escapeHtml(formatNumber(entry.gained))}</b></span>`)
          .join('')
      : '';
  }
}

function renderPlans(plans, payments) {
  const grid = $('#vip-grid');
  const note = $('#vip-note');
  if (!grid) return;
  state.plans = plans || [];
  state.payments = payments || { enabled: false, configured: false };

  const canBuy = Boolean(payments && payments.enabled && payments.configured);
  grid.innerHTML = state.plans
    .map(plan => {
      const jewel = Number(plan.game?.jewel_drop_percent || 0);
      const lines = jewel > 0
        ? [...(plan.benefits || []), `${jewel.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de chance de jóia extra por monstro`]
        : plan.benefits || [];
      const benefits = lines
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
      return `
        <article class="vip-card${plan.highlight ? ' highlight' : ''}">
          ${plan.highlight ? '<span class="vip-badge">Mais escolhido</span>' : ''}
          <h3>${escapeHtml(plan.name)}</h3>
          <div class="vip-price"><strong>${escapeHtml(formatBrl(plan.price_cents))}</strong><span>/ ${escapeHtml(plan.days)} dias</span></div>
          <p class="vip-days">${escapeHtml(plan.description || '')}</p>
          <ul class="vip-benefits">${benefits}</ul>
          <button class="btn ${plan.highlight ? 'btn-primary' : 'btn-ghost'}" type="button" data-plan="${escapeHtml(plan.id)}" ${canBuy ? '' : 'disabled'}>
            ${canBuy ? 'Quero este plano' : 'Pagamento em configuração'}
          </button>
        </article>`;
    })
    .join('');

  if (!note) return;
  if (!payments || !payments.enabled) {
    note.textContent = 'As compras de VIP estão temporariamente desativadas.';
    note.classList.add('warn');
  } else if (!payments.configured) {
    note.textContent = 'O Mercado Pago ainda está sendo configurado. Em breve o checkout estará disponível.';
    note.classList.add('warn');
  } else {
    note.textContent = 'Pagamento seguro pelo Mercado Pago. O VIP é liberado automaticamente após a aprovação.';
    note.classList.remove('warn');
  }
  updateVipAccess();
}

function renderServer(data) {
  const facts = $('#server-facts');
  if (facts) {
    const rows = Array.isArray(data.server.facts) ? [...data.server.facts] : [];
    if (!rows.some(row => row.label.toLowerCase().includes('versão'))) {
      rows.push({ label: 'Versão', value: data.server.version || '—' });
    }
    rows.push({ label: 'EXP', value: data.server.rates.exp || '—' });
    rows.push({ label: 'Drop', value: data.server.rates.drop || '—' });
    facts.innerHTML = rows
      .map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`)
      .join('');
  }

  const rules = $('#rules-list');
  if (rules) {
    rules.innerHTML = (data.server.rules || [])
      .map(rule => `<li>${escapeHtml(rule)}</li>`)
      .join('') || '<li>As regras serão publicadas em breve.</li>';
  }
}

function renderEvents(events) {
  const list = $('#events-list');
  if (!list) return;
  if (!Array.isArray(events) || events.length === 0) {
    list.innerHTML = '<div class="ranking-empty">Nenhum evento agendado no momento.</div>';
    return;
  }
  list.innerHTML = events
    .slice(0, 4)
    .map(
      (event, index) => `
        <div class="event-row">
          <span class="event-index" aria-hidden="true">${index + 1}</span>
          <span class="event-main">
            <strong>${escapeHtml(event.title)}</strong>
            <small>${escapeHtml(event.description || '')}</small>
          </span>
          <span class="event-when">${escapeHtml(event.schedule || 'Em breve')}</span>
        </div>`
    )
    .join('');
}

function renderFaq(faq) {
  const list = $('#faq-list');
  if (!list) return;
  list.innerHTML = (faq || [])
    .map(
      item => `
        <details class="faq-item">
          <summary>${escapeHtml(item.question)}</summary>
          <p>${escapeHtml(item.answer)}</p>
        </details>`
    )
    .join('');
}

function renderLinks(links) {
  const grid = $('#links-grid');
  if (!grid) return;
  grid.innerHTML = (links || [])
    .map(item => {
      const href = resolveLink(item.url);
      const inner = `<strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.description || '')}</span>`;
      return href
        ? `<a class="link-card" href="${escapeHtml(href)}">${inner}</a>`
        : `<div class="link-card">${inner}</div>`;
    })
    .join('');
}

/** The VIP section's plan list: what each plan includes, in the page's own voice. */
function renderVipPlanos(plans) {
  const box = $('#vip-planos');
  if (!box) return;
  const rows = Array.isArray(plans) ? plans : [];
  box.innerHTML = rows
    .map(
      plan => `
        <div class="vip-plano${plan.highlight ? ' highlight' : ''}">
          <div>
            <strong>${escapeHtml(plan.name)}</strong>
            <span>${escapeHtml(plan.description || `${plan.days} dias de VIP`)}</span>
          </div>
          <b>${escapeHtml(formatBrl(plan.price_cents))}</b>
        </div>`
    )
    .join('');
}

const SOCIALS = [
  {
    name: 'Discord',
    path: 'M20.3 4.5A19.8 19.8 0 0 0 15.4 3l-.7 1.4a18.3 18.3 0 0 0-5.4 0L8.6 3a19.8 19.8 0 0 0-4.9 1.5C.7 9.2-.1 13.7.3 18.1a19.9 19.9 0 0 0 6 3l1.5-2.1a12.8 12.8 0 0 1-2.1-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.8 12.8 0 0 1-2.1 1l1.5 2.1a19.9 19.9 0 0 0 6-3c.5-5.1-.8-9.6-4-13.6ZM8 15.5c-1.2 0-2.2-1.1-2.2-2.5S6.7 10.5 8 10.5s2.2 1.1 2.2 2.5-1 2.5-2.2 2.5Zm8 0c-1.2 0-2.2-1.1-2.2-2.5s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.5-2.2 2.5Z',
  },
  {
    name: 'Instagram',
    path: 'M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 3.4A6.4 6.4 0 1 0 12 18.4 6.4 6.4 0 0 0 12 5.6Zm0 10.5a4.1 4.1 0 1 1 0-8.2 4.1 4.1 0 0 1 0 8.2Zm6.6-10.8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  },
  {
    name: 'YouTube',
    path: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z',
  },
  {
    name: 'Facebook',
    path: 'M24 12.1C24 5.4 18.6 0 12 0S0 5.4 0 12.1c0 6 4.4 11 10.1 11.9v-8.4H7.1v-3.5h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.3h3.4l-.5 3.5h-2.9V24C19.6 23.1 24 18.1 24 12.1Z',
  },
  {
    name: 'TikTok',
    path: 'M16.6 0c.4 2.2 1.8 4 3.8 4.8.8.3 1.7.5 2.6.5v3.8a10 10 0 0 1-5.1-1.5v7.1a7.7 7.7 0 1 1-7.7-7.7c.4 0 .8 0 1.2.1v4a3.8 3.8 0 1 0 2.7 3.6V0h2.5Z',
  },
  {
    name: 'WhatsApp',
    path: 'M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.5 4.1 1.6 5.9L.2 24l6.5-1.7a11.8 11.8 0 0 0 5.4 1.4h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.1-3.5-8.4ZM12.2 21.5a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.9 1 1-3.8-.3-.4a9.8 9.8 0 1 1 8.6 4.8Zm5.4-7.3c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4Z',
  },
];

function renderSocial() {
  const discord = safeUrl(state.data?.social?.discord);
  const footerDiscord = $('#footer-discord');
  if (footerDiscord) {
    footerDiscord.hidden = !discord;
    if (discord) footerDiscord.href = discord;
  }

  const box = $('#social-icons');
  if (!box) return;
  box.innerHTML = SOCIALS.map(
    social => `
      <span class="social-icon" role="img" aria-label="${escapeHtml(social.name)} (em breve)" title="${escapeHtml(social.name)} — em breve" aria-disabled="true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${social.path}"/></svg>
      </span>`
  ).join('');
}

function renderSite(data) {
  state.data = data;
  state.urls = data.urls || { play: '', register: '' };
  renderHero(data);
  renderOnline(data.online);
  renderNews(data.news);
  renderRankings(data.rankings);
  renderPlans(data.plans, data.payments);
  renderVipPlanos(data.plans);
  renderServer(data);
  renderEvents(data.server.events);
  renderFaq(data.faq);
  renderLinks(data.links);
  renderSocial();
  setText('#year', new Date().getFullYear());
}

const PIX_POLL_MS = 3000;
let pixPollStop = null;
let returnPollStop = null;

function setPixState(kind, text) {
  const status = $('#pix-status');
  if (status) {
    status.textContent = text;
    status.classList.remove('waiting', 'approved', 'error');
    status.classList.add(kind);
  }
  const success = $('#pix-success');
  if (success) success.hidden = kind !== 'approved';
  const wait = $('#pix-wait');
  if (wait) wait.hidden = kind !== 'waiting';
}

/**
 * Polls an order immediately and then every few seconds until it is approved or
 * fails, for as long as the tab is open. The backend refreshes pending Pix
 * orders from Mercado Pago on each request, so this is the real confirmation
 * path. Network failures never end the wait: the poll slows down and keeps
 * trying, because the payment may land at any moment.
 */
function watchOrder(orderId, handlers) {
  let stopped = false;
  let failures = 0;
  let timer = null;

  const stop = () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const order = await api(`/api/vip/order/${encodeURIComponent(orderId)}`);
      if (stopped) return;
      if (failures) {
        failures = 0;
        handlers.recovered?.();
      }
      if (order.status === 'approved') {
        stop();
        handlers.approved?.(order);
        return;
      }
      if (order.status === 'error') {
        stop();
        handlers.error?.(order);
        return;
      }
      handlers.pending?.(order);
      timer = setTimeout(tick, PIX_POLL_MS);
    } catch {
      if (stopped) return;
      failures += 1;
      handlers.retry?.(failures);
      timer = setTimeout(tick, Math.min(15000, PIX_POLL_MS * failures));
    }
  };

  tick();
  return stop;
}

function openPlanModal(planId) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) return;
  if (!state.player) {
    state.pendingPlanId = planId;
    showAuthModal('login');
    showToast('Entre na sua conta para comprar VIP.', true);
    return;
  }
  if (!state.payments.enabled || !state.payments.configured) {
    showToast('O checkout ainda não está configurado. Fale com a administração.', true);
    return;
  }
  const modal = $('#vip-modal');
  if (!modal) return;
  if (pixPollStop) {
    pixPollStop();
    pixPollStop = null;
  }
  const pixBox = $('#pix-box');
  if (pixBox) pixBox.hidden = true;
  const pixSuccess = $('#pix-success');
  if (pixSuccess) pixSuccess.hidden = true;
  const pixWait = $('#pix-wait');
  if (pixWait) pixWait.hidden = true;
  const pixStatus = $('#pix-status');
  if (pixStatus) {
    pixStatus.textContent = 'Gerando QR Code...';
    pixStatus.classList.remove('waiting', 'approved', 'error');
  }
  $('#vip-plan-id').value = plan.id;
  $('#vip-modal-title').textContent = plan.name;
  $('#vip-modal-plan').textContent = `${formatBrl(plan.price_cents)} • ${plan.days} dias de VIP`;

  // The account is fixed by the session; the name and e-mail come from the profile created at
  // signup. CPF stays empty on purpose: it belongs only to the payment form.
  const accountInput = $('#vip-account');
  if (accountInput) {
    accountInput.value = state.player.account;
    accountInput.readOnly = true;
  }
  const emailInput = $('#vip-email');
  if (emailInput) emailInput.value = state.player.email || '';
  const nameInput = $('#vip-name');
  if (nameInput) nameInput.value = state.player.name || '';
  const cpfInput = $('#vip-cpf');
  if (cpfInput) cpfInput.value = '';

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  const focus = !state.player.email ? '#vip-email' : !state.player.name ? '#vip-name' : '#vip-cpf';
  setTimeout(() => $(focus)?.focus(), 30);
}

function closePlanModal() {
  // A pending Pix keeps polling after the modal closes: the payment may land
  // while the player browses the rest of the site, and the page tells them.
  const modal = $('#vip-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  const account = $('#vip-account');
  if (account) account.readOnly = false;
  const submit = $('#vip-submit');
  if (submit) {
    submit.disabled = false;
    submit.textContent = 'Ir para o pagamento';
  }
}

async function submitPlan(event) {
  event.preventDefault();
  if (!state.player) {
    showAuthModal('login');
    return;
  }
  const submit = $('#vip-submit');
  const email = $('#vip-email').value.trim();
  const planId = $('#vip-plan-id').value;
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Abrindo pagamento...';
  }
  try {
    const result = await api('/api/vip/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, planId }),
    });
    if (!result.initPoint) throw new Error('O link de pagamento não foi gerado.');
    window.location.assign(result.initPoint);
  } catch (error) {
    showToast(error.message || 'Não foi possível abrir o pagamento.', true);
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Ir para o pagamento';
    }
  }
}

async function submitPix() {
  if (!state.player) {
    showAuthModal('login');
    return;
  }
  const submit = $('#vip-pix');
  const account = state.player.account;
  const email = $('#vip-email').value.trim();
  const name = $('#vip-name').value.trim();
  const cpf = $('#vip-cpf').value.trim();
  const planId = $('#vip-plan-id').value;
  if (!email) {
    showToast('Informe um e-mail para gerar o Pix.', true);
    return;
  }
  if (!name) {
    showToast('Informe o nome completo para o Pix.', true);
    return;
  }
  const cpfDigits = cpf.replace(/\D/g, '');
  if (cpfDigits.length !== 11) {
    showToast('Informe um CPF válido para o Pix.', true);
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Gerando QR Code...';
  }
  const pixBox = $('#pix-box');
  const pixQr = $('#pix-qr');
  const pixCode = $('#pix-code');
  if (pixPollStop) {
    pixPollStop();
    pixPollStop = null;
  }
  if (pixBox) pixBox.hidden = false;
  if (pixQr) pixQr.removeAttribute('src');
  if (pixCode) pixCode.value = '';
  setPixState('waiting', 'Gerando QR Code...');
  try {
    const result = await api('/api/vip/checkout/pix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account, email, name, cpf, planId }),
    });
    if (pixQr && result.qrCodeBase64) {
      pixQr.src = `data:image/png;base64,${result.qrCodeBase64}`;
    }
    if (pixCode) pixCode.value = result.qrCode || '';
    setPixState('waiting', 'Escaneie o QR Code ou copie o código. Aguardando o pagamento...');
    showToast('QR Code Pix gerado. Aguardando o pagamento.');
    pixPollStop = watchOrder(result.order.id, {
      pending: () => {
        setPixState('waiting', 'Aguardando o pagamento. O site confirma automaticamente.');
      },
      approved: async order => {
        pixPollStop = null;
        setPixState('approved', 'Pagamento aprovado! VIP liberado para a sua conta.');
        showToast('Pagamento aprovado! VIP liberado.');
        await refreshPlayerAfterPayment(order);
      },
      error: () => {
        pixPollStop = null;
        setPixState('error', 'O pagamento não foi concluído. Gere um novo QR Code ou tente outro método.');
        showToast('O pagamento não foi concluído.', true);
      },
      retry: failures => {
        setPixState(
          'waiting',
          failures === 1
            ? 'Conexão instável. Continuamos tentando confirmar o pagamento...'
            : 'Ainda sem resposta do servidor. Continuamos tentando confirmar o pagamento...'
        );
      },
      recovered: () => {
        setPixState('waiting', 'Conexão voltou. Continuando a confirmação do pagamento.');
      },
    });
  } catch (error) {
    if (pixBox) pixBox.hidden = false;
    setPixState('error', error.message || 'Não foi possível gerar o QR Code Pix.');
    showToast(error.message || 'Não foi possível gerar o QR Code Pix.', true);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Gerar QR Code Pix';
    }
  }
}

/** A payment just landed: reload the session, the VIP state and the panel. */
async function refreshPlayerAfterPayment(order) {
  if (order?.account && state.player?.account !== order.account) return;
  try {
    const result = await api('/api/auth/me');
    if (result?.player) state.player = result.player;
  } catch {
    // The session cookie is unchanged; the panel refresh below still runs.
  }
  await loadPlayerPanel();
  updateVipAccess();
  if (state.data) {
    try {
      const fresh = await api('/api/vip/plans');
      renderPlans(fresh.plans, fresh.payments);
    } catch {
      // The page keeps its current plan cards when the refresh fails.
    }
  }
}

async function showArticle(slug) {
  const article = $('#article');
  const content = $('#article-content');
  if (!article || !content) return;
  if (returnPollStop) {
    returnPollStop();
    returnPollStop = null;
  }
  content.innerHTML = '<div class="ranking-empty">Carregando notícia...</div>';
  try {
    const item = await api(`/api/news/${encodeURIComponent(slug)}`);
    content.innerHTML = `
      <p class="eyebrow">${escapeHtml(item.category)}</p>
      <h1>${escapeHtml(item.title)}</h1>
      <div class="article-meta"><span>${escapeHtml(formatDate(item.created_at))}</span>${item.pinned ? '<span>• Fixada</span>' : ''}</div>
      ${item.html || ''}`;
    document.title = `${item.title} — ${state.data?.site?.name || 'MUCURA'}`;
    hideMainSections(article);
    article.hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  } catch (error) {
    content.innerHTML = `<div class="ranking-empty">${escapeHtml(error.message)}</div>`;
    hideMainSections(article);
    article.hidden = false;
  }
}

function returnMarkup(order, note = '') {
  const approved = order.status === 'approved';
  const pending = order.status === 'pending';
  const title = approved ? 'VIP ativado!' : pending ? 'Aguardando pagamento' : 'Não foi possível concluir';
  const statusText = approved
    ? 'Aprovado'
    : pending
      ? 'Pendente'
      : order.status === 'error'
        ? 'Falhou'
        : escapeHtml(order.status);
  const wait = pending
    ? `<p class="pix-wait" id="return-wait"><span class="pix-dot" aria-hidden="true"></span>${escapeHtml(
        note || 'Aguardando a confirmação do Mercado Pago. Esta página atualiza sozinha.'
      )}</p>`
    : '';
  return `
    <p class="eyebrow">Retorno do pagamento</p>
    <h2>${title}</h2>
    <span class="return-status ${approved ? '' : pending ? 'pending' : 'failed'}">${statusText}</span>
    <p>Plano: <strong>${escapeHtml(order.plan_name)}</strong> • ${escapeHtml(order.days)} dias</p>
    <p>Conta: <strong>${escapeHtml(order.account)}</strong></p>
    <p>Valor: <strong>${escapeHtml(formatBrl(order.amount_cents))}</strong></p>
    <p class="fineprint">${
      approved
        ? 'O VIP já está liberado para a conta informada.'
        : pending
          ? 'Não feche esta página: assim que o pagamento for aprovado, o VIP será liberado aqui.'
          : 'O pagamento não foi aprovado. Gere um novo Pix na página de VIP.'
    }</p>
    ${wait}
    <a class="btn btn-primary" href="/vip">Voltar para VIP</a>`;
}

async function showReturn() {
  const section = $('#return');
  const content = $('#return-content');
  if (!section || !content) return;
  if (returnPollStop) {
    returnPollStop();
    returnPollStop = null;
  }
  const orderId = new URLSearchParams(window.location.search).get('order');
  if (!orderId) {
    content.innerHTML = '<h2>Pedido não informado</h2><p>Volte para a página de VIP e escolha um plano.</p><a class="btn btn-primary" href="/vip">Ver planos</a>';
    hideMainSections(section);
    section.hidden = false;
    return;
  }
  try {
    const order = await api(`/api/vip/order/${encodeURIComponent(orderId)}`);
    const paint = (current, note = '') => {
      content.innerHTML = returnMarkup(current, note);
    };
    paint(order);
    hideMainSections(section);
    section.hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (order.status === 'pending') {
      returnPollStop = watchOrder(order.id, {
        pending: current => paint(current),
        approved: current => {
          returnPollStop = null;
          paint(current);
          showToast('Pagamento aprovado! VIP liberado.');
          refreshPlayerAfterPayment(current);
        },
        error: current => {
          returnPollStop = null;
          paint(current);
        },
        retry: failures => {
          const wait = $('#return-wait');
          if (wait) {
            wait.textContent =
              failures === 1
                ? 'Conexão instável. Continuamos tentando confirmar o pagamento...'
                : 'Ainda sem resposta do servidor. Continuamos tentando confirmar o pagamento...';
          }
        },
        recovered: () => {
          const wait = $('#return-wait');
          if (wait) wait.textContent = 'Conexão voltou. Confirmando o pagamento...';
        },
      });
    }
  } catch (error) {
    content.innerHTML = `<h2>Pedido não encontrado</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="/vip">Ver planos</a>`;
    hideMainSections(section);
    section.hidden = false;
  }
}

function hideMainSections(keep) {
  $$('main > section').forEach(section => {
    if (section !== keep) section.hidden = true;
  });
}

const HOME_SECTIONS = new Set(['inicio', 'classes', 'eventos', 'comecar', 'vip']);

function showHome() {
  if (returnPollStop) {
    returnPollStop();
    returnPollStop = null;
  }
  $$('main > section').forEach(section => {
    section.hidden = !HOME_SECTIONS.has(section.id);
  });
  const article = $('#article');
  const ret = $('#return');
  if (article) article.hidden = true;
  if (ret) ret.hidden = true;
}

function showOnlySections(...ids) {
  if (returnPollStop) {
    returnPollStop();
    returnPollStop = null;
  }
  const keep = new Set(ids);
  $$('main > section').forEach(section => {
    section.hidden = !keep.has(section.id);
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

async function refreshOnline() {
  try {
    const online = await api('/api/online');
    renderOnline(online);
  } catch {
    renderOnline({ available: false });
  }
}

function bindNavigation() {
  const toggle = $('#nav-toggle');
  const nav = $('#main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('a', nav).forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }
}

function bindVip() {
  $('#vip-plans-toggle')?.addEventListener('click', event => {
    event.preventDefault();
    state.vipPlansOpen = true;
    updateVipAccess();
    $('#vip-planos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const grid = $('#vip-grid');
  if (grid) {
    grid.addEventListener('click', event => {
      const button = event.target.closest('button[data-plan]');
      if (button) openPlanModal(button.dataset.plan);
    });
  }
  const form = $('#vip-form');
  if (form) form.addEventListener('submit', submitPlan);
  $('#vip-pix')?.addEventListener('click', submitPix);
  $('#pix-copy')?.addEventListener('click', () => {
    const code = $('#pix-code');
    if (code) {
      code.select();
      document.execCommand('copy');
      showToast('Código Pix copiado.');
    }
  });
  $('#vip-modal-close')?.addEventListener('click', closePlanModal);
  $$('[data-close-modal]').forEach(element => element.addEventListener('click', closePlanModal));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#vip-modal')?.hidden) closePlanModal();
  });
}

async function init() {
  bindNavigation();
  bindVip();
  bindAuth();
  bindUserPanel();
  renderSocial();
  setText('#year', new Date().getFullYear());

  // Pick the route before the API call: a slow or failed request must not flash the extra
  // home sections, and the page must still look right when the API is unavailable.
  const path = window.location.pathname;
  if (path === '/noticias') showOnlySections('noticias');
  else if (path === '/regras') showOnlySections('servidor', 'links');
  else if (path === '/faq') showOnlySections('faq');
  else if (!path.startsWith('/noticias/') && path !== '/vip/retorno') showHome();

  try {
    const data = await api('/api/site');
    renderSite(data);
  } catch (error) {
    showToast('Não foi possível carregar o site. Tente novamente.', true);
    console.error(error);
    return;
  }

  // The site is already on screen here: a slow player lookup or a game session that expired must
  // never keep the page from opening at its route.
  await loadPlayer();
  const gameSession = new URLSearchParams(window.location.search).get('session');
  if (gameSession) {
    try {
      const status = await api(`/api/vip/me?session=${encodeURIComponent(gameSession)}`);
      if (status.account) {
        const account = $('#vip-account');
        if (account) account.value = status.account;
        const loginAccount = $('#auth-login-account');
        if (loginAccount) loginAccount.value = status.account;
        // Coming from the in-game VIP button: ask for the game password instead of making the
        // player type the login again.
        if (!state.player) showAuthModal('login');
      }
    } catch {
      // The game session may have expired; the user can type the account manually.
    }
  }

  if (path.startsWith('/noticias/')) {
    await showArticle(decodeURIComponent(path.slice('/noticias/'.length)));
  } else if (path === '/vip/retorno') {
    await showReturn();
  } else if (path === '/vip') {
    document.getElementById('vip')?.scrollIntoView({ behavior: 'smooth' });
  } else if (path === '/ranking') {
    document.getElementById('ranking')?.scrollIntoView({ behavior: 'smooth' });
  }

  setInterval(refreshOnline, 60_000);
}

init();
