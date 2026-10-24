// VIP plans are data, not code: the admin panel edits them and the checkout reads them.
import { HttpError } from './http';

/**
 * What a plan changes in the game. The game server's VIP plugin reads the same numbers, so a
 * plan edited here is the plan the player receives.
 */
export type VipBenefits = {
  /** Multiplier on killing experience: 2 means "2x more XP than a free account". */
  xp_multiplier: number;
  /** Multiplier on master (Master Level) experience. */
  master_xp_multiplier: number;
  /** Multiplier on the chance a monster's item drop group rolls. */
  drop_multiplier: number;
  /** Multiplier on the zen a killed monster pays out. */
  zen_multiplier: number;
  /** Multiplier on the experience a party member's kill passes on. */
  party_xp_multiplier: number;
};

export type VipPlan = {
  id: string;
  name: string;
  days: number;
  price_cents: number;
  description: string;
  benefits: string[];
  highlight: boolean;
  /** Tier of the plan; the game server applies the active entitlement's numbers. */
  game: VipBenefits;
};

export const DEFAULT_BENEFITS: VipBenefits = {
  xp_multiplier: 2,
  master_xp_multiplier: 2,
  drop_multiplier: 2,
  zen_multiplier: 2,
  party_xp_multiplier: 2,
};

export const DEFAULT_PLANS: VipPlan[] = [
  {
    id: 'bronze',
    name: 'VIP Bronze',
    days: 30,
    price_cents: 1990,
    description: 'O primeiro passo para uma jornada com mais vantagens.',
    benefits: ['2x de XP e 2x de drop', '2x de zen por monstro', 'Tag VIP no site', 'Canal exclusivo no Discord'],
    highlight: false,
    game: { xp_multiplier: 2, master_xp_multiplier: 2, drop_multiplier: 2, zen_multiplier: 2, party_xp_multiplier: 2 },
  },
  {
    id: 'prata',
    name: 'VIP Prata',
    days: 30,
    price_cents: 2990,
    description: 'Para quem joga todo dia e quer sentir a diferença.',
    benefits: ['4x de XP e 4x de drop', '4x de zen por monstro', 'Tudo do Bronze', 'Sorteios mensais'],
    highlight: false,
    game: { xp_multiplier: 4, master_xp_multiplier: 4, drop_multiplier: 4, zen_multiplier: 4, party_xp_multiplier: 4 },
  },
  {
    id: 'ouro',
    name: 'VIP Ouro',
    days: 30,
    price_cents: 4990,
    description: 'A experiência completa MUCURA, sem limites.',
    benefits: ['8x de XP e 8x de drop', '8x de zen por monstro', 'Tudo do Prata', 'Badge dourada no site'],
    highlight: true,
    game: { xp_multiplier: 8, master_xp_multiplier: 8, drop_multiplier: 8, zen_multiplier: 8, party_xp_multiplier: 8 },
  },
];

const BENEFIT_KEYS = Object.keys(DEFAULT_BENEFITS) as (keyof VipBenefits)[];

/** Reads one multiplier; 1 means "no change", which is what a plan without the field gets. */
function multiplier(value: unknown, name: string, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0.1 || parsed > 100) {
    throw new HttpError(400, `Multiplicador ${name} deve ficar entre 0,1x e 100x.`);
  }
  return Math.round(parsed * 100) / 100;
}

export function parseBenefits(value: unknown, fallback: VipBenefits = DEFAULT_BENEFITS): VipBenefits {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const result = { ...fallback };
  for (const key of BENEFIT_KEYS) result[key] = multiplier(raw[key], key, fallback[key]);
  return result;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

export function parsePlans(value: unknown): VipPlan[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, 'Informe pelo menos um plano VIP.');
  }
  if (value.length > 12) throw new HttpError(400, 'Use no máximo 12 planos VIP.');

  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new HttpError(400, `Plano ${index + 1} inválido.`);
    }
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
    if (!ID_RE.test(id)) {
      throw new HttpError(400, `O identificador do plano ${index + 1} deve ter 2 a 32 letras, números, _ ou -.`);
    }
    if (ids.has(id)) throw new HttpError(400, `O plano "${id}" está repetido.`);
    ids.add(id);

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name || name.length > 60) throw new HttpError(400, `Nome do plano ${index + 1} inválido.`);

    const days = Number(raw.days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new HttpError(400, `Duração do plano ${name} deve ser de 1 a 3650 dias.`);
    }

    const price = Number(raw.price_cents);
    if (!Number.isInteger(price) || price < 100 || price > 100_000_00) {
      throw new HttpError(400, `Preço do plano ${name} inválido (mínimo R$ 1,00).`);
    }

    const description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 300) : '';
    const benefits = Array.isArray(raw.benefits)
      ? raw.benefits
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.trim())
          .filter(Boolean)
          .slice(0, 12)
      : [];

    return {
      id,
      name: name.slice(0, 60),
      days,
      price_cents: price,
      description,
      benefits,
      highlight: raw.highlight === true,
      game: parseBenefits(raw.game),
    };
  });
}

export function findPlan(plans: VipPlan[], id: string): VipPlan | undefined {
  return plans.find(plan => plan.id === id);
}

/** Names a plan used to get from a fresh checkout, in order: "Vip 1", "VIP 2", ... */
const GENERIC_NAME = /^(?:vip|plano)\s*\d+$/i;

/**
 * Plans saved before the tiers had names keep the admin's price, days and benefits; only a generic
 * name ("Vip 1") becomes the tier name ("VIP Bronze"), matched by position. Returns the same array
 * when there is nothing to rename, so the caller can skip the write.
 */
export function renameTierPlans(plans: VipPlan[]): VipPlan[] {
  let changed = false;
  const renamed = plans.map((plan, index) => {
    const tier = DEFAULT_PLANS[index];
    if (!tier || !GENERIC_NAME.test(plan.name.trim())) return plan;
    changed = true;
    return { ...plan, name: tier.name };
  });
  return changed ? renamed : plans;
}

export function formatBrl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
