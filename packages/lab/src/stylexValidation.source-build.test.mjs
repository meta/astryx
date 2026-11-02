// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexValidation.source-build.test.mjs
 * @input Uses Babel, the StyleX plugin, and every Lab source module
 * @output Verifies every Lab module compiles under strict StyleX validation
 * @position Regression test for apps that build Lab from source
 */

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {transformFileAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const resolution = require('../../../scripts/stylex-module-resolution.cjs');

const SRC = path.dirname(fileURLToPath(import.meta.url));

function sourceModules(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceModules(file);
    }
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec|stories)\./.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
      ? [file]
      : [];
  });
}

// An app that builds Lab from source compiles it with StyleX's `throw`
// validation, the @astryxdesign/build default. Under StyleX's `silent`
// default an unsupported declaration (a `border` shorthand, say) compiles and
// is dropped from the CSS, so Lab's own build stays green while the app's
// build fails on that module.
describe('Lab StyleX property validation', () => {
  it('compiles every Lab module with unsupported declarations rejected', async () => {
    const failures = [];
    for (const file of sourceModules(SRC)) {
      try {
        await transformFileAsync(file, {
          babelrc: false,
          configFile: false,
          // Presets and plugins resolve from Lab's own dependencies.
          cwd: path.resolve(SRC, '..'),
          presets: [
            ['@babel/preset-react', {runtime: 'automatic'}],
            ['@babel/preset-typescript', {isTSX: true, allExtensions: true}],
          ],
          plugins: [
            [
              '@stylexjs/babel-plugin',
              {
                dev: false,
                runtimeInjection: false,
                propertyValidationMode: 'throw',
                treeshakeCompensation: true,
                unstable_moduleResolution: resolution.stylexModuleResolution,
              },
            ],
          ],
        });
      } catch (error) {
        failures.push(
          `${path.relative(SRC, file)}: ${String(error.message).split('\n')[0]}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});
