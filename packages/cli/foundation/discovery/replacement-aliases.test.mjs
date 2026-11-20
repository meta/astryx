// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The old names a replaced doc leaves behind: one replacement, a chain
 * of two and three, recorded in either order, and the names that answer
 * with a doc.
 */

import {describe, expect, it} from 'vitest';
import {ReplacementAliases} from './replacement-aliases.mjs';

const current = (/** @type {string[]} */ ...names) => {
  const known = new Set(names);
  return (/** @type {string} */ name) => known.has(name);
};

describe('ReplacementAliases', () => {
  it('answers an old name with the doc that replaced it', () => {
    const aliases = new ReplacementAliases();
    aliases.record('trash', 'delete');
    expect(aliases.resolve('trash', current('delete'))).toBe('delete');
    expect(aliases.resolve('delete', current('delete'))).toBe('delete');
    expect(aliases.resolve('bin', current('delete'))).toBeUndefined();
  });

  it('follows a second and a third replacement, in either order', () => {
    for (const order of [
      [
        ['trash', 'delete'],
        ['delete', 'remove'],
        ['remove', 'discard'],
      ],
      [
        ['remove', 'discard'],
        ['delete', 'remove'],
        ['trash', 'delete'],
      ],
    ]) {
      const aliases = new ReplacementAliases();
      for (const [from, to] of order) aliases.record(from, to);
      const exists = current('discard');
      expect(aliases.resolve('remove', exists)).toBe('discard');
      expect(aliases.resolve('delete', exists)).toBe('discard');
      expect(aliases.resolve('trash', exists)).toBe('discard');
    }
  });

  it('lists the old names that answer with a doc', () => {
    const aliases = new ReplacementAliases();
    aliases.record('trash', 'delete');
    aliases.record('delete', 'remove');
    expect(aliases.aliasesOf('remove').sort()).toEqual(['delete', 'trash']);
    expect(aliases.aliasesOf('delete')).toEqual([]);
  });

  it('lists every old name when the replacements were recorded out of order', () => {
    const aliases = new ReplacementAliases();
    aliases.record('delete', 'remove');
    aliases.record('trash', 'delete');
    expect(aliases.aliasesOf('remove').sort()).toEqual(['delete', 'trash']);
  });

  it('compares names the way its owner does', () => {
    const aliases = new ReplacementAliases(name => name.toLowerCase());
    aliases.record('Theme', 'brand-theme');
    expect(aliases.resolve('THEME', current('brand-theme'))).toBe(
      'brand-theme',
    );
    expect(aliases.aliasesOf('Brand-Theme')).toEqual(['theme']);
  });

  it('ends a walk that never reaches a doc', () => {
    const aliases = new ReplacementAliases();
    aliases.record('a', 'b');
    aliases.record('b', 'a');
    expect(aliases.resolve('a', current())).toBeUndefined();
  });
});
