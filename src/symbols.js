import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

export const SYMBOLS = [
  { id: 'onec', name: 'Знак 1С', short: '1С', payout: 100, accent: '#df312b', art: 'symbol-onec-v2.webp', draw: drawArt },
  { id: 'nuraliev', name: 'Борис Нуралиев', short: 'НУРАЛИЕВ', payout: 830, accent: '#f0b62f', art: 'boris-nuraliev-caricature.webp', jackpot: true, draw: drawArt },
  { id: 'release', name: 'Релиз', short: 'РЕЛИЗ', payout: 50, accent: '#d94a31', art: 'symbol-release-v2.webp', draw: drawArt },
  { id: 'database', name: 'Регистр', short: 'РЕГИСТР', payout: 30, accent: '#2d7564', art: 'symbol-database-v2.webp', draw: drawArt },
  { id: 'query', name: 'Запрос', short: 'ЗАПРОС', payout: 20, accent: '#366c80', art: 'symbol-query-v2.webp', draw: drawArt },
  { id: 'document', name: 'Документ', short: 'ДОКУМЕНТ', payout: 12, accent: '#a55c28', art: 'symbol-document-v2.webp', draw: drawArt },
  { id: 'code', name: 'Модуль BSL', short: 'МОДУЛЬ', payout: 9, accent: '#4c5d8a', art: 'symbol-code-v2.webp', draw: drawArt },
  { id: 'bug', name: 'Ошибка', short: 'ОШИБКА', payout: 7, accent: '#8c3434', art: 'symbol-bug-v2.webp', draw: drawArt },
  { id: 'config', name: 'Конфигурация', short: 'КОНФИГ.', payout: 40, accent: '#c88a22', art: 'symbol-config-v2.webp', draw: drawArt },
  { id: 'wild', name: 'Ядро данных', short: 'ЯДРО', payout: 250, accent: '#db8d1f', art: 'symbol-wild-v2.webp', wild: true, draw: drawArt },
];

export const REEL_STRIPS = [
  ['document', 'bug', 'database', 'code', 'query', 'document', 'onec', 'config', 'bug', 'nuraliev', 'release', 'query', 'code', 'database', 'document', 'wild', 'bug', 'config', 'query'],
  ['bug', 'query', 'config', 'document', 'code', 'database', 'release', 'bug', 'document', 'wild', 'query', 'nuraliev', 'config', 'code', 'bug', 'onec', 'database', 'query', 'document'],
  ['query', 'document', 'bug', 'config', 'database', 'code', 'wild', 'document', 'release', 'bug', 'onec', 'query', 'nuraliev', 'database', 'code', 'config', 'document', 'bug', 'query'],
];

export const REEL_STRIP = REEL_STRIPS[0];

export const PAYLINES = [
  { id: 1, name: 'ЦЕНТР', rows: [0, 0, 0], color: 0xffc13b },
  { id: 2, name: 'ВЕРХ', rows: [-1, -1, -1], color: 0x51e6e0 },
  { id: 3, name: 'НИЗ', rows: [1, 1, 1], color: 0xff4b3e },
  { id: 4, name: 'ДИАГОНАЛЬ ↘', rows: [-1, 0, 1], color: 0x78f06c },
  { id: 5, name: 'ДИАГОНАЛЬ ↗', rows: [1, 0, -1], color: 0xd76dff },
];

