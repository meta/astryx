// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Built themes carry component icon slots and resolve them as runtime.
 * @input Real themeBuild and themeBuildFamily calls on source themes whose
 *   `componentIcons` hold static values and slot functions: an imported map, a
 *   child with inline static slots and an imported slot function, a theme
 *   extending a built module, a theme extending a package theme, and a family.
 * @output Native ESM loads that resolve every slot for each state under the
 *   built and the runtime theme, read the static `componentIcons` view, and
 *   render CodeBlock's copy button.
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

const SLOT_FUNCTIONS = `export const copySlot = ({copied}) =>
  copied ? {icon: 'checkDouble', size: 'lg'} : {icon: 'clock'};
export const baseSlots = {
  'code-block-copy': copySlot,
  'parity-panel-dismiss': {icon: 'close', size: 'sm'},
  'parity-nav-leading': ({selected}) => (selected ? null : undefined),
};
`;

/** A base with an imported slot map, and a child with inline slots. */
function writeLineage() {
  write('base/slots.mjs', SLOT_FUNCTIONS);
  write(
    'base/source.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {baseSlots} from './slots.mjs';
export const baseTheme = defineTheme({
  name: 'slots-base', tokens: {}, componentIcons: baseSlots,
});
export default baseTheme;
`,
  );
  write(
    'child/source.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/source.mjs';
import {copySlot} from '../base/slots.mjs';
export const childTheme = defineTheme({
  name: 'slots-child', extends: baseTheme, tokens: {},
  componentIcons: {
    'parity-panel-dismiss': null,
    'parity-tab-close': {size: 'xsm'},
    'parity-copy-again': copySlot,
    'parity-nav-leading': undefined,
  },
});
export default childTheme;
`,
  );
}

/** @param {string} file */
async function buildAndCheck(file) {
  const built = await themeBuild(file, {}, {cwd: tmpDir});
  expect(built?.type).toBe('theme.build');
  const checked = await themeBuild(file, {check: true}, {cwd: tmpDir});
  expect(checked?.data.upToDate).toBe(true);
  return built;
}

