// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A field's placeholder is not its text. A text color that reaches a
 * text input or a text area (set on it, or on a member of its family) goes
 * into the text token its value reads, never the secondary one its
 * placeholder reads, so an empty field's placeholder still reads as a
 * hint, not a typed value.
 * Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditNew, themeEditSet, themeEditHow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-placeholder-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** Every declaration block written for a part. @param {string} slug @param {string} [part] */
const textInputBlocks = (slug, part = 'text-input') =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(new RegExp(`\\.astryx-${part}\\)?[^{]*\\{([^}]*)\\}`, 'g')),
  ].map(m => m[1]);

describe('a text color that reaches a text input', () => {
  it('leaves the secondary color its placeholder reads', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('p', {cwd, like: 'neutral'});
    // A color on the selector reaches the whole inputs family.
    await themeEditSet('p', 'color', '#000000', {
      cwd,
      on: 'selector',
      mode: 'light',
    });
    const blocks = textInputBlocks('p');
    expect(blocks.some(b => /--color-text-primary: #000000;/.test(b))).toBe(
      true,
    );
    expect(blocks.some(b => /--color-text-secondary:/.test(b))).toBe(false);
  }, 240_000);

  it('leaves a text area its placeholder too, whose control is a part of its own', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('ta', {cwd, like: 'neutral'});
    await themeEditSet('ta', 'color', '#000000', {
      cwd,
      on: 'text-area',
      mode: 'light',
    });
    const blocks = textInputBlocks('ta', 'text-area');
    expect(blocks.some(b => /--color-text-primary: #000000;/.test(b))).toBe(
      true,
    );
    expect(blocks.some(b => /--color-text-secondary:/.test(b))).toBe(false);
  }, 240_000);

  it('leaves a text area its secondary text to ask for, its placeholder', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('th', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('red secondary text in the text area', {
      cwd,
      theme: 'th',
    });
    const top = (data.results ?? []).flatMap(
      (/** @type {{commands: string[]}} */ r) => r.commands,
    )[0];
    expect(top).toMatch(/--color-text-secondary/);
    expect(top).not.toMatch(/--color-text-primary/);
  }, 240_000);

  it('never answers secondary text on a part with none with the secondary token', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('tb', {cwd, like: 'neutral'});
    const {data} = await themeEditHow('red secondary text on buttons', {
      cwd,
      theme: 'tb',
    });
    const lines = (data.results ?? []).flatMap(
      (/** @type {{commands: string[]}} */ r) => r.commands,
    );
    expect(
      lines.filter(l => /--color-text-secondary .* --on button\b/.test(l)),
    ).toEqual([]);
  }, 240_000);

  it('is offered as the value text color alone', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    const e = await themeEditSet('o', 'color', '#000000', {
      cwd,
      on: 'text-input',
      only: true,
    }).catch(x => x);
    expect(String(e?.message ?? e)).not.toMatch(/--color-text-secondary/);
  }, 240_000);
});