export function symbolById(id) {
  return SYMBOLS.find((item) => item.id === id) || SYMBOLS[0];
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function drawBackground(g, size, symbol) {
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#fff0bc');
  grad.addColorStop(.55, '#dfca91');
  grad.addColorStop(1, '#bba36c');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  g.globalAlpha = .15;
  g.strokeStyle = '#4a3b24';
  g.lineWidth = 2;
  for (let y = 11; y < size; y += 17) {
    g.beginPath();
    g.moveTo(0, y + ((y * 7) % 5));
    g.lineTo(size, y - 2);
    g.stroke();
  }
  g.globalAlpha = 1;

  g.strokeStyle = '#332b1e';
  g.lineWidth = 11;
  roundRect(g, 10, 10, size - 20, size - 20, 24);
  g.stroke();
  g.strokeStyle = symbol.accent;
  g.lineWidth = 7;
  roundRect(g, 23, 23, size - 46, size - 46, 18);
  g.stroke();

  for (const [x, y] of [[31, 31], [size - 31, 31], [31, size - 31], [size - 31, size - 31]]) {
    g.fillStyle = '#5f4b2b';
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f7d67a';
    g.beginPath(); g.arc(x - 1, y - 1, 1.6, 0, Math.PI * 2); g.fill();
  }
}

function drawLabel(g, size, symbol) {
  g.fillStyle = '#201d16';
  g.font = `700 ${Math.max(25, 38 - symbol.short.length)}px "Arial Narrow", "Roboto Condensed", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = '2px';
  g.fillText(symbol.short, size / 2, size - 49);
}

export function createSymbolCanvas(symbol, size = 384) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;
  drawBackground(g, size, symbol);
  g.save();
  symbol.draw(g, size, symbol);
  g.restore();
  drawLabel(g, size, symbol);
  return canvas;
}

export function createSymbolDataUrls() {
  return new Map(SYMBOLS.map((symbol) => [symbol.id, createReelTileCanvas(symbol, 192).toDataURL('image/png')]));
}

function createReelTileCanvas(symbol, size = 384, compensateReelAspect = false) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = true;

  const enamel = g.createLinearGradient(0, 0, size, 0);
  enamel.addColorStop(0, '#6f6044');
  enamel.addColorStop(.09, '#b7a276');
  enamel.addColorStop(.25, '#e7d6a6');
  enamel.addColorStop(.52, '#f7e9bd');
  enamel.addColorStop(.78, '#d4bf8e');
  enamel.addColorStop(.94, '#988158');
  enamel.addColorStop(1, '#51442f');
  g.fillStyle = enamel;
  g.fillRect(0, 0, size, size);

  const glow = g.createRadialGradient(size / 2, size / 2, 18, size / 2, size / 2, size * .56);
  glow.addColorStop(0, 'rgba(255,251,220,.5)');
  glow.addColorStop(.72, 'rgba(255,251,220,.06)');
  glow.addColorStop(1, 'rgba(54,39,20,.22)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);

  g.globalAlpha = .12;
  g.strokeStyle = '#43351f';
  g.lineWidth = 2;
  for (let y = 8; y < size; y += 15) {
    g.beginPath();
    g.moveTo(0, y + ((y * 13) % 4));
    g.lineTo(size, y - 1);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#66502d';
  g.fillRect(0, 0, size, 7);
  g.fillRect(0, size - 7, size, 7);
  g.fillStyle = '#d7b65e';
  g.fillRect(0, 7, size, 3);
  g.fillRect(0, size - 10, size, 3);

  g.save();
  if (compensateReelAspect) {
    // На цилиндре один символ занимает дугу примерно .71 × .90. Компенсация
    // сохраняет круг медальона на центральной (фронтальной) позиции барабана.
    const artScaleX = .79;
    g.translate(size * (1 - artScaleX) / 2, 0);
    g.scale(artScaleX, 1);
  }
  symbol.draw(g, size, symbol);
  g.restore();
  return canvas;
}

export function createReelTexture(strip = REEL_STRIP) {
  // 192 × 19 = 3648 px: safely below the 4096 texture limit of older mobile GPUs.
  const tile = 192;
  const canvas = document.createElement('canvas');
  canvas.width = tile;
  canvas.height = tile * strip.length;
  const g = canvas.getContext('2d');
  strip.forEach((id, index) => {
    g.drawImage(createReelTileCanvas(symbolById(id), tile, true), 0, index * tile);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.repeat.set(1, 3 / strip.length);
  texture.userData.visibleTiles = 3;
  texture.anisotropy = 8;
  return texture;
}

export function setReelTexturePosition(texture, position, stripLength = REEL_STRIP.length) {
  const p = ((position % stripLength) + stripLength) % stripLength;
  const visibleTiles = texture.userData.visibleTiles || 1;
  texture.offset.y = 1 - ((p + (visibleTiles + 1) / 2) / stripLength);
}

export function findStripIndex(id, fromPosition = 0, strip = REEL_STRIP) {
  const start = Math.floor(fromPosition + 1);
  for (let step = 0; step < strip.length; step++) {
    const index = (start + step) % strip.length;
    if (strip[index] === id) return index;
  }
  return 0;
}

function drawOneC(g, s) {
  g.save();
  g.translate(s / 2, s * .47);
  g.rotate(-.055);
  g.shadowColor = 'rgba(99,17,15,.35)'; g.shadowBlur = 14; g.shadowOffsetY = 8;
  g.fillStyle = '#e2372f';
  roundRect(g, -119, -88, 238, 172, 25); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = '#8c1d18'; g.lineWidth = 7; g.stroke();
  g.fillStyle = '#fff2c4';
  g.font = '900 112px Arial Black, Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('1С', 0, 2);
  g.restore();
}

function drawArt(g, s, symbol) {
  if (!symbol.image) {
    drawCube(g, s);
    return;
  }

  g.drawImage(symbol.image, 0, 0, s, s);

  if (symbol.id === 'onec') {
    g.save();
    g.shadowColor = 'rgba(0,0,0,.7)';
    g.shadowBlur = 12;
    g.fillStyle = '#b92420';
    roundRect(g, s * .325, s * .665, s * .35, s * .19, s * .045);
    g.fill();
    g.strokeStyle = '#f3ca66';
    g.lineWidth = s * .018;
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#fff0b1';
    g.font = `900 ${s * .12}px Arial Black, Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('1С', s / 2, s * .76);
    g.restore();
  }
}

