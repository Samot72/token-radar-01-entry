// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks launch candidates: protocols that record no token and are not a wrapped, staked,
// bridged or exchange product of a token that already trades (the same line the snapshot's watchlist
// draws), but without the watchlist's $50M floor, so the early protocols below it are ranked too.
// Every watchlist slug is on the board; the floor is never the whole board.
//
// Implied value is derived from the snapshot's own figures, never from a hand-kept list of names:
//
//   peers      = the snapshot's tokenised protocols (a market cap and a TVL on record)
//   ratio(p)   = mcap_usd / tvl_usd of a peer, winsorised to [0.02, 4] so one outlier cannot rule
//   ratio(C)   = the median ratio of C's peers, shrunk toward the global median by peer count:
//                (n x category median + 5 x global median) / (n + 5); a category with no peers
//                takes the global median outright. The 25th and 75th percentiles shrink the same
//                way and give the row's value range.
//   pooling    = a category with fewer than pool_min_peers peers does not stand on that handful
//                alone: if it belongs to a family of categories that run the same business
//                (PEER_FAMILIES below), its evidence is the family's pooled peer set, shrunk
//                the same way, and the row says so. One name can no longer carry a category:
//                in peer-multiple-2 the board's top three rows rested on a single peer.
//   momentum   = clamp(1 + (change_7d - category median change_7d) x 0.006, 0.80, 1.30)
//   breadth    = 1 + 0.03 x min(chains - 1, 10)
//   maturity   = 0.85 + 0.30 x min(age_days, 1095) / 1095   (age unknown: 365 days)
//   implied    = max(1, round(tvl_usd x ratio(C) x momentum x breadth x maturity))
//
// The same function scores every row; the dashboard restates it and shows each row's peer set.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  ratio_floor: number;
  ratio_cap: number;
  shrink_k: number;
  pool_min_peers: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  breadth_per_chain: number;
  breadth_max_extra: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.02,
  ratio_cap: 4,
  shrink_k: 5,
  pool_min_peers: 4,
  momentum_weight: 0.006,
  momentum_floor: 0.8,
  momentum_cap: 1.3,
  breadth_per_chain: 0.03,
  breadth_max_extra: 10,
  maturity_floor: 0.85,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'peer-multiple-4';

/**
 * Families of categories that run the same business, so a thin category's price of TVL is read
 * from the family's pooled market evidence instead of one or two names. Membership is by what
 * the business does with capital, never by a protocol's name: curators and allocators manage
 * other people's yield, staking services run validators, stablecoin issuers mint against
 * collateral, derivatives and prediction venues take positions on future outcomes,
 * credit markets lend, payment apps move money.
 * A category in no family stands on its own peers, however few, shrunk as before.
 */
export const PEER_FAMILIES: { name: string; categories: string[] }[] = [
  { name: 'managed yield', categories: ['Risk Curators', 'Onchain Capital Allocator', 'Yield', 'Yield Aggregator', 'Liquidity Manager', 'Leveraged Farming'] },
  { name: 'staking services', categories: ['Staking Pool', 'Restaking', 'Liquid Restaking', 'Liquid Staking'] },
  { name: 'stablecoin issuance', categories: ['CDP', 'CDP Manager', 'Dual-Token Stablecoin', 'Stablecoin Wrapper', 'Stablecoin Issuer', 'Algo-Stables'] },
  { name: 'derivatives & prediction venues', categories: ['Derivatives', 'Interest Rate Derivatives', 'Options', 'Options Vault', 'Synthetics', 'Prediction Market'] },
  { name: 'credit markets', categories: ['Lending', 'Uncollateralized Lending', 'Collateral Markets'] },
  { name: 'payments', categories: ['Payments', 'Crypto Card Issuer'] },
];

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Categories that are a product of a token that already trades, or an exchange's own book. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Exchange names a wrapped product may begin with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Whether a name marks a wrapped or staked product of another asset. */
function isWrappedName(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z]+/);
  return words.includes('wrapped') || words.includes('staked') || words.includes('staking');
}

