import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  GridHelper,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  PointLight,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SpotLight,
  Float32BufferAttribute,
  TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CoinFX } from './coin-fx.js';
import { ReceiptPaper } from './receipt-paper.js';

const C = {
  body: 0x142820,
  bodyLight: 0x254237,
  dark: 0x050a08,
  red: 0x9c2923,
  redBright: 0xe6382f,
  brass: 0xa97027,
  amber: 0xffbe3d,
  cream: 0xf1deac,
  cyan: 0x5de8df,
};

let bumpTexture;
function makeBumpTexture() {
  if (bumpTexture) return bumpTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const g = canvas.getContext('2d');
  const image = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      const grain = Math.sin(x * .73 + y * .12) * 9 + ((x * 31 + y * 17 + x * y) % 19) - 9;
      const value = Math.max(84, Math.min(172, 128 + grain));
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  bumpTexture = new CanvasTexture(canvas);
  bumpTexture.wrapS = RepeatWrapping; bumpTexture.wrapT = RepeatWrapping;
  bumpTexture.repeat.set(4, 6);
  return bumpTexture;
}

function metal(color, roughness = .58, metalness = .38, extra = {}) {
  return new MeshPhysicalMaterial({
    color, roughness, metalness,
    bumpMap: makeBumpTexture(), bumpScale: .012,
    clearcoat: .18, clearcoatRoughness: .55,
    envMapIntensity: .82,
    ...extra,
  });
}

function glow(color, intensity = 2.5) {
  return new MeshStandardMaterial({ color: 0x100d08, emissive: color, emissiveIntensity: intensity, roughness: .4 });
}

