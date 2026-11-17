#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file turbopack-speed.mjs
 * @input The fixture app (__fixtures__/next-app.mjs) and built Core, Lab,
 *   Charts and Rich Text packages (their `dist`, for the prebuilt app).
 * @output The Turbopack speed figures for the fixture app, from source and on
 *   the prebuilt stylesheets. Each is the median of `--runs` runs (default 5):
 *   `next build`, a `next dev` cold start and a hot update, against the budget.
 *   It also counts the files the Astryx loader compiles in one source build.
 *   It reports the budget and does not enforce it while the loader route runs.
 * @position Run by hand on every change to @astryxdesign/build:
 *   node packages/build/scripts/turbopack-speed.mjs [--runs 5]
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PREBUILT,
  env,
  nextBin,
  packageDir,
  repoRoot,
  scratchApp,
  serving,
} from '../__fixtures__/next-app.mjs';

const runsFlag = process.argv.indexOf('--runs');
const runs = runsFlag > 0 ? Number(process.argv[runsFlag + 1]) : 5;
if (!Number.isInteger(runs) || runs < 1) {
  throw new Error('--runs takes a positive whole number');
}

/** The speed budget: how much slower than the prebuilt app each figure may be. */
const BUDGET = {build: 0.2, cold: 0.15, hot: 0.1};
const LABELS = {
  build: '`next build`',
  cold: '`next dev` cold start',
  hot: 'hot update',
};

const dirs = [];

/** Rewrite a file of a scratch app; the edit must change it. */
function edit(file, transform) {
  const source = fs.readFileSync(file, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`nothing to edit in ${file}`);
  fs.writeFileSync(file, next);
}

/** The fixture app as `withAstryx()` builds it, from source. */
function sourceApp() {
  const made = scratchApp();
  dirs.push(made.dir);
  return made.app;
}

/**
 * The same app on the prebuilt stylesheets, with no `withAstryx()` and no
 * `@astryx` plugin. Each package's stylesheet replaces `@astryx;`, and each
 * package resolves to its `dist`.
 */
function prebuiltApp() {
  for (const [name, sheet] of Object.entries(PREBUILT)) {
    for (const file of [`dist/${sheet}`, 'dist/index.js']) {
      if (!fs.existsSync(path.join(repoRoot, 'packages', name, file))) {
        throw new Error(
          `packages/${name}/${file} is missing: build the package first ` +
            `(pnpm -F @astryxdesign/${name} build)`,
        );
      }
    }
  }
  const made = scratchApp({keepPrebuilt: Object.keys(PREBUILT)});
  dirs.push(made.dir);
  edit(path.join(made.app, 'next.config.mjs'), source =>
    source
      .replace("import {withAstryx} from '@astryxdesign/build/next';\n", '')
      .replace('export default withAstryx({', 'export default ({'),
  );
  edit(path.join(made.app, 'postcss.config.js'), source =>
    source.replace(
      /\n\s*\/\/ Astryx, compiled from[^\n]*\n\s*'@astryxdesign\/build\/next\/postcss': \{\},/,
      '',
    ),
  );
  edit(path.join(made.app, 'src/app/globals.css'), source =>
    source.replace(
      '@astryx;',
      Object.entries(PREBUILT)
        .map(([name, sheet]) => `@import '@astryxdesign/${name}/${sheet}';`)
        .join('\n'),
    ),
  );
  return made.app;
}

/**
 * A source app whose `withAstryx()` loader logs each file it compiles, so one
 * build counts the Astryx loader's runs. Kept apart from the timed apps.
 */
