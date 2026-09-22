import './style.css';
import {
  CatmullRomCurve3,
  CanvasTexture,
  Color,
  FogExp2,
  MathUtils,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TextureLoader,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import { MachineAudio } from './audio.js';
import {
  PAYLINES,
  REEL_STRIPS,
  SYMBOLS,
  createReelTexture,
  createSymbolDataUrls,
  findStripIndex,
  setReelTexturePosition,
  symbolById,
} from './symbols.js';
import {
  chooseStopIndices,
  createSeededRng,
  evaluateStops,
  getMathProfileReport,
  visibleSymbolAt,
} from './game-math.js';
import {
  createCabinet,
  createWorkshop,
  setCabinetCelebration,
  setCabinetOracle,
  setCabinetPaylines,
  triggerCabinetBurst,
  updateCabinetBurst,
  updateCabinetCounters,
  updateCabinetOracle,
} from './machine.js';

const STORAGE_KEY = 'schetmash83-state-v1';
const seedBuffer = new Uint32Array(1);
globalThis.crypto?.getRandomValues?.(seedBuffer);
const sessionRng = createSeededRng(seedBuffer[0] || (Date.now() ^ 0x83));
const DEFAULT_STATE = {
  credits: 10,
  bestWin: 0,
  spins: 0,
  totalWon: 0,
  sound: true,
  shake: true,
  freePlay: false,
  winRate: 18,
  bigWinShare: 6,
  graphicsQuality: 'auto',
  bloom: true,
  showFps: false,
};
const GRAPHICS_QUALITIES = new Set(['auto', 'cinematic', 'balanced', 'economy']);

const ui = Object.fromEntries([
  'credits', 'win', 'status', 'spinMeter', 'spinBtn', 'coinBtn', 'startBtn',
  'paytableBtn', 'helpBtn', 'settingsBtn', 'payoutPanel', 'settingsPanel', 'helpPanel',
  'payoutRows', 'soundToggle', 'shakeToggle', 'freeToggle', 'resetBtn', 'toast', 'buildTag',
  'winRateRange', 'winRateValue', 'bigWinRange', 'bigWinValue', 'mathSummary', 'tourCaption',
  'graphicsQuality', 'bloomToggle', 'fpsToggle', 'graphicsSummary', 'fpsCounter',
].map((id) => [id, document.getElementById(id)]));

let stored = {};
try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { stored = {}; }
const state = { ...DEFAULT_STATE, ...stored, credits: Math.max(0, Number(stored.credits ?? DEFAULT_STATE.credits)) };
state.winRate = MathUtils.clamp(Number(state.winRate) || DEFAULT_STATE.winRate, 8, 100);
state.bigWinShare = MathUtils.clamp(Number(state.bigWinShare) || DEFAULT_STATE.bigWinShare, 1, 20);
state.graphicsQuality = GRAPHICS_QUALITIES.has(state.graphicsQuality) ? state.graphicsQuality : 'auto';
state.bloom = stored.bloom === undefined ? true : Boolean(stored.bloom);
state.showFps = Boolean(stored.showFps);
const audio = new MachineAudio();
audio.setEnabled(state.sound);

const scene = new Scene();
scene.background = new Color(0x030806);
scene.fog = new FogExp2(0x030806, .028);

let compactView = innerWidth / innerHeight < .72;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionPreference.matches;
const lowPowerDevice = (navigator.deviceMemory && navigator.deviceMemory <= 4)
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
if (stored.bloom === undefined && lowPowerDevice) state.bloom = false;

function graphicsProfile() {
  if (state.graphicsQuality === 'cinematic') return {
    label: 'КИНО', dpr: compactView ? 1.55 : 2, minDpr: compactView ? 1.35 : 1.5, samples: 4, shadows: true, dust: 1,
  };
  if (state.graphicsQuality === 'balanced') return {
    label: 'БАЛАНС', dpr: compactView ? 1.25 : 1.5, minDpr: 1.25, samples: 2, shadows: true, dust: .72,
  };
  if (state.graphicsQuality === 'economy') return {
    label: 'ЭКОНОМ', dpr: 1, minDpr: 1, samples: 0, shadows: false, dust: .34,
  };
  return {
    label: 'АВТО',
    dpr: compactView ? 1.25 : lowPowerDevice ? 1.2 : 1.5,
    minDpr: 1,
    samples: lowPowerDevice ? 0 : 2,
    shadows: !lowPowerDevice,
    dust: lowPowerDevice ? .45 : .82,
  };
}

function pixelRatioFor(profile = graphicsProfile()) {
  return Math.min(profile.dpr, Math.max(devicePixelRatio, profile.minDpr));
}

const camera = new PerspectiveCamera(40, innerWidth / innerHeight, .05, 60);
camera.position.set(compactView ? 4.6 : 3.5, compactView ? 3.9 : 3.7, compactView ? 14.7 : 11.5);

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatioFor());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = graphicsProfile().shadows;
renderer.shadowMap.type = 2;
renderer.outputColorSpace = 'srgb';
renderer.toneMapping = 4;
renderer.toneMappingExposure = .84;
document.getElementById('scene').append(renderer.domElement);