function roundedBox(w, h, d, radius, material, x, y, z, segments = 4) {
  const mesh = new Mesh(new RoundedBoxGeometry(w, h, d, segments, radius), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, material, x, y, z) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  draw(g, canvas);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function labelTexture(title, subtitle = '', { fg = '#f6e4b5', accent = '#e6382f', dark = true } = {}) {
  return canvasTexture(1536, 320, (g, c) => {
    g.clearRect(0, 0, c.width, c.height);
    if (dark) {
      g.fillStyle = 'rgba(5,12,9,.88)'; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = '#a97027'; g.lineWidth = 16; g.strokeRect(20, 20, c.width - 40, c.height - 40);
      g.strokeStyle = accent; g.lineWidth = 6; g.strokeRect(42, 42, c.width - 84, c.height - 84);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = fg; g.shadowColor = 'rgba(255,190,61,.42)'; g.shadowBlur = 13;
    g.font = '900 150px "Arial Narrow", Impact, sans-serif';
    g.fillText(title, c.width / 2, subtitle ? 135 : 160);
    if (subtitle) {
      g.shadowBlur = 0; g.fillStyle = '#c49f55'; g.font = '700 40px Consolas, monospace';
      g.letterSpacing = '8px'; g.fillText(subtitle, c.width / 2, 250);
    }
  });
}

function marqueeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 200;
  const g = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.redraw = (text = 'СЧЁТМАШ–83', tone = 'idle') => {
    const jackpot = tone === 'jackpot';
    const accent = jackpot ? '#e6382f' : '#a97027';
    const glowColor = jackpot ? 'rgba(255,78,53,.72)' : 'rgba(255,190,61,.38)';
    const background = g.createLinearGradient(0, 0, canvas.width, 0);
    background.addColorStop(0, '#090c09');
    background.addColorStop(.5, jackpot ? '#30120d' : '#261b0d');
    background.addColorStop(1, '#090c09');
    g.fillStyle = background;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#a97027'; g.lineWidth = 12; g.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    g.strokeStyle = accent; g.lineWidth = 5; g.strokeRect(34, 34, canvas.width - 68, canvas.height - 68);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = jackpot ? '#fff0b9' : '#f6e4b5';
    g.shadowColor = glowColor; g.shadowBlur = jackpot ? 26 : 13;
    g.font = `900 ${jackpot ? 104 : 124}px "Arial Narrow", Impact, sans-serif`;
    g.fillText(String(text).toUpperCase(), canvas.width / 2, canvas.height / 2 + 3, canvas.width - 150);
    texture.userData.text = String(text).toUpperCase();
    texture.needsUpdate = true;
  };
  texture.userData.redraw();
  return texture;
}

function enamelTexture(base, seed = 83) {
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const texture = canvasTexture(512, 512, (g, canvas) => {
    g.fillStyle = base;
    g.fillRect(0, 0, canvas.width, canvas.height);

    // Paint variation stays below the silhouette level. Large pale and rusty
    // islands made every separately UV-mapped panel look like another fabric
    // patch, so the enamel now relies on lighting for its broad variation.
    for (let i = 0; i < 950; i += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const size = .35 + random() * 1.1;
      g.globalAlpha = .012 + random() * .035;
      g.fillStyle = random() > .48 ? '#e8eadf' : '#020604';
      g.fillRect(x, y, size, size);
    }

    // A handful of hairline marks breaks the factory finish without creating
    // high-contrast stains in the middle of the cabinet panels.
    g.lineCap = 'round';
    for (let i = 0; i < 7; i += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      g.globalAlpha = .025 + random() * .035;
      g.strokeStyle = random() > .5 ? '#dce2d8' : '#020504';
      g.lineWidth = .5 + random() * .6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 8 + random() * 20, y + (random() - .5) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(2.4, 3.2);
  return texture;
}

function oracleDisplayTexture(initialText = 'ОЖИДАНИЕ ОПЕРАТОРА') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 180;
  const g = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.redraw = (text, tone = 'idle') => {
    const palette = {
      idle: ['#d8a744', '#2a1608'], sleep: ['#786d50', '#11120e'],
      working: ['#ffd369', '#3b2108'], approve: ['#c8ef9b', '#10230e'],
      reject: ['#ff8c74', '#33100c'], jackpot: ['#ffe48a', '#3b2404'],
    }[tone] || ['#d8a744', '#2a1608'];
    const background = g.createLinearGradient(0, 0, 0, canvas.height);
    background.addColorStop(0, '#070a08'); background.addColorStop(.5, palette[1]); background.addColorStop(1, '#030403');
    g.fillStyle = background; g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#7d5b2f'; g.lineWidth = 13; g.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    g.strokeStyle = 'rgba(255,224,148,.18)'; g.lineWidth = 3; g.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
    g.fillStyle = palette[0]; g.shadowColor = palette[0]; g.shadowBlur = tone === 'sleep' ? 2 : 15;
    g.font = '800 57px Consolas, "Courier New", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const value = String(text).toUpperCase().slice(0, 28);
    g.fillText(value, canvas.width / 2, canvas.height / 2 + 3, canvas.width - 80);
    g.shadowBlur = 0;
    for (let y = 39; y < canvas.height; y += 27) {
      g.fillStyle = 'rgba(255,255,220,.035)'; g.fillRect(31, y, canvas.width - 62, 2);
    }
    texture.userData.text = value;
    texture.userData.tone = tone;
    texture.needsUpdate = true;
  };
  texture.userData.redraw(initialText, 'sleep');
  return texture;
}

function servicePlateTexture() {
  return canvasTexture(640, 420, (g, canvas) => {
    g.fillStyle = '#a79872'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#332c20'; g.lineWidth = 22; g.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    g.fillStyle = '#332c20'; g.font = '800 64px Consolas, monospace'; g.textAlign = 'left';
    g.fillText('ИНВ. №', 55, 86); g.font = '900 96px Consolas, monospace'; g.fillText('1С-0083', 55, 183);
    g.font = '800 58px Consolas, monospace'; g.fillText('ОТК', 55, 280);
    g.save(); g.translate(460, 280); g.rotate(-.18);
    g.strokeStyle = '#69413b'; g.lineWidth = 15; g.beginPath(); g.arc(0, 0, 105, 0, Math.PI * 2); g.stroke();
    g.font = '900 42px Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = '#69413b';
    g.fillText('ПРОВЕРЕНО', 0, 2, 190); g.restore();
  });
}

const RECEIPT_TEXTURE_HEIGHT = 4096;
const RECEIPT_PIXELS_PER_UNIT = 920;
const RECEIPT_HEADER_HEIGHT = 132;
// Each operation gets enough physical paper to remain readable and to form a
// complete first roll at roughly 1000 credits (ten standard +100 payouts).
const RECEIPT_ENTRY_HEIGHT = 200;
const RECEIPT_FOOTER_HEIGHT = 72;
const RECEIPT_MAX_ENTRIES = Math.floor(
  (RECEIPT_TEXTURE_HEIGHT - RECEIPT_HEADER_HEIGHT - RECEIPT_FOOTER_HEIGHT) / RECEIPT_ENTRY_HEIGHT,
);

function receiptTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 420; canvas.height = RECEIPT_TEXTURE_HEIGHT;
  const g = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const entries = [];
  const redraw = () => {
    const usedHeight = RECEIPT_HEADER_HEIGHT + entries.length * RECEIPT_ENTRY_HEIGHT + RECEIPT_FOOTER_HEIGHT;
    const paper = g.createLinearGradient(0, 0, canvas.width, 0);
    paper.addColorStop(0, '#978d6e');
    paper.addColorStop(.08, '#c0b590');
    paper.addColorStop(.48, '#d2c7a2');
    paper.addColorStop(.92, '#b7ac88');
    paper.addColorStop(1, '#8c8266');
    g.fillStyle = paper;
    g.fillRect(0, 0, canvas.width, canvas.height);

    // Fibres and perforation keep the strip readable as thin office paper,
    // not a rigid card hanging from the cabinet.
    g.globalAlpha = .10;
    for (let y = 9; y < canvas.height; y += 17) {
      g.fillStyle = y % 34 ? '#70684f' : '#fff8d8';
      g.fillRect(32, y, canvas.width - 64, 1);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#8f8668';
    for (let y = 16; y < canvas.height; y += 30) {
      g.beginPath(); g.arc(15, y, 4.6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(canvas.width - 15, y, 4.6, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#9e9475'; g.lineWidth = 2; g.setLineDash([8, 7]);
    g.beginPath(); g.moveTo(31, 0); g.lineTo(31, canvas.height); g.stroke();
    g.beginPath(); g.moveTo(canvas.width - 31, 0); g.lineTo(canvas.width - 31, canvas.height); g.stroke();
    g.setLineDash([]);

    g.fillStyle = '#211d15'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '800 29px Consolas, monospace'; g.fillText('СЧЁТМАШ–83', 48, 48);
    g.font = '600 20px Consolas, monospace'; g.fillText('НЕПРЕРЫВНАЯ ЛЕНТА ВЫПЛАТ', 48, 82, 324);
    g.strokeStyle = '#776e54'; g.lineWidth = 2; g.setLineDash([10, 8]);
    g.beginPath(); g.moveTo(48, 108); g.lineTo(372, 108); g.stroke(); g.setLineDash([]);

    entries.forEach((entry, index) => {
      const top = RECEIPT_HEADER_HEIGHT + index * RECEIPT_ENTRY_HEIGHT;
      g.fillStyle = '#242017'; g.textAlign = 'left'; g.font = '700 18px Consolas, monospace';
      g.fillText(`ОПЕРАЦИЯ ${String(index + 1).padStart(4, '0')}`, 48, top + 31);
      g.font = '800 27px Consolas, monospace';
      g.fillText(String(entry.text).toUpperCase(), 48, top + 78, 324);
      g.fillStyle = '#373025'; g.font = '700 16px Consolas, monospace';
      g.fillText(entry.jackpot ? 'ПОДПИСЬ: ДИРЕКТОР' : 'ПОДПИСЬ: АВТОМАТ', 48, top + 120);
      g.save();
      g.translate(315, top + 148);
      g.rotate(-.10 + (index % 2) * .035);
      g.strokeStyle = '#98271f'; g.fillStyle = '#98271f'; g.lineWidth = 5;
      g.strokeRect(-58, -24, 116, 48);
      g.font = '900 17px "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(entry.jackpot ? 'ДИРЕКТОР' : 'ОДОБРЕНО', 0, 0, 104);
      g.restore();
      g.strokeStyle = '#a0977b'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(48, top + 184); g.lineTo(372, top + 184); g.stroke();
    });

    g.fillStyle = '#302a20'; g.font = '700 17px Consolas, monospace'; g.textAlign = 'center';
    g.fillText('НЕ ОТРЫВАТЬ ДО ЗАКРЫТИЯ СМЕНЫ', canvas.width / 2, usedHeight - 28, 330);
    texture.userData.text = entries.at(-1)?.text ? String(entries.at(-1).text).toUpperCase() : '';
    texture.userData.usedHeight = usedHeight;
    texture.needsUpdate = true;
  };
  texture.userData.append = (entry) => {
    if (entries.length < RECEIPT_MAX_ENTRIES) entries.push(entry);
    redraw();
    return texture.userData.usedHeight / RECEIPT_PIXELS_PER_UNIT;
  };
  texture.userData.reset = () => {
    entries.length = 0;
    redraw();
  };
  texture.userData.count = () => entries.length;
  redraw();
  return texture;
}

function counterTexture(label, initialValue = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 420;
  const g = canvas.getContext('2d');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.userData.redraw = (value) => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#a98d58'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#d8c18c'; g.fillRect(18, 18, canvas.width - 36, canvas.height - 36);
    g.strokeStyle = '#46351e'; g.lineWidth = 17; g.strokeRect(25, 25, canvas.width - 50, canvas.height - 50);
    g.fillStyle = '#241b12'; g.fillRect(72, 122, canvas.width - 144, 230);
    const text = typeof value === 'number' ? String(Math.max(0, Math.floor(value))).padStart(4, '0').slice(-4) : String(value).slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const x = 91 + i * 148;
      const drum = g.createLinearGradient(0, 132, 0, 343);
      drum.addColorStop(0, '#0b0b08'); drum.addColorStop(.48, '#302a1c'); drum.addColorStop(.52, '#18130d'); drum.addColorStop(1, '#050504');
      g.fillStyle = drum; g.fillRect(x, 138, 124, 198);
      g.strokeStyle = '#6f5931'; g.lineWidth = 4; g.strokeRect(x, 138, 124, 198);
      g.fillStyle = '#f2d889'; g.shadowColor = '#e8a82e'; g.shadowBlur = 12;
      g.font = '900 112px Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text[i] || '0', x + 62, 239);
      g.shadowBlur = 0;
    }
    g.fillStyle = '#332718'; g.font = '800 42px "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '5px'; g.fillText(label, canvas.width / 2, 72);
    texture.needsUpdate = true;
  };
  texture.userData.redraw(initialValue);
  return texture;
}

function paylineDisplayTexture(paylines) {
  return canvasTexture(1280, 300, (g, canvas) => {
    const background = g.createLinearGradient(0, 0, 0, canvas.height);
    background.addColorStop(0, '#111a17');
    background.addColorStop(.5, '#030705');
    background.addColorStop(1, '#101814');
    g.fillStyle = background;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = '#725427';
    g.lineWidth = 10;
    g.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    const cellWidth = canvas.width / paylines.length;
    paylines.forEach((line, index) => {
      const left = index * cellWidth;
      g.fillStyle = '#d5a33d';
      g.font = '800 38px Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(line.id), left + cellWidth / 2, 48);
      const points = line.rows.map((row, reelIndex) => ({
        x: left + 48 + reelIndex * 80,
        y: 176 + row * 54,
      }));
      g.strokeStyle = '#e7a92f';
      g.shadowColor = '#e7a92f';
      g.shadowBlur = 14;
      g.lineWidth = 8;
      g.beginPath();
      points.forEach((point, pointIndex) => {
        if (pointIndex === 0) g.moveTo(point.x, point.y);
        else g.lineTo(point.x, point.y);
      });
      g.stroke();
      g.shadowBlur = 0;
      for (const point of points) {
        g.fillStyle = '#ffd66b';
        g.beginPath();
        g.arc(point.x, point.y, 9, 0, Math.PI * 2);
        g.fill();
      }
      if (index < paylines.length - 1) {
        g.strokeStyle = '#25332d';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(left + cellWidth, 26);
        g.lineTo(left + cellWidth, canvas.height - 26);
        g.stroke();
      }
    });
  });
}

function createRivet(material, x, y, z, scale = 1) {
  const rivet = new Mesh(new SphereGeometry(.045 * scale, 12, 8), material);
  rivet.position.set(x, y, z); rivet.castShadow = true;
  return rivet;
}

function createStarburst(material, x, y, z) {
  const shape = new Shape();
  const points = 16;
  for (let i = 0; i < points; i++) {
    const angle = -Math.PI / 2 + (i / points) * Math.PI * 2;
    const radius = i % 2 ? .18 : .39;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
  }
  shape.closePath();
  const mesh = new Mesh(new ShapeGeometry(shape), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export function createCabinet({ reelTextures, paylines = [] }) {
  const root = new Group();
  root.name = 'schetmash-83';
  const bodyMat = metal(0xffffff, .68, .26, { map: enamelTexture('#172b23', 83), bumpScale: .006, clearcoat: .10, envMapIntensity: .64 });
  const bodyLightMat = metal(0xffffff, .66, .24, { map: enamelTexture('#1d352b', 138), bumpScale: .006, clearcoat: .11, envMapIntensity: .66 });
  const darkMat = metal(C.dark, .72, .42);
  const redMat = metal(C.red, .46, .46, { clearcoat: .28 });
  const brassMat = metal(C.brass, .38, .74, { clearcoat: .22 });
  const creamMat = metal(C.cream, .55, .18);
  const redGlowMat = glow(C.redBright, 3.1);

  // A+B direction: one quiet monolithic shell, a single reel window and a
  // functional instrument panel. Decorative hardware is kept deliberately sparse.
  root.add(
    roundedBox(4.58, .46, 2.42, .14, darkMat, 0, .32, 0),
    roundedBox(4.34, .24, 2.50, .08, bodyMat, 0, .62, 0),
    roundedBox(4.18, 4.78, 2.14, .18, bodyMat, 0, 2.93, 0),
    roundedBox(4.24, 1.02, 2.18, .20, bodyMat, 0, 5.35, 0),
    roundedBox(3.90, 3.76, .20, .11, bodyLightMat, 0, 2.93, 1.04),
  );

  for (const x of [-1.78, 1.78]) for (const z of [-.82, .82]) {
    root.add(roundedBox(.34, .24, .34, .07, darkMat, x, .12, z));
  }
  root.add(box(4.10, .045, 2.26, brassMat, 0, .56, 0));

  // Subtle manufactured seams on the sides; no external glowing rails.
  for (const x of [-2.035, 2.035]) {
    root.add(box(.035, 3.95, 2.08, darkMat, x, 2.84, 0));
    root.add(createRivet(brassMat, x, 1.02, 1.08, .72));
    root.add(createRivet(brassMat, x, 4.62, 1.08, .72));
  }

  // The oracle's face: a restrained nameplate over an electromechanical status
  // tape. The lamps are intentionally mismatched, suggesting a stern expression
  // without literal cartoon eyes.
  const titleGlow = roundedBox(3.62, .43, .085, .07, glow(C.amber, .12), 0, 5.62, 1.18);
  const titleBack = roundedBox(3.74, .53, .12, .08, darkMat, 0, 5.62, 1.12);
  root.add(titleBack, titleGlow);
  const titleTexture = marqueeTexture();
  const titlePlane = new Mesh(new PlaneGeometry(3.48, .34), new MeshBasicMaterial({
    map: titleTexture,
    transparent: true,
    toneMapped: false,
  }));
  titlePlane.position.set(0, 5.62, 1.235);
  root.add(titlePlane);

  const servicePlate = new Mesh(new PlaneGeometry(.52, .34), new MeshBasicMaterial({ map: servicePlateTexture(), toneMapped: false }));
  servicePlate.position.set(-1.70, 5.14, 1.235);
  servicePlate.rotation.z = -.025;
  root.add(servicePlate);

  const displayTexture = oracleDisplayTexture();
  const displayFrame = roundedBox(2.42, .36, .10, .055, brassMat, .14, 5.15, 1.17);
  const displayPanel = new Mesh(new PlaneGeometry(2.27, .25), new MeshBasicMaterial({ map: displayTexture, toneMapped: false }));
  displayPanel.position.set(.14, 5.15, 1.235);
  root.add(displayFrame, displayPanel);

  const redLampMaterial = glow(C.redBright, .12);
  const greenLampMaterial = glow(0x8fd36b, .18);
  const redLamp = new Mesh(new SphereGeometry(.085, 24, 14), redLampMaterial);
  redLamp.position.set(-1.16, 5.15, 1.285);
  const greenLamp = new Mesh(new SphereGeometry(.074, 24, 14), greenLampMaterial);
  greenLamp.position.set(1.46, 5.15, 1.285);
  root.add(redLamp, greenLamp);

  const speakerBack = roundedBox(.33, .34, .08, .045, darkMat, 1.82, 5.15, 1.17);
  root.add(speakerBack);
  for (const x of [1.72, 1.79, 1.86, 1.93]) root.add(roundedBox(.026, .23, .02, .01, bodyLightMat, x, 5.15, 1.225));

  // One deep panoramic aperture. Thick dark masking hides the rear half of the
  // cylinders and a shared convex glass cover ties all three reels together.
  root.add(roundedBox(3.78, 2.18, .34, .18, darkMat, 0, 3.56, .72));
  root.add(roundedBox(3.68, 2.08, .08, .17, brassMat, 0, 3.56, .90));
  root.add(roundedBox(3.56, 1.96, .075, .16, darkMat, 0, 3.56, .96));

  // A deep structural throat ties the forward reel portal back into the body.
  // Without these four members the bezel only looked plausible head-on and
  // floated in space as soon as the cabinet was inspected from the side.
  root.add(
    roundedBox(.24, 2.02, .58, .07, bodyMat, -1.67, 3.56, 1.29),
    roundedBox(.24, 2.02, .58, .07, bodyMat, 1.67, 3.56, 1.29),
    roundedBox(3.48, .24, .58, .07, bodyMat, 0, 4.45, 1.29),
    roundedBox(3.48, .24, .58, .07, bodyMat, 0, 2.67, 1.29),
  );
  root.add(box(3.44, .13, .19, darkMat, 0, 4.45, 1.58));
  root.add(box(3.44, .13, .19, darkMat, 0, 2.67, 1.58));
  root.add(box(.13, 1.80, .19, darkMat, -1.67, 3.56, 1.58));
  root.add(box(.13, 1.80, .19, darkMat, 1.67, 3.56, 1.58));
  root.add(box(3.30, .025, .20, creamMat, 0, 4.36, 1.62));
  root.add(box(3.30, .025, .20, creamMat, 0, 2.76, 1.62));
  for (const x of [-1.67, 1.67]) for (const y of [2.67, 4.45]) {
    root.add(createRivet(brassMat, x, y, 1.69, .82));
  }

  const reels = [];
  const reelXs = [-1.1, 0, 1.1];
  for (let i = 0; i < 3; i++) {
    const x = reelXs[i];
    const reelGroup = new Group();
    reelGroup.position.set(x, 3.56, 1.39);

    const drum = new Mesh(new CylinderGeometry(.79, .79, .88, 48, 1, true), metal(0xd6bf83, .55, .18));
    drum.rotation.z = Math.PI / 2;
    drum.position.z = -.64;
    drum.castShadow = true;
    reelGroup.add(drum);

    for (const side of [-1, 1]) {
      const cheek = new Mesh(new CylinderGeometry(.84, .84, .055, 48), brassMat);
      cheek.rotation.z = Math.PI / 2;
      cheek.position.x = side * .47;
      cheek.position.z = -.64;
      reelGroup.add(cheek);
    }

    const cardGeometry = new CylinderGeometry(.86, .86, .90, 64, 1, true, -1.27, 2.54);
    const uv = cardGeometry.attributes.uv;
    for (let vertex = 0; vertex < uv.count; vertex += 1) {
      const around = uv.getX(vertex);
      const across = uv.getY(vertex);
      uv.setXY(vertex, 1 - across, around);
    }
    uv.needsUpdate = true;
    const card = new Mesh(cardGeometry, new MeshStandardMaterial({
      map: reelTextures[i],
      color: 0xc8bb98,
      roughness: .78,
      metalness: .03,
      side: DoubleSide,
    }));
    card.rotation.z = Math.PI / 2;
    card.position.z = -.53;
    card.castShadow = true;
    reelGroup.add(card);

    const shadeTop = box(.97, .18, .045, darkMat, 0, .83, .30);
    const shadeBottom = box(.97, .18, .045, darkMat, 0, -.83, .30);
    reelGroup.add(shadeTop, shadeBottom);

    root.add(reelGroup);
    reels.push({ group: reelGroup, drum, texture: reelTextures[i], card });
  }

  const panoramicGlass = roundedBox(3.48, 1.80, .13, .17, new MeshPhysicalMaterial({
    color: 0x315f54,
    roughness: .08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: .08,
    transmission: .34,
    thickness: .12,
    transparent: true,
    opacity: .16,
    depthWrite: false,
    side: DoubleSide,
  }), 0, 3.56, 1.73);
  panoramicGlass.castShadow = false;
  panoramicGlass.renderOrder = 12;
  root.add(panoramicGlass);

  // Thin separators remain inside the common glass rather than forming cages.
  for (const x of [-.55, .55]) root.add(box(.045, 1.64, .055, brassMat, x, 3.56, 1.79));
  const symbolHighlights = reels.map((reel) => [-1, 0, 1].map((row) => {
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: 2,
      toneMapped: false,
    });
    const highlight = new Mesh(new PlaneGeometry(.82, .47), material);
    highlight.position.set(0, -row * .547, .43);
    highlight.renderOrder = 20;
    const ringMaterial = new MeshBasicMaterial({
      color: 0xffd45a,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: 2,
      toneMapped: false,
    });
    const jackpotRing = new Mesh(new RingGeometry(.22, .30, 48), ringMaterial);
    jackpotRing.position.set(0, -row * .547, .435);
    jackpotRing.renderOrder = 21;
    reel.group.add(highlight, jackpotRing);
    return { row, highlight, material, jackpotRing, ringMaterial };
  }));

  const paylineLights = [];
  const paylineVisuals = paylines.map((spec, index) => {
    const points = [
      [-1.56, 3.56 - spec.rows[0] * .547],
      [-1.1, 3.56 - spec.rows[0] * .547],
      [0, 3.56 - spec.rows[1] * .547],
      [1.1, 3.56 - spec.rows[2] * .547],
      [1.56, 3.56 - spec.rows[2] * .547],
    ];
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap(([x, y]) => [x, y, 1.88]), 3));
    const material = new LineBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: 2,
      toneMapped: false,
    });
    const line = new Line(geometry, material);
    line.renderOrder = 30;
    root.add(line);

    const lamp = roundedBox(.27, .035, .025, .012, glow(spec.color, .18), -0.76 + index * .41, 1.155, 1.325);
    lamp.userData.idleIntensity = .18;
    root.add(lamp);
    paylineLights.push(lamp);
    const lamps = [lamp];
    return { spec, line, material, lamps };
  });

  const burstCount = 180;
  const burstPositions = new Float32Array(burstCount * 3);
  const burstColors = new Float32Array(burstCount * 3);
  const burstGeometry = new BufferGeometry();
  burstGeometry.setAttribute('position', new Float32BufferAttribute(burstPositions, 3));
  burstGeometry.setAttribute('color', new Float32BufferAttribute(burstColors, 3));
  const burstPoints = new Points(burstGeometry, new PointsMaterial({
    size: .105,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: 2,
    toneMapped: false,
  }));
  burstPoints.visible = false;
  burstPoints.renderOrder = 40;
  root.add(burstPoints);
  const celebrationFx = {
    points: burstPoints,
    positions: burstPositions,
    colors: burstColors,
    velocities: new Float32Array(burstCount * 3),
    life: 0,
    strength: 1,
    count: burstCount,
  };

  // Three physical odometers form one quiet instrument row.
  root.add(roundedBox(3.60, .72, .25, .085, darkMat, 0, 2.25, 1.16));
  root.add(box(3.34, .035, .29, brassMat, 0, 2.57, 1.18));
  const counterDisplays = [];
  const counterSpecs = [
    { key: 'credits', label: 'КРЕДИТ', x: -1.12, value: 10 },
    { key: 'bet', label: 'СТАВКА', x: 0, value: 1 },
    { key: 'win', label: 'ВЫИГРЫШ', x: 1.12, value: 0 },
  ];
  for (const spec of counterSpecs) {
    const texture = counterTexture(spec.label, spec.value);
    const panel = new Mesh(new PlaneGeometry(1.02, .56), new MeshBasicMaterial({ map: texture, toneMapped: false }));
    panel.position.set(spec.x, 2.25, 1.315);
    root.add(panel);
    counterDisplays.push({ ...spec, texture, panel });
  }

  // Lower face from concept B: coin acceptor, an actual five-line vector display
  // and one unambiguous red spin button.
  root.add(roundedBox(3.58, 1.18, .20, .09, bodyMat, 0, 1.32, 1.08));
  const acceptorPlate = roundedBox(.68, .88, .09, .055, brassMat, -1.42, 1.40, 1.23);
  acceptorPlate.userData.action = 'coin'; root.add(acceptorPlate);
  const coinSlot = roundedBox(.14, .36, .045, .025, darkMat, -1.42, 1.57, 1.305);
  coinSlot.userData.action = 'coin'; root.add(coinSlot);
  const receiptSlot = roundedBox(.48, .075, .045, .018, darkMat, -1.42, 1.17, 1.305);
  root.add(receiptSlot);
  root.add(createRivet(darkMat, -1.67, 1.75, 1.3, .70), createRivet(darkMat, -1.17, 1.75, 1.3, .70));

  const paperTexture = receiptTexture();
  const receipt = new ReceiptPaper(paperTexture, {
    width: .48,
    // Denser ribbon mesh keeps broad bends smooth without the cloth-like
    // creases produced by the former five-column, four-centimetre grid.
    columns: 9,
    segmentLength: .025,
    floorY: -1.12,
    textureHeight: RECEIPT_TEXTURE_HEIGHT,
    pixelsPerUnit: RECEIPT_PIXELS_PER_UNIT,
  });
  receipt.mesh.position.set(-1.42, 1.15, 1.34);
  root.add(receipt.mesh);

  const lineDisplayFrame = roundedBox(2.18, .66, .11, .06, brassMat, .08, 1.37, 1.23);
  const lineDisplay = new Mesh(new PlaneGeometry(2.02, .51), new MeshBasicMaterial({
    map: paylineDisplayTexture(paylines),
    toneMapped: false,
  }));
  lineDisplay.position.set(.08, 1.37, 1.305);
  root.add(lineDisplayFrame, lineDisplay);

  const physicalButtonBase = roundedBox(.58, .58, .12, .07, brassMat, 1.48, 1.43, 1.25);
  const physicalButton = roundedBox(.42, .42, .15, .06, redGlowMat.clone(), 1.48, 1.43, 1.38);
  physicalButton.userData.action = 'spin'; root.add(physicalButtonBase, physicalButton);

  const ventBack = roundedBox(2.56, .28, .08, .035, darkMat, 0, .76, 1.15);
  root.add(ventBack);
  for (let index = -7; index <= 7; index += 1) root.add(box(.055, .17, .035, bodyLightMat, index * .15, .76, 1.205));

  const coinSystem = new CoinFX(root, coinSlot.position);

  // Separate external lever with an obvious bearing and a visible air gap.
  const mountPlate = new Mesh(new CylinderGeometry(.37, .37, .10, 36), darkMat);
  mountPlate.rotation.z = Math.PI / 2; mountPlate.position.set(2.12, 2.78, .42); root.add(mountPlate);
  const axleHousing = new Mesh(new CylinderGeometry(.25, .25, .56, 36), brassMat);
  axleHousing.rotation.z = Math.PI / 2; axleHousing.position.set(2.38, 2.78, .42); root.add(axleHousing);
  const lever = new Group();
  lever.position.set(2.70, 2.78, .42);
  const hub = new Mesh(new CylinderGeometry(.29, .29, .20, 36), brassMat);
  hub.rotation.z = Math.PI / 2; hub.userData.action = 'spin'; lever.add(hub);
  const hubInner = new Mesh(new CylinderGeometry(.16, .16, .23, 36), darkMat);
  hubInner.rotation.z = Math.PI / 2; hubInner.userData.action = 'spin'; lever.add(hubInner);
  const arm = new Mesh(new CylinderGeometry(.05, .068, 1.28, 18), brassMat);
  arm.position.y = .69; arm.userData.action = 'spin'; lever.add(arm);
  const handle = roundedBox(.30, .54, .30, .09, redMat, 0, 1.43, 0);
  handle.userData.action = 'spin'; lever.add(handle);
  const handleLight = new PointLight(C.redBright, .35, 1.35, 2); handleLight.position.y = 1.43; lever.add(handleLight);
  root.add(lever);

  // Quiet integrated status lights replace the former luminous side rails.
  titleGlow.userData.idleIntensity = .12;
  titleGlow.userData.celebrationScale = .30;
  physicalButton.userData.idleIntensity = .72;
  const winLights = [titleGlow, physicalButton];
  redLamp.userData.idleIntensity = .12;
  greenLamp.userData.idleIntensity = .34;
  winLights.push(redLamp, greenLamp);

  const oracle = {
    marqueeTexture: titleTexture,
    displayTexture,
    displayPanel,
    displayBaseX: displayPanel.position.x,
    lamps: { red: redLamp, green: greenLamp },
    tone: 'sleep',
    changedAt: performance.now(),
    lastQuipAt: performance.now(),
    quipIndex: 0,
    idleQuips: ['ОЖИДАЮ ПЕРВИЧКУ', 'РАСХОЖДЕНИЕ 0,01', 'ПЕЧАТЬ ГДЕ?', 'КВАРТАЛ САМ НЕ ЗАКРОЕТСЯ'],
    receipt,
  };

  // Minimal front fasteners, all aligned to panel boundaries.
  for (const x of [-1.86, 1.86]) for (const y of [.82, 2.65, 4.66]) root.add(createRivet(brassMat, x, y, 1.16, .72));

  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = object.castShadow !== false;
      object.receiveShadow = true;
    }
  });

  // Keep pointer picking cheap: the cabinet contains hundreds of meshes, but
  // only these few parts can actually be pressed or pulled.
  const interactives = [];
  root.traverse((object) => {
    if (object.userData.action) interactives.push(object);
  });

  return {
    root, reels, lever, physicalButton, coinSlot, coinSystem, counterDisplays,
    paylineLights, paylineVisuals, symbolHighlights, celebrationFx, winLights,
    panoramicGlass, lineDisplay, oracle, interactives,
  };
}

