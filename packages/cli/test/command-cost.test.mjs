// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reports what a warm run of each common command costs in the
 * published CLI: how many modules it loads, how many bytes those modules
 * hold, and how many files, folders and paths it reads. For one tree these
 * counts are the same on every machine, so the report shows which commands a
 * change makes load more code or read more files, where wall time on a
 * shared runner is too noisy to show it. It compares each count with the
 * counts recorded in command-costs.json and never fails over or under them:
 * it prompts a look and blocks nothing. To record the new counts, run this
 * file with UPDATE_COMMAND_COSTS=1.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  usePackedCli,
  work,
  run,
  keptTmp,
  hasModuleHooks,
} from '../test-utils/packed-gather-cache-fixture.mjs';

usePackedCli();

const RECORDED = fileURLToPath(
  new URL('./command-costs.json', import.meta.url),
);

/** The commands agents run most, each measured as one warm run. */
const CASES = {
  version: ['--version'],
  help: ['--help'],
  component: ['component', 'Button'],
  'component-json': ['component', 'Button', '--json'],
  docs: ['docs', 'layout'],
  search: ['search', 'button'],
  template: ['template', 'dashboard', '--type', 'page'],
  build: ['build', 'a settings page with a profile form'],
  'upgrade-list': ['upgrade', '--list', '--json'],
  doctor: ['doctor'],
};

/** The counts, in the report's column order, with their column titles. */
const COLUMNS = {
  modules: 'Modules',
  moduleBytes: 'Module bytes',
  fileReads: 'File reads',
  folderReads: 'Folder reads',
  pathChecks: 'Path checks',
};

/** A rise above this share of the recorded count is named under the table. */
const NOTABLE_RISE = 0.05;

/**
 * Write the module hook and the preload that count what a run loads and
 * reads, into `dir`.
 * @param {string} dir
 */
function counter(dir) {
  fs.mkdirSync(dir, {recursive: true});
  const loads = path.join(dir, 'loads.txt');
  const tally = path.join(dir, 'tally.json');
  const hook = path.join(dir, 'hook.mjs');
  fs.writeFileSync(
    hook,
    [
      "import {appendFileSync} from 'node:fs';",
      'export async function load(url, context, nextLoad) {',
      '  const result = await nextLoad(url, context);',
      `  if (url.startsWith('file:')) appendFileSync(${JSON.stringify(loads)}, url + '\\n');`,
      '  return result;',
      '}',
      '',
    ].join('\n'),
  );
  const preload = path.join(dir, 'preload.mjs');
  fs.writeFileSync(
    preload,
    [
      "import fs from 'node:fs';",
      "import Module, {register, syncBuiltinESMExports} from 'node:module';",
      "import {isAbsolute} from 'node:path';",
      "import {pathToFileURL} from 'node:url';",
      'const tally = {fileReads: 0, folderReads: 0, pathChecks: 0};',
      'const count = (names, key) => {',
      '  for (const name of names) {',
      '    const original = fs[name];',
      '    const counted = function (...args) {',
      '      tally[key] += 1;',
      '      return original.apply(this, args);',
      '    };',
      '    fs[name] = Object.assign(counted, original);',
      '  }',
      '};',
      "count(['readFileSync', 'readFile'], 'fileReads');",
      "count(['readdirSync', 'readdir', 'opendirSync'], 'folderReads');",
      "count(['statSync', 'lstatSync', 'existsSync', 'realpathSync', 'accessSync'], 'pathChecks');",
      'syncBuiltinESMExports();',
      // Async module hooks do not see CommonJS require calls: note each
      // CommonJS module as it loads.
      'const load = Module.prototype.load;',
      'Module.prototype.load = function (file, ...rest) {',
      `  if (isAbsolute(file)) fs.appendFileSync(${JSON.stringify(loads)}, pathToFileURL(file).href + '\\n');`,
      '  return load.call(this, file, ...rest);',
      '};',
      `register(${JSON.stringify(pathToFileURL(hook).href)});`,
      `process.on('exit', () => fs.writeFileSync(${JSON.stringify(tally)}, JSON.stringify(tally)));`,
      '',
    ].join('\n'),
  );
  return {preload, loads, tally};
}

/**
 * One warm run's counts: the case runs once to fill the kept catalogs, then
 * again with the counter.
 * @param {string} id
 * @param {string[]} args
 */
function measure(id, args) {
  const tmp = keptTmp(`cost-${id}`);
  const first = run(args, {tmp, json: false});
  expect(first.status, `${id}: ${first.stderr}`).toBe(0);
  const {preload, loads, tally} = counter(path.join(work, 'cost', id));
  const warm = run(args, {
    tmp,
    json: false,
    env: {NODE_OPTIONS: `--import ${pathToFileURL(preload).href}`},
  });
  expect(warm.status, `${id}: ${warm.stderr}`).toBe(0);
  const urls = new Set(
    fs.readFileSync(loads, 'utf8').split('\n').filter(Boolean),
  );
  let moduleBytes = 0;
  for (const url of urls) moduleBytes += fs.statSync(fileURLToPath(url)).size;
  return {
    modules: urls.size,
    moduleBytes,
    ...JSON.parse(fs.readFileSync(tally, 'utf8')),
  };
}

/**
 * The report: one row per command, each count beside its change from the
 * recorded count, and the commands whose counts rose notably.
 * @param {Record<string, Record<string, number>>} measured
 * @param {Record<string, Record<string, number>>} recorded
 * @returns {string}
 */
function report(measured, recorded) {
  const keys = Object.keys(COLUMNS);
  const lines = [
    'Command costs: one warm run in the packed-CLI project, against packages/cli/test/command-costs.json',
    '',
    `| Command | ${Object.values(COLUMNS).join(' | ')} |`,
    `| --- | ${keys.map(() => '---:').join(' | ')} |`,
  ];
  /** @type {string[]} */
  const rises = [];
  for (const [id, counts] of Object.entries(measured)) {
    const cells = keys.map(key => {
      const now = counts[key];
      const before = recorded[id]?.[key];
      if (before == null) return `${now} (new)`;
      if (now === before) return String(now);
      const change = before === 0 ? 1 : (now - before) / before;
      if (change > NOTABLE_RISE) {
        rises.push(
          `${id} ${COLUMNS[key].toLowerCase()} +${Math.round(change * 100)}%`,
        );
      }
      return `${now} (${now > before ? '+' : ''}${now - before})`;
    });
    lines.push(`| ${id} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  lines.push(
    rises.length
      ? `Rose more than ${NOTABLE_RISE * 100}%: ${rises.join(', ')}. Check that the new work is needed, then record the counts with UPDATE_COMMAND_COSTS=1.`
      : 'No count rose more than 5% over the recorded counts.',
  );
  return lines.join('\n');
}

describe.skipIf(process.platform !== 'linux')('command costs', () => {
  it.skipIf(!hasModuleHooks)(
    "reports each command's counts against the recorded counts",
    () => {
      /** @type {Record<string, Record<string, number>>} */
      const measured = {};
      for (const [id, args] of Object.entries(CASES)) {
        measured[id] = measure(id, args);
      }
      if (process.env.UPDATE_COMMAND_COSTS) {
        fs.writeFileSync(RECORDED, `${JSON.stringify(measured, null, 2)}\n`);
        return;
      }
      const text = report(
        measured,
        JSON.parse(fs.readFileSync(RECORDED, 'utf8')),
      );
      console.log(text);
      if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
      }
    },
    300_000,
  );
});
