# Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Samot72/token-radar-01-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Samot72/token-radar-01-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for the [token-radar-01 bounty on make.fun](https://make.fun/bounty/token-radar-01) — "Build the best token launch radar."

Launch Radar ranks 197 pre-token protocols from the competition's sealed DefiLlama snapshot by implied launch value. The model ("peer-multiple-2") prices each candidate off the median market-cap/TVL multiple of tokenised peers in its own category — winsorised, shrunk toward the global median — then adjusts for relative 7-day TVL momentum, chain breadth, and maturity, and reports a p25–p75 range per protocol. Every row's detail view shows the full derivation (peer set, raw vs shrunk ratio, multipliers) and the page recomputes each figure against the shipped data, so nothing on the board is a black box. Each candidate also carries concrete farming steps.

Top of the board: Steakhouse Financial, Sentora Curator, Gauntlet, Veda, Polymarket International.

## Run

```
node main.ts
```

Regenerates the dossier (board data + screenshots) deterministically from `input/` — two runs are byte-identical. The dashboard itself is static: open `dashboard/index.html`.
