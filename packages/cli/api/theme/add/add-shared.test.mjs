// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme add` given a shared theme instead of a slug: a theme folder, a
 * `.tgz` archive of one, or an https URL to a `.tgz`. The theme is checked,
 * copied into the app's local themes root, the Astryx packages it imports
 * that the app lacks are installed with install scripts off (any other
 * package is only named), and it is recorded as the default. Nothing of the
 * theme runs, nothing it did not write is replaced, every file written is
 * reported, a bad source writes nothing, and `theme remove` undoes it.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {gzipSync} from 'node:zlib';
import {themeAdd} from './add.mjs';
import {themeRemove} from '../remove/remove.mjs';
import {parseThemeModuleRecord} from '../../../foundation/config/theme-state.mjs';
import {CLI_VERSION} from '../../../test-utils/release-fixtures.mjs';
import {recordDeclaredSettings} from '../../../foundation/env/cli-command.mjs';

const runs = vi.hoisted(
  () => /** @type {Array<{cmd: string, args: string[], cwd: string}>} */ ([]),
);
vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal()),
  spawnSync: (
    /** @type {string} */ cmd,
    /** @type {string[]} */ args,
    /** @type {{cwd: string}} */ opts,
  ) => {
    runs.push({cmd, args, cwd: opts.cwd});
    return failInstall && args[0] === 'install'
      ? {status: 1, stdout: '', stderr: 'npm error network unreachable'}
      : {status: 0, stdout: '', stderr: ''};
  },
}));

/** Whether the mocked package manager fails an install. */
let failInstall = false;
/** @type {string} */
let app;
/** @type {string} */
let shared;
/** A file a theme's code writes when anything runs it. */
let marker = '';

beforeEach(() => {
  runs.length = 0;
  failInstall = false;
  vi.unstubAllGlobals();
  // Outside the repository, so no package installed for the repository
  // counts as installed for the app.
  app = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-add-shared-app-'));
  shared = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-add-shared-'));
  marker = path.join(shared, 'theme-code-ran');
  fs.mkdirSync(path.join(app, 'src'));
  fs.writeFileSync(
    path.join(app, 'package.json'),
    `${JSON.stringify({name: 'app', private: true, dependencies: {}})}\n`,
  );
  fs.writeFileSync(path.join(app, 'package-lock.json'), '{}\n');
  const core = path.join(app, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(app, 'package.json'), 'utf8'),
  );
  pkg.dependencies['@astryxdesign/core'] = CLI_VERSION;
  fs.writeFileSync(path.join(app, 'package.json'), `${JSON.stringify(pkg)}\n`);
});

afterEach(() => {
  fs.rmSync(app, {recursive: true, force: true});
  fs.rmSync(shared, {recursive: true, force: true});
});

/**
 * A theme folder as the theme editor's app copy writes it: its descriptor,
 * its entry, and its built module and stylesheet. The entry and the built
 * module write `marker` when anything runs them.
 * @param {string} dir
 * @param {string} slug
 * @param {{imports?: string[], built?: boolean}} [options]
 *   `imports`: packages its built module imports; `built: false` leaves the
 *   built module and stylesheet out
 */
function writeTheme(dir, slug, {imports = [], built = true} = {}) {
  const exportName = `${slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Theme`;
  const runsMark = `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\n`;
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, `${exportName}.doc.mjs`),
    `/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: '${slug}', displayName: '${slug}', description: 'The ${slug} theme.', maintained: false};\n`,
  );
  fs.writeFileSync(
    path.join(dir, `${exportName}.ts`),
    `${runsMark}import {defineTheme} from '@astryxdesign/core/theme';\nexport const ${exportName} = defineTheme({name: '${slug}', tokens: {}});\n`,
  );
  if (built) {
    fs.writeFileSync(
      path.join(dir, `${slug}.js`),
      `${runsMark}${imports.map((p, n) => `import * as dep${n} from '${p}';\n`).join('')}export const ${exportName} = {name: '${slug}', __built: true, deps: [${imports.map((_, n) => `dep${n}`).join(', ')}]};\n`,
    );
    fs.writeFileSync(
      path.join(dir, `${slug}.css`),
      `[data-astryx-theme="${slug}"] {}\n`,
    );
  }
}

