// VIP plans are data, not code: the admin panel edits them and the checkout reads them.
import { HttpError } from './http';

export type VipPlan = {
  id: string;
  name: string;
  days: number;
  price_cents: number;
  description: string;
  benefits: string[];
  highlight: boolean;
};

export const DEFAULT_PLANS: VipPlan[] = [
  {
    id: 'bronze',
    name: 'VIP Bronze',
    days: 30,
    price_cents: 1990,
    description: 'O primeiro passo para uma jornada com mais vantagens.',
    benefits: ['Tag VIP no site', 'Canal exclusivo no Discord', '30 dias de benefícios'],
    highlight: false,
  },
  {
    id: 'prata',
    name: 'VIP Prata',
    days: 30,
    price_cents: 2990,
    description: 'Para quem joga todo dia e quer sentir a diferença.',
    benefits: ['Tudo do Bronze', 'Prioridade em eventos', 'Sorteios mensais'],
    highlight: false,
  },
  {
    id: 'ouro',
    name: 'VIP Ouro',
    days: 30,
    price_cents: 4990,
    description: 'A experiência completa MUCURA, sem limites.',
    benefits: ['Tudo do Prata', 'Badge dourada no site', 'Acesso antecipado a novidades'],
    highlight: true,
  },
];

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
    };
  });
}

export function findPlan(plans: VipPlan[], id: string): VipPlan | undefined {
  return plans.find(plan => plan.id === id);
}

export function formatBrl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
