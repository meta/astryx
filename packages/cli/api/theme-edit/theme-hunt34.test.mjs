// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The thirty-fourth pass over `astryx experimental theme editor`: a
 * render that fails in show puts back what show built and says so, a
 * workspace root is refused with the apps that use Core, and an undo that
 * names a token or a property is never answered with a step back.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal => {
  const stubbed = (
    await import('../../test-utils/theme-render-stub.mjs')
  ).stubRenders(await importOriginal());
  return {
    ...stubbed,
    /** @param {any[]} args */
    async renderPreview(...args) {
      if (/** @type {any} */ (globalThis).__failRender)
        throw new Error('Invalid hook call.');
      return /** @type {any} */ (stubbed).renderPreview(...args);
    },
  };
});

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt34-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  await themeEditSet('t', 'corners', 'pill', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ x) => x.name);

describe('N1: a render that fails in show', () => {
  it('puts back the build it made again, says so, and names doctor', async () => {
    const css = path.join(cwd, 'themes/t/t.css');
    fs.appendFileSync(css, '/* x */\n');
    const edited = fs.readFileSync(css, 'utf8');
    /** @type {any} */ (globalThis).__failRender = true;
    try {
      const err = await refusal(() => themeEditShow('t', {cwd}));
      expect(err.code).toBe('ERR_RENDER_FAILED');
      expect(err.message).toContain('Invalid hook call.');
      expect(err.message).toContain('put back as it was');
      expect(err.message).toContain('Nothing was written.');
      expect(names(err).join('\n')).toMatch(/ doctor$/m);
      expect(fs.readFileSync(css, 'utf8')).toBe(edited);
    } finally {
      /** @type {any} */ (globalThis).__failRender = false;
    }
    await themeEditShow('t', {cwd});
  }, 240_000);
});

describe('r19 (3): a failed render in show leaves no output it made new', () => {
  it('removes an output that was not there, and puts tokens/ back', async () => {
    const dir = path.join(cwd, 'themes/t');
    fs.appendFileSync(path.join(dir, 't.css'), '/* y */\n');
    const missing = ['t.d.ts', 't.css.d.ts']
      .map(n => path.join(dir, n))
      .filter(f => fs.existsSync(f));
    for (const f of missing) fs.rmSync(f);
    const tokens = path.join(dir, 'tokens');
    const before = fs.existsSync(tokens)
      ? Object.fromEntries(
          fs
            .readdirSync(tokens)
            .map(n => [n, fs.readFileSync(path.join(tokens, n), 'utf8')]),
        )
      : null;
    /** @type {any} */ (globalThis).__failRender = true;
    try {
      const err = await refusal(() => themeEditShow('t', {cwd}));
      expect(err.code).toBe('ERR_RENDER_FAILED');
      for (const f of missing) expect(fs.existsSync(f), f).toBe(false);
      const after = fs.existsSync(tokens)
        ? Object.fromEntries(
            fs
              .readdirSync(tokens)
              .map(n => [n, fs.readFileSync(path.join(tokens, n), 'utf8')]),
          )
        : null;
      expect(after).toEqual(before);
    } finally {
      /** @type {any} */ (globalThis).__failRender = false;
    }
    await themeEditShow('t', {cwd});
  }, 240_000);
});

describe('r19b (4): a failed render keeps a folder the user put in tokens/', () => {
  it('neither crashes nor removes the folder', async () => {
    const dir = path.join(cwd, 'themes/t');
    fs.appendFileSync(path.join(dir, 't.css'), '/* z */\n');
    const mine = path.join(dir, 'tokens', 'mine');
    fs.mkdirSync(mine, {recursive: true});
    fs.writeFileSync(path.join(mine, 'note.txt'), 'keep');
    /** @type {any} */ (globalThis).__failRender = true;
    try {
      const err = await refusal(() => themeEditShow('t', {cwd}));
      expect(err.code).toBe('ERR_RENDER_FAILED');
      expect(fs.readFileSync(path.join(mine, 'note.txt'), 'utf8')).toBe('keep');
    } finally {
      /** @type {any} */ (globalThis).__failRender = false;
      fs.rmSync(mine, {recursive: true, force: true});
    }
    await themeEditShow('t', {cwd});
  }, 240_000);
});