const pmrem = new PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
pmrem.dispose();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let composerSamples = 0;
const BLOOM_BASE = .31;
const bloom = new UnrealBloomPass(new Vector2(innerWidth, innerHeight), BLOOM_BASE, .27, 1.17);
bloom.enabled = state.bloom;
composer.addPass(bloom);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(compactView ? .42 : 0, 2.9, 0);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.enablePan = false;
controls.minDistance = compactView ? 13.2 : 6.8;
controls.maxDistance = compactView ? 18 : 13.5;
controls.minPolarAngle = Math.PI * .23;
controls.maxPolarAngle = Math.PI * .54;
controls.minAzimuthAngle = -Math.PI * .42;
controls.maxAzimuthAngle = Math.PI * .42;
controls.autoRotate = false;
controls.enabled = false;

const workshop = createWorkshop(scene);
const textureLoader = new TextureLoader();
const bootStatus = document.querySelector('.boot-status');
const assetIssues = [];
const assetSpecs = SYMBOLS.map((symbol) => ({
  url: `./art/${symbol.art}`,
  label: symbol.short,
  width: 512,
  height: 512,
}));
let loadedAssets = 0;

function fallbackTexture({ label, width, height }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#10251d';
  g.fillRect(0, 0, width, height);
  g.strokeStyle = '#d19b36';
  g.lineWidth = Math.max(4, width * .012);
  g.strokeRect(width * .04, height * .07, width * .92, height * .86);
  g.fillStyle = '#f0d9a0';
  g.font = `700 ${Math.max(24, width * .08)}px "Arial Narrow", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, width / 2, height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

async function loadAsset(spec) {
  try {
    return await Promise.race([
      textureLoader.loadAsync(spec.url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('тайм-аут 12 с')), 12000)),
    ]);
  } catch (error) {
    assetIssues.push(`${spec.label}: ${error.message}`);
    return fallbackTexture(spec);
  } finally {
    loadedAssets += 1;
    bootStatus.textContent = `ЗАГРУЗКА КОНТУРОВ · ${loadedAssets}/${assetSpecs.length}`;
  }
}

const symbolTextures = await Promise.all(assetSpecs.map(loadAsset));
SYMBOLS.forEach((symbol, index) => { symbol.image = symbolTextures[index].image; });
const reelTextures = REEL_STRIPS.map((strip) => createReelTexture(strip));
const machine = createCabinet({ reelTextures, paylines: PAYLINES });
scene.add(machine.root);
setCabinetCelebration(machine, false);
setCabinetPaylines(machine, []);
setCabinetOracle(machine, { message: 'ОЖИДАНИЕ ОПЕРАТОРА', tone: 'sleep', receipt: null });

const reelPositions = [6, 7, 11];
machine.reels.forEach((reel, i) => {
  const strip = REEL_STRIPS[i];
  setReelTexturePosition(reel.texture, reelPositions[i], strip.length);
  reel.drum.rotation.x = reelPositions[i] * Math.PI * 2 / strip.length;
});

let mode = 'attract';
let spinData = null;
let currentWin = 0;
let celebrateUntil = 0;
let celebrationStartedAt = 0;
let jackpotBurstAt = 0;
let winningLines = [];
let toastTimer = 0;
let leverStart = -1;
let leverDrag = null;
let lastFrame = performance.now();
let fpsWindowStarted = performance.now();
let fpsFrames = 0;
let fpsValue = 0;
let bootReleased = false;
const raycaster = new Raycaster();
const pointer = new Vector2();
const settledCamera = new Vector3(compactView ? 4.4 : 2.7, compactView ? 3.75 : 3.55, compactView ? 14.5 : 11.4);
const settledTarget = new Vector3(compactView ? .42 : 0, 2.85, 0);
const INTRO_LOOP_MS = 18000;
const INTRO_SETTLE_MS = 1350;
const INTRO_CAPTIONS = [
  'УЗЕЛ 01 · БАРАБАННЫЙ РЕГИСТР',
  'УЗЕЛ 02 · ПЕЧАТЬ ОПЕРАЦИЙ',
  'КОНТУР 03 · ВЫЧИСЛИТЕЛЬ ВЫПЛАТ',
  'УЗЕЛ 04 · РЫЧАГ РАСЧЁТА',
  'КОНТУР 05 · СИГНАЛИЗАЦИЯ',
  'УЗЕЛ 06 · ЖЕТОННЫЙ ПРИЁМНИК',
];
let introStartedAt = performance.now();
let cameraTransition = null;
let introPositionCurve;
let introTargetCurve;
const panels = [...document.querySelectorAll('.drawer, .modal-wrap')];
let panelReturnFocus = null;
let pageVisible = !document.hidden;

function rebuildIntroCameraPath() {
  const positions = compactView
    ? [
        [-3.0, 4.8, 14.8],
        [-2.2, 2.7, 13.6],
        [.6, 5.0, 14.1],
        [4.5, 4.0, 15.0],
        [4.2, 2.5, 15.2],
        [-1.6, 2.2, 13.8],
      ]
    : [
        [-5.8, 4.65, 10.3],
        [-4.1, 2.55, 8.35],
        [.2, 4.9, 9.15],
        [5.4, 4.0, 9.2],
        [5.8, 2.3, 10.4],
        [-2.9, 2.1, 8.8],
      ];
  const targets = compactView
    ? [
        [.1, 3.55, .9],
        [-.25, 1.7, 1.05],
        [.35, 3.7, 1.05],
        [1.1, 3.35, 1.0],
        [1.25, 2.25, 1.05],
        [-.15, 1.45, 1.0],
      ]
    : [
        [-.4, 3.6, .9],
        [-.85, 1.65, 1.05],
        [0, 3.65, 1.05],
        [1.1, 3.4, 1.0],
        [1.35, 2.4, 1.05],
        [-.9, 1.4, 1.0],
      ];
  introPositionCurve = new CatmullRomCurve3(positions.map((point) => new Vector3(...point)), true, 'catmullrom', .34);
  introTargetCurve = new CatmullRomCurve3(targets.map((point) => new Vector3(...point)), true, 'catmullrom', .4);
}

function settleCameraImmediately() {
  cameraTransition = null;
  camera.position.copy(settledCamera);
  controls.target.copy(settledTarget);
  camera.lookAt(settledTarget);
  controls.enabled = true;
}

function updateCinematicCamera(now) {
  if (mode === 'attract') {
    controls.enabled = false;
    if (reducedMotion) {
      camera.position.set(compactView ? 3.6 : 2.6, compactView ? 4.05 : 3.75, compactView ? 15.1 : 11.8);
      controls.target.set(compactView ? .35 : 0, 2.85, .7);
    } else {
      const elapsed = ((now - introStartedAt) % INTRO_LOOP_MS + INTRO_LOOP_MS) % INTRO_LOOP_MS;
      const progress = elapsed / INTRO_LOOP_MS;
      introPositionCurve.getPointAt(progress, camera.position);
      introTargetCurve.getPointAt(progress, controls.target);
      const captionIndex = Math.floor(progress * INTRO_CAPTIONS.length) % INTRO_CAPTIONS.length;
      if (ui.tourCaption.dataset.index !== String(captionIndex)) {
        ui.tourCaption.dataset.index = String(captionIndex);
        ui.tourCaption.textContent = INTRO_CAPTIONS[captionIndex];
      }
    }
    camera.lookAt(controls.target);
    return true;
  }

  if (!cameraTransition) return false;
  const progress = Math.min(1, (now - cameraTransition.startedAt) / INTRO_SETTLE_MS);
  const eased = 1 - (1 - progress) ** 4;
  camera.position.lerpVectors(cameraTransition.fromPosition, settledCamera, eased);
  controls.target.lerpVectors(cameraTransition.fromTarget, settledTarget, eased);
  camera.lookAt(controls.target);
  if (progress >= 1) settleCameraImmediately();
  return true;
}

rebuildIntroCameraPath();

panels.forEach((panel) => { panel.inert = true; });

buildPayoutTable();
syncUi();
if (assetIssues.length) setStatus(`РЕЗЕРВНЫЕ ТЕКСТУРЫ · ${assetIssues.length}`, 'error');
ui.buildTag.querySelector('span').textContent = __BUILD_INFO__;
ui.soundToggle.checked = state.sound;
ui.shakeToggle.checked = state.shake;
ui.freeToggle.checked = state.freePlay;

function syncMathSettings() {
  ui.winRateRange.value = String(state.winRate);
  ui.bigWinRange.value = String(state.bigWinShare);
  ui.winRateValue.textContent = `${state.winRate}%`;
  ui.bigWinValue.textContent = `${state.bigWinShare}%`;
  const report = getMathProfileReport({
    winRate: state.winRate / 100,
    bigWinShare: state.bigWinShare / 100,
  });
  const actualWinRate = (1 - report.categories.loss.configuredProbability) * 100;
  const largePerSpin = actualWinRate * state.bigWinShare / 100;
  ui.mathSummary.textContent = `РАСЧЁТ: ${actualWinRate.toFixed(0)}% выигрышных вращений · крупные ${largePerSpin.toFixed(1)}% всех вращений`;
}

syncMathSettings();

function applyGraphicsSettings({ notify = false } = {}) {
  const profile = graphicsProfile();
  const ratio = pixelRatioFor(profile);
  const samples = Math.min(profile.samples, renderer.capabilities.maxSamples || 0);
  renderer.setPixelRatio(ratio);
  renderer.setSize(innerWidth, innerHeight);
  if (samples !== composerSamples) {
    composerSamples = samples;
    composer.renderTarget1.samples = samples;
    composer.renderTarget2.samples = samples;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
  }
  composer.setPixelRatio(ratio);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.needsUpdate = true;
  bloom.enabled = state.bloom;
  workshop.dust.visible = profile.dust > 0;
  workshop.dust.material.opacity = .34 * profile.dust;

  ui.graphicsQuality.value = state.graphicsQuality;
  ui.bloomToggle.checked = state.bloom;
  ui.fpsToggle.checked = state.showFps;
  ui.fpsCounter.classList.toggle('visible', state.showFps);
  ui.fpsCounter.setAttribute('aria-hidden', String(!state.showFps));
  ui.graphicsSummary.textContent = `${profile.label} · DPR ${ratio.toFixed(2)} · AA ${samples ? `${samples}X` : 'БАЗОВОЕ'} · ТЕНИ ${profile.shadows ? 'ВКЛ' : 'ВЫКЛ'} · СВЕЧЕНИЕ ${state.bloom ? 'ВКЛ' : 'ВЫКЛ'}`;
  fpsWindowStarted = performance.now();
  fpsFrames = 0;
  fpsValue = 0;
  if (notify) showToast(`ГРАФИКА · ${profile.label}`);
}

function updateFpsCounter(now, frameDeltaMs) {
  if (!state.showFps) return;
  const sample = 1000 / Math.max(1, frameDeltaMs);
  fpsValue = fpsValue ? MathUtils.lerp(fpsValue, sample, .12) : sample;
  fpsFrames += 1;
  const elapsed = now - fpsWindowStarted;
  if (elapsed < 500) return;
  const frameTime = 1000 / Math.max(.1, fpsValue);
  ui.fpsCounter.querySelector('strong').textContent = String(Math.round(fpsValue));
  ui.fpsCounter.querySelector('small').textContent = `${frameTime.toFixed(1)} MS`;
  ui.fpsCounter.dataset.tone = fpsValue < 30 ? 'bad' : fpsValue < 50 ? 'warn' : 'good';
  fpsWindowStarted = now;
  fpsFrames = 0;
}

applyGraphicsSettings();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncUi() {
  ui.credits.textContent = state.freePlay ? '∞' : state.credits;
  ui.win.textContent = currentWin;
  updateCabinetCounters(machine, {
    credits: state.freePlay ? 'FREE' : state.credits,
    bet: 1,
    win: currentWin,
  });
}

function setStatus(text, tone = '') {
  ui.status.textContent = text;
  ui.status.className = `status ${tone}`.trim();
}

function bumpCounter(element) {
  const node = element.closest('.counter');
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
}

function showToast(text, big = false, duration = 1900) {
  clearTimeout(toastTimer);
  ui.toast.textContent = text;
  ui.toast.className = `toast hud show${big ? ' big' : ''}`;
  toastTimer = setTimeout(() => { ui.toast.className = 'toast hud'; }, duration);
}

function hideToast() {
  clearTimeout(toastTimer);
  ui.toast.textContent = '';
  ui.toast.className = 'toast hud';
}

function buildPayoutTable() {
  const urls = createSymbolDataUrls();
  const rows = [...SYMBOLS].sort((a, b) => b.payout - a.payout);
  const lineGuide = PAYLINES.map((line) => {
    const color = `#${line.color.toString(16).padStart(6, '0')}`;
    const points = line.rows.map((row, index) => `${5 + index * 25},${14 + row * 10}`).join(' ');
    return `
      <div class="payline-guide-item" style="--payline-color:${color}">
        <svg viewBox="0 0 60 28" aria-hidden="true">
          <polyline points="${points}" />
          ${line.rows.map((row, index) => `<circle cx="${5 + index * 25}" cy="${14 + row * 10}" r="2.6" />`).join('')}
        </svg>
        <span><b>ЛИНИЯ ${line.id}</b><small>${line.name}</small></span>
      </div>`;
  }).join('');
  ui.payoutRows.innerHTML = `
    <div class="payline-guide">
      <div class="payline-guide-title"><b>5 ЛИНИЙ АКТИВНЫ</b><span>одна ставка включает все маршруты</span></div>
      ${lineGuide}
    </div>
  ` + rows.map((symbol) => `
    <div class="payout-row">
      <img class="payout-icon" src="${urls.get(symbol.id)}" alt="" />
      <span><b>${symbol.name}</b><small>${symbol.jackpot ? 'главный символ · суперджекпот' : symbol.wild ? 'заменяет любой знак' : 'три на любой линии'}</small></span>
      <strong class="payout-value">×${symbol.payout}</strong>
    </div>
  `).join('');
}

