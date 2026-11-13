// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt36: the app is the nearest folder at or above the working folder
 * whose package.json lists @astryxdesign/core. A workspace member that does
 * not use Core, a subfolder of an app that does not list it, deep workspace
 * globs and any pnpm-workspace.yaml form are refused with the apps that do;
 * a deleted working folder gets a plain error.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditShow} from './theme-edit.mjs';
import {projectRoot} from './_adapter.mjs';
import {coreApp} from './_context.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

/** @type {string} */
let ws;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

/** @param {string} rel @param {object | string} json */
const write = (rel, json) => {
  fs.mkdirSync(path.dirname(path.join(ws, rel)), {recursive: true});
  fs.writeFileSync(
    path.join(ws, rel),
    typeof json === 'string' ? json : JSON.stringify(json),
  );
};

beforeAll(() => {
  ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-h36-')));
  write('apps/team/web/package.json', {
    name: 'web',
    dependencies: {'@astryxdesign/core': '*'},
  });
  write('packages/ui/package.json', {name: 'ui', dependencies: {react: '*'}});
  fs.mkdirSync(path.join(ws, 'packages/ui/src'), {recursive: true});
  // Core hoisted to the workspace root.
  write('node_modules/@astryxdesign/core/package.json', {
    name: '@astryxdesign/core',
  });
});

afterAll(() => {
  fs.rmSync(ws, {recursive: true, force: true});
});

describe('hunt36: the app is the nearest package.json that lists Core', () => {
  for (const [
    label,
    rootJson,
    yaml,
  ] of /** @type {Array<[string, object, string | null]>} */ ([
    ['one-level glob', {workspaces: ['apps/*', 'packages/*']}, null],
    ['deep glob', {workspaces: ['apps/*/*', 'packages/*']}, null],
    ['double-star glob', {workspaces: ['apps/**']}, null],
    ['pnpm list with a comment', {}, 'packages:\n  - "apps/*/*" # the apps\n'],
    ['pnpm flow list', {}, "packages: ['apps/**']\n"],
  ]))
    it(`a member without Core, its subfolder and the root are refused (${label}), naming the app`, async () => {
      write('package.json', {name: 'root', private: true, ...rootJson});
      if (yaml) write('pnpm-workspace.yaml', yaml);
      else fs.rmSync(path.join(ws, 'pnpm-workspace.yaml'), {force: true});
      for (const from of ['packages/ui', 'packages/ui/src', '.']) {
        const cwd = path.join(ws, from);
        const err = await refusal(() => themeEditNew('z', {cwd}));
        expect(err.code, from).toBe('ERR_PROJECT_REQUIRED');
        expect(err.message, from).toContain('workspace root');
        expect(err.message, from).toContain('apps/team/web');
        expect(err.run.join('\n'), from).toMatch(
          /^cd (\.\.\/)*apps\/team\/web$/m,
        );
        expect(fs.existsSync(path.join(cwd, 'themes')), from).toBe(false);
      }
    });

  it('a folder under an app that lists Core works on the app, past a nested repo', () => {
    const app = path.join(ws, 'apps/team/web');
    fs.mkdirSync(path.join(app, 'vendor/lib/.git'), {recursive: true});
    expect(projectRoot(path.join(app, 'vendor/lib'))).toBe(app);
  });

  it('with no package.json listing Core, outside a workspace, names where Core resolves', async () => {
    const solo = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-h36s-')),
    );
    try {
      fs.writeFileSync(path.join(solo, 'package.json'), '{"name":"solo"}');
      fs.mkdirSync(path.join(solo, 'node_modules/@astryxdesign/core'), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(solo, 'node_modules/@astryxdesign/core/package.json'),
        '{}',
      );
      fs.mkdirSync(path.join(solo, 'src'));
      const err = await refusal(() =>
        themeEditShow('t', {cwd: path.join(solo, 'src')}),
      );
      expect(err.code).toBe('ERR_PROJECT_REQUIRED');
      expect(err.message).toContain(
        'resolves from ../node_modules/@astryxdesign/core',
      );
      expect(err.run.join('\n')).toMatch(
        /^(npm install|(pnpm|yarn|bun) add) @astryxdesign\/core$/,
      );
      expect(fs.existsSync(path.join(solo, 'src/themes'))).toBe(false);
    } finally {
      fs.rmSync(solo, {recursive: true, force: true});
    }
  });
});

