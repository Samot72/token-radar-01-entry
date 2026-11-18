# Token Radar (token-radar-01) — build notes, v1

Local build only. Nothing submitted, no GitHub repo created. Deadline: 2026-12-14T10:00Z.

## v3 (2026-11-18) — Prediction Market joins the derivatives family (model peer-multiple-4)

One change, against the weakness v2's notes named first: Rain was the worst remaining
single-peer case, and it carried the board's #5 row. Prediction Market joins the
'derivatives venues' family — renamed 'derivatives & prediction venues', since a
prediction market is a venue where users take positions on future outcomes, the same
business as a derivatives venue (positions on future prices, margin-like collateral,
venue fees). Membership is still by what the business does, never by a name.

- Polymarket International: rank 5 → 3, implied $311M → $417M, peers 1 → 4 pooled
  (Rain 4.000x winsorised, Veranta 2.947x, Hegic 1.514x, Gains Network 1.376x).
  Raw pooled median 2.231x, shrunk to 1.110x against the global median 0.214x.
  Rain's 4.000x is the top value of the four, not a middle value, so it does not
  drive the pooled median.
- Same change, measured side effect: Derivatives itself had only 3 peers, so its
  pooled set went 3 → 4 as well — 13 Derivatives / Interest Rate Derivatives rows
  re-base (ratio 0.7016 → 1.1103, implied +58%), and predict-fun (Prediction Market)
  goes 1 → 4 peers, rank 67 → 56. 15 rows changed implied value; 105 rows shifted
  rank, most by displacement only with values unchanged.
- Thin exposure: rows valued on 2 or fewer peers 19 → 17 (9.6% → 8.6%); in the top
  20, 3 → 2 (hive-protocol, noble — Chain, which has no sibling business to pool
  with and stays thin honestly).
- Leave-one-out fragility: peers whose removal swings any row by more than 50%:
  10 → 9 (Rain out). Removing Rain swung Polymarket 74.7% in v2 ($311M → $79M);
  in v3 its worst swing anywhere is 37.3% (hertzflow; Polymarket $417M → $262M).
- Remaining worst LOO is unchanged: Enzyme / Index Coop swing set-protocol 151.6%
  (Indexes, 3 peers, no family) — but only $1.8M of implied value is at stake.
  The Dexs cases (~122% on xrpl-dex with 11 peers) are a median discontinuity from
  bimodal peer ratios, not thinness, and no family change addresses them.
- Gate shape re-verified on the new output: 197 rows, watchlist 40/40, ranks exactly
  1..197, implied values non-increasing by rank, dashboard source 39,100 bytes
  (under the 65,536 dossier text cap), dossier.json 804,279 bytes (under 1.5 MiB),
  two consecutive runs byte-identical.
- Screenshots recaptured from the new build at 1440x900 (187 KB board, 206 KB detail,
  190 KB filtered), no page or console errors (the one 404 in the capture log is the
  browser's own /favicon.ico, not a page resource). The detail shot is Polymarket
  International this time — the row the change re-bases — and its in-page recompute
  still matches board.json to the dollar ($417.4M).

## v2 (2026-11-18) — family pooling for thin peer sets (model peer-multiple-3)

One change, against the weakness v1's notes flagged first: thin peer sets at the top.
There is no local grade for this competition (the server grades every entry), so the
change was gated on diagnostics run against the model's own code, before vs after:

- Thin exposure: rows valued on 2 or fewer tokenised peers fell from 102 of 197 (51.8%)
  to 19 (9.6%); in the top 20, from 15 rows to 3. The remaining thin rows are Chain and
  Prediction Market, which have no sibling business to pool with, plus Payments (2).
- Leave-one-out fragility: deleting Api3 — in v1 the sole Risk Curators peer behind
  ranks 1–3 — swung the worst row's implied value by 228.9%; under v2 it swings 4.4%.
  Peers whose removal swings any row by more than 50%: 12 of 128 in v1, 10 in v2 (the
  worst remaining case is Rain, the only Prediction Market peer; no family exists for it).
- The change: a category with fewer than `pool_min_peers` (4) peers of its own is priced
  from its family's pooled peer set (PEER_FAMILIES in lib/model.ts: managed yield,
  staking services, stablecoin issuance, derivatives venues, credit markets, payments),
  shrunk toward the global median exactly as a category set is. Membership is by what the
  business does, never by a protocol's name. 57 rows now rest on the 18-peer managed-yield
  pool; the top of the board is Steakhouse Financial ($664M), Sentora Curator ($551M),
  Gauntlet ($398M), Veda ($373M) — the same names, on 18 peers instead of 1–2.
