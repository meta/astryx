// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme saved in place while `astryx theme build` loads it.
 *
 * An editor's in-place save truncates the theme file before it writes, so a
 * read that lands in between finds it empty. The build loads the theme, then
 * scans its source for the icon registry import; with a registry that holds no
 * icons yet, a scan that read the empty file found no import and the build
 * succeeded without one. The build now scans the bytes it loaded, and a file
 * that changed while it loaded fails the build rather than build from a file
 * the load never saw.
 *
 * Each case runs the CLI with a preload that empties every read of the theme
 * file once the theme module has run: the moment right after the load, as an
 * in-place save landing then would.
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ensureCoreBuilt} from './ensure-core-built.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(__dirname, '../bin/astryx.mjs');

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-torn-theme-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** The emitted icon import, or null. */
function iconImportLine(generated) {
  const match = generated.match(/^import .*$/m);
  return match ? match[0] : null;
}

/**
 * A theme whose registry, still empty, arrives through a relative import. Its
 * module marks when it has run, so the preload knows the load is done.
 */
function writeTheme(dir) {
  fs.writeFileSync(
    path.join(dir, 'icons.mjs'),
    'export const testIcons = {};\n',
  );
  const file = path.join(dir, 'saved.mjs');
  fs.writeFileSync(
    file,
    `import {testIcons} from './icons.mjs';\n` +
      `globalThis.__astryxThemeLoaded = true;\n` +
      `export default {\n` +
      `  name: "saved",\n` +
      `  icons: testIcons,\n` +
      `  tokens: {'--color-bg': '#0a0b0c'},\n` +
      `};\n`,
  );
  return file;
}

/** Empties every read of `themeFile` once the theme module has run. */
function writeTruncatingPreload(dir, themeFile) {
  const preload = path.join(dir, 'truncate-after-load.cjs');
  fs.writeFileSync(
    preload,
    `const fs = require('node:fs');\n` +
      `const read = fs.readFileSync;\n` +
      `fs.readFileSync = function (file, ...rest) {\n` +
      `  if (globalThis.__astryxThemeLoaded && String(file) === ${JSON.stringify(themeFile)}) {\n` +
      `    return typeof rest[0] === 'string' || rest[0]?.encoding ? '' : Buffer.alloc(0);\n` +
      `  }\n` +
      `  return read.call(this, file, ...rest);\n` +
      `};\n`,
  );
  return preload;
}

describe('theme build while the theme is saved in place', () => {
  it('builds with its import, or fails the build: never a module without it', () => {
    const themeFile = writeTheme(tmpDir);
    const preload = writeTruncatingPreload(tmpDir, themeFile);
    const run = spawnSync(
      process.execPath,
      [
        CLI_BIN,
        'theme',
        'build',
        'saved.mjs',
        '--out',
        'out/theme.css',
        '--icons-specifier',
        './icons.mjs',
      ],
      {
        cwd: tmpDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NODE_OPTIONS:
            `${process.env.NODE_OPTIONS ?? ''} --require ${preload}`.trim(),
        },
      },
    );
    const builtFile = path.join(tmpDir, 'out', 'saved.js');
    if (run.status === 0) {
      expect(iconImportLine(fs.readFileSync(builtFile, 'utf8'))).toBe(
        'import { testIcons } from "./icons.mjs";',
      );
    } else {
      expect(`${run.stdout}\n${run.stderr}`).toMatch(
        /changed while it was loading/,
      );
      expect(fs.existsSync(builtFile)).toBe(false);
    }
  });

  it('builds the import from a theme left alone', () => {
    writeTheme(tmpDir);
    const run = spawnSync(
      process.execPath,
      [
        CLI_BIN,
        'theme',
        'build',
        'saved.mjs',
        '--out',
        'out/theme.css',
        '--icons-specifier',
        './icons.mjs',
      ],
      {cwd: tmpDir, encoding: 'utf8', env: {...process.env, FORCE_COLOR: '0'}},
    );
    expect(run.status, run.stderr).toBe(0);
    expect(
      iconImportLine(
        fs.readFileSync(path.join(tmpDir, 'out', 'saved.js'), 'utf8'),
      ),
    ).toBe('import { testIcons } from "./icons.mjs";');
  });
});