describe('hunt36b: the app search', () => {
  /** @param {string} prefix */
  const tmp = prefix =>
    fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  /** @param {string} file @param {unknown} json */
  const put = (file, json) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(
      file,
      typeof json === 'string' ? json : JSON.stringify(json),
    );
  };

  it('F1: the home folder is the app when its package.json lists Core', () => {
    const home = tmp('astryx-h36b-home-');
    const saved = process.env.HOME;
    try {
      put(path.join(home, 'package.json'), {
        dependencies: {'@astryxdesign/core': '*'},
      });
      fs.mkdirSync(path.join(home, 'src'));
      process.env.HOME = home;
      expect(coreApp(home)).toBe(home);
      expect(coreApp(path.join(home, 'src'))).toBe(home);
      // Out of another repository below home: that repo, not home.
      fs.mkdirSync(path.join(home, 'code/app/.git'), {recursive: true});
      expect(coreApp(path.join(home, 'code/app'))).toBe(null);
    } finally {
      process.env.HOME = saved;
      fs.rmSync(home, {recursive: true, force: true});
    }
  });

  it('F4: a folder inside node_modules is never the app', () => {
    const app = tmp('astryx-h36b-nm-');
    try {
      put(path.join(app, 'package.json'), {
        dependencies: {'@astryxdesign/core': '*'},
      });
      const pkg = path.join(app, 'node_modules/@astryxdesign/theme-neutral');
      put(path.join(pkg, 'package.json'), {
        name: '@astryxdesign/theme-neutral',
        peerDependencies: {'@astryxdesign/core': '*'},
      });
      expect(coreApp(pkg)).toBe(app);
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });

  it('F6: a dependency field that is not an object is read as no Core', async () => {
    const app = tmp('astryx-h36b-f6-');
    try {
      put(path.join(app, 'package.json'), {
        name: 'a',
        dependencies: 1,
        peerDependencies: '@astryxdesign/core',
      });
      const err = await refusal(() => themeEditShow('t', {cwd: app}));
      expect(err.code).toBe('ERR_PROJECT_REQUIRED');
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });

  it('F2/F7: install lines use the app package manager; a Plug-n-Play app gets its own refusal', async () => {
    const app = tmp('astryx-h36b-pm-');
    try {
      put(path.join(app, 'package.json'), {name: 'a'});
      put(path.join(app, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
      const err = await refusal(() => themeEditShow('t', {cwd: app}));
      // The package manager the app uses (or the one running the command).
      expect(err.run.join('\n')).toMatch(
        /^(pnpm|yarn|bun) add @astryxdesign\/core$|^npm install @astryxdesign\/core$/,
      );
      expect(err.run.join('\n')).not.toBe('npm install @astryxdesign/core');
      put(path.join(app, 'package.json'), {
        name: 'a',
        dependencies: {'@astryxdesign/core': '*'},
      });
      fs.rmSync(path.join(app, 'pnpm-lock.yaml'));
      put(path.join(app, 'yarn.lock'), '');
      put(path.join(app, '.pnp.cjs'), '');
      fs.mkdirSync(path.join(app, 'src'));
      const pnp = await refusal(() =>
        themeEditShow('t', {cwd: path.join(app, 'src')}),
      );
      expect(pnp.message).toContain("Plug'n'Play");
      fs.rmSync(path.join(app, '.pnp.cjs'));
      const missing = await refusal(() => themeEditShow('t', {cwd: app}));
      expect(missing.run.join('\n')).toMatch(/^(npm|pnpm|yarn|bun) install$/);
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  });

  it('F5: a deep app is named, and a folder starting with a dash is cd-safe', async () => {
    const root = tmp('astryx-h36b-ws-');
    try {
      put(path.join(root, 'package.json'), {name: 'r', workspaces: ['**']});
      put(path.join(root, 'apps/team/sub/deep/web/package.json'), {
        dependencies: {'@astryxdesign/core': '*'},
      });
      put(path.join(root, '-web/package.json'), {
        dependencies: {'@astryxdesign/core': '*'},
      });
      const err = await refusal(() => themeEditShow('t', {cwd: root}));
      expect(err.run).toContain('cd apps/team/sub/deep/web');
      expect(err.run).toContain('cd ./-web');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});

describe('hunt36b: a package.json that does not parse', () => {
  it('names the file and the parse error, and suggests opening it', () => {
    const mono = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-h36b-bad-')),
    );
    try {
      fs.writeFileSync(
        path.join(mono, 'package.json'),
        JSON.stringify({dependencies: {'@astryxdesign/core': '*'}}),
      );
      fs.mkdirSync(path.join(mono, 'tool'));
      fs.writeFileSync(
        path.join(mono, 'tool/package.json'),
        '{\n  "name": "tool",\n}\n',
      );
      let err;
      try {
        projectRoot(path.join(mono, 'tool'));
      } catch (e) {
        err = /** @type {any} */ (e);
      }
      expect(err?.code).toBe('ERR_PROJECT_REQUIRED');
      expect(err?.message).toContain('package.json is not valid JSON (');
      expect(err?.message).toMatch(/line \d+ column \d+|position \d+/);
      expect(err?.suggestions?.[0]?.name).toMatch(/package\.json$/);
    } finally {
      fs.rmSync(mono, {recursive: true, force: true});
    }
  });
});

describe('hunt36 E1: a deleted working folder', () => {
  it('gets a plain error, in text and in --json', () => {
    const gone = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-h36g-'));
    const sub = path.join(gone, 'a');
    fs.mkdirSync(sub);
    const run = (/** @type {string[]} */ args) =>
      spawnSync(
        'sh',
        [
          '-c',
          `cd "${sub}" && rm -rf "${gone}" && exec "${process.execPath}" "${BIN}" "$@"`,
          'sh',
          ...args,
        ],
        {encoding: 'utf8'},
      );
    const text = run(['experimental', 'theme', 'editor', 'show', 't']);
    expect(text.status).toBe(1);
    expect(text.stderr).toContain('The current folder no longer exists');
    expect(text.stderr).not.toMatch(/\bat \w|uv_cwd/);
    fs.mkdirSync(sub, {recursive: true});
    const json = run([
      '--json',
      'experimental',
      'theme',
      'editor',
      'show',
      't',
    ]);
    expect(json.status).toBe(1);
    const env = JSON.parse(json.stdout);
    expect(env.code).toBe('ERR_PROJECT_REQUIRED');
    expect(env.error).toContain('The current folder no longer exists');
    // Help and the version read no folder: they still answer.
    fs.mkdirSync(sub, {recursive: true});
    expect(run(['--version']).status).toBe(0);
    fs.mkdirSync(sub, {recursive: true});
    expect(run(['--help']).status).toBe(0);
    fs.rmSync(gone, {recursive: true, force: true});
  });

  it('help, the version and docs leave the nearest existing folder as it was', () => {
    // A parent of its own (nothing else writes there), holding one file.
    const parent = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-h36p-')),
    );
    fs.writeFileSync(path.join(parent, 'keep.txt'), 'x');
    const gone = path.join(parent, 'gone');
    const sub = path.join(gone, 'a');
    // Its entries and their times, the deleted folder aside.
    const snapshot = () =>
      fs
        .readdirSync(parent, {recursive: true})
        .map(String)
        .filter(f => f !== 'gone' && !f.startsWith(`gone${path.sep}`))
        .sort()
        .map(f => {
          const st = fs.statSync(path.join(parent, f));
          return `${f} ${st.mtimeMs} ${st.size}`;
        });
    const before = snapshot();
    try {
      for (const args of [['--help'], ['--version'], ['docs']]) {
        fs.mkdirSync(sub, {recursive: true});
        const r = spawnSync(
          'sh',
          [
            '-c',
            `cd "${sub}" && rm -rf "${gone}" && exec "${process.execPath}" "${BIN}" "$@"`,
            'sh',
            ...args,
          ],
          {encoding: 'utf8'},
        );
        expect(r.status, args.join(' ')).toBe(0);
        expect(snapshot(), args.join(' ')).toEqual(before);
      }
    } finally {
      fs.rmSync(parent, {recursive: true, force: true});
    }
  }, 120_000);
});
