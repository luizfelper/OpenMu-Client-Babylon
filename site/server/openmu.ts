// OpenMU's Postgres: rankings and account validation, plus account creation through the same
// helper the register service uses. Game state still belongs to OpenMU itself.
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { AccountState, createAccount } from '../../register/server/accounts';
import { DATABASE_URL } from './config';

export type OpenMuCharacter = {
  name: string;
  experience: number;
  masterExperience: number;
  level: number | null;
  resets: number | null;
  classId: string | null;
  className: string;
  vip: boolean;
};

/** `Stats.Level` and `Stats.Resets` in OpenMU (src/GameLogic/Attributes/Stats.cs). */
const LEVEL_ID = '560931ad-0901-4342-b7f4-fd2e2fcc0563';
const RESETS_ID = '89a891a7-f9f9-4ab5-af36-12056e53a5f7';

let sql: ReturnType<typeof postgres> | null = null;

function connection(): ReturnType<typeof postgres> {
  if (!sql) {
    sql = postgres(DATABASE_URL, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 5,
      prepare: false,
    });
  }
  return sql;
}

type CharacterRow = {
  name: string;
  experience: string | number;
  master_experience: string | number;
  level: number | null;
  resets: number | null;
  class_id: string | null;
  class_name: string | null;
  vip: boolean;
};

function localizedName(raw: string | null): string {
  if (!raw) return 'Herói';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const values = Object.values(parsed as Record<string, unknown>);
      const preferred = (parsed as Record<string, unknown>).pt ?? (parsed as Record<string, unknown>).en;
      if (typeof preferred === 'string' && preferred.trim()) return preferred;
      const first = values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()));
      if (first) return first;
    }
  } catch {
    // OpenMU stores a plain string in older versions.
  }
  return raw;
}

function toCharacter(row: CharacterRow): OpenMuCharacter {
  return {
    name: row.name,
    experience: Number(row.experience) || 0,
    masterExperience: Number(row.master_experience) || 0,
    level: row.level === null ? null : Math.round(Number(row.level)),
    resets: row.resets === null ? null : Math.round(Number(row.resets)),
    classId: row.class_id,
    className: localizedName(row.class_name),
    vip: Boolean(row.vip),
  };
}

/**
 * Characters ordered by experience. The level and reset counters live in `data."StatAttribute"`,
 * one row per attribute, so they are pivoted out of the character's own attribute rows.
 */
export async function fetchCharacters(limit = 1000): Promise<OpenMuCharacter[]> {
  await ensureVipTablesOnce();
  const rows = await connection()<CharacterRow[]>`
    SELECT
      c."Name" AS name,
      c."Experience" AS experience,
      c."MasterExperience" AS master_experience,
      MAX(CASE WHEN sa."DefinitionId" = ${LEVEL_ID}::uuid THEN sa."Value" END) AS level,
      MAX(CASE WHEN sa."DefinitionId" = ${RESETS_ID}::uuid THEN sa."Value" END) AS resets,
      c."CharacterClassId" AS class_id,
      cc."Name" AS class_name,
      EXISTS (
        SELECT 1
        FROM mu_plugins.vip_plan_account v
        WHERE lower(v.account) = lower(a."LoginName")
          AND v.expires_at > now()
      ) AS vip
    FROM data."Character" c
    LEFT JOIN data."StatAttribute" sa ON sa."CharacterId" = c."Id"
    LEFT JOIN config."CharacterClass" cc ON cc."Id" = c."CharacterClassId"
    JOIN data."Account" a ON a."Id" = c."AccountId"
    WHERE c."CharacterStatus" = 0
      AND a."State" <> 4
      AND c."AccountId" IS NOT NULL
    GROUP BY c."Id", c."Name", c."Experience", c."MasterExperience", c."CharacterClassId", cc."Name", a."LoginName"
    ORDER BY c."Experience" DESC
    LIMIT ${limit}
  `;
  return rows.map(toCharacter);
}

