// VIP orders and entitlements. A paid order extends the account's expiry; the entitlement table
// is the source of truth the site and the in-game status endpoint read.
import { randomUUID } from 'node:crypto';
import { ACCOUNT_CHECK } from './config';
import { all, db, one, run } from './db';
import { HttpError, numberField, optionalString, stringField } from './http';
import { accountForSession } from './presence';
import { getMpSettings, getPlans } from './settings';
import { createPreference, createPixPayment, getPayment, type MpPayment } from './mercadopago';
import { findPlan } from './plans';
import { accountExists, syncVipAccount } from './openmu';

const DAY = 24 * 60 * 60 * 1000;

export type VipOrder = {
  id: string;
  account: string;
  email: string;
  plan_id: string;
  plan_name: string;
  days: number;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  preference_id: string;
  payment_id: string;
  init_point: string;
  external_reference: string;
  created_at: number;
  updated_at: number;
  paid_at: number | null;
};

export type VipStatus = {
  active: boolean;
  account: string;
  expiresAt: number | null;
  daysLeft: number;
  planName: string;
  planId: string;
  startsAt: number | null;
};

function orderById(id: string): VipOrder | null {
  return one<VipOrder>('SELECT * FROM vip_orders WHERE id = ?', id);
}

function publicOrder(order: VipOrder): Record<string, unknown> {
  return {
    id: order.id,
    account: order.account,
    plan_id: order.plan_id,
    plan_name: order.plan_name,
    days: order.days,
    amount_cents: order.amount_cents,
    currency: order.currency,
    status: order.status,
    created_at: order.created_at,
    paid_at: order.paid_at,
  };
}