describe('N3: a workspace root with Core hoisted', () => {
  it('is refused from the root and from a folder without a package.json, naming the app', async () => {
    const root = path.dirname(cwd);
    const rootPkg = path.join(root, 'package.json');
    const kept = fs.readFileSync(rootPkg, 'utf8');
    const web = path.join(cwd, 'web');
    fs.mkdirSync(web, {recursive: true});
    fs.writeFileSync(
      path.join(web, 'package.json'),
      JSON.stringify({name: 'web', dependencies: {'@astryxdesign/core': '*'}}),
    );
    fs.writeFileSync(
      rootPkg,
      JSON.stringify({
        name: 'root',
        private: true,
        type: 'module',
        workspaces: ['project/*'],
      }),
    );
    try {
      for (const [where, run] of /** @type {const} */ ([
        [root, () => themeEditShow('t', {cwd: root})],
        [cwd, () => themeEditNew('y', {cwd})],
      ])) {
        const err = await refusal(run);
        expect(err.code, where).toBe('ERR_PROJECT_REQUIRED');
        expect(err.message).toContain('is a workspace root');
        expect(names(err).join('\n')).toMatch(/^cd (project\/)?web$/m);
      }
      expect(fs.existsSync(path.join(root, 'themes'))).toBe(false);
      expect(fs.existsSync(path.join(cwd, 'themes/y'))).toBe(false);
    } finally {
      fs.writeFileSync(rootPkg, kept);
      fs.rmSync(web, {recursive: true, force: true});
    }
  }, 240_000);
});

describe('N4: an undo that names a token or a property', () => {
  it('suggests the setting itself, never a bare undo', async () => {
    await themeEditSet('t', '--radius-element', '6px', {cwd});
    await themeEditSet('t', 'padding', '12px', {cwd, on: 'card'});
    const token = await refusal(() =>
      themeEditUndo('t', {cwd, thing: 'radius-element'}),
    );
    expect(names(token)).toContainEqual(
      expect.stringMatching(/ undo t --radius-element$/),
    );
    expect(names(token).join('\n')).not.toMatch(/ undo t$/m);
    const prop = await refusal(() =>
      themeEditUndo('t', {cwd, thing: 'padding'}),
    );
    expect(names(prop)).toContainEqual(
      expect.stringMatching(/ undo t padding --on card$/),
    );
    expect(names(prop).join('\n')).not.toMatch(/ undo t$/m);
  }, 240_000);
});

describe('N2: two copies of React are named', () => {
  it('finds Core past its exports, from its entry', async () => {
    const {renderCause} = await import('./_context.mjs');
    const {createRequire} = await import('node:module');
    const dir = fs.mkdtempSync(path.join(path.dirname(cwd), 'two-react-'));
    const write = (/** @type {string} */ f, /** @type {string} */ text) => {
      fs.mkdirSync(path.dirname(path.join(dir, f)), {recursive: true});
      fs.writeFileSync(path.join(dir, f), text);
    };
    write('package.json', '{"name":"app"}');
    write('node_modules/react/package.json', '{"name":"react","main":"i.js"}');
    write('node_modules/react/i.js', '');
    write(
      'node_modules/@astryxdesign/core/package.json',
      JSON.stringify({
        name: '@astryxdesign/core',
        exports: {'.': './dist/index.js'},
      }),
    );
    write('node_modules/@astryxdesign/core/dist/index.js', '');
    write(
      'node_modules/@astryxdesign/core/node_modules/react/package.json',
      '{"name":"react","main":"i.js"}',
    );
    write('node_modules/@astryxdesign/core/node_modules/react/i.js', '');
    const project = /** @type {any} */ ({
      req: createRequire(path.join(dir, 'package.json')),
    });
    expect(renderCause(project, 'Invalid hook call.')).toContain(
      'two copies of React',
    );
  });
});
