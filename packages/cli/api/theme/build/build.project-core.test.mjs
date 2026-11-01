// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme build` in an app generates with the Core the app installed.
 *
 * A CLI run one-off (`npx @astryxdesign/cli`) has no Core beside it, and the
 * app's `<Theme>` runs on the app's Core either way, so the build loads the
 * project's installed `@astryxdesign/core` when it differs from the CLI's own.
 * When there is no Core to use, the error names the fix for where it ran:
 * install it in an app, build it in the Astryx repository. An installed Core
 * that does not load, or lacks the functions the build calls, fails the build,
 * naming it, rather than leave the build to the CLI's own Core.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {coreUnavailableMessage, themeBuild} from './build.mjs';
import {fetchCarriedThemeCoreDir} from '../_adapter.mjs';

vi.mock('../_adapter.mjs', async importOriginal => {
  const actual = /** @type {Record<string, any>} */ (await importOriginal());
  return {
    ...actual,
    fetchCarriedThemeCoreDir: vi.fn(actual.fetchCarriedThemeCoreDir),
  };
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../..');
const CORE_DIST = path.join(REPO_ROOT, 'packages/core/dist');

/** @type {string[]} */
const tmpDirs = [];
const makeDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-project-core-'));
  tmpDirs.push(dir);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"app","type":"module"}',
  );
  // A plain theme object: the file itself never imports Core, so only the
  // build's own Core loading can set the marker below.
  fs.writeFileSync(
    path.join(dir, 'ocean.mjs'),
    "export default {name: 'ocean', tokens: {'--color-bg': '#0a0a0a'}};\n",
  );
  return dir;
};

