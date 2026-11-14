// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {compareText} from './compare-text.mjs';

describe('compareText', () => {
  it('ignores case first, then puts lowercase first', () => {
    expect(
      ['b', 'a-b', 'ab', 'Ab', 'a', 'ChatMessage', 'ai-chat'].sort(compareText),
    ).toEqual(['a', 'a-b', 'ab', 'Ab', 'ai-chat', 'b', 'ChatMessage']);
  });

  it('is equal only for identical strings', () => {
    expect(compareText('ide', 'ide')).toBe(0);
    expect(compareText('ide', 'IDE')).toBeLessThan(0);
    expect(compareText('IDE', 'ide')).toBeGreaterThan(0);
  });

  it('keeps the letters a locale moves in their plain order', () => {
    // Lithuanian collation puts "y" next to "i", Czech puts "ch" after "h",
    // and Turkish separates dotted and dotless "i".
    expect(
      ['yield', 'item', 'hero', 'chart', 'IDE', 'ide'].sort(compareText),
    ).toEqual(['chart', 'hero', 'ide', 'IDE', 'item', 'yield']);
  });
});

describe('compareText follows the root collation classes', () => {
  it('puts spaces, then punctuation, then symbols, then digits, then letters', () => {
    // Inside one class, characters follow their code points.
    expect(
      ['a1', 'a b', 'a+b', 'a—b', 'ab', 'a_b', 'a-b', 'a.b', 'a/b'].sort(
        compareText,
      ),
    ).toEqual(['a b', 'a-b', 'a.b', 'a/b', 'a_b', 'a—b', 'a+b', 'a1', 'ab']);
  });

  it('keeps a group of em-dash names together after its plain name', () => {
    expect(
      [
        'List Item — Basic',
        'List — Basic',
        'List',
        'List Item',
        'Listbox',
      ].sort(compareText),
    ).toEqual([
      'List',
      'List — Basic',
      'List Item',
      'List Item — Basic',
      'Listbox',
    ]);
  });
});

describe('compareText on the shipped catalogs', () => {
  it('gives the order an English host gives for every template and component name', async () => {
    const {spawnSync} = await import('node:child_process');
    const path = await import('node:path');
    const repo = path.resolve(import.meta.dirname, '../../../..');
    const bin = path.resolve(
      import.meta.dirname,
      '../../clients/cli/bin/astryx.mjs',
    );
    /** @type {Set<string>} */
    const names = new Set();
    /** @param {any} v */
    const walk = v => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const k of ['id', 'name', 'displayName', 'category'])
          if (typeof v[k] === 'string') names.add(v[k]);
        Object.values(v).forEach(walk);
      }
    };
    for (const args of [
      ['template', '--list'],
      ['component', '--list'],
      ['hook'],
      ['docs'],
    ]) {
      const res = spawnSync(process.execPath, [bin, '--json', ...args], {
        cwd: repo,
        encoding: 'utf8',
      });
      expect(res.status, res.stderr).toBe(0);
      walk(JSON.parse(res.stdout));
    }
    expect(names.size).toBeGreaterThan(500);
    const english = new Intl.Collator('en');
    expect([...names].sort(compareText)).toEqual(
      [...names].sort(english.compare),
    );
  }, 60000);
});
