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
  /**
   * Multiplier on the chance a monster's item drop group rolls. Stored and shown, but OpenMU has
   * no per-player hook for it yet (see openmu/readme.md), so the game does not apply it.
   */
  drop_multiplier: number;
  /** Multiplier on the zen a killed monster pays out. */
  zen_multiplier: number;
  /**
   * Percent chance (0 to 100) that a monster the player kills drops one extra jewel. The game server's
   * VIP plugin rolls it on each kill.
   */
  jewel_drop_percent: number;
  /**
   * Multiplier on the experience a party member's kill passes on. Stored and shown; OpenMU has no
   * per-player hook for it yet.
   */
  party_xp_multiplier: number;
};

/** The extra jewel chance every plan starts with, in percent. */
export const DEFAULT_JEWEL_DROP_PERCENT = 5;

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
  jewel_drop_percent: DEFAULT_JEWEL_DROP_PERCENT,
  party_xp_multiplier: 2,
};

const tier = (multiplier: number) => ({
  xp_multiplier: multiplier,
  master_xp_multiplier: multiplier,
  drop_multiplier: multiplier,
  zen_multiplier: multiplier,
  jewel_drop_percent: DEFAULT_JEWEL_DROP_PERCENT,
  party_xp_multiplier: multiplier,
});

/**
 * What each card lists. The multipliers are the ones the game applies; drop and party XP are not
 * listed because OpenMU still cannot apply them per player (openmu/readme.md, VIP plans).
 */
const TIER_BENEFITS = {
  bronze: [
    '2x de XP de up',
    '2x de XP Master',
    '2x de Zen por monstro',
    'Tag VIP no site',
    'Troca de mapa pelo painel do site',
  ],
  prata: [
    '4x de XP de up',
    '4x de XP Master',
    '4x de Zen por monstro',
    'Tag VIP no site',
    'Troca de mapa pelo painel do site',
    'Inclui todos os benefícios do Bronze',
  ],
  ouro: [
    '8x de XP de up',
    '8x de XP Master',
    '8x de Zen por monstro',
    'Tag VIP no site',
    'Troca de mapa pelo painel do site',
    'Inclui todos os benefícios do Prata',
  ],
} as const satisfies Record<string, readonly string[]>;

export const DEFAULT_PLANS: VipPlan[] = [
  {
    id: 'bronze',
    name: 'VIP Bronze',
    days: 30,
    price_cents: 1990,
    description: 'O primeiro passo para uma jornada com mais vantagens.',
    benefits: [...TIER_BENEFITS.bronze],
    highlight: false,
    game: tier(2),
  },
  {
    id: 'prata',
    name: 'VIP Prata',
    days: 30,
    price_cents: 2990,
    description: 'Para quem joga todo dia e quer sentir a diferença.',
    benefits: [...TIER_BENEFITS.prata],
    highlight: false,
    game: tier(4),
  },
  {
    id: 'ouro',
    name: 'VIP Ouro',
    days: 30,
    price_cents: 4990,
    description: 'A experiência completa MUCURA, sem limites.',
    benefits: [...TIER_BENEFITS.ouro],
    highlight: true,
    game: tier(8),
  },
];

/**
 * Benefit lists shipped by earlier releases. A site installed before the explicit lists existed
 * keeps them in its settings, so the upgrade below replaces only an exact old default and never a
 * list the owner edited in /admin.
 */
const LEGACY_TIER_BENEFITS: Record<string, readonly (readonly string[])[]> = {
  bronze: [
    ['2x de XP de up', '2x de XP Master', '2x de zen por monstro', 'Tag VIP no site'],
    ['2x de XP e 2x de drop', '2x de zen por monstro', 'Tag VIP no site', 'Canal exclusivo no Discord'],
    ['Tag VIP no site', 'Canal exclusivo no Discord', '30 dias de benefícios'],
  ],
  prata: [
    ['4x de XP de up', '4x de XP Master', '4x de zen por monstro', 'Tudo do Bronze'],
    ['4x de XP e 4x de drop', '4x de zen por monstro', 'Tudo do Bronze', 'Sorteios mensais'],
    ['Tudo do Bronze', 'Prioridade em eventos', 'Sorteios mensais'],
  ],
  ouro: [
    ['8x de XP de up', '8x de XP Master', '8x de zen por monstro', 'Tudo do Prata'],
    ['8x de XP e 8x de drop', '8x de zen por monstro', 'Tudo do Prata', 'Badge dourada no site'],
    ['Tudo do Prata', 'Badge dourada no site', 'Acesso antecipado a novidades'],
  ],
};

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

/** Reads one percent chance; 0 turns the benefit off. */
function percent(value: unknown, name: string, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new HttpError(400, `A chance de ${name} deve ficar entre 0% e 100%.`);
  }
  return Math.round(parsed * 100) / 100;
}

export function parseBenefits(value: unknown, fallback: VipBenefits = DEFAULT_BENEFITS): VipBenefits {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const result = { ...fallback };
  for (const key of BENEFIT_KEYS) {
    result[key] = key === 'jewel_drop_percent'
      ? percent(raw[key], key, fallback[key])
      : multiplier(raw[key], key, fallback[key]);
  }
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

/** The line the game's admin panel shows per plan: "VIP Bronze: 5%". Read by the VIP jewel plug-in's screen. */
export function jewelDropSummary(plans: VipPlan[]): string {
  return plans.map(plan => `${plan.name}: ${plan.game.jewel_drop_percent}%`).join(' | ');
}

function sameBenefitList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Upgrades a default tier's old benefit list to the explicit one. Only an exact list shipped by
 * this file is replaced; a list edited in /admin is left alone. Returns the same array when there
 * is nothing to change, so the caller can skip the write.
 */
export function upgradeTierBenefits(plans: VipPlan[]): VipPlan[] {
  let changed = false;
  const upgraded = plans.map(plan => {
    const current = DEFAULT_PLANS.find(candidate => candidate.id === plan.id);
    const legacy = LEGACY_TIER_BENEFITS[plan.id];
    if (!current || !legacy) return plan;
    if (!legacy.some(list => sameBenefitList(plan.benefits, list))) return plan;
    changed = true;
    return { ...plan, benefits: [...current.benefits] };
  });
  return changed ? upgraded : plans;
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
