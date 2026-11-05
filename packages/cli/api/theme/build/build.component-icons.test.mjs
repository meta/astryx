// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Built themes carry static component icon slots and resolve them as
 *   runtime.
 * @input Real themeBuild and themeBuildFamily calls on source themes whose
 *   `componentIcons` hold names, `null`, and requests, and on a theme with a
 *   slot function.
 * @output Native ESM loads that resolve each slot under the built and the
 *   runtime theme and read the `componentIcons` view; a rejected build.
 * @position Theme build parity for component icon slots. The node project's
 *   global setup supplies the compiled core package.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeBuild, themeBuildFamily} from './build.mjs';

let tmpDir;
beforeEach(() => {
  // Under the CLI package, so core and React resolve both in the theme loader
  // and in the native artifact checks.
  tmpDir = fs.mkdtempSync(
    path.resolve(import.meta.dirname, '../../..', '.tmp-component-icons-'),
  );
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {string} file @param {string} source */
function write(file, source) {
  fs.mkdirSync(path.dirname(path.join(tmpDir, file)), {recursive: true});
  fs.writeFileSync(path.join(tmpDir, file), source);
}

/** @param {string} file */
async function buildAndCheck(file) {
  const built = await themeBuild(file, {}, {cwd: tmpDir});
  expect(built?.type).toBe('theme.build');
  const checked = await themeBuild(file, {check: true}, {cwd: tmpDir});
  expect(checked?.data.upToDate).toBe(true);
}

const SLOTS = ['code-block-copy', 'parity-panel-dismiss', 'parity-tab-close'];

/**
 * Load built and runtime themes with native Node and report, for each pair,
 * how each slot resolves for the copy button's states and what
 * `componentIcons` reads back.
 *
 * @param {Array<{label: string, built: string, runtime: string}>} pairs -
 *   Module specifiers with `#export` suffixes, relative to the fixture root.
 */
function inspect(pairs) {
  const load = specifier => {
    const [file, name] = specifier.split('#');
    return `(await import(${JSON.stringify(file)}))[${JSON.stringify(name)}]`;
  };
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const {resolveComponentIcon} = await import(
  import.meta.resolve('@astryxdesign/core/Icon').replace(/index\\.js$/, 'globalIconRegistry.js')
);
const describe = theme => ({
  resolved: Object.fromEntries(
    ${JSON.stringify(SLOTS)}.flatMap(slot =>
      [false, true].map(copied => [
        slot + '|' + copied,
        resolveComponentIcon(slot, {copied}, {icon: copied ? 'check' : 'copy', size: 'sm'}, theme),
      ]),
    ),
  ),
  componentIcons: theme.componentIcons ?? null,
});
const result = {};
${pairs
  .map(
    ({label, built, runtime}) => `{
  const built = ${load(built)};
  const runtime = ${load(runtime)};
  result[${JSON.stringify(label)}] = {built: describe(built), runtime: describe(runtime)};
}`,
  )
  .join('\n')}
process.stdout.write(JSON.stringify(result));`,
    ],
    {cwd: tmpDir, encoding: 'utf8', timeout: 60000},
  );
  return JSON.parse(output);
}

function writeLineage() {
  write(
    'base/source.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';
export const baseTheme = defineTheme({
  name: 'slots-base', tokens: {},
  componentIcons: {'code-block-copy': 'clock', 'parity-panel-dismiss': {icon: 'close', size: 'sm'}},
});
export default baseTheme;
`,
  );
  write(
    'child/source.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/source.mjs';
export const childTheme = defineTheme({
  name: 'slots-child', extends: baseTheme, tokens: {},
  componentIcons: {'parity-panel-dismiss': null, 'parity-tab-close': {size: 'xsm'}, 'code-block-copy': undefined},
});
export default childTheme;
`,
  );
}

describe('built themes keep static component icon slots', () => {
  it('resolve every slot as the runtime theme does, through a built base', async () => {
    writeLineage();
    await buildAndCheck('base/source.mjs');
    // A child extends the BUILT base module.
    write(
      'built-child/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {slotsBaseTheme} from '../base/slots-base.js';
export default defineTheme({
  name: 'slots-built-child', extends: slotsBaseTheme, tokens: {},
  componentIcons: {'parity-tab-close': 'menu'},
});
`,
    );
    await buildAndCheck('child/source.mjs');
    await buildAndCheck('built-child/source.mjs');

    const module = fs.readFileSync(
      path.join(tmpDir, 'base/slots-base.js'),
      'utf8',
    );
    expect(module).not.toMatch(/^import /m);

    const result = inspect([
      {
        label: 'base',
        built: './base/slots-base.js#slotsBaseTheme',
        runtime: './base/source.mjs#default',
      },
      {
        label: 'child',
        built: './child/slots-child.js#slotsChildTheme',
        runtime: './child/source.mjs#default',
      },
      {
        label: 'builtChild',
        built: './built-child/slots-built-child.js#slotsBuiltChildTheme',
        runtime: './built-child/source.mjs#default',
      },
    ]);
    for (const {built, runtime} of Object.values(result)) {
      expect(built).toEqual(runtime);
    }
    expect(result.child.built.componentIcons).toEqual({
      'code-block-copy': 'clock',
      'parity-panel-dismiss': null,
      'parity-tab-close': {size: 'xsm'},
    });
    expect(result.builtChild.built.resolved).toMatchObject({
      'code-block-copy|true': {icon: 'clock', size: 'sm'},
      'parity-panel-dismiss|false': {icon: 'close', size: 'sm'},
      'parity-tab-close|false': {icon: 'menu', size: 'sm'},
    });
  });

  it('keeps static slots in a family build', async () => {
    writeLineage();
    const receipt = await themeBuildFamily(
      ['base/source.mjs', 'child/source.mjs'],
      {familyKey: 'slots-family'},
      {cwd: tmpDir},
    );
    expect(receipt?.type).toBe('theme.build');
    const familyModule = `./${receipt.data.outputs.js}`;

    const result = inspect([
      {
        label: 'base',
        built: `${familyModule}#slotsBaseTheme`,
        runtime: './base/source.mjs#default',
      },
      {
        label: 'child',
        built: `${familyModule}#slotsChildTheme`,
        runtime: './child/source.mjs#default',
      },
    ]);
    expect(result.base.built).toEqual(result.base.runtime);
    expect(result.child.built).toEqual(result.child.runtime);
  });
});

describe('a slot function fails the build', () => {
  it.each([
    [
      'an inline slot function',
      `componentIcons: {'code-block-copy': ({copied}) => ({icon: copied ? 'check' : 'copy'})}`,
    ],
    [
      'an imported slot function',
      `componentIcons: {'code-block-copy': copySlot}`,
    ],
  ])('rejects %s before writing', async (_label, field) => {
    write('slots.mjs', `export const copySlot = () => ({icon: 'clock'});\n`);
    write(
      'functions.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {copySlot} from './slots.mjs';
export default defineTheme({name: 'slot-functions', tokens: {}, ${field}});
`,
    );

    await expect(
      themeBuild('functions.mjs', {}, {cwd: tmpDir}),
    ).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringContaining('componentIcons["code-block-copy"]'),
    });
    expect(fs.readdirSync(tmpDir).sort()).toEqual([
      'functions.mjs',
      'slots.mjs',
    ]);
  });
});
