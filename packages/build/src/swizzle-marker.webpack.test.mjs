// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle-marker.webpack.test.mjs
 * @description A cached webpack build recompiles a swizzled copy when its
 *   marker appears. `withAstryx()` installs a pre-loader that makes each app
 *   module depend on the marker paths above it; without it, webpack's
 *   persistent cache keeps the copy's earlier compile, and its class names,
 *   after a marker is added.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {withAstryx} = require('./next.js');

/** Next's own webpack, the one `next build --webpack` runs. */
function nextWebpack() {
  return require('next/dist/compiled/webpack/bundle5')().webpack;
}

let dir;

beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-marker-webpack-')),
  );
  const app = path.join(dir, 'app');
  fs.mkdirSync(path.join(app, 'src/components/astryx/Badge'), {
    recursive: true,
  });
  fs.writeFileSync(path.join(app, 'package.json'), '{"name":"app"}');
  fs.writeFileSync(
    path.join(app, 'src/components/astryx/Badge/Badge.js'),
    'export const badge = 1;\n',
  );
  fs.writeFileSync(
    path.join(app, 'src/index.js'),
    "export {badge, side} from './components/astryx/Badge/Badge.js';\n",
  );
  // Stands in for the StyleX transform: it compiles a module by its side.
  fs.writeFileSync(
    path.join(dir, 'side-loader.js'),
    [
      `const {isSwizzledSource} = require(${JSON.stringify(require.resolve('./swizzle-marker.js'))});`,
      'module.exports = function (source) {',
      '  if (!this.resourcePath.endsWith("Badge.js")) return source;',
      '  const side = isSwizzledSource(this.resourcePath) ? "library" : "product";',
      '  return source + `export const side = ${JSON.stringify(side)};\\n`;',
      '};',
      '',
    ].join('\n'),
  );
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** One cached build; returns the side the copy compiled as. */
function build(rules) {
  const webpack = nextWebpack();
  const app = path.join(dir, 'app');
  return new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'development',
        devtool: false,
        context: app,
        entry: './src/index.js',
        output: {path: path.join(dir, 'out'), library: {type: 'commonjs2'}},
        cache: {type: 'filesystem', cacheDirectory: path.join(dir, 'cache')},
        module: {
          rules: [
            ...rules,
            {test: /\.js$/, use: [path.join(dir, 'side-loader.js')]},
          ],
        },
      },
      (error, stats) => {
        if (error) return reject(error);
        if (stats.hasErrors())
          return reject(new Error(stats.toString('errors-only')));
        stats.compilation.compiler.close(() => {
          const out = fs.readFileSync(path.join(dir, 'out/main.js'), 'utf-8');
          resolve(out.match(/side = \\?"(\w+)\\?"/)?.[1] ?? null);
        });
      },
    );
  });
}

describe('withAstryx and a swizzle marker under a cached webpack build', () => {
  it('recompiles an unchanged copy when its marker appears', async () => {
    const config = withAstryx({}).webpack(
      {resolve: {}, module: {rules: []}},
      {dir: path.join(dir, 'app')},
    );
    const markerRules = config.module.rules.filter(
      rule => rule.enforce === 'pre',
    );
    expect(markerRules).toHaveLength(1);

    expect(await build(markerRules)).toBe('product');
    fs.writeFileSync(
      path.join(dir, 'app/src/components/astryx/astryx-swizzle.json'),
      '{}',
    );
    expect(await build(markerRules)).toBe('library');
  }, 120_000);
});
