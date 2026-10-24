// Mercado Pago Checkout Pro through the REST API. No SDK: one fewer dependency, and the exact
// request body is visible here for whoever configures the account.
import { SITE_BASE_URL } from './config';
import { HttpError } from './http';
import { getMpSettings, type MpSettings } from './settings';

export type PreferenceOrder = {
  id: string;
  account: string;
  email: string;
  planId: string;
  planName: string;
  amountCents: number;
  currency: string;
  days: number;
};

export type Preference = { id: string; initPoint: string };

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string;
  payment_method_id?: string;
};

function apiError(status: number, body: unknown): HttpError {
  let message = `Mercado Pago respondeu ${status}.`;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.message === 'string') message = record.message;
    else if (typeof record.error === 'string') message = record.error;
  }
  return new HttpError(502, `Mercado Pago: ${message}`);
}

async function request<T>(path: string, settings: MpSettings, init: RequestInit): Promise<T> {
  if (!settings.accessToken) {
    throw new HttpError(503, 'O Mercado Pago ainda não foi configurado no painel.');
  }
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${settings.accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw apiError(response.status, body);
  return body as T;
}

export async function createPreference(order: PreferenceOrder): Promise<Preference> {
  const settings = getMpSettings();
  if (!settings.enabled) {
    throw new HttpError(503, 'As compras de VIP estão desativadas no momento.');
  }
  const back = `${SITE_BASE_URL}/vip/retorno?order=${encodeURIComponent(order.id)}`;
  const body = {
    items: [
      {
        id: order.planId,
        title: `${order.planName} — MUCURA`,
        description: `${order.days} dias de VIP para a conta ${order.account}`,
        quantity: 1,
        currency_id: order.currency,
        unit_price: order.amountCents / 100,
      },
    ],
    payer: order.email ? { email: order.email } : undefined,
    external_reference: order.id,
    notification_url: `${SITE_BASE_URL}/api/vip/webhook`,
    back_urls: {
      success: `${back}&status=approved`,
      pending: `${back}&status=pending`,
      failure: `${back}&status=failure`,
    },
    auto_return: 'approved',
    statement_descriptor: settings.statementDescriptor.slice(0, 22),
    metadata: {
      order_id: order.id,
      account: order.account,
      plan_id: order.planId,
      days: order.days,
    },
  };

  const response = await request<{
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  }>('/checkout/preferences', settings, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const initPoint = settings.sandbox
    ? response.sandbox_init_point || response.init_point
    : response.init_point || response.sandbox_init_point;
  if (!response.id || !initPoint) {
    throw new HttpError(502, 'O Mercado Pago não devolveu o link de pagamento.');
  }
  return { id: response.id, initPoint };
}

export async function getPayment(id: string): Promise<MpPayment> {
  const settings = getMpSettings();
  return request<MpPayment>(`/v1/payments/${encodeURIComponent(id)}`, settings, { method: 'GET' });
}

export async function testConnection(): Promise<{ ok: boolean; nickname?: string; email?: string }> {
  const settings = getMpSettings();
  if (!settings.accessToken) {
    throw new HttpError(400, 'Informe o access token antes de testar.');
  }
  const user = await request<{ nickname?: string; email?: string }>('/users/me', settings, {
    method: 'GET',
  });
  return { ok: true, nickname: user.nickname, email: user.email };
}

export type PixPayment = {
  id: string;
  status: string;
  qrCode: string;
  qrCodeBase64: string;
};

export type PixPayer = {
  cpf: string;
  name?: string;
  email?: string;
};

export async function createPixPayment(order: PreferenceOrder, payer: PixPayer): Promise<PixPayment> {
  const settings = getMpSettings();
  if (!settings.enabled) {
    throw new HttpError(503, 'As compras de VIP estão desativadas no momento.');
  }
  const cpf = payer.cpf.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf)) {
    throw new HttpError(400, 'Informe um CPF válido.');
  }
  const nameParts = (payer.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || firstName;

  const body = {
    transaction_amount: order.amountCents / 100,
    description: `${order.planName} — MUCURA`,
    payment_method_id: 'pix',
    external_reference: order.id,
    notification_url: `${SITE_BASE_URL}/api/vip/webhook`,
    payer: {
      email: payer.email || order.email || undefined,
      first_name: firstName,
      last_name: lastName,
      identification: {
        type: 'CPF',
        number: cpf,
      },
    },
  };

  const response = await request<{
    id?: number | string;
    status?: string;
    point_of_interaction?: {
      transaction_data?: {
        qr_code?: string;
        qr_code_base64?: string;
      };
    };
  }>('/v1/payments', settings, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const qrCode = response.point_of_interaction?.transaction_data?.qr_code;
  const qrCodeBase64 = response.point_of_interaction?.transaction_data?.qr_code_base64;
  if (!response.id || !qrCode) {
    throw new HttpError(502, 'O Mercado Pago não gerou o QR Code Pix.');
  }
  return {
    id: String(response.id),
    status: response.status || 'pending',
    qrCode,
    qrCodeBase64: qrCodeBase64 || '',
  };
}
