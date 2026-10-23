// Read-only access to OpenMU's Postgres. The site never writes here: account creation belongs to
// the register service, and game state belongs to OpenMU itself.
import postgres from 'postgres';
import { DATABASE_URL } from './config';

export type OpenMuCharacter = {
  name: string;
  experience: number;
  masterExperience: number;
  level: number | null;
  resets: number | null;
  classId: string | null;
  className: string;
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
  };
}

/**
 * Characters ordered by experience. The level and reset counters live in `data."StatAttribute"`,
 * one row per attribute, so they are pivoted out of the character's own attribute rows.
 */
export async function fetchCharacters(limit = 1000): Promise<OpenMuCharacter[]> {
  const rows = await connection()<CharacterRow[]>`
    SELECT
      c."Name" AS name,
      c."Experience" AS experience,
      c."MasterExperience" AS master_experience,
      MAX(CASE WHEN sa."DefinitionId" = ${LEVEL_ID}::uuid THEN sa."Value" END) AS level,
      MAX(CASE WHEN sa."DefinitionId" = ${RESETS_ID}::uuid THEN sa."Value" END) AS resets,
      c."CharacterClassId" AS class_id,
      cc."Name" AS class_name
    FROM data."Character" c
    LEFT JOIN data."StatAttribute" sa ON sa."CharacterId" = c."Id"
    LEFT JOIN config."CharacterClass" cc ON cc."Id" = c."CharacterClassId"
    WHERE c."CharacterStatus" = 0
    GROUP BY c."Id", c."Name", c."Experience", c."MasterExperience", c."CharacterClassId", cc."Name"
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
