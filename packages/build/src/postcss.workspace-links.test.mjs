// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file postcss.workspace-links.test.mjs
 * @input The PostCSS plugin, run from apps whose Astryx packages are linked
 *   from a workspace where package links form cycles
 * @output Proves the plugin compiles what each installed package publishes,
 *   once, never walks a package's own `node_modules`, honors negated `files`
 *   entries, and refuses positive globs it cannot read faithfully
 * @position Regression test for @astryxdesign/build's PostCSS library scan
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const astryxPostcss = require('./index.js');

let root;

const stylexModule = color =>
  [
    "import * as stylex from '@stylexjs/stylex';",
    `export const styles = stylex.create({root: {color: '${color}'}});`,
    '',
  ].join('\n');

/**
 * A pnpm-style workspace. Core publishes `src` and also carries a test fixture;
 * its dev dependency, the CLI, links back to it. The theme declares no `files`,
 * and its own dependency links to core. One more lists a positive glob that
 * cannot be represented faithfully; another uses Astryx's test and benchmark
 * negations.
 */
beforeAll(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-postcss-links-')),
  );
  const manifest = (name, files) =>
    JSON.stringify(files ? {name, files} : {name});
  const files = {
    'packages/core/package.json': manifest('@astryxdesign/core', [
      'src',
      'tokens.ts',
    ]),
    'packages/core/src/Box/Box.tsx': stylexModule('red'),
    'packages/core/tokens.ts': stylexModule('yellow'),
    'packages/core/__fixtures__/invalid/main.ts': stylexModule('green'),
    'packages/cli/package.json': manifest('@astryxdesign/cli', ['src']),
    'packages/cli/src/command.ts': stylexModule('blue'),
    'packages/theme/package.json': manifest('@astryxdesign/theme'),
    'packages/theme/src/theme.ts': stylexModule('purple'),
    'packages/globbed/package.json': manifest('@astryxdesign/globbed', [
      'src/*',
    ]),
    'packages/globbed/src/index.ts': stylexModule('orange'),
    'packages/negated/package.json': manifest('@astryxdesign/negated', [
      'src',
      '!**/*.test.*',
      '!**/*.spec.ts',
      '!**/__tests__/**',
      '!**/__mocks__/**',
      '!**/*.bench.*',
    ]),
    'packages/negated/src/index.ts': stylexModule('teal'),
    'packages/negated/src/index.test.ts': stylexModule('red'),
    'packages/negated/src/private.spec.ts': stylexModule('blue'),
    'packages/negated/src/perf.bench.ts': stylexModule('yellow'),
    'packages/negated/src/__tests__/helper.ts': stylexModule('orange'),
    'packages/negated/src/__mocks__/helper.ts': stylexModule('purple'),
    'apps/site/src/page.tsx': '',
    'apps/themed/src/page.tsx': '',
    'apps/globbed/src/page.tsx': '',
    'apps/negated/src/page.tsx': '',
  };
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), contents);
  }
  const links = {
    'apps/site/node_modules/@astryxdesign/core': 'packages/core',
    'apps/themed/node_modules/@astryxdesign/theme': 'packages/theme',
    'apps/globbed/node_modules/@astryxdesign/globbed': 'packages/globbed',
    'apps/negated/node_modules/@astryxdesign/negated': 'packages/negated',
    'packages/core/node_modules/@astryxdesign/cli': 'packages/cli',
    'packages/cli/node_modules/@astryxdesign/core': 'packages/core',
    'packages/theme/node_modules/@astryxdesign/core': 'packages/core',
  };
  for (const [link, target] of Object.entries(links)) {
    fs.mkdirSync(path.dirname(path.join(root, link)), {recursive: true});
    fs.symlinkSync(path.join(root, target), path.join(root, link), 'junction');
  }
});

afterAll(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

/**
 * Run the plugin from `app` over a stylesheet holding `@stylex;`, the way
 * PostCSS does. Returns the replacement CSS and every file it compiled.
 */
async function compileApp(app) {
  const compiled = [];
  const recordFile = () => ({
    visitor: {
      Program(_, state) {
        compiled.push(path.relative(app, state.filename));
      },
    },
  });
  const [compile] = astryxPostcss({
    cwd: app,
    babelPlugins: [
      [
        require.resolve('@stylexjs/babel-plugin'),
        {
          dev: false,
          runtimeInjection: false,
          unstable_moduleResolution: {type: 'commonJS'},
        },
      ],
      recordFile,
    ],
  }).plugins;
  let css = null;
  const atRule = {
    name: 'stylex',
    params: '',
    replaceWith: replacement => {
      css = replacement;
    },
  };
  await compile(
    {walkAtRules: visit => visit(atRule)},
    {opts: {from: path.join(app, 'src/globals.css')}, messages: []},
  );
  return {css, compiled};
}

describe('the PostCSS plugin and workspace links', () => {
  it('compiles what each linked package publishes, once', async () => {
    const {css, compiled} = await compileApp(path.join(root, 'apps/site'));

    expect([...compiled].sort()).toEqual([
      path.join('node_modules/@astryxdesign/core/src/Box/Box.tsx'),
      path.join('node_modules/@astryxdesign/core/tokens.ts'),
    ]);
    expect(css).toMatch(/@layer astryx-base \{[^]*color:\s*red/);
  });

  it('scans a package without `files` whole, minus its node_modules', async () => {
    const {compiled} = await compileApp(path.join(root, 'apps/themed'));

    expect(compiled).toEqual([
      path.join('node_modules/@astryxdesign/theme/src/theme.ts'),
    ]);
  });

  it('honors negated test and benchmark entries in package files', async () => {
    const {css, compiled} = await compileApp(path.join(root, 'apps/negated'));

    expect(compiled).toEqual([
      path.join('node_modules/@astryxdesign/negated/src/index.ts'),
    ]);
    expect(css).toMatch(/@layer astryx-base \{[^]*color:\s*teal/);
  });

  it('refuses a positive `files` glob it cannot read faithfully', async () => {
    await expect(compileApp(path.join(root, 'apps/globbed'))).rejects.toThrow(
      '@astryxdesign/build reads plain positive files entries only; @astryxdesign/globbed lists "src/*"',
    );
  });
});
