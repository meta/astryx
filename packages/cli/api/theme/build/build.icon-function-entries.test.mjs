// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Built themes carry function icon entries and resolve them as runtime.
 * @input Real themeBuild and themeBuildFamily calls on source themes whose icon
 *   registries hold functions of `{size, variant}` and that list icon variants:
 *   a child under a replaced list, a theme extending a built module, a theme
 *   extending a package theme, and a family.
 * @output Native ESM loads that render `<Icon>` for every request a theme's
 *   entries can receive under the built and the runtime theme, read the public
 *   icon views, and a TypeScript program that extends a built theme.
 * @position `architecture:theme-compilation` INV15 and `spec:AST-087` FR3,
 *   FR18, and FR19 for theme build. The node project's global setup supplies
 *   the compiled core package.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import {themeBuild, themeBuildFamily} from './build.mjs';

const SIZES = ['xsm', 'sm', 'md', 'lg'];

let tmpDir;
beforeEach(() => {
  // Under the CLI package, so core, React, and TypeScript resolve both in the
  // theme loader and in the native artifact checks.
  tmpDir = fs.mkdtempSync(
    path.resolve(import.meta.dirname, '../../..', '.tmp-icon-functions-'),
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

/** A registry module whose function entries label what they were asked for. */
function writeRegistry(file, exportName, entries) {
  write(
    file,
    `import {createElement} from 'react';
const draw = label => ({size, variant}) =>
  createElement('svg', {'data-icon': label + ':' + size + ':' + (variant ?? 'normal')});
export const ${exportName} = {
${Object.entries(entries)
  .map(([key, label]) =>
    label.startsWith('node:')
      ? `  ${JSON.stringify(key)}: createElement('svg', {'data-icon': ${JSON.stringify(label.slice(5))}}),`
      : `  ${JSON.stringify(key)}: draw(${JSON.stringify(label)}),`,
  )
  .join('\n')}
};
`,
  );
}

/** The base, its child under a replaced list, and their registries. */
function writeLineage() {
  writeRegistry('base/icons.mjs', 'baseIcons', {
    info: 'base-info',
    close: 'base-close',
    check: 'node:base-check',
    'parity:mark': 'base-mark',
  });
  write(
    'base/source.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {baseIcons} from './icons.mjs';
export const baseTheme = defineTheme({
  name: 'parity-base', tokens: {}, iconVariants: ['outline', 'filled'], icons: baseIcons,
});
export default baseTheme;
`,
  );
  writeRegistry('child/icons.mjs', 'childIcons', {
    close: 'child-close',
    menu: 'child-menu',
  });
  write(
    'child/source.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';
import {baseTheme} from '../base/source.mjs';
import {childIcons} from './icons.mjs';
export const childTheme = defineTheme({
  name: 'parity-child', extends: baseTheme, tokens: {},
  iconVariants: ['filled', 'bold'], icons: childIcons,
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
 * what `<Icon>` renders for every request and what the public reads return.
 * The requests are every key a theme draws × the four sizes × no variant and
 * each name any theme here lists, so unlisted names are covered too.
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
      `import {createElement, isValidElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Icon, getIcon, getIconRegistry} from '@astryxdesign/core/Icon';
import {Theme} from '@astryxdesign/core/theme';
const SIZES = ${JSON.stringify(SIZES)};
const VARIANTS = [undefined, 'outline', 'filled', 'bold'];
const label = node => {
  if (node == null) return null;
  if (!isValidElement(node)) return 'not-a-node:' + typeof node;
  return node.props['data-icon'];
};
const rendered = (theme, icon, size, variant) => {
  const html = renderToStaticMarkup(
    createElement(Theme, {theme}, createElement(Icon, {icon, size, variant})),
  );
  return /data-icon="([^"]+)"/.exec(html)?.[1] ?? null;
};
const describe = theme => {
  const keys = Object.keys(theme.icons ?? {}).sort();
  const requests = {};
  for (const key of keys) {
    for (const size of SIZES) {
      for (const variant of VARIANTS) {
        requests[key + '|' + size + '|' + (variant ?? '-')] = rendered(theme, key, size, variant);
      }
    }
  }
  return {
    keys,
    requests,
    icons: Object.fromEntries(keys.map(key => [key, label(theme.icons[key])])),
    getIcon: Object.fromEntries(keys.map(key => [key, label(getIcon(key, theme))])),
    registry: Object.fromEntries(
      Object.entries(getIconRegistry(theme))
        .filter(([key]) => keys.includes(key))
        .map(([key, node]) => [key, label(node)]),
    ),
    iconVariants: theme.iconVariants ?? null,
  };
};
const result = {};
${pairs
  .map(
    ({label, built, runtime}) => `{
  const built = ${load(built)};
  const runtime = ${load(runtime)};
  const mod = await import(${JSON.stringify(built.split('#')[0])});
  const reexports = Object.entries(mod).filter(([name]) => name !== ${JSON.stringify(built.split('#')[1])});
  result[${JSON.stringify(label)}] = {
    built: describe(built),
    runtime: describe(runtime),
    reexportIsNodeView: reexports.length === 0 ? null : reexports.every(([, value]) => value === built.icons),
  };
}`,
  )
  .join('\n')}
process.stdout.write(JSON.stringify(result));`,
    ],
    {cwd: tmpDir, encoding: 'utf8', timeout: 60000},
  );
  return JSON.parse(output);
}

describe('built themes keep function icon entries', () => {
  it('resolve every request as the runtime theme does, including an inherited entry under a replaced list', async () => {
    writeLineage();
    await buildAndCheck('base/source.mjs');
    await buildAndCheck('child/source.mjs');
    // A grandchild extends the BUILT child module.
    write(
      'grandchild/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {parityChildTheme} from '../child/parity-child.js';
export default defineTheme({name: 'parity-grandchild', extends: parityChildTheme, tokens: {}});
`,
    );
    await buildAndCheck('grandchild/source.mjs');

    const result = inspect([
      {
        label: 'base',
        built: './base/parity-base.js#parityBaseTheme',
        runtime: './base/source.mjs#default',
      },
      {
        label: 'child',
        built: './child/parity-child.js#parityChildTheme',
        runtime: './child/source.mjs#default',
      },
      {
        label: 'grandchild',
        built: './grandchild/parity-grandchild.js#parityGrandchildTheme',
        runtime: './grandchild/source.mjs#default',
      },
    ]);

    for (const {built, runtime, reexportIsNodeView} of Object.values(result)) {
      // INV15: built resolution and public views match runtime.
      expect(built).toEqual(runtime);
      expect(reexportIsNodeView).not.toBe(false);
    }

    const child = result.child.built;
    expect(child.keys).toEqual([
      'check',
      'close',
      'info',
      'menu',
      'parity:mark',
    ]);
    for (const size of SIZES) {
      // The child's own entry receives the names the child lists.
      expect(child.requests[`close|${size}|bold`]).toBe(
        `child-close:${size}:bold`,
      );
      expect(child.requests[`close|${size}|filled`]).toBe(
        `child-close:${size}:filled`,
      );
      expect(child.requests[`close|${size}|outline`]).toBe(
        `child-close:${size}:normal`,
      );
      // The inherited entry keeps its defining theme's list: 'outline' is no
      // longer listed by the child, and the base never listed 'bold'.
      expect(child.requests[`info|${size}|filled`]).toBe(
        `base-info:${size}:filled`,
      );
      expect(child.requests[`info|${size}|outline`]).toBe(
        `base-info:${size}:normal`,
      );
      expect(child.requests[`info|${size}|bold`]).toBe(
        `base-info:${size}:normal`,
      );
      expect(child.requests[`info|${size}|-`]).toBe(`base-info:${size}:normal`);
      // A node entry renders the same node for every request.
      expect(child.requests[`check|${size}|filled`]).toBe('base-check');
    }
    expect(result.grandchild.built.requests).toEqual(child.requests);

    // FR18: public reads are React nodes, each function read at md.
    expect(child.icons).toEqual({
      check: 'base-check',
      close: 'child-close:md:normal',
      info: 'base-info:md:normal',
      menu: 'child-menu:md:normal',
      'parity:mark': 'base-mark:md:normal',
    });
    expect(child.getIcon).toEqual(child.icons);
    expect(child.registry).toEqual({
      check: 'base-check',
      close: 'child-close:md:normal',
      info: 'base-info:md:normal',
      menu: 'child-menu:md:normal',
    });
    expect(result.base.reexportIsNodeView).toBe(true);
    expect(result.child.reexportIsNodeView).toBe(true);
  });

  it('keeps the function entries of a package theme it extends', async () => {
    const pkg = 'node_modules/@fixture/function-icons';
    write(
      `${pkg}/package.json`,
      JSON.stringify({
        name: '@fixture/function-icons',
        type: 'module',
        exports: './index.mjs',
      }),
    );
    writeRegistry(`${pkg}/icons.mjs`, 'packageIcons', {info: 'package-info'});
    write(
      `${pkg}/index.mjs`,
      `import {defineTheme} from '@astryxdesign/core/theme';
import {packageIcons} from './icons.mjs';
export const packageTheme = defineTheme({
  name: 'parity-package', tokens: {}, iconVariants: ['filled'], icons: packageIcons,
});
`,
    );
    write(
      'package-child.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {packageTheme} from '@fixture/function-icons';
export default defineTheme({name: 'parity-package-child', extends: packageTheme, tokens: {}});
`,
    );
    await buildAndCheck('package-child.mjs');

    const {packageChild} = inspect([
      {
        label: 'packageChild',
        built: './parity-package-child.js#parityPackageChildTheme',
        runtime: './package-child.mjs#default',
      },
    ]);

    expect(packageChild.built).toEqual(packageChild.runtime);
    for (const size of SIZES) {
      expect(packageChild.built.requests[`info|${size}|filled`]).toBe(
        `package-info:${size}:filled`,
      );
    }
    expect(packageChild.built.icons).toEqual({info: 'package-info:md:normal'});
  });

  it('keeps function entries in a family build', async () => {
    writeLineage();
    // A member that sets no icons of its own inherits the child's entries.
    write(
      'inherit/source.mjs',
      `import {defineTheme} from '@astryxdesign/core/theme';
import {childTheme} from '../child/source.mjs';
export default defineTheme({name: 'parity-inherit', extends: childTheme, tokens: {}});
`,
    );
    const receipt = await themeBuildFamily(
      ['base/source.mjs', 'child/source.mjs', 'inherit/source.mjs'],
      {familyKey: 'parity-family'},
      {cwd: tmpDir},
    );
    expect(receipt?.type).toBe('theme.build');
    const familyModule = `./${receipt.data.outputs.js}`;

    const result = inspect([
      {
        label: 'base',
        built: `${familyModule}#parityBaseTheme`,
        runtime: './base/source.mjs#default',
      },
      {
        label: 'child',
        built: `${familyModule}#parityChildTheme`,
        runtime: './child/source.mjs#default',
      },
      {
        label: 'inherit',
        built: `${familyModule}#parityInheritTheme`,
        runtime: './inherit/source.mjs#default',
      },
    ]);

    expect(result.base.built).toEqual(result.base.runtime);
    expect(result.child.built).toEqual(result.child.runtime);
    expect(result.inherit.built).toEqual(result.inherit.runtime);
    expect(result.inherit.built.requests).toEqual(result.child.built.requests);
    expect(result.child.built.requests['info|sm|filled']).toBe(
      'base-info:sm:filled',
    );
    expect(result.child.built.requests['info|sm|outline']).toBe(
      'base-info:sm:normal',
    );
  });
});

