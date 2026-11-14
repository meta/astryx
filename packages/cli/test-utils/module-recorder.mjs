// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A preload that records every module a CLI run loads, and can count
 *   the run's file-system reads, for tests that check what a run loads.
 * @input A folder to write the preload, its module hook and its logs into.
 * @output `moduleRecorder(dir, {countFs})`: the preload to pass with
 *   `--import`, the log of the URLs the run loaded (one per line), and the
 *   file the run's read counts are written to when it exits (with
 *   `countFs`).
 * @position Test support for clients/cli/startup-imports.test.mjs and
 *   test/command-cost.test.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

/**
 * Write the module hook and the preload into `dir`, with an empty log. The
 * log paths are written into the preload's source, never passed in the
 * environment: a kept gather records the variables it reads, so a variable
 * that changed from run to run would make it miss.
 * @param {string} dir
 * @param {{countFs?: boolean}} [options] - also count the run's file reads,
 *   folder reads and path checks
 * @returns {{preload: string, loads: string, counts: string}}
 */
export function moduleRecorder(dir, {countFs = false} = {}) {
  fs.mkdirSync(dir, {recursive: true});
  const loads = path.join(dir, 'loaded.txt');
  const counts = path.join(dir, 'fs-counts.json');
  fs.rmSync(loads, {force: true});
  fs.rmSync(counts, {force: true});
  const hook = path.join(dir, 'record-loaded.mjs');
  fs.writeFileSync(
    hook,
    [
      "import {appendFileSync} from 'node:fs';",
      // Loads, not resolutions: resolving a package reads no module of it.
      'export async function load(url, context, nextLoad) {',
      '  const result = await nextLoad(url, context);',
      `  appendFileSync(${JSON.stringify(loads)}, url + '\\n');`,
      '  return result;',
      '}',
      '',
    ].join('\n'),
  );
  const preload = path.join(dir, 'register-loaded.mjs');
  fs.writeFileSync(
    preload,
    [
      "import fs from 'node:fs';",
      "import Module, {register, syncBuiltinESMExports} from 'node:module';",
      "import {isAbsolute} from 'node:path';",
      "import {pathToFileURL} from 'node:url';",
      ...(countFs
        ? [
            'const counts = {fileReads: 0, folderReads: 0, pathChecks: 0};',
            'const count = (names, key) => {',
            '  for (const name of names) {',
            '    const original = fs[name];',
            '    const counted = function (...args) {',
            '      counts[key] += 1;',
            '      return original.apply(this, args);',
            '    };',
            '    fs[name] = Object.assign(counted, original);',
            '  }',
            '};',
            "count(['readFileSync', 'readFile'], 'fileReads');",
            "count(['readdirSync', 'readdir', 'opendirSync'], 'folderReads');",
            "count(['statSync', 'lstatSync', 'existsSync', 'realpathSync', 'accessSync'], 'pathChecks');",
            'syncBuiltinESMExports();',
            `process.on('exit', () => fs.writeFileSync(${JSON.stringify(counts)}, JSON.stringify(counts)));`,
          ]
        : []),
      // Async module hooks do not observe CommonJS require calls: note each
      // CommonJS module as it loads.
      'const load = Module.prototype.load;',
      'Module.prototype.load = function (file, ...rest) {',
      '  if (isAbsolute(file)) {',
      `    fs.appendFileSync(${JSON.stringify(loads)}, pathToFileURL(file).href + '\\n');`,
      '  }',
      '  return load.call(this, file, ...rest);',
      '};',
      `register(${JSON.stringify(pathToFileURL(hook).href)});`,
      '',
    ].join('\n'),
  );
  return {preload, loads, counts};
}
