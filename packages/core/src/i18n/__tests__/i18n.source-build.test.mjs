// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file i18n.source-build.test.mjs
 * @input Uses Babel, the core build config, and the i18n runtime and a
 *   component source
 * @output Verifies the shipped i18n runtime the components read imports no
 *   English catalog: the whole catalog rides only with the public context,
 *   the provider and useTranslator, and a component carries its own slice
 * @position Regression test for the import graph of the shipped i18n modules
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseAsync, transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '../../..');
const SRC_ROOT = path.join(CORE_ROOT, 'src');

/** The relative specifiers a compiled module imports statically. */
async function compiledStaticImportsOf(relativeFile) {
  const file = path.join(SRC_ROOT, relativeFile);
  const source = await fs.readFile(file, 'utf8');
  const result = await transformAsync(source, {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename: file,
  });
  const ast = await parseAsync(result.code, {
    babelrc: false,
    configFile: false,
    filename: `${file}.js`,
    sourceType: 'module',
  });
  return ast.program.body
    .filter(node => node.type === 'ImportDeclaration')
    .map(node => node.source.value);
}

const WHOLE_CATALOG = /generated-locales\/en\.generated\.js$/;

describe('the shipped i18n runtime and the English catalog', () => {
  it('the runtime a component reads imports no catalog', async () => {
    for (const file of [
      'i18n/resolve.ts',
      'i18n/TranslationRuntimeContext.ts',
      'i18n/useComponentTranslator.ts',
      'i18n/useLocale.ts',
      'i18n/useDirection.ts',
      'i18n/useCollator.ts',
    ]) {
      const imports = await compiledStaticImportsOf(file);
      expect(imports, file).not.toContainEqual(
        expect.stringMatching(/generated-locales/),
      );
      expect(imports, file).not.toContain('./InternationalizationContext.js');
    }
  });

  it('the public context carries the whole catalog, and useTranslator reads it', async () => {
    expect(
      await compiledStaticImportsOf('i18n/InternationalizationContext.ts'),
    ).toContainEqual(expect.stringMatching(WHOLE_CATALOG));
    expect(await compiledStaticImportsOf('i18n/useTranslator.ts')).toContain(
      './InternationalizationContext.js',
    );
  });
});
