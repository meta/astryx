// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Captures the landing templates card previews as light and dark WebP images.
 * @input A running docsite (`--url`, default http://localhost:3000) and the template sources.
 * @output public/landing/template-previews/<slug>-<mode>.<hash>.webp and manifest.json.
 * @position Run by hand after a change to a landing template; the freshness test names it.
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const docsiteDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outDir = path.join(docsiteDir, 'public/landing/template-previews');
const templatesDir = path.resolve(
  docsiteDir,
  '../../packages/cli/assets/templates/pages',
);

const urlArg = process.argv.find(arg => arg.startsWith('--url='));
const baseUrl = urlArg
  ? urlArg.slice('--url='.length)
  : 'http://localhost:3000';

// A 1000px viewport puts the card in its one-column layout, where every tile
// is fully visible. Two device pixels per CSS pixel keep the images sharp on
// high-density screens; the desktop tile is narrower than this capture.
const VIEWPORT = {width: 1000, height: 1400};
const SCALE = 2;
const WEBP_QUALITY = 0.8;

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function encodeWebp(page, png) {
  const base64 = await page.evaluate(
    async ({data, quality}) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const webp = await canvas.convertToBlob({type: 'image/webp', quality});
      const bytes = new Uint8Array(await webp.arrayBuffer());
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary);
    },
    {data: png.toString('base64'), quality: WEBP_QUALITY},
  );
  return Buffer.from(base64, 'base64');
}

async function captureMode(browser, mode) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: mode,
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?template-previews=live`, {waitUntil: 'load'});
  const tiles = page.locator('[data-template-slug]');
  await tiles.first().waitFor();
  // The one-column layout hides one tile; show every tile for the capture.
  await tiles.evaluateAll(elements => {
    for (const element of elements) {
      element.style.display = 'block';
    }
  });
  const count = await tiles.count();
  const shots = [];
  for (let index = 0; index < count; index++) {
    const slug = await tiles.nth(index).getAttribute('data-template-slug');
    // The tile draws the border; the image replaces the preview inside it.
    const tile = tiles.nth(index).locator(':scope > div');
    await tile.scrollIntoViewIfNeeded();
    await tile.evaluate(
      element =>
        new Promise((resolve, reject) => {
          const deadline = Date.now() + 60_000;
          const check = () => {
            const viewport = element.querySelector('[class*="viewport"]');
            const images = [...element.querySelectorAll('img')];
            if (
              viewport?.firstElementChild &&
              images.every(image => image.complete)
            ) {
              resolve();
            } else if (Date.now() > deadline) {
              reject(new Error('Template preview did not render'));
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        }),
    );
    // Let fonts and image decoding settle before the screenshot.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const png = await tile.screenshot({animations: 'disabled'});
    const webp = await encodeWebp(page, png);
    const size = await tile.evaluate(element => {
      const box = element.getBoundingClientRect();
      return {width: Math.round(box.width), height: Math.round(box.height)};
    });
    shots.push({slug, webp, size});
  }
  await context.close();
  return shots;
}

const browser = await chromium.launch();
const manifest = {width: 0, height: 0, previews: {}};
const written = new Set(['manifest.json']);
fs.mkdirSync(outDir, {recursive: true});
try {
  for (const mode of ['light', 'dark']) {
    for (const {slug, webp, size} of await captureMode(browser, mode)) {
      const file = `${slug}-${mode}.${sha256(webp).slice(0, 10)}.webp`;
      fs.writeFileSync(path.join(outDir, file), webp);
      written.add(file);
      const source = fs.readFileSync(path.join(templatesDir, slug, 'page.tsx'));
      manifest.previews[slug] = {
        ...manifest.previews[slug],
        source: sha256(source),
        [mode]: file,
      };
      manifest.width = size.width * SCALE;
      manifest.height = size.height * SCALE;
      console.log(`${file} ${(webp.length / 1024).toFixed(1)} KiB`);
    }
  }
} finally {
  await browser.close();
}
for (const file of fs.readdirSync(outDir)) {
  if (!written.has(file)) {
    fs.rmSync(path.join(outDir, file));
  }
}
fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