/**
 * Whether a protocol is a launch candidate the board may rank: it records no token, and it is not a
 * wrapped, staked, bridged or exchange product of one that trades, nor a versioned pool of another
 * protocol. This is the watchlist's own line, drawn without its TVL floor.
 */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (isWrappedName(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** A tokenised protocol usable as a valuation peer: a real market cap over a real TVL. */
function isPeer(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

const DAY_MS = 86_400_000;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The q-th percentile of a sorted array, by linear interpolation; the array must be non-empty. */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** One category's peer evidence: how many peers, and their winsorised mcap/TVL percentiles. */
export interface CategoryStats {
  category: string;
  peers: number;
  raw_median: number | null;
  ratio: number;
  ratio_lo: number;
  ratio_hi: number;
  median_change_7d: number | null;
  top_peers: { name: string; ratio: number }[];
  /** The family this evidence was pooled across, or null when the category stands on its own peers. */
  family: string | null;
}

/** The peer evidence base the model derives from one snapshot. */
export interface PeerBase {
  peer_count: number;
  global_median: number;
  global_lo: number;
  global_hi: number;
  global_median_change_7d: number | null;
  categories: Map<string, CategoryStats>;
}

/** Build the peer evidence: global ratio percentiles and one shrunk estimate per category. */
export function buildPeerBase(snapshot: Snapshot, model: ModelConstants = MODEL): PeerBase {
  const peers = snapshot.protocols.filter(isPeer);
  const winsor = (p: SnapshotProtocol): number => clamp(p.mcap_usd! / p.tvl_usd, model.ratio_floor, model.ratio_cap);
  const all = peers.map(winsor).sort((a, b) => a - b);
  const globalMedian = percentile(all, 0.5);
  const globalLo = percentile(all, 0.25);
  const globalHi = percentile(all, 0.75);
  const changes = snapshot.protocols.filter((p) => p.change_7d !== null).map((p) => p.change_7d!).sort((a, b) => a - b);
  const globalChange = changes.length > 0 ? percentile(changes, 0.5) : null;

  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of peers) {
    const key = p.category ?? '';
    const list = byCategory.get(key) ?? [];
    list.push(p);
    byCategory.set(key, list);
  }
  const changeByCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.change_7d === null) continue;
    const key = p.category ?? '';
    const list = changeByCategory.get(key) ?? [];
    list.push(p.change_7d);
    changeByCategory.set(key, list);
  }

  const categories = new Map<string, CategoryStats>();
  const shrink = (catQ: number, globalQ: number, n: number): number => (n * catQ + model.shrink_k * globalQ) / (n + model.shrink_k);
  /** The shrunk evidence of one peer list: its percentiles against the global ones, by its count. */
  const statsFrom = (key: string, list: SnapshotProtocol[], changes: number[], family: string | null): CategoryStats => {
    const ratios = list.map(winsor).sort((a, b) => a - b);
    const n = list.length;
    const sortedChanges = changes.slice().sort((a, b) => a - b);
    return {
      category: key,
      peers: n,
      raw_median: percentile(ratios, 0.5),
      ratio: shrink(percentile(ratios, 0.5), globalMedian, n),
      ratio_lo: shrink(percentile(ratios, 0.25), globalLo, n),
      ratio_hi: shrink(percentile(ratios, 0.75), globalHi, n),
      median_change_7d: sortedChanges.length > 0 ? percentile(sortedChanges, 0.5) : null,
      top_peers: list
        .slice()
        .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
        .slice(0, 4)
        .map((p) => ({ name: p.name, ratio: round4(winsor(p)) })),
      family,
    };
  };
  for (const [key, list] of byCategory) {
    categories.set(key, statsFrom(key, list, changeByCategory.get(key) ?? [], null));
  }
  // Pooling: a family member with fewer than pool_min_peers peers of its own is re-based on the
  // family's pooled peer set when the pool is deeper than its own handful. Members with a deep
  // set of their own keep it; a member whose family adds nothing keeps its own stats too.
  for (const fam of PEER_FAMILIES) {
    const pooled = fam.categories.flatMap((c) => byCategory.get(c) ?? []);
    if (pooled.length === 0) continue;
    const pooledChanges = fam.categories.flatMap((c) => changeByCategory.get(c) ?? []);
    for (const key of fam.categories) {
      const own = byCategory.get(key)?.length ?? 0;
      if (own < model.pool_min_peers && pooled.length > own) {
        categories.set(key, statsFrom(key, pooled, pooledChanges, fam.name));
      }
    }
  }
  return { peer_count: peers.length, global_median: globalMedian, global_lo: globalLo, global_hi: globalHi, global_median_change_7d: globalChange, categories };
}

/** The stats a protocol is valued with: its category's, or the global fallbacks when it has none. */
function statsFor(base: PeerBase, category: string | null): CategoryStats {
  const found = category === null ? undefined : base.categories.get(category);
  if (found !== undefined) return found;
  return {
    category: category ?? '',
    peers: 0,
    raw_median: null,
    ratio: base.global_median,
    ratio_lo: base.global_lo,
    ratio_hi: base.global_hi,
    median_change_7d: base.global_median_change_7d,
    top_peers: [],
    family: null,
  };
}