export function updateCabinetCounters(machine, { credits, bet = 1, win = 0 }) {
  const values = { credits, bet, win };
  machine.counterDisplays.forEach((counter) => {
    const next = values[counter.key];
    if (counter.currentValue === next) return;
    counter.currentValue = next;
    counter.texture.userData.redraw(next);
  });
}

export function setCabinetOracle(machine, { message, tone = 'idle', receipt } = {}) {
  const oracle = machine.oracle;
  if (!oracle) return;
  oracle.tone = tone;
  oracle.changedAt = performance.now();
  if (tone === 'idle') oracle.lastQuipAt = oracle.changedAt;
  oracle.marqueeTexture.userData.redraw(tone === 'jackpot' ? 'ДИРЕКТОР ОДОБРИЛ' : 'СЧЁТМАШ–83', tone);
  if (message) oracle.displayTexture.userData.redraw(message, tone);
  if (receipt?.reset) {
    oracle.receipt.texture.userData.reset();
    oracle.receipt.reset();
  } else if (receipt?.text) {
    oracle.receipt.targetLength = oracle.receipt.texture.userData.append({
      text: receipt.text,
      approved: receipt.approved !== false,
      jackpot: receipt.jackpot === true,
    });
    oracle.receipt.mesh.visible = true;
  }
}