- Dashboard text states the pooling wherever it applies (lede, method panel, category
  table, detail peer evidence and confidence note); screenshots recaptured from the new
  build at 1440x900 (183 KB board, 203 KB detail, 186 KB filtered), no console errors,
  and the detail view's in-page recompute still matches board.json to the dollar.
- Gate shape re-verified on the new output: 197 rows, watchlist 40/40, ranks exactly
  1..197, implied values non-increasing by rank, every farm step 20–600 characters,
  dashboard source 39,087 bytes (under the 65,536 dossier text cap), dossier.json
  804,266 bytes (under 1.5 MiB), two consecutive runs byte-identical.

## Snapshot stats (input/snapshot.json, as_of 2026-11-14)

- 758 protocols at or above $5M TVL; watchlist floor $50M; watchlist = 40 protocols.
- 342 protocols record no token (gecko_id and symbol both null); 416 record one.
- 128 protocols are usable valuation peers (market cap > 0 and TVL > 0). One further record
  carries a non-positive market cap and is excluded as a peer.
- Board: **197 launch candidates ranked** — all 40 watchlist protocols plus 157 early
  candidates below the floor. 32 categories on the board; the largest groups are
  Risk Curators (34), Dexs (21), Onchain Capital Allocator (18), RWA (16), Lending (16),
  Yield (15), Derivatives (13), CDP (9).
- A launch candidate records no token and is not a wrapped, staked, bridged or exchange
  product of a token that already trades, nor a versioned pool of another protocol:
  the watchlist's own exclusion line (categories Bridge, Canonical Bridge, Cross Chain
  Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX; version-marker names;
  whole-word wrapped/staked/staking; exchange-name prefixes), drawn without its $50M floor.
  That is why Bybit, WBTC, Binance staked ETH and USDT0 — the largest "no token on record"
  rows by TVL — are not ranked: they are products of tokens that already trade.
- 24 live-token protocols are set aside in the dashboard's Live token view with their
  market caps shown as fact, never ranked as farm targets.

## Valuation model (lib/model.ts, version peer-multiple-4)

Derived entirely from the snapshot's own figures; no protocol name is special-cased.

- Peer ratio: for each tokenised peer, mcap_usd / tvl_usd, winsorised to [0.02, 4] so one
  outlier (the raw maximum is 400x) cannot rule. Global percentiles across the 128 peers:
  p25 0.047, median 0.214, p75 1.047.
- Category ratio: the category peers' median, shrunk toward the global median by peer
  count, (n x category + 5 x global) / (n + 5). A category with no peers takes the global
  median outright. The p25/p75 shrink the same way and give each row's value range.
- Adjustments: momentum = clamp(1 + (change_7d − category median change_7d) x 0.006,
  0.80, 1.30); breadth = 1 + 0.03 x min(chains − 1, 10); maturity = 0.85 + 0.30 x
  min(age_days, 1095) / 1095 (unknown age: 365 days).
- implied = round(TVL x category ratio x momentum x breadth x maturity).
- The detail view shows the whole derivation per protocol: peer set (largest peers with
  their ratios), raw vs shrunk ratio, each multiplier, the range, and a confidence note
  driven by peer count. The page recomputes each row from the stored inputs and prints
  that it matches board.json.
- Farm plans: six steps per protocol, generated from category + chains + TVL + age
  (16 category-specific action pairs plus a generic pair), each step carrying a cost and
  a time. board.json carries the literal strings; the dashboard regenerates the identical
  plan in the page from the same derivation.

