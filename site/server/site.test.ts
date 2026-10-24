import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';
import { WARP_MAPS, findWarpMap, publicWarpMaps } from './maps';
import { verifyWebhookSignature } from './mpSignature';
import { panelAllowed } from './panelRules';
import { DEFAULT_BENEFITS, DEFAULT_PLANS, findPlan, formatBrl, parsePlans, renameTierPlans } from './plans';
import { slugify } from './slug';

describe('slugify', () => {
  it('folds Portuguese accents instead of dropping the letters', () => {
    expect(slugify('Notícia em Ação')).toBe('noticia-em-acao');
    expect(slugify('  Atualização   do Servidor!  ')).toBe('atualizacao-do-servidor');
  });

  it('never returns an empty path segment', () => {
    expect(slugify('!!!')).toBe('noticia');
    expect(slugify('a'.repeat(120))).toHaveLength(80);
  });
});

describe('VIP plans', () => {
  it('ships usable defaults', () => {
    expect(DEFAULT_PLANS.length).toBeGreaterThan(0);
    expect(new Set(DEFAULT_PLANS.map(plan => plan.id)).size).toBe(DEFAULT_PLANS.length);
    expect(findPlan(DEFAULT_PLANS, 'ouro')?.highlight).toBe(true);
    expect(formatBrl(1990)).toContain('19,90');
  });

  it('normalizes admin input and drops unsafe extras', () => {
    const plans = parsePlans([
      {
        id: '  OURO ',
        name: '  VIP Ouro  ',
        days: '30',
        price_cents: '4990',
        description: '  completo  ',
        benefits: [' Tudo ', '', 42, 'Badge'],
        highlight: true,
        unknown: 'ignored',
        game: { xp_multiplier: 8, drop_multiplier: 8 },
      },
    ]);
    expect(plans).toEqual([
      {
        id: 'ouro',
        name: 'VIP Ouro',
        days: 30,
        price_cents: 4990,
        description: 'completo',
        benefits: ['Tudo', 'Badge'],
        highlight: true,
        game: { ...DEFAULT_BENEFITS, xp_multiplier: 8, drop_multiplier: 8 },
      },
    ]);
  });

  it('renames generic tier plans and leaves a hand-picked name alone', () => {
    const generic = parsePlans([
      { id: 'vip1', name: 'Vip 1', days: 30, price_cents: 1990 },
      { id: 'vip2', name: ' vip 2 ', days: 60, price_cents: 2990 },
    ]);
    const renamed = renameTierPlans(generic);
    expect(renamed.map(plan => plan.name)).toEqual(['VIP Bronze', 'VIP Prata']);
    expect(renamed[1].days).toBe(60);
    expect(renamed[1].price_cents).toBe(2990);

    const custom = parsePlans([{ id: 'diamante', name: 'Membro Diamante', days: 30, price_cents: 1990 }]);
    expect(renameTierPlans(custom)).toBe(custom);
  });

  it('keeps the plan\'s game multipliers inside safe limits', () => {
    const parsed = parsePlans([
      { id: 'vip1', name: 'VIP 1', days: 30, price_cents: 1990, game: { xp_multiplier: 2, drop_multiplier: '4' } },
      { id: 'vip2', name: 'VIP 2', days: 30, price_cents: 2990, game: { xp_multiplier: 100 } },
    ]);
    expect(parsed[0].game).toEqual({
      xp_multiplier: 2,
      master_xp_multiplier: 2,
      drop_multiplier: 4,
      zen_multiplier: 2,
      party_xp_multiplier: 2,
    });
    expect(parsed[1].game.xp_multiplier).toBe(100);
  });

  it('rejects a multiplier outside 0.1x to 100x', () => {
    const bad = { id: 'bad', name: 'VIP', days: 30, price_cents: 1990, game: { xp_multiplier: 1000 } };
    expect(() => parsePlans([bad])).toThrow(/entre 0,1x e 100x/);
  });

  it('defaults a plan without game numbers to no bonus', () => {
    const parsed = parsePlans([{ id: 'plain', name: 'VIP', days: 30, price_cents: 1990 }]);
    expect(parsed[0].game).toEqual(DEFAULT_BENEFITS);
  });

  it('rejects duplicates, bad identifiers, durations and prices', () => {
    const base = { name: 'VIP', days: 30, price_cents: 1990, description: '', benefits: [], game: DEFAULT_BENEFITS };
    expect(() => parsePlans([])).toThrow(/pelo menos um plano/i);
    expect(() => parsePlans([{ ...base, id: 'a' }])).toThrow(/identificador/i);
    expect(() => parsePlans([{ ...base, id: 'x y' }])).toThrow(/identificador/i);
    expect(() => parsePlans([{ ...base, id: 'a1' }, { ...base, id: 'A1' }])).toThrow(/repetido/i);
    expect(() => parsePlans([{ ...base, id: 'a1', days: 0 }])).toThrow(/Duração/i);
    expect(() => parsePlans([{ ...base, id: 'a1', price_cents: 99 }])).toThrow(/Preço/i);
    expect(() => parsePlans(Array.from({ length: 13 }, (_, index) => ({ ...base, id: `p${index}` })))).toThrow(
      /12 planos/i
    );
  });
});

