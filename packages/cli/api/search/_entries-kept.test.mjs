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

/** @param {any} table */
const plain = table => ({
  ids: table.ids,
  index: [...table.index],
  candidate: table.candidate,
  domain: table.domain,
  name: table.name,
  fields: Object.entries(table.fields).map(([f, v]) => [
    f,
    {post: [...v.post], idf: [...v.idf], len: v.len, avg: v.avg},
  ]),
});

describe('an entry table kept beside the catalog', () => {
  it('reads back as the table it was, maps in order and candidates by identity', () => {
    const built = buildTable(ALL, CARDS);
    const codec = tableCodec(ALL);
    const read = codec.decode(JSON.parse(JSON.stringify(codec.encode(built))));
    expect(plain(read)).toEqual(plain(built));
    const b = /** @type {any} */ (built);
    const r = /** @type {any} */ (read);
    r.candidate.forEach((/** @type {unknown} */ c, /** @type {number} */ k) =>
      expect(c).toBe(b.candidate[k]),
    );
  });
});
