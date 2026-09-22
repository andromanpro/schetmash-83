import fs from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');

async function filesIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  }));
  return nested.flat();
}

const files = await filesIn(dist);
const totalBytes = (await Promise.all(files.map(async (file) => (await fs.stat(file)).size)))
  .reduce((sum, size) => sum + size, 0);
const searchable = (await Promise.all(
  files.filter((file) => /\.(?:html|css|js)$/i.test(file)).map((file) => fs.readFile(file, 'utf8')),
)).join('\n');

const violations = [];
if (searchable.includes('__slotForceResult')) violations.push('production содержит отладочный force API');
if (/fonts\.(?:googleapis|gstatic)\.com/.test(searchable)) violations.push('production обращается к Google Fonts');
if (files.some((file) => file.endsWith('data-core-marquee.png'))) violations.push('в production попала устаревшая тяжёлая панель');
if (totalBytes > 4 * 1024 * 1024) violations.push(`production больше 4 МБ: ${totalBytes} байт`);

if (violations.length) throw new Error(violations.join('\n'));
console.log(JSON.stringify({ files: files.length, totalKB: Math.round(totalBytes / 1024), forceApi: false, externalFonts: false }, null, 2));