/**
 * A gzipped tar of `entries`: files (string contents), folders (null), or
 * raw headers (`{type, target}` for a link).
 * @param {Record<string, string | null | {type: string, target: string}>} entries
 */
function tgz(entries) {
  /** @type {Buffer[]} */
  const blocks = [];
  for (const [name, value] of Object.entries(entries)) {
    const body =
      typeof value === 'string' ? Buffer.from(value) : Buffer.alloc(0);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    const type =
      value === null ? '5' : typeof value === 'string' ? '0' : value.type;
    header.write(type, 156);
    if (value && typeof value === 'object') header.write(value.target, 157);
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.fill(' ', 148, 156);
    let sum = 0;
    for (const b of header) sum += b;
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

/**
 * Every file under `dir` with its contents, node_modules left out.
 * @param {string} dir
 */
function tree(dir) {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir, {recursive: true, withFileTypes: true})
      .filter(e => e.isFile())
      .map(e => path.join(e.parentPath, e.name))
      .filter(f => !f.split(path.sep).includes('node_modules'))
      .map(f => [
        path.relative(dir, f).split(path.sep).join('/'),
        fs.readFileSync(f, 'utf8'),
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** The theme files a theme folder holds, as entries for an archive. */
function themeEntries(
  /** @type {string} */ prefix,
  /** @type {string} */ slug,
) {
  const dir = path.join(shared, '.build', slug);
  writeTheme(dir, slug);
  return Object.fromEntries(
    Object.entries(tree(dir)).map(([f, text]) => [`${prefix}${f}`, text]),
  );
}

describe('theme add with a shared theme', () => {
  it('copies a theme folder into the local themes root and makes it the default', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean');
    const result = await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(result.type).toBe('theme.app');
    expect(result.data.default).toBe('ocean');
    expect(result.data.themes).toEqual([
      expect.objectContaining({slug: 'ocean', source: 'local'}),
    ]);
    expect(result.data.copy).toMatchObject({
      folder: '.',
      outputDir: 'src/themes/ocean',
      installed: [],
      installCommand: null,
    });
    expect(Object.keys(tree(path.join(app, 'src/themes/ocean')))).toEqual(
      [
        '.astryx-shared.json',
        'ocean.css',
        'ocean.js',
        'oceanTheme.doc.mjs',
        'oceanTheme.ts',
      ].sort(),
    );
    expect(
      parseThemeModuleRecord(
        fs.readFileSync(path.join(app, result.data.modulePath), 'utf8'),
      ),
    ).toEqual({themes: {ocean: './src/themes'}, defaultSlug: 'ocean'});
  });

  it('finds the one theme folder inside a .tgz and adds it', async () => {
    const archive = path.join(shared, 'bundle.tgz');
    fs.writeFileSync(
      archive,
      tgz({
        'bundle/': null,
        'bundle/README.md': '# A shared theme\n',
        'bundle/editor/notes.txt': 'not a theme\n',
        ...themeEntries('bundle/app-copy/', 'sunset'),
      }),
    );
    const result = await themeAdd(archive, {cwd: app});
    expect(result.data.default).toBe('sunset');
    expect(result.data.copy).toMatchObject({
      from: archive,
      folder: 'bundle/app-copy',
      outputDir: 'src/themes/sunset',
    });
  });

  it('runs nothing of the theme, and installs its Astryx base with install scripts off while only naming any other package', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built', 'left-pad'],
    });
    const result = await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(fs.existsSync(marker)).toBe(false);
    expect(runs).toEqual([
      {
        cmd: 'npm',
        args: [
          'install',
          `@astryxdesign/theme-neutral@${CLI_VERSION}`,
          '--ignore-scripts',
        ],
        cwd: app,
      },
    ]);
    expect(result.data.copy).toMatchObject({
      installed: [`@astryxdesign/theme-neutral@${CLI_VERSION}`],
      installRan: true,
      installCommand: expect.stringMatching(/^npm install left-pad/),
    });
    // (No integration says how this project adds packages.)
    expect(result.data.copy).not.toHaveProperty('installGuidance');
  });

  it('reports every file it wrote and the record and dependency it changed', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    const result = await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(result.data.copy?.written.sort()).toEqual(
      [
        'src/themes/ocean/ocean.css',
        'src/themes/ocean/ocean.js',
        'src/themes/ocean/oceanTheme.doc.mjs',
        'src/themes/ocean/oceanTheme.ts',
        'src/themes/ocean/.astryx-shared.json',
        result.data.modulePath,
        'package.json',
        'package-lock.json',
      ].sort(),
    );
    expect(result.data.copy?.config).toEqual({
      module: result.data.modulePath,
      default: 'ocean',
      dependencies: [`@astryxdesign/theme-neutral@${CLI_VERSION}`],
    });
  });

  it('refuses a theme shared without its built files before copying or installing anything', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      built: false,
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    const before = tree(app);
    await expect(
      themeAdd(path.join(shared, 'ocean'), {cwd: app}),
    ).rejects.toThrow(/without its built ocean\.js and ocean\.css/);
    expect(tree(app)).toEqual(before);
    expect(runs).toEqual([]);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('never replaces a file it did not write, and replaces only its own unchanged copy', async () => {
    writeTheme(path.join(app, 'src/themes/ocean'), 'ocean');
    const before = tree(app);
    writeTheme(path.join(shared, 'ocean'), 'ocean');
    await expect(
      themeAdd(path.join(shared, 'ocean'), {cwd: app}),
    ).rejects.toThrow(/theme add did not write it/);
    expect(tree(app)).toEqual(before);

    fs.rmSync(path.join(app, 'src/themes/ocean'), {recursive: true});
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    fs.writeFileSync(
      path.join(shared, 'ocean', 'ocean.css'),
      '[data-astryx-theme="ocean"] {color: red}\n',
    );
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(
      fs.readFileSync(path.join(app, 'src/themes/ocean/ocean.css'), 'utf8'),
    ).toMatch(/color: red/);

    fs.writeFileSync(path.join(app, 'src/themes/ocean/ocean.css'), 'mine\n');
    await expect(
      themeAdd(path.join(shared, 'ocean'), {cwd: app}),
    ).rejects.toThrow(/ocean\.css changed since/);
    expect(
      fs.readFileSync(path.join(app, 'src/themes/ocean/ocean.css'), 'utf8'),
    ).toBe('mine\n');
  });

  it('theme remove undoes the add: its files go, a changed one stays, and what it installed is uninstalled', async () => {
    const before = tree(app);
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    runs.length = 0;
    const removed = await themeRemove('ocean', {cwd: app});
    expect(removed.data.undo).toMatchObject({
      kept: [],
      uninstalled: ['@astryxdesign/theme-neutral'],
    });
    expect(runs).toEqual([
      {
        cmd: 'npm',
        args: ['uninstall', '@astryxdesign/theme-neutral', '--ignore-scripts'],
        cwd: app,
      },
    ]);
    expect(tree(app)).toEqual(before);

    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    fs.writeFileSync(path.join(app, 'src/themes/ocean/ocean.css'), 'mine\n');
    const again = await themeRemove('ocean', {cwd: app});
    expect(again.data.undo?.kept).toEqual(['ocean.css']);
    expect(
      fs.readFileSync(path.join(app, 'src/themes/ocean/ocean.css'), 'utf8'),
    ).toBe('mine\n');
  });

  it('keeps a file the builder added to the copy through an update, and refuses one the update also ships before anything moves', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean');
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    fs.writeFileSync(path.join(app, 'src/themes/ocean/mine.css'), 'mine\n');
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(
      fs.readFileSync(path.join(app, 'src/themes/ocean/mine.css'), 'utf8'),
    ).toBe('mine\n');

    fs.writeFileSync(path.join(shared, 'ocean', 'mine.css'), 'shipped\n');
    const before = tree(app);
    await expect(
      themeAdd(path.join(shared, 'ocean'), {cwd: app}),
    ).rejects.toThrow(/holds mine\.css, which you added to the copy/);
    expect(tree(app)).toEqual(before);
  });

  it('refuses a built module that does not export the theme, before copying', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean');
    fs.writeFileSync(
      path.join(shared, 'ocean', 'ocean.js'),
      'export const somethingElse = {};\n',
    );
    const before = tree(app);
    await expect(
      themeAdd(path.join(shared, 'ocean'), {cwd: app}),
    ).rejects.toThrow(/does not export oceanTheme/);
    expect(tree(app)).toEqual(before);
  });

  it('puts the old copy back when an update cannot be recorded', async test => {
    // (A folder it cannot write stops the record; root writes anyway.)
    if (process.getuid?.() === 0) test.skip();
    writeTheme(path.join(shared, 'ocean'), 'ocean');
    const added = await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    fs.writeFileSync(
      path.join(shared, 'ocean', 'ocean.css'),
      '[data-astryx-theme="ocean"] {color: red}\n',
    );
    const module = path.join(app, added.data.modulePath);
    const before = tree(app);
    fs.chmodSync(module, 0o444);
    fs.chmodSync(path.dirname(module), 0o555);
    try {
      await expect(
        themeAdd(path.join(shared, 'ocean'), {cwd: app}),
      ).rejects.toThrow();
    } finally {
      fs.chmodSync(path.dirname(module), 0o755);
      fs.chmodSync(module, 0o644);
    }
    expect(tree(app)).toEqual(before);
  });

  it('reports the workspace lockfile an install in a workspace app rewrites', async () => {
    const ws = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-theme-add-shared-ws-'),
    );
    try {
      fs.writeFileSync(
        path.join(ws, 'package.json'),
        JSON.stringify({name: 'ws', private: true}),
      );
      fs.writeFileSync(
        path.join(ws, 'pnpm-workspace.yaml'),
        'packages:\n  - apps/*\n',
      );
      fs.writeFileSync(
        path.join(ws, 'pnpm-lock.yaml'),
        'lockfileVersion: 9.0\n',
      );
      const wsApp = path.join(ws, 'apps', 'web');
      fs.mkdirSync(path.join(wsApp, 'src'), {recursive: true});
      const appPkg = JSON.parse(
        fs.readFileSync(path.join(app, 'package.json'), 'utf8'),
      );
      // A member that declares its package manager, with the lockfile at
      // the workspace root.
      fs.writeFileSync(
        path.join(wsApp, 'package.json'),
        JSON.stringify({...appPkg, packageManager: 'pnpm@9.0.0'}),
      );
      fs.cpSync(
        path.join(app, 'node_modules'),
        path.join(wsApp, 'node_modules'),
        {
          recursive: true,
        },
      );
      writeTheme(path.join(shared, 'ocean'), 'ocean', {
        imports: ['@astryxdesign/theme-neutral/built'],
      });
      const result = await themeAdd(path.join(shared, 'ocean'), {cwd: wsApp});
      expect(runs).toEqual([
        {
          cmd: 'pnpm',
          args: [
            'add',
            `@astryxdesign/theme-neutral@${CLI_VERSION}`,
            '--ignore-scripts',
          ],
          cwd: wsApp,
        },
      ]);
      expect(result.data.copy?.written).toEqual(
        expect.arrayContaining(['package.json', '../../pnpm-lock.yaml']),
      );
      // (pnpm remove takes the scripts-off setting, not --ignore-scripts.)
      runs.length = 0;
      await themeRemove('ocean', {cwd: wsApp});
      expect(runs).toEqual([
        {
          cmd: 'pnpm',
          args: [
            'remove',
            '@astryxdesign/theme-neutral',
            '--config.ignore-scripts=true',
          ],
          cwd: wsApp,
        },
      ]);
    } finally {
      fs.rmSync(ws, {recursive: true, force: true});
    }
  });

  it('theme remove deletes and uninstalls only what a receipt may name: files inside the copy, Astryx packages', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean');
    writeTheme(path.join(shared, 'sunset'), 'sunset');
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    await themeAdd(path.join(shared, 'sunset'), {cwd: app});
    fs.writeFileSync(path.join(app, 'vite.config.ts'), 'export default {};\n');
    // (A hand-edited receipt that reaches out of the copy.)
    const receiptFile = path.join(app, 'src/themes/ocean/.astryx-shared.json');
    const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    // (Each with the hash of what it holds, so only the confinement keeps
    // it.)
    const hashOf = (/** @type {string} */ file) =>
      crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    receipt.files['../../../vite.config.ts'] = hashOf(
      path.join(app, 'vite.config.ts'),
    );
    const outside = path.join(shared, 'outside.txt');
    fs.writeFileSync(outside, 'keep me\n');
    receipt.files[outside] = hashOf(outside);
    receipt.installed = ['react', '@astryxdesign/theme-neutral'];
    fs.writeFileSync(receiptFile, JSON.stringify(receipt));
    runs.length = 0;
    const removed = await themeRemove('ocean', {cwd: app});
    expect(fs.existsSync(path.join(app, 'vite.config.ts'))).toBe(true);
    expect(fs.existsSync(outside)).toBe(true);
    expect(removed.data.undo?.removed.join('\n')).not.toMatch(/vite|outside/);
    expect(runs.flatMap(r => r.args)).not.toContain('react');
  });

  it('theme remove keeps a package a theme still in the record imports', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    writeTheme(path.join(shared, 'sunset'), 'sunset', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    const second = await themeAdd(path.join(shared, 'sunset'), {cwd: app});
    expect(second.data.copy?.previousDefault).toBe('ocean');
    runs.length = 0;
    const removed = await themeRemove('ocean', {cwd: app});
    expect(removed.data.undo?.uninstalled).toEqual([]);
    expect(runs).toEqual([]);
    expect(fs.existsSync(path.join(app, 'src/themes/ocean'))).toBe(false);
  });

  it('turns install scripts off on Yarn 2 and later in the form it takes', async () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(app, 'package.json'), 'utf8'),
    );
    fs.writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({...pkg, packageManager: 'yarn@4.5.0'}),
    );
    fs.rmSync(path.join(app, 'package-lock.json'));
    fs.writeFileSync(
      path.join(app, 'yarn.lock'),
      '__metadata:\n  version: 8\n',
    );
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    await themeRemove('ocean', {cwd: app});
    expect(runs).toEqual([
      {
        cmd: 'yarn',
        args: [
          'add',
          `@astryxdesign/theme-neutral@${CLI_VERSION}`,
          '--mode=skip-build',
        ],
        cwd: app,
      },
      {
        cmd: 'yarn',
        args: ['remove', '@astryxdesign/theme-neutral', '--mode=skip-build'],
        cwd: app,
      },
    ]);
  });

  it('reads a Yarn 1 app as Yarn 1 even with a .yarnrc.yml, and a Yarn 2+ app by its lockfile', async () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(app, 'package.json'), 'utf8'),
    );
    fs.rmSync(path.join(app, 'package-lock.json'));
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    fs.writeFileSync(
      path.join(app, 'package.json'),
      JSON.stringify({...pkg, packageManager: 'yarn@1.22.22'}),
    );
    fs.writeFileSync(path.join(app, 'yarn.lock'), '# yarn lockfile v1\n');
    fs.writeFileSync(
      path.join(app, '.yarnrc.yml'),
      'nodeLinker: node-modules\n',
    );
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(runs.at(-1)?.args.at(-1)).toBe('--ignore-scripts');
    await themeRemove('ocean', {cwd: app});

    fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(pkg));
    fs.rmSync(path.join(app, '.yarnrc.yml'));
    fs.writeFileSync(
      path.join(app, 'yarn.lock'),
      '__metadata:\n  version: 8\n',
    );
    runs.length = 0;
    await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(runs.at(-1)?.args.at(-1)).toBe('--mode=skip-build');
  });

  it("follows an integration's install guidance in place of the package manager", async () => {
    recordDeclaredSettings(app, [
      {
        name: '@acme/ui',
        installGuidance:
          'Add {packages} to package.json, then run the relock script',
      },
    ]);
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built', 'left-pad'],
    });
    const result = await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(runs).toEqual([]);
    expect(result.data.copy).toMatchObject({
      installed: [],
      installRan: false,
      installGuidance:
        'Add left-pad to package.json, then run the relock script',
      installRetryCommand: `Add @astryxdesign/theme-neutral@${CLI_VERSION} to package.json, then run the relock script`,
    });
    recordDeclaredSettings(app, []);
  });

  it('installs nothing for a base the app has installed without declaring it', async () => {
    const base = path.join(
      app,
      'node_modules',
      '@astryxdesign',
      'theme-neutral',
    );
    fs.mkdirSync(base, {recursive: true});
    fs.writeFileSync(
      path.join(base, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/theme-neutral',
        version: CLI_VERSION,
        exports: {'./built': './built.js'},
      }),
    );
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    const result = await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(runs).toEqual([]);
    expect(result.data.copy?.installed).toEqual([]);
  });

  it('keeps a failed Astryx install apart from the packages it never installs', async () => {
    failInstall = true;
    writeTheme(path.join(shared, 'ocean'), 'ocean', {
      imports: ['@astryxdesign/theme-neutral/built'],
    });
    const result = await themeAdd(path.join(shared, 'ocean'), {cwd: app});
    expect(result.data.copy).toMatchObject({
      installed: [],
      installCommand: null,
      installError: 'npm error network unreachable',
      installRetryCommand: `npm install @astryxdesign/theme-neutral@${CLI_VERSION} --ignore-scripts`,
    });
  });

  it('follows https redirects one hop at a time and refuses a hop over http before requesting it', async () => {
    const archive = tgz(themeEntries('bundle/', 'sunset'));
    /** @type {string[]} */
    const asked = [];
    vi.stubGlobal('fetch', async (/** @type {string} */ url) => {
      asked.push(url);
      if (url === 'https://a.example/theme.tgz')
        return new globalThis.Response(null, {
          status: 302,
          headers: {location: 'https://b.example/theme.tgz'},
        });
      if (url === 'https://b.example/theme.tgz')
        return new globalThis.Response(archive, {status: 200});
      if (url === 'https://c.example/theme.tgz')
        return new globalThis.Response(null, {
          status: 301,
          headers: {location: 'http://hop.example/theme.tgz'},
        });
      throw new Error(`unexpected request ${url}`);
    });
    const before = tree(app);
    await expect(
      themeAdd('https://c.example/theme.tgz', {cwd: app}),
    ).rejects.toThrow(
      /redirects to http:\/\/hop\.example\/theme\.tgz, which is not https/,
    );
    expect(asked).toEqual(['https://c.example/theme.tgz']);
    expect(tree(app)).toEqual(before);
    const result = await themeAdd('https://a.example/theme.tgz', {cwd: app});
    expect(result.data.default).toBe('sunset');
    expect(asked.slice(1)).toEqual([
      'https://a.example/theme.tgz',
      'https://b.example/theme.tgz',
    ]);
  });

  it.each([
    [
      'an entry outside its folder',
      {'../escape.txt': 'x'},
      /would land outside/,
    ],
    [
      'a link',
      {'theme/link': {type: '2', target: '/etc/passwd'}},
      /a link or a special file/,
    ],
    ['no theme', {'notes/readme.md': 'hello'}, /holds no theme/],
  ])(
    'refuses an archive with %s and writes nothing',
    async (_, entries, why) => {
      const archive = path.join(shared, 'bad.tgz');
      fs.writeFileSync(archive, tgz(entries));
      const before = tree(app);
      await expect(themeAdd(archive, {cwd: app})).rejects.toThrow(why);
      expect(tree(app)).toEqual(before);
      expect(fs.existsSync(path.join(shared, 'escape.txt'))).toBe(false);
    },
  );

  it('refuses a plain http URL, a file that is not a gzip archive, and two themes at once', async () => {
    const before = tree(app);
    await expect(
      themeAdd('http://example.com/ocean-theme.tgz', {cwd: app}),
    ).rejects.toThrow(/is not an https URL/);
    expect(tree(app)).toEqual(before);
    const notGzip = path.join(shared, 'theme.tgz');
    fs.writeFileSync(notGzip, 'plain text');
    await expect(themeAdd(notGzip, {cwd: app})).rejects.toThrow(/not gzip/);
    writeTheme(path.join(shared, 'two', 'a'), 'ocean');
    writeTheme(path.join(shared, 'two', 'b'), 'sunset');
    await expect(
      themeAdd(path.join(shared, 'two'), {cwd: app}),
    ).rejects.toThrow(/holds 2 themes \(a, b\)/);
  });

  it('keeps a slug a slug, and refuses --package with a shared theme', async () => {
    writeTheme(path.join(shared, 'ocean'), 'ocean');
    await expect(
      themeAdd(path.join(shared, 'ocean'), {cwd: app, package: '@acme/themes'}),
    ).rejects.toThrow(/--package selects a theme by its slug/);
    await expect(themeAdd('ocean', {cwd: app})).rejects.toThrow(
      /Unknown theme "ocean"/,
    );
  });
});