function countingApp() {
  const app = sourceApp();
  const log = path.join(app, 'astryx-loader.log');
  const loader = path.join(packageDir, 'src/turbopack-loader.js');
  fs.writeFileSync(
    path.join(app, 'counting-loader.cjs'),
    [
      "const fs = require('fs');",
      `const loader = require(${JSON.stringify(loader)});`,
      'module.exports = function countingLoader(...args) {',
      `  fs.appendFileSync(${JSON.stringify(log)}, this.resourcePath + '\\n');`,
      '  return loader.apply(this, args);',
      '};',
      '',
    ].join('\n'),
  );
  edit(path.join(app, 'next.config.mjs'), source =>
    source
      .replace('export default withAstryx({', 'const config = withAstryx({')
      .concat(
        [
          "const counting = require.resolve('./counting-loader.cjs');",
          "for (const rule of [config.turbopack.rules['*.{ts,tsx}']].flat()) {",
          '  for (const entry of rule.loaders ?? []) {',
          '    if (entry.loader?.endsWith(`turbopack-loader.js`)) entry.loader = counting;',
          '  }',
          '}',
          'export default config;',
          '',
        ].join('\n'),
      ),
  );
  return {app, log};
}

function clean(app) {
  fs.rmSync(path.join(app, '.next'), {recursive: true, force: true});
}

function build(app) {
  execFileSync(process.execPath, [nextBin(app), 'build'], {
    cwd: app,
    env,
    stdio: 'ignore',
  });
}

/** `next build` from a clean output directory, in milliseconds. */
function timeBuild(app) {
  clean(app);
  const start = performance.now();
  build(app);
  return performance.now() - start;
}

/** `next dev` from a clean output directory until it serves the page. */
async function timeColdStart(app) {
  clean(app);
  const start = performance.now();
  return serving(app, 'dev', () => performance.now() - start);
}

/** Edits of the page in a running `next dev`, each until it serves the edit. */
async function timeHotUpdates(app) {
  const page = path.join(app, 'src/app/page.tsx');
  const original = fs.readFileSync(page, 'utf8');
  return serving(app, 'dev', async origin => {
    const times = [];
    for (let run = 1; run <= runs; run += 1) {
      const marker = `Hello ${run}`;
      edit(page, () =>
        original.replace('<Text>Hello</Text>', `<Text>${marker}</Text>`),
      );
      const start = performance.now();
      const deadline = start + 120_000;
      while (!(await (await fetch(origin)).text()).includes(marker)) {
        if (performance.now() > deadline) {
          throw new Error(`next dev never served "${marker}" within 120 s`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      times.push(performance.now() - start);
    }
    fs.writeFileSync(page, original);
    return times;
  });
}

async function measure(app) {
  const figures = {build: [], cold: [], hot: []};
  for (let run = 1; run <= runs; run += 1) {
    figures.build.push(timeBuild(app));
    figures.cold.push(await timeColdStart(app));
  }
  figures.hot = await timeHotUpdates(app);
  return figures;
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const seconds = ms => `${(ms / 1000).toFixed(2)} s`;

try {
  const prebuilt = await measure(prebuiltApp());
  const source = await measure(sourceApp());
  const {app, log} = countingApp();
  build(app);
  const compiled = fs.readFileSync(log, 'utf8').trim().split('\n');

  const lines = [
    `Turbopack speed, median of ${runs} runs (spec:AST-080 FR9; reported, not enforced, while the loader route is in use):`,
    '',
    '| Figure | Prebuilt stylesheets | From source | Change | Budget |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const figure of Object.keys(BUDGET)) {
    const before = median(prebuilt[figure]);
    const after = median(source[figure]);
    const change = (after - before) / before;
    lines.push(
      `| ${LABELS[figure]} | ${seconds(before)} | ${seconds(after)} | ` +
        `${change >= 0 ? '+' : ''}${(change * 100).toFixed(0)}% | ` +
        `+${BUDGET[figure] * 100}% ${change <= BUDGET[figure] ? 'within' : 'over'} |`,
    );
  }
  lines.push(
    '',
    `Astryx loader runs in one source \`next build\`: ${compiled.length} ` +
      `(${new Set(compiled).size} Astryx files).`,
    '',
    `Runs (ms): ${JSON.stringify({prebuilt, source}, (key, value) =>
      typeof value === 'number' ? Math.round(value) : value,
    )}`,
  );
  console.log(lines.join('\n'));
} finally {
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
}
