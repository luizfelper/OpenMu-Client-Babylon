// Admin panel. Same-origin session cookie, no token in localStorage: the server sets an HttpOnly
// cookie, so this file only calls /api/admin/* with credentials.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  settings: null,
  news: [],
  orders: [],
  stats: null,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBrl(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    (Number(cents) || 0) / 100
  );
}

function formatDate(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    const error = new Error(body && body.error ? body.error : `Erro ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function val(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? '';
}

function checked(id, value) {
  const element = document.getElementById(id);
  if (element) element.checked = Boolean(value);
}

function text(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : '';
}

function showLogin(message = '') {
  $('#login-view').hidden = false;
  $('#app-view').hidden = true;
  const error = $('#login-error');
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
}

function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
}

function switchTab(name) {
  $$('.admin-tabs button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === name);
  });
  $$('.admin-panel').forEach(panel => {
    panel.hidden = panel.dataset.panel !== name;
  });
}

function renderDashboard() {
  const stats = state.stats;
  if (!stats) return;
  $('#stat-news').textContent = String(stats.news.total);
  $('#stat-news-sub').textContent = `${stats.news.published} publicadas`;
  $('#stat-orders').textContent = String(stats.orders.orders);
  $('#stat-orders-sub').textContent = `${stats.orders.pending} pendentes`;
  $('#stat-revenue').textContent = formatBrl(stats.orders.revenue_cents);
  $('#stat-vip').textContent = String(stats.orders.active_vip);

  const warning = $('#admin-warning');
  if (warning) {
    const messages = [];
    if (!stats.admin_configured) {
      messages.push('O login do painel não está configurado no instalador. Rode `mu config` ou reinstale.');
    }
    if (state.settings) {
      const mp = state.settings.mercadopago;
      if (!mp.access_token_set) messages.push('O Mercado Pago ainda não tem access token salvo.');
      else if (!mp.enabled) messages.push('As compras de VIP estão desativadas.');
    }
    warning.textContent = messages.join(' ');
    warning.hidden = messages.length === 0;
  }
}

function renderNewsList() {
  const list = $('#news-list');
  if (!list) return;
  if (!state.news.length) {
    list.innerHTML = '<div class="empty">Nenhuma notícia ainda. Clique em “Nova notícia”.</div>';
    return;
  }
  list.innerHTML = state.news
    .map(
      item => `
      <div class="admin-row">
        <div class="admin-row-main">
          <strong>${escapeHtml(item.title)}</strong>
          <small>
            ${escapeHtml(item.category)} • ${escapeHtml(formatDate(item.created_at))} •
            ${item.published ? 'publicada' : 'rascunho'}${item.pinned ? ' • fixada' : ''}
          </small>
        </div>
        <div class="admin-row-actions">
          <button type="button" data-edit-news="${item.id}">Editar</button>
          <button type="button" class="danger" data-delete-news="${item.id}">Excluir</button>
        </div>
      </div>`
    )
    .join('');
}

function resetNewsForm() {
  $('#news-form').hidden = true;
  $('#news-id').value = '';
  val('news-title', '');
  val('news-category', '');
  val('news-image', '');
  val('news-excerpt', '');
  val('news-body', '');
  checked('news-published', true);
  checked('news-pinned', false);
  $('#news-form-title').textContent = 'Nova notícia';
}

function openNewsForm(item = null) {
  const form = $('#news-form');
  form.hidden = false;
  $('#news-id').value = item ? String(item.id) : '';
  val('news-title', item ? item.title : '');
  val('news-category', item ? item.category : '');
  val('news-image', item ? item.image_url : '');
  val('news-excerpt', item ? item.excerpt : '');
  val('news-body', item ? item.body : '');
  checked('news-published', item ? item.published : true);
  checked('news-pinned', item ? item.pinned : false);
  $('#news-form-title').textContent = item ? 'Editar notícia' : 'Nova notícia';
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function reloadNews() {
  const data = await api('/api/admin/news');
  state.news = data.news || [];
  renderNewsList();
}

async function saveNews(event) {
  event.preventDefault();
  const id = $('#news-id').value;
  const payload = {
    title: text('news-title'),
    category: text('news-category'),
    image_url: text('news-image'),
    excerpt: text('news-excerpt'),
    body: text('news-body'),
    published: $('#news-published').checked,
    pinned: $('#news-pinned').checked,
  };
  const button = $('#news-save');
  if (button) button.disabled = true;
  try {
    if (id) {
      await api(`/api/admin/news/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await api('/api/admin/news', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    resetNewsForm();
    await Promise.all([reloadNews(), reloadStats()]);
    showToast('Notícia salva.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteNews(id) {
  const item = state.news.find(news => news.id === id);
  if (!item) return;
  if (!window.confirm(`Excluir a notícia “${item.title}”?`)) return;
  try {
    await api(`/api/admin/news/${id}`, { method: 'DELETE' });
    await Promise.all([reloadNews(), reloadStats()]);
    showToast('Notícia excluída.');
  } catch (error) {
    showToast(error.message, true);
  }
}

function planTemplate(plan, index) {
  return `
    <div class="plan-editor" data-plan-index="${index}">
      <div class="plan-head">
        <strong>Plano ${index + 1}</strong>
        <button class="plan-remove" type="button" data-remove-plan>Remover</button>
      </div>
      <div class="plan-grid">
        <label>Identificador<input class="plan-id" maxlength="32" value="${escapeHtml(plan.id)}" /></label>
        <label>Dias<input class="plan-days" type="number" min="1" max="3650" value="${Number(plan.days) || 30}" /></label>
        <label>Preço (R$)<input class="plan-price" type="number" min="1" step="0.01" value="${((Number(plan.price_cents) || 0) / 100).toFixed(2)}" /></label>
      </div>
      <label>Nome<input class="plan-name" maxlength="60" value="${escapeHtml(plan.name)}" /></label>
      <label>Descrição<input class="plan-description" maxlength="300" value="${escapeHtml(plan.description || '')}" /></label>
      <label>Benefícios (um por linha)<textarea class="plan-benefits" rows="4">${escapeHtml((plan.benefits || []).join('\n'))}</textarea></label>
      <label class="check"><input type="checkbox" class="plan-highlight" ${plan.highlight ? 'checked' : ''} /> Destacar este plano</label>
    </div>`;
}

function renderPlans(plans) {
  const editor = $('#plans-editor');
  if (!editor) return;
  if (!plans.length) {
    editor.innerHTML = '<div class="empty">Nenhum plano. Clique em “Adicionar plano”.</div>';
    return;
  }
  editor.innerHTML = plans.map(planTemplate).join('');
}

function gatherPlans() {
  return $$('.plan-editor').map(row => ({
    id: ($('.plan-id', row)?.value || '').trim().toLowerCase(),
    name: ($('.plan-name', row)?.value || '').trim(),
    days: Number($('.plan-days', row)?.value || 0),
    price_cents: Math.round(Number($('.plan-price', row)?.value || 0) * 100),
    description: ($('.plan-description', row)?.value || '').trim(),
    benefits: ($('.plan-benefits', row)?.value || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean),
    highlight: Boolean($('.plan-highlight', row)?.checked),
  }));
}

function addPlan() {
  const plans = gatherPlans();
  plans.push({
    id: `plano${plans.length + 1}`,
    name: `VIP Plano ${plans.length + 1}`,
    days: 30,
    price_cents: 1990,
    description: '',
    benefits: [],
    highlight: false,
  });
  renderPlans(plans);
}

function renderOrders() {
  const list = $('#orders-list');
  if (!list) return;
  if (!state.orders.length) {
    list.innerHTML = '<div class="empty">Nenhum pedido encontrado.</div>';
    return;
  }
  list.innerHTML = state.orders
    .map(order => {
      const status = order.status === 'approved' ? 'approved' : order.status === 'pending' ? 'pending' : 'error';
      return `
        <div class="admin-row">
          <div class="admin-row-main">
            <strong>${escapeHtml(order.account)} — ${escapeHtml(order.plan_name)}</strong>
            <small>
              ${escapeHtml(formatBrl(order.amount_cents))} • ${escapeHtml(order.days)} dias •
              ${escapeHtml(formatDate(order.created_at))} • ${escapeHtml(order.id.slice(0, 8))}
            </small>
          </div>
          <div class="admin-row-actions">
            <span class="status-pill status-${status}">${escapeHtml(order.status)}</span>
            ${order.status !== 'approved' ? `<button type="button" data-approve-order="${escapeHtml(order.id)}">Aprovar manualmente</button>` : ''}
          </div>
        </div>`;
    })
    .join('');
}

async function reloadOrders() {
  const filter = $('#orders-filter')?.value || '';
  const suffix = filter ? `?status=${encodeURIComponent(filter)}` : '';
  const data = await api(`/api/admin/orders${suffix}`);
  state.orders = data.orders || [];
  renderOrders();
}

async function reloadStats() {
  state.stats = await api('/api/admin/stats');
  renderDashboard();
}

function fillSettings(settings) {
  state.settings = settings;
  const site = settings.site;
  val('site-name', site.name);
  val('site-tagline', site.tagline);
  val('hero-eyebrow', site.eyebrow);
  val('hero-title', site.title);
  val('hero-subtitle', site.subtitle);
  val('hero-text', site.text);

  const server = settings.server;
  val('server-name', server.name);
  val('server-description', server.description);
  val('server-version', server.version);
  val('rate-exp', server.rate_exp);
  val('rate-drop', server.rate_drop);
  val('rate-master', server.rate_master);
  val('server-facts', (server.facts || []).map(row => `${row.label} | ${row.value}`).join('\n'));
  val('server-events', (server.events || []).map(row => `${row.title} | ${row.schedule} | ${row.description}`).join('\n'));
  val('server-rules', (server.rules || []).join('\n'));

  val('faq-text', (settings.faq || []).map(row => `${row.question} | ${row.answer}`).join('\n'));
  val('links-text', (settings.links || []).map(row => `${row.label} | ${row.url} | ${row.description}`).join('\n'));
  const social = settings.social || {};
  val('social-discord', social.discord);
  val('social-instagram', social.instagram);
  val('social-youtube', social.youtube);
  val('social-facebook', social.facebook);
  val('social-tiktok', social.tiktok);
  val('social-whatsapp', social.whatsapp);

  checked('player-panel-vip-only', settings.player_panel?.vip_only !== false);

  const mp = settings.mercadopago;
  checked('mp-enabled', mp.enabled);
  checked('mp-sandbox', mp.sandbox);
  val('mp-access-token', '');
  val('mp-public-key', mp.public_key);
  val('mp-webhook-secret', '');
  val('mp-statement-descriptor', mp.statement_descriptor);
  const tokenHint = $('#mp-token-hint');
  if (tokenHint) {
    tokenHint.textContent = mp.access_token_set
      ? `Token salvo (${mp.access_token_hint}). Deixe o campo vazio para manter.`
      : 'Nenhum token salvo ainda.';
  }
  const status = $('#mp-status');
  if (status) {
    status.textContent = mp.access_token_set
      ? mp.enabled
        ? 'Checkout ativo. Faça uma compra de teste antes de divulgar.'
        : 'Token salvo, mas as compras estão desativadas.'
      : 'Configure o access token e ative as compras.';
    status.className = 'form-status';
  }

  renderPlans(settings.vip_plans || []);
  const webhook = `${window.location.origin}/api/vip/webhook`;
  const hint = $('#webhook-hint');
  const url = $('#webhook-url');
  if (hint) hint.textContent = webhook;
  if (url) url.textContent = webhook;
  renderDashboard();
}

function pipeRows(source, columns) {
  return String(source || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|');
      if (columns === 2) return [parts[0].trim(), parts.slice(1).join('|').trim()];
      return [parts[0].trim(), (parts[1] || '').trim(), parts.slice(2).join('|').trim()];
    });
}

function settingsPayload() {
  const server = state.settings.server;
  const facts = pipeRows(text('server-facts'), 2).map(([label, value]) => ({ label, value }));
  const events = pipeRows(text('server-events'), 3).map(([title, schedule, description]) => ({
    title,
    schedule,
    description,
  }));
  const rules = text('server-rules')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const faq = pipeRows(text('faq-text'), 2).map(([question, answer]) => ({ question, answer }));
  const links = pipeRows(text('links-text'), 3).map(([label, url, description]) => ({
    label,
    url,
    description,
  }));

  return {
    site: {
      name: text('site-name'),
      tagline: text('site-tagline'),
      eyebrow: text('hero-eyebrow'),
      title: text('hero-title'),
      subtitle: text('hero-subtitle'),
      text: text('hero-text'),
    },
    server: {
      name: text('server-name'),
      description: text('server-description'),
      version: text('server-version'),
      language: server.language,
      rate_exp: text('rate-exp'),
      rate_drop: text('rate-drop'),
      rate_master: text('rate-master'),
      facts,
      events,
      rules,
    },
    faq,
    links,
    social: {
      discord: text('social-discord'),
      instagram: text('social-instagram'),
      youtube: text('social-youtube'),
      facebook: text('social-facebook'),
      tiktok: text('social-tiktok'),
      whatsapp: text('social-whatsapp'),
    },
    vip_plans: gatherPlans(),
    player_panel: {
      vip_only: $('#player-panel-vip-only').checked,
    },
    mercadopago: {
      enabled: $('#mp-enabled').checked,
      access_token: text('mp-access-token'),
      public_key: text('mp-public-key'),
      webhook_secret: text('mp-webhook-secret'),
      sandbox: $('#mp-sandbox').checked,
      statement_descriptor: text('mp-statement-descriptor'),
    },
  };
}

async function saveSettings() {
  const buttons = $$(
    '#save-vip-button, #save-players-button, #save-payments-button, #save-content-button, #save-extras-button'
  );
  buttons.forEach(button => (button.disabled = true));
  try {
    const data = await api('/api/admin/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settingsPayload()),
    });
    fillSettings(data.settings);
    await reloadStats();
    showToast('Configurações salvas.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    buttons.forEach(button => (button.disabled = false));
  }
}

async function testMp() {
  const status = $('#mp-status');
  const button = $('#test-mp-button');
  if (button) button.disabled = true;
  if (status) {
    status.textContent = 'Testando conexão...';
    status.className = 'form-status';
  }
  try {
    const data = await api('/api/admin/mercadopago/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: text('mp-access-token') }),
    });
    if (status) {
      status.textContent = `Conectado${data.nickname ? ` como ${data.nickname}` : ''}.`;
      status.className = 'form-status ok';
    }
    showToast('Mercado Pago conectado.');
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.className = 'form-status bad';
    }
    showToast(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function approveOrder(id) {
  if (!window.confirm('Aprovar este pedido manualmente e liberar o VIP?')) return;
  try {
    await api(`/api/admin/orders/${id}/approve`, { method: 'POST' });
    await Promise.all([reloadOrders(), reloadStats()]);
    showToast('Pedido aprovado e VIP liberado.');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadAll() {
  const [stats, settings, news, orders] = await Promise.all([
    api('/api/admin/stats'),
    api('/api/admin/settings'),
    api('/api/admin/news'),
    api('/api/admin/orders'),
  ]);
  state.stats = stats;
  state.news = news.news || [];
  state.orders = orders.orders || [];
  fillSettings(settings.settings);
  renderNewsList();
  renderOrders();
  renderDashboard();
}

function bindEvents() {
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#login-submit');
    if (button) button.disabled = true;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: text('login-user'),
          password: $('#login-password').value,
        }),
      });
      showApp();
      await loadAll();
    } catch (error) {
      showLogin(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });

  $('#logout-button').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      // The cookie may already be gone.
    }
    showLogin();
  });

  $$('.admin-tabs button').forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  $('#refresh-button').addEventListener('click', async () => {
    try {
      await Promise.all([loadAll()]);
      showToast('Dados atualizados.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $('#new-news-button').addEventListener('click', () => openNewsForm());
  $('#news-cancel').addEventListener('click', resetNewsForm);
  $('#news-cancel-2').addEventListener('click', resetNewsForm);
  $('#news-form').addEventListener('submit', saveNews);

  $('#news-list').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-news]');
    if (edit) {
      const item = state.news.find(news => String(news.id) === edit.dataset.editNews);
      if (item) openNewsForm(item);
      return;
    }
    const remove = event.target.closest('[data-delete-news]');
    if (remove) deleteNews(Number(remove.dataset.deleteNews));
  });

  $('#add-plan-button').addEventListener('click', addPlan);
  $('#plans-editor').addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-plan]');
    if (!remove) return;
    remove.closest('.plan-editor')?.remove();
    if (!$$('.plan-editor').length) renderPlans([]);
  });
  $('#save-vip-button').addEventListener('click', saveSettings);
  $('#save-players-button').addEventListener('click', saveSettings);
  $('#save-payments-button').addEventListener('click', saveSettings);
  $('#save-content-button').addEventListener('click', saveSettings);
  $('#save-extras-button').addEventListener('click', saveSettings);
  $('#test-mp-button').addEventListener('click', testMp);
  $('#orders-filter').addEventListener('change', () => reloadOrders().catch(error => showToast(error.message, true)));
  $('#orders-list').addEventListener('click', event => {
    const button = event.target.closest('[data-approve-order]');
    if (button) approveOrder(button.dataset.approveOrder);
  });
}

async function init() {
  bindEvents();
  const webhook = `${window.location.origin}/api/vip/webhook`;
  const hint = $('#webhook-hint');
  const url = $('#webhook-url');
  if (hint) hint.textContent = webhook;
  if (url) url.textContent = webhook;
  try {
    const me = await api('/api/admin/me');
    $('#admin-user').textContent = me.user;
    showApp();
    await loadAll();
  } catch {
    showLogin();
  }
}

init();
