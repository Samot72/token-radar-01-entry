// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, filters, a per-protocol detail view with the peer evidence behind its value, and
// the model's method. No network: every byte it shows is in data.js. The page recomputes each row's
// implied value from the snapshot figures with the same arithmetic lib/model.ts writes to board.json.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var M = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtRatio(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(3) + 'x'; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  var catStats = {};
  DATA.categories.forEach(function (c) { catStats[c.category] = c; });
  function statsOf(row) {
    var found = row.c === null ? undefined : catStats[row.c];
    if (found) return found;
    return { category: row.c || '', peers: 0, raw_median: null, ratio: DATA.global.median, ratio_lo: DATA.global.lo, ratio_hi: DATA.global.hi, median_change_7d: null, top_peers: [] };
  }
  // The model, mirrored: the page recomputes a row from the snapshot figures and checks the number
  // board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var st = statsOf(row);
    var catChange = st.median_change_7d === null || st.median_change_7d === undefined ? (DATA.global_change === null || DATA.global_change === undefined ? 0 : DATA.global_change) : st.median_change_7d;
    var rel = row.g === null || row.g === undefined ? 0 : row.g - catChange;
    var momentum = clamp(1 + rel * M.momentum_weight, M.momentum_floor, M.momentum_cap);
    var breadth = 1 + M.breadth_per_chain * Math.min(Math.max(row.ch.length - 1, 0), M.breadth_max_extra);
    var age = row.a === null || row.a === undefined ? M.unknown_age_days : row.a;
    var maturity = M.maturity_floor + (Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days) * M.maturity_range;
    return Math.max(1, Math.round(row.t * st.ratio * momentum * breadth * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the actions, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.ch && p.ch.length > 0 ? p.ch[0] : 'its main chain'; }
  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionsFor(p, capital, chain) {
    var c = p.c || '';
    var name = p.n;
    switch (c) {
      case 'Lending': return [
        'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the deposit open.',
        "Borrow a small amount of USDC against the deposit, then re-supply it once, so the wallet shows both sides of " + name + "'s market."];
      case 'Dexs': return [
        'Provide $' + capital + " of liquidity to " + name + "'s most active pool on " + chain + ', split evenly across both assets.',
        'Route two or three small swaps a week through ' + name + ' itself rather than an aggregator, so the volume is credited to your wallet.'];
      case 'Risk Curators': return [
        'Deposit $' + capital + ' of USDC into one of ' + name + "'s curated vaults on " + chain + ' and keep the vault shares.',
        "After a month, move a quarter of the position into a second " + name + " vault, so the wallet follows the curator's rebalances."];
      case 'Onchain Capital Allocator': return [
        'Deposit $' + capital + ' of USDC into a ' + name + ' allocation vault on ' + chain + ' and keep the shares.',
        "Claim every distribution the vault pays and re-deposit it, so the wallet's history shows a full allocation cycle."];
      case 'RWA': return [
        'Mint $' + capital + ' of ' + name + "'s yield asset on " + chain + ' through its own app and hold it in the wallet.',
        "Redeem a small slice once and mint it back, so the wallet records both sides of the asset's lifecycle."];
      case 'Yield': case 'Yield Aggregator': return [
        'Deposit $' + capital + ' of USDC into ' + name + "'s main vault on " + chain + ' and keep the vault shares.',
        'Compound the rewards back into the vault once a week instead of selling them, and keep the shares staked if ' + name + ' offers it.'];
      case 'Derivatives': case 'Interest Rate Derivatives': return [
        'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small position you can hold for days, not minutes.',
        'Trade a small amount every week and keep total leverage under 2x, so the account reads as a user, not a liquidation.'];
      case 'CDP': case 'CDP Manager': return [
        'Deposit $' + capital + ' of collateral into ' + name + ' on ' + chain + ' and mint its stablecoin against it.',
        'Keep the position at least twice as collateralised as the liquidation line, and repay and re-mint a small slice once a month.'];
      case 'Basis Trading': return [
        'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the shares.',
        "Hold through at least two funding cycles and claim the yield in the vault's own asset when it offers one."];
      case 'Chain': return [
        'Bridge $' + capital + ' of USDC onto ' + name + "'s chain and keep most of it there rather than bridging straight back.",
        'Use two or three native apps on the chain each week (a swap, a lend, a mint), so the wallet looks like a resident, not a passer-by.'];
      case 'Staking Pool': case 'Restaking': return [
        "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the wallet.',
        'Restake or re-stake a small top-up once a month and claim rewards only through ' + name + "'s own page."];
      case 'Liquidity Manager': case 'Leveraged Farming': return [
        'Deposit $' + capital + ' of USDC into a ' + name + ' managed position on ' + chain + ' and let the manager keep it in range.',
        'Check the position weekly and top it up once, so the wallet shows an active, monitored position rather than a forgotten one.'];
      case 'Prediction Market': return [
        'Fund $' + capital + ' on ' + name + ' and place small positions on its most liquid markets.',
        'Trade at least once a week and settle positions at expiry instead of only opening them, so the account shows a full record.'];
      case 'Insurance': return [
        'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' for an asset you actually hold.',
        'Keep the policy to expiry and renew it once, so the wallet carries a full cover cycle.'];
      case 'Payments': case 'Crypto Card Issuer': return [
        'Open a ' + name + ' account, load $' + capital + " and make it the wallet's working balance on " + chain + '.',
        'Make or receive one real payment a week through ' + name + ', so the account shows ordinary use, not a single deposit.'];
      case 'Stablecoin Wrapper': case 'Dual-Token Stablecoin': return [
        'Mint or wrap $' + capital + ' of ' + name + "'s stable asset on " + chain + ' and hold it in the wallet.',
        'Deposit part of the minted asset into a partner lending market ' + name + ' lists, and unwind it once before you exit.'];
      default: return [
        'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.',
        'Make one further qualifying action in ' + name + ' each week, such as a top-up, a claim or a vote, from the same wallet.'];
    }
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p.t);
    var hold = holdDaysFor(p.a);
    var acts = actionsFor(p, capital, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: acts[0], cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: acts[1], cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('w')) state.watch = params.get('w') === '1';
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watch) params.set('w', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watch && r.w !== 1) return false;
      if (state.category !== 'all' && r.c !== state.category) return false;
      if (state.chain !== 'all' && r.ch.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.n, r.s, r.c, r.ch.join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.n.toLowerCase(); bv = b.n.toLowerCase(); }
      else if (key === 'tvl') { av = a.t; bv = b.t; }
      else if (key === 'growth') { av = a.g === null ? -Infinity : a.g; bv = b.g === null ? -Infinity : b.g; }
      else if (key === 'age') { av = a.a === null ? Infinity : a.a; bv = b.a === null ? Infinity : b.a; }
      else { av = a.v; bv = b.v; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.s < b.s ? -1 : a.s > b.s ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.watchlist_size + ' watchlist protocols and ' + DATA.early_size + ' early finds, ranked by ', el('em', { text: 'implied launch value' })),
        el('p', { text: 'Every protocol here records no token yet and is not a wrapped, staked, bridged or exchange product of one that trades. Its implied value is what a launch would be worth if tokenised peers in its own category are the guide: their market cap per dollar of TVL, applied to its TVL and adjusted for momentum, chain breadth and time run with no token. Where a category has too few peers of its own, the guide is its family of like businesses, pooled. A model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Candidates ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Tokenised peers used' }), el('b', { text: String(DATA.peer_count) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.c || 'Other'; }))).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { r.ch.forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch' });
    if (state.watch) watchBox.setAttribute('checked', '');
    watchBox.addEventListener('change', function () { state.watch = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'toggle' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, numeric) {
    return el('th', { scope: 'col', class: numeric ? 'num' : null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].v || 1;
    if (state.sort !== 'implied' || state.dir !== -1) max = Math.max.apply(null, list.map(function (r) { return r.v; }));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.g === null ? '' : r.g >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.s ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.s); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.s); } }
      },
        el('td', { class: 'num', text: String(r.r) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.n }),
          el('span', { class: 'sub', text: (r.c || 'Other') + ' on ' + (r.ch.length ? r.ch.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.t) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.g) }),
        el('td', { class: 'num', text: fmtAge(r.a) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.v / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.v) })
        )),
        el('td', { class: 'range num', text: fmtUsd(r.lo) + ' - ' + fmtUsd(r.hi) }),
        el('td', null, el('span', { class: 'tag' + (r.w === 1 ? ' watch' : ''), text: r.w === 1 ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Launch candidates, strongest implied value first. The range is the peer set\'s 25th to 75th percentile. Select a row for its peer evidence and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank', true),
            sortHeader('name', 'Protocol', false),
            sortHeader('tvl', 'TVL', true),
            sortHeader('growth', '7d', true),
            sortHeader('age', 'Age', true),
            sortHeader('implied', 'Implied value', true),
            el('th', { scope: 'col', class: 'num', text: 'Peer range' }),
            el('th', { scope: 'col', text: 'List' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'tag', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are the peer evidence the pre-token values are derived from, and they are never ranked as farm targets.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var tbody = el('tbody');
    DATA.categories.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.family ? c.category + ' (pooled: ' + c.family + ')' : c.category }),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: fmtRatio(c.raw_median) }),
        el('td', { class: 'num', text: fmtRatio(c.ratio) }),
        el('td', { class: 'num', text: fmtRatio(c.ratio_lo) + ' - ' + fmtRatio(c.ratio_hi) })
      ));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'The guide is the market itself: ' + DATA.peer_count + ' protocols in this snapshot already trade, so each one prices a dollar of TVL in its category. A candidate is valued at its own category\'s price of TVL, shrunk toward the global median (' + fmtRatio(DATA.global.median) + ') when the category\'s peer set is thin, then adjusted for the protocol\'s own record. No protocol name is special-cased, and no row is hand-picked. A category with fewer than ' + M.pool_min_peers + ' peers of its own never stands on that handful alone: it is priced from its family — the categories that run the same business (managed yield, staking services, stablecoin issuance, derivatives venues, credit markets, payments) — pooled and shrunk the same way, and the table and the row both say which family carried it.' }),
      el('div', { class: 'formula', text: 'implied = round( tvl x shrunk_median(mcap/tvl of category peers) x momentum x breadth x maturity )' }),
      el('p', { class: 'sub', text: 'Momentum compares the protocol\'s 7d TVL change with its category\'s median (weight ' + M.momentum_weight + ', clamped ' + M.momentum_floor + ' to ' + M.momentum_cap + '). Breadth adds ' + (M.breadth_per_chain * 100) + '% per extra chain, up to 10. Maturity runs ' + M.maturity_floor + ' to ' + (M.maturity_floor + M.maturity_range) + ' over the first ' + M.maturity_days + ' days the protocol has run with no token. Peer ratios are winsorised to [' + M.ratio_floor + ', ' + M.ratio_cap + '] and shrunk with k = ' + M.shrink_k + ': (n x category + k x global) / (n + k).' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Peer evidence by category: the tokenised protocols behind each ratio.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Peers' }), el('th', { scope: 'col', class: 'num', text: 'Raw median' }), el('th', { scope: 'col', class: 'num', text: 'Ratio used' }), el('th', { scope: 'col', class: 'num', text: 'Shrunk range' }))),
          tbody
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function confidence(st) {
    if (st.family) return 'Pooled peer set: ' + st.peers + ' tokenised peers across the ' + st.family + ' family price this row, because its own category has fewer than ' + M.pool_min_peers + ' tokenised peers of its own. No single name carries the ratio.';
    if (st.peers >= 8) return 'Broad peer set: ' + st.peers + ' tokenised peers price this category, so the ratio rests on a market, not a name.';
    if (st.peers >= 3) return 'Moderate peer set: ' + st.peers + ' tokenised peers, shrunk toward the global median.';
    if (st.peers >= 1) return 'Thin peer set: only ' + st.peers + ' tokenised peer' + (st.peers === 1 ? '' : 's') + ' in this category, so the ratio leans on the global median. Treat this value with care.';
    return 'No tokenised peers in this category: the global median of all ' + DATA.peer_count + ' peers is used outright.';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.s === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var st = statsOf(row);
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.r + ' of ' + DATA.board_size + (row.w === 1 ? ' - watchlist' : ' - early, below the floor') }),
        el('h2', { id: 'detail-title', text: row.n }),
        el('p', { class: 'sub', text: (row.c || 'Other') + ' on ' + (row.ch.length ? row.ch.join(', ') : 'an unnamed chain') + ' - records no token yet' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.t) })),
        el('div', null, el('span', { text: 'Category ratio used' }), el('b', { class: 'num', text: fmtRatio(row.q) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.g) })),
        el('div', null, el('span', { text: 'Momentum x' }), el('b', { class: 'num', text: String(row.mm) })),
        el('div', null, el('span', { text: 'Breadth x' }), el('b', { class: 'num', text: String(row.bm) })),
        el('div', null, el('span', { text: 'Maturity x' }), el('b', { class: 'num', text: String(row.tm) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.a) })),
        el('div', null, el('span', { text: 'Peer range' }), el('b', { class: 'num', text: fmtUsd(row.lo) + ' - ' + fmtUsd(row.hi) })),
        el('div', { class: 'hero' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.v) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': TVL x the category ratio, adjusted. The page recomputes this row as ' + fmtUsd(impliedOf(row)) + (impliedOf(row) === row.v ? ', the same number board.json carries.' : ' from the unrounded inputs; board.json carries the rounded multipliers above.') + ' An estimate of what a launch would be worth, not a price and not a prediction that one comes.' })
    ));
    var peerBody = el('tbody');
    st.top_peers.forEach(function (p) {
      peerBody.appendChild(el('tr', null, el('td', { text: p.name }), el('td', { class: 'num', text: fmtRatio(p.ratio) })));
    });
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Peer evidence' }),
      st.peers > 0
        ? el('table', { class: 'peers' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: st.family ? 'Largest tokenised peers in the ' + st.family + ' family' : 'Largest tokenised peers in ' + (row.c || 'this category') }), el('th', { scope: 'col', class: 'num', text: 'mcap / TVL' }))),
            peerBody)
        : el('p', { class: 'sub', text: 'No tokenised protocol in this category carries both a market cap and a TVL in the snapshot.' }),
      el('p', { class: 'sub', text: (st.family ? 'Peer evidence: ' + st.peers + ' tokenised peers pooled across the ' + st.family + ' family. ' : 'Category peers: ' + st.peers + '. ') + 'Raw median ' + fmtRatio(st.raw_median) + ', shrunk to ' + fmtRatio(st.ratio) + ' against the global median ' + fmtRatio(DATA.global.median) + ' (range ' + fmtRatio(st.ratio_lo) + ' - ' + fmtRatio(st.ratio_hi) + ').' }),
      el('div', { class: 'note', text: confidence(st) })
    ));
    var steps = farmSteps(row);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