function startGame({ immediate = false } = {}) {
  if (mode !== 'attract') return;
  const fromPosition = camera.position.clone();
  const fromTarget = controls.target.clone();
  mode = 'idle';
  document.body.classList.remove('attract-mode');
  controls.autoRotate = false;
  if (immediate || reducedMotion) {
    settleCameraImmediately();
  } else {
    cameraTransition = { startedAt: performance.now(), fromPosition, fromTarget };
    controls.enabled = false;
  }
  audio.ensure();
  audio.relay(2);
  setCabinetOracle(machine, { message: 'СМЕНА ОТКРЫТА', tone: 'idle', receipt: null });
  setStatus('АППАРАТ ГОТОВ · ПОТЯНИТЕ РЫЧАГ');
}

function addCoin() {
  startGame();
  if (mode === 'spinning') return;
  setCabinetOracle(machine, { message: 'ПРОВЕРКА ЖЕТОНА', tone: 'working', receipt: null });
  setStatus('ЖЕТОН НАПРАВЛЕН В ПРИЁМНИК…');
  machine.coinSystem.insert(performance.now(), () => {
    state.credits += 1;
    persist(); syncUi(); audio.coin();
    audio.relay(1);
    setCabinetOracle(machine, { message: 'ЖЕТОН ПРИНЯТ', tone: 'approve', receipt: null });
    bumpCounter(ui.credits);
    showToast('ЖЕТОН ПРИНЯТ · +1 КРЕДИТ');
    if (mode !== 'spinning') setStatus('КРЕДИТ ЗАГРУЖЕН · МОЖНО КРУТИТЬ', 'win');
  });
}

