// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon definition parser, and Astryx's own definitions: each one reads,
 * and the built-in ones are exactly Core's shared icon names.
 */

import {describe, expect, it} from 'vitest';
import {parseIconDefinition} from './parse.mjs';
import {parseDoc} from '../parse.mjs';
import {ICON_NAMES} from '../icon-set/icon-names.mjs';
import {astryxIconDefinitions} from '../../../foundation/discovery/icon-definition-discovery.mjs';

const DOC = {
  type: 'icon-definition',
  name: 'delete',
  description: 'Delete something permanently.',
  words: ['trash', 'bin'],
};

describe('parseIconDefinition', () => {
  it('accepts a definition, also through parseDoc', () => {
    expect(parseIconDefinition(DOC)).toEqual(DOC);
    expect(parseDoc(DOC)).toEqual(DOC);
    expect(parseIconDefinition({...DOC, builtIn: true}).builtIn).toBe(true);
    expect(
      parseIconDefinition({...DOC, stability: 'experimental'}).stability,
    ).toBe('experimental');
    expect(() => parseIconDefinition({...DOC, stability: 'stable'})).toThrow();
  });

  it('rejects a name that is not camelCase, a blank description, no words, and an unknown field', () => {
    expect(() => parseIconDefinition({...DOC, name: 'Delete'})).toThrow(
      /camelCase/,
    );
    expect(() => parseIconDefinition({...DOC, name: 'de-lete'})).toThrow(
      /camelCase/,
    );
    expect(() => parseIconDefinition({...DOC, description: ' '})).toThrow(
      /blank/,
    );
    expect(() => parseIconDefinition({...DOC, words: []})).toThrow(/word/);
    expect(() => parseIconDefinition({...DOC, words: ['Trash']})).toThrow(
      /lower-case/,
    );
    expect(() => parseIconDefinition({...DOC, builtIn: false})).toThrow();
    expect(() => parseIconDefinition({...DOC, icons: []})).toThrow(
      /Unrecognized key/,
    );
    expect(() =>
      parseIconDefinition({...DOC, examples: {lib: 'Delete'}}),
    ).toThrow(/Unrecognized key/);
  });
});

describe("Astryx's definitions", () => {
  const {definitions, errors} = astryxIconDefinitions();
  const docs = definitions.map(m => m.doc);

  it('every file reads, with a unique camelCase name, a description, and words', () => {
    expect(errors).toEqual([]);
    expect(docs.length).toBeGreaterThan(ICON_NAMES.length);
    expect(new Set(docs.map(d => d.name)).size).toBe(docs.length);
    for (const doc of docs) {
      expect(doc.description.trim(), doc.name).not.toBe('');
      expect(doc.words.length, doc.name).toBeGreaterThan(0);
    }
  });

  it("the built-in definitions are exactly Core's shared icon names", () => {
    expect(
      docs
        .filter(d => d.builtIn)
        .map(d => d.name)
        .sort(),
    ).toEqual([...ICON_NAMES].sort());
  });
});
