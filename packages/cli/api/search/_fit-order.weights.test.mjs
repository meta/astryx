// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fit pass without readable block-picker weights: when build's
 * loader finds the weights file missing or broken, search keeps the order it
 * has without the pass and does not throw. Each case runs in its own process,
 * because the loader reads the file once per process. A search whose pass
 * cannot move anything never reads the file.
 */

import {execFileSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import {requireNatively} from '../../test-utils/native-require.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('./search.mjs')} */
const {search} = require('./search.mjs');
/** @type {typeof import('./_adapter.mjs')} */
const {loadSearchData} = require('./_adapter.mjs');

/** A query whose answer the fit pass changes. */
const QUERY = 'table with row selection';

// The child imports these, so they stay file URLs: a Windows path such as
// `D:\...` reads to the ESM loader as a URL with the scheme `d:`.
const SEARCH = new URL('./search.mjs', import.meta.url).href;
const BUILD_ADAPTER = new URL('../build/_adapter.mjs', import.meta.url).href;

/** @param {any} response */
const names = response => response.data.results.map(r => r.name);

/**
 * The answer's names, and whether build's loader found weights, in a process
 * where every read of the weights file does `onRead` instead.
 * @param {string} onRead a statement that throws or returns the file's text
 * @param {string} [query]
 * @returns {{names: string[], picker: boolean, reads: number}}
 */
function searchWithWeightsFile(onRead, query = QUERY) {
  const patch = [
    "import fs from 'node:fs';",
    'const read = fs.readFileSync;',
    'globalThis.weightReads = 0;',
    'fs.readFileSync = function (file, ...rest) {',
    "  if (String(file).endsWith('blocks.weights.json')) {",
    '    globalThis.weightReads++;',
    `    ${onRead}`,
    '  }',
    '  return read.call(this, file, ...rest);',
    '};',
  ].join('\n');
  const script = [
    `const {search} = await import(${JSON.stringify(SEARCH)});`,
    `const {loadBlockPicker} = await import(${JSON.stringify(BUILD_ADAPTER)});`,
    `const response = await search(${JSON.stringify(query)});`,
    'const reads = globalThis.weightReads;',
    'process.stdout.write(JSON.stringify({',
    '  names: response.data.results.map(r => r.name),',
    '  picker: loadBlockPicker() !== null,',
    '  reads,',
    '}));',
  ].join('\n');
  const out = execFileSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(patch)}`,
      '--input-type=module',
      '--eval',
      script,
    ],
    {encoding: 'utf8'},
  );
  return JSON.parse(out);
}

/**
 * The answer with the fit pass given no weights, in this process.
 * @returns {Promise<string[]>}
 */
async function answerWithoutWeights() {
  const data = loadSearchData();
  const picker = Object.getOwnPropertyDescriptor(data, 'picker');
  Object.defineProperty(data, 'picker', {value: null, configurable: true});
  try {
    return names(await search(QUERY));
  } finally {
    if (picker) Object.defineProperty(data, 'picker', picker);
  }
}

describe('the fit pass without readable weights', () => {
  it('keeps the order when the weights file is missing', async () => {
    const without = await answerWithoutWeights();
    expect(names(await search(QUERY))).not.toEqual(without);
    const missing = searchWithWeightsFile(
      "throw Object.assign(new Error('missing'), {code: 'ENOENT'});",
    );
    expect(missing).toEqual({names: without, picker: false, reads: 1});
  }, 60_000);

  it('keeps the order when the weights file is not the picker’s shape', async () => {
    const without = await answerWithoutWeights();
    const broken = searchWithWeightsFile('return \'{"vocab": 3}\';');
    expect(broken).toEqual({names: without, picker: false, reads: 1});
    const unparsable = searchWithWeightsFile("return 'not json';");
    expect(unparsable).toEqual({names: without, picker: false, reads: 1});
  }, 60_000);

  it('never reads the weights when the pass cannot move anything', () => {
    const named = searchWithWeightsFile(
      'return read.call(this, file, ...rest);',
      'Button',
    );
    expect(named.reads).toBe(0);
  }, 60_000);
});
