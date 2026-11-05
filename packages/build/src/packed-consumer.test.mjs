// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file packed-consumer.test.mjs
 * @input Packs @astryxdesign/build, reconstructs only the dependencies declared
 *   by its tarball, and exercises the public PostCSS helper and Vite plugin
 * @output Proves shipped build integrations need no ambient workspace packages
 *   and preserve generated browser compatibility CSS
 * @position Consumer-package regression for @astryxdesign/build
 */

import {execFileSync} from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageDir, '../..');

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: {...process.env, NODE_PATH: undefined},
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stdout = error.stdout?.toString() || '';
    const stderr = error.stderr?.toString() || '';
    throw new Error(
      `${command} ${args.join(' ')} failed in ${cwd}\n${stdout}${stderr}`,
      {cause: error},
    );
  }
}

function linkPackage(sourceRoot, name, targetRoot) {
  const source = realpathSync(path.join(sourceRoot, 'node_modules', name));
  const target = path.join(targetRoot, 'node_modules', name);
  mkdirSync(path.dirname(target), {recursive: true});
  symlinkSync(source, target, 'junction');
}

describe('the packed @astryxdesign/build consumer contract', () => {
  let root;
  let appDir;
  let packedPackageDir;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'astryx-build-consumer-'));
    const packDir = path.join(root, 'pack');
    appDir = path.join(root, 'app');
    packedPackageDir = path.join(root, 'packed-build');
    mkdirSync(packDir);
    mkdirSync(path.join(appDir, 'node_modules/@astryxdesign'), {
      recursive: true,
    });
    mkdirSync(path.join(appDir, 'src'), {recursive: true});
    mkdirSync(packedPackageDir);

    run('pnpm', ['pack', '--pack-destination', packDir], packageDir);
    const tarball = path.join(
      packDir,
      readdirSync(packDir).find(name => name.endsWith('.tgz')),
    );
    run(
      'tar',
      ['-xzf', tarball, '-C', packedPackageDir, '--strip-components=1'],
      root,
    );

    const manifest = JSON.parse(
      readFileSync(path.join(packedPackageDir, 'package.json'), 'utf8'),
    );
    // Recreate strict dependency visibility from the packed manifest rather
    // than letting the monorepo's hoisted packages satisfy missing entries.
    for (const dependency of Object.keys(manifest.dependencies || {})) {
      linkPackage(packageDir, dependency, packedPackageDir);
    }
    for (const peer of Object.keys(manifest.peerDependencies || {})) {
      linkPackage(packageDir, peer, packedPackageDir);
      linkPackage(packageDir, peer, appDir);
    }

    symlinkSync(
      packedPackageDir,
      path.join(appDir, 'node_modules/@astryxdesign/build'),
      'junction',
    );
    const virtualStoreRoot = path.join(repoRoot, 'node_modules/.pnpm');
    linkPackage(virtualStoreRoot, 'postcss', appDir);
    linkPackage(virtualStoreRoot, '@stylexjs/stylex', appDir);

    writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({
        name: 'astryx-build-consumer-contract',
        private: true,
        type: 'module',
      }),
    );
    writeFileSync(
      path.join(appDir, 'index.html'),
      '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>\n',
    );
    writeFileSync(
      path.join(appDir, 'src/main.js'),
      [
        "import * as stylex from '@stylexjs/stylex';",
        "const styles = stylex.create({item: {userSelect: 'none'}});",
        'document.body.className = stylex.props(styles.item).className;',
        '',
      ].join('\n'),
    );
    writeFileSync(
      path.join(appDir, 'vite.config.mjs'),
      [
        "import {astryxStylex} from '@astryxdesign/build/vite';",
        'export default {plugins: [...astryxStylex({rootDir: process.cwd()})]};',
        '',
      ].join('\n'),
    );
    writeFileSync(
      path.join(appDir, 'check-postcss.cjs'),
      [
        "const path = require('node:path');",
        "const postcss = require('postcss');",
        "const {postcss: buildPostcss} = require('@astryxdesign/build');",
        "for (const dependency of ['autoprefixer', 'browserslist', 'lightningcss']) {",
        '  try {',
        '    require.resolve(dependency);',
        '    throw new Error(`${dependency} leaked into the consumer root`);',
        '  } catch (error) {',
        "    if (error.code !== 'MODULE_NOT_FOUND') throw error;",
        '  }',
        '}',
        'const config = buildPostcss(__dirname);',
        'const plugins = Object.entries(config.plugins).map(([id, options]) => {',
        '  if (!path.isAbsolute(id)) throw new Error(`unowned PostCSS plugin: ${id}`);',
        '  return require(id)(options);',
        '});',
        "postcss(plugins).process('@stylex;', {from: 'input.css'}).then(() => {",
        "  process.stdout.write('postcss-ok\\n');",
        '});',
        '',
      ].join('\n'),
    );
  }, 120_000);

  afterAll(() => {
    if (root) rmSync(root, {recursive: true, force: true});
  });

  it('loads the public PostCSS helper without undeclared consumer packages', () => {
    expect(run(process.execPath, ['check-postcss.cjs'], appDir)).toBe(
      'postcss-ok\n',
    );
  });

  it('keeps the Vite compatibility pass inside the package boundary', () => {
    const viteCli = path.join(
      packedPackageDir,
      'node_modules/vite/bin/vite.js',
    );
    run(process.execPath, [viteCli, 'build'], appDir);
    const assetsDir = path.join(appDir, 'dist/assets');
    const cssFile = readdirSync(assetsDir).find(name => name.endsWith('.css'));
    expect(cssFile).toBeDefined();
    expect(readFileSync(path.join(assetsDir, cssFile), 'utf8')).toContain(
      '-webkit-user-select',
    );
  });
});