describe('player panel access', () => {
  it('gates the extra actions only when the admin chooses VIP-only', () => {
    expect(panelAllowed(false, true)).toBe(false);
    expect(panelAllowed(true, true)).toBe(true);
    expect(panelAllowed(false, false)).toBe(true);
    expect(panelAllowed(true, false)).toBe(true);
  });
});

describe('warp destinations', () => {
  it('ships the 37 client entries with unique identifiers', () => {
    expect(WARP_MAPS).toHaveLength(37);
    expect(new Set(WARP_MAPS.map(map => map.id)).size).toBe(WARP_MAPS.length);
    expect(WARP_MAPS.every(map => map.level > 0 && map.zen > 0 && map.map >= 0)).toBe(true);
  });

  it('sends Vulcanus as the server index instead of the client list index', () => {
    const vulcanus = findWarpMap('VULCANUS');
    expect(vulcanus?.name).toBe('Vulcanus');
    // The client file lists Vulcanus at 42; OpenMU's warp list expects 37.
    expect(vulcanus?.serverIndex).toBe(37);
  });

  it('finds by id and keeps the server index out of the public payload', () => {
    expect(findWarpMap('  Lorencia ')).toMatchObject({ name: 'Lorencia', map: 0 });
    expect(findWarpMap('nope')).toBeNull();
    expect('serverIndex' in publicWarpMaps()[0]).toBe(false);
  });
});

describe('news Markdown', () => {
  it('renders the supported blocks', () => {
    const html = renderMarkdown(
      ['# Título', '', 'Texto **forte** e *leve*.', '', '- um', '- dois', '', '1. primeiro', '2. segundo', '', '> aviso', '', '---', '', '[site](https://example.com)'].join('\n')
    );
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>forte</strong>');
    expect(html).toContain('<em>leve</em>');
    expect(html).toContain('<ul><li>um</li><li>dois</li></ul>');
    expect(html).toContain('<ol><li>primeiro</li><li>segundo</li></ol>');
    expect(html).toContain('<blockquote>aviso</blockquote>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<a href="https://example.com/" rel="noopener noreferrer">site</a>');
  });

  it('escapes HTML and refuses script URLs', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[clique](javascript:alert(1))');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<a ');
  });

  it('turns single newlines into line breaks inside a paragraph', () => {
    expect(renderMarkdown('linha um\nlinha dois')).toBe('<p>linha um<br>linha dois</p>');
  });
});

describe('Mercado Pago webhook signature', () => {
  const secret = 'webhook-secret';
  const dataId = '123456';
  const requestId = 'request-abc';
  const ts = '1704908010';
  const v1 = createHmac('sha256', secret)
    .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
    .digest('hex');

  it('accepts the manifest Mercado Pago signs', () => {
    expect(verifyWebhookSignature(`ts=${ts},v1=${v1}`, requestId, dataId, secret)).toBe(true);
  });

  it('rejects a wrong secret, missing headers, and a tampered id', () => {
    expect(verifyWebhookSignature(`ts=${ts},v1=${v1}`, requestId, dataId, 'other')).toBe(false);
    expect(verifyWebhookSignature(null, requestId, dataId, secret)).toBe(false);
    expect(verifyWebhookSignature(`ts=${ts},v1=${v1}`, null, dataId, secret)).toBe(false);
    expect(verifyWebhookSignature(`ts=${ts},v1=${v1}`, requestId, '999', secret)).toBe(false);
    expect(verifyWebhookSignature('garbage', requestId, dataId, secret)).toBe(false);
  });

  it('is permissive only when no secret is configured', () => {
    expect(verifyWebhookSignature(null, null, '', '')).toBe(true);
  });
});