export async function accountExists(login: string): Promise<boolean> {
  const rows = await connection()<{ login: string }[]>`
    SELECT "LoginName" AS login
    FROM data."Account"
    WHERE lower("LoginName") = lower(${login})
      AND "State" <> 4
    LIMIT 1
  `;
  return rows.length > 0;
}

export type VerifiedAccount = {
  account: string;
  email: string;
};

/**
 * Checks a game login against the BCrypt hash OpenMU itself uses. The site never sees the
 * password after this call; a banned account (State 4) is treated as if it did not exist.
 */
export async function verifyAccountPassword(
  login: string,
  password: string
): Promise<VerifiedAccount | null> {
  const rows = await connection()<{
    login: string;
    password_hash: string;
    email: string;
    state: number;
  }[]>`
    SELECT "LoginName" AS login, "PasswordHash" AS password_hash, "EMail" AS email, "State" AS state
    FROM data."Account"
    WHERE lower("LoginName") = lower(${login})
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || Number(row.state) === AccountState.Banned) return null;

  let valid = false;
  try {
    valid = await bcrypt.compare(password, row.password_hash);
  } catch {
    // A malformed hash is a failed login, never a crash in the public endpoint.
    valid = false;
  }
  return valid ? { account: row.login, email: row.email || '' } : null;
}

/** Creates an OpenMU account. Returns the rejection reason, or null on success. */
export async function createOpenMuAccount(
  login: string,
  password: string,
  email: string
): Promise<string | null> {
  return createAccount(connection(), login, password, AccountState.Normal, email);
}

/** Used by the admin's "test connection" button. */
export async function openmuReady(): Promise<boolean> {
  const rows = await connection()<{ ok: number }[]>`SELECT 1 AS ok`;
  return rows.length === 1 && rows[0].ok === 1;
}

export async function closeOpenmu(): Promise<void> {
  if (!sql) return;
  const current = sql;
  sql = null;
  await current.end({ timeout: 5 });
}

/**
 * The VIP side in OpenMU's database, read by the MuPlugins VIP hooks: one row per plan and one per
 * account on a plan. The site owns both tables; the game only reads them.
 */
async function ensureVipTables(): Promise<void> {
  await connection().unsafe(`
    CREATE SCHEMA IF NOT EXISTS mu_plugins;
    CREATE TABLE IF NOT EXISTS mu_plugins.vip_plan (
      id text PRIMARY KEY,
      xp_multiplier numeric(6,2) NOT NULL DEFAULT 1,
      master_xp_multiplier numeric(6,2) NOT NULL DEFAULT 1,
      drop_multiplier numeric(6,2) NOT NULL DEFAULT 1,
      zen_multiplier numeric(6,2) NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE mu_plugins.vip_plan ADD COLUMN IF NOT EXISTS jewel_drop_percent numeric(6,2) NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS mu_plugins.vip_plan_account (
      account text PRIMARY KEY,
      plan_id text NOT NULL,
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now());
  `);
}

let vipTablesReady = false;

async function ensureVipTablesOnce(): Promise<void> {
  if (vipTablesReady) return;
  await ensureVipTables();
  vipTablesReady = true;
}

export type VipGamePlan = {
  id: string;
  xp_multiplier: number;
  master_xp_multiplier: number;
  drop_multiplier: number;
  zen_multiplier: number;
  jewel_drop_percent: number;
};

/** Replaces the plans the game applies. Plans removed from the site stop applying at once. */
export async function syncVipPlans(plans: VipGamePlan[]): Promise<void> {
  await ensureVipTables();
  const sql = connection();
  await sql.begin(async transaction => {
    await transaction.unsafe('DELETE FROM mu_plugins.vip_plan');
    for (const plan of plans) {
      await transaction.unsafe(
        `INSERT INTO mu_plugins.vip_plan (id, xp_multiplier, master_xp_multiplier, drop_multiplier, zen_multiplier, jewel_drop_percent, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [plan.id, plan.xp_multiplier, plan.master_xp_multiplier, plan.drop_multiplier, plan.zen_multiplier, plan.jewel_drop_percent]
      );
    }
  });
}