function selectStopIndices() {
  if (import.meta.env.DEV && window.__slotForceResult?.length === 3) {
    const forced = window.__slotForceResult;
    window.__slotForceResult = null;
    return forced.map((id, reelIndex) => findStripIndex(symbolById(id).id, reelPositions[reelIndex], REEL_STRIPS[reelIndex]));
  }
  return chooseStopIndices(sessionRng, {
    winRate: state.winRate / 100,
    bigWinShare: state.bigWinShare / 100,
  });
}

function spin() {
  startGame();
  if (mode === 'spinning') return false;
  closePanels(false);
  if (!state.freePlay && state.credits < 1) {
    audio.lose();
    setCabinetOracle(machine, { message: 'ТРЕБУЕТСЯ ЖЕТОН', tone: 'reject', receipt: null });
    setStatus('НЕТ КРЕДИТА · ЗАГРУЗИТЕ ЖЕТОН [M]', 'error');
    showToast('ТРЕБУЕТСЯ ЖЕТОН');
    ui.coinBtn.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)' }, { transform: 'translateY(0)' }], { duration: 320, iterations: 2 });
    return false;
  }

  if (!state.freePlay) state.credits -= 1;
  state.spins += 1;
  currentWin = 0;
  persist(); syncUi();
  mode = 'spinning';
  document.body.classList.add('spinning');
  ui.spinBtn.disabled = true;
  setStatus('ИДЁТ РАСЧЁТ КВАРТАЛА…');
  audio.lever(); audio.startMotor();
  leverStart = performance.now();
  setCabinetCelebration(machine, false);
  setCabinetOracle(machine, { message: 'СВЕРКА РЕГИСТРОВ', tone: 'working', receipt: null });
  winningLines = [];
  celebrationStartedAt = 0;
  jackpotBurstAt = 0;
  setCabinetPaylines(machine, []);
  bloom.strength = BLOOM_BASE;
  bloom.radius = .27;

  const stopIndices = selectStopIndices();
  const now = performance.now();
  const motionScale = reducedMotion ? .62 : 1;
  const reels = machine.reels.map((reel, index) => {
    const strip = REEL_STRIPS[index];
    const current = reelPositions[index];
    const currentIndex = Math.round(current) % strip.length;
    const wantedIndex = stopIndices[index];
    const delta = (wantedIndex - currentIndex + strip.length) % strip.length;
    const turns = 4 + index;
    return {
      start: current,
      target: current + turns * strip.length + delta,
      startedAt: now + index * 80 * motionScale,
      duration: (1700 + index * 560) * motionScale,
      stopped: false,
    };
  });
  spinData = { stopIndices, reels, startedAt: now, completed: false };
  return true;
}

