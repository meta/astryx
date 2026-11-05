// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file webkit-shader-probe.mjs
 * @description Diagnostic (not merged): how long WebKit's first draw of a
 *   blurred layer takes with an empty Mesa shader cache, against the same
 *   draw with the cache an earlier launch filled. Run once on the runner and
 *   once in Playwright's container image to compare their first-draw cost.
 * @input Playwright's WebKit, installed for the current environment.
 * @output One JSON line per launch, then a summary line with medians.
 * @position .github/workflows/webkit-shader-probe.yml only.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {webkit} from 'playwright';

const ROUNDS = 5;
// The page the harness proof draws: a blurred, saturated layer, then a
// short scale animation on it.
const GLASS =
  '<div id="glass" style="width:120px;height:80px;backdrop-filter:blur(16px) saturate(180%)"></div>';

function filesIn(dir) {
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir, {recursive: true})
        .filter(entry => fs.statSync(path.join(dir, String(entry))).isFile())
        .length
    : 0;
}

async function launch(cacheDir) {
  const before = filesIn(cacheDir);
  const browser = await webkit.launch({
    env: {...process.env, MESA_SHADER_CACHE_DIR: cacheDir},
  });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.setContent('<body style="margin:0"></body>');
    // A screenshot makes the compositor draw the frame, so its time includes
    // compiling any shader the frame needs.
    await page.screenshot();
    await page.evaluate(html => {
      document.body.innerHTML = html;
    }, GLASS);
    let start = performance.now();
    await page.screenshot();
    const firstDrawMs = performance.now() - start;
    start = performance.now();
    await page.screenshot();
    const secondDrawMs = performance.now() - start;
    const animateMs = await page.evaluate(async () => {
      const begin = performance.now();
      await document
        .getElementById('glass')
        .animate([{scale: '1'}, {scale: '0.9'}], {duration: 200}).finished;
      return performance.now() - begin;
    });
    start = performance.now();
    await page.screenshot();
    const afterAnimationDrawMs = performance.now() - start;
    return {
      firstDrawMs: Math.round(firstDrawMs),
      secondDrawMs: Math.round(secondDrawMs),
      afterAnimationDrawMs: Math.round(afterAnimationDrawMs),
      animateMs: Math.round(animateMs),
      cacheFilesWritten: filesIn(cacheDir) - before,
    };
  } finally {
    await browser.close();
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const where = process.argv[2] ?? 'unknown';
const environment = {
  where,
  nproc: os.cpus().length,
  cpuMax: fs.existsSync('/sys/fs/cgroup/cpu.max')
    ? fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim()
    : null,
  lpNumThreads: process.env.LP_NUM_THREADS ?? null,
  webkit: webkit.executablePath(),
};
console.log(JSON.stringify({environment}));

const cold = [];
const warm = [];
for (let round = 1; round <= ROUNDS; round += 1) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shader-probe-'));
  try {
    const first = await launch(dir);
    const second = await launch(dir);
    console.log(JSON.stringify({round, cold: first, warm: second}));
    cold.push(first);
    warm.push(second);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const summary = {where};
for (const key of [
  'firstDrawMs',
  'secondDrawMs',
  'afterAnimationDrawMs',
  'animateMs',
  'cacheFilesWritten',
]) {
  summary[`cold_${key}`] = median(cold.map(run => run[key]));
  summary[`warm_${key}`] = median(warm.map(run => run[key]));
}
console.log(JSON.stringify({summary}));
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### ${where}\n\n\`\`\`json\n${JSON.stringify({environment, summary}, null, 2)}\n\`\`\`\n`,
  );