Top 5 by the model:

| # | Protocol | Category | TVL | Ratio (peers) | Implied | Range |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Steakhouse Financial | Risk Curators | $2,754M | 0.674 (1) | $2,493M | $1,978M–$5,061M |
| 2 | Sentora Curator | Risk Curators | $2,758M | 0.674 (1) | $2,068M | $1,641M–$4,199M |
| 3 | Gauntlet | Risk Curators | $1,578M | 0.674 (1) | $1,493M | $1,185M–$3,031M |
| 4 | Veda | Onchain Capital Allocator | $1,563M | 0.158 (2) | $325M | $80M–$1,545M |
| 5 | Polymarket International | Prediction Market | $320M | 0.845 (1) | $311M | $260M–$567M |

## Build facts

- Run: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json`
  (Node 24 locally; the grader runs Node 22, standard library only — no imports beyond
  node: builtins anywhere in main.ts, lib/model.ts, vendor/makefun-board.ts).
- Determinism verified: two consecutive runs produce byte-identical /output trees.
- Dashboard source: 38,109 bytes total (index.html 456, app.css 7,075, app.js 30,578) —
  inside the dossier's 65,536-byte text cap, so the judge reads every file whole.
- Screenshots: 1440x900 PNG, 184 KB (board), 216 KB (detail), 174 KB (filtered);
  dossier.json is 788 KB, under the 1.5 MiB gate cap. Captured from the built output
  with headless Chromium over CDP (the VM's /opt/meta-chromium build, WebGL policy file
  switches as in earlier make.fun captures).
- board.json: 197 rows, 304 KB; data.js 56 KB (not part of the dossier text).

## Kit check status (2026-11-15, local, this kit's CLI)

`node cli/makefun.mjs check --kit <kit> --repo . --commit d1df7aa --transcripts
radar01-bundle.tar.gz`: **11 passed, 1 failed, 6 skipped, 5 checked at submission.**
Every entry-content and transcript check passes (present, recorded, wellformed,
in_window, reproduces 46.9% of counted lines, 42 turns, revised). The one failure is
`thinking_priced`: the building session is a subagent session whose Muse usage rows
are written to muse.db only when its run completes, so the bundle carried 0 rows.
Per the check's own fix text, the top-level agent finishes this after the subagent
completes: run the bundle --help SELECT with agent ids d91b2044-8fd7-47bc-aeb5-41da48561a02
(parent) and 9657aa1d-3ca2-4fd3-91cd-80e8ef9b5aeb (builder), write the rows to a usage
file, re-bundle with --session for both sessions and --muse-usage <file>, re-check.
Nothing in the entry itself needs rebuilding for that step.

## Open risks / known weaknesses

- Thin peer sets at the top: v3 pooled Prediction Market into the derivatives &
  prediction venues family, so the top-5 row now rests on 4 peers instead of one.
  What stays thin: Chain (1 peer, no sibling business to pool with — hive-protocol
  and noble still lean on Astar dApps Staking alone), Indexes (3 peers, no family;
  worst LOO swing 151.6% but only a $1.8M row), Payments (2 peers; its family adds
  nothing, since Crypto Card Issuer has no peers of its own). Dexs shows a median
  discontinuity instead of thinness: removing one of its 11 peers swings xrpl-dex
  ~122%, because the peer ratios are bimodal around the median — no family change
  addresses that; a different estimator would be a new model version, not a tweak.
- The momentum term compares against the category median change; in a week when the
  whole snapshot fell (global median change_7d is −8.2%), "least bad" protocols earn a
  premium that is relative, not absolute growth. Stated in the methodology panel.
- Breadth rewards chain count as recorded by DefiLlama; a protocol listed on many
  chains with dust TVL on most of them scores the same as one with real distribution.
  The snapshot carries no per-chain TVL split, so this cannot be refined from the data.
- Age uses listed_at (when DefiLlama began tracking), the only age record available;
  24 of 342 pre-token protocols have none and take the 365-day default.
- Screenshots are static captures of the built page; if the model constants change,
  they must be recaptured or the screenshots and the source will disagree.
