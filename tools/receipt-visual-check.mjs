import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { findBrowser } from './browser.mjs';
import { withVite } from './server.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const output = path.join(root, 'shots', 'receipt-physics.png');
const sideOutput = path.join(root, 'shots', 'receipt-physics-side.png');
const shortSideOutput = path.join(root, 'shots', 'receipt-short-side.png');
await fs.mkdir(path.dirname(output), { recursive: true });

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
  const canvas = await page.$('#scene canvas');
  const bounds = await canvas.boundingBox();

  for (let index = 0; index < 12; index += 1) {
    await page.evaluate(() => {
      window.__slot.force(['nuraliev', 'nuraliev', 'nuraliev']);
      window.__slot.spin();
    });
    await page.waitForFunction(() => window.__slot.getState().mode === 'idle', { timeout: 8000 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (index === 1) {
      await page.waitForFunction(() => {
        const receipt = window.__slot.getOracleDebug();
        return receipt.receiptTarget - receipt.receiptLength < .006;
      }, { timeout: 10000 });
      await new Promise((resolve) => setTimeout(resolve, 700));
      await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .48);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .28, bounds.y + bounds.height * .48, { steps: 18 });
      await page.mouse.up();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await page.screenshot({ path: shortSideOutput });
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .48, { steps: 18 });
      await page.mouse.up();
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  await page.waitForFunction(() => {
    const receipt = window.__slot.getOracleDebug();
    return receipt.receiptTarget - receipt.receiptLength < .006;
  }, { timeout: 10000 });
  await new Promise((resolve) => setTimeout(resolve, 900));
  await page.screenshot({ path: output });
  await page.mouse.move(bounds.x + bounds.width * .52, bounds.y + bounds.height * .48);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .28, bounds.y + bounds.height * .48, { steps: 18 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.screenshot({ path: sideOutput });
  console.log(JSON.stringify({ output, sideOutput, shortSideOutput, receipt: await page.evaluate(() => window.__slot.getOracleDebug()) }, null, 2));
  await browser.close();
});