/**
 * Load built and runtime themes with native Node and report, for each pair,
 * how every slot resolves for each state, the static view, and the glyph in
 * CodeBlock's copy button.
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
      `import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {Theme} from '@astryxdesign/core/theme';
const {resolveComponentIcon} = await import(
  import.meta.resolve('@astryxdesign/core/Icon').replace(/index\\.js$/, 'globalIconRegistry.js')
);
const SLOTS = {
  'code-block-copy': [{copied: false}, {copied: true}],
  'parity-copy-again': [{copied: false}, {copied: true}],
  'parity-panel-dismiss': [undefined],
  'parity-tab-close': [undefined],
  'parity-nav-leading': [{selected: false}, {selected: true}],
};
const copyGlyph = theme => {
  const html = renderToStaticMarkup(
    createElement(Theme, {theme}, createElement(CodeBlock, {code: 'x'})),
  );
  return /astryx-code-block-copy-button[^>]*>(.*?)<\\/button>/s.exec(html)?.[1] ?? null;
};
const describe = theme => ({
  resolved: Object.fromEntries(
    Object.entries(SLOTS).flatMap(([slot, states]) =>
      states.map(state => [
        slot + '|' + JSON.stringify(state ?? null),
        resolveComponentIcon(slot, state, {icon: 'copy', size: 'sm'}, theme),
      ]),
    ),
  ),
  componentIcons: theme.componentIcons ?? null,
  staticViewHasFunction: Object.values(theme.componentIcons ?? {}).some(
    value => typeof value === 'function',
  ),
  copyGlyph: copyGlyph(theme),
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

describe('built themes keep component icon slots', () => {
  it('resolve every slot and state as the runtime theme does', async () => {
    writeLineage();
    await buildAndCheck('base/source.mjs');
    await buildAndCheck('child/source.mjs');
    // A grandchild extends the BUILT child module and adds a static slot.
    write(
      'grandchild/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {slotsChildTheme} from '../child/slots-child.js';
export default defineTheme({
  name: 'slots-grandchild', extends: slotsChildTheme, tokens: {},
  componentIcons: {'parity-tab-close': 'menu'},
});
`,
    );
    await buildAndCheck('grandchild/source.mjs');

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
        label: 'grandchild',
        built: './grandchild/slots-grandchild.js#slotsGrandchildTheme',
        runtime: './grandchild/source.mjs#default',
      },
    ]);

    for (const {built, runtime} of Object.values(result)) {
      expect(built).toEqual(runtime);
      expect(built.staticViewHasFunction).toBe(false);
    }

    const child = result.child.built;
    expect(child.resolved).toEqual({
      'code-block-copy|{"copied":false}': {icon: 'clock', size: 'sm'},
      'code-block-copy|{"copied":true}': {icon: 'checkDouble', size: 'lg'},
      'parity-copy-again|{"copied":false}': {icon: 'clock', size: 'sm'},
      'parity-copy-again|{"copied":true}': {icon: 'checkDouble', size: 'lg'},
      'parity-panel-dismiss|null': {icon: null, size: 'sm'},
      'parity-tab-close|null': {icon: 'copy', size: 'xsm'},
      // An undefined entry inherits the base's slot function.
      'parity-nav-leading|{"selected":false}': {icon: 'copy', size: 'sm'},
      'parity-nav-leading|{"selected":true}': {icon: null, size: 'sm'},
    });
    // The static view leaves out every slot function.
    expect(child.componentIcons).toEqual({
      'parity-panel-dismiss': null,
      'parity-tab-close': {size: 'xsm'},
    });
    expect(result.grandchild.built.resolved['parity-tab-close|null']).toEqual({
      icon: 'menu',
      size: 'sm',
    });
    expect(child.copyGlyph).toContain('data-size="sm"');
  });

  it('writes static slots as JSON with no import', async () => {
    write(
      'static.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
export default defineTheme({
  name: 'slots-static', tokens: {},
  componentIcons: {'code-block-copy': 'clock', 'parity-panel-dismiss': null},
});
`,
    );
    await buildAndCheck('static.mjs');

    const module = fs.readFileSync(
      path.join(tmpDir, 'slots-static.js'),
      'utf8',
    );
    expect(module).not.toMatch(/^import /m);
    expect(module).not.toContain('__componentIcons');
    const {staticSlots} = inspect([
      {
        label: 'staticSlots',
        built: './slots-static.js#slotsStaticTheme',
        runtime: './static.mjs#default',
      },
    ]);
    expect(staticSlots.built).toEqual(staticSlots.runtime);
    expect(staticSlots.built.componentIcons).toEqual({
      'code-block-copy': 'clock',
      'parity-panel-dismiss': null,
    });
  });

  it('keeps the slot functions of a package theme it extends', async () => {
    const pkg = 'node_modules/@fixture/slot-functions';
    write(
      `${pkg}/package.json`,
      JSON.stringify({
        name: '@fixture/slot-functions',
        type: 'module',
        exports: './index.mjs',
      }),
    );
    write(`${pkg}/slots.mjs`, SLOT_FUNCTIONS);
    write(
      `${pkg}/index.mjs`,
      `import {defineTheme} from '@astryxdesign/core/theme';
import {baseSlots} from './slots.mjs';
export const packageTheme = defineTheme({
  name: 'slots-package', tokens: {}, componentIcons: baseSlots,
});
`,
    );
    write(
      'package-child.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {packageTheme} from '@fixture/slot-functions';
export default defineTheme({
  name: 'slots-package-child', extends: packageTheme, tokens: {},
  componentIcons: {'parity-tab-close': 'menu'},
});
`,
    );
    await buildAndCheck('package-child.mjs');

    const {packageChild} = inspect([
      {
        label: 'packageChild',
        built: './slots-package-child.js#slotsPackageChildTheme',
        runtime: './package-child.mjs#default',
      },
    ]);

    expect(packageChild.built).toEqual(packageChild.runtime);
    expect(
      packageChild.built.resolved['code-block-copy|{"copied":true}'],
    ).toEqual({icon: 'checkDouble', size: 'lg'});
  });

  it('keeps slot functions in a family build', async () => {
    writeLineage();
    // A member that sets no slots of its own inherits the child's values.
    write(
      'inherit/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {childTheme} from '../child/source.mjs';
export default defineTheme({name: 'slots-inherit', extends: childTheme, tokens: {}});
`,
    );
    // The child's inline slot function cannot be carried in family output;
    // a family child supplies its own static slots only.
    write(
      'child/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/source.mjs';
export const childTheme = defineTheme({
  name: 'slots-child', extends: baseTheme, tokens: {},
  componentIcons: {'parity-panel-dismiss': null, 'parity-tab-close': {size: 'xsm'}},
});
export default childTheme;
`,
    );
    const receipt = await themeBuildFamily(
      ['base/source.mjs', 'child/source.mjs', 'inherit/source.mjs'],
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
      {
        label: 'inherit',
        built: `${familyModule}#slotsInheritTheme`,
        runtime: './inherit/source.mjs#default',
      },
    ]);

    expect(result.base.built).toEqual(result.base.runtime);
    expect(result.child.built).toEqual(result.child.runtime);
    expect(result.inherit.built).toEqual(result.inherit.runtime);
    expect(
      result.child.built.resolved['code-block-copy|{"copied":true}'],
    ).toEqual({icon: 'checkDouble', size: 'lg'});
  });
});

describe('the static view never captures a slot binding', () => {
  it.each(['slot', 'Object'])(
    'loads a built theme whose slot map is imported as `%s`',
    async binding => {
      write('slots.mjs', SLOT_FUNCTIONS);
      write(
        'bound.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {baseSlots as ${binding}} from './slots.mjs';
export default defineTheme({name: 'bound-slots', tokens: {}, componentIcons: ${binding}});
`,
      );
      await buildAndCheck('bound.mjs');

      const {bound} = inspect([
        {
          label: 'bound',
          built: './bound-slots.js#boundSlotsTheme',
          runtime: './bound.mjs#default',
        },
      ]);
      expect(bound.built).toEqual(bound.runtime);
      expect(bound.built.componentIcons).toEqual({
        'parity-panel-dismiss': {icon: 'close', size: 'sm'},
      });
    },
  );
});

describe('a slot function the build cannot carry fails the build', () => {
  it.each([
    [
      'an inline slot function',
      `componentIcons: {'code-block-copy': ({copied}) => ({icon: copied ? 'check' : 'copy'})}`,
    ],
    [
      'a slot function beside a spread map',
      `componentIcons: {...baseSlots, 'code-block-copy': () => null}`,
    ],
  ])('rejects %s before writing', async (_label, field) => {
    write('slots.mjs', SLOT_FUNCTIONS);
    write(
      'inline.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {baseSlots} from './slots.mjs';
export default defineTheme({name: 'inline-slots', tokens: {}, ${field}});
`,
    );

    await expect(
      themeBuild('inline.mjs', {}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
    expect(fs.readdirSync(tmpDir).sort()).toEqual(['inline.mjs', 'slots.mjs']);
  });
});
