// Механика жетона перенесена из проекта «хватайка»:
// короткая дуга с кувырком, выравнивание перед прорезью и уход внутрь корпуса.
import {
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TorusGeometry,
} from 'three';

const DURATION = 1.15;
const RADIUS = .145;
const THICKNESS = .036;

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function coinFaceTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(98, 78, 10, 128, 128, 124);
  gradient.addColorStop(0, '#fff1a0');
  gradient.addColorStop(.42, '#e4aa32');
  gradient.addColorStop(.78, '#9d5f13');
  gradient.addColorStop(1, '#4d2b08');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 256);

  g.strokeStyle = '#ffe18a';
  g.lineWidth = 12;
  g.beginPath();
  g.arc(128, 128, 105, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#70400d';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(128, 128, 82, 0, Math.PI * 2);
  g.stroke();

  g.save();
  g.translate(128, 130);
  g.rotate(-.06);
  g.fillStyle = '#a5201d';
  g.strokeStyle = '#5b100f';
  g.lineWidth = 4;
  g.font = '900 84px Arial Black, Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.strokeText('1С', 0, 0);
  g.fillText('1С', 0, 0);
  g.restore();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class CoinFX {
  constructor(scene, slotPosition) {
    this.scene = scene;
    this.slot = slotPosition.clone();
    this.active = [];
    this.geometry = new CylinderGeometry(RADIUS, RADIUS, THICKNESS, 48);
    this.rimGeometry = new TorusGeometry(RADIUS * .81, RADIUS * .055, 8, 48);
    this.edgeMaterial = new MeshStandardMaterial({
      color: 0x9d6218,
      metalness: .92,
      roughness: .34,
    });
    this.faceMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      map: coinFaceTexture(),
      metalness: .78,
      roughness: .20,
      emissive: 0x2b1600,
      emissiveIntensity: .22,
    });
    this.rimMaterial = new MeshStandardMaterial({
      color: 0xffd15a,
      metalness: .94,
      roughness: .18,
    });
  }

  insert(now = performance.now(), onDone) {
    const token = new Group();
    token.name = 'animated-coin-token';
    const coin = new Mesh(this.geometry, [this.edgeMaterial, this.faceMaterial, this.faceMaterial]);
    coin.rotation.x = Math.PI / 2;
    coin.castShadow = true;
    const frontRim = new Mesh(this.rimGeometry, this.rimMaterial);
    frontRim.position.z = THICKNESS * .52;
    const backRim = frontRim.clone();
    backRim.position.z = -THICKNESS * .52;
    token.add(coin, frontRim, backRim);
    this.scene.add(token);
    this.active.push({ token, t: 0, startedAt: now, onDone, spin: 1.8 + Math.random() * .6 });
  }

  update(dt) {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const item = this.active[index];
      item.t += dt / DURATION;
      const t = Math.min(1, item.t);

      if (t < .58) {
        const k = smoothstep(t / .58);
        item.token.position.set(
          this.slot.x - .52 * (1 - k) + .08 * k,
          this.slot.y - .34 * (1 - k) + .09 * k + Math.sin(k * Math.PI) * .34,
          this.slot.z + .85 * (1 - k) + .28 * k,
        );
        item.token.rotation.set(
          k * Math.PI * (2.2 + item.spin * .2),
          k * Math.PI * (3.2 + item.spin),
          -.28 + k * Math.PI * .72,
        );
      } else if (t < .78) {
        const k = smoothstep((t - .58) / .20);
        item.token.position.set(
          this.slot.x + .08 * (1 - k),
          this.slot.y + .09 * (1 - k),
          this.slot.z + .28 * (1 - k) + .15 * k,
        );
        item.token.rotation.set(
          Math.PI * 2.65 * (1 - k),
          Math.PI * 4.95 * (1 - k) + Math.PI / 2 * k,
          Math.PI * .44 * (1 - k),
        );
      } else if (t < .85) {
        const k = (t - .78) / .07;
        item.token.position.set(
          this.slot.x + Math.sin(k * Math.PI) * .016,
          this.slot.y,
          this.slot.z + .15 + Math.sin(k * Math.PI) * .025,
        );
        item.token.rotation.set(0, Math.PI / 2, 0);
      } else {
        const k = smoothstep((t - .85) / .15);
        item.token.position.set(this.slot.x, this.slot.y, this.slot.z + .15 - .34 * k);
        item.token.rotation.set(0, Math.PI / 2, 0);
        item.token.scale.setScalar(1 - k * .10);
      }

      if (t >= 1) {
        this.scene.remove(item.token);
        this.active.splice(index, 1);
        item.onDone?.();
      }
    }
  }

  clear() {
    this.active.forEach(({ token }) => this.scene.remove(token));
    this.active.length = 0;
  }

  debug() {
    return {
      active: this.active.map(({ token, startedAt, t }) => ({
        position: token.position.toArray(),
        startedAt,
        progress: Math.min(1, t),
      })),
      resting: [],
    };
  }
}
