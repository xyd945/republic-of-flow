/**
 * Generate src/types/database.ts from the live schema.
 *
 * The usual tool for this is `supabase gen types typescript --project-id ...`,
 * which needs the Supabase CLI and a personal access token. Neither is set up
 * here, and adding a second credential just to describe a schema we can already
 * read is a poor trade. PostgREST publishes an OpenAPI document at the API root
 * describing every exposed table, column, format and function — so this reads
 * that, using only the keys the app already has.
 *
 * The output is a starting point for tightening the hand-written types in
 * src/types/index.ts, and a way to notice drift: regenerate, and if the diff is
 * not empty the database has moved under the app.
 *
 *   npm run gen:types
 */
import { writeFileSync } from 'node:fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or the publishable key).');
  console.error('They are in .env.local — run with:  npx dotenv -e .env.local -- npm run gen:types');
  process.exit(1);
}

type Prop = { type?: string; format?: string; description?: string; default?: unknown };
type Definition = { required?: string[]; properties?: Record<string, Prop> };

/** Postgres format -> TypeScript. Unknown formats stay `unknown` rather than `any`. */
function tsType(p: Prop): string {
  const f = (p.format ?? '').toLowerCase();
  if (f === 'jsonb' || f === 'json') return 'Json';
  if (f === 'uuid' || f === 'text' || f.startsWith('character') || f.startsWith('timestamp') || f === 'date') return 'string';
  if (f === 'boolean') return 'boolean';
  if (f.startsWith('integer') || f.startsWith('bigint') || f.startsWith('numeric')
      || f === 'smallint' || f === 'real' || f === 'double precision') return 'number';
  if (f.endsWith('[]')) return `${tsType({ format: f.slice(0, -2) })}[]`;
  if (p.type === 'array') return 'unknown[]';
  if (p.type === 'string') return 'string';
  if (p.type === 'boolean') return 'boolean';
  if (p.type === 'number' || p.type === 'integer') return 'number';
  return 'unknown';
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
});
if (!res.ok) {
  console.error(`Could not read the schema: HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json() as {
  definitions?: Record<string, Definition>;
  paths?: Record<string, unknown>;
};

const defs = spec.definitions ?? {};
const tables = Object.keys(defs).sort();
const rpcs = Object.keys(spec.paths ?? {})
  .filter((p) => p.startsWith('/rpc/'))
  .map((p) => p.slice(5))
  .sort();

const lines: string[] = [
  '// GENERATED FILE — do not edit by hand.',
  '//',
  '// Regenerate with:  npm run gen:types',
  '//',
  '// Read from the live PostgREST OpenAPI document rather than written by hand,',
  '// so a column added or dropped in a migration shows up here as a diff instead',
  '// of as a runtime surprise. See scripts/gen-types.ts for why this route and',
  '// not `supabase gen types`.',
  '',
  'export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];',
  '',
];

for (const table of tables) {
  const def = defs[table];
  const required = new Set(def.required ?? []);
  lines.push(`export interface ${pascal(table)}Row {`);
  for (const [col, prop] of Object.entries(def.properties ?? {})) {
    const optional = required.has(col) ? '' : ' | null';
    const note = prop.description?.includes('Primary Key') ? '  // primary key' : '';
    lines.push(`  ${col}: ${tsType(prop)}${optional};${note}`);
  }
  lines.push('}', '');
}

lines.push('/** Every table exposed through the API. */');
lines.push(`export type TableName =\n${tables.map((t) => `  | '${t}'`).join('\n')};`);
lines.push('');
lines.push('/** Every function callable through .rpc(). */');
lines.push(`export type RpcName =\n${rpcs.map((r) => `  | '${r}'`).join('\n')};`);
lines.push('');

function pascal(s: string): string {
  return s.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

writeFileSync('src/types/database.ts', lines.join('\n'));
console.log(`Wrote src/types/database.ts — ${tables.length} tables, ${rpcs.length} functions.`);
