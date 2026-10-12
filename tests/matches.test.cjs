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

function loadPaymentHelpers() {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/payments.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function('exports', source)(exports);
  return exports;
}
// Execute the real view composition with independently cached query results.
function readMatches({ recent, requested, cachedDetails = [], payments, listings = [listing], detailError = null, recentError = null, paymentsError = null, wallet = false, viewer = 'oliver' }) {
  const tables = {
    useProfilesQuery: () => ready([{ id: 'oliver', user_id: 'oliver-user' }, { id: 'tomas', user_id: 'tomas-user' }]),
    useHiddenWorldsQuery: () => ready([]), useViewerUserIdQuery: () => ready(`${viewer}-user`),
    useAccountsQuery: () => ready([{ id: 'wallet', profile_id: viewer, balance: 85 }]),
    useListingsQuery: () => ready(listings), useMatchesQuery: () => ready(recent, recentError),
    useMatchQuery: () => ready(requested ? [requested] : [], detailError),
    useMatchPaymentsQuery: () => ready(payments, paymentsError),
    useKnownMatchStates: () => new Map([...(recent ?? []), ...cachedDetails, ...(requested ? [requested] : [])]
      .filter((m) => m.status === 'completed' || m.status === 'closed').map((m) => [m.id, m.status])),
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
  const views = load('src/lib/data/views.ts');
  return wallet ? views.useWallet() : views.useMatches(requested ? requested.id : null);
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
    fill: (label) => label, isActiveHold: loadPaymentHelpers().isActiveHold,
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

test('Treasury actions and Market badges exclude terminal matches despite a cached hold', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const helpers = loadPaymentHelpers();
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/components/treasury.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const box = ({ children }) => React.createElement('div', null, children);
  const view = {};
  new Function('exports', 'require', source)(view, (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === '@/lib/payments') return helpers;
    if (name === '@/lib/i18n/context') return { useI18n: () => ({ t: (v) => v?.en ?? '', ui: (key) => key }) };
    if (name === '@/lib/i18n/translations') return { fill: (label) => label };
    if (name === '@/lib/data/tables') return {
      useAccountsQuery: () => ready([]),
      useLedgerAuditQuery: () => ready({ issued: 200, in_wallets: 200, on_hold: 0, balanced: true }),
    };
    if (name === '@/lib/data/mutations') return {
      useCuratorRefundPayment: () => ({ mutateAsync: () => assert.fail('No mutation allowed') }),
      useCuratorReleasePayment: () => ({ mutateAsync: () => assert.fail('No mutation allowed') }),
    };
    if (name === '@/components/pixel') return {
      Avatar: () => null, Bi: () => null, PixelSpinner: () => null, StatRow: () => null,
      Panel: box, StatusChip: box, ErrorNote: box,
      Button: ({ children }) => React.createElement('button', null, children),
    };
    throw new Error(`Unexpected dependency: ${name}`);
  });
  const marketFile = path.resolve(__dirname, '../src/app/(app)/market/page.tsx');
  const market = ts.createSourceFile(marketFile, fs.readFileSync(marketFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = market.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'MarketPage');
  const badge = page.body.statements.find((n) => ts.isVariableStatement(n) && n.declarationList.declarations.some((d) => d.name.getText(market) === 'toConfirm'));
  assert.ok(badge, 'exercise the actual badge filter');
  const count = new Function('liveMatches', 'viewerProfileId', 'isActiveHold', `${badge.getText(market)}; return toConfirm;`);
  for (const status of ['completed', 'closed', 'connected']) {
    const matches = [{ ...match, status, listing, payment: hold }];
    const html = renderToStaticMarkup(React.createElement(view.TreasuryTab, { profiles: [], matches }));
    assert.equal(html.includes('admin.release'), status === 'connected');
    assert.equal(html.includes('admin.refund'), status === 'connected');
    assert.equal(html.includes('admin.no_holds'), status !== 'connected');
    assert.equal(count(matches, 'oliver', helpers.isActiveHold), status === 'connected' ? 1 : 0);
    assert.equal(count(matches, 'tomas', helpers.isActiveHold), 0, 'payee never owes confirmation');
  }
});

for (const viewer of ['oliver', 'tomas']) {
  test(`wallet totals for ${viewer} discard stale holds once either match read is terminal`, () => {
    for (const status of ['completed', 'closed']) {
      for (const source of ['recent', 'embedded']) {
        const result = readMatches({
          wallet: true, viewer,
          recent: source === 'recent' ? [{ ...match, status }] : [match],
          payments: [{ ...hold, match: { ...match, status: source === 'embedded' ? status : 'connected' } }],
          paymentsError: failedRefresh,
        });
        assert.equal(result.heldFromMe, 0);
        assert.equal(result.heldForMe, 0);
        assert.equal(result.balance, 85);
      }
    }
    const oldHold = readMatches({ wallet: true, viewer, recent: [], payments: [{ ...hold, match }] });
    assert.equal(oldHold.heldFromMe, viewer === 'oliver' ? 15 : 0);
    assert.equal(oldHold.heldForMe, viewer === 'tomas' ? 15 : 0);
  });
}

for (const [paymentStatus, status] of [['paid', 'completed'], ['refunded', 'closed']]) {
  test(`wallet totals honor ${paymentStatus} detail evidence even beyond the recent match cap`, () => {
    for (const recent of [[match], []]) {
      const result = readMatches({
        wallet: true, recent, requested: { ...detail, status, payment: { ...hold, status: paymentStatus } },
        payments: [{ ...hold, match }], recentError: failedRefresh, paymentsError: failedRefresh,
      });
      assert.equal(result.heldFromMe, 0);
      assert.equal(result.heldForMe, 0);
    }
  });

  test(`leaving a ${paymentStatus} detail cannot restore hold actions on Market or Treasury`, () => {
    for (const recent of [[match], []]) {
      const state = {
        recent, cachedDetails: [{ ...detail, status, payment: { ...hold, status: paymentStatus } }],
        payments: [{ ...hold, match: { ...match, listing } }], recentError: failedRefresh, paymentsError: failedRefresh,
      };
      const result = readMatches(state);
      assert.equal(result.matches.length, 1, 'the old held match remains available');
      assert.equal(result.matches[0].status, status, 'cached detail settlement survives navigation');
      assert.equal(loadPaymentHelpers().isActiveHold(result.matches[0].payment, result.matches[0].status), false);
      assert.equal(readMatches({ ...state, wallet: true }).heldFromMe, 0);
    }
  });
}