function drawNuraliev(g, s, symbol) {
  if (symbol.image) {
    const margin = s * .035;
    g.drawImage(symbol.image, margin, margin, s - margin * 2, s - margin * 2);
    return;
  }

  // Векторный запасной вариант, если портрет не успел загрузиться.
  g.fillStyle = '#214332';
  g.beginPath(); g.arc(s / 2, s * .46, s * .34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d79a55';
  g.beginPath(); g.ellipse(s / 2, s * .43, s * .18, s * .23, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#49331f'; g.lineWidth = 9;
  for (const x of [s * .43, s * .57]) { g.beginPath(); g.roundRect(x - 32, s * .37, 64, 42, 9); g.stroke(); }
  g.beginPath(); g.moveTo(s * .49, s * .42); g.lineTo(s * .51, s * .42); g.stroke();
  g.fillStyle = '#38251d';
  g.beginPath(); g.ellipse(s / 2, s * .53, s * .12, s * .035, 0, 0, Math.PI * 2); g.fill();
}

function drawCube(g, s) {
  const cx = s / 2, cy = s * .44, w = 118, h = 102;
  g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = '#6f4313';
  g.fillStyle = '#f0b62f';
  g.beginPath(); g.moveTo(cx, cy - h); g.lineTo(cx + w, cy - h / 2); g.lineTo(cx, cy); g.lineTo(cx - w, cy - h / 2); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#d98b20';
  g.beginPath(); g.moveTo(cx - w, cy - h / 2); g.lineTo(cx, cy); g.lineTo(cx, cy + h); g.lineTo(cx - w, cy + h / 2); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ffc94c';
  g.beginPath(); g.moveTo(cx + w, cy - h / 2); g.lineTo(cx, cy); g.lineTo(cx, cy + h); g.lineTo(cx + w, cy + h / 2); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#7b3b19';
  for (const [x, y] of [[cx - 43, cy + 24], [cx + 43, cy + 18], [cx, cy - 48]]) {
    g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
  }
}

function drawDatabase(g, s) {
  const cx = s / 2, top = 86, w = 190, h = 176;
  g.fillStyle = '#2f7566'; g.strokeStyle = '#193d35'; g.lineWidth = 8;
  g.beginPath(); g.ellipse(cx, top, w / 2, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillRect(cx - w / 2, top, w, h);
  g.strokeRect(cx - w / 2, top, w, h);
  for (let y = top + 54; y <= top + h; y += 54) {
    g.fillStyle = y % 2 ? '#397f70' : '#2f7566';
    g.beginPath(); g.ellipse(cx, y, w / 2, 33, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.fillStyle = '#80ccb3';
  for (let y = top + 40; y < top + h; y += 54) { g.beginPath(); g.arc(cx + 54, y, 6, 0, Math.PI * 2); g.fill(); }
}

function drawDocument(g, s) {
  const x = 106, y = 65, w = 174, h = 218;
  g.fillStyle = '#fff1c6'; g.strokeStyle = '#693f22'; g.lineWidth = 8;
  roundRect(g, x, y, w, h, 13); g.fill(); g.stroke();
  g.fillStyle = '#cf6a31'; g.fillRect(x + 22, y + 25, w - 44, 24);
  g.strokeStyle = '#8b7754'; g.lineWidth = 7;
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x + 25, y + 85 + i * 33); g.lineTo(x + w - 25 - (i % 2) * 35, y + 85 + i * 33); g.stroke(); }
  g.fillStyle = '#d43b30'; g.beginPath(); g.arc(x + w - 45, y + h - 42, 28, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe7a0'; g.font = '900 26px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✓', x + w - 45, y + h - 42);
}

function drawCode(g, s) {
  g.fillStyle = '#28343b'; g.strokeStyle = '#162127'; g.lineWidth = 8;
  roundRect(g, 72, 69, s - 144, 204, 18); g.fill(); g.stroke();
  g.fillStyle = '#76e2d1'; g.font = '900 112px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('{ }', s / 2, 161);
  g.fillStyle = '#e35f47'; g.font = '700 31px Consolas, monospace'; g.fillText('BSL', s / 2, 236);
}

function drawQuery(g, s) {
  g.fillStyle = '#f6e7ba'; g.strokeStyle = '#345a65'; g.lineWidth = 7;
  roundRect(g, 73, 67, 205, 174, 12); g.fill(); g.stroke();
  g.strokeStyle = '#7896a0'; g.lineWidth = 5;
  for (let y = 104; y < 225; y += 39) { g.beginPath(); g.moveTo(88, y); g.lineTo(263, y); g.stroke(); }
  for (let x = 133; x < 260; x += 63) { g.beginPath(); g.moveTo(x, 82); g.lineTo(x, 227); g.stroke(); }
  g.strokeStyle = '#1e586a'; g.lineWidth = 15; g.beginPath(); g.arc(236, 219, 55, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(274, 260); g.lineTo(314, 300); g.stroke();
}

function drawBug(g, s) {
  g.fillStyle = '#9f332e'; g.strokeStyle = '#501915'; g.lineWidth = 9;
  g.beginPath(); g.ellipse(s / 2, 182, 72, 91, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.arc(s / 2, 96, 45, 0, Math.PI * 2); g.fill(); g.stroke();
  g.strokeStyle = '#63231f'; g.lineWidth = 12; g.lineCap = 'round';
  for (const y of [142, 190, 236]) {
    g.beginPath(); g.moveTo(126, y); g.lineTo(76, y + (y - 190) * .35); g.stroke();
    g.beginPath(); g.moveTo(258, y); g.lineTo(308, y + (y - 190) * .35); g.stroke();
  }
  g.strokeStyle = '#f2b548'; g.lineWidth = 6; g.beginPath(); g.moveTo(s / 2, 117); g.lineTo(s / 2, 265); g.stroke();
  g.fillStyle = '#ffc95d'; g.beginPath(); g.arc(176, 92, 7, 0, Math.PI * 2); g.arc(208, 92, 7, 0, Math.PI * 2); g.fill();
}

function drawRocket(g, s) {
  g.save(); g.translate(s / 2, 174); g.rotate(.18);
  g.fillStyle = '#e8ded0'; g.strokeStyle = '#5d2b25'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(0, -119); g.bezierCurveTo(68, -59, 62, 59, 0, 106); g.bezierCurveTo(-62, 59, -68, -59, 0, -119); g.fill(); g.stroke();
  g.fillStyle = '#d83d31'; g.beginPath(); g.moveTo(-42, 50); g.lineTo(-92, 104); g.lineTo(-35, 86); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(42, 50); g.lineTo(92, 104); g.lineTo(35, 86); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#5dc0c2'; g.beginPath(); g.arc(0, -30, 24, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#ffbd38'; g.beginPath(); g.moveTo(-22, 104); g.quadraticCurveTo(0, 167, 22, 104); g.closePath(); g.fill();
  g.restore();
}

function drawCore(g, s) {
  const cx = s / 2, cy = 167;
  const glow = g.createRadialGradient(cx, cy, 8, cx, cy, 122);
  glow.addColorStop(0, '#fff9c7'); glow.addColorStop(.22, '#ffd24d'); glow.addColorStop(.62, '#dd7721'); glow.addColorStop(1, 'rgba(184,62,24,0)');
  g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, 132, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7c3813'; g.lineWidth = 8;
  for (let r = 107; r > 55; r -= 26) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4);
  g.fillStyle = '#ffc83d'; g.strokeStyle = '#793712'; g.lineWidth = 8;
  g.fillRect(-54, -54, 108, 108); g.strokeRect(-54, -54, 108, 108);
  g.strokeStyle = '#fff0a1'; g.lineWidth = 4;
  for (let p = -30; p <= 30; p += 30) { g.beginPath(); g.moveTo(-49, p); g.lineTo(49, p); g.stroke(); g.beginPath(); g.moveTo(p, -49); g.lineTo(p, 49); g.stroke(); }
  g.restore();
}
