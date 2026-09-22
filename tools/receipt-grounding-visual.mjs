import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { findBrowser } from './browser.mjs';
import { withVite } from './server.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const outputDir = path.join(root, 'shots', 'receipt-payout-audit');
await fs.mkdir(outputDir, { recursive: true });

await withVite(async (url) => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__slotReady === true, { timeout: 15000 });
  await page.evaluate(() => window.__slot.start());
  await page.evaluate(() => {
    const quality = document.querySelector('#graphicsQuality');
    quality.value = 'cinematic';
    quality.dispatchEvent(new Event('change', { bubbles: true }));
    const bloom = document.querySelector('#bloomToggle');
    if (!bloom.checked) bloom.click();
  });
  const canvas = await page.$('#scene canvas');
  const bounds = await canvas.boundingBox();

  const spinOnec = async () => {
    await page.evaluate(() => {
      window.__slot.force(['onec', 'onec', 'onec']);
      window.__slot.spin();
    });
    await page.waitForFunction(() => window.__slot.getState().mode === 'idle', { timeout: 8000 });
  };
  const waitForPaper = async () => {
    await page.waitForFunction(() => {
      const receipt = window.__slot.getOracleDebug();
      return receipt.receiptTarget - receipt.receiptLength < .006;
    }, { timeout: 12000 });
    await new Promise((resolve) => setTimeout(resolve, 900));
  };
  const orbitSide = async () => {
    await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .48);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .28, bounds.y + bounds.height * .48, { steps: 18 });
    await page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 600));
  };
  const orbitFront = async () => {
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .48, { steps: 18 });
    await page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 450));
  };

  for (let index = 0; index < 4; index += 1) await spinOnec();
  await waitForPaper();
  const forming = await page.evaluate(() => window.__slot.getOracleDebug());
  await orbitSide();
  await page.screenshot({ path: path.join(outputDir, '0400-side.png') });
  await page.screenshot({
    path: path.join(outputDir, '0400-side-detail.png'),
    clip: { x: 455, y: 510, width: 210, height: 260 },
  });
  await orbitFront();

  await spinOnec();
  await waitForPaper();
  const hanging = await page.evaluate(() => window.__slot.getOracleDebug());
  await page.screenshot({ path: path.join(outputDir, '0500-front.png') });
  await page.screenshot({
    path: path.join(outputDir, '0500-front-detail.png'),
    clip: { x: 430, y: 560, width: 250, height: 310 },
  });
  await orbitSide();
  await page.screenshot({ path: path.join(outputDir, '0500-side.png') });
  await page.screenshot({
    path: path.join(outputDir, '0500-side-detail.png'),
    clip: { x: 455, y: 525, width: 190, height: 255 },
  });
  await orbitFront();

  await spinOnec();
  await waitForPaper();
  const settling = await page.evaluate(() => window.__slot.getOracleDebug());
  await page.screenshot({ path: path.join(outputDir, '0600-front.png') });
  await orbitSide();
  await page.screenshot({ path: path.join(outputDir, '0600-side.png') });
  await page.screenshot({
    path: path.join(outputDir, '0600-side-detail.png'),
    clip: { x: 455, y: 520, width: 190, height: 290 },
  });
  await orbitFront();

  for (let index = 6; index < 10; index += 1) await spinOnec();
  await waitForPaper();
  const grounded = await page.evaluate(() => window.__slot.getOracleDebug());
  await page.screenshot({ path: path.join(outputDir, '1000-front.png') });
  await orbitSide();
  await page.screenshot({ path: path.join(outputDir, '1000-side.png') });

  await orbitFront();
  for (let index = 10; index < 15; index += 1) await spinOnec();
  await waitForPaper();
  const extended = await page.evaluate(() => window.__slot.getOracleDebug());
  await orbitSide();
  await page.screenshot({ path: path.join(outputDir, '1500-side.png') });
  await page.screenshot({
    path: path.join(outputDir, '1500-side-detail.png'),
    clip: { x: 430, y: 500, width: 250, height: 330 },
  });

  console.log(JSON.stringify({ outputDir, forming, hanging, settling, grounded, extended }, null, 2));
  await browser.close();
});
