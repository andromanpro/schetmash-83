import assert from 'node:assert/strict';
import {
  chooseStopIndices,
  buildProbabilityProfile,
  createSeededRng,
  evaluateLine,
  evaluateStops,
  getMathProfileReport,
} from '../src/game-math.js';

assert.deepEqual(evaluateLine(['bug', 'bug', 'bug']), { payout: 7, symbolId: 'bug', pair: false });
assert.deepEqual(evaluateLine(['onec', 'wild', 'onec']), { payout: 100, symbolId: 'onec', pair: false });
assert.deepEqual(evaluateLine(['onec', 'onec', 'bug']), { payout: 3, symbolId: 'onec', pair: true });
assert.deepEqual(evaluateLine(['nuraliev', 'nuraliev', 'wild']), { payout: 830, symbolId: 'nuraliev', pair: false });
assert.deepEqual(evaluateLine(['wild', 'wild', 'wild']), { payout: 250, symbolId: 'wild', pair: false });

const singleLineFixtures = [
  { stops: [0, 3, 1], lineId: 1, payout: 12 },
  { stops: [0, 2, 0], lineId: 2, payout: 20 },
  { stops: [0, 6, 1], lineId: 3, payout: 7 },
  { stops: [0, 1, 5], lineId: 4, payout: 20 },
  { stops: [0, 0, 3], lineId: 5, payout: 7 },
];
for (const fixture of singleLineFixtures) {
  const outcome = evaluateStops(fixture.stops);
  assert.equal(outcome.lineWins.length, 1);
  assert.equal(outcome.lineWins[0].id, fixture.lineId);
  assert.equal(outcome.totalPayout, fixture.payout);
}
const multiLine = evaluateStops([0, 8, 1]);
assert.deepEqual(multiLine.lineWins.map((line) => line.id), [1, 3]);
assert.equal(multiLine.totalPayout, 19);
const nuraliev = evaluateStops([9, 11, 12]);
assert.equal(nuraliev.totalPayout, 830);
assert.equal(nuraliev.lineWins[0].symbolId, 'nuraliev');

const profile = getMathProfileReport();
assert.ok(profile.expectedRtp >= .94 && profile.expectedRtp <= .96, `Теоретический RTP вне коридора: ${profile.expectedRtp}`);

const adjustedProfile = buildProbabilityProfile({ winRate: .30, bigWinShare: .10 });
const adjustedWinRate = adjustedProfile.filter((item) => item.category !== 'loss').reduce((sum, item) => sum + item.probability, 0);
const adjustedLargeRate = adjustedProfile
  .filter((item) => ['medium', 'onec', 'wild', 'nuraliev', 'otherBig'].includes(item.category))
  .reduce((sum, item) => sum + item.probability, 0);
assert.ok(Math.abs(adjustedWinRate - .30) < 1e-12, `Настроенная частота выигрыша искажена: ${adjustedWinRate}`);
assert.ok(Math.abs(adjustedLargeRate - .03) < 1e-12, `Настроенная доля крупных выигрышей искажена: ${adjustedLargeRate}`);
const guaranteedProfile = buildProbabilityProfile({ winRate: 1, bigWinShare: .20 });
assert.equal(guaranteedProfile.find((item) => item.category === 'loss').probability, 0, 'Режим 100% оставил вероятность проигрыша');

const rng = createSeededRng(830083);
const spins = 1_000_000;
let totalPayout = 0;
let winningSpins = 0;
let nuralievWins = 0;
for (let spin = 0; spin < spins; spin += 1) {
  const outcome = evaluateStops(chooseStopIndices(rng));
  totalPayout += outcome.totalPayout;
  if (outcome.totalPayout > 0) winningSpins += 1;
  if (outcome.lineWins.some((line) => line.symbolId === 'nuraliev')) nuralievWins += 1;
}
const simulatedRtp = totalPayout / spins;
assert.ok(simulatedRtp >= .93 && simulatedRtp <= .97, `Симуляционный RTP вне допуска: ${simulatedRtp}`);
assert.ok(nuralievWins > 0, 'Суперджекпот Нуралиева не встретился в детерминированной симуляции');

console.log(JSON.stringify({
  spins,
  theoreticalRtpPercent: +(profile.expectedRtp * 100).toFixed(3),
  simulatedRtpPercent: +(simulatedRtp * 100).toFixed(3),
  winRatePercent: +(winningSpins / spins * 100).toFixed(3),
  nuralievWins,
  categories: profile.categories,
}, null, 2));
