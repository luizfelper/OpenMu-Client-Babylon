// News: the admin writes it, the public site reads it. Bodies are Markdown, escaped and rendered
// in `markdown.ts` before they leave this service.
import { all, one, run } from './db';
import { HttpError, booleanField, optionalString, safeHttpUrl, stringField } from './http';
import { renderMarkdown } from './markdown';
import { slugify } from './slug';

export type NewsRow = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: string;
  image_url: string;
  published: number;
  pinned: number;
  created_at: number;
  updated_at: number;
};

export type NewsSummary = Omit<NewsRow, 'body' | 'published' | 'pinned'> & {
  published: boolean;
  pinned: boolean;
  html?: string;
};

function summary(row: NewsRow): NewsSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    category: row.category,
    image_url: row.image_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published: row.published === 1,
    pinned: row.pinned === 1,
  };
}

export function listNews(options: { publishedOnly?: boolean; limit?: number; offset?: number } = {}): NewsSummary[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);
  const where = options.publishedOnly ? 'WHERE published = 1' : '';
  return all<NewsRow>(
    `SELECT * FROM news ${where} ORDER BY pinned DESC, created_at DESC LIMIT ? OFFSET ?`,
    limit,
    offset
  ).map(summary);
}

export function newsCount(publishedOnly = false): number {
  const row = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM news ${publishedOnly ? 'WHERE published = 1' : ''}`
  );
  return row?.n ?? 0;
}

/** The admin list needs the body so an edit can open without a second request. */
export type AdminNewsRow = Omit<NewsRow, 'published' | 'pinned'> & {
  published: boolean;
  pinned: boolean;
};

export function adminNews(limit = 200): AdminNewsRow[] {
  return all<NewsRow>('SELECT * FROM news ORDER BY pinned DESC, created_at DESC LIMIT ?', limit).map(row => ({
    ...row,
    published: row.published === 1,
    pinned: row.pinned === 1,
  }));
}

export function getNewsBySlug(slug: string, publishedOnly = true): (NewsSummary & { body: string; html: string }) | null {
  const row = one<NewsRow>(
    `SELECT * FROM news WHERE slug = ? ${publishedOnly ? 'AND published = 1' : ''}`,
    slug
  );
  if (!row) return null;
  return { ...summary(row), body: row.body, html: renderMarkdown(row.body) };
}

export function getNewsById(id: number): NewsRow | null {
  return one<NewsRow>('SELECT * FROM news WHERE id = ?', id);
}

function uniqueSlug(title: string, exceptId?: number): string {
  const base = slugify(title);
  let candidate = base;
  for (let i = 2; i < 1000; i++) {
    const found = one<{ id: number }>('SELECT id FROM news WHERE slug = ?', candidate);
    if (!found || found.id === exceptId) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

type NewsInput = {
  title: string;
  body: string;
  excerpt: string;
  category: string;
  image_url: string;
  published: boolean;
  pinned: boolean;
};

function parseInput(value: unknown): NewsInput {
  if (!value || typeof value !== 'object') throw new HttpError(400, 'Notícia inválida.');
  const raw = value as Record<string, unknown>;
  const title = stringField(raw.title, 'Título', 140);
  const body = stringField(raw.body, 'Conteúdo', 20_000);
  const excerpt = optionalString(raw.excerpt, 'Resumo', 300) || body.replace(/[#*_>`]/g, '').slice(0, 180);
  return {
    title,
    body,
    excerpt,
    category: optionalString(raw.category, 'Categoria', 40) || 'Notícias',
    image_url: safeHttpUrl(raw.image_url, 'Imagem'),
    published: booleanField(raw.published, true),
    pinned: booleanField(raw.pinned, false),
  };
}

export function createNews(value: unknown): NewsSummary {
  const input = parseInput(value);
  const now = Date.now();
  const slug = uniqueSlug(input.title);
  run(
    `INSERT INTO news (title, slug, excerpt, body, category, image_url, published, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.title,
    slug,
    input.excerpt,
    input.body,
    input.category,
    input.image_url,
    input.published ? 1 : 0,
    input.pinned ? 1 : 0,
    now,
    now
  );
  const row = one<NewsRow>('SELECT * FROM news WHERE slug = ?', slug);
  if (!row) throw new HttpError(500, 'A notícia não foi gravada.');
  return summary(row);
}

export function updateNews(id: number, value: unknown): NewsSummary {
  const existing = getNewsById(id);
  if (!existing) throw new HttpError(404, 'Notícia não encontrada.');
  const input = parseInput(value);
  run(
    `UPDATE news SET title = ?, excerpt = ?, body = ?, category = ?, image_url = ?,
       published = ?, pinned = ?, updated_at = ? WHERE id = ?`,
    input.title,
    input.excerpt,
    input.body,
    input.category,
    input.image_url,
    input.published ? 1 : 0,
    input.pinned ? 1 : 0,
    Date.now(),
    id
  );
  const row = getNewsById(id);
  if (!row) throw new HttpError(500, 'A notícia não foi gravada.');
  return summary(row);
}

export function deleteNews(id: number): void {
  const existing = getNewsById(id);
  if (!existing) throw new HttpError(404, 'Notícia não encontrada.');
  run('DELETE FROM news WHERE id = ?', id);
}

export function seedNews(): void {
  if (newsCount() > 0) return;
  createNews({
    title: 'Bem-vindo ao MUCURA',
    category: 'Avisos',
    pinned: true,
    published: true,
    excerpt: 'O portal do servidor está no ar. Notícias, ranking, eventos e VIP em um só lugar.',
    body: `# Bem-vindo ao MUCURA

O portal oficial do servidor está no ar. Aqui você acompanha as **notícias**, o **ranking semanal**, os **eventos** e as opções de **VIP**.

## O que você encontra por aqui

- Notícias e avisos da equipe
- Ranking geral e semanal
- Informações do servidor, regras e perguntas frequentes
- Compra de VIP com pagamento pelo Mercado Pago

## Próximos passos

Crie sua conta, entre no jogo e venha escrever sua história com a gente. Nos vemos em MUCURA!`,
  });
}