describe('the node view never captures a registry binding', () => {
  it.each(['entries', 'nodes', 'name', 'entry', 'Object'])(
    'loads a built theme whose registry is imported as `%s`',
    async binding => {
      writeRegistry('icons.mjs', 'registry', {info: 'bound-info'});
      write(
        'bound.mjs',
        `import {defineTheme} from '@astryxdesign/core/theme';
import {registry as ${binding}} from './icons.mjs';
export default defineTheme({
  name: 'bound', tokens: {}, iconVariants: ['filled'], icons: ${binding},
});
`,
      );
      await buildAndCheck('bound.mjs');

      const {bound} = inspect([
        {
          label: 'bound',
          built: './bound.js#boundTheme',
          runtime: './bound.mjs#default',
        },
      ]);
      expect(bound.built).toEqual(bound.runtime);
      expect(bound.built.icons).toEqual({info: 'bound-info:md:normal'});
      expect(bound.built.requests['info|lg|filled']).toBe(
        'bound-info:lg:filled',
      );
      expect(bound.reexportIsNodeView).toBe(true);
    },
  );
});

describe('a built theme types its icon variants', () => {
  it('lets a theme extending the built module type `variant` by its list', async () => {
    writeLineage();
    await buildAndCheck('base/source.mjs');

    const variants = fs.readFileSync(
      path.join(tmpDir, 'base/parity-base.variants.d.ts'),
      'utf8',
    );
    expect(variants).toContain("declare module '@astryxdesign/core/Icon'");
    expect(variants).toContain("'outline': true;");
    expect(variants).toContain("'filled': true;");

    write(
      'consumer.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';
import type {IconVariant} from '@astryxdesign/core/Icon';
import {parityBaseTheme} from './base/parity-base.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

defineTheme({
  name: 'consumer',
  extends: parityBaseTheme,
  icons: {
    info: ({variant}) => {
      const exact: Equal<typeof variant, 'outline' | 'filled' | undefined> = true;
      return exact ? null : null;
    },
    // @ts-expect-error -- 'bold' is not a name the built theme lists.
    close: ({variant}) => (variant === 'bold' ? null : null),
  },
});

// The built theme's augmentation adds its names to IconVariant.
export const listed: IconVariant = 'filled';
// @ts-expect-error -- no theme here lists 'bold'.
export const unlisted: IconVariant = 'bold';
`,
    );
    const program = ts.createProgram([path.join(tmpDir, 'consumer.ts')], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter(diagnostic => diagnostic.file?.fileName.endsWith('consumer.ts'))
      .map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    expect(diagnostics).toEqual([]);
  });
});

describe('a function the build cannot carry fails the build', () => {
  it.each([
    [
      'an inline function entry',
      `icons: {info: ({size}) => createElement('svg', {'data-size': size})}`,
    ],
    [
      'a function beside a spread registry',
      `icons: {...baseIcons, info: () => null}`,
    ],
  ])('rejects %s before writing', async (_label, iconsField) => {
    writeRegistry('icons.mjs', 'baseIcons', {close: 'base-close'});
    write(
      'inline.mjs',
      `import {createElement} from 'react';
import {defineTheme} from '@astryxdesign/core/theme';
import {baseIcons} from './icons.mjs';
export default defineTheme({name: 'inline-functions', tokens: {}, ${iconsField}});
`,
    );

    await expect(
      themeBuild('inline.mjs', {}, {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
    expect(fs.readdirSync(tmpDir).sort()).toEqual(['icons.mjs', 'inline.mjs']);
  });
});