export function updateCabinetOracle(machine, now, dt, reducedMotion = false) {
  const oracle = machine.oracle;
  if (!oracle) return;
  const elapsed = now - oracle.changedAt;
  if (oracle.tone === 'idle' && now - oracle.lastQuipAt > 6200) {
    const message = oracle.idleQuips[oracle.quipIndex % oracle.idleQuips.length];
    oracle.quipIndex += 1;
    oracle.lastQuipAt = now;
    oracle.displayTexture.userData.redraw(message, 'idle');
  }
  const pulse = .5 + Math.sin(now * .011) * .5;
  let red = .12;
  let green = .30 + pulse * .18;

  if (oracle.tone === 'sleep') {
    red = .06; green = .09 + pulse * .05;
  } else if (oracle.tone === 'working') {
    const phase = Math.floor(elapsed / 145) % 2;
    red = phase ? .18 : 1.65;
    green = phase ? 1.9 : .16;
  } else if (oracle.tone === 'approve') {
    red = .08; green = 2.4 + pulse * .7;
  } else if (oracle.tone === 'reject') {
    red = 2.5 + pulse * .8; green = .05;
  } else if (oracle.tone === 'jackpot') {
    red = 1.9 + pulse * 1.1; green = 2.3 + (1 - pulse) * 1.2;
  }
  oracle.lamps.red.material.emissiveIntensity = red;
  oracle.lamps.green.material.emissiveIntensity = green;

  const workingJitter = oracle.tone === 'working' && !reducedMotion ? Math.sin(now * .09) * .004 : 0;
  oracle.displayPanel.position.x = oracle.displayBaseX + workingJitter;

  const paper = oracle.receipt;
  paper.update(now, dt, reducedMotion);
}

