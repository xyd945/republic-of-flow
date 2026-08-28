/**
 * Credentials for the commands that WRITE — the demo seeder and the
 * authorization suite. They are local-only. That is the whole policy.
 *
 * It matters because `.env.local` holds the hosted project, the one real
 * members use, and both commands used to read it: `npm run test:authz` created
 * and deleted real auth users in production.
 *
 * One file, read directly. Not Next's loader, which would have let a shell
 * variable override the file and skipped this file entirely under
 * NODE_ENV=test; and not a dotenv parser of my own, which would have
 * disagreed with nothing and cost a dependency. These are three values copied
 * out of `supabase start`, so there is nothing to expand and nowhere to fall
 * back to.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/** Loopback, and nothing else. A name that merely resolves here is not this. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const FILE = '.env.development.local';

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

export type LocalSupabaseEnv = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

const HOW = `Start one and copy its URL and keys into ${FILE}:\n    npx supabase start`;

/** fileURLToPath, not .pathname: a checkout under a path with a space in it
    arrives as %20, and on Windows .pathname carries a leading slash. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function loadLocalSupabaseEnv(dir: string = ROOT): LocalSupabaseEnv {
  const path = join(dir, FILE);

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${FILE} not found. Commands that write need a local database.\n${HOW}`);
    }
    throw new Error(`Cannot read ${path}: ${(e as Error).message}`);
  }

  const vars = parseEnv(text) as Record<string, string | undefined>;

  const missing = REQUIRED.filter((k) => !vars[k]?.trim());
  if (missing.length) {
    throw new Error(`${FILE} does not set ${missing.join(', ')}.\n${HOW}`);
  }

  const url = vars.NEXT_PUBLIC_SUPABASE_URL!.trim();

  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    throw new Error(`${FILE} has NEXT_PUBLIC_SUPABASE_URL=${url}, which is not a URL.`);
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run against ${host}. These commands create and delete rows, `
      + `and this is not a local database.\n${HOW}`,
    );
  }

  return {
    url,
    publishableKey: vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
    secretKey: vars.SUPABASE_SECRET_KEY!.trim(),
  };
}
