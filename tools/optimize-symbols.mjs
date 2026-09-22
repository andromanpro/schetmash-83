import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './browser.mjs';
import { withVite } from './server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const art = path.join(root, 'public', 'art');
const sources = [
  'boris-nuraliev-caricature.png',
  'symbol-onec-v2.png',
  'symbol-config-v2.png',
  'symbol-document-v2.png',
  'symbol-bug-v2.png',
  'symbol-query-v2.png',
  'symbol-database-v2.png',
  'symbol-code-v2.png',
  'symbol-release-v2.png',
  'symbol-wild-v2.png',
];

await withVite(async (url) => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  for (const filename of sources) {
    const dataUrl = await page.evaluate(async ({ filename: source, size }) => {
      const response = await fetch(`/art/${source}`);
      if (!response.ok) throw new Error(`Не удалось загрузить ${source}`);
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, size, size);
      bitmap.close();
      return canvas.toDataURL('image/webp', .9);
    }, { filename, size: 768 });

    const target = filename.replace(/\.png$/i, '.webp');
    await fs.writeFile(path.join(art, target), Buffer.from(dataUrl.split(',')[1], 'base64'));
    const stat = await fs.stat(path.join(art, target));
    console.log(`${filename} -> ${target} (${Math.round(stat.size / 1024)} KB)`);
  }

  await browser.close();
}, { port: 5275 });
