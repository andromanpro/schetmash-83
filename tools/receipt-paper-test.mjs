import assert from 'node:assert/strict';
import { ReceiptPaper } from '../src/receipt-paper.js';

const paper = new ReceiptPaper(null);
paper.targetLength = .44;
for (let frame = 0; frame < 240; frame += 1) {
  paper.update(frame * 1000 / 60, 1 / 60, false);
}

const first = paper.debug();
const firstFreeUv = paper.uvs[1];
const rowCenter = (row) => {
  const column = Math.floor(paper.columns / 2);
  const index = (row * paper.columns + column) * 3;
  return [paper.positions[index], paper.positions[index + 1], paper.positions[index + 2]];
};
const shortestActiveSegment = () => {
  let shortest = Infinity;
  for (let row = 0; row < paper.activeRows - 3; row += 1) {
    const a = rowCenter(row);
    const b = rowCenter(row + 1);
    shortest = Math.min(shortest, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return shortest;
};
const maxCrossSectionWarp = () => {
  let maximum = 0;
  for (let row = 0; row < paper.activeRows; row += 1) {
    const left = (row * paper.columns) * 3;
    const right = (row * paper.columns + paper.columns - 1) * 3;
    for (let column = 1; column < paper.columns - 1; column += 1) {
      const progress = column / (paper.columns - 1);
      const index = (row * paper.columns + column) * 3;
      for (let axis = 0; axis < 3; axis += 1) {
        const expected = paper.positions[left + axis]
          + (paper.positions[right + axis] - paper.positions[left + axis]) * progress;
        maximum = Math.max(maximum, Math.abs(paper.positions[index + axis] - expected));
      }
    }
  }
  return maximum;
};
const coilSelfIntersections = (coilStartsAt) => {
  const coilRows = Math.min(
    paper.activeRows,
    Math.floor(Math.max(0, paper.length - coilStartsAt) / paper.segmentLength) + 2,
  );
  const orientation = (a, b, c) => (
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1])
  );
  const intersections = [];
  for (let first = 0; first < coilRows - 1; first += 1) {
    const a = rowCenter(first);
    const b = rowCenter(first + 1);
    for (let second = first + 3; second < coilRows - 1; second += 1) {
      const c = rowCenter(second);
      const d = rowCenter(second + 1);
      const abC = orientation(a, b, c);
      const abD = orientation(a, b, d);
      const cdA = orientation(c, d, a);
      const cdB = orientation(c, d, b);
      if (abC * abD < -1e-9 && cdA * cdB < -1e-9) intersections.push([first, second]);
    }
  }
  return intersections;
};
const outfeedRow = Array.from({ length: paper.activeRows }, (_, row) => row)
  .reduce((nearest, row) => (
    Math.abs((paper.length - paper.rowMaterial[row]) - .04)
      < Math.abs((paper.length - paper.rowMaterial[nearest]) - .04) ? row : nearest
  ), 0);
const outfeedPoint = rowCenter(outfeedRow);
let firstMaxTurn = 0;
let firstMaxTurnRow = -1;
for (let row = 1; row < paper.activeRows - 2; row += 1) {
  const a = rowCenter(row - 1);
  const b = rowCenter(row);
  const c = rowCenter(row + 1);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const bc = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
  const denominator = Math.hypot(...ab) * Math.hypot(...bc);
  if (denominator > 1e-8) {
    const cosine = Math.max(-1, Math.min(1, (ab[0] * bc[0] + ab[1] * bc[1] + ab[2] * bc[2]) / denominator));
    const turn = Math.acos(cosine);
    if (turn > firstMaxTurn) {
      firstMaxTurn = turn;
      firstMaxTurnRow = row;
    }
  }
}
assert.equal(first.model, 'verlet-feed');
assert.equal(first.restShape, 'receipt-spiral');
assert.equal(first.growthOrigin, 'slot');
assert.equal(first.feed.direction, 'perpendicular-from-cabinet');
assert.equal(first.feed.motion, 'gravity-and-bending-constraints');
assert.ok(outfeedPoint[2] > .025 && Math.abs(outfeedPoint[1]) < .015, `Бумага не выходит перпендикулярно фасаду: ${JSON.stringify(outfeedPoint)}`);
assert.ok(firstMaxTurn < .48, `Короткий чек ломается углом вместо плавного изгиба: ${JSON.stringify({
  firstMaxTurn,
  firstMaxTurnRow,
  nearby: Array.from({ length: 5 }, (_, offset) => rowCenter(Math.max(0, firstMaxTurnRow - 3 + offset))),
})}`);
assert.ok(Math.abs(paper.length - paper.targetLength) < 1e-6, 'Первый участок не допечатан');
assert.equal(first.freeMaterial, 0, 'Старый край потерял материальную координату');
assert.ok(Math.abs(first.slotMaterial - paper.length) < 1e-5, 'UV у щели не совпадает с длиной подачи');

