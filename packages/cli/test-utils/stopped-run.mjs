// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Run one `experimental theme` API call in a child process that is
 * stopped part way, as a kill would stop it ({@link ./stop-at-step.mjs}):
 * what a stopped command leaves on disk is then read by the next command,
 * in the test's own process.
 *
 * @position test-utils — used by the preview safety tests
 */

import {spawn} from 'node:child_process';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {STOPPED_CODE} from './stop-at-step.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = pathToFileURL(path.join(here, 'stop-at-step.mjs')).href;
const API = pathToFileURL(
  path.join(here, '../api/theme-edit/theme-edit.mjs'),
).href;

/**
 * Call `fn` of the editor's API with `args` in a child process stopped
 * after the step `rule` names. Resolves whether the stop came at that
 * step (a call that finished or refused before it is not stopped), and
 * the child's stderr.
 * @param {string} fn an export of theme-edit.mjs (`themeEditPreviewAdd`)
 * @param {unknown[]} args JSON arguments
 * @param {{after: 'pending' | 'rename' | 'delete', n: number}} rule
 * @returns {Promise<{stopped: boolean, stderr: string}>}
 */
export function stoppedRun(fn, args, rule) {
  const call = `const m = await import(${JSON.stringify(API)});\nawait m[${JSON.stringify(fn)}](...${JSON.stringify(args)});\n`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        PRELOAD,
        '--input-type=module',
        '--eval',
        call,
        // The stop rule, on the child's own command line.
        '--',
        '--stop-at',
        JSON.stringify(rule),
      ],
      {stdio: ['ignore', 'ignore', 'pipe']},
    );
    let stderr = '';
    child.stderr.on('data', d => {
      stderr += d;
    });
    child.on('error', reject);
    child.on('close', code =>
      resolve({stopped: code === STOPPED_CODE, stderr}),
    );
  });
}