export function createWorkshop(scene) {
  scene.add(new AmbientLight(0x9caaa3, .40));

  const key = new SpotLight(0xffd29a, 29, 24, Math.PI / 5.4, .62, 1.45);
  key.position.set(-4.8, 9, 7.5); key.target.position.set(0, 2.7, 0); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);
  const rim = new SpotLight(C.cyan, 11, 20, Math.PI / 5, .72, 1.6);
  rim.position.set(5.5, 7, -3); rim.target.position.set(0, 3, 0); scene.add(rim, rim.target);
  const red = new PointLight(C.redBright, 2.2, 8, 2); red.position.set(-4.5, 2.2, 2); scene.add(red);

  const floorMat = new MeshPhysicalMaterial({ color: 0x020403, roughness: .90, metalness: .10, clearcoat: .02 });
  const floor = new Mesh(new PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const stage = new Mesh(new CircleGeometry(4.9, 96), new MeshPhysicalMaterial({ color: 0x080d0a, roughness: .76, metalness: .14, clearcoat: .04 }));
  stage.rotation.x = -Math.PI / 2; stage.position.y = .012; stage.receiveShadow = true; scene.add(stage);
  const stageRing = new Mesh(new RingGeometry(4.55, 4.60, 96), new MeshBasicMaterial({ color: C.brass, transparent: true, opacity: .16, side: DoubleSide }));
  stageRing.rotation.x = -Math.PI / 2; stageRing.position.y = .02; scene.add(stageRing);

  const dust = createDust();
  scene.add(dust);
  return { dust, key, rim, red };
}

