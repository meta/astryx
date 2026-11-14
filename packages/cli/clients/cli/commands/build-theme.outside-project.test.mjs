// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme build` outside any project, as a separate process.
 *
 * A theme in a folder with no Core installed (an empty folder, a fresh clone)
 * imports `defineTheme` from Core all the same: the build hands its imports
 * the Core the CLI answers with, as a new project with that Core would build
 * it (spec AST-081 FR3). The CLI runs as its own process, without the
 * `NODE_PATH` a pnpm script sets (it reaches the repository's packages): in
 * the test runner, or with that path, the theme's import would find the
 * repository's Core, which a real run outside a project cannot.
 */

import {afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ensureCoreBuilt} from './ensure-core-built.mjs';

const CLI_BIN = fileURLToPath(new URL('../bin/astryx.mjs', import.meta.url));
const CORE_DIR = fileURLToPath(new URL('../../../../core', import.meta.url));

/** @param {string[]} args @param {string} cwd */
function runCliProcess(args, cwd) {
  const {NODE_PATH: _repositoryPackages, ...env} = process.env;
  const result = spawnSync(process.execPath, [CLI_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 60_000,
    env,
  });
  if (result.error) throw result.error;
  return result;
}

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-outside-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * A project beside the empty folder: its own package.json and Core (this
 * repository's, linked), so the same theme builds there through the
 * project's own resolution.
 * @param {string} dir
 */
function makeProject(dir) {
  fs.mkdirSync(path.join(dir, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name": "theme-project", "private": true, "dependencies": {"@astryxdesign/core": "*"}}\n',
  );
  fs.symlinkSync(
    CORE_DIR,
    path.join(dir, 'node_modules', '@astryxdesign', 'core'),
    'junction',
  );
}

describe('theme build outside any project builds a plain-object theme as a project does', () => {
  const themes = {
    typography: `export default {
      name: 'plain-type',
      tokens: {'--color-background': '#123456'},
      typography: {body: {family: 'Helvetica', fallbacks: 'Arial, sans-serif'}},
    };\n`,
    'local tokens and media surfaces': `export default {
      name: 'plain-local',
      tokens: {'--color-background': '#123456'},
      localTokens: {'--ac-selection-ink': ['#0077b6', '#48cae4']},
      components: {badge: {'variant:info': {backgroundColor: 'var(--ac-selection-ink)'}}},
      onDark: {components: {badge: {'variant:info': {color: 'var(--ac-selection-ink)'}}}},
    };\n`,
  };
  for (const [what, source] of Object.entries(themes)) {
    for (const ext of ['mjs', 'ts']) {
      it(`with ${what}, in a .${ext} file`, () => {
        const name = /name: '([^']+)'/.exec(source)[1];
        const project = path.join(tmpDir, 'project');
        makeProject(project);
        const outside = path.join(tmpDir, 'outside');
        fs.mkdirSync(outside);
        for (const dir of [project, outside]) {
          fs.writeFileSync(path.join(dir, `theme.${ext}`), source);
          const result = runCliProcess(['theme', 'build', `theme.${ext}`], dir);
          expect(result.status, result.stderr + result.stdout).toBe(0);
        }
        expect(fs.readFileSync(path.join(outside, `${name}.css`), 'utf8')).toBe(
          fs.readFileSync(path.join(project, `${name}.css`), 'utf8'),
        );
      });
    }
  }
});

describe('theme build outside any project', () => {
  for (const ext of ['mjs', 'ts']) {
    it(`builds a .${ext} theme that imports defineTheme from Core, with the Core the CLI answers with`, () => {
      fs.writeFileSync(
        path.join(tmpDir, `outside.${ext}`),
        "import {defineTheme} from '@astryxdesign/core/theme';\n" +
          "export default defineTheme({name: 'outside', tokens: {'--color-background': '#123456'}});\n",
      );
      const result = runCliProcess(
        ['theme', 'build', `outside.${ext}`],
        tmpDir,
      );
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(
        fs.readFileSync(path.join(tmpDir, 'outside.css'), 'utf8'),
      ).toContain('#123456');
    });
  }

  for (const ext of ['mjs', 'ts']) {
    it(`still fails a .${ext} module that defines no theme`, () => {
      fs.writeFileSync(
        path.join(tmpDir, `none.${ext}`),
        'export const notATheme = 42;\n',
      );
      const result = runCliProcess(['theme', 'build', `none.${ext}`], tmpDir);
      expect(result.status).toBe(1);
      expect(result.stderr + result.stdout).toMatch(
        /Could not find a defineTheme\(\) result/,
      );
    });
  }
});
