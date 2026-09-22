import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { findBrowser } from './browser.mjs';
import { withVite } from './server.mjs';

const destination = fileURLToPath(new URL('../assets/screenshots/', import.meta.url));
await fs.mkdir(destination, { recursive: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await withVite(async (url) => {
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 } });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__slotReady && document.body.classList.contains('app-ready'));
    await page.evaluate(() => {
      window.__slot.start();
      const quality = document.querySelector('#graphicsQuality');
      quality.value = 'cinematic';
      quality.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(1800);
    await page.screenshot({ path: `${destination}hero.jpg`, type: 'jpeg', quality: 90 });
    await page.evaluate(() => { window.__slot.force(['nuraliev', 'nuraliev', 'nuraliev']); window.__slot.spin(); });
    await page.waitForFunction(() => window.__slot.getState().mode === 'idle' && window.__slot.getOracleDebug().tone === 'jackpot', { timeout: 15000 });
    await wait(350);
    await page.screenshot({ path: `${destination}jackpot.jpg`, type: 'jpeg', quality: 90 });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.__slotReady && document.body.classList.contains('app-ready'));
    await page.evaluate(() => {
      window.__slot.start();
      const quality = document.querySelector('#graphicsQuality');
      quality.value = 'auto';
      quality.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(1200);
    await page.screenshot({ path: `${destination}mobile.jpg`, type: 'jpeg', quality: 90 });
    console.log('Saved assets/screenshots/{hero,jackpot,mobile}.jpg');
  } finally { await browser.close(); }
});
