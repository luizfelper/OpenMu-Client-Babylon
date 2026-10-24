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

function resolveLink(value) {
  if (value === '@register') return safeUrl(state.urls.register);
  if (value === '@play') return safeUrl(state.urls.play);
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
  setText('#brand-tagline', data.site.tagline);
  setText('#hero-eyebrow', data.site.eyebrow);
  setText('#hero-title', data.site.title);
  setText('#hero-subtitle', data.site.subtitle);
  setText('#hero-text', data.site.text);
  setText('#server-version', data.server.version || '—');
  document.title = `${data.site.name} — ${data.site.tagline}`;

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
  const strip = $('#rate-strip');
  if (strip) {
    strip.innerHTML = [
      ['EXP', rates.exp || '—'],
      ['Drop', rates.drop || '—'],
      ['Master EXP', rates.master || '—'],
    ]
      .map(
        ([label, value]) =>
          `<div class="rate"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
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

function rankingRow(entry, weekly) {
  const position = entry.position;
  const rankClass = position === 1 ? 'gold' : position === 2 ? 'silver' : position === 3 ? 'bronze' : '';
  const level = entry.level ? `Nível ${entry.level}` : 'Nível —';
  const className = entry.className ? ` • ${entry.className}` : '';
  const value = weekly ? entry.gained : entry.experience;
  const suffix = weekly ? 'XP ganho' : 'XP';
  return `
    <div class="ranking-row">
      <span class="rank ${rankClass}">${position}</span>
      <span class="ranking-name">
        <strong>${escapeHtml(entry.name)}</strong>
        <small>${escapeHtml(level)}${escapeHtml(className)}</small>
      </span>
      <span class="ranking-value">
        <strong>${escapeHtml(formatNumber(value))}</strong>
        <small>${suffix}</small>
      </span>
    </div>`;
}

function renderRankings(rankings) {
  const top = $('#ranking-top');
  const weekly = $('#ranking-weekly');
  if (!top || !weekly) return;
  setText('#ranking-week', rankings && rankings.weekStart ? formatWeek(rankings.weekStart) : '');

  if (!rankings || !rankings.available) {
    const message = (rankings && rankings.error) || 'Ranking indisponível agora.';
    top.innerHTML = `<div class="ranking-empty">${escapeHtml(message)}</div>`;
    weekly.innerHTML = `<div class="ranking-empty">${escapeHtml(message)}</div>`;
    return;
  }

  top.innerHTML = rankings.top.length
    ? rankings.top.map(entry => rankingRow(entry, false)).join('')
    : '<div class="ranking-empty">Nenhum personagem no ranking ainda.</div>';
  weekly.innerHTML = rankings.weekly.length
    ? rankings.weekly.map(entry => rankingRow(entry, true)).join('')
    : '<div class="ranking-empty">A temporada semanal começa agora. Jogue para aparecer aqui.</div>';
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
      const benefits = (plan.benefits || [])
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
    .map(
      event => `
        <article class="event">
          <span class="event-time">${escapeHtml(event.schedule || 'Em breve')}</span>
          <div>
            <h3>${escapeHtml(event.title)}</h3>
            <p>${escapeHtml(event.description || '')}</p>
          </div>
        </article>`
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
  renderServer(data);
  renderEvents(data.server.events);
  renderFaq(data.faq);
  renderLinks(data.links);
  renderSocial();
  setText('#year', new Date().getFullYear());
}

function openPlanModal(planId) {
  const plan = state.plans.find(item => item.id === planId);
  if (!plan) return;
  if (!state.payments.enabled || !state.payments.configured) {
    showToast('O checkout ainda não está configurado. Fale com a administração.', true);
    return;
  }
  const modal = $('#vip-modal');
  if (!modal) return;
  const pixBox = $('#pix-box');
  if (pixBox) pixBox.hidden = true;
  const pixStatus = $('#pix-status');
  if (pixStatus) {
    pixStatus.textContent = 'Gerando QR Code...';
    pixStatus.classList.remove('error');
  }
  $('#vip-plan-id').value = plan.id;
  $('#vip-modal-title').textContent = plan.name;
  $('#vip-modal-plan').textContent = `${formatBrl(plan.price_cents)} • ${plan.days} dias de VIP`;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  $('#vip-account')?.focus();
}

function closePlanModal() {
  if (pixPollTimer) {
    clearInterval(pixPollTimer);
    pixPollTimer = null;
  }
  const modal = $('#vip-modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  const submit = $('#vip-submit');
  if (submit) {
    submit.disabled = false;
    submit.textContent = 'Ir para o pagamento';
  }
}

async function submitPlan(event) {
  event.preventDefault();
  const submit = $('#vip-submit');
  const account = $('#vip-account').value.trim();
  const email = $('#vip-email').value.trim();
  const planId = $('#vip-plan-id').value;
  if (!account) {
    showToast('Informe a conta do jogo.', true);
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Abrindo pagamento...';
  }
  try {
    const result = await api('/api/vip/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account, email, planId }),
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
  const submit = $('#vip-pix');
  const account = $('#vip-account').value.trim();
  const email = $('#vip-email').value.trim();
  const name = $('#vip-name').value.trim();
  const cpf = $('#vip-cpf').value.trim();
  const planId = $('#vip-plan-id').value;
  if (!account) {
    showToast('Informe a conta do jogo.', true);
    return;
  }
  if (!email) {
    showToast('Informe um e-mail para gerar o Pix.', true);
    return;
  }
  if (!name) {
    showToast('Informe o nome completo para o Pix.', true);
    return;
  }
  if (!cpf) {
    showToast('Informe o CPF para o Pix.', true);
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Gerando QR Code...';
  }
  const pixBox = $('#pix-box');
  const pixStatus = $('#pix-status');
  const pixQr = $('#pix-qr');
  const pixCode = $('#pix-code');
  try {
    const result = await api('/api/vip/checkout/pix', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account, email, name, cpf, planId }),
    });
    if (pixBox) pixBox.hidden = false;
    if (pixQr && result.qrCodeBase64) {
      pixQr.src = `data:image/png;base64,${result.qrCodeBase64}`;
    }
    if (pixCode) pixCode.value = result.qrCode || '';
    if (pixStatus) {
      pixStatus.textContent = 'Escaneie o QR Code ou copie o código. Aguardando pagamento...';
      pixStatus.classList.remove('error');
    }
    showToast('QR Code Pix gerado.');
    pollOrder(result.order.id);
  } catch (error) {
    if (pixBox) pixBox.hidden = false;
    if (pixStatus) {
      pixStatus.textContent = error.message || 'Não foi possível gerar o QR Code Pix.';
      pixStatus.classList.add('error');
    }
    showToast(error.message || 'Não foi possível gerar o QR Code Pix.', true);
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Gerar QR Code Pix';
    }
  }
}

let pixPollTimer = null;
function pollOrder(orderId) {
  if (pixPollTimer) clearInterval(pixPollTimer);
  pixPollTimer = setInterval(async () => {
    try {
      const order = await api(`/api/vip/order/${encodeURIComponent(orderId)}`);
      if (order.status === 'approved') {
        clearInterval(pixPollTimer);
        pixPollTimer = null;
        const pixStatus = $('#pix-status');
        if (pixStatus) {
          pixStatus.textContent = 'Pagamento aprovado! VIP liberado.';
          pixStatus.classList.remove('error');
        }
        showToast('Pagamento aprovado! VIP liberado.');
      } else if (order.status === 'error') {
        clearInterval(pixPollTimer);
        pixPollTimer = null;
        const pixStatus = $('#pix-status');
        if (pixStatus) {
          pixStatus.textContent = 'Não foi possível concluir o pagamento.';
          pixStatus.classList.add('error');
        }
        showToast('Não foi possível concluir o pagamento.', true);
      }
    } catch {
      // Keep polling; transient errors should not stop the wait.
    }
  }, 5000);
}

async function showArticle(slug) {
  const article = $('#article');
  const content = $('#article-content');
  if (!article || !content) return;
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

async function showReturn() {
  const section = $('#return');
  const content = $('#return-content');
  if (!section || !content) return;
  const orderId = new URLSearchParams(window.location.search).get('order');
  if (!orderId) {
    content.innerHTML = '<h2>Pedido não informado</h2><p>Volte para a página de VIP e escolha um plano.</p><a class="btn btn-primary" href="/vip">Ver planos</a>';
    hideMainSections(section);
    section.hidden = false;
    return;
  }
  try {
    const order = await api(`/api/vip/order/${encodeURIComponent(orderId)}`);
    const approved = order.status === 'approved';
    const pending = order.status === 'pending';
    content.innerHTML = `
      <p class="eyebrow">Retorno do pagamento</p>
      <h2>${approved ? 'VIP ativado!' : pending ? 'Pagamento em análise' : 'Não foi possível concluir'}</h2>
      <span class="return-status ${approved ? '' : pending ? 'pending' : 'failed'}">${escapeHtml(order.status)}</span>
      <p>Plano: <strong>${escapeHtml(order.plan_name)}</strong> • ${escapeHtml(order.days)} dias</p>
      <p>Conta: <strong>${escapeHtml(order.account)}</strong></p>
      <p>Valor: <strong>${escapeHtml(formatBrl(order.amount_cents))}</strong></p>
      <p class="fineprint">${approved ? 'O VIP já está liberado para a conta informada.' : 'Se o pagamento foi aprovado, aguarde alguns instantes e atualize esta página.'}</p>
      <a class="btn btn-primary" href="/vip">Voltar para VIP</a>`;
    hideMainSections(section);
    section.hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
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

function showHome() {
  $$('main > section').forEach(section => {
    if (section.id !== 'article' && section.id !== 'return') section.hidden = false;
  });
  const article = $('#article');
  const ret = $('#return');
  if (article) article.hidden = true;
  if (ret) ret.hidden = true;
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
  renderSocial();
  setText('#year', new Date().getFullYear());
  try {
    const data = await api('/api/site');
    renderSite(data);
    const gameSession = new URLSearchParams(window.location.search).get('session');
    if (gameSession) {
      try {
        const status = await api(`/api/vip/me?session=${encodeURIComponent(gameSession)}`);
        if (status.account) {
          const account = $('#vip-account');
          if (account) account.value = status.account;
        }
      } catch {
        // The game session may have expired; the user can type the account manually.
      }
    }
  } catch (error) {
    showToast('Não foi possível carregar o site. Tente novamente.', true);
    console.error(error);
    return;
  }

  const path = window.location.pathname;
  if (path.startsWith('/noticias/')) {
    await showArticle(decodeURIComponent(path.slice('/noticias/'.length)));
  } else if (path === '/vip/retorno') {
    await showReturn();
  } else {
    showHome();
    if (path === '/vip') document.getElementById('vip')?.scrollIntoView({ behavior: 'smooth' });
    if (path === '/ranking') document.getElementById('ranking')?.scrollIntoView({ behavior: 'smooth' });
    if (path === '/regras') document.getElementById('servidor')?.scrollIntoView({ behavior: 'smooth' });
    if (path === '/faq') document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' });
    if (path === '/noticias') document.getElementById('noticias')?.scrollIntoView({ behavior: 'smooth' });
  }

  setInterval(refreshOnline, 60_000);
}

init();