/** The VIP jewel plug-in's id (its `[Guid]`): the row of its configuration in OpenMU's database. */
const VIP_JEWEL_PLUGIN_ID = '8f1d3c52-6a4e-4b7d-9e21-3c5a7f0b9d14';

/**
 * Writes the plans' summary into the VIP jewel plug-in's configuration, so the game's admin panel
 * shows the values. Only the `PlansSummary` key is set; the row is left alone when OpenMU has not
 * created it yet (the plug-in's first start does that).
 */
export async function syncJewelDropSummary(summary: string): Promise<void> {
  await connection().unsafe(
    `UPDATE config."PlugInConfiguration"
     SET "CustomConfiguration" = jsonb_set(COALESCE("CustomConfiguration"::jsonb, '{}'::jsonb), '{PlansSummary}', to_jsonb($2::text))::text
     WHERE "TypeId" = $1::uuid`,
    [VIP_JEWEL_PLUGIN_ID, summary]
  );
}

/** Points an account at a plan until it expires; a date in the past removes the row. */
export async function syncVipAccount(account: string, planId: string, expiresAt: number | null): Promise<void> {
  await ensureVipTables();
  const sql = connection();
  if (!planId || !expiresAt || expiresAt <= Date.now()) {
    await sql.unsafe('DELETE FROM mu_plugins.vip_plan_account WHERE lower(account) = lower($1)', [account]);
    return;
  }
  await sql.unsafe(
    `INSERT INTO mu_plugins.vip_plan_account (account, plan_id, expires_at, updated_at)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), now())
     ON CONFLICT (account) DO UPDATE SET plan_id = EXCLUDED.plan_id, expires_at = EXCLUDED.expires_at, updated_at = now()`,
    [account, planId, expiresAt]
  );
}
export type AccountSearchRow = {
  login: string;
  email: string;
  state: number;
  registered: string | null;
  last_login: string | null;
  characters: number;
};

/** Accounts matching a login name or e-mail, for the admin's delete tool. */
export async function searchAccounts(term: string, limit = 20): Promise<AccountSearchRow[]> {
  const pattern = `%${term.trim()}%`;
  if (pattern === '%%') return [];
  const rows = await connection()<AccountSearchRow[]>`
    SELECT a."LoginName" AS login,
           a."EMail" AS email,
           a."State" AS state,
           a."RegistrationDate"::text AS registered,
           a."LastLogin"::text AS last_login,
           (SELECT COUNT(*)::int FROM data."Character" c WHERE c."AccountId" = a."Id") AS characters
    FROM data."Account" a
    WHERE a."LoginName" ILIKE ${pattern} OR a."EMail" ILIKE ${pattern}
    ORDER BY a."LoginName"
    LIMIT ${Math.min(Math.max(limit, 1), 100)}
  `;
  return rows;
}

/**
 * Deletes an account and everything it owns. The schema cascades from the account to the
 * characters and from a character to its own tables, so the account row is the only delete.
 * Returns how many characters went with it, or null when there is no such account.
 */
export async function deleteAccountWithCharacters(login: string): Promise<number | null> {
  const sql = connection();
  const [account] = await sql<{ id: string; characters: number }[]>`
    SELECT a."Id" AS id,
           (SELECT COUNT(*)::int FROM data."Character" c WHERE c."AccountId" = a."Id") AS characters
    FROM data."Account" a
    WHERE lower(a."LoginName") = lower(${login})
  `;
  if (!account) return null;
  await sql`DELETE FROM data."Account" WHERE "Id" = ${account.id}`;
  return account.characters;
}