export async function createCheckout(
  value: unknown,
  accountOverride: string
): Promise<{
  order: Record<string, unknown>;
  initPoint: string;
}> {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Pedido inválido.');
  const raw = value as Record<string, unknown>;
  // The account comes from the signed site session, never from the request body: a player cannot
  // buy VIP for somebody else's login by editing the form.
  const account = accountOverride;
  const email = optionalString(raw.email, 'E-mail', 160);
  const planId = stringField(raw.planId, 'Plano', 32);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, 'Informe um e-mail válido.');
  }

  const plans = getPlans();
  const plan = findPlan(plans, planId);
  if (!plan) throw new HttpError(400, 'Plano VIP não encontrado.');

  const mp = getMpSettings();
  if (!mp.enabled) throw new HttpError(503, 'As compras de VIP estão desativadas no momento.');
  if (!mp.accessToken) {
    throw new HttpError(503, 'O Mercado Pago ainda não foi configurado. Fale com a administração.');
  }

  if (ACCOUNT_CHECK) {
    let exists = false;
    try {
      exists = await accountExists(account);
    } catch (error) {
      console.warn(`account check failed: ${(error as Error).message}`);
      throw new HttpError(503, 'Não foi possível validar a conta agora. Tente novamente.');
    }
    if (!exists) throw new HttpError(400, 'Conta não encontrada. Confira o login do jogo.');
  }

  const id = randomUUID();
  const now = Date.now();
  const external = `mucura-vip-${id}`;
  run(
    `INSERT INTO vip_orders
       (id, account, email, plan_id, plan_name, days, amount_cents, currency, status, provider,
        external_reference, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'BRL', 'pending', 'mercadopago', ?, ?, ?)`,
    id,
    account,
    email,
    plan.id,
    plan.name,
    plan.days,
    plan.price_cents,
    external,
    now,
    now
  );

  try {
    const preference = await createPreference({
      id,
      account,
      email,
      planId: plan.id,
      planName: plan.name,
      amountCents: plan.price_cents,
      currency: 'BRL',
      days: plan.days,
    });
    run(
      `UPDATE vip_orders SET preference_id = ?, init_point = ?, updated_at = ? WHERE id = ?`,
      preference.id,
      preference.initPoint,
      Date.now(),
      id
    );
    const order = orderById(id);
    if (!order) throw new HttpError(500, 'O pedido não foi gravado.');
    return { order: publicOrder(order), initPoint: preference.initPoint };
  } catch (error) {
    run(
      `UPDATE vip_orders SET status = 'error', raw_json = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify({ error: (error as Error).message }),
      Date.now(),
      id
    );
    throw error;
  }
}

export async function createPixCheckout(
  value: unknown,
  accountOverride: string
): Promise<{
  order: Record<string, unknown>;
  qrCode: string;
  qrCodeBase64: string;
  paymentId: string;
}> {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Pedido inválido.');
  const raw = value as Record<string, unknown>;
  const account = accountOverride;
  const name = optionalString(raw.name, 'Nome completo', 80);
  const cpf = optionalString(raw.cpf, 'CPF', 20);
  const email = optionalString(raw.email, 'E-mail', 160);
  const planId = stringField(raw.planId, 'Plano', 32);
  if (!email) {
    throw new HttpError(400, 'Informe um e-mail para gerar o Pix.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpError(400, 'Informe um e-mail válido.');
  }

  const plans = getPlans();
  const plan = findPlan(plans, planId);
  if (!plan) throw new HttpError(400, 'Plano VIP não encontrado.');

  const mp = getMpSettings();
  if (!mp.enabled) throw new HttpError(503, 'As compras de VIP estão desativadas no momento.');
  if (!mp.accessToken) {
    throw new HttpError(503, 'O Mercado Pago ainda não foi configurado. Fale com a administração.');
  }

  if (ACCOUNT_CHECK) {
    let exists = false;
    try {
      exists = await accountExists(account);
    } catch (error) {
      console.warn(`account check failed: ${(error as Error).message}`);
      throw new HttpError(503, 'Não foi possível validar a conta agora. Tente novamente.');
    }
    if (!exists) throw new HttpError(400, 'Conta não encontrada. Confira o login do jogo.');
  }

  const id = randomUUID();
  const now = Date.now();
  const external = `mucura-vip-${id}`;
  run(
    `INSERT INTO vip_orders
       (id, account, email, plan_id, plan_name, days, amount_cents, currency, status, provider,
        external_reference, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'BRL', 'pending', 'mercadopago', ?, ?, ?)`,
    id,
    account,
    email,
    plan.id,
    plan.name,
    plan.days,
    plan.price_cents,
    external,
    now,
    now
  );

  try {
    const payment = await createPixPayment(
      {
        id,
        account,
        email,
        planId: plan.id,
        planName: plan.name,
        amountCents: plan.price_cents,
        currency: 'BRL',
        days: plan.days,
      },
      { cpf, name, email }
    );
    run(
      `UPDATE vip_orders SET payment_id = ?, preference_id = ?, raw_json = ?, updated_at = ? WHERE id = ?`,
      payment.id,
      payment.id,
      // CPF is used only to create the Mercado Pago payment; it is not part of the site's order.
      JSON.stringify({ pix: payment }),
      Date.now(),
      id
    );
    const order = orderById(id);
    if (!order) throw new HttpError(500, 'O pedido não foi gravado.');
    return {
      order: publicOrder(order),
      qrCode: payment.qrCode,
      qrCodeBase64: payment.qrCodeBase64,
      paymentId: payment.id,
    };
  } catch (error) {
    run(
      `UPDATE vip_orders SET status = 'error', raw_json = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify({ error: (error as Error).message }),
      Date.now(),
      id
    );
    throw error;
  }
}

const orderRefreshAt = new Map<string, number>();
const ORDER_REFRESH_MS = 3000;

export async function getOrderStatus(id: string): Promise<Record<string, unknown> | null> {
  let order = orderById(id);
  if (!order) return null;

  // The webhook is the primary confirmation path, but it can be delayed or misconfigured.
  // While the browser polls a pending Pix order, ask Mercado Pago directly as a fallback.
  if (order.status === 'pending' && order.payment_id) {
    const last = orderRefreshAt.get(id) ?? 0;
    if (Date.now() - last >= ORDER_REFRESH_MS) {
      orderRefreshAt.set(id, Date.now());
      try {
        await processPayment(order.payment_id);
      } catch (error) {
        console.warn(`order ${id} payment refresh failed: ${(error as Error).message}`);
      }
      order = orderById(id) ?? order;
    }
  }
  if (order.status !== 'pending') orderRefreshAt.delete(id);
  return publicOrder(order);
}

