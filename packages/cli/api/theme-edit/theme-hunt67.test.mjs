// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt67: "focus ring color like the links" takes the ring's color
 * from that part (never a width on it); an amount of padding with nothing
 * there to take it of says the answer is a step.
 *
 * @position api/theme-edit — tests
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditHow, themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt67-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('q', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** The first answer with a change, and its first command. @param {string} q */
const top = async q => {
  const {data} = await themeEditHow(q, {cwd, theme: 'q'});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    command: (r?.commands[0] ?? '').replace(/^.* editor /, ''),
    text: r?.text ?? '',
    first: data.results?.[0]?.text ?? '',
  };
};

describe('hunt67', () => {
  it('focus ring color like the links: the ring takes the link color, theme-wide', async () => {
    const r = await top('focus ring color like the links');
    expect(r.command).toMatch(
      /^set q --focus-outline-color 'var\(--color-[a-z-]+\)'$/,
    );
    expect(r.text).toContain('from link');
  }, 120_000);

  it('a scope before "like" stays the scope', async () => {
    const r = await top('focus ring on inputs like the links');
    expect(r.command).toMatch(
      /^set q --focus-outline-color 'var\(--color-[a-z-]+\)' --on inputs$/,
    );
  }, 120_000);

  it('match the buttons: the buttons plain fill, not a variant', async () => {
    const r = await top('make the focus ring match the buttons');
    expect(r.command).toMatch(/--focus-outline-color/);
    expect(r.command).not.toMatch(/--color-error/);
  }, 120_000);

  it('an amount of padding with nothing to take it of says it is a step', async () => {
    const r = await top('double the padding on list items');
    expect(r.first).toContain('one step, not an exact amount');
  }, 120_000);
});