/** One protocol's full valuation: the value, its range, and every input the dashboard shows. */
export interface Valuation {
  implied: number;
  lo: number;
  hi: number;
  ratio: number;
  ratio_lo: number;
  ratio_hi: number;
  peers: number;
  family: string | null;
  momentum: number;
  breadth: number;
  maturity: number;
  age: number | null;
}

/** Value one launch candidate against the peer base. */
export function valueProtocol(p: SnapshotProtocol, asOf: string, base: PeerBase, model: ModelConstants = MODEL): Valuation {
  const stats = statsFor(base, p.category);
  const age = ageDays(asOf, p.listed_at);
  const catChange = stats.median_change_7d ?? base.global_median_change_7d ?? 0;
  const rel = p.change_7d === null ? 0 : p.change_7d - catChange;
  const momentum = clamp(1 + rel * model.momentum_weight, model.momentum_floor, model.momentum_cap);
  const breadth = 1 + model.breadth_per_chain * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_extra);
  const ageForModel = age ?? model.unknown_age_days;
  const maturity = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const adjust = momentum * breadth * maturity;
  return {
    implied: Math.max(1, Math.round(p.tvl_usd * stats.ratio * adjust)),
    lo: Math.max(1, Math.round(p.tvl_usd * stats.ratio_lo * adjust)),
    hi: Math.max(1, Math.round(p.tvl_usd * stats.ratio_hi * adjust)),
    ratio: stats.ratio,
    ratio_lo: stats.ratio_lo,
    ratio_hi: stats.ratio_hi,
    peers: stats.peers,
    family: stats.family,
    momentum,
    breadth,
    maturity,
    age,
  };
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  model: {
    peer_category: string;
    peer_count: number;
    peer_family: string | null;
    ratio_used: number;
    ratio_lo: number;
    ratio_hi: number;
    momentum_multiplier: number;
    breadth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  r: number;
  s: string;
  n: string;
  c: string | null;
  ch: string[];
  t: number;
  g: number | null;
  a: number | null;
  w: 0 | 1;
  v: number;
  lo: number;
  hi: number;
  q: number;
  pn: number;
  mm: number;
  bm: number;
  tm: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the peer evidence and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  protocol_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  peer_count: number;
  global: { median: number; lo: number; hi: number };
  global_change: number | null;
  categories: CategoryStats[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, base: PeerBase, model: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isLaunchCandidate)
    .map((p) => ({ p, v: valueProtocol(p, snapshot.as_of, base, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_lo_usd: s.v.lo,
    implied_hi_usd: s.v.hi,
    model: {
      peer_category: s.p.category ?? '',
      peer_count: s.v.peers,
      peer_family: s.v.family,
      ratio_used: round4(s.v.ratio),
      ratio_lo: round4(s.v.ratio_lo),
      ratio_hi: round4(s.v.ratio_hi),
      momentum_multiplier: round4(s.v.momentum),
      breadth_multiplier: round4(s.v.breadth),
      maturity_multiplier: round4(s.v.maturity),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action and its second qualifying behaviour, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): [string, string] {
  const c = p.category ?? '';
  const name = p.name;
  switch (c) {
    case 'Lending':
      return [
        `Supply $${capital} of USDC to ${name} on ${chain} and leave the deposit open.`,
        `Borrow a small amount of USDC against the deposit, then re-supply it once, so the wallet shows both sides of ${name}'s market.`,
      ];
    case 'Dexs':
      return [
        `Provide $${capital} of liquidity to ${name}'s most active pool on ${chain}, split evenly across both assets.`,
        `Route two or three small swaps a week through ${name} itself rather than an aggregator, so the volume is credited to your wallet.`,
      ];
    case 'Risk Curators':
      return [
        `Deposit $${capital} of USDC into one of ${name}'s curated vaults on ${chain} and keep the vault shares.`,
        `After a month, move a quarter of the position into a second ${name} vault, so the wallet follows the curator's rebalances.`,
      ];
    case 'Onchain Capital Allocator':
      return [
        `Deposit $${capital} of USDC into a ${name} allocation vault on ${chain} and keep the shares.`,
        `Claim every distribution the vault pays and re-deposit it, so the wallet's history shows a full allocation cycle.`,
      ];
    case 'RWA':
      return [
        `Mint $${capital} of ${name}'s yield asset on ${chain} through its own app and hold it in the wallet.`,
        `Redeem a small slice once and mint it back, so the wallet records both sides of the asset's lifecycle.`,
      ];
    case 'Yield':
    case 'Yield Aggregator':
      return [
        `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and keep the vault shares.`,
        `Compound the rewards back into the vault once a week instead of selling them, and keep the shares staked if ${name} offers it.`,
      ];
    case 'Derivatives':
    case 'Interest Rate Derivatives':
      return [
        `Deposit $${capital} of USDC as margin on ${name} and open one small position you can hold for days, not minutes.`,
        `Trade a small amount every week and keep total leverage under 2x, so the account reads as a user, not a liquidation.`,
      ];
    case 'CDP':
    case 'CDP Manager':
      return [
        `Deposit $${capital} of collateral into ${name} on ${chain} and mint its stablecoin against it.`,
        `Keep the position at least twice as collateralised as the liquidation line, and repay and re-mint a small slice once a month.`,
      ];
    case 'Basis Trading':
      return [
        `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the shares.`,
        `Hold through at least two funding cycles and claim the yield in the vault's own asset when it offers one.`,
      ];
    case 'Chain':
      return [
        `Bridge $${capital} of USDC onto ${name}'s chain and keep most of it there rather than bridging straight back.`,
        `Use two or three native apps on the chain each week (a swap, a lend, a mint), so the wallet looks like a resident, not a passer-by.`,
      ];
    case 'Staking Pool':
    case 'Restaking':
      return [
        `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the wallet.`,
        `Restake or re-stake a small top-up once a month and claim rewards only through ${name}'s own page.`,
      ];
    case 'Liquidity Manager':
    case 'Leveraged Farming':
      return [
        `Deposit $${capital} of USDC into a ${name} managed position on ${chain} and let the manager keep it in range.`,
        `Check the position weekly and top it up once, so the wallet shows an active, monitored position rather than a forgotten one.`,
      ];
    case 'Prediction Market':
      return [
        `Fund $${capital} on ${name} and place small positions on its most liquid markets.`,
        `Trade at least once a week and settle positions at expiry instead of only opening them, so the account shows a full record.`,
      ];
    case 'Insurance':
      return [
        `Buy $${capital} of cover from ${name} on ${chain} for an asset you actually hold.`,
        `Keep the policy to expiry and renew it once, so the wallet carries a full cover cycle.`,
      ];
    case 'Payments':
    case 'Crypto Card Issuer':
      return [
        `Open a ${name} account, load $${capital} and make it the wallet's working balance on ${chain}.`,
        `Make or receive one real payment a week through ${name}, so the account shows ordinary use, not a single deposit.`,
      ];
    case 'Stablecoin Wrapper':
    case 'Dual-Token Stablecoin':
      return [
        `Mint or wrap $${capital} of ${name}'s stable asset on ${chain} and hold it in the wallet.`,
        `Deposit part of the minted asset into a partner lending market ${name} lists, and unwind it once before you exit.`,
      ];
    default:
      return [
        `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
        `Make one further qualifying action in ${name} each week, such as a top-up, a claim or a vote, from the same wallet.`,
      ];
  }
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 * The dashboard carries the same derivation and shows the same plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const [core, second] = actionsFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm with, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: core,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    r: row.rank,
    s: row.slug,
    n: row.name,
    c: row.category,
    ch: row.chains,
    t: row.tvl_usd,
    g: row.change_7d,
    a: row.age_days,
    w: row.watchlist ? 1 : 0,
    v: row.implied_value_usd,
    lo: row.implied_lo_usd,
    hi: row.implied_hi_usd,
    q: row.model.ratio_used,
    pn: row.model.peer_count,
    mm: row.model.momentum_multiplier,
    bm: row.model.breadth_multiplier,
    tm: row.model.maturity_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const base = buildPeerBase(snapshot, model);
  const board = buildBoard(snapshot, base, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const categories = [...base.categories.values()]
    .filter((c) => board.some((r) => (r.category ?? '') === c.category))
    .sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    protocol_size: snapshot.protocols.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    peer_count: base.peer_count,
    global: { median: base.global_median, lo: base.global_lo, hi: base.global_hi },
    global_change: base.global_median_change_7d,
    categories,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the gate's 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_lo_usd > r.implied_value_usd || r.implied_hi_usd < r.implied_value_usd) return `${r.slug} has a range that excludes its implied value`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