function reelMotion(raw, index) {
  if (reducedMotion) return { deceleration: 1 - Math.pow(1 - raw, 2), recoil: 0, settle: raw };
  // Непрерывное физичное торможение: скорость плавно стремится к нулю.
  const deceleration = 1 - Math.pow(1 - raw, 2.7);

  // В конце механизм слегка перекатывается через фиксатор и мягко возвращается.
  const settle = MathUtils.clamp((raw - .72) / .28, 0, 1);
  const envelope = Math.pow(Math.sin(settle * Math.PI), 2) * (1 - settle);
  const recoil = Math.sin(settle * Math.PI * 3) * envelope * (.14 - index * .015);
  return { deceleration, recoil, settle };
}

function updateSpin(now) {
  if (!spinData) return;
  let allStopped = true;
  spinData.reels.forEach((motion, index) => {
    const strip = REEL_STRIPS[index];
    const raw = MathUtils.clamp((now - motion.startedAt) / motion.duration, 0, 1);
    const { deceleration, recoil, settle } = reelMotion(raw, index);
    const position = MathUtils.lerp(motion.start, motion.target, deceleration) + recoil;
    reelPositions[index] = position;
    setReelTexturePosition(machine.reels[index].texture, position, strip.length);
    machine.reels[index].drum.rotation.x = position * Math.PI * 2 / strip.length;
    const settleTilt = Math.sin(settle * Math.PI * 3) * Math.pow(Math.sin(settle * Math.PI), 2) * .007;
    machine.reels[index].group.rotation.z = Math.sin(position * 1.8) * .0025 * (1 - raw) + settleTilt;
    if (raw < 1) allStopped = false;
    if (raw >= 1 && !motion.stopped) {
      motion.stopped = true;
      reelPositions[index] = motion.target;
      setReelTexturePosition(machine.reels[index].texture, motion.target, strip.length);
      audio.reelStop(index);
      setCabinetOracle(machine, { message: `РЕГИСТР ${index + 1} ИЗ 3`, tone: 'working' });
      const stoppedIndex = ((Math.round(motion.target) % strip.length) + strip.length) % strip.length;
      machine.reels[index].card.material.color.setHex(strip[stoppedIndex] === 'nuraliev' ? 0xffd45a : 0xffffff);
      setTimeout(() => { machine.reels[index].card.material.color.setHex(0xc8bb98); }, 150);
    }
  });
  const totalDuration = spinData.reels.at(-1).startedAt + spinData.reels.at(-1).duration - spinData.startedAt;
  ui.spinMeter.style.width = `${MathUtils.clamp((now - spinData.startedAt) / totalDuration, 0, 1) * 100}%`;

  if (allStopped && !spinData.completed) {
    spinData.completed = true;
    finishSpin();
  }
}

