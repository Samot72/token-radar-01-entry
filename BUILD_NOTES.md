# Token Radar (token-radar-01) — build notes, v1

Local build only. Nothing submitted, no GitHub repo created. Deadline: 2026-12-14T10:00Z.

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

## Valuation model (lib/model.ts, version peer-multiple-2)

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

- Thin peer sets at the top: Risk Curators (the top category by implied value) has a
  single tokenised peer (Api3, 2.975x winsorised), and Onchain Capital Allocator has 2.
  Shrinkage (k = 5) pulls those ratios most of the way to the global median and the
  dashboard flags them as thin, but the top of the board still leans on very little
  market evidence. A v2 could pool sibling categories (curators + allocators + yield)
  into a combined peer set when n < 3.
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
