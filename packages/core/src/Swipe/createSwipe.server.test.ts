// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createSwipe.server.test.ts
 * @input esbuild, Core's Babel config (StyleX compiled as shipped), and a
 *   fresh Node process with no window or document
 * @output Checks that importing and calling createSwipe does no DOM work,
 *   so a module-scope call and a server render are safe
 * @position Testing; validates createSwipe.ts and every module it
 *   imports
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const BABEL_CONFIG = path.resolve(__dirname, '../../babel.config.json');

/**
 * Bundles `entry` as Core ships it: each Core module goes through Core's Babel
 * config, so StyleX is compiled. Imports it in a fresh Node process and runs
 * `script` there, with the module as `mod`. Returns what `script` prints.
 */
function runOnServer(entry: string, script: string): string {
  return execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "import fs from 'node:fs';",
        "import {build} from 'esbuild';",
        "import {transformAsync} from '@babel/core';",
        'const core = {',
        "  name: 'core-babel',",
        '  setup(b) {',
        '    b.onLoad({filter: /packages\\/core\\/src\\/.*\\.tsx?$/}, async args => {',
        "      const source = fs.readFileSync(args.path, 'utf8');",
        `      const result = await transformAsync(source, {babelrc: false, configFile: ${JSON.stringify(BABEL_CONFIG)}, filename: args.path});`,
        "      return {contents: result.code, loader: 'js'};",
        '    });',
        '  },',
        '};',
        `const result = await build({entryPoints: [${JSON.stringify(entry)}], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [core], define: {'process.env.NODE_ENV': '"production"'}});`,
        "const source = Buffer.from(result.outputFiles[0].text).toString('base64');",
        "if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('not a server');",
        "const mod = await import('data:text/javascript;base64,' + source);",
        script,
      ].join('\n'),
    ],
    {cwd: __dirname, encoding: 'utf8'},
  );
}

describe('createSwipe on the server', () => {
  it('imports and runs with no window or document', () => {
    const out = runOnServer(
      path.join(__dirname, 'createSwipe.ts'),
      [
        "const swipe = mod.createSwipe({trailing: [{label: 'Archive', onActivate() {}}], swipeBehavior: 'commit'});",
        'process.stdout.write(JSON.stringify({exports: Object.keys(mod).sort(), frozen: Object.isFrozen(swipe), keys: Object.keys(swipe)}));',
      ].join('\n'),
    );
    expect(JSON.parse(out)).toEqual({
      exports: ['createSwipe'],
      frozen: true,
      keys: [],
    });
  }, 60_000);
});
