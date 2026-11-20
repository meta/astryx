// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file babel.test.mjs
 * @description Verifies that the Astryx babel wrapper applies the configured
 *   library StyleX class-name prefix to Astryx library files. The prefix
 *   defaults to `astryx` and remains configurable. Its strict default
 *   validation compiles every Core and Lab StyleX module, as the README's
 *   webpack setup does.
 */

import {describe, it, expect} from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const {globSync} = require('fast-glob');
const astryxBabelPlugin = require('./babel.js');
const {stylexOptions: buildStylexOptions} = require('./config.js');

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const SOURCE = `
import * as stylex from '@stylexjs/stylex';
export const styles = stylex.create({
  box: {color: 'red'},
});
`;

const INVALID_BORDER_SOURCE = `
import * as stylex from '@stylexjs/stylex';
export const styles = stylex.create({
  box: {borderTop: '1px solid var(--color-border)'},
});
`;

/**
 * Transform a StyleX source through the Astryx babel wrapper as if it were an
 * Astryx library file, returning the emitted code. `libraryPrefix` controls the
 * atomic class-name prefix for library files.
 */
function transformLibraryFile(
  libraryPrefix,
  source = SOURCE,
  stylexOptions = {},
) {
  const result = babel.transformSync(source, {
    // A path matching one of the library patterns so the wrapper routes it
    // through the library plugin instance.
    filename: 'node_modules/@astryxdesign/core/src/Box/AstryxBox.tsx',
    babelrc: false,
    configFile: false,
    plugins: [
      [
        astryxBabelPlugin,
        {
          ...(libraryPrefix ? {libraryPrefix} : {}),
          unstable_moduleResolution: {type: 'commonJS', rootDir: process.cwd()},
          ...stylexOptions,
        },
      ],
    ],
  });
  return result?.code ?? '';
}

/** Extract the StyleX atomic class names referenced in the emitted code. */
function atomicClasses(code) {
  // StyleX emits atoms like "xds1a2b3c" / "astryx1a2b3c" in the compiled output.
  return code.match(/\b(?:xds|astryx|lib)[a-z0-9]{4,}\b/g) ?? [];
}

describe('Astryx babel wrapper -- library StyleX prefix', () => {
  it('defaults library atoms to the `astryx` prefix', () => {
    const code = transformLibraryFile(undefined);
    const atoms = atomicClasses(code);
    expect(atoms.length).toBeGreaterThan(0);
    expect(atoms.every(c => c.startsWith('astryx'))).toBe(true);
    expect(
      atoms.some(c => c.startsWith('xds') && !c.startsWith('astryx')),
    ).toBe(false);
  });

  it('uses a configured custom prefix for library atoms', () => {
    const code = transformLibraryFile('lib');
    const atoms = atomicClasses(code);
    expect(atoms.length).toBeGreaterThan(0);
    expect(atoms.every(c => c.startsWith('lib'))).toBe(true);
  });

  it('rejects declarations that StyleX would otherwise drop silently', () => {
    expect(() =>
      transformLibraryFile(undefined, INVALID_BORDER_SOURCE),
    ).toThrow(
      /borderTop is not supported.*borderTopWidth.*borderTopStyle.*borderTopColor/s,
    );
  });

  it('keeps the upstream validation mode override available', () => {
    expect(() =>
      transformLibraryFile(undefined, INVALID_BORDER_SOURCE, {
        propertyValidationMode: 'silent',
      }),
    ).not.toThrow();
  });

  it('uses the same strict default in generated Babel and PostCSS configs', () => {
    expect(buildStylexOptions(process.cwd()).propertyValidationMode).toBe(
      'throw',
    );
    expect(
      buildStylexOptions(process.cwd(), {propertyValidationMode: 'warn'})
        .propertyValidationMode,
    ).toBe('warn');
  });
});

describe('Astryx babel wrapper -- Astryx source under the strict default', () => {
  // The README's webpack setup compiles Core and Lab source through this
  // plugin with its default `propertyValidationMode: 'throw'`, so a shorthand
  // StyleX rejects anywhere in them fails that app's build.
  it('compiles every Core and Lab StyleX module', () => {
    const core = path.join(repoRoot, 'packages/core/src');
    const failures = [];
    let compiled = 0;
    for (const name of ['core', 'lab']) {
      const files = globSync('**/*.{ts,tsx}', {
        cwd: path.join(repoRoot, 'packages', name, 'src'),
        absolute: true,
        ignore: ['**/*.test.*', '**/*.d.ts', '**/__tests__/**'],
      });
      for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        if (!source.includes('@stylexjs/stylex')) continue;
        compiled += 1;
        try {
          babel.transformSync(source, {
            filename: file,
            babelrc: false,
            configFile: false,
            parserOpts: {plugins: ['typescript', 'jsx']},
            plugins: [
              [
                astryxBabelPlugin,
                {
                  aliases: {
                    '@astryxdesign/core/*': [path.join(core, '*')],
                    '@astryxdesign/core': [core],
                  },
                  unstable_moduleResolution: {type: 'commonJS'},
                },
              ],
            ],
          });
        } catch (error) {
          failures.push(error.message.split('\n')[0]);
        }
      }
    }
    // Present first: the walk reached both packages' StyleX modules.
    expect(compiled).toBeGreaterThan(250);
    expect(failures).toEqual([]);
  }, 120_000);
});

/** A product module with many StyleX calls, so many visitor calls. */
const MANY_STYLES = `
import * as stylex from '@stylexjs/stylex';
${Array.from({length: 20}, (_, i) => `export const s${i} = stylex.create({box: {width: '${i + 1}px'}});`).join('\n')}
`;

describe('Astryx babel wrapper -- a swizzled copy', () => {
  it('gives a module under a swizzle marker the library prefix', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-babel-swizzle-'));
    try {
      const output = path.join(app, 'src/components/astryx');
      fs.mkdirSync(path.join(output, 'Box'), {recursive: true});
      fs.writeFileSync(
        path.join(output, 'astryx-swizzle.json'),
        JSON.stringify({packages: {'@astryxdesign/core': '0.0.0'}}),
      );
      const compile = (filename, source = SOURCE) =>
        babel.transformSync(source, {
          filename,
          babelrc: false,
          configFile: false,
          plugins: [
            [
              astryxBabelPlugin,
              {unstable_moduleResolution: {type: 'commonJS', rootDir: app}},
            ],
          ],
        })?.code ?? '';
      const copied = atomicClasses(compile(path.join(output, 'Box/Box.tsx')));
      expect(copied.length).toBeGreaterThan(0);
      expect(copied.every(c => c.startsWith('astryx'))).toBe(true);
      // The wrapper classifies a file once, not on every StyleX visitor call.
      const lookups = [];
      const nodeFs = require('node:fs');
      const existsSync = nodeFs.existsSync;
      nodeFs.existsSync = file => {
        if (String(file).endsWith('astryx-swizzle.json')) lookups.push(file);
        return existsSync(file);
      };
      try {
        compile(path.join(app, 'src/Many.tsx'), MANY_STYLES);
      } finally {
        nodeFs.existsSync = existsSync;
      }
      const folders = path.join(app, 'src').split(path.sep).length;
      expect(lookups.length).toBeLessThanOrEqual(folders);
      // Product code beside the copy keeps the product prefix.
      expect(atomicClasses(compile(path.join(app, 'src/Page.tsx')))).toEqual(
        [],
      );
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });
});
