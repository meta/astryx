// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {buildTable, tableCodec} from './_entries.mjs';

/** A small catalog of each kind, with shared and package-specific names. */
const ALL = [
  {
    domain: 'component',
    name: 'Button',
    description: 'Press to act.',
    keywords: ['click', 'press'],
    _package: '@astryxdesign/core',
  },
  {
    domain: 'component',
    name: 'Button',
    description: 'A branded button.',
    _package: '@acme/widgets',
  },
  {
    domain: 'hook',
    name: 'useTheme',
    description: 'Read the theme.',
    _package: '@astryxdesign/core',
  },
  {
    domain: 'doc',
    name: 'theming',
    _topic: 'theming',
    description: 'Theme an app.',
    prose: ['Tokens and modes.', 'Second paragraph.'],
    _package: '@astryxdesign/core',
  },
  {
    domain: 'doc',
    name: 'theming',
    _topic: 'theming',
    _section: 'tokens',
    description: 'Token names.',
    guidance: ['Use tokens.'],
    _package: '@astryxdesign/core',
  },
  {
    domain: 'template',
    name: 'settings',
    _resultName: 'settings',
    description: 'Settings page with tabs.',
    aliases: ['preferences'],
    titles: ['Settings'],
    _package: '@astryxdesign/core',
  },
];
const CARDS = {
  Button: {what: 'a pressable control', synonyms: ['cta'], props: ['variant']},
};

/**
 * A table's plain parts, with each field's words looked up one by one: every
 * word the built table holds, and one it does not.
 * @param {any} table
 * @param {any} built - the table whose words are looked up
 */
const plain = (table, built) => ({
  ids: table.ids,
  index: [...table.index],
  candidate: table.candidate,
  domain: table.domain,
  name: table.name,
  fields: Object.entries(table.fields).map(([f, v]) => {
    const words = [...built.fields[f].post.keys(), 'nowhere'];
    return [
      f,
      {
        post: words.map(w => v.post.get(w)),
        idf: words.map(w => v.idf.get(w)),
        len: v.len,
        avg: v.avg,
        rarest: v.rarest,
      },
    ];
  }),
});

describe('an entry table kept beside the catalog', () => {
  it('reads back as the table it was, word by word and candidates by identity', () => {
    const built = buildTable(ALL, CARDS);
    const codec = tableCodec(ALL);
    const read = codec.decode(JSON.parse(JSON.stringify(codec.encode(built))));
    expect(codec.valid(read)).toBe(true);
    expect(plain(read, built)).toEqual(plain(built, built));
    const b = /** @type {any} */ (built);
    const r = /** @type {any} */ (read);
    r.candidate.forEach((/** @type {unknown} */ c, /** @type {number} */ k) =>
      expect(c).toBe(b.candidate[k]),
    );
  });

  it('names the largest idf of each field, or 0 for a field with no words', () => {
    const built = /** @type {any} */ (buildTable(ALL, CARDS));
    for (const f of ['name', 'desc', 'card']) {
      const idf = built.fields[f].idf;
      expect(built.fields[f].rarest).toBe(Math.max(0, ...idf.values()));
    }
    const none = /** @type {any} */ (buildTable([], {}));
    expect(none.fields.desc.rarest).toBe(0);
  });

  it('finds a word by its whole line, not as the start of a longer word', () => {
    const codec = tableCodec(ALL);
    const read = /** @type {any} */ (
      codec.decode(
        JSON.parse(JSON.stringify(codec.encode(buildTable(ALL, CARDS)))),
      )
    );
    expect(read.fields.desc.post.get('press')).toEqual([[0, 2]]);
    expect(read.fields.desc.post.get('pres')).toBeUndefined();
    expect(read.fields.desc.idf.get('pres')).toBeUndefined();
    expect(read.fields.desc.post.get('press 0:2')).toBeUndefined();
  });

  it('reads a word list when asked for it, not every list when read back', () => {
    const codec = tableCodec(ALL);
    const read = /** @type {any} */ (
      codec.decode(
        JSON.parse(JSON.stringify(codec.encode(buildTable(ALL, CARDS)))),
      )
    );
    for (const f of ['name', 'desc', 'card']) {
      expect(read.fields[f].post).not.toBeInstanceOf(Map);
      expect(read.fields[f].idf).not.toBeInstanceOf(Map);
    }
  });

  it('is not kept when a word holds whitespace', () => {
    const built = /** @type {any} */ (buildTable(ALL, CARDS));
    built.fields.desc.post.set('two words', [[0, 1]]);
    expect(() => tableCodec(ALL).encode(built)).toThrow();
  });
});
