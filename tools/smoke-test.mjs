import puppeteer from 'puppeteer-core';
import { findBrowser } from './browser.mjs';
import { withVite } from './server.mjs';

await withVite(async (url) => {
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', ...(process.env.CI ? ['--use-angle=swiftshader', '--disable-dev-shm-usage'] : [])], defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => window.__slotReady === true, { timeout: process.env.CI ? 60000 : 15000 });
  } catch (error) {
    const boot = await page.evaluate(() => ({ title: document.title, text: document.body.innerText.slice(0, 1200), canvas: document.querySelectorAll('canvas').length }));
    throw new Error(`Game startup failed: ${JSON.stringify({ boot, errors, cause: error.message })}`);
  }
  await page.waitForFunction(() => document.body.classList.contains('app-ready'), { timeout: 15000 });
  const introCameraStart = await page.evaluate(() => window.__slot.getCameraDebug());
  await page.waitForFunction((start) => {
    const current = window.__slot.getCameraDebug();
    return Math.hypot(...current.position.map((value, index) => value - start.position[index])) >= .025;
  }, { timeout: process.env.CI ? 30000 : 5000 }, introCameraStart);
  const introCameraMoved = await page.evaluate(() => window.__slot.getCameraDebug());
  const introDistance = Math.hypot(...introCameraMoved.position.map((value, index) => value - introCameraStart.position[index]));
  if (!introCameraStart.cinematic || introDistance < .025) {
    throw new Error(`Кинематографический облёт не движется: ${JSON.stringify({ introCameraStart, introCameraMoved, introDistance })}`);
  }
  await page.click('#startBtn');
  const introCameraSettling = await page.evaluate(() => window.__slot.getCameraDebug());
  if (!introCameraSettling.settling || introCameraSettling.cinematic) {
    throw new Error(`Камера не начала посадку в игровой ракурс: ${JSON.stringify(introCameraSettling)}`);
  }
  await page.waitForFunction(() => !window.__slot.getCameraDebug().settling, { timeout: process.env.CI ? 30000 : 2500 });
  const introCameraSettled = await page.evaluate(() => window.__slot.getCameraDebug());
  await page.evaluate(() => {
    const quality = document.querySelector('#graphicsQuality');
    quality.value = 'cinematic';
    quality.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const cinematicGraphics = await page.evaluate(() => window.__slot.getGraphicsDebug());
  if (cinematicGraphics.quality !== 'cinematic'
    || cinematicGraphics.pixelRatio < 1.49
    || cinematicGraphics.samples < Math.min(4, cinematicGraphics.maxSamples)
    || cinematicGraphics.renderSize[0] < 2150) {
    throw new Error(`Режим «Кино» не включает суперсэмплинг/MSAA: ${JSON.stringify(cinematicGraphics)}`);
  }
  await page.evaluate(() => {
    const quality = document.querySelector('#graphicsQuality');
    quality.value = 'economy';
    quality.dispatchEvent(new Event('change', { bubbles: true }));
    const bloom = document.querySelector('#bloomToggle');
    bloom.checked = false;
    bloom.dispatchEvent(new Event('change', { bubbles: true }));
    const fps = document.querySelector('#fpsToggle');
    fps.checked = true;
    fps.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => window.__slot.getGraphicsDebug().fps > 0, { timeout: process.env.CI ? 30000 : 5000 });
  const graphicsApplied = await page.evaluate(() => window.__slot.getGraphicsDebug());
  if (graphicsApplied.quality !== 'economy' || graphicsApplied.pixelRatio > 1.01 || graphicsApplied.shadows || graphicsApplied.bloom || !graphicsApplied.fpsVisible || graphicsApplied.fps <= 0) {
    throw new Error(`Графические настройки не применились: ${JSON.stringify(graphicsApplied)}`);
  }
  await page.evaluate(() => {
    const quality = document.querySelector('#graphicsQuality');
    quality.value = 'auto';
    quality.dispatchEvent(new Event('change', { bubbles: true }));
    const bloom = document.querySelector('#bloomToggle');
    bloom.checked = true;
    bloom.dispatchEvent(new Event('change', { bubbles: true }));
    const fps = document.querySelector('#fpsToggle');
    fps.checked = false;
    fps.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.evaluate(() => window.__slot.addCoin());
  await new Promise((resolve) => setTimeout(resolve, 420));
  const coinDebug = await page.evaluate(() => window.__slot.getCoinDebug());
  if (coinDebug.active.length !== 1) throw new Error(`Жетон не находится в анимации: ${JSON.stringify(coinDebug)}`);
  await page.waitForFunction(
    () => window.__slot.getCoinDebug().active.length === 0 && window.__slot.getState().credits === 11,
    { timeout: 2500 },
  );
  const coinAccepted = await page.evaluate(() => ({ coin: window.__slot.getCoinDebug(), credits: window.__slot.getState().credits }));
  if (coinAccepted.coin.active.length !== 0 || coinAccepted.credits !== 11) throw new Error(`Жетон не завершил вход: ${JSON.stringify(coinAccepted)}`);
  await page.evaluate(() => {
    window.__slot.force(['onec', 'onec', 'onec']);
    window.__slot.spin();
  });
  await page.waitForFunction(() => window.__slot.getState().mode === 'idle' && Number(document.querySelector('#win').textContent) === 100, { timeout: 8000 });
  const report = await page.evaluate(() => ({
    state: window.__slot.getState(),
    visible: window.__slot.getLastVisible(),
    status: document.querySelector('#status').textContent,
    canvas: { width: document.querySelector('canvas').width, height: document.querySelector('canvas').height },
    coin: window.__slot.getCoinDebug(),
    oracle: window.__slot.getOracleDebug(),
  }));
  await page.evaluate(() => {
    window.__slot.force(['nuraliev', 'nuraliev', 'nuraliev']);
    window.__slot.spin();
  });
  await page.waitForFunction(() => window.__slot.getState().mode === 'idle' && window.__slot.getOracleDebug().tone === 'jackpot', { timeout: 8000 });
  const jackpotPresentation = await page.evaluate(() => ({
    oracle: window.__slot.getOracleDebug(),
    toastShown: document.querySelector('#toast').classList.contains('show'),
    toastText: document.querySelector('#toast').textContent,
  }));
  const jackpotOracle = jackpotPresentation.oracle;
  const fallbackPage = await browser.newPage();
  await fallbackPage.setCacheEnabled(false);
  await fallbackPage.setRequestInterception(true);
  fallbackPage.on('request', (request) => {
    if (request.url().endsWith('/art/symbol-bug-v2.webp')) request.abort();
    else request.continue();
  });
  await fallbackPage.goto(url, { waitUntil: 'domcontentloaded' });
  await fallbackPage.waitForFunction(() => window.__slotReady === true, { timeout: 15000 });
  const fallbackStatus = await fallbackPage.$eval('#status', (node) => node.textContent);
  await fallbackPage.close();

  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForFunction(() => window.__slotReady === true, { timeout: 15000 });
  await mobilePage.bringToFront();
  const mobileOpen = await mobilePage.evaluate(() => {
    window.__slot.start();
    const opener = document.querySelector('#paytableBtn');
    opener.focus();
    opener.click();
    const panel = document.querySelector('#payoutPanel');
    return {
      open: panel.classList.contains('open'),
      inert: panel.inert,
      ariaHidden: panel.getAttribute('aria-hidden'),
      activeLabel: document.activeElement?.getAttribute('aria-label') || document.activeElement?.id || document.activeElement?.tagName,
      focusInPanel: panel.contains(document.activeElement),
    };
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mobileDialog = await mobilePage.evaluate(() => {
    const button = document.querySelector('#paytableBtn');
    const panel = document.querySelector('#payoutPanel');
    const canvas = document.querySelector('#scene canvas');
    const rect = button.getBoundingClientRect();
    return {
      buttonVisible: getComputedStyle(button).display !== 'none' && rect.width > 0 && rect.right <= innerWidth,
      panelOpen: panel.getAttribute('aria-hidden') === 'false' && !panel.inert,
      focusInPanel: panel.contains(document.activeElement),
      canvas: { width: canvas.width, height: canvas.height, viewportWidth: innerWidth, viewportHeight: innerHeight },
    };
  });
  await mobilePage.keyboard.press('Tab');
  await mobilePage.keyboard.press('Tab');
  const mobileTrap = await mobilePage.evaluate(() => document.activeElement?.matches('#payoutPanel [data-close]'));
  await mobilePage.keyboard.press('Escape');
  const mobileClose = await mobilePage.evaluate(() => ({
    panelClosed: document.querySelector('#payoutPanel').getAttribute('aria-hidden') === 'true' && document.querySelector('#payoutPanel').inert,
    focusReturned: document.activeElement === document.querySelector('#paytableBtn'),
  }));
  await mobilePage.close();
  await browser.close();
  if (errors.length) throw new Error(errors.join('\n'));
  if (report.visible.some((id) => id !== 'onec')) throw new Error(`Неверный результат барабанов: ${report.visible.join(', ')}`);
  if (report.oracle.tone !== 'approve' || !report.oracle.message.includes('ПРОВЕДЁН') || report.oracle.receiptTarget <= 0 || report.oracle.receiptEntries !== 1) throw new Error(`Оракул не одобрил выигрыш: ${JSON.stringify(report.oracle)}`);
  if (jackpotOracle.tone !== 'jackpot' || !jackpotOracle.message.includes('РАЗРЕШЕНА') || jackpotOracle.receiptTarget <= report.oracle.receiptTarget || jackpotOracle.receiptEntries !== 2) throw new Error(`Нет нарастающей суперсцены оракула: ${JSON.stringify(jackpotOracle)}`);
  if (jackpotOracle.marquee !== 'ДИРЕКТОР ОДОБРИЛ' || jackpotPresentation.toastShown || jackpotPresentation.toastText) throw new Error(`Джекпот остался экранным баннером вместо физической вывески: ${JSON.stringify(jackpotPresentation)}`);
  if (jackpotOracle.receiptPhysics.model !== 'verlet-feed' || jackpotOracle.receiptPhysics.restShape !== 'receipt-spiral' || jackpotOracle.receiptPhysics.growthOrigin !== 'slot') throw new Error(`Не активна физическая спиральная подача чека: ${JSON.stringify(jackpotOracle.receiptPhysics)}`);
  if (Math.abs(jackpotOracle.receiptPhysics.slotMaterial - jackpotOracle.receiptLength) > .001 || jackpotOracle.receiptPhysics.freeMaterial !== 0) throw new Error(`Материал чека растёт не от щели: ${JSON.stringify(jackpotOracle.receiptPhysics)}`);
  if (!fallbackStatus.includes('РЕЗЕРВНЫЕ ТЕКСТУРЫ')) throw new Error(`Fallback арта не активирован: ${fallbackStatus}`);
  if (!mobileDialog.buttonVisible || !mobileDialog.panelOpen || !mobileDialog.focusInPanel) throw new Error(`Мобильный диалог недоступен: ${JSON.stringify({ mobileOpen, mobileDialog })}`);
  if (!mobileTrap) throw new Error('Фокус вышел за пределы мобильного диалога');
  if (!mobileClose.panelClosed || !mobileClose.focusReturned) throw new Error(`Фокус диалога не восстановлен: ${JSON.stringify(mobileClose)}`);
  if (mobileDialog.canvas.width > mobileDialog.canvas.viewportWidth * 1.26) throw new Error(`Мобильный DPR выше лимита: ${JSON.stringify(mobileDialog.canvas)}`);
  console.log(JSON.stringify({
    introCamera: {
      start: introCameraStart,
      moved: introCameraMoved,
      distance: introDistance,
      settling: introCameraSettling,
      settled: introCameraSettled,
    },
    cinematicGraphics,
    graphicsApplied,
    ...report,
    jackpotOracle,
    jackpotPresentation,
    fallbackStatus,
    mobileDialog,
    mobileTrap,
    mobileClose,
  }, null, 2));
});
