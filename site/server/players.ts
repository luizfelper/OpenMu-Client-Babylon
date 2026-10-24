// The profile the site keeps for a game account: the name and e-mail used to prefill VIP checkout.
// CPF is deliberately absent - it is asked only in the payment form and never stored here.
import { one, run } from './db';

export type PlayerProfile = {
  account: string;
  name: string;
  email: string;
};

export function profileFor(account: string): PlayerProfile | null {
  const row = one<PlayerProfile>(
    'SELECT account, name, email FROM site_players WHERE account = ?',
    account
  );
  return row ?? null;
}

export function saveProfile(account: string, name: string, email: string): PlayerProfile {
  const now = Date.now();
  run(
    `INSERT INTO site_players (account, name, email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       updated_at = excluded.updated_at`,
    account,
    name,
    email,
    now,
    now
  );
  return { account, name, email };
}