function visibleSymbol(reelIndex, row) {
  return visibleSymbolAt(reelPositions, reelIndex, row);
}

function evaluatePaylines() {
  return evaluateStops(reelPositions).lineWins;
}

function finishSpin() {
  const lineWins = evaluatePaylines();
  const totalPayout = lineWins.reduce((sum, line) => sum + line.payout, 0);
  audio.stopMotor();
  mode = 'idle';
  document.body.classList.remove('spinning');
  ui.spinBtn.disabled = false;
  ui.spinMeter.style.width = '0%';
  spinData = null;

  if (totalPayout > 0) {
    state.credits += totalPayout;
    state.totalWon += totalPayout;
    state.bestWin = Math.max(state.bestWin, totalPayout);
    currentWin = totalPayout;
    ui.win.textContent = totalPayout;
    bumpCounter(ui.win); bumpCounter(ui.credits);
    const primary = lineWins.reduce((best, line) => line.payout > best.payout ? line : best);
    const nuralievJackpot = lineWins.some((line) => line.symbolId === 'nuraliev');
    const name = symbolById(primary.symbolId).name.toUpperCase();
    const singleLabel = primary.pair ? `ПАРА 1С · ${primary.name}` : `${primary.name} · ${name}`;
    const label = lineWins.length > 1
      ? `${lineWins.length} ЛИНИИ · +${totalPayout} КРЕДИТОВ`
      : `${singleLabel} · +${totalPayout} КРЕДИТОВ`;
    setStatus(`ВЫПЛАТА УТВЕРЖДЕНА · ${label}`, 'win');
    // Нуралиеву не нужен экранный баннер: верхняя физическая вывеска,
    // лампы, счётчик и особая печать уже разыгрывают суперджекпот внутри мира.
    if (!nuralievJackpot) {
      showToast(totalPayout >= 100 ? `ДЖЕКПОТ · ${label}` : label, totalPayout >= 40, totalPayout >= 100 ? 3600 : 2400);
    } else {
      hideToast();
    }
    audio.win(totalPayout, nuralievJackpot);
    audio.receipt(true);
    setCabinetOracle(machine, {
      message: nuralievJackpot ? 'ВЫПЛАТА РАЗРЕШЕНА' : 'ДОКУМЕНТ ПРОВЕДЁН',
      tone: nuralievJackpot ? 'jackpot' : 'approve',
      receipt: { text: `ПРОВЕДЕНО +${totalPayout}`, approved: true, jackpot: nuralievJackpot },
    });
    winningLines = lineWins;
    celebrationStartedAt = performance.now();
    celebrateUntil = celebrationStartedAt + (nuralievJackpot ? 7200 : totalPayout >= 100 ? 5600 : 3200);
    jackpotBurstAt = nuralievJackpot ? celebrationStartedAt + 1250 : 0;
    setCabinetCelebration(machine, true, Math.min(2, totalPayout / 50));
    setCabinetPaylines(machine, winningLines, 1);
    if (!reducedMotion) {
      triggerCabinetBurst(
        machine,
        Math.min(2, .8 + totalPayout / 100),
        nuralievJackpot ? [0xffd45a, 0xff4b3e, 0x51e6e0, 0xffffff] : lineWins.map((line) => line.color),
      );
    }
  } else {
    currentWin = 0;
    ui.win.textContent = '0';
    winningLines = [];
    setCabinetPaylines(machine, []);
    setStatus('СОВПАДЕНИЙ НЕТ · ПОВТОРИТЕ РАСЧЁТ');
    audio.lose();
    setCabinetOracle(machine, {
      message: 'ОТКАЗ В ПРОВЕДЕНИИ',
      tone: 'reject',
    });
  }
  persist(); syncUi();
}

function updateLever(now) {
  if (leverDrag && !leverDrag.triggered) {
    const amount = MathUtils.clamp(leverDrag.delta / 120, 0, 1);
    machine.lever.rotation.x = amount * 1.05;
    return;
  }
  if (leverStart < 0) {
    machine.lever.rotation.x = MathUtils.lerp(machine.lever.rotation.x, 0, .16);
    return;
  }
  const t = MathUtils.clamp((now - leverStart) / 680, 0, 1);
  machine.lever.rotation.x = Math.sin(Math.PI * t) * 1.08;
  if (t >= 1) leverStart = -1;
}

