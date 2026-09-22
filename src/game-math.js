import { PAYLINES, REEL_STRIPS, SYMBOLS, symbolById } from './symbols.js';

// Probabilities are per spin. Pools contain actual visible reel stops, so the
// selected result and every highlighted payline always agree with the drums.
export const CLASSIC_PROFILE = Object.freeze([
  { category: 'pair', probability: .08 },
  { category: 'small', probability: .035 },
  { category: 'medium', probability: .005 },
  { category: 'onec', probability: .0004 },
  { category: 'wild', probability: .00005 },
  { category: 'nuraliev', probability: .00002 },
  { category: 'otherBig', probability: .000005 },
]);

const LARGE_CATEGORIES = new Set(['medium', 'onec', 'wild', 'nuraliev', 'otherBig']);
const CLASSIC_WIN_RATE = CLASSIC_PROFILE.reduce((sum, item) => sum + item.probability, 0);
const CLASSIC_LARGE_RATE = CLASSIC_PROFILE
  .filter((item) => LARGE_CATEGORIES.has(item.category))
  .reduce((sum, item) => sum + item.probability, 0);
const CLASSIC_SMALL_RATE = CLASSIC_WIN_RATE - CLASSIC_LARGE_RATE;

export function createSeededRng(seed = 0x83c0ffee) {
  let value = Number(seed) >>> 0;
  if (value === 0) value = 0x83c0ffee;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
}

export function visibleSymbolAt(stops, reelIndex, row = 0) {
  const strip = REEL_STRIPS[reelIndex];
  const index = ((Math.round(stops[reelIndex]) + row) % strip.length + strip.length) % strip.length;
  return strip[index];
}

export function evaluateLine(symbols) {
  if (symbols.every((id) => id === 'wild')) {
    return { payout: symbolById('wild').payout, symbolId: 'wild', pair: false };
  }

  let best = null;
  for (const symbol of SYMBOLS) {
    if (symbol.wild) continue;
    if (symbols.every((id) => id === symbol.id || id === 'wild')) {
      if (!best || symbol.payout > best.payout) {
        best = { payout: symbol.payout, symbolId: symbol.id, pair: false };
      }
    }
  }
  if (best) return best;
  if (symbols.filter((id) => id === 'onec').length >= 2) {
    return { payout: 3, symbolId: 'onec', pair: true };
  }
  return { payout: 0, symbolId: null, pair: false };
}

export function evaluateStops(stops) {
  const lineWins = PAYLINES.map((line) => {
    const symbols = line.rows.map((row, reelIndex) => visibleSymbolAt(stops, reelIndex, row));
    return { ...line, symbols, ...evaluateLine(symbols) };
  }).filter((line) => line.payout > 0);
  return {
    lineWins,
    totalPayout: lineWins.reduce((sum, line) => sum + line.payout, 0),
  };
}

function classifyOutcome(lineWins, totalPayout) {
  if (totalPayout === 0) return 'loss';
  if (lineWins.some((line) => line.symbolId === 'nuraliev')) return 'nuraliev';
  if (lineWins.some((line) => line.symbolId === 'wild')) return 'wild';
  if (lineWins.some((line) => line.symbolId === 'onec' && !line.pair)) return 'onec';
  if (totalPayout === 3) return 'pair';
  if (totalPayout <= 20) return 'small';
  if (totalPayout <= 99) return 'medium';
  return 'otherBig';
}

function buildOutcomePools() {
  const pools = new Map([
    ['loss', []], ['pair', []], ['small', []], ['medium', []],
    ['onec', []], ['wild', []], ['nuraliev', []], ['otherBig', []],
  ]);
  for (let left = 0; left < REEL_STRIPS[0].length; left += 1) {
    for (let center = 0; center < REEL_STRIPS[1].length; center += 1) {
      for (let right = 0; right < REEL_STRIPS[2].length; right += 1) {
        const stops = [left, center, right];
        const outcome = evaluateStops(stops);
        pools.get(classifyOutcome(outcome.lineWins, outcome.totalPayout)).push(stops);
      }
    }
  }
  return pools;
}

const OUTCOME_POOLS = buildOutcomePools();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function buildProbabilityProfile(options = {}) {
  const requestedWinRate = Number(options.winRate);
  const requestedBigShare = Number(options.bigWinShare);
  const winRate = Number.isFinite(requestedWinRate)
    ? clamp(requestedWinRate, .01, 1)
    : CLASSIC_WIN_RATE;
  const bigWinShare = Number.isFinite(requestedBigShare)
    ? clamp(requestedBigShare, .005, .50)
    : CLASSIC_LARGE_RATE / CLASSIC_WIN_RATE;
  const largeRate = winRate * bigWinShare;
  const smallRate = winRate - largeRate;
  const profile = CLASSIC_PROFILE.map((item) => {
    const large = LARGE_CATEGORIES.has(item.category);
    const sourceTotal = large ? CLASSIC_LARGE_RATE : CLASSIC_SMALL_RATE;
    const targetTotal = large ? largeRate : smallRate;
    return { ...item, probability: targetTotal * item.probability / sourceTotal };
  });
  return [...profile, { category: 'loss', probability: 1 - winRate }];
}

export function chooseStopIndices(rng = Math.random, options = {}) {
  const profile = buildProbabilityProfile(options);
  let roll = rng();
  let category = 'loss';
  for (const item of profile) {
    roll -= item.probability;
    if (roll <= 0) {
      category = item.category;
      break;
    }
  }
  const pool = OUTCOME_POOLS.get(category);
  const stops = pool[Math.floor(rng() * pool.length)] || OUTCOME_POOLS.get('loss')[0];
  return [...stops];
}

export function getMathProfileReport(options = {}) {
  const profile = buildProbabilityProfile(options);
  const categories = Object.fromEntries([...OUTCOME_POOLS].map(([category, pool]) => {
    const payouts = pool.map((stops) => evaluateStops(stops).totalPayout);
    const averagePayout = payouts.reduce((sum, payout) => sum + payout, 0) / payouts.length;
    return [category, {
      outcomes: pool.length,
      averagePayout,
      configuredProbability: profile.find((item) => item.category === category)?.probability || 0,
    }];
  }));
  const expectedRtp = Object.values(categories).reduce(
    (sum, item) => sum + item.averagePayout * item.configuredProbability,
    0,
  );
  return { expectedRtp, categories };
}
