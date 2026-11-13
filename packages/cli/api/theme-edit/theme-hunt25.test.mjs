// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-fifth pass over `astryx experimental theme editor`: a
 * theme file that is a folder or cannot be read is named (never called
 * damaged, never offered for deletion), `./t` names the theme t, a mode or
 * base in other letters is offered back fixed, a base suggestion is always
 * installed, and a missing argument says what was given.
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
import {typedThemeName} from './_settings.mjs';
import {baseInstalled} from './_project.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt25-', FIXTURE_PACKAGES);
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

const dir = () => path.join(cwd, 'themes/t');
const advice = (/** @type {any} */ e) =>
  JSON.stringify([e.message, e.suggestions, e.fix]);

describe('R5/R6: a theme file that is a folder or cannot be read', () => {
  it.each([
    't.theme.ts',
    't.settings.ts',
    't.css',
    't.js',
    't.settings.json',
    't.history.json',
  ])(
    '%s replaced by a folder is named, for show, set and undo',
    async name => {
      const file = path.join(dir(), name);
      const kept = fs.readFileSync(file);
      fs.rmSync(file);
      fs.mkdirSync(file);
      try {
        for (const run of [
          () => themeEditShow('t', {cwd}),
          () => themeEditSet('t', 'corners', 'square', {cwd}),
          () => themeEditUndo('t', {cwd}),
        ]) {
          const err = await refusal(run);
          // The source files are named by the editor; a built file by the
          // build's own check (hunt24), with its code.
          expect(['ERR_THEME_INVALID', 'ERR_FILE_EXISTS']).toContain(err.code);
          expect(err.message).toMatch(/is a folder/);
          expect(advice(err)).not.toMatch(/delete|rm /i);
          expect(advice(err)).toContain('ls -la');
        }
      } finally {
        fs.rmSync(file, {recursive: true});
        fs.writeFileSync(file, kept);
      }
    },
    240_000,
  );

  it.runIf(process.getuid?.() !== 0)(
    'an unreadable history is not called damaged, and is never offered for deletion',
    async () => {
      const file = path.join(dir(), 't.history.json');
      fs.chmodSync(file, 0o000);
      try {
        const err = await refusal(() => themeEditUndo('t', {cwd}));
        expect(err.message).toContain('cannot be read');
        expect(err.message).not.toContain('damaged');
        expect(advice(err)).not.toMatch(/delete/i);
      } finally {
        fs.chmodSync(file, 0o644);
      }
    },
  );
});

describe('R2: ./t names the theme t', () => {
  it.each(['./t', '.\\t', './themes/t'])('%s', v => {
    expect(typedThemeName(v)).toBe('t');
  });
});

describe('R3: a mode or base in other letters', () => {
  it.each([
    ['mode', 'Dark-Only', / set t mode dark-only$/m],
    ['like', 'Neutral', / set t base (neutral|none)$/m],
  ])('%s %s is offered back fixed', async (field, value, want) => {
    const file = path.join(dir(), 't.settings.json');
    const kept = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(
      file,
      JSON.stringify({...JSON.parse(kept), [field]: value}),
    );
    try {
      const err = await refusal(() => themeEditShow('t', {cwd}));
      const names = (err.suggestions ?? []).map(
        (/** @type {any} */ x) => x.name,
      );
      expect(names.join('\n')).toMatch(want);
      // A base in other letters comes back fixed when it is installed.
      if (field === 'like' && baseInstalled(cwd, 'neutral'))
        expect(names.join('\n')).toMatch(/ set t base neutral$/m);
    } finally {
      fs.writeFileSync(file, kept);
    }
  });
});

describe('R1: a base suggestion is always installed', () => {
  it('STONE suggests a base the project lacks only after its install line', async () => {
    const err = await refusal(() => themeEditSet('t', 'base', 'STONE', {cwd}));
    /** @type {string[]} */
    const names = err.suggestions.map((/** @type {any} */ x) => x.name);
    names.forEach((name, i) => {
      for (const b of name.match(/ base (\S+)$/)?.slice(1) ?? [])
        if (b !== 'none' && !baseInstalled(cwd, b))
          expect(
            names
              .slice(0, i)
              .some(n => n.endsWith(` @astryxdesign/theme-${b}`)),
            name,
          ).toBe(true);
    });
  });
});

describe('R4: a missing argument says what was given', () => {
  it('set corners small: <value> is missing, read as <theme> <thing>', async () => {
    const r = await runCli(
      ['--json', 'experimental', 'theme', 'editor', 'set', 'corners', 'small'],
      cwd,
    );
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.code).toBe('ERR_MISSING_ARGUMENT');
    expect(out.error).toBe(
      'set takes <theme> <thing> <value>, and was given 2 (corners small), read as <theme> <thing>: <value> is missing.',
    );
    expect(out.suggestions[1].name).toMatch(
      / experimental theme editor set --help$/,
    );
  }, 120_000);
});