function updateCelebration(now) {
  if (now < celebrateUntil) {
    const pulse = .5 + Math.sin(now * .018) * .5;
    const elapsed = now - celebrationStartedAt;
    const lineStep = 680;
    const sequenceDuration = winningLines.length > 1 ? winningLines.length * lineStep : 0;
    const visibleLines = sequenceDuration > 0 && elapsed < sequenceDuration
      ? [winningLines[Math.floor(elapsed / lineStep) % winningLines.length]]
      : winningLines;
    setCabinetPaylines(machine, visibleLines, pulse);
    if (!reducedMotion && jackpotBurstAt > 0 && now >= jackpotBurstAt) {
      jackpotBurstAt = 0;
      triggerCabinetBurst(machine, 2, [0xffd45a, 0xffffff, 0xff4b3e, 0x51e6e0]);
    }
    bloom.strength = BLOOM_BASE + .05 + pulse * .08;
    bloom.radius = .27 + pulse * .035;
    machine.winLights.forEach((lamp, i) => {
      if (lamp.material?.emissive) {
        const idle = lamp.userData.idleIntensity ?? .35;
        const celebrationScale = lamp.userData.celebrationScale ?? 1;
        const peak = 1.7 + ((i + Math.floor(now / 120)) % 3 === 0 ? 1.9 : pulse * .7);
        lamp.material.emissiveIntensity = idle + (peak - idle) * celebrationScale;
      }
    });
  } else if (celebrateUntil !== 0) {
    celebrateUntil = 0;
    celebrationStartedAt = 0;
    jackpotBurstAt = 0;
    winningLines = [];
    setCabinetCelebration(machine, false);
    setCabinetPaylines(machine, []);
    bloom.strength = BLOOM_BASE;
    bloom.radius = .27;
  }
}

function openPanel(panel) {
  const focused = document.activeElement;
  const focusedInsidePanel = panels.some((item) => item.contains(focused));
  closePanels(false);
  if (!focusedInsidePanel && focused instanceof HTMLElement) panelReturnFocus = focused;
  panel.inert = false;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  void panel.offsetWidth;
  panel.focus();
}

function closePanels(restoreFocus = true) {
  panels.forEach((panel) => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
  });
  document.body.classList.remove('panel-open');
  if (restoreFocus && panelReturnFocus?.isConnected) panelReturnFocus.focus();
  if (restoreFocus) panelReturnFocus = null;
}

ui.startBtn.addEventListener('click', startGame);
ui.spinBtn.addEventListener('click', spin);
ui.coinBtn.addEventListener('click', addCoin);
ui.paytableBtn.addEventListener('click', () => openPanel(ui.payoutPanel));
ui.settingsBtn.addEventListener('click', () => openPanel(ui.settingsPanel));
ui.helpBtn.addEventListener('click', () => openPanel(ui.helpPanel));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closePanels));
ui.helpPanel.addEventListener('click', (event) => { if (event.target === ui.helpPanel) closePanels(); });