function extendEntitlement(order: VipOrder, paymentId: string, raw: unknown): void {
  const existing = one<{ id: number }>('SELECT id FROM vip_entitlements WHERE source_order = ?', order.id);
  if (existing) {
    // A previous attempt may have written the entitlement and failed before marking the order.
    // Keep the entitlement single-use but make the order state consistent.
    const now = Date.now();
    run(
      `UPDATE vip_orders SET status = 'approved', payment_id = ?, paid_at = COALESCE(paid_at, ?),
         raw_json = ?, updated_at = ? WHERE id = ? AND status <> 'approved'`,
      paymentId,
      now,
      JSON.stringify(raw),
      now,
      order.id
    );
    return;
  }

  const now = Date.now();
  const current = one<{ expires_at: number | null }>(
    `SELECT MAX(expires_at) AS expires_at FROM vip_entitlements
     WHERE lower(account) = lower(?) AND expires_at > ?`,
    order.account,
    now
  );
  const startsAt = Math.max(now, current?.expires_at ?? 0);
  const expiresAt = startsAt + order.days * DAY;
  run(
    `INSERT INTO vip_entitlements
       (account, plan_id, plan_name, starts_at, expires_at, source_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    order.account,
    order.plan_id,
    order.plan_name,
    startsAt,
    expiresAt,
    order.id,
    now
  );
  run(
    `UPDATE vip_orders SET status = 'approved', payment_id = ?, paid_at = ?, raw_json = ?, updated_at = ?
     WHERE id = ? AND status <> 'approved'`,
    paymentId,
    now,
    JSON.stringify(raw),
    now,
    order.id
  );
}

export function approveOrder(orderId: string, paymentId: string, raw: unknown): VipOrder {
  const order = orderById(orderId);
  if (!order) throw new HttpError(404, 'Pedido não encontrado.');

  const transaction = db.transaction(() => {
    extendEntitlement(order, paymentId, raw);
  });
  transaction();
  const updated = orderById(orderId);
  if (!updated) throw new HttpError(500, 'O pedido não foi atualizado.');
  pushAccountToGame(updated.account);
  return updated;
}

/**
 * Copies an account's current VIP into the game's table. The game keeps working when OpenMU is
 * down; the sync is retried on the next order and on every panel read, so a failure is logged, not
 * thrown at a player who already paid.
 */
export function pushAccountToGame(account: string): void {
  const status = vipStatus(account);
  syncVipAccount(account, status.planId, status.expiresAt).catch(error =>
    console.warn(`VIP sync for ${account} failed: ${(error as Error).message}`)
  );
}

export async function processPayment(paymentId: string): Promise<{ approved: boolean; orderId?: string }> {
  const payment = await getPayment(paymentId);
  return processPaymentObject(payment);
}

export function processPaymentObject(payment: MpPayment): { approved: boolean; orderId?: string } {
  if (payment.status !== 'approved') return { approved: false };
  const orderId = payment.external_reference;
  if (!orderId) return { approved: false };
  const order = orderById(orderId);
  if (!order) return { approved: false };

  const paid = Number(payment.transaction_amount);
  if (!Number.isFinite(paid) || Math.abs(paid * 100 - order.amount_cents) > 1) {
    console.warn(`payment ${payment.id}: amount ${paid} does not match order ${order.id}`);
    return { approved: false, orderId };
  }
  if (payment.currency_id && payment.currency_id !== order.currency) {
    console.warn(`payment ${payment.id}: currency ${payment.currency_id} does not match order ${order.id}`);
    return { approved: false, orderId };
  }
  // Keep only the payment fields the site needs. The full Mercado Pago payload can contain payer
  // details such as CPF, which must not be copied into the site's order row.
  approveOrder(order.id, String(payment.id), {
    id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    external_reference: payment.external_reference,
    transaction_amount: payment.transaction_amount,
    currency_id: payment.currency_id,
    date_approved: payment.date_approved,
    payment_method_id: payment.payment_method_id,
  });
  return { approved: true, orderId: order.id };
}

export function vipStatus(account: string): VipStatus {
  const row = one<{ expires_at: number; plan_name: string; plan_id: string; starts_at: number }>(
    `SELECT expires_at, plan_name, plan_id, starts_at FROM vip_entitlements
     WHERE lower(account) = lower(?) AND expires_at > ?
     ORDER BY expires_at DESC LIMIT 1`,
    account,
    Date.now()
  );
  if (!row) return { active: false, account, expiresAt: null, daysLeft: 0, planName: '', planId: '', startsAt: null };
  return {
    active: true,
    account,
    expiresAt: row.expires_at,
    daysLeft: Math.max(1, Math.ceil((row.expires_at - Date.now()) / DAY)),
    planName: row.plan_name,
    planId: row.plan_id || '',
    startsAt: row.starts_at,
  };
}

/** The account's whole VIP history, newest first. Powers the player panel's history block. */
export function vipHistory(account: string): Record<string, unknown>[] {
  const rows = all<{ plan_name: string; plan_id: string; starts_at: number; expires_at: number; source_order: string; created_at: number }>(
    `SELECT plan_name, plan_id, starts_at, expires_at, source_order, created_at FROM vip_entitlements
     WHERE lower(account) = lower(?)
     ORDER BY starts_at DESC, created_at DESC
     LIMIT 20`,
    account
  );
  const now = Date.now();
  return rows.map(row => ({
    plan_name: row.plan_name,
    plan_id: row.plan_id || '',
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    active: row.expires_at > now,
    created_at: row.created_at,
  }));
}

export async function vipStatusForSession(nonce: string): Promise<VipStatus> {
  const account = await accountForSession(nonce);
  if (!account) throw new HttpError(401, 'Sessão do jogo não encontrada.');
  return vipStatus(account);
}

export function listOrders(limit = 100, status?: string): Record<string, unknown>[] {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const rows = status
    ? all<VipOrder>(
        'SELECT * FROM vip_orders WHERE status = ? ORDER BY created_at DESC LIMIT ?',
        status,
        safeLimit
      )
    : all<VipOrder>('SELECT * FROM vip_orders ORDER BY created_at DESC LIMIT ?', safeLimit);
  return rows.map(publicOrder);
}

export function orderStats(): {
  orders: number;
  approved: number;
  pending: number;
  revenue_cents: number;
  active_vip: number;
} {
  const orders = one<{ n: number }>('SELECT COUNT(*) AS n FROM vip_orders')?.n ?? 0;
  const approved = one<{ n: number }>('SELECT COUNT(*) AS n FROM vip_orders WHERE status = ?', 'approved')?.n ?? 0;
  const pending = one<{ n: number }>('SELECT COUNT(*) AS n FROM vip_orders WHERE status = ?', 'pending')?.n ?? 0;
  const revenue =
    one<{ total: number | null }>(
      "SELECT SUM(amount_cents) AS total FROM vip_orders WHERE status = 'approved'"
    )?.total ?? 0;
  const active = one<{ n: number }>(
    'SELECT COUNT(DISTINCT lower(account)) AS n FROM vip_entitlements WHERE expires_at > ?',
    Date.now()
  )?.n ?? 0;
  return {
    orders,
    approved,
    pending,
    revenue_cents: Number(revenue) || 0,
    active_vip: active,
  };
}

export function manualApprove(orderId: string): Record<string, unknown> {
  const order = approveOrder(orderId, 'manual', { manual: true, at: new Date().toISOString() });
  return publicOrder(order);
}

/** Kept for the admin's price validation; the value is already in cents. */
export function cents(value: unknown): number {
  return numberField(value, 'Valor', 100, 10_000_000);
}