function createDust() {
  const count = 240;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - .5) * 13;
    positions[i * 3 + 1] = Math.random() * 8;
    positions[i * 3 + 2] = (Math.random() - .5) * 10;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({ color: C.amber, size: .018, transparent: true, opacity: .34, depthWrite: false });
  const points = new Points(geometry, material);
  points.userData.floatDust = true;
  return points;
}

export function setCabinetCelebration(machine, active, strength = 1) {
  machine.winLights.forEach((lamp, index) => {
    if (!lamp.material?.emissive) return;
    const idle = lamp.userData.idleIntensity ?? .35;
    const celebrationScale = lamp.userData.celebrationScale ?? 1;
    lamp.material.emissiveIntensity = active
      ? idle + (1.15 + strength * .50 + (index % 2) * .18) * celebrationScale
      : idle;
  });
}

export function setCabinetPaylines(machine, activeLines = [], pulse = 0) {
  const activeIds = new Set(activeLines.map((line) => line.id));
  machine.paylineVisuals.forEach((visual) => {
    const active = activeIds.has(visual.spec.id);
    visual.material.opacity = active ? .55 + pulse * .3 : 0;
    visual.lamps.forEach((lamp) => {
      lamp.material.emissiveIntensity = active ? 2.8 + pulse * 2.2 : .28;
    });
  });

  machine.symbolHighlights.flat().forEach(({ material, ringMaterial }) => {
    material.opacity = 0;
    ringMaterial.opacity = 0;
  });
  activeLines.forEach((line) => {
    line.rows.forEach((row, reelIndex) => {
      const cell = machine.symbolHighlights[reelIndex].find((item) => item.row === row);
      if (!cell) return;
      cell.material.color.setHex(line.symbolId === 'nuraliev' ? 0xffd45a : line.color);
      cell.material.opacity = line.symbolId === 'nuraliev' ? .10 + pulse * .14 : .05 + pulse * .1;
      if (line.symbolId === 'nuraliev') {
        cell.ringMaterial.opacity = .32 + pulse * .48;
        cell.jackpotRing.scale.setScalar(.96 + pulse * .10);
      }
    });
  });
}

