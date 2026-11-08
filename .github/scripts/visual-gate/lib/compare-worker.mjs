// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CPU-bound PNG comparison worker for the visual gate.
 *
 * @input  one partition of baseline/current image pairs
 * @output unchanged keys or pixel-diff metadata, plus diff PNGs for changes
 *
 * PNG inflate, filtering, and pixelmatch are synchronous CPU work. Keeping them
 * off the gate's main thread lets the pinned two-core runner compare two clean
 * frame streams at once after browser capture has finished.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parentPort, workerData} from 'node:worker_threads';

import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';

function pad(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const padded = new PNG({width, height});
  padded.data.fill(0);
  PNG.bitblt(
    png,
    padded,
    0,
    0,
    Math.min(png.width, width),
    Math.min(png.height, height),
    0,
    0,
  );
  return padded;
}

const results = [];
for (const key of workerData.keys) {
  const baselinePng = PNG.sync.read(
    fs.readFileSync(path.join(workerData.baselineDir, `${key}.png`)),
  );
  const currentPng = PNG.sync.read(
    fs.readFileSync(path.join(workerData.currentDir, `${key}.png`)),
  );
  const width = Math.max(baselinePng.width, currentPng.width);
  const height = Math.max(baselinePng.height, currentPng.height);
  const sizeChanged =
    baselinePng.width !== currentPng.width ||
    baselinePng.height !== currentPng.height;
  const before = pad(baselinePng, width, height);
  const after = pad(currentPng, width, height);

  // Promotion canonicalizes accepted PNG encoding. A fresh Playwright PNG can
  // therefore have different file bytes while decoding to identical pixels.
  if (!sizeChanged && Buffer.compare(before.data, after.data) === 0) {
    results.push({key, unchanged: true});
    continue;
  }

  const diff = new PNG({width, height});
  const diffPixels = pixelmatch(
    before.data,
    after.data,
    diff.data,
    width,
    height,
    {
      threshold: workerData.threshold,
      includeAA: false,
      alpha: 0.2,
      diffMask: false,
    },
  );
  if (diffPixels <= workerData.maxDiffPixels && !sizeChanged) {
    results.push({key, unchanged: true});
    continue;
  }

  fs.writeFileSync(
    path.join(workerData.diffDir, `${key}.png`),
    PNG.sync.write(diff),
  );
  results.push({
    key,
    change: {
      key,
      diffPixels,
      diffRatio: Number((diffPixels / (width * height)).toFixed(6)),
      sizeChanged,
    },
  });
}

parentPort.postMessage(results);
