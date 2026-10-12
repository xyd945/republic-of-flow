const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const query = require('@tanstack/react-query');

// Capture the real hooks' query options, then execute them with React Query.
// Only the Supabase transport is faked; no database or browser is needed.
function loadQueries(client) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (name) => {
      if (name === '@tanstack/react-query') return { ...query, useQuery: (options) => options, useInfiniteQuery: (options) => options };
      if (name === '@/lib/supabase/client') return { createClient: () => client };
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/')
        ? path.resolve(__dirname, '../src', name.slice(2))
        : path.resolve(path.dirname(file), name);
      return load(['.ts', '.tsx'].map((ext) => base + ext).find(fs.existsSync));
    };
    new Function('exports', 'require', source)(exports, localRequire);
    return exports;
  }
  return load(path.resolve(__dirname, '../src/lib/data/tables.ts'));
}

test('wallet history pages survive new entries and failed reads; old matches are fetched directly', async () => {
  const rows = Array.from({ length: 105 }, (_, i) => ({ id: i + 1, account_id: 'mine', amount: 1 }));
  rows.push({ id: 999, account_id: 'someone-else', amount: 500 });
  const calls = [];
  let failOnce = false;
  const transport = { from(table) {
    const request = { table, eq: [], before: null, limit: Infinity };
    const builder = {
      select(value) { request.select = value; return builder; },
      eq(key, value) { request.eq.push([key, value]); return builder; },
      order(key, value) { request.order = [key, value]; return builder; },
      limit(value) { request.limit = value; return builder; },
      lt(key, value) { assert.equal(key, 'id'); request.before = value; return builder; },
      abortSignal() { return builder; },
      then(resolve, reject) {
        calls.push({ ...request });
        if (failOnce) {
          failOnce = false;
          return Promise.resolve({ data: null, error: { message: 'Read failed' } }).then(resolve, reject);
        }
        const data = table === 'ledger_entries'
          ? rows.filter((r) => request.eq.every(([k, v]) => r[k] === v) && (request.before === null || r.id < request.before))
            .sort((a, b) => b.id - a.id).slice(0, request.limit)
          : [{ id: 'old-match', listing: { title: { en: 'Old coffee' } }, payment: { status: 'refunded' } }];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  } };
  const { useLedgerLinesQuery, useMatchQuery } = loadQueries(transport);
  const client = new query.QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  try {
    const observer = new query.InfiniteQueryObserver(client, useLedgerLinesQuery('mine'));
    await observer.fetchNextPage();
    assert.deepEqual(observer.getCurrentResult().data.pages.flat().map((r) => r.id), Array.from({ length: 20 }, (_, i) => 105 - i));
    assert.equal(calls[0].limit, 20);
    assert.deepEqual(calls[0].order, ['id', { ascending: false }]);

    rows.push({ id: 106, account_id: 'mine', amount: 1 });
    failOnce = true;
    await observer.fetchNextPage();
    assert.equal(observer.getCurrentResult().isFetchNextPageError, true);
    assert.equal(observer.getCurrentResult().data.pages.flat().length, 20, 'a failed page retains the loaded history');
    await observer.fetchNextPage();
    assert.equal(observer.getCurrentResult().data.pages.flat().length, 40);
    for (let page = 0; observer.getCurrentResult().hasNextPage; page++) {
      assert.ok(page < 10, 'pagination must terminate');
      await observer.fetchNextPage();
    }
    const ids = observer.getCurrentResult().data.pages.flat().map((r) => r.id);
    assert.deepEqual(ids, Array.from({ length: 105 }, (_, i) => 105 - i), 'all old entries, once each, beyond the former 100-row cap');
    assert.equal(ids.includes(999), false, 'another wallet is excluded');
    await observer.refetch();
    assert.equal(observer.getCurrentResult().data.pages.flat()[0].id, 106);
    assert.equal(useLedgerLinesQuery(null).enabled, false);

    const detail = await useMatchQuery('old-match').queryFn();
    assert.equal(detail[0].payment.status, 'refunded');
    assert.deepEqual(calls.at(-1).eq, [['id', 'old-match']]);
    assert.match(calls.at(-1).select, /listing:market_listings/);
    assert.match(calls.at(-1).select, /payment:match_payments/);
    assert.equal(useMatchQuery(null).enabled, false);
  } finally {
    client.clear();
  }
});