paper.targetLength = 1004 / 920;
for (let frame = 240; frame < 620; frame += 1) {
  paper.update(frame * 1000 / 60, 1 / 60, false);
}

const forming = paper.debug();
assert.ok(forming.coil.active, `После четвёртой выплаты не появился завиток: ${JSON.stringify(forming.coil)}`);
assert.ok(forming.bounds.maxZ > .425, `Короткий чек потерял плавный прогиб: ${JSON.stringify(forming.bounds)}`);
assert.ok(forming.bounds.maxZ < .45, `Короткий участок снова выгнулся резкой S-волной: ${JSON.stringify(forming.bounds)}`);

paper.targetLength = 1.3;
for (let frame = 620; frame < 900; frame += 1) {
  paper.update(frame * 1000 / 60, 1 / 60, false);
}

const hanging = paper.debug();
const hangingCrossSectionWarp = maxCrossSectionWarp();
assert.ok(Math.abs(paper.length - paper.targetLength) < 1e-6, 'Подвешенный чек не допечатан');
assert.equal(hanging.coil.phase, 'hanging', `Свободный край не остался подвешенным: ${JSON.stringify(hanging.coil)}`);
assert.ok(hanging.coil.turns > .42, `Свободный край не набрал полувиток до пола: ${JSON.stringify(hanging.coil)}`);
assert.ok(hanging.bounds.minY > paper.floorY + .08, `Рулон преждевременно коснулся пола: ${JSON.stringify(hanging.bounds)}`);
assert.ok(hanging.freeEnd.z < hanging.bounds.maxZ - .12, `Свободный край остался вертикальной линейкой: ${JSON.stringify(hanging)}`);
assert.ok(hanging.bounds.maxZ > .445, `Средняя часть чека снова стала строго прямой: ${JSON.stringify(hanging.bounds)}`);
assert.ok(hangingCrossSectionWarp < .002, `Бумага мнётся поперёк вместо гладкого изгиба: ${hangingCrossSectionWarp}`);

paper.targetLength = 1.526;
for (let frame = 900; frame < 1120; frame += 1) {
  paper.update(frame * 1000 / 60, 1 / 60, false);
}

const touching = paper.debug();
const touchingShortestSegment = shortestActiveSegment();
assert.equal(touching.coil.phase, 'settling', `Не распознана фаза касания пола: ${JSON.stringify(touching.coil)}`);
assert.ok(touching.coil.turns > .45, `Завиток распрямился перед касанием пола: ${JSON.stringify(touching.coil)}`);
assert.ok(touching.bounds.minY >= paper.floorY - 1e-4, `Подвешенный завиток прошёл сквозь пол: ${JSON.stringify(touching.bounds)}`);
assert.ok(touching.bounds.minY < paper.floorY + .04, `Завиток не дошёл до пола: ${JSON.stringify(touching.bounds)}`);
assert.ok(touchingShortestSegment > paper.segmentLength * .96, `Завиток сминается перед полом: ${touchingShortestSegment}`);

paper.targetLength = 1.8;
for (let frame = 1120; frame < 1620; frame += 1) {
  paper.update(frame * 1000 / 60, 1 / 60, false);
}