export function triggerCabinetBurst(machine, strength = 1, palette = [C.amber, C.redBright, C.cyan]) {
  const fx = machine.celebrationFx;
  fx.life = 1;
  fx.strength = strength;
  fx.points.visible = true;
  fx.points.material.opacity = 1;
  const color = new Color();
  for (let index = 0; index < fx.count; index += 1) {
    const offset = index * 3;
    fx.positions[offset] = (Math.random() - .5) * 1.5;
    fx.positions[offset + 1] = 3.25 + Math.random() * .7;
    fx.positions[offset + 2] = 1.9 + Math.random() * .25;
    fx.velocities[offset] = (Math.random() - .5) * (2.6 + strength);
    fx.velocities[offset + 1] = 1.1 + Math.random() * (2.2 + strength * .8);
    fx.velocities[offset + 2] = .35 + Math.random() * 1.2;
    color.setHex(palette[index % palette.length]);
    fx.colors[offset] = color.r;
    fx.colors[offset + 1] = color.g;
    fx.colors[offset + 2] = color.b;
  }
  fx.points.geometry.attributes.position.needsUpdate = true;
  fx.points.geometry.attributes.color.needsUpdate = true;
}

export function updateCabinetBurst(machine, dt) {
  const fx = machine.celebrationFx;
  if (fx.life <= 0) return;
  fx.life = Math.max(0, fx.life - dt / (1.8 + fx.strength * .35));
  for (let index = 0; index < fx.count; index += 1) {
    const offset = index * 3;
    fx.positions[offset] += fx.velocities[offset] * dt;
    fx.positions[offset + 1] += fx.velocities[offset + 1] * dt;
    fx.positions[offset + 2] += fx.velocities[offset + 2] * dt;
    fx.velocities[offset] *= .985;
    fx.velocities[offset + 1] -= 3.2 * dt;
    fx.velocities[offset + 2] *= .98;
  }
  fx.points.geometry.attributes.position.needsUpdate = true;
  fx.points.material.opacity = Math.min(1, fx.life * 1.8);
  if (fx.life === 0) fx.points.visible = false;
}
