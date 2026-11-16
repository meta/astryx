// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme microtask exceptions keep the load that created the callback,
 * including on runtimes that report the exception outside its async context.
 * @input Guarded callbacks in real Node subprocesses.
 * @output Refused loads, late warnings, and unchanged unrelated exceptions.
 * @position Regression tests for module-loader.mjs and its exception classifier.
 */

import {describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';

const LOADER_URL = new URL('./module-loader.mjs', import.meta.url).href;
const REJECTIONS_URL = new URL('./theme-module-rejections.mjs', import.meta.url)
  .href;

/** @param {string} body */
function run(body) {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {withEmptyStylesheets} from ${JSON.stringify(LOADER_URL)};
import {themeModuleException} from ${JSON.stringify(REJECTIONS_URL)};
const seen = [];
process.on('uncaughtException', error => seen.push(themeModuleException(error)));
${body}`,
    ],
    {encoding: 'utf8', timeout: 60_000},
  );
  expect(result.signal, result.stderr).toBeNull();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}

describe('a theme microtask exception', () => {
  it.each(["new Error('micro')", "'micro'"])(
    'refuses its own load when it throws %s',
    thrown => {
      const result = run(`let refused = null;
try {
  await withEmptyStylesheets(async () => {
    queueMicrotask(() => { throw ${thrown}; });
    await new Promise(resolve => setImmediate(resolve));
  });
} catch (error) {
  refused = String(error?.message ?? error);
}
await new Promise(resolve => setImmediate(resolve));
process.stdout.write(JSON.stringify({refused, seen}));`);
      expect(result).toEqual({refused: 'micro', seen: ['']});
    },
  );

  it('remains a warning when the callback runs after its load', () => {
    const result = run(`await withEmptyStylesheets(async () => {
  setImmediate(() => queueMicrotask(() => { throw new Error('late'); }));
});
await new Promise(resolve => setImmediate(resolve));
process.stdout.write(JSON.stringify(seen));`);
    expect(result).toEqual([
      "Warning: a theme module's callback threw after it loaded (late); the theme was read as the module exported it.",
    ]);
  });

  it('does not claim an unrelated exception while a load is in flight', () => {
    const result = run(`const load = withEmptyStylesheets(async () => {
  await new Promise(resolve => setImmediate(resolve));
  return 'loaded';
});
queueMicrotask(() => { throw new Error('outside'); });
const loaded = await load;
process.stdout.write(JSON.stringify({loaded, seen}));`);
    expect(result).toEqual({loaded: 'loaded', seen: [null]});
  });

  it('preserves native callback validation', () => {
    const result = run(`let code;
try {
  await withEmptyStylesheets(async () => queueMicrotask(null));
} catch (error) {
  code = error.code;
}
process.stdout.write(JSON.stringify({code, seen}));`);
    expect(result).toEqual({code: 'ERR_INVALID_ARG_TYPE', seen: []});
  });
});