const final = paper.debug();
const usedValues = paper.positions.slice(0, paper.activeRows * paper.columns * 3);
assert.ok(Array.from(usedValues).every(Number.isFinite), 'Физика породила NaN/Infinity');
assert.ok(Math.abs(paper.length - paper.targetLength) < 1e-6, 'Лента не дошла до целевой длины');
assert.equal(paper.uvs[1], firstFreeUv, 'UV старого свободного края сдвинулся при новой печати');
assert.equal(final.freeMaterial, 0, 'Новая печать переместила материал старого края');
assert.ok(Math.abs(final.slotMaterial - paper.length) < 1e-5, 'Новый материал появился не у щели');
assert.ok(Math.abs(final.slotEnd.y) < 1e-6, 'Край в роликах не закреплён');
assert.ok(Math.min(...Array.from(usedValues).filter((_, index) => index % 3 === 1)) >= paper.floorY - 1e-4, 'Бумага провалилась сквозь пол');
assert.equal(
  paper.mesh.geometry.drawRange.count,
  (paper.activeRows - 1) * (paper.columns - 1) * 6,
  'Отрисовывается неверное число рядов',
);
assert.ok(final.coil.active && final.coil.turns > .25, `Лента не начала сворачиваться в спираль: ${JSON.stringify(final.coil)}`);

paper.targetLength = 3.2;
for (let frame = 1620; frame < 2460; frame += 1) {
  paper.update(frame * 1000 / 60, 1 / 60, false);
}
const longReceipt = paper.debug();
const longReceiptSelfIntersections = coilSelfIntersections(longReceipt.coil.startsAt);
assert.ok(Math.abs(paper.length - paper.targetLength) < 1e-6, 'Длинная лента перестала подаваться');
assert.ok(longReceipt.coil.turns > final.coil.turns + .8, `Спираль не растёт после десяти выплат: ${JSON.stringify({ final: final.coil, long: longReceipt.coil })}`);
assert.ok(longReceipt.coil.radius > final.coil.radius + .06, 'Радиус бумажного рулона визуально не увеличивается');
assert.equal(longReceipt.coil.direction, 'toward-cabinet', 'Спираль закручивается наружу вместо направления от роликов');
assert.equal(longReceipt.coil.axis, 'parallel-to-slot', 'Ось рулона перестала быть параллельна прорези');
assert.equal(longReceipt.coil.yaw, 0, 'Бумага перекручивается по ширине при контакте с полом');
assert.equal(longReceiptSelfIntersections.length, 0, `Витки проходят сквозь друг друга: ${JSON.stringify(longReceiptSelfIntersections)}`);
assert.ok(Math.abs(longReceipt.slotMaterial - paper.length) < 1e-5, 'Материал длинной ленты не подаётся из щели');
const shortestFullSegment = shortestActiveSegment();
assert.ok(shortestFullSegment > paper.segmentLength * .975, `Лента сминается при контакте с полом: ${shortestFullSegment}`);

paper.targetLength = 4.3;
for (let frame = 2460; frame < 3300; frame += 1) {
  paper.update(frame * 1000 / 60, 1 / 60, false);
}
const maximumReceipt = paper.debug();
const maximumSelfIntersections = coilSelfIntersections(maximumReceipt.coil.startsAt);
assert.ok(Math.abs(paper.length - paper.targetLength) < 1e-6, 'Лента не дошла до почти максимальной длины');
assert.equal(maximumSelfIntersections.length, 0, `Длинный рулон самопересекается: ${JSON.stringify(maximumSelfIntersections)}`);
assert.ok(maximumReceipt.bounds.minY >= paper.floorY - 1e-4, 'Длинный рулон провалился сквозь пол');

console.log(JSON.stringify({ first, outfeedPoint, firstMaxTurn, firstMaxTurnRow, forming, hanging, hangingCrossSectionWarp, touching, touchingShortestSegment, final, longReceipt, longReceiptSelfIntersections, shortestFullSegment, maximumReceipt, maximumSelfIntersections, length: paper.length }, null, 2));
