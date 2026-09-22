import puppeteer from 'puppeteer-core';
import { findBrowser } from './browser.mjs';
import { withVite } from './server.mjs';

const profiles = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 },
];

await withVite(async (url) => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const reports = [];
  try {
    for (const profile of profiles) {
      const page = await browser.newPage();
      const errors = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      await page.setViewport(profile);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForFunction(() => window.__slotReady === true, { timeout: 15000 });
      await page.evaluate(() => window.__slot.start());

      const metrics = await page.evaluate(async () => {
        const canvas = document.querySelector('#scene canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const startedAt = performance.now();
        let frames = 0;
        await new Promise((resolve) => {
          const tick = (now) => {
            frames += 1;
            if (now - startedAt >= 2000) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const resources = performance.getEntriesByType('resource');
        const navigation = performance.getEntriesByType('navigation')[0];
        return {
          fps: Math.round(frames / ((performance.now() - startedAt) / 1000)),
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          canvas: { width: canvas.width, height: canvas.height },
          resourceCount: resources.length,
          transferKB: Math.round(resources.reduce((sum, item) => sum + (item.transferSize || 0), 0) / 1024),
          decodedBodyKB: Math.round(resources.reduce((sum, item) => sum + (item.decodedBodySize || 0), 0) / 1024),
          domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
          loadMs: Math.round(navigation.loadEventEnd),
          deviceMemoryGB: navigator.deviceMemory ?? null,
          hardwareConcurrency: navigator.hardwareConcurrency,
        };
      });
      reports.push({ profile: profile.name, ...metrics, errors });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(reports, null, 2));
  const errors = reports.flatMap((report) => report.errors);
  if (errors.length) throw new Error(errors.join('\n'));
});
