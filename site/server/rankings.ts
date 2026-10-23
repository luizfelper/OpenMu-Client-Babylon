// Rankings come from OpenMU, read-only. The weekly board is the difference between a character's
// current experience and the snapshot taken when the week began; snapshots live in the site's
// SQLite so an OpenMU restart cannot reset the week.
import { all, db, one, run } from './db';
import { fetchCharacters, type OpenMuCharacter } from './openmu';

export type RankingEntry = OpenMuCharacter & { position: number };
export type WeeklyEntry = RankingEntry & { gained: number };

export type Rankings = {
  top: RankingEntry[];
  weekly: WeeklyEntry[];
  weekStart: number;
  capturedAt: number;
  available: boolean;
  error?: string;
};

type BaselineRow = {
  character_name: string;
  experience: number;
  level: number | null;
  resets: number | null;
  class_name: string;
};

const CACHE_MS = 60_000;
let cached: Rankings | null = null;
let inflight: Promise<Rankings> | null = null;

/** Monday 00:00 UTC. One week, one baseline. */
export function weekStart(now = Date.now()): number {
  const date = new Date(now);
  const day = date.getUTCDay(); // 0 Sunday
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.getTime();
}

function captureBaseline(week: number, rows: OpenMuCharacter[]): void {
  if (!rows.length) return;
  const count = one<{ n: number }>('SELECT COUNT(*) AS n FROM ranking_baselines WHERE week_start = ?', week);
  if ((count?.n ?? 0) > 0) return;

  const insert = db.transaction((characters: OpenMuCharacter[]) => {
    for (const character of characters) {
      run(
        `INSERT OR IGNORE INTO ranking_baselines
           (week_start, character_name, experience, level, resets, class_name, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        week,
        character.name,
        character.experience,
        character.level,
        character.resets,
        character.className,
        Date.now()
      );
    }
  });
  insert(rows);
}

function weeklyFrom(week: number, current: OpenMuCharacter[]): WeeklyEntry[] {
  const baselines = all<BaselineRow>(
    'SELECT character_name, experience, level, resets, class_name FROM ranking_baselines WHERE week_start = ?',
    week
  );
  const baseline = new Map(baselines.map(row => [row.character_name, row]));
  return current
    .map(character => {
      const before = baseline.get(character.name);
      const gained = character.experience - (before?.experience ?? 0);
      return { ...character, gained };
    })
    .filter(entry => entry.gained > 0)
    .sort((a, b) => b.gained - a.gained)
    .slice(0, 10)
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

async function load(): Promise<Rankings> {
  const week = weekStart();
  try {
    const current = await fetchCharacters(10_000);
    captureBaseline(week, current);
    const top = current.slice(0, 10).map((entry, index) => ({ ...entry, position: index + 1 }));
    const weekly = weeklyFrom(week, current);
    return {
      top,
      weekly,
      weekStart: week,
      capturedAt: Date.now(),
      available: true,
    };
  } catch (error) {
    console.warn(`rankings unavailable: ${(error as Error).message}`);
    return {
      top: cached?.top ?? [],
      weekly: cached?.weekly ?? [],
      weekStart: week,
      capturedAt: cached?.capturedAt ?? Date.now(),
      available: false,
      error: 'Não foi possível ler o ranking agora. Tente novamente em instantes.',
    };
  }
}

export async function getRankings(force = false): Promise<Rankings> {
  if (!force && cached && Date.now() - cached.capturedAt < CACHE_MS) return cached;
  if (inflight) return inflight;
  inflight = load()
    .then(result => {
      cached = result;
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function rankingSnapshotCount(): number {
  return one<{ n: number }>('SELECT COUNT(*) AS n FROM ranking_baselines')?.n ?? 0;
}