ui.soundToggle.addEventListener('change', () => {
  state.sound = ui.soundToggle.checked; audio.setEnabled(state.sound); persist();
  if (state.sound) audio.coin();
});
ui.shakeToggle.addEventListener('change', () => { state.shake = ui.shakeToggle.checked; persist(); });
ui.graphicsQuality.addEventListener('change', () => {
  state.graphicsQuality = GRAPHICS_QUALITIES.has(ui.graphicsQuality.value) ? ui.graphicsQuality.value : 'auto';
  applyGraphicsSettings({ notify: true });
  persist();
});
ui.bloomToggle.addEventListener('change', () => {
  state.bloom = ui.bloomToggle.checked;
  applyGraphicsSettings();
  persist();
});
ui.fpsToggle.addEventListener('change', () => {
  state.showFps = ui.fpsToggle.checked;
  applyGraphicsSettings();
  persist();
});
ui.freeToggle.addEventListener('change', () => {
  state.freePlay = ui.freeToggle.checked; persist(); syncUi();
  showToast(state.freePlay ? 'БЕСПЛАТНАЯ СМЕНА ВКЛЮЧЕНА' : 'ЖЕТОННИК ВКЛЮЧЕН');
});
ui.winRateRange.addEventListener('input', () => {
  state.winRate = Number(ui.winRateRange.value);
  syncMathSettings();
  persist();
});
ui.bigWinRange.addEventListener('input', () => {
  state.bigWinShare = Number(ui.bigWinRange.value);
  syncMathSettings();
  persist();
});
ui.resetBtn.addEventListener('click', () => {
  Object.assign(state, DEFAULT_STATE);
  currentWin = 0;
  persist();
  ui.soundToggle.checked = state.sound; ui.shakeToggle.checked = state.shake; ui.freeToggle.checked = state.freePlay;
  syncMathSettings();
  applyGraphicsSettings();
  audio.setEnabled(state.sound); syncUi();
  machine.coinSystem.clear();
  setCabinetOracle(machine, { message: 'АРХИВ ОБНУЛЁН', tone: 'idle', receipt: { reset: true } });
  showToast('СТАТИСТИКА ОБНУЛЕНА');
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Escape') { closePanels(); return; }
  const open = panels.find((panel) => panel.classList.contains('open'));
  if (event.code === 'Tab' && open) {
    const focusable = [...open.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (document.activeElement === open || !open.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (event.target.matches('input, button')) return;
  if (event.code === 'KeyM') addCoin();
  if (event.code === 'Enter' || event.code === 'Space') {
    event.preventDefault();
    if (mode === 'attract') startGame(); else spin();
  }
  if (event.code === 'KeyP') openPanel(ui.payoutPanel);
});

function raycastAction(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(machine.interactives, false);
  return hits[0]?.object.userData.action || null;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  const action = raycastAction(event.clientX, event.clientY);
  if (action === 'spin') {
    leverDrag = { pointerId: event.pointerId, startY: event.clientY, delta: 0, triggered: false };
    renderer.domElement.setPointerCapture(event.pointerId);
    controls.enabled = false;
  } else if (action === 'coin') {
    addCoin();
  }
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (leverDrag?.pointerId === event.pointerId) {
    leverDrag.delta = Math.max(0, event.clientY - leverDrag.startY);
    if (leverDrag.delta > 52 && !leverDrag.triggered) {
      leverDrag.triggered = true;
      spin();
    }
    return;
  }
  renderer.domElement.style.cursor = raycastAction(event.clientX, event.clientY) ? 'pointer' : 'grab';
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!leverDrag || leverDrag.pointerId !== event.pointerId) return;
  if (!leverDrag.triggered) spin();
  leverDrag = null;
  controls.enabled = true;
});
renderer.domElement.addEventListener('pointercancel', () => { leverDrag = null; controls.enabled = true; });

function updateViewport() {
  const nextCompactView = innerWidth / innerHeight < .72;
  const layoutChanged = nextCompactView !== compactView;
  compactView = nextCompactView;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyGraphicsSettings();
  controls.minDistance = compactView ? 13.2 : 6.8;
  controls.maxDistance = compactView ? 18 : 13.5;
  settledCamera.set(compactView ? 4.4 : 2.7, compactView ? 3.75 : 3.55, compactView ? 14.5 : 11.4);
  settledTarget.set(compactView ? .42 : 0, 2.85, 0);
  rebuildIntroCameraPath();
  if (layoutChanged && mode !== 'spinning' && mode !== 'attract' && !cameraTransition) settleCameraImmediately();
}

window.addEventListener('resize', updateViewport);
motionPreference.addEventListener('change', (event) => {
  reducedMotion = event.matches;
});
document.addEventListener('visibilitychange', () => {
  pageVisible = !document.hidden;
  lastFrame = performance.now();
  fpsWindowStarted = lastFrame;
  fpsFrames = 0;
  if (!pageVisible) audio.stopMotor();
});

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  if (!pageVisible) return;
  const frameDeltaMs = Math.max(.1, now - lastFrame);
  const dt = Math.min(.05, frameDeltaMs / 1000);
  lastFrame = now;
  const cameraIsDirected = updateCinematicCamera(now);
  if (!cameraIsDirected) controls.update();
  updateLever(now);
  updateSpin(now);
  updateCelebration(now);
  updateCabinetBurst(machine, dt);
  updateCabinetOracle(machine, now, dt, reducedMotion);
  machine.coinSystem.update(dt);
  workshop.dust.rotation.y += dt * .007;
  workshop.dust.position.y = Math.sin(now * .00012) * .12;

  const shake = state.shake && !reducedMotion && mode === 'spinning' ? Math.sin(now * .075) * .0045 : 0;
  machine.root.position.x = shake;
  machine.root.rotation.z = shake * .25;
  composer.render();
  updateFpsCounter(now, frameDeltaMs);

  if (!bootReleased) {
    bootReleased = true;
    requestAnimationFrame(() => {
      document.body.classList.remove('booting');
      document.body.classList.add('app-ready');
    });
  }
}

animate();
window.__slotReady = true;
window.__slot = {
  spin,
  addCoin,
  start: () => startGame({ immediate: true }),
  getState: () => ({ ...state, mode, reels: reelPositions.map((value, index) => Math.round(value) % REEL_STRIPS[index].length) }),
  getLastVisible: () => reelPositions.map((value, index) => REEL_STRIPS[index][Math.round(value) % REEL_STRIPS[index].length]),
  getVisibleGrid: () => REEL_STRIPS.map((strip, reelIndex) => [-1, 0, 1].map((row) => visibleSymbol(reelIndex, row))),
  getPaylineWins: () => evaluatePaylines(),
  getCoinDebug: () => machine.coinSystem.debug(),
  getCameraDebug: () => ({
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    cinematic: mode === 'attract',
    settling: Boolean(cameraTransition),
  }),
  getGraphicsDebug: () => ({
    quality: state.graphicsQuality,
    pixelRatio: renderer.getPixelRatio(),
    samples: composer.renderTarget1.samples,
    maxSamples: renderer.capabilities.maxSamples,
    renderSize: [renderer.domElement.width, renderer.domElement.height],
    shadows: renderer.shadowMap.enabled,
    bloom: bloom.enabled,
    fpsVisible: ui.fpsCounter.classList.contains('visible'),
    fps: fpsValue,
    fpsFrames,
    fpsElapsed: performance.now() - fpsWindowStarted,
    showFps: state.showFps,
  }),
  getOracleDebug: () => ({
    message: machine.oracle.displayTexture.userData.text,
    marquee: machine.oracle.marqueeTexture.userData.text,
    tone: machine.oracle.tone,
    receipt: machine.oracle.receipt.texture.userData.text,
    receiptTarget: machine.oracle.receipt.targetLength,
    receiptLength: machine.oracle.receipt.length,
    receiptEntries: machine.oracle.receipt.texture.userData.count(),
    receiptPhysics: machine.oracle.receipt.debug(),
  }),
  ...(import.meta.env.DEV ? { force: (result) => { window.__slotForceResult = result; } } : {}),
};
console.info('[СЧЁТМАШ-83]', __BUILD_INFO__, 'готов к расчёту');
