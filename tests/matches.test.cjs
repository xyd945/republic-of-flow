const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ready = (data, error = null) => ({ data, isPending: false, error });
const match = {
  id: 'coffee', listing_id: 'offer', initiator_profile_id: 'tomas', matched_profile_id: 'oliver',
  status: 'connected', completed_at: null,
};
const hold = { match_id: 'coffee', payer_profile_id: 'oliver', payee_profile_id: 'tomas', amount: 15, status: 'held' };
const listing = { id: 'offer', title: { en: 'Coffee' } };
const detail = { ...match, listing, payment: hold };
const failedRefresh = new Error('Cached query could not refresh');

// Execute the real view composition with independently cached query results.
function readMatches({ recent, requested, payments, listings = [listing], detailError = null, recentError = null }) {
  const tables = {
    useProfilesQuery: () => ready([{ id: 'oliver', user_id: 'oliver-user' }, { id: 'tomas', user_id: 'tomas-user' }]),
    useHiddenWorldsQuery: () => ready([]), useViewerUserIdQuery: () => ready('oliver-user'),
    useListingsQuery: () => ready(listings), useMatchesQuery: () => ready(recent, recentError),
    useMatchQuery: () => ready(requested ? [requested] : [], detailError),
    useMatchPaymentsQuery: () => ready(payments),
  };
  function load(relative) {
    const file = path.resolve(__dirname, '..', relative);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const exports = {};
    new Function('require', 'exports', source)((name) => {
      if (name === 'react') return { useMemo: (fn) => fn(), useEffect: () => {}, useState: () => [false, () => {}], useRef: () => ({ current: null }) };
      if (name === './tables') return tables;
      if (name === '@/lib/payments') return load('src/lib/payments.ts');
      if (name === '@/lib/archive') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    }, exports);
    return exports;
  }
  return load('src/lib/data/views.ts').useMatches('coffee');
}

for (const [paymentStatus, matchStatus] of [['paid', 'completed'], ['refunded', 'closed']]) {
  test(`a failed detail refresh cannot replace ${paymentStatus} with a cached hold`, () => {
    const result = readMatches({
      recent: [{ ...match, status: matchStatus }], requested: detail,
      payments: [{ ...hold, status: paymentStatus }], detailError: failedRefresh,
    });
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].status, matchStatus);
    assert.equal(result.matches[0].payment.status, paymentStatus);
  });

  test(`a fresh ${paymentStatus} detail survives stale recent queries`, () => {
    const result = readMatches({
      recent: [match], requested: { ...detail, status: matchStatus, payment: { ...hold, status: paymentStatus } },
      payments: [hold], recentError: failedRefresh,
    });
    assert.equal(result.matches[0].status, matchStatus);
    assert.equal(result.matches[0].payment.status, paymentStatus);
  });

  test(`a confirmed ${paymentStatus} payment settles an old match even if both match reads are stale`, () => {
    const result = readMatches({
      recent: [], requested: detail, listings: [],
      payments: [{ ...hold, status: paymentStatus }], detailError: failedRefresh,
    });
    assert.equal(result.matches[0].status, matchStatus);
    assert.equal(result.matches[0].payment.status, paymentStatus);
    assert.deepEqual(result.matches[0].listing, listing);
  });
}

test('a closed paid match cannot be reopened by a cached completed detail', () => {
  const paid = { ...hold, status: 'paid' };
  const result = readMatches({
    recent: [{ ...match, status: 'closed' }], requested: { ...detail, status: 'completed', payment: paid },
    payments: [paid], detailError: failedRefresh,
  });
  assert.equal(result.matches[0].status, 'closed');
  assert.equal(result.matches[0].payment.status, 'paid');
});

test('the detail supplements an old held match without hiding other matches or fresh listing data', () => {
  const other = { ...match, id: 'other-match' };
  const updatedListing = { ...listing, title: { en: 'Updated coffee title' } };
  const result = readMatches({ recent: [other], requested: detail, payments: [], listings: [updatedListing] });
  assert.deepEqual(result.matches.map((m) => m.id), ['coffee', 'other-match']);
  assert.equal(result.matches[0].status, 'connected');
  assert.equal(result.matches[0].payment.status, 'held');
  assert.deepEqual(result.matches[0].listing, updatedListing);
});

test('completed and closed cards suppress stale hold actions, while live holds remain actionable', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const file = path.resolve(__dirname, '../src/app/(app)/market/page.tsx');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const card = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'MatchCard');
  assert.ok(card, 'test the real MatchCard, not a copy of its rendering logic');
  const compiled = ts.transpileModule(`export ${card.getText(source)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const container = ({ children }) => React.createElement('div', null, children);
  const bindings = {
    require, useState: React.useState,
    useI18n: () => ({ t: (value) => value?.en ?? '', ui: (key) => key }),
    useMarkMatchMet: () => ({ mutateAsync: () => assert.fail('rendering cannot make a payment') }),
    Panel: container, StatusChip: container, ErrorNote: container, Avatar: () => null,
    Bi: ({ en }) => React.createElement('span', null, en),
    Button: ({ children, disabled }) => React.createElement('button', { disabled }, children),
    fill: (label) => label,
  };
  const exports = {};
  new Function('exports', ...Object.keys(bindings), compiled)(exports, ...Object.values(bindings));
  const render = (status, viewer) => renderToStaticMarkup(React.createElement(exports.MatchCard, {
    match: { ...match, status, listing, payment: hold }, viewerProfileId: viewer, onDone: () => {},
  }));
  for (const status of ['completed', 'closed']) {
    for (const viewer of ['oliver', 'tomas']) {
      const html = render(status, viewer);
      assert.doesNotMatch(html, /market\.we_met_pay|market\.waiting_pay|market\.on_hold/);
      if (status === 'completed') assert.match(html, /<button disabled="">market\.met<\/button>/);
      else assert.doesNotMatch(html, /<button/);
    }
  }
  assert.match(render('connected', 'oliver'), /market\.we_met_pay/);
  assert.match(render('connected', 'tomas'), /market\.waiting_pay/);
});