beforeEach(() => {
  delete globalThis.__astryxProjectCoreLoads;
});
afterEach(() => {
  delete globalThis.__astryxProjectCoreLoads;
  for (const dir of tmpDirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * Install a Core in `dir` that is the built one, re-exported, and records each
 * entry as it is imported. Its `exports` map lists `source` first, as Core's
 * own does, so the build must skip that condition to find the runtime file.
 * @param {string} dir
 * @param {{broken?: boolean, themeModule?: string}} [options] `themeModule`
 *   replaces the theme entry's source
 */
function installCore(dir, {broken = false, themeModule} = {}) {
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({
      name: '@astryxdesign/core',
      version: '0.6.5',
      type: 'module',
      exports: {
        '.': {types: './root.d.ts', default: './root.mjs'},
        './theme': {
          source: './src/theme/index.ts',
          types: './theme.d.ts',
          default: './theme.mjs',
        },
      },
    }),
  );
  /** @param {string} entry @param {string} target */
  const module = (entry, target) =>
    broken
      ? "throw new Error('this Core is broken');\n"
      : `export * from ${JSON.stringify(pathToFileURL(path.join(CORE_DIST, target)).href)};\n` +
        `globalThis.__astryxProjectCoreLoads = [...(globalThis.__astryxProjectCoreLoads ?? []), '${entry}'];\n`;
  fs.writeFileSync(
    path.join(core, 'theme.mjs'),
    themeModule ?? module('theme', 'theme/index.js'),
  );
  fs.writeFileSync(path.join(core, 'root.mjs'), module('root', 'index.js'));
  return core;
}

describe('theme build outside a project, with the Core this CLI release carries', () => {
  it('fails naming a carried Core that does not load, rather than build with the CLI’s own', async () => {
    const carried = installCore(makeDir(), {broken: true});
    vi.mocked(fetchCarriedThemeCoreDir).mockReturnValueOnce(carried);
    const bare = makeDir();
    const build = themeBuild('ocean.mjs', {}, {cwd: bare});
    await expect(build).rejects.toMatchObject({
      code: 'ERR_CORE_NOT_FOUND',
      message: expect.stringContaining(
        `Could not load the @astryxdesign/core this CLI release carries, at ${carried}`,
      ),
    });
    await expect(build).rejects.toThrow(/Import error: this Core is broken/);
    expect(fs.existsSync(path.join(bare, 'ocean.css'))).toBe(false);
  });
});

describe('theme build generates with the Core the project installed', () => {
  it('loads the app’s installed Core when it differs from the CLI’s own', async () => {
    const app = makeDir();
    installCore(app);
    await themeBuild('ocean.mjs', {}, {cwd: app});
    expect(globalThis.__astryxProjectCoreLoads).toEqual(['theme', 'root']);
    // The same Core, re-exported, emits the same CSS as the CLI's own. The
    // generated header differs only in the Core version it records.
    const bare = makeDir();
    await themeBuild('ocean.mjs', {}, {cwd: bare});
    /** @param {string} dir */
    const rules = dir =>
      fs
        .readFileSync(path.join(dir, 'ocean.css'), 'utf-8')
        .replace(/^\/\*[\s\S]*?\*\/\n/, '');
    expect(rules(app)).toBe(rules(bare));
    expect(rules(app)).toContain('#0a0a0a');
  });

  it('keeps the CLI’s own Core when the project has none', async () => {
    const bare = makeDir();
    await themeBuild('ocean.mjs', {}, {cwd: bare});
    expect(globalThis.__astryxProjectCoreLoads).toBeUndefined();
    expect(fs.existsSync(path.join(bare, 'ocean.css'))).toBe(true);
  });

  it('fails naming an installed Core that does not load, rather than build with the CLI’s own', async () => {
    const app = makeDir();
    installCore(app, {broken: true});
    await expect(themeBuild('ocean.mjs', {}, {cwd: app})).rejects.toMatchObject(
      {
        code: 'ERR_CORE_NOT_FOUND',
        message: expect.stringContaining(
          `Could not load the @astryxdesign/core installed at ${path.join('node_modules', '@astryxdesign', 'core')}`,
        ),
      },
    );
    await expect(themeBuild('ocean.mjs', {}, {cwd: app})).rejects.toThrow(
      /Import error: this Core is broken/,
    );
    expect(fs.existsSync(path.join(app, 'ocean.css'))).toBe(false);
  });

  it('fails naming an installed Core without the functions the build calls, rather than build with the CLI’s own', async () => {
    const app = makeDir();
    installCore(app, {
      themeModule: 'export const defineTheme = theme => theme;\n',
    });
    await expect(themeBuild('ocean.mjs', {}, {cwd: app})).rejects.toMatchObject(
      {
        code: 'ERR_CORE_INCOMPATIBLE',
        message: expect.stringContaining(
          'does not export generateThemeRulesSplit',
        ),
      },
    );
    expect(fs.existsSync(path.join(app, 'ocean.css'))).toBe(false);
  });
});

describe('the error when there is no Core to generate with', () => {
  it('tells an app to install Core, not to build it', () => {
    const app = makeDir();
    const message = coreUnavailableMessage(
      app,
      new Error("Cannot find package '@astryxdesign/core'"),
    );
    expect(message).toContain(
      'This project does not have @astryxdesign/core installed',
    );
    expect(message).toContain('`npm install @astryxdesign/core`');
    expect(message).not.toContain('pnpm -F');
    expect(message).toContain(
      "Import error: Cannot find package '@astryxdesign/core'",
    );
  });

  it('names an installed Core that does not load', () => {
    const app = makeDir();
    installCore(app, {broken: true});
    const message = coreUnavailableMessage(
      app,
      new Error('this Core is broken'),
    );
    expect(message).toContain(
      `Could not load the @astryxdesign/core installed at ${path.join('node_modules', '@astryxdesign', 'core')}`,
    );
    expect(message).toContain('Reinstall it.');
    expect(message).not.toContain('pnpm -F');
  });

  it('keeps the build instruction in the Astryx repository', () => {
    const message = coreUnavailableMessage(
      path.join(REPO_ROOT, 'packages', 'cli'),
      undefined,
    );
    expect(message).toContain('Build @astryxdesign/core first');
    expect(message).toContain('`pnpm -F @astryxdesign/core build`');
    expect(message).not.toContain('Import error');
  });
});
